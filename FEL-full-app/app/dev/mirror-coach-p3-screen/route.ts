export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cleanScreenId, decideScreenPost } from '@/lib/mirror/screenClaims';
import { selfReportAnswersFor } from '@/lib/mirror/selfReport';
import {
  isUngradedStoredScreen, readStoredScreen, storedScreen, storedScreenId, storedSelfReport, withSelfReport,
} from '@/lib/mirror/screenStore';
import { p3ScreenRows } from './store';

/**
 * /dev/mirror-coach-p3-screen — MIRROR-COACH P3 live proof (2026-09-25). Development only: a hard 404 outside `next dev`.
 *
 * The lane's dev server runs with its database deliberately offline and no session, so POST and PATCH
 * /api/mirror/screen answer 401 here before they do anything. This route runs the SAME library code those handlers
 * run, in the same order, with only the session (a fixture athlete) and the database (an in-memory map, this process
 * only) replaced — nothing here is a second implementation of a rule:
 *
 *   POST   → app/api/mirror/screen/route.ts POST: decideScreenPost (the claims re-check, scoreScreen, the reward
 *            decision) → storedScreen with the camera evidence, provisional and any answers; plus what
 *            app/api/coach/prescribe would read from the stored row. The probe routes the harness's own POST here.
 *   PATCH  → the same file's PATCH: find the caller's row by screenId, selfReportAnswersFor, withSelfReport.
 *   GET ?screenId= → the stored row, as the database would hold it.
 */
const devOnly = () => (process.env.NODE_ENV !== 'development' ? NextResponse.json({ error: 'not_found' }, { status: 404 }) : null);
const ATHLETE = 'dev-fixture-athlete';
/** The dev process's stand-in for WorkoutScan (kind mirror_screen), newest last — shared with /dev/coach-prescribe?case=live
 *  (./store.ts, MIRROR-COACH P3 live proof, 2026-09-26), so the coach panel drafts from the screen this route stored. */
const rows = p3ScreenRows;

export async function POST(req: NextRequest) {
  const no = devOnly(); if (no) return no;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  // — app/api/mirror/screen/route.ts POST, from the body onwards —
  const d = decideScreenPost(body, ATHLETE);
  if (!d.ok) return NextResponse.json({ response: d.body, status: d.status, dev: { stored: null } }, { status: 200 });
  const { screenId, screen, outcome, summary, answers, reward } = d;
  const seen = storedScreenId(rows()[rows().length - 1]?.metrics ?? null);
  if (seen !== screenId) {
    rows().push({ id: `scan-${rows().length + 1}`, at: new Date().toISOString(), metrics: JSON.parse(JSON.stringify(storedScreen(screenId, screen, outcome.results, summary, {
      camera: outcome.camera, provisional: outcome.provisional, selfReport: answers,
    }))) });
  }
  const stored = rows()[rows().length - 1].metrics;
  // — app/api/coach/prescribe/route.ts, for this row as the newest (and only) screen on file —
  const coachReason = readStoredScreen(stored) ? '(graded: the route drafts from it)' : isUngradedStoredScreen(stored) ? 'ungraded_screen' : 'unreadable_screen';
  return NextResponse.json({
    // what the real route answers (awarded is 0 here: the wallet's grant is not run on this lane)
    response: {
      summary, graded: summary.graded, provisional: outcome.provisional, readableCameraChecks: outcome.readableChecks,
      dropped: outcome.dropped.length, paid: reward.pay, awarded: 0, message: reward.message, screenId,
    },
    status: 200,
    dev: { wouldCallGrant: reward.pay, dropped: outcome.dropped, stored, coachReason },
  });
}

export async function PATCH(req: NextRequest) {
  const no = devOnly(); if (no) return no;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  // — app/api/mirror/screen/route.ts PATCH, from the body onwards —
  const b = (body && typeof body === 'object' ? body : {}) as { screenId?: unknown; answers?: unknown };
  const screenId = cleanScreenId(b.screenId);
  if (!screenId) return NextResponse.json({ error: 'missing_screen_id' }, { status: 400 });
  const row = [...rows()].reverse().find((r) => storedScreenId(r.metrics) === screenId);
  if (!row) return NextResponse.json({ error: 'screen_not_found' }, { status: 404 });
  const variant = (row.metrics as { screen?: unknown } | null)?.screen === 'full' ? 'full' : 'modified';
  const answers = selfReportAnswersFor(variant, b.answers);
  if (!answers.length) return NextResponse.json({ error: 'no_answers' }, { status: 400 });
  const next = withSelfReport(row.metrics, answers);
  if (!next) return NextResponse.json({ error: 'screen_not_found' }, { status: 404 });
  row.metrics = JSON.parse(JSON.stringify(next));
  return NextResponse.json({ screenId, selfReport: storedSelfReport(next) });
}

export async function GET(req: NextRequest) {
  const no = devOnly(); if (no) return no;
  const id = req.nextUrl.searchParams.get('screenId');
  const row = id ? [...rows()].reverse().find((r) => storedScreenId(r.metrics) === id) : rows()[rows().length - 1];
  return NextResponse.json({ stored: row?.metrics ?? null, rows: rows().length });
}
