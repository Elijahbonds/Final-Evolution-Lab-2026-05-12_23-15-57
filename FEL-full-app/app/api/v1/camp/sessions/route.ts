export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { latestPerAttribute, prqDelta, numericDelta, toOutcomes } from '@/lib/camp/profile';
import { computeResiliency } from '@/lib/camp/resiliency';
import { analyzeMovement } from '@/lib/workout/movement-screen';
import { currentUserId, bad, requirePaidFacilitator } from '@/lib/camp/server';

/**
 * POST /api/v1/camp/sessions — record a facilitated session on an ACTIVE plan.
 * { goalPlanId, moduleKeys?, notes?, clientSessionId? }. The game sessions
 * since the previous camp session are attached automatically, and the PRQ /
 * movement deltas and the resiliency log are computed here so the record and
 * the profile can never disagree.
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  { const paywalled = await requirePaidFacilitator(userId); if (paywalled) return paywalled; }
  let body: { goalPlanId?: string; moduleKeys?: unknown; notes?: unknown; clientSessionId?: unknown };
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  const plan = await prisma.goalPlan.findUnique({ where: { id: String(body.goalPlanId ?? '') } });
  if (!plan) return bad('not_found', 404);
  if (plan.facilitatorUserId !== userId) return bad('forbidden', 403);
  if (plan.status !== 'active') return bad('plan_not_active', 409);

  const prev = await prisma.campSession.findFirst({ where: { goalPlanId: plan.id }, orderBy: { date: 'desc' } });
  const since = prev?.date ?? plan.lockedAt ?? plan.createdAt;
  const [games, entries, scans] = await Promise.all([
    prisma.gameSession.findMany({ where: { userId: plan.menteeId, createdAt: { gte: since } }, orderBy: { createdAt: 'asc' } }),
    prisma.prqEntry.findMany({ where: { userId: plan.menteeId }, orderBy: { measuredAt: 'asc' } }),
    prisma.workoutScan.findMany({ where: { userId: plan.menteeId, kind: 'movement_screen' }, orderBy: { createdAt: 'desc' }, take: 2 }),
  ]);
  const safe = (m: unknown) => { try { return analyzeMovement(m as never); } catch { return null; } };
  const moduleKeys = (Array.isArray(body.moduleKeys) ? body.moduleKeys.map(String) : []).filter((r) => /^[a-z0-9-]+\/[a-z0-9]+(\/[a-z0-9]+)?$/.test(r)).slice(0, 12);
  const record = await prisma.campSession.create({
    data: {
      goalPlanId: plan.id, facilitatorId: plan.facilitatorId, menteeId: plan.menteeId,
      clientSessionId: typeof body.clientSessionId === 'string' ? body.clientSessionId : null,
      moduleKeys, gameSessionIds: games.map((g) => g.id),
      prqDelta: prqDelta(latestPerAttribute(entries, since), latestPerAttribute(entries, null)),
      movementDelta: scans.length === 2 ? numericDelta(safe(scans[1].metrics), safe(scans[0].metrics)) : undefined,
      resiliency: computeResiliency(toOutcomes(games)) as object,
      notes: typeof body.notes === 'string' ? body.notes.slice(0, 2000) : null,
    },
  });
  return NextResponse.json({ session: record, gamesAttached: games.length });
}

/** GET /api/v1/camp/sessions?goalPlanId=… — the plan's session records. */
export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  { const paywalled = await requirePaidFacilitator(userId); if (paywalled) return paywalled; }
  const goalPlanId = req.nextUrl.searchParams.get('goalPlanId') ?? '';
  const plan = await prisma.goalPlan.findUnique({ where: { id: goalPlanId } });
  if (!plan) return bad('not_found', 404);
  if (plan.facilitatorUserId !== userId && plan.menteeId !== userId) return bad('forbidden', 403);
  const sessions = await prisma.campSession.findMany({ where: { goalPlanId }, orderBy: { date: 'desc' } });
  return NextResponse.json({ sessions });
}
