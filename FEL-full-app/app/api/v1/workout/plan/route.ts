export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { buyWorkoutPlan, loadWorkoutPage } from '@/lib/workout/relaunchServer';

/**
 * POST /api/v1/workout/plan — buy a plan (or claim a past buyer's free one). Body:
 *   { tier: 'plan_4w' | 'program_12w', answers: { daysPerWeek: 2|3|4, equipment: 'bodyweight'|'gym' },
 *     idempotency_key: <the browser's key>, free?: true }
 *
 * MIRROR-COACH P1 (2026-09-25): NOT ON SALE. This route sold the 4-week plan (workout_plan_4w, 60 shards) and the
 * 12-week program (workout_program_12w, 200 shards): it charged through spend() and saved generatePlan's weeks. Owner
 * decision #3 pulled the sale — every plan was the same flat plan (the page sent no scan, so every buyer planned from
 * defaultMetrics and got the Mobility focus), its sets and reps never changed across 12 weeks, and each put "Depth
 * Drop to Vertical" 4x4 in week 1 past the protocol gate. P1 said the relaunch would be a new build, not that code
 * switched back on, so the charge and the write were taken out rather than hidden behind a flag.
 *
 * MIRROR-COACH P8 (2026-09-29), owner decisions #3, #23, #24: THE RELAUNCH, and it is that new build. The same two
 * products at the same shard prices (lib/wallet/catalog.ts, unchanged: 60 and 200), now a FEL template matched to the
 * buyer's answers, stored as its weeks and read behind the protocol gate — never the old generator (it stays only so old
 * rows can be read and revised). Past buyers get one of each free. Every check, the order they run in and why is in
 * lib/workout/relaunchServer.ts buyWorkoutPlan; relaunch-route.test.ts runs this route over an in-memory database with
 * the real spend().
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const r = await buyWorkoutPlan(prisma, userId, body);
  return NextResponse.json(r.body, { status: r.status });
}

/**
 * GET /api/v1/workout/plan — the plans this account holds, newest first, and what it may buy (`offer`).
 *
 * MIRROR-COACH P1 (2026-09-25): each plan is revised on read (lib/workout/plan-revision.ts). The first read after the
 * deploy takes the depth drops out of weeks 1-4 and stores that, once; each plan comes back with `revisionNote`, the
 * in-app note the page shows on it (null on a plan the revision never changed).
 *
 * P1 review, same day: the revision is for WHO IS READING (owner decision #6). The account's birth year decides it —
 * under 18, or never given, reads a plan with no jumps in any week. A failed read of the birth year is treated as
 * unknown, so as youth. And every plan is revised, not only the newest ten.
 *
 * MIRROR-COACH P2 (2026-09-25), owner decisions #22-#23: the same read, a wider revision. An adult's plan loses the
 * depth drop in EVERY week, P1's held and repeated swaps are picked again, and the note says the new training plans
 * are free for them (no refund, #23). The plans nobody opens get the very same revision from
 * scripts/workout/revise-all-plans.ts at deploy. The findMany has no `take`: every row is revised (plan-route.test.ts
 * pins it).
 *
 * MIRROR-COACH P2 review (2026-09-26): what this STORES no longer depends on who reads. The youth revision is served on
 * every read and never written; the row gets only the depth-drop revision #22 asks for everyone. So a failed birth-year
 * read shows a youth plan once and writes nothing that depends on it.
 *
 * MIRROR-COACH P8 (2026-09-29): all of that is unchanged for a plan the old generator wrote. A plan built from a FEL
 * template is not revised (it has nothing to revise: no template programs a depth drop); it is read behind the protocol
 * gate for the reader, today. And the answer carries `offer`: the reader's audience, both products at the catalog's
 * price, and which are free for a past buyer (lib/workout/relaunchServer.ts loadWorkoutPage).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(await loadWorkoutPage(prisma, userId));
}
