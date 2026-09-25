// SessionResult — modes report RAW stats; the server/reward layer mints rewards.
// Matches the client-visible shape the live result screens already consume.

export interface SessionResult {
  modeId: string;
  outcome: string;                   // 'GREAT' | 'TACKLED_17YD' | 'WAVE_6' ...
  score: number;
  stats: Record<string, number>;     // yards, evaded, kos, combo, coinsCollected…
  durationSec: number;
  timestamp: string;
  /**
   * Non-numeric detail about the run — a dunk card, a routine, a lap breakdown.
   *
   * A SEPARATE channel from `stats` on purpose. `stats` is numbers only because the reward layer sums and
   * compares it; widening that to carry a structured card would have put an object in front of every reward
   * rule in the app. Nothing here is ever read for rewards — it exists so another PLAYER can see what you
   * did, which is what a challenge carrying only a score could never show.
   */
  detail?: unknown;
}

/**
 * Where a finished run goes. Every host passes its own (HarnessOpts.resultSink is required).
 *
 * MOVEMENT PLAY P3 (2026-09-24): there is no default any more. The one this file had posted to /api/sessions/result,
 * a route that does not exist, so a host that forgot its sink lost every result to a 404 without a word.
 */
export type ResultSink = (result: SessionResult) => Promise<void>;

export function buildResult(
  modeId: string, outcome: string, score: number,
  stats: Record<string, number>, startedAtMs: number, detail?: unknown,
): SessionResult {
  return {
    modeId, outcome, score, stats,
    durationSec: Math.round((performance.now() - startedAtMs) / 1000),
    timestamp: new Date().toISOString(),
    ...(detail === undefined ? {} : { detail }),
  };
}
