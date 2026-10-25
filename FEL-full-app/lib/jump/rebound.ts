// rebound — repeated jumps: ground contact time and the reactive strength index (JUMP-PRO, 2026-10-24).
//
// Two valid jumps whose landing and next take-off are under MAX_CONTACT_MS apart are a rebound: the contact is the
// re-timed landing to the re-timed take-off (lib/jump/refine.ts edges, both sub-frame), and
//   RSI         jump height (m) ÷ contact time (s) — the drop-jump / 10-5 test's index
//   RSI-flight  flight time ÷ contact time — the same idea with no height model in it
// The 10/5 repeated-jump test scores the mean RSI of the best five rebounds.
//
// Measured on the bench (rebound takes, 150 and 200 ms contacts, 6 seeds × 5 rebounds): every rebound found at
// 30–240 fps; contact bias within ±3 ms; contact SD 10–15 ms at 30 fps, 10 at 60, 7 at 120, 4–5 at 240 — so RSI is
// ±5–10 % (1 SD) live at 30–60 fps and ±2–3 % from a 240 fps slow-mo. Live RSI is an estimate.
//
// A DROP jump (off a box) is not read yet: the step off the box is not a jump, and the floor under it is the box. See
// docs/JUMP-PRO.md, follow-ups.
//
// Pure.
export const MAX_CONTACT_MS = 400;
/** The 10/5 test: the mean RSI of this many best rebounds. */
export const BEST_OF = 5;

export interface Rebound { from: number; to: number; contactMs: number; rsi: number; rsiFlight: number }
export interface ReboundSet { rebounds: Rebound[]; bestRsi: number | null; bestContactMs: number | null; best5Rsi: number | null }

export function reboundStats(jumps: readonly { index: number; valid: boolean; takeoffT: number; landT: number; heightCm: number; flightMs: number }[]): ReboundSet {
  const v = jumps.filter((j) => j.valid).sort((a, b) => a.takeoffT - b.takeoffT);
  const rebounds: Rebound[] = [];
  for (let k = 1; k < v.length; k++) {
    const c = v[k].takeoffT - v[k - 1].landT;
    if (c <= 0 || c > MAX_CONTACT_MS) continue;
    const r2 = (x: number) => Math.round(x * 100) / 100;
    rebounds.push({ from: v[k - 1].index, to: v[k].index, contactMs: Math.round(c), rsi: r2(v[k].heightCm / 100 / (c / 1000)), rsiFlight: r2(v[k].flightMs / c) });
  }
  if (!rebounds.length) return { rebounds, bestRsi: null, bestContactMs: null, best5Rsi: null };
  const byRsi = [...rebounds].sort((a, b) => b.rsi - a.rsi);
  const top = byRsi.slice(0, BEST_OF);
  return {
    rebounds, bestRsi: byRsi[0].rsi, bestContactMs: byRsi[0].contactMs,
    best5Rsi: rebounds.length >= BEST_OF ? Math.round((top.reduce((a, r) => a + r.rsi, 0) / top.length) * 100) / 100 : null,
  };
}

/**
 * JUMP-PRO 2: RSI with its own ± (a drop jump's, or any one rebound's): h ÷ contact, and its 95 % range from the
 * height's and the contact's ±1 SD (independent: the height comes from the flight, the contact from two other edges).
 */
export function rsiWithRange(heightCm: number, heightSdCm: number, contactMs: number, contactSdMs: number): { rsi: number; plusMinus: number } {
  const rsi = heightCm / 100 / (contactMs / 1000);
  const rel = Math.hypot(heightSdCm / Math.max(1e-6, heightCm), contactSdMs / Math.max(1e-6, contactMs));
  return { rsi: Math.round(rsi * 100) / 100, plusMinus: Math.round(1.96 * rsi * rel * 100) / 100 };
}
