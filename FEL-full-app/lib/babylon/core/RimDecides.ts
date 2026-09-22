// THE RIM DECIDES.
//
// Phase 7 of the hoops upgrade pass (owner, 2026-09-18: "better ball physics for makes and misses and its interaction
// with the rim, different makes and misses"). Until now every shot in 1v1, 3v3 and 3PT was decided by dice at the
// release — `made = Math.random() < pct` — and the ball's error was then FORCED to agree: a make pulled inside the
// ring, a miss pushed out to the iron (forcedMakeProfile / forcedMissProfile). The dwell on the ring (planRimPlay's
// rattles, rolls and in-and-outs) was a dramatisation of a verdict already recorded. RimPlay.test.ts says so in
// its first line.
//
// Here the order is the real one. The shot's quality and its contest produce ONE error, drawn once; the ring's
// geometry says whether that error goes through; the scoreboard reads the ring. A shot that just catches the
// iron rattles in because it was close, and one that catches it a little harder pops out because it was not —
// the same error, on the same ring, and which side of the line it fell is the whole difference. That is what
// "in and out" has always meant.
//
// DIFFICULTY IS PRESERVED. The modes have tuned make rates (SHOT_QUALITY_PCT through contestedPct) and this does
// not change them: the error is a WEIBULL radial whose scale is chosen so that P(radial <= MAKE_RADIUS) == pct
// exactly. The make RATE is the pct the mode asked for; WHICH shots make is now the ring's call. Closed form:
//
//     P(R <= r) = 1 - exp(-(r / L)^k)   =>   L = MAKE_RADIUS / (-ln(1 - pct))^(1/k)
//
// The SHAPE k comes from the shot's quality, and it is what makes a green pure. At k = 2 this is a Rayleigh — the
// distance an isotropic 2-D gaussian lands from its target, the physical error of a thrown ball. Pinning that one
// parameter to pct fixed the swish share too: a perfect shot at 0.97 swished 55 % and rattled in 42 %, which is
// nobody's idea of a crisp green (the codebase's own words: "Quality 1 is dead centre — a swish"). So quality pulls
// k down toward 1, which piles the error up at the centre: a perfect release swishes ~80 % and still misses its 3 %;
// a poor one spreads out to the Rayleigh and finds the iron every way there is. Same make rate either way.
//
// The direction of a miss keeps today's meaning: `bias.short` (a contest, fatigue, an early release) sends it short
// to the front iron so it comes back at the shooter; `bias.lateral` sends it to the side. An unbiased miss goes
// anywhere. Pure — no scene, no session, a seedable `rand`.

import type { Vector3 } from '@babylonjs/core';
import { RIM_RADIUS, SWISH_WINDOW, type MissProfile } from './RimPhysics';
import { maybeAirball, planRimPlay, type RimPlay } from './RimPlay';

/** Inside this radial the ring lets the ball through — touching iron or not. The soft window forcedMakeProfile used. */
export const MAKE_RADIUS = SWISH_WINDOW * 1.15;

/** A miss never lands further out than this: a brick finds the IRON (measured: at pct 0.04 the Weibull tail put half
 *  of a shootout's random presses metres past the ring, and the plan called them airballs). Clamping only the tail above
 *  MAKE_RADIUS leaves P(made) exactly pct; an airball stays maybeAirball's own call. */
export const MISS_RADIAL_MAX = RIM_RADIUS * 1.9;
/** pct is clamped here: 1 would put every shot dead centre, 0 would send the scale to infinity. */
const PCT_MIN = 0.005, PCT_MAX = 0.995;

export interface RimBias { short?: number; lateral?: number }

export interface RimVerdict {
  /** The ring's answer. */
  made: boolean;
  /** The error the ring answered. */
  profile: MissProfile;
  /** The ball's time on the iron, planned from that error — never contradicts `made`. */
  play: RimPlay;
  /** The radial the ring measured, for the log. */
  radial: number;
}

/** The Weibull shape for a shot of this quality: 1 (peaked at the centre) for a perfect one, 2 (Rayleigh) for a brick. */
export function shapeFor(quality: number): number {
  return 2 - Math.max(0, Math.min(1, quality));
}

/** The Weibull scale that puts MAKE_RADIUS at the pct quantile, for shape k. */
export function scaleFor(pct: number, k: number): number {
  const p = Math.max(PCT_MIN, Math.min(PCT_MAX, pct));
  return MAKE_RADIUS / Math.pow(-Math.log(1 - p), 1 / k);
}

/** One radial draw, by inverse CDF. */
export function drawRadial(pct: number, quality: number, u: number): number {
  const uu = Math.max(1e-9, Math.min(1 - 1e-9, u));
  const k = shapeFor(quality);
  return scaleFor(pct, k) * Math.pow(-Math.log(1 - uu), 1 / k);
}

/**
 * Where on the ring the error lands. A bias is a PUSH, not a rule: a contested shot misses short more often than
 * not, never always — so the biased direction is mixed with an isotropic draw rather than replacing it.
 */
export function drawDirection(bias: RimBias, rand: () => number): { depth: number; lateral: number } {
  const a = rand() * Math.PI * 2;
  let d = Math.cos(a), l = Math.sin(a);
  const bs = bias.short ?? 0, bl = bias.lateral ?? 0;
  if (bs || bl) {
    // depth is NEGATIVE when short (RimPhysics' convention: depthError < 0 meets the front iron). The isotropic
    // draw keeps its full weight against the bias: at 0.8 short, about four misses in five come back at the
    // shooter and one in five goes somewhere else — which is what a contested miss looks like. The old
    // missProfileFor halved the noise and every 0.8-biased miss was short, the exact "iron answered identically
    // every time" the rival's rim work had to fix once already.
    d = d - bs;
    l = l + bl;
    const n = Math.hypot(d, l) || 1;
    d /= n; l /= n;
  }
  return { depth: d, lateral: l };
}

/**
 * Let the ring decide a shot.
 *
 * `pct` is the make rate the mode has already tuned for this shot (quality, contest, style, bank — all of it);
 * `quality` (0..1) shapes how hard the ball arrives; `bias` says which way a miss goes. `made` in the result is the
 * ring's, and `play` was planned from the same error, so the two can never disagree.
 */
export function rimDecides(
  rim: Vector3, toShooter: Vector3, pct: number, quality: number, bias: RimBias = {}, rand: () => number = Math.random,
): RimVerdict {
  const radialRaw = drawRadial(pct, quality, rand());
  const radial = Math.min(radialRaw, MISS_RADIAL_MAX);   // the tail is clamped; the verdict below is unaffected (MISS_RADIAL_MAX > MAKE_RADIUS)
  const dir = drawDirection(bias, rand);
  const q = Math.max(0, Math.min(1, quality));
  let profile: MissProfile = {
    depthError: radial * dir.depth,
    lateralError: radial * dir.lateral,
    descentSpeed: 5 + (1 - q) * 3,
  };
  const made = radial <= MAKE_RADIUS;
  // A brick can miss everything. Only a miss can be an airball — the ring has already said no.
  if (!made) profile = maybeAirball(profile, q, rand);
  const play = planRimPlay(rim, toShooter, profile, made, rand);
  return { made, profile, play, radial };
}
