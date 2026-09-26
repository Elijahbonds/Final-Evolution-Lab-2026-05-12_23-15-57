// What a stored Mirror screen looks like, written once so the two ends cannot drift.
//
// The screen is WRITTEN by app/api/mirror/screen (after scoring, after the reward) and READ by
// app/api/coach/prescribe, which hands it to lib/coach/mirrorToProgram. Those are different files, and a stored
// shape that only exists as an object literal in one of them is a shape the other can stop agreeing with in
// silence: the coach's panel would simply show nothing, forever, and look like an athlete with no screen.
//
// Numbers and grades only. No video, no keypoints — the raw footage never leaves the athlete's device, and
// nothing here should make it look like it did.

import {
  MIRROR_SCREEN_KIND, isGraded, resultsForScreen, scoreScreen, type CheckResult, type ScreenId, type ScreenResultSummary,
} from './screen';
import { selfReportAnswersFor, type SelfReportEntry } from './selfReport';
import type { RegradedCheck } from './screenClaims';
import { toCheckResult, type StationGrade } from './stationGraders';

export interface StoredScreen {
  screenId: string;
  screen: ScreenId;
  /**
   * False for a screen that ran with no station graded (MIRROR-COACH P1, 2026-09-25). Such a run is still kept — it
   * happened, and a coach should see "ran, not graded" rather than nothing — but it is never read as a result.
   */
  graded: boolean;
  results: CheckResult[];
  summary: ScreenResultSummary;
  /**
   * MIRROR-COACH P3 (2026-09-25): every camera check the server re-checked, readable or not, with the grader's numbers
   * (value, unit, readable frames, view) and the status the SERVER worked out — the evidence behind `results`, kept so
   * a coach (and a later phase's personal baselines) can see what the camera saw, and so "the camera could not read
   * the heel line" is a stored fact rather than a missing row. Absent on rows stored before today.
   */
  camera?: RegradedCheck[];
  /**
   * Fewer than MIN_READABLE_CAMERA_CHECKS camera checks were readable: stored, never paid (MIRROR-COACH P3). Absent on
   * rows stored before today.
   */
  provisional?: boolean;
  /**
   * The athlete's own answers to the self-report questions (lib/mirror/selfReport.ts), kept as given. Never graded,
   * never scored, never paid; written by POST (if answered by then) or PATCH /api/mirror/screen. Absent = not answered.
   */
  selfReport?: SelfReportEntry[];
  /**
   * Who worked out `results`: 'server' on every row written since MIRROR-COACH P3, from grader summaries it re-checked
   * (lib/mirror/screenClaims.ts). Absent on older rows — whose grades, if any, were the posting client's own word.
   */
  gradedBy?: 'server';
}

/** What a stored row carries beyond the scored screen (MIRROR-COACH P3). */
export interface StoredScreenExtras {
  camera?: readonly RegradedCheck[];
  provisional?: boolean;
  selfReport?: readonly SelfReportEntry[];
}

/**
 * The `metrics` payload for a WorkoutScan of kind MIRROR_SCREEN_KIND. The route passes `extras` (MIRROR-COACH P3); a
 * caller without them (the tests' fixtures of older rows, the P1 dev route) writes the pre-P3 shape.
 */
export function storedScreen(
  screenId: string, screen: ScreenId, results: readonly CheckResult[], summary: ScreenResultSummary, extras?: StoredScreenExtras,
): StoredScreen {
  const row: StoredScreen = { screenId, screen, graded: isGraded(results), results: [...results], summary };
  if (!extras) return row;
  row.gradedBy = 'server';
  row.camera = [...(extras.camera ?? [])];
  row.provisional = Boolean(extras.provisional);
  if (extras.selfReport?.length) row.selfReport = [...extras.selfReport];
  return row;
}

/**
 * A stored row with the athlete's answers merged in (MIRROR-COACH P3, 2026-09-25): an answer given now replaces an
 * earlier answer to the SAME question, other answers stay, and nothing else on the row changes — not the results, not
 * the summary, not `graded` or `provisional`. That is the whole contract of an answer: kept, never scored. Null for a
 * row that is not a screen (the route answers 404 rather than writing answers onto junk). Pure.
 */
export function withSelfReport(metrics: unknown, answers: readonly SelfReportEntry[]): StoredScreen | null {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return null;
  const m = metrics as Partial<StoredScreen>;
  if (typeof m.screenId !== 'string' || !m.summary || typeof m.summary !== 'object' || !Array.isArray(m.results)) return null;
  const screen: ScreenId = m.screen === 'full' ? 'full' : 'modified';
  const merged = selfReportAnswersFor(screen, [...storedSelfReport(metrics), ...answers]);
  return { ...(m as StoredScreen), selfReport: merged };
}

/** The answers a stored row carries, cleaned; [] for a row without any (every row stored before 2026-09-25). */
export function storedSelfReport(metrics: unknown): SelfReportEntry[] {
  if (!metrics || typeof metrics !== 'object') return [];
  const m = metrics as { screen?: unknown; selfReport?: unknown };
  return selfReportAnswersFor(m.screen === 'full' ? 'full' : 'modified', m.selfReport);
}

/**
 * True for a stored screen that ran but graded nothing: written with `graded: false`, or — every row stored before
 * 2026-09-25, since no grader has ever run — a row with an empty results array beside a summary. The coach's panel
 * says "not graded" for these instead of "unreadable" (or, before today, "came back clear").
 */
export function isUngradedStoredScreen(metrics: unknown): boolean {
  if (!metrics || typeof metrics !== 'object') return false;
  const m = metrics as { graded?: unknown; results?: unknown; summary?: unknown };
  if (m.graded === false) return true;
  return Array.isArray(m.results) && m.results.length === 0 && !!m.summary && typeof m.summary === 'object';
}

/**
 * A row written before 2026-09-25 (it has no `graded` key). Every one of them ran the MODIFIED stations whatever its
 * `screen` says: the harness built every runner 'modified' and posted the picker's value (MIRROR-COACH P1), so a
 * 'full' label on one of these is the picker, not the protocol that ran.
 */
export function isLegacyStoredScreen(metrics: unknown): boolean {
  return !!metrics && typeof metrics === 'object' && !('graded' in (metrics as object));
}

/** The variant a stored row really ran: 'modified' for every legacy row, else what it was stored as. */
function storedVariant(m: { screen?: unknown }, legacy: boolean): ScreenId {
  return !legacy && m.screen === 'full' ? 'full' : 'modified';
}

/**
 * Read one back, or null when it is not a screen this code can use.
 *
 * Deliberately strict: a half-written row is treated as no screen rather than as an empty one, because
 * "this athlete has no findings" and "this row cannot be read" would otherwise look identical to a coach. An
 * UNGRADED row (no results) is not a result either — isUngradedStoredScreen tells it apart from a broken one.
 *
 * MIRROR-COACH P1 (2026-09-25): the results go back through resultsForScreen and the summary is RE-SCORED from them,
 * not read from the row. A row stored before today carries the old scoring — one stable check out of eight stored as
 * score 100, "Nothing flagged", "Train normally" — and a reader that trusted it would repeat that to a coach. And a
 * legacy row's variant is 'modified' whatever its label (isLegacyStoredScreen).
 *
 * MIRROR-COACH P3 (2026-09-25): re-scored under today's rules, a result for a self-report or coach check on an older row
 * is dropped (resultsForScreen keeps camera checks only), so a row whose only "result" was the breath station reads as
 * not graded. The athlete's answers, the camera evidence and `gradedBy` ride through as stored; `gradedBy: 'server'`
 * is what says the grades were re-checked by the server (isServerGradedScreen) — anything that UNLOCKS load from a
 * screen must ask for it, because an older row's grades were whatever the posting client said.
 */
export function readStoredScreen(metrics: unknown): StoredScreen | null {
  if (!metrics || typeof metrics !== 'object') return null;
  const m = metrics as Partial<StoredScreen>;
  if (!Array.isArray(m.results) || !m.results.length) return null;
  if (!m.summary || typeof m.summary !== 'object') return null;
  if (!Array.isArray(m.summary.meaning) || !Array.isArray(m.summary.suggestions)) return null;
  const ok = m.results.every((r) => r && typeof r.checkId === 'string' && typeof r.grade === 'string');
  if (!ok) return null;
  const screen = storedVariant(m, isLegacyStoredScreen(metrics));
  const results = resultsForScreen(screen, m.results);
  if (!results.length) return null;
  const out: StoredScreen = { screenId: String(m.screenId ?? ''), screen, graded: true, results, summary: scoreScreen(screen, results) };
  if (m.gradedBy === 'server') out.gradedBy = 'server';
  if (Array.isArray(m.camera)) out.camera = m.camera;
  if (typeof m.provisional === 'boolean') out.provisional = m.provisional;
  const answers = storedSelfReport(metrics);
  if (answers.length) out.selfReport = answers;
  return out;
}

/**
 * True for a row whose grades the SERVER worked out from grader summaries it re-checked (MIRROR-COACH P3, 2026-09-25).
 * Every row written before today is false: the app had no grader, so any grade on one was the posting client's word.
 *
 * NOT THE MARKER ALONE (MIRROR-COACH P3 review, 2026-09-26): `gradedBy` is a field in a JSON row, and POST
 * /api/v1/workout/scan stored any kind with the client's metrics — a `mirror_screen` row with `gradedBy: 'server'` and
 * seven clean results read as a clean, server-checked screen. That route now writes only its own kind
 * (lib/workout/movement-screen.ts SCAN_ROUTE_KINDS); and here the row must also carry the server's evidence (`camera`, the
 * re-checked grades) and its results must be exactly what that evidence gives — which the screen route always stores.
 * A row copied whole from a real screen still passes: this checks consistency, and only the write paths can check origin.
 */
export function isServerGradedScreen(metrics: unknown): boolean {
  if (!metrics || typeof metrics !== 'object') return false;
  const m = metrics as { gradedBy?: unknown; camera?: unknown; results?: unknown; screen?: unknown };
  if (m.gradedBy !== 'server' || !Array.isArray(m.camera) || !Array.isArray(m.results)) return false;
  const screen: ScreenId = m.screen === 'full' ? 'full' : 'modified';
  const key = (r: CheckResult) => `${r.checkId}|${r.side ?? ''}|${r.grade}`;
  try {
    const fromEvidence = resultsForScreen(screen, m.camera
      .map((c) => (c && typeof c === 'object' ? toCheckResult(c as StationGrade) : null))
      .filter((r): r is CheckResult => r !== null)).map(key).sort();
    const stored = resultsForScreen(screen, m.results).map(key).sort();
    return fromEvidence.length === stored.length && fromEvidence.every((k, i) => k === stored[i]);
  } catch {
    return false;                                            // evidence that is not grades is no evidence
  }
}

/**
 * A movement-history row as the athlete's data export shows it (app/api/prq/export/route.ts).
 *
 * MIRROR-COACH P1 (2026-09-25). Every screen stored before today was scored 100 with "Nothing flagged. That is a
 * platform you can load." and "Train normally.", over zero results, and some say screen 'full' over the modified
 * stations. The coach's route reads them as ungraded (isUngradedStoredScreen); the export returned them verbatim, so an
 * athlete who downloaded their data read a clean score for a screen nothing graded. A mirror_screen row is shown here
 * the way the rules in use today store it — an empty legacy row as not graded, a graded row re-scored, a legacy row as
 * the modified screen it ran — with a note saying so. Rows of any other kind, and rows this does not recognise as a
 * screen, pass through untouched. Pure; the stored row is not changed.
 */
export const LEGACY_SCREEN_NOTE =
  'Stored before 2026-09-25, when a screen nothing graded was saved with a score of 100. Shown here as what it was: not graded.';
export const RESCORED_SCREEN_NOTE =
  'Stored before 2026-09-25. Shown here re-read with the scoring in use since then.';

export function screenRowForExport<T extends { kind?: unknown; metrics?: unknown }>(row: T): T {
  if (row.kind !== MIRROR_SCREEN_KIND || !row.metrics || typeof row.metrics !== 'object') return row;
  const m = row.metrics as Record<string, unknown>;
  const legacy = isLegacyStoredScreen(m);
  if (!legacy) return row;                                  // written by today's route: already true as stored
  const graded = readStoredScreen(m);
  if (graded) return { ...row, metrics: { ...graded, note: RESCORED_SCREEN_NOTE } };
  if (!isUngradedStoredScreen(m)) return row;               // not a screen this code can read: shown as it is
  const screen: ScreenId = 'modified';
  return {
    ...row,
    metrics: { screenId: String(m.screenId ?? ''), screen, graded: false, results: [], summary: scoreScreen(screen, []), note: LEGACY_SCREEN_NOTE },
  };
}

/** The id of the screen a stored row came from, for deduping a retried post. */
export function storedScreenId(metrics: unknown): string | null {
  const s = (metrics && typeof metrics === 'object') ? (metrics as { screenId?: unknown }).screenId : null;
  return typeof s === 'string' && s ? s : null;
}
