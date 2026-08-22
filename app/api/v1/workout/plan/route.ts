export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { spend, readWallet, WalletError } from '@/lib/wallet/wallet-service';
import { analyzeMovement, defaultMetrics, type MovementMetrics } from '@/lib/workout/movement-screen';
import { generatePlan } from '@/lib/workout/plan-generator';

/**
 * POST /api/v1/workout/plan  — premium personalized plan (SHARD sink).
 * Body: { idempotency_key, scanId?, tier: 'plan_4w'|'program_12w' }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const idempotencyKey = typeof body?.idempotency_key === 'string' ? body.idempotency_key : '';
  const tier = body?.tier === 'program_12w' ? 'program_12w' : 'plan_4w';
  const skuId = tier === 'program_12w' ? 'workout_program_12w' : 'workout_plan_4w';
  if (!idempotencyKey) return NextResponse.json({ error: 'missing_idempotency_key' }, { status: 400 });

  // Resolve the scan (or synthesize from defaults) to drive the plan focus.
  let metrics: MovementMetrics = defaultMetrics();
  let scanId: string | null = null;
  if (typeof body?.scanId === 'string') {
    const scan = await prisma.workoutScan.findFirst({ where: { id: body.scanId, userId } });
    if (scan) { scanId = scan.id; metrics = { ...defaultMetrics(), ...((scan.metrics as any) ?? {}) }; }
  }
  const analysis = analyzeMovement(metrics);
  const plan = generatePlan(analysis, tier);

  try {
    await spend(prisma, { playerId: userId, idempotencyKey, skuId, quantity: 1 });
  } catch (e) {
    if (e instanceof WalletError && e.code === 'INSUFFICIENT_FUNDS') {
      const bal = await readWallet(prisma, userId);
      return NextResponse.json({ error: 'insufficient_funds', balances: { coins: bal.coins, shards: bal.shards }, needShards: true }, { status: 409 });
    }
    throw e;
  }

  const saved = await prisma.workoutPlan.create({
    data: { userId, scanId, tier, focus: plan.focusLabel, weeks: plan.weeks as any },
  });
  return NextResponse.json({ planId: saved.id, plan });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const plans = await prisma.workoutPlan.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 });
  return NextResponse.json({ plans });
}
