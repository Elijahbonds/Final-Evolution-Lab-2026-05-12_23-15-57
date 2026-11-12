// ONE SHOT MODEL FOR EVERY SHOOTER (hoops phase 9, lane/hoops-p09): the window a release is judged against, the AI's release on the
// same meter, and the ring's look for a shot the RELEASE decided. The rules themselves are in hoops/rulebook.ts.
//
// The hero's release: the meter graded it (ShotMeter.release) and knows where it sat (offsetSec). Under the skill model the window is
// the green the meter showed, narrowed to the green the contest AT THE RELEASE would have given (a closeout during the gather costs
// you), times the modifiers (fatigue, momentum, called glass), and the release goes in when it is inside that window.
// The AI's release: a meter is started for its shot (its style, its contest, its distance, the same green scale), its hand puts the
// release `gauss × sigma` off the green's centre, the meter grades it — and from there it is the hero's path exactly: under the skill
// model the window decides; under the rate model the grade's SHOT_QUALITY_PCT × the style × contestedPct is the rate the ring draws at.
// So one table and one rule, three shooters; only the hand differs.
import { Vector3 } from '@babylonjs/core';
import { ShotMeter, SHOT_QUALITY_PCT, type ShotQuality, type ShotStyle } from './BasketballCore';
import { distanceGreenFactor } from './ShotWindow';
import { contestedPct, FATIGUE_PCT_BITE } from './HoopsDefense';
import { BANK_PCT_BONUS } from './HoopsMoves';
import { drawDirection, MAKE_RADIUS, MISS_RADIAL_MAX, type RimBias, type RimVerdict } from './RimDecides';
import { maybeAirball, planRimPlay } from './RimPlay';
import type { MissProfile } from './RimPhysics';
import { greenScaleFor, skillVerdict, windowModFactor, gaussFrom, aiTimingSigmaSec, type AiShooter, type ReleaseWindowMods, type SkillVerdict } from '../hoops/rulebook';

/** Each style's make modifier as classifyShot hands it out on its plain path (BasketballCore classifyShot) — the AI's shot reads it the
 *  way the hero's does. A context classifyShot prices differently (a post fade 0.86, a running fade 0.78) is the caller's to pass. */
export const STYLE_PCT_MOD: Readonly<Record<ShotStyle, number>> = {
  jumper: 0.95, fadeaway: 0.84, floater: 1.0, layup: 1.18, hook: 1.06, reverse: 1.1, mikan: 1.26, upAndUnder: 1.0,
  fingerRoll: 1.22, scoop: 1.1, spinLayup: 1.02, hangLayup: 1.04,
};
/** The finishes: every style but the two jump shots (ShotMeter.release's own split). */
export const isFinishStyle = (style: ShotStyle): boolean => style !== 'jumper' && style !== 'fadeaway';

/** A meter for this shot, the way the modes start the hero's: the contest, the style, the gather; distance and the green scale (a jump
 *  shot's scale, a finish's contest narrowing) narrow it. */
export function meterFor(style: ShotStyle, contest: number, distM: number, gatherSec = 0): ShotMeter {
  const m = new ShotMeter();
  m.start(Math.max(0, Math.min(1, contest)), style, gatherSec);
  m.narrowBy(distanceGreenFactor(distM, style));
  m.narrowBy(greenScaleFor(style, contest));
  return m;
}

export interface ReleaseWindowIn extends ReleaseWindowMods {
  style: ShotStyle;
  /** The green's half-width the meter showed (s). */
  meterHalfSec: number;
  /** The contest at the release. */
  releaseContest: number;
  /** The rim distance (m) — the distance narrowing, as at the start. */
  distM: number;
  gatherSec?: number;
  /** hoops-builder (owner 2026-11-12): the hero's Shooting rating on a jump shot's green (ratings.ts greenScale; the caller passes 1
   *  for a finish and in a rating-free run). The meter showed the green with it, so the release is judged against it too. Absent = 1. */
  ratingGreen?: number;
}
/** The green's half-width a release is judged against (s): the narrower of what the meter showed and what the release's contest gives,
 *  times the modifiers. */
export function releaseHalfSec(w: ReleaseWindowIn): number {
  const atRelease = meterFor(w.style, w.releaseContest, w.distM, w.gatherSec ?? 0).greenHalfSec * (w.ratingGreen ?? 1);
  const shown = w.meterHalfSec > 0 ? w.meterHalfSec : atRelease;
  return Math.min(shown, atRelease) * windowModFactor(w, FATIGUE_PCT_BITE, BANK_PCT_BONUS);
}

/** The hero's verdict under the skill model (log the result; the ring's look comes from rimFromRelease). */
export function heroSkillVerdict(quality: ShotQuality, offsetSec: number, w: ReleaseWindowIn): SkillVerdict & { halfSec: number } {
  const halfSec = releaseHalfSec(w);
  return { ...skillVerdict({ quality, offsetSec, halfSec, finish: isFinishStyle(w.style), contest: w.releaseContest, gradeHalfSec: w.meterHalfSec }), halfSec };
}

/**
 * The ring's look for a shot the release decided: the error's size is the release's closeness (inside the green → inside the make
 * radius: dead centre swishes, the edge rattles in; just outside → a rim-out; far outside → a brick), its direction the mode's bias
 * (early short, late long, the contest short). Only the direction and the dwell are drawn — the verdict is `made`.
 */
export function rimFromRelease(rim: Vector3, toShooter: Vector3, made: boolean, closeness: number, quality01: number, bias: RimBias = {}, rand: () => number = Math.random): RimVerdict {
  const c = Math.max(0, Number.isFinite(closeness) ? closeness : 3);
  const radial = made ? MAKE_RADIUS * Math.min(0.995, c) : Math.min(MISS_RADIAL_MAX, MAKE_RADIUS * Math.max(1.01, c));
  const dir = drawDirection(bias, rand);
  const q = Math.max(0, Math.min(1, quality01));
  let profile: MissProfile = { depthError: radial * dir.depth, lateralError: radial * dir.lateral, descentSpeed: 5 + (1 - q) * 3 };
  if (!made) profile = maybeAirball(profile, q, rand);
  return { made, profile, play: planRimPlay(rim, toShooter, profile, made, rand), radial };
}

// ── the AI's release ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface AiReleaseIn {
  who: AiShooter;
  style: ShotStyle;
  contest: number;
  distM: number;
  /** core/Nerve's mistake (1 neutral). */
  mistake?: number;
  /** A called-glass bank (the 1v1 rival's wing bank). */
  banked?: boolean;
}
export interface AiRelease {
  quality: ShotQuality;
  offsetSec: number;
  halfSec: number;
  /** The skill model's verdict (always computed; the rate model ignores it). */
  verdict: SkillVerdict;
  /** The rate model's make chance for this grade (the hero's table: SHOT_QUALITY_PCT × style × contest; + the bank's edge). */
  ratePct: number;
}
/** The AI releases on the shared meter: its hand's error, graded by the same meter as mine. One draw (the hand), nothing else. */
export function aiRelease(r: AiReleaseIn, rand: () => number): AiRelease {
  const m = meterFor(r.style, r.contest, r.distM, 0);
  const sigma = aiTimingSigmaSec(r.who, r.mistake ?? 1);
  const off = gaussFrom(rand) * sigma;
  const t = Math.max(0, Math.min(1, m.greenCenter01 + off / Math.max(1e-3, m.durationSec)));
  (m as unknown as { t: number }).t = t;
  const quality = m.release();
  const halfSec = m.greenHalfSec * windowModFactor({ banked: r.banked }, FATIGUE_PCT_BITE, BANK_PCT_BONUS);
  const offsetSec = m.offsetSec;
  const verdict = skillVerdict({ quality, offsetSec, halfSec, finish: isFinishStyle(r.style), contest: r.contest, gradeHalfSec: m.greenHalfSec });
  const ratePct = Math.min(0.98, contestedPct(SHOT_QUALITY_PCT[quality] * STYLE_PCT_MOD[r.style], r.contest) + (r.banked ? BANK_PCT_BONUS : 0));
  return { quality, offsetSec, halfSec, verdict, ratePct };
}
/** The miss shape the hero's release uses (OneVOneMode.releaseJumper's shotMiss), for a grade and a contest. */
export function missShapeFor(quality: ShotQuality, contest: number): { quality01: number; short: number } {
  return {
    quality01: quality === 'perfect' ? 0.95 : quality === 'early' || quality === 'late' ? 0.55 : 0.2,
    short: (quality === 'early' ? 0.8 : quality === 'late' ? -0.8 : quality === 'brick' ? 0.3 : 0) + contest * 0.7,
  };
}

/** The expected make chance of a gaussian hand (sigma, s) on this shot under the CURRENT knobs — the probes' and the tests' read,
 *  integrated over the release (no draw): the skill model's window, or the rate model's grade table. */
export function expectedMake(style: ShotStyle, contest: number, distM: number, sigmaSec: number, skill = true, n = 400): number {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    // a deterministic quadrature over the normal: the (i + 0.5) / n quantiles
    const p = (i + 0.5) / n;
    const z = normalQuantile(p);
    sum += makeAtOffset(style, contest, distM, z * sigmaSec, skill);
  }
  return sum / n;
}
/** The make chance of ONE release `offsetSec` off the green's centre on this shot (1 / 0 under the skill model; the grade's rate otherwise). */
export function makeAtOffset(style: ShotStyle, contest: number, distM: number, offsetSec: number, skill = true): number {
  const m = meterFor(style, contest, distM, 0);
  (m as unknown as { t: number }).t = Math.max(0, Math.min(1, m.greenCenter01 + offsetSec / Math.max(1e-3, m.durationSec)));
  const quality = m.release();
  if (skill) return skillVerdict({ quality, offsetSec: m.offsetSec, halfSec: m.greenHalfSec, finish: isFinishStyle(style), contest }).made ? 1 : 0;
  return Math.min(0.98, contestedPct(SHOT_QUALITY_PCT[quality] * STYLE_PCT_MOD[style], contest));
}
/** Acklam's inverse normal CDF (|rel. error| < 1.2e-9). */
export function normalQuantile(p: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const q = Math.min(1 - 1e-12, Math.max(1e-12, p));
  if (q < 0.02425) { const r = Math.sqrt(-2 * Math.log(q)); return (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1); }
  if (q > 1 - 0.02425) { const r = Math.sqrt(-2 * Math.log(1 - q)); return -(((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1); }
  const r = q - 0.5, s = r * r;
  return (((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
}
