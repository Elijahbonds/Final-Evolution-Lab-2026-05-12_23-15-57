export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { grantServerReward } from '@/lib/wallet/wallet-service';
import { MIRROR_SCREEN_KIND } from '@/lib/mirror/screen';
import { cleanScreenId, decideScreenPost, decisionFromStoredRow } from '@/lib/mirror/screenClaims';
import { selfReportAnswersFor } from '@/lib/mirror/selfReport';
import { storedScreen, storedScreenId, storedSelfReport, withSelfReport } from '@/lib/mirror/screenStore';

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
 *   · Found in review the same day: the results were counted raw — three copies of one check with a made-up grade
 *     were 3 checks, scored 100 and paid. resultsForScreen now keeps only real grades, one per check per side, and
 *     the reward counts DIFFERENT checks (distinctChecks). And a partly graded screen has no score and is not "clear"
 *     (scoreScreen). lib/mirror/screen-route.test.ts runs this route for real.
 *
 * MIRROR-COACH P3 (2026-09-25) — THE GRADE IS THE SERVER'S NOW. Until today the client posted {checkId, grade} and this
 * route scored and paid whatever grade it was handed (the P1 critic: "screen payouts rest on client-declared grades").
 * The client posts the grader's SUMMARY per camera check ({checkId, value, readableFrames, view, status}); the route
 * re-runs the threshold step of lib/mirror/stationGraders.ts on those numbers (lib/mirror/screenClaims.ts) and:
 *   · refuses the whole screen (422, nothing stored, nothing paid) when a status does not follow from its own value,
 *     or when a "pass" stands on fewer readable frames than the table's minimum;
 *   · drops duplicates, checks the claimed variant does not have, checks that are not camera checks, junk, and bare
 *     grades with no summary behind them;
 *   · scores the camera checks only, and works out the movement flags itself;
 *   · pays only when at least MIN_READABLE_CAMERA_CHECKS different camera checks were readable — fewer is
 *     'provisional', kept and never paid. The breath answers and the coach's checks never pay and never change a
 *     scored number (they are not results at all: lib/mirror/selfReport.ts).
 * PATCH (below) keeps the athlete's answers to the breath questions on the screen they belong to, and does nothing else.
 */

/** How far back POST looks for a screen id it already stored (a retry, a replay): months of screens, not weeks. */
const SCREENS_DEDUPED = 50;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const athleteId = (session?.user as { id?: string } | undefined)?.id;
  if (!athleteId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  // Re-checked, not trusted. The client renders its own summary too, but what gets stored and paid for is this.
  const d = decideScreenPost(body, athleteId);
  if (!d.ok) return NextResponse.json(d.body, { status: d.status });
  const { screenId, screen, outcome, summary, answers, reward: decision, ended } = d;

  // THE STORED ROW IS THE SCREEN (MIRROR-COACH P3 review, 2026-09-26; lib/mirror/screenClaims.ts decisionFromStoredRow):
  // a screen id already stored is answered from its row — nothing re-decided from the new body, nothing stored again, and
  // the reward the row decides (an idempotent grant for a retry of a paid screen). It compared only the NEWEST row, so an
  // old screen re-posted became the newest, and a provisional screen re-posted with more checks was paid but not stored.
  // Residual: two concurrent first posts of one id can both store (no unique index on a JSON field; no schema change in
  // this phase), and a screen more than SCREENS_DEDUPED rows back is not found.
  const recent = await prisma.workoutScan.findMany({
    where: { userId: athleteId, kind: MIRROR_SCREEN_KIND },
    orderBy: { createdAt: 'desc' }, take: SCREENS_DEDUPED, select: { metrics: true },
  }).catch(() => null);
  const existing = recent?.find((r) => storedScreenId(r.metrics) === screenId) ?? null;
  const fromRow = existing ? decisionFromStoredRow(existing.metrics, athleteId) : null;
  if (fromRow) {
    let paidBefore = 0;
    if (fromRow.reward.pay) {
      const granted = await grantServerReward(prisma, {
        playerId: athleteId, reasonCode: fromRow.reward.reasonCode, idempotencyKey: fromRow.reward.idempotencyKey,
        metadata: { screen: fromRow.summary.screen, screenId, movementFlags: fromRow.summary.movementFlags, redFlags: fromRow.summary.movementFlags, asymmetries: fromRow.summary.asymmetries, readableCameraChecks: fromRow.readableChecks },
      }).catch(() => null);
      paidBefore = granted?.granted.shards ?? 0;
    }
    return NextResponse.json({
      summary: fromRow.summary, graded: fromRow.summary.graded, provisional: fromRow.provisional,
      readableCameraChecks: fromRow.readableChecks, dropped: 0, paid: fromRow.reward.pay, awarded: paidBefore,
      message: fromRow.reward.message, screenId, alreadyStored: true,
    });
  }

  let awarded = 0;
  if (decision.pay) {
    const granted = await grantServerReward(prisma, {
      playerId: athleteId,
      reasonCode: decision.reasonCode,
      idempotencyKey: decision.idempotencyKey,
      // movementFlags is the name from 2026-09-25; redFlags stays beside it so ledger readers of older rows still agree
      metadata: {
        screen, screenId, movementFlags: summary.movementFlags, redFlags: summary.movementFlags, asymmetries: summary.asymmetries,
        readableCameraChecks: outcome.readableChecks,
      },
    }).catch(() => null);
    awarded = granted?.granted.shards ?? 0;
  }

  // Kept AFTER the reward, and never allowed to break it: a screen the athlete earned is not undone by a write.
  // (Deduped on screenId above: a retried post is one screen in their history rather than two.)
  // `ended` (MIRROR-COACH P3 follow-up review, 2026-09-28): End posts what was read so far, marked so; it is kept and
  // scored, and paid only when every camera station was attempted (screenReward.ts ENDED_EARLY_LINE — the owner's call)
  const row = storedScreen(screenId, screen, outcome.results, summary, {
    camera: outcome.camera, provisional: outcome.provisional, selfReport: answers, ended,
  });
  const saved = await prisma.workoutScan.create({
    data: { userId: athleteId, kind: MIRROR_SCREEN_KIND, metrics: row as unknown as object },
  }).then(() => true).catch(() => false);

  return NextResponse.json({
    summary,
    graded: summary.graded,
    provisional: outcome.provisional,
    readableCameraChecks: outcome.readableChecks,
    dropped: outcome.dropped.length,
    paid: decision.pay,
    awarded,
    message: decision.message,
    // the id the answers card PATCHes against — only when the row is really there to take them
    screenId: saved ? screenId : null,
  });
}

/** How far back PATCH looks for the screen an answer belongs to: answers come minutes after, not weeks. */
const ANSWER_ROWS_READ = 20;

/**
 * The athlete's answers to the breath questions, kept on the screen they just ran (MIRROR-COACH P3, 2026-09-25).
 *
 * Body: {screenId, answers: [{questionId, answer: 'yes'|'no'|'notSure'}]}. Only the questions that screen asked, only
 * real answers; an answer replaces an earlier answer to the same question. NOTHING ELSE on the row changes — not the
 * results, the summary, `graded` or `provisional` — and nothing is paid: an answer is kept, never scored. Only the
 * caller's own screens can take answers (the row is looked up by the session's user id).
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const athleteId = (session?.user as { id?: string } | undefined)?.id;
  if (!athleteId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const b = (body && typeof body === 'object' ? body : {}) as { screenId?: unknown; answers?: unknown };
  const screenId = cleanScreenId(b.screenId);
  if (!screenId) return NextResponse.json({ error: 'missing_screen_id' }, { status: 400 });

  const rows = await prisma.workoutScan.findMany({
    where: { userId: athleteId, kind: MIRROR_SCREEN_KIND },
    orderBy: { createdAt: 'desc' }, take: ANSWER_ROWS_READ, select: { id: true, metrics: true },
  }).catch(() => null);
  if (!rows) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  const row = rows.find((r) => storedScreenId(r.metrics) === screenId);
  if (!row) return NextResponse.json({ error: 'screen_not_found' }, { status: 404 });

  const variant = (row.metrics as { screen?: unknown } | null)?.screen === 'full' ? 'full' : 'modified';
  const answers = selfReportAnswersFor(variant, b.answers);
  if (!answers.length) return NextResponse.json({ error: 'no_answers' }, { status: 400 });
  const next = withSelfReport(row.metrics, answers);
  if (!next) return NextResponse.json({ error: 'screen_not_found' }, { status: 404 });

  const ok = await prisma.workoutScan.update({ where: { id: row.id }, data: { metrics: next as unknown as object } })
    .then(() => true).catch(() => false);
  if (!ok) return NextResponse.json({ error: 'not_saved' }, { status: 503 });
  return NextResponse.json({ screenId, selfReport: storedSelfReport(next) });
}
