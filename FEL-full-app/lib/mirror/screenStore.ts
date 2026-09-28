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
}

/** The `metrics` payload for a WorkoutScan of kind MIRROR_SCREEN_KIND. */
export function storedScreen(screenId: string, screen: ScreenId, results: readonly CheckResult[], summary: ScreenResultSummary): StoredScreen {
  return { screenId, screen, graded: isGraded(results), results: [...results], summary };
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
  return { screenId: String(m.screenId ?? ''), screen, graded: true, results, summary: scoreScreen(screen, results) };
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
