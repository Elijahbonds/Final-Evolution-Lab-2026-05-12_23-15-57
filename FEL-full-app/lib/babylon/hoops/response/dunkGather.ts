// hoops-gather (owner 2026-11-17: "drive dunk — gather, then go up"): THE DRIVE DUNK GATHERS FIRST. A sprint squeeze in range took off
// on the press: the dribble parked at the take-off and the ball flown to the palm at the gather's 8.1 m/s (measured on the 3v3 speed set:
// 32-41 cm off the palm), then passed to the dunking hand. Reading the bounce DURING the take-off made it worse (G4: the body left the
// floor while the ball was still on its bounce). So the order changes: the press is the gather — the last dribble meets the hands (the
// carry's pick-up, ballCarry.pickUp, as every other squeeze) — and the plant and the take-off come when the ball is in them, at the
// latest DUNK_GATHER_MAX_SEC after the press. A ball the pick-up takes at once (near the top) goes up at once, as before.
// Pure, for the modes and the test.
import { feel } from '../../../feel-panel/feel';

/** The drive dunk gathers, then goes up (1) / takes off on the press (0, as before). Knob `hoops.dunkGatherOn`. */
export const DUNK_GATHER_ON = 1;
/** The longest the take-off waits for the gather (s): the pick-up's own wait and overrun (0.2 + 0.1). Knob `hoops.dunkGatherMaxSec`. */
export const DUNK_GATHER_MAX_SEC = 0.3;
export const dunkGatherOn = (): boolean => feel('hoops.dunkGatherOn', DUNK_GATHER_ON) >= 0.5;
/** Go up now? The gather is in (the pick-up no longer waiting) or it has waited its longest. */
export function dunkGatherDone(pickingUp: boolean, waitedSec: number): boolean {
  return !pickingUp || waitedSec >= feel('hoops.dunkGatherMaxSec', DUNK_GATHER_MAX_SEC);
}
