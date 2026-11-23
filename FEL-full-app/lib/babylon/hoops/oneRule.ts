// lane/improve-hoops-2 phase 4 (docs/IMPROVE-10-PHASE-AUDIT.md, 2026-11-22): HOOPS RULES, ONE WAY IN BOTH MODES.
//
// (a) THE GHOST SHOT AFTER A MAKE (HOOPS-PLAY-AUDIT #6). After my 1v1 make the hero holds the ball under the rim through the 0.7 s banner
//     (make it, take it: `carrying` is true at the make, the check-up 0.7 s later) and a shot pressed then gathered and released, and
//     could not count — 10 of 31 makes on the rig. On: no gather, dunk, footwork or release starts in the make beat; the press is held
//     back until the check-up. Off (0) = the shot starts as before. Knob `hoops.makeBeatHoldsShot`.
// (d) A SHOT PRESSED MID-SPIN (#5). The two modes share the spin's machinery but the audit read them apart (1v1 waits the spin out, 533 ms;
//     3v3 17 ms). On: one rule in both — a shot pressed in the spin's first half waits for its half, and from the half on the shot cuts
//     the spin where the body is. Off (0) = as before (the press waits out the whole spin). The owner's feel call: ships OFF.
//     Knob `hoops.spinShotCutsHalf`.
// (c) the 3v3 drive-by's hand test lives with the strips (hoops/steals.ts driveByHandOk); (b) the chase round a body in hoops/boardChase.ts.
import { feel } from '../../feel-panel/feel';

/** 1 = no shot starts in the 1v1 make beat (default); 0 = as before. */
export const MAKE_BEAT_HOLDS_SHOT = 1;
export const makeBeatHoldsShot = (): boolean => feel('hoops.makeBeatHoldsShot', MAKE_BEAT_HOLDS_SHOT) >= 0.5;

/** 1 = a shot may cut the spin from its half, both modes; 0 = the press waits out the spin (default, the owner's feel call). */
export const SPIN_SHOT_CUTS_HALF = 0;
export const spinShotCutsHalf = (): boolean => feel('hoops.spinShotCutsHalf', SPIN_SHOT_CUTS_HALF) >= 0.5;
/** The share of the spin after which a shot may cut it. */
export const SPIN_CUT_AT = 0.5;
/** May a waiting shot press cut this spin now? Never a pivot (a turn in place that ends in a set: nothing to cut), never with the knob off. */
export function spinCutNow(t: number, sec: number, pressWaiting: boolean, pivot: boolean): boolean {
  return spinShotCutsHalf() && pressWaiting && !pivot && sec > 0 && t >= sec * SPIN_CUT_AT;
}
