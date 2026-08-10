// lib/sports/swing-core.ts
//
// PURE sports swing / shot resolution core (baseball + golf). NO THREE / DOM /
// React imports — this module is imported by BOTH the live 3D scenes
// (baseball-3d.tsx, golf-3d.tsx) and the headless test suite
// (scripts/sports-tests.ts) so the timing / contact / scoring math has exactly
// one deterministic source of truth. Every feel number is tagged //TUNE(elijah).
//
// M14-P10: baseball & golf are rebuilt from flat 2D canvas games onto real 3D
// scenes on the movement / camera / cinematic cores. The rendering is a thin
// skin; the *rules* (when contact lands, how far the ball carries, what Movie
// Event fires, how a shot scores) live here and are unit-tested.

// ===========================================================================
// Shared timing bar (Wii-Sports style readability)
// ===========================================================================

export type BarVerdict = 'perfect' | 'good' | 'early' | 'late';

/**
 * Evaluate a locked bar value against a sweet-spot centred band.
 *  - |value-center| <= inner  -> 'perfect'
 *  - |value-center| <= outer  -> 'good'
 *  - otherwise 'early' (value below centre) or 'late' (value above centre).
 * Deterministic, side-effect free.
 */
export function evaluateBar(
  value: number,
  center: number,
  inner: number,
  outer: number,
): BarVerdict {
  const d = value - center;
  const ad = Math.abs(d);
  if (ad <= inner) return 'perfect';
  if (ad <= outer) return 'good';
  return d < 0 ? 'early' : 'late';
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ===========================================================================
// Baseball — Home Run Derby contact model
// ===========================================================================

export type PitchKind = 'fastball' | 'curveball' | 'changeup';

export interface PitchDef {
  kind: PitchKind;
  /** Fraction-of-a-second travel-rate multiplier (higher = reaches plate sooner). */
  speed: number;
  /** Lateral break amount for the 3D flight curve (0 = straight). */
  break: number;
  color: string;
}

export const PITCHES: Record<PitchKind, PitchDef> = {
  fastball: { kind: 'fastball', speed: 1.25, break: 0.0, color: '#FF3366' }, // TUNE(elijah)
  curveball: { kind: 'curveball', speed: 0.85, break: 0.46, color: '#A855F7' }, // TUNE(elijah)
  changeup: { kind: 'changeup', speed: 0.68, break: 0.14, color: '#FFD700' }, // TUNE(elijah)
};

export const PITCH_KINDS: PitchKind[] = ['fastball', 'curveball', 'changeup'];

/** Pitch fraction (0..1) at which the ball crosses the ideal contact point. */
export const PLATE_T = 0.88; // TUNE(elijah)
export const BB_PERFECT = 0.045; // TUNE(elijah) timing window for barrel contact
export const BB_SOLID = 0.09; // TUNE(elijah)
export const BB_CLIP = 0.16; // TUNE(elijah)
export const HR_DISTANCE_M = 120; // TUNE(elijah) fence distance

export type ContactQuality = 'perfect' | 'solid' | 'clipped' | 'whiff';
export type HitCategory = 'homer' | 'drive' | 'liner' | 'pop' | 'miss';

export interface ContactResult {
  quality: ContactQuality;
  category: HitCategory;
  /** Carry distance in metres (0 on a whiff). */
  distanceM: number;
  /** Launch angle in degrees (vertical). */
  launchDeg: number;
  /** Spray angle in degrees: negative = pull (early swing), positive = oppo (late). */
  sprayDeg: number;
  /** Normalised exit velocity 0..1 for camera / VFX intensity. */
  exitVelo01: number;
  isHomeRun: boolean;
}

/**
 * Resolve a bat swing.
 * @param swingT  pitch fraction at the instant the batter swung (0..~1).
 * @param kind    which pitch was thrown (affects nothing but is kept for callers).
 * @param hangBonus grade-derived carry bonus (adds metres on good contact).
 * Deterministic: same inputs -> same result (no Math.random). The live scene
 * may add tiny cosmetic jitter, but scoring uses this pure result.
 */
export function resolveContact(
  swingT: number,
  _kind: PitchKind,
  hangBonus = 0,
): ContactResult {
  const off = Math.abs(swingT - PLATE_T);
  const timingSign = swingT < PLATE_T ? -1 : 1; // early swing pulls the ball

  let quality: ContactQuality;
  let base: number;
  let spread: number;
  let launch: number;
  if (off <= BB_PERFECT) {
    quality = 'perfect';
    base = 122;
    spread = 34;
    launch = 28;
  } else if (off <= BB_SOLID) {
    quality = 'solid';
    base = 92;
    spread = 30;
    launch = 21;
  } else if (off <= BB_CLIP) {
    quality = 'clipped';
    base = 40;
    spread = 40;
    launch = 12;
  } else {
    quality = 'whiff';
    base = 0;
    spread = 0;
    launch = 0;
  }

  // proximity 1 at dead-centre timing -> 0 at the edge of the quality band.
  const window =
    quality === 'perfect'
      ? BB_PERFECT
      : quality === 'solid'
        ? BB_SOLID
        : quality === 'clipped'
          ? BB_CLIP
          : 1;
  const prox = quality === 'whiff' ? 0 : clamp(1 - off / window, 0, 1);

  const distanceM =
    base > 0 ? Math.round(base + prox * spread + hangBonus * 40) : 0;
  const isHomeRun = distanceM >= HR_DISTANCE_M;

  let category: HitCategory;
  if (quality === 'whiff') category = 'miss';
  else if (isHomeRun) category = 'homer';
  else if (quality === 'clipped') category = 'pop';
  else if (launch < 18) category = 'liner';
  else category = 'drive';

  const sprayDeg = quality === 'whiff' ? 0 : timingSign * clamp((off / window) * 34, 0, 34);
  const exitVelo01 = clamp(distanceM / 150, 0, 1);

  return { quality, category, distanceM, launchDeg: launch, sprayDeg, exitVelo01, isHomeRun };
}

/** Cinematic "Movie Event" key fired for a batted ball. Drives the flight camera. */
export function battedBallEvent(r: ContactResult): HitCategory {
  return r.category;
}

// ===========================================================================
// Golf — Links Challenge shot model
// ===========================================================================

export type Club = 'driver' | 'iron' | 'wedge' | 'putter';
export type ShotKind = 'drive' | 'chip' | 'putt';

export const SHOT_CLUB: Record<ShotKind, Club> = {
  drive: 'driver',
  chip: 'wedge',
  putt: 'putter',
};

/** Nominal full-power carry (m) for each shot kind at the sweet spot. */
export const SHOT_CARRY_M: Record<ShotKind, number> = {
  drive: 210, // TUNE(elijah)
  chip: 46, // TUNE(elijah)
  putt: 9, // TUNE(elijah)
};

export const GOLF_POWER_SWEET = 0.72; // TUNE(elijah) sweet-spot on the power bar
export const GOLF_POWER_INNER = 0.05; // TUNE(elijah)
export const GOLF_POWER_OUTER = 0.12; // TUNE(elijah)

export type GolfGrade = 'birdie' | 'great' | 'solid' | 'rough';

export interface GolfShotResult {
  kind: ShotKind;
  club: Club;
  /** Carry distance actually flown (m) — for the ball-flight camera. */
  carryM: number;
  /** Signed lateral miss (m): negative = left, positive = right. */
  offlineM: number;
  /** Straight-line distance from the pin after the ball settles (m). */
  distFromPinM: number;
  grade: GolfGrade;
  points: number;
  power: BarVerdict;
}

/**
 * Resolve a golf shot.
 * @param kind    drive | chip | putt (selects club + distance scale).
 * @param aimLocked  locked aim offset -1..1 (0 = straight at the pin line).
 * @param powerLocked locked power 0..1.
 * @param wind    wind bias -1..1 (ideal aim compensates by wind*0.5).
 * Deterministic. Scoring thresholds match the proven 2D Links Challenge.
 */
export function resolveShot(
  kind: ShotKind,
  aimLocked: number,
  powerLocked: number,
  wind: number,
): GolfShotResult {
  const idealAim = wind * 0.5;
  const aimErr = Math.abs(aimLocked - idealAim);
  const powErr = Math.abs(powerLocked - GOLF_POWER_SWEET);

  // Distance-from-pin scales per shot kind (putts are far more forgiving in m).
  const scale = kind === 'putt' ? 0.35 : kind === 'chip' ? 0.7 : 1; // TUNE(elijah)
  const distFromPinM =
    Math.round((aimErr * 22 + powErr * 40) * scale * 10) / 10;

  const carryM = Math.round(SHOT_CARRY_M[kind] * clamp(powerLocked, 0, 1));
  const offlineM =
    Math.round((aimLocked - idealAim) * (kind === 'putt' ? 2 : 18) * 10) / 10;

  let grade: GolfGrade;
  let points: number;
  if (distFromPinM <= 3) {
    grade = 'birdie';
    points = 100;
  } else if (distFromPinM <= 8) {
    grade = 'great';
    points = 60;
  } else if (distFromPinM <= 15) {
    grade = 'solid';
    points = 30;
  } else {
    grade = 'rough';
    points = 10;
  }

  const power = evaluateBar(
    powerLocked,
    GOLF_POWER_SWEET,
    GOLF_POWER_INNER,
    GOLF_POWER_OUTER,
  );

  return {
    kind,
    club: SHOT_CLUB[kind],
    carryM,
    offlineM,
    distFromPinM,
    grade,
    points,
    power,
  };
}
