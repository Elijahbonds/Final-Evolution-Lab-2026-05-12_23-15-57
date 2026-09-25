export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { analyzeMovement, defaultMetrics, type MovementMetrics } from '@/lib/workout/movement-screen';
import { buildAvatarSpec } from '@/lib/workout/avatar-builder';

/**
 * POST /api/v1/workout/scan  — FREE system scan for everyone.
 * Body: { kind?, metrics }  (metrics derived on-device from a keypoint timeline;
 * raw video never leaves the device). Returns the analysis + a mini-avatar spec.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const kind = typeof body?.kind === 'string' ? body.kind : 'movement_screen';
  const metrics: MovementMetrics = { ...defaultMetrics(), ...(body?.metrics ?? {}) };

  const analysis = analyzeMovement(metrics);
  const avatarSpec = buildAvatarSpec(metrics, body?.palette);

  const scan = await prisma.workoutScan.create({
    data: { userId, kind, metrics: { ...metrics, analysis } as any, avatarSpec: avatarSpec as any },
  });

  return NextResponse.json({ scanId: scan.id, analysis, avatarSpec });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const scans = await prisma.workoutScan.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 });
  return NextResponse.json({ scans });
}

/** DELETE /api/v1/workout/scan — delete-my-data: clears the user's scans + plans. */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // One transaction: a reader sees both gone or neither. (The dead-buy refund no longer needs it: since 2026-09-25 a
  // /store plan charge no plan claims is paid back whether or not a plan was erased, lib/wallet/dead-buys.ts.)
  await prisma.$transaction([
    prisma.workoutPlan.deleteMany({ where: { userId } }),
    prisma.workoutScan.deleteMany({ where: { userId } }),
  ]);
  return NextResponse.json({ ok: true });
}
