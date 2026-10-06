// HundredPacing — the pure rules behind The Hundred's (KarateEndlessMode) run shape. IMPROVE (2026-10-06): the owner's
// picks from docs/IMPROVEMENTS-2026-10-05.md (## karate). Headless, no Babylon; the mode renders them and
// HundredPacing.test.ts holds them.

// ── the live-body cap (phones) ────────────────────────────────────────────────────────────────────────────────────────
/**
 * How many horde bodies may be RIGGED at once (standing, sinking out, or loading). The perf-guard lane measured The
 * Hundred at 22 skinned bodies on a phone profile against a ceiling of 16 (2 fighters + 7 onlookers + a 12-body wave +
 * the bodies still sinking out). A phone keeps its 12-body wave — the rest wait in a queue and come in on a freed rig —
 * so the wave, the score and the bound in lib/arena-score-integrity are unchanged; only how many stand at once is.
 * 2 fighters + HUNDRED_PHONE_ONLOOKERS + this = 16. Desktop: no cap (its wave is 20, as before).
 */
export const HORDE_LIVE_CAP_MOBILE = 10;
export const HUNDRED_PHONE_ONLOOKERS = 4;
export function hordeLiveCap(tier: unknown): number {
  return tier === 'mobile' ? HORDE_LIVE_CAP_MOBILE : Infinity;
}
/** A queued body may come in: one is waiting and a rig is free under the cap. */
export function canTopUp(rigged: number, queued: number, cap: number): boolean {
  return queued > 0 && rigged < cap;
}
/** The wave is over only when nobody stands, nobody is still loading and nobody is waiting in the queue. */
export function waveDone(live: number, loading: number, queued: number): boolean {
  return live === 0 && loading === 0 && queued === 0;
}
