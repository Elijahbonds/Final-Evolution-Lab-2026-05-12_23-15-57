// scoreScale — PRQ and the whole economy are driven by an unnormalised number.
//
// MEASURED ON THE DEPLOYED BUILD, 2026-07-28, one session each:
//
//   mode          score submitted   XP     shards   PRQ delta
//   dunkContest              25      48        1        0.0
//   karateEndless          1250    1885       62       +0.5
//
// Both were mediocre runs. `karateEndless` paid **39x the XP and 62x the
// shards** of `dunkContest`, and it moved PRQ while the dunk contest did not —
// not because it was more of a workout, but because karate counts in thousands
// and a dunk contest counts in tens.
//
// A dunk contest's THEORETICAL MAXIMUM is 120 (4 dunks x 3 judges x 10, from
// M94's DunkSim). A middling karate run scored 1250. The scales are not
// comparable and nothing anywhere converts between them.
//
// WHY THIS IS NOT A BALANCE TWEAK
// PRQ is the product. It is the number the app is named around, the input to
// difficulty, the thing a player is supposed to trust as a readiness reading.
// Feeding it a raw per-mode score means **PRQ measures which mode you picked**,
// and a player optimising for PRQ should play karate and never dunk. That is a
// worse failure than the weight-table drift M82 fixed, because the weights are
// at least applied to a quantity that means something.
//
// AND THE SAME NUMBER IS CLIENT-SUPPLIED
// The observed payload:
//
//   POST /api/sessions   {"mode":"dunkContest","score":25,...}
//   POST /api/v1/wallet/earn   {...,"payload":{"score":25}}  ->  granted 53 coins
//
// The client states its own score and currency is minted from it. Normalising
// does not fix that — a normalised client-supplied number is still
// client-supplied — but it makes the server-side ceiling checkable, which is
// the first step toward computing the reward rather than accepting it.
//
// WHAT THIS MODULE WILL NOT DO
// It will not invent scales. Every mode needs a real maximum, established from
// its own rules or from real play, and a mode without one **throws** rather
// than guessing. Guessing here would recreate the exact defect: a number that
// looks authoritative and means nothing.

export interface ModeScale {
  /** Score at which a run counts as a complete, excellent performance. */
  excellent: number;
  /** Where the number comes from. Required — an uncited scale is a guess. */
  basis: string;
}

export class UnscaledModeError extends Error {}

/**
 * Only modes whose maximum is actually known.
 *
 * Two entries. That is not an oversight — it is the honest count of modes
 * whose scoring scale anyone has established.
 */
export const SCALES: Record<string, ModeScale> = {
  dunkContest: {
    excellent: 120,
    basis: 'DunkSim (M94): 2 rounds x 2 dunks x 3 judges x 10 max = 120, exact from the rules',
  },
  karateEndless: {
    excellent: 4000,
    basis: 'measured: a mediocre 106-second run scored 1250; 4000 is a placeholder '
      + 'for a strong run and NEEDS a real high-score sample before it is trusted',
  },
};

/**
 * A mode's raw score as 0..1 of an excellent performance.
 *
 * Clamped at 1: a player who exceeds "excellent" has found something the scale
 * did not anticipate, and paying them proportionally more for it is how an
 * unbounded exploit becomes an unbounded payout.
 */
export function normalise(mode: string, rawScore: number): number {
  const s = SCALES[mode];
  if (!s) {
    throw new UnscaledModeError(
      `no score scale for "${mode}". PRQ and currency must not be computed from a raw `
      + 'per-mode score — karateEndless paid 39x dunkContest for a comparable run. '
      + 'Add a cited entry to SCALES.',
    );
  }
  if (!Number.isFinite(rawScore) || rawScore < 0) return 0;
  return Math.min(1, rawScore / s.excellent);
}

/** True when a mode can be rewarded at all. Lets a caller degrade instead of throw. */
export function isScaled(mode: string): boolean {
  return mode in SCALES;
}

/** Modes seen in the wild that still have no scale. */
export function unscaled(observedModes: readonly string[]): string[] {
  return observedModes.filter((m) => !isScaled(m));
}

/**
 * How far apart two modes' raw scales are, for the same quality of run.
 *
 * The number that makes the problem legible: pass the two raw scores that
 * represent equally good play and get the multiple one is overpaid by.
 */
export function scaleDisparity(
  a: { mode: string; raw: number }, b: { mode: string; raw: number },
): number {
  const na = normalise(a.mode, a.raw);
  const nb = normalise(b.mode, b.raw);
  if (na === 0 || nb === 0) return Infinity;
  return +(Math.max(a.raw / b.raw, b.raw / a.raw) / Math.max(na / nb, nb / na)).toFixed(2);
}

/**
 * The reward a session has earned, on one scale for every mode.
 *
 * `weight` is the mode's PRQ weight from `config/prqWeights.json` (M82) — a
 * shop must still mint nothing however well you browse.
 */
export function sessionValue(mode: string, rawScore: number, weight: number): number {
  return normalise(mode, rawScore) * weight;
}
