// DunkApproach — the free-approach flight (owner decision 2026-09-03). The
// real contest judges HOW a dunker arrived: from the baseline or the wing,
// off one foot at speed or off two from a gather. Pure so it is unit-tested
// and shared by the mode and its headless checks.

export type Takeoff = 'one' | 'two';

/** One-foot takeoffs come from a running approach; below this peak speed the
 *  dunker gathers and jumps off two. m/s; the mode's max run is ~7. */
export const ONE_FOOT_MIN_SPEED = 4.5;
/** Angle (radians from head-on) at which the approach reads as "baseline". */
export const BASELINE_ANGLE = 0.5;   // ~29°

export function approachAngle(playerX: number, playerZ: number, rimX: number, rimZ: number): number {
  return Math.atan2(playerX - rimX, rimZ - playerZ);
}

export function takeoffFor(runUpPeak: number): Takeoff {
  return runUpPeak >= ONE_FOOT_MIN_SPEED ? 'one' : 'two';
}

// ── HOW FAR OUT HE LEFT THE FLOOR (2026-09-14) ──────────────────────────────
//
// The approach judged two things: the ANGLE it came from and whether it was off one foot or two. Distance
// was not an input anywhere in the mode, which means jumping from under the rim and jumping from the
// charity stripe produced exactly the same base difficulty — and the most iconic moment the event has,
// the free-throw-line dunk, was worth nothing the judges could see.
//
// THE RISK IS ALREADY BUILT AND COSTS NOTHING TO ADD. Leaving the floor further out does not make the rim
// easier to reach; the flight is real, so a takeoff the run-up cannot carry simply clanks. That means the
// bonus can keep climbing past the stripe without a balance problem: the physics is the cap. This is why
// it is a scoring input rather than a new mechanic.

/** Under this there was no approach to judge — it is a standing dunk. Metres, rim centre to the feet. */
export const STANDING_M = 1.6;
/**
 * Rim centre to the stripe, real geometry (15 ft to the backboard, less the 15.25 in overhang).
 *
 * THE LINE IS ALREADY ON THE FLOOR. A painted stripe mesh was built for this and then removed: the hoops
 * court art already draws a real free-throw line and circle, and the measured position of this constant
 * lands within ~0.4 m of it — they are the same line. Drawing a second one would have been three meshes
 * and a material for nothing, plus a z-fighting risk against the texture. Check what the venue already
 * paints before painting it again; that is the art-side version of grepping for a consumer.
 */
export const FREE_THROW_M = 4.19;
/** Difficulty at the stripe. Larger than the angle (0.8) and the one-foot (0.6) because it is harder than both. */
export const MAX_RANGE_BONUS = 1.6;
/** Past the stripe it keeps paying, but slowly, and it stops — the iron is the real limiter. */
export const BEYOND_RATE = 0.3, BEYOND_CAP = 0.4;

/** The judges' word for where the feet left the floor. */
export function rangeLabel(distM: number): string {
  if (distM >= FREE_THROW_M) return 'FROM THE STRIPE';
  if (distM >= 3.2) return 'FROM THE ELBOW';
  if (distM >= STANDING_M) return 'IN THE PAINT';
  return 'UNDER THE RIM';
}

/** Difficulty added for taking off from `distM` out. 0 under the rim, MAX_RANGE_BONUS at the stripe. */
export function rangeBonus(distM: number): number {
  if (!Number.isFinite(distM) || distM <= STANDING_M) return 0;
  const span = Math.max(0.1, FREE_THROW_M - STANDING_M);
  const ramp = Math.min(1, (distM - STANDING_M) / span) * MAX_RANGE_BONUS;
  const beyond = Math.min(BEYOND_CAP, Math.max(0, distM - FREE_THROW_M) * BEYOND_RATE);
  return ramp + beyond;
}

export interface ApproachRead {
  difficulty: number;
  label: string;
  angleDeg: number;
  takeoff: Takeoff;
  /** Metres from the rim at the takeoff — surfaced so the bezel can show the number, not just the word. */
  rangeM: number;
}

/**
 * The difficulty the judges add for the approach, and the words for the bezel.
 *
 * `distM` is optional so every existing caller and test keeps its exact meaning: omitted, it reads as a
 * standing dunk and contributes nothing, which is what the two-argument behaviour already was.
 */
export function approachBonus(angleRad: number, takeoff: Takeoff, distM = 0): ApproachRead {
  const a = Math.abs(angleRad);
  const angleDeg = Math.round((a * 180) / Math.PI);
  const angleBonus = Math.min(1, a / BASELINE_ANGLE) * 0.8;        // up to +0.8 at baseline or wider
  const footBonus = takeoff === 'one' ? 0.6 : 0;                    // a running one-foot is the harder, rarer jump
  const from = a >= BASELINE_ANGLE ? 'BASELINE' : a >= BASELINE_ANGLE * 0.45 ? 'WING' : 'HEAD-ON';
  const range = rangeBonus(distM);
  // the range only gets its own words when there is something to say about it: a dunk from under the rim
  // should read "BASELINE · ONE-FOOT", not "BASELINE · ONE-FOOT · UNDER THE RIM".
  const rangeWords = range > 0 ? ` · ${rangeLabel(distM)}` : '';
  return {
    difficulty: Math.round((angleBonus + footBonus + range) * 100) / 100,
    label: `${from} · ${takeoff === 'one' ? 'ONE-FOOT' : 'TWO-FOOT'}${rangeWords}`,
    angleDeg, takeoff,
    // Number.isFinite first, not Math.max: `Math.max(0, NaN)` is NaN, so a bad distance would have been
    // rounded into NaN and printed on the bezel.
    rangeM: Number.isFinite(distM) ? Math.round(Math.max(0, distM) * 100) / 100 : 0,
  };
}
