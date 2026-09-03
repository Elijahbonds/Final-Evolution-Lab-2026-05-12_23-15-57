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

export interface ApproachRead { difficulty: number; label: string; angleDeg: number; takeoff: Takeoff }

/** The difficulty the judges add for the approach, and the words for the bezel. */
export function approachBonus(angleRad: number, takeoff: Takeoff): ApproachRead {
  const a = Math.abs(angleRad);
  const angleDeg = Math.round((a * 180) / Math.PI);
  const angleBonus = Math.min(1, a / BASELINE_ANGLE) * 0.8;        // up to +0.8 at baseline or wider
  const footBonus = takeoff === 'one' ? 0.6 : 0;                    // a running one-foot is the harder, rarer jump
  const from = a >= BASELINE_ANGLE ? 'BASELINE' : a >= BASELINE_ANGLE * 0.45 ? 'WING' : 'HEAD-ON';
  return {
    difficulty: Math.round((angleBonus + footBonus) * 100) / 100,
    label: `${from} · ${takeoff === 'one' ? 'ONE-FOOT' : 'TWO-FOOT'}`,
    angleDeg, takeoff,
  };
}
