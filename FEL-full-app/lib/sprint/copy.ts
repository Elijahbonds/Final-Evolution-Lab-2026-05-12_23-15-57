// copy — what the camera sprint timer says (SPRINT-SPEED, 2026-10-25). Plain words; nothing claims accuracy.
//
// The owner's rule for the jump, applied here: no accuracy claim until a validation pilot against timing gates. So every
// number is called an estimate and carries its own ±, and the ± is said to be the read's own spread, not a validated
// accuracy. Pure.

export const ESTIMATE_LINE = 'Camera estimate. The ± is how much this read could vary. The camera timer has not been checked against timing gates yet.';
export const REACTION_LINE = 'Timed from the phone\'s Go, so it includes your reaction time. Gates that start on your first move do not.';
export const MOVEMENT_LINE = 'Started on the athlete\'s first movement, read by the camera.';
export const PRIVACY_LINE = 'The camera picture stays on this phone and is never saved or sent. Only the numbers are kept, on this phone.';
export const ADULTS_ONLY_LINE = 'Camera sprint timing is for verified adults (18 and over), like every camera test in the app. A coach can still hand-time you.';
export const AGILITY_BETA_LINE = 'Beta: the camera reads the turning foot at each line. If a foot is hidden at a turn, hand-time this one.';
export const FV_SLOPE_LINE = 'The balance number changes the most from run to run: compare your starting push and max power over time instead.';

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

/** CUE-REWRITE (2026-10-27): what a run's numbers mean, and the one thing to do next (the result shape). */
export const RESULT_MEANS = 'Your own number to beat. It is a camera estimate, so a small change may just be noise.';
export const RESULT_NEXT = 'Next: rest 2 to 3 minutes, run it again, and keep your best.';
