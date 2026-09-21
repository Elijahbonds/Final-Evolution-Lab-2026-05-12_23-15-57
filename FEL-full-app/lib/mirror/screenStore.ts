// What a stored Mirror screen looks like, written once so the two ends cannot drift.
//
// The screen is WRITTEN by app/api/mirror/screen (after scoring, after the reward) and READ by
// app/api/coach/prescribe, which hands it to lib/coach/mirrorToProgram. Those are different files, and a stored
// shape that only exists as an object literal in one of them is a shape the other can stop agreeing with in
// silence: the coach's panel would simply show nothing, forever, and look like an athlete with no screen.
//
// Numbers and grades only. No video, no keypoints — the raw footage never leaves the athlete's device, and
// nothing here should make it look like it did.

import type { CheckResult, ScreenId, ScreenResultSummary } from './screen';

export interface StoredScreen {
  screenId: string;
  screen: ScreenId;
  results: CheckResult[];
  summary: ScreenResultSummary;
}

/** The `metrics` payload for a WorkoutScan of kind MIRROR_SCREEN_KIND. */
export function storedScreen(screenId: string, screen: ScreenId, results: readonly CheckResult[], summary: ScreenResultSummary): StoredScreen {
  return { screenId, screen, results: [...results], summary };
}

/**
 * Read one back, or null when it is not a screen this code can use.
 *
 * Deliberately strict: a half-written row is treated as no screen rather than as an empty one, because
 * "this athlete has no findings" and "this row cannot be read" would otherwise look identical to a coach.
 */
export function readStoredScreen(metrics: unknown): StoredScreen | null {
  if (!metrics || typeof metrics !== 'object') return null;
  const m = metrics as Partial<StoredScreen>;
  if (!Array.isArray(m.results) || !m.results.length) return null;
  if (!m.summary || typeof m.summary !== 'object') return null;
  if (!Array.isArray(m.summary.meaning) || !Array.isArray(m.summary.suggestions)) return null;
  const ok = m.results.every((r) => r && typeof r.checkId === 'string' && typeof r.grade === 'string');
  if (!ok) return null;
  return { screenId: String(m.screenId ?? ''), screen: m.screen === 'full' ? 'full' : 'modified', results: m.results, summary: m.summary };
}

/** The id of the screen a stored row came from, for deduping a retried post. */
export function storedScreenId(metrics: unknown): string | null {
  const s = (metrics && typeof metrics === 'object') ? (metrics as { screenId?: unknown }).screenId : null;
  return typeof s === 'string' && s ? s : null;
}
