// EVERYONE ON THE RIM (lane/hoops-shot-core, owner 2026-10-20).
//
// Phase 7 (RimDecides.ts, docs/SPEC-RIM-DECIDES.md) put the 1v1 hero, the 1v1 rival and the 3v3 hero on the ring: one error is
// drawn so that P(made) == pct, and the ring's geometry says yes or no. Three shooters were left rolling plain dice at the
// release and planning the iron afterwards to agree (forcedMakeProfile / forcedMissProfile):
//
//   · the 3v3 TEAMMATES — `Math.random() < rivalShotPct(...)` (and the oop / putback catch at the iron);
//   · the 3v3 RIVALS — `Math.random() < rivalReleasePct(...)`;
//   · every DUNK's base roll — `Math.random() < c.pct` (DUNK_PCT through contestDrive), the hero's and the rival's, both modes.
//
// They go through the ring now, and their make RATES are kept exactly — the pct each path computed is the pct the ring is
// asked for, untouched. Two things make that exact rather than approximate:
//
//   1. The Weibull scale is chosen so the make radius sits at the pct quantile (RimDecides.scaleFor) — closed form.
//   2. rimDecides clamps pct to [0.005, 0.995] (a pct of 1 would put every ball dead centre). The dice these paths rolled were
//      not clamped, and a rival's release can be asked for more than 1 (rivalReleasePct divides by a nerve below 1), which
//      the dice made every time. `rimDecidesExact` keeps those tails exact: above the clamp it re-draws a miss from the make
//      side with probability (pct − 0.995) / 0.005 — so P(made) = 0.995 + 0.005 · that = pct, and a pct ≥ 1 always makes;
//      below it, the mirror. The re-drawn error is a real draw from the ring's own make (or miss) distribution, so the iron
//      still tells the truth about the ball it shows.
//
// A dunk is the one finish whose ball the ring did not show: a miss always clanked straight back off the dunker's side of
// the ring at one speed (ballRig.clankOffRim). Its miss now bounces off the iron where the error put it — the front iron
// back at the dunker, the back iron long, the side iron wide — harder the further out it caught.
//
// The trick stick's and SHOWTIME's own re-rolls (trickPctFor, SHOWTIME_PCT) are a judged landing, not a shot at the ring,
// and stay as they are (h2Leftovers.contract.test pins them).
//
// Pure: no scene. `rand` is seedable.

import { Vector3 } from '@babylonjs/core';
import { rivalShotPct } from './BasketballCore';
import { rimDecides, type RimBias, type RimVerdict } from './RimDecides';
import { rimFrame } from './RimPlay';
import { RIM_RADIUS, type MissProfile } from './RimPhysics';
import { feel } from '../../feel-panel/feel';   // feel-panel knobs hoops.dunk* (lib/feel-panel/knobs.ts)

/** rimDecides' own pct clamp (RimDecides.PCT_MIN / PCT_MAX, not exported there). */
export const RING_PCT_MIN = 0.005, RING_PCT_MAX = 0.995;
/** A re-draw that cannot land (a pathological rand) gives up after this many and keeps the last draw. */
const MAX_REDRAWS = 64;

/**
 * The ring decides, with P(made) == pct EXACTLY for every pct (≤ 0 never, ≥ 1 always) — the dice it replaces made no clamp.
 * Inside [RING_PCT_MIN, RING_PCT_MAX] this IS rimDecides.
 */
export function rimDecidesExact(
  rim: Vector3, toShooter: Vector3, pct: number, quality: number, bias: RimBias = {}, rand: () => number = Math.random,
): RimVerdict {
  const p = Number.isFinite(pct) ? pct : 0;
  let v = rimDecides(rim, toShooter, p, quality, bias, rand);
  if (p > RING_PCT_MAX && !v.made) {
    // the clamp left this a miss: with probability (p − max) / (1 − max) it is a make the ring has to show
    const flip = p >= 1 ? 1 : (p - RING_PCT_MAX) / (1 - RING_PCT_MAX);
    if (rand() < flip) for (let i = 0; i < MAX_REDRAWS && !v.made; i++) v = rimDecides(rim, toShooter, p, quality, bias, rand);
  } else if (p < RING_PCT_MIN && v.made) {
    const flip = p <= 0 ? 1 : (RING_PCT_MIN - p) / RING_PCT_MIN;
    if (rand() < flip) for (let i = 0; i < MAX_REDRAWS && v.made; i++) v = rimDecides(rim, toShooter, p, quality, bias, rand);
  }
  return v;
}

/** The 3v3 teammate's make rate — moved here VERBATIM from ThreeVThreeMode.teammateShoots (the numbers are not touched): a lob
 *  or a putback caught at the iron is a high-percentage finish; a shot is the rival's own rivalShotPct against the defender on HIM. */
export function matePct(finish: 'shot' | 'alleyoop' | 'putback', dist: number, mateContest: number, mateStyle: 'layup' | 'jumper'): number {
  return finish !== 'shot' ? Math.max(0.55, 0.82 - mateContest * 0.2) : rivalShotPct(dist, mateContest, mateStyle);
}

/** A dunk at the ring: quality is high (it is placed, not thrown), and a body in the flight's path pushes the miss back out the
 *  front (the iron comes back at the dunker). */
export const DUNK_RING_QUALITY = 0.7;
/** How hard a contest pushes a missed dunk out the front iron (bias.short = contest × this). */
export const DUNK_SHORT_BIAS = 0.7;
/** A missed dunk's outward speed off the iron: MIN at the centre, + SPAN at the miss radius (m/s). */
export const DUNK_CLANK_MIN_MPS = 2.4;
export const DUNK_CLANK_SPAN_MPS = 1.6;
export function dunkRimBias(contest01: number): RimBias {
  return { short: Math.max(0, Math.min(1, contest01)) * feel('hoops.dunkShortBias', DUNK_SHORT_BIAS) };
}

/**
 * A missed dunk's ball off the iron, from the error the ring drew: it leaves the ring outward from where it caught, harder the
 * further out — the front iron back at the dunker, the back iron long, a side iron wide. Same scale as the clank it replaces
 * (clankOffRim: 3.2 m/s out, 2.6 up). `toShooter` is the rim → dunker direction (planar). The caller integrates gravity.
 */
export function dunkClankVelocity(profile: MissProfile, toShooter: Vector3): Vector3 {
  const { back, side } = rimFrame(toShooter);
  // depth < 0 is short (the front iron, toward the shooter = +back); lateral > 0 is to the shooter's right (+side)
  let ex = back.x * -profile.depthError + side.x * profile.lateralError;
  let ez = back.z * -profile.depthError + side.z * profile.lateralError;
  const n = Math.hypot(ex, ez);
  if (n < 1e-6) { ex = back.x; ez = back.z; } else { ex /= n; ez /= n; }
  const out = Math.max(0, Math.min(1, n / (RIM_RADIUS * 1.9)));   // 0 at the centre … 1 at MISS_RADIAL_MAX
  const speed = feel('hoops.dunkClankMinMps', DUNK_CLANK_MIN_MPS) + feel('hoops.dunkClankSpanMps', DUNK_CLANK_SPAN_MPS) * out;   // 2.4–4.0 m/s (the old clank: 3.2 always)
  return new Vector3(ex * speed, 2.6, ez * speed);
}

/** A dunk's verdict: the ring at the dunk's pct, from where he took off. `contest01` pushes a miss out the front. */
export function dunkVerdict(rim: Vector3, from: Vector3, pct: number, contest01: number, rand: () => number = Math.random): RimVerdict {
  const toShooter = from.subtract(rim); toShooter.y = 0;
  return rimDecidesExact(rim, toShooter, pct, feel('hoops.dunkRingQuality', DUNK_RING_QUALITY), dunkRimBias(contest01), rand);
}
/** The missed dunk's ball off the iron (dunkClankVelocity on the verdict's error). */
export function dunkMissVelocity(v: RimVerdict, from: Vector3, rim: Vector3): Vector3 {
  const toShooter = from.subtract(rim); toShooter.y = 0;
  return dunkClankVelocity(v.profile, toShooter);
}

/** The make RATE a path's dice gave (u < pct over u ∈ [0, 1)): the "before" the statistical test holds the ring to. */
export function diceRate(pct: number): number {
  return Math.max(0, Math.min(1, pct));
}
