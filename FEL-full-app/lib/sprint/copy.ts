// copy — what the camera sprint timer says (SPRINT-SPEED, 2026-10-25). Plain words; nothing claims accuracy.
//
// The owner's rule for the jump, applied here: no accuracy claim until a validation pilot against timing gates. So every
// number is called an estimate and carries its own ±, and the ± is said to be the read's own spread, not a validated
// accuracy. Pure.

export const ESTIMATE_LINE = 'Camera estimate. The ± is this read\'s own spread, not an accuracy: the camera timer has not yet been checked against timing gates.';
export const REACTION_LINE = 'Started on the phone\'s Go, so this time includes the athlete\'s reaction (gates started by the athlete\'s first movement do not).';
export const MOVEMENT_LINE = 'Started on the athlete\'s first movement, read by the camera.';
export const PRIVACY_LINE = 'The camera picture stays on this phone and is never saved or sent. Only the numbers are kept, on this phone.';
export const ADULTS_ONLY_LINE = 'Camera sprint timing is for verified adults (18 and over), like every camera test in the app. A coach can still hand-time you.';
export const AGILITY_BETA_LINE = 'Beta: the camera reads the turning foot at each line. If a foot is hidden at a turn, hand-time this one.';
export const FV_SLOPE_LINE = 'The force-velocity slope is the least repeatable number here: compare F0 and Pmax over time, not the slope.';

/** "4.82 s ± 0.03" — a time with its ± (2 SD, rounded up to the hundredth). */
export function timeWithBand(timeS: number, sdS: number | null): string {
  const pm = sdS === null ? null : Math.max(0.01, Math.ceil(2 * sdS * 100) / 100);
  return pm === null ? `${timeS.toFixed(2)} s` : `${timeS.toFixed(2)} s ± ${pm.toFixed(2)}`;
}

/** "9.4 m/s ± 0.2" */
export function speedWithBand(v: number, sd: number | null): string {
  const pm = sd === null ? null : Math.max(0.1, Math.ceil(2 * sd * 10) / 10);
  return pm === null ? `${v.toFixed(1)} m/s` : `${v.toFixed(1)} m/s ± ${pm.toFixed(1)}`;
}

/** m/s → mph, for the line under a top speed. */
export const mph = (mps: number): number => Math.round(mps * 2.236936 * 10) / 10;
