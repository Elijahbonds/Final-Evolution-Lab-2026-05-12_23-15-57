// hoops-gather G4 (owner 2026-11-12, "good gathers and pick ups", "a euro step dunk"; docs/HOOPS-GATHER-ESCAPE-PLAN.md §5b): THE DUNK'S
// TAKE READS THE BOUNCE TOO. A drive's dunk parked the dribble at the take-off (`update(0, 0, false)`: the ball flown to the dribbling palm
// from wherever it was, at the gather's 8.1 m/s) and then passed it to the dunking hand (dunkHand.ts). Measured on the 3v3 speed set:
// 32-41 cm off the palm at the take-off, the yank G1 removed from every other squeeze. With this on, the dunk's take is the carry's
// pick-up: the ball keeps its bounce and meets the hand, taken by the DUNKING hand (both palms on it: the hand-off the pass made), at the
// latest by DUNK_TAKE_BY_SEC on the dunk's clock (the pass's own end). A ball the pick-up takes at once (near the top, in a hand
// already) goes exactly as before. Off (0): as before.
import type { AbstractMesh, Skeleton } from '@babylonjs/core';
import { feel } from '../../feel-panel/feel';
import type { BallCarry } from './ballCarry';
import { dunkHandPass, ballHandOf, DUNK_HAND, DUNK_PASS_AT, DUNK_PASS_BLEND } from './dunkHand';

/** The dunk's take reads the bounce (1) / parks the dribble and flies the ball to the palm (0, as before). Knob `hoops.dunkTakeReadOn`. */
export const DUNK_TAKE_READ_ON = 0;
/** The latest the dunk's take waits for the ball, on the dunk's clock (s): the end of the take-off's pass into the dunking hand. */
export const DUNK_TAKE_BY_SEC = DUNK_PASS_AT + DUNK_PASS_BLEND;

/** The ball into the dunking hand for a dunk starting now (replaces `carry.update(0, 0, false)` + `dunkHandPass`). Call the returned
 *  stepper every frame of the dunk with its clock in seconds, as dunkHandPass's. */
export function dunkTake(ball: AbstractMesh, skeleton: Skeleton, carry: Pick<BallCarry, 'pickUp' | 'settlePickUp' | 'pickingUp' | 'update'> | null | undefined): (tSec: number) => void {
  if (!carry || feel('hoops.dunkTakeReadOn', DUNK_TAKE_READ_ON) < 0.5) { carry?.update(0, 0, false); return dunkHandPass(ball, skeleton); }
  if (carry.pickUp() !== 'reading') return dunkHandPass(ball, skeleton);   // taken now: exactly the old park (the pick-up's own fallback)
  carry.pickUp(DUNK_HAND);   // waiting for the bounce: only the hand it goes to changes — the dunking hand comes to the ball's far side
  let pass: ((t: number) => void) | null = null, t0 = 0;
  return (t: number) => {
    if (carry.pickingUp) { if (t >= DUNK_TAKE_BY_SEC) carry.settlePickUp(); else return; }
    if (!pass) {   // taken: a ball that ended anywhere but the dunking hand is passed over (from now, on the pass's own clock)
      if (ballHandOf(ball) === DUNK_HAND || !ballHandOf(ball)) { pass = () => {}; return; }
      pass = dunkHandPass(ball, skeleton); t0 = t - DUNK_PASS_AT + DUNK_PASS_BLEND;
    }
    pass(t - t0);
  };
}
