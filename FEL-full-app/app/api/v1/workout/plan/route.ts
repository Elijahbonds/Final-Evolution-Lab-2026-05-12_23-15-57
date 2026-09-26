export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { PLAN_SALE_PAUSED } from '@/lib/workout/plan-sale';
import { planAudience, revisePlansOnRead } from '@/lib/workout/plan-revision';

/**
 * POST /api/v1/workout/plan — NOT ON SALE (MIRROR-COACH P1, 2026-09-25).
 *
 * This route sold the 4-week plan (workout_plan_4w, 60 shards) and the 12-week program (workout_program_12w, 200
 * shards): it charged through spend() and saved generatePlan's weeks as a WorkoutPlan. Owner decision #3 pulled the
 * sale. Every plan was the same flat plan (the page sent no scan, so every buyer planned from defaultMetrics and got
 * the Mobility focus), its sets and reps never changed across 12 weeks, and each put "Depth Drop to Vertical" 4x4 in
 * week 1 past the protocol gate. The relaunch will be built on FEL templates behind that gate. That is a new build,
 * not this code switched back on, so the charge and the write are gone rather than hidden behind a flag.
 *
 * It refuses on the server, before it reads the body or the database, so a stale page, a second tab or a hand-made
 * request cannot buy one either. Both SKUs are also in NOT_ON_SALE (lib/wallet/catalog.ts), so spend() refuses them
 * from any route.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ error: 'not_on_sale', message: PLAN_SALE_PAUSED }, { status: 403 });
}

/**
 * GET /api/v1/workout/plan — the plans this account bought, newest first. Buyers keep their plans.
 *
 * MIRROR-COACH P1 (2026-09-25): each plan is revised on read (lib/workout/plan-revision.ts). The first read after the
 * deploy takes the depth drops out of weeks 1-4 and stores that, once; each plan comes back with `revisionNote`, the
 * in-app note the page shows on it (null on a plan the revision never changed).
 *
 * P1 review, same day: the revision is for WHO IS READING (owner decision #6). The account's birth year decides it —
 * under 18, or never given, reads a plan with no jumps in any week; an adult's later depth drops are held for the
 * depth-drop protocol. A failed read of the birth year is treated as unknown, so as youth. And every plan is revised,
 * not only the newest ten: plans are no longer sold, so the count is what it is.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const [me, rows] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } }).catch(() => null),
    prisma.workoutPlan.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
  ]);
  const plans = await revisePlansOnRead(prisma, userId, rows, planAudience(me?.dobYear));
  return NextResponse.json({ plans });
}
