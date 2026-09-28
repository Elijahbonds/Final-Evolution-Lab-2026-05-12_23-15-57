export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { grantServerReward } from '@/lib/wallet/wallet-service';
import { decideScreenReward } from '@/lib/mirror/screenReward';
import { MIRROR_SCREEN_KIND, distinctChecks, resultsForScreen, scoreScreen, screenVariantFor, type ScreenId } from '@/lib/mirror/screen';
import { storedScreen, storedScreenId } from '@/lib/mirror/screenStore';

/**
 * A completed movement screen.
 *
 * The rule the reward module states and this route enforces: A SCREEN THE CAMERA COULD NOT GRADE PAYS NOTHING.
 * The reward is for the measurement, not for standing near a phone — paying for a provisional screen would
 * teach an athlete that the fastest shards come from a bad shot, which is the opposite of what a screening
 * tool wants from them.
 *
 * The score is recomputed here from the checks rather than accepted from the client, and the athlete id in the
 * idempotency key is the SESSION's, never the body's.
 *
 * THE SCREEN IS KEPT NOW (2026-09-21). Until today this route scored a screen, paid for it in shards, returned
 * the summary and threw it away — nothing was written anywhere. So an athlete's screen existed for one render
 * and was gone: no history, no way to see whether the thing they were told to correct got better, and nothing a
 * coach could ever read. lib/coach/mirrorToProgram.ts ("the screen writes the corrective work") could not be
 * connected to anything for exactly this reason, and that module's own header calls this tie the one thing the
 * competition cannot answer quickly.
 *
 * It is stored the same way the dunk log is — WorkoutScan with its own `kind`, numbers only, no video, no
 * keypoints — and a failed write never costs the athlete their reward.
 *
 * MIRROR-COACH P1 (2026-09-25). Two things this route stored that were not true:
 *   · A screen with NO graded station (every screen so far — nothing calls ScreenRunner.record until phase 3's
 *     graders) was scored 100 with 0 flags and stored like a clean result. It is now stored as UNGRADED
 *     (graded: false, score: null), pays nothing, and answers with the not-graded line — no retry prompt.
 *   · `screen` came from the picker while the stations came from a runner always built as 'modified', so a "full"
 *     screen was kept over modified stations. The harness now posts the variant that ran, and results for checks the
 *     claimed variant does not have are dropped here (resultsForScreen) before anything is scored, paid or kept.
 *     That filter only stops a MODIFIED claim carrying full-only checks; a 'full' claim over the modified stations
 *     passes it (every modified check is a full check), so a 'full' claim with none of its own stations is stored as
 *     'modified' (screenVariantFor).
 *   · Found in review the same day: the results were counted raw — three copies of one check with a made-up grade
 *     were 3 checks, scored 100 and paid. resultsForScreen now keeps only real grades, one per check per side, and
 *     the reward counts DIFFERENT checks (distinctChecks). And a partly graded screen has no score and is not "clear"
 *     (scoreScreen). lib/mirror/screen-route.test.ts runs this route for real.
 */

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const athleteId = (session?.user as { id?: string } | undefined)?.id;
  if (!athleteId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const b = body as { screenId?: unknown; screen?: unknown; results?: unknown; provisional?: unknown };
  const screenId = String(b?.screenId ?? '').slice(0, 64).replace(/[^A-Za-z0-9_:-]/g, '');
  const claimed: ScreenId = b?.screen === 'full' ? 'full' : 'modified';
  const results = resultsForScreen(claimed, Array.isArray(b?.results) ? b.results : []);
  const screen = screenVariantFor(claimed, results);
  if (!screenId) return NextResponse.json({ error: 'missing_screen_id' }, { status: 400 });

  // Recomputed, not trusted. The client renders this summary too, but what gets paid for is what the server works out.
  const summary = scoreScreen(screen, results);

  const decision = decideScreenReward({
    screenId,
    athleteId,
    provisional: Boolean(b?.provisional),
    checksTaken: distinctChecks(results),
  });

  let awarded = 0;
  if (decision.pay) {
    const granted = await grantServerReward(prisma, {
      playerId: athleteId,
      reasonCode: decision.reasonCode,
      idempotencyKey: decision.idempotencyKey,
      // movementFlags is the name from 2026-09-25; redFlags stays beside it so ledger readers of older rows still agree
      metadata: { screen, screenId, movementFlags: summary.movementFlags, redFlags: summary.movementFlags, asymmetries: summary.asymmetries },
    }).catch(() => null);
    awarded = granted?.granted.shards ?? 0;
  }

  // Kept AFTER the reward, and never allowed to break it: a screen the athlete earned is not undone by a write.
  // Deduped on screenId so a retried post is one screen in their history rather than two.
  const already = await prisma.workoutScan.findFirst({
    where: { userId: athleteId, kind: MIRROR_SCREEN_KIND },
    orderBy: { createdAt: 'desc' }, take: 1, select: { metrics: true },
  }).catch(() => null);
  const seen = storedScreenId(already?.metrics ?? null);
  if (seen !== screenId) {
    await prisma.workoutScan.create({
      data: { userId: athleteId, kind: MIRROR_SCREEN_KIND, metrics: storedScreen(screenId, screen, results, summary) as unknown as object },
    }).catch(() => null);
  }

  return NextResponse.json({
    summary,
    graded: summary.graded,
    paid: decision.pay,
    awarded,
    message: decision.message,
  });
}
