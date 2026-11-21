// hoops-gather (owner 2026-11-12, "good gathers"; docs/HOOPS-GATHER-ESCAPE-PLAN.md G2 (d), "the pump into the step-through"):
// THE PUMP KEEPS THE BALL. The pump fake says "the ball goes back to the chest" (HoopsMoves M8), but it ends the shot (`shooting` off),
// and the carries loop restarts the dribble on the next frame from wherever the ball is. Measured (the gather probe, with the press
// buffer fixed so the pump shows: 1v1 and 3v3): the ball left the hand 2 frames after the pump and fell 0.5-0.6 m loose while the pump
// clip played, and the step-through then picked it up off that bounce. With this on, the dribble stays parked while the pump clip plays:
// the ball stays in the hands as drawn, and the step-through (a squeeze in its window) takes it from there. After the clip the dribble
// comes back as before (assumption: the game lets a pump be followed by a dribble; whether a pump should end the dribble is the owner's).
// Pure, for the modes and the test.
import { feel } from '../../../feel-panel/feel';

/** The pump holds the ball while its clip plays (1) / the dribble restarts the frame after the pump (0, as before). Knob
 *  `hoops.pumpBallHandOn`. */
export const PUMP_BALL_HAND_ON = 1;

/** hoops-gather (owner 2026-11-17: "a pump fake ends the dribble, like real basketball"): after a pump the dribble is DEAD — the ball
 *  stays in the hands and the feet are set until the shot, the pass or the step-through (1) / the dribble comes back when the pump clip
 *  ends (0: phase 3's assumption, #601). Knob `hoops.pumpEndsDribbleOn`. */
export const PUMP_ENDS_DRIBBLE_ON = 1;
export const pumpEndsDribbleOn = (): boolean => feel('hoops.pumpEndsDribbleOn', PUMP_ENDS_DRIBBLE_ON) >= 0.5;

/** How long the pump holds the ball (s): the pump clip's own length, 0 with the knob off or no clip. Read once, at the pump. */
export function pumpHoldSec(clipSec: number | null | undefined): number {
  if (feel('hoops.pumpBallHandOn', PUMP_BALL_HAND_ON) < 0.5) return 0;
  return clipSec != null && Number.isFinite(clipSec) && clipSec > 0 ? clipSec : 0;
}

/** Is the pump still holding the ball? `pumpWindow` is the step-through window left (it counts down from `windowSec` at the pump, and
 *  every reset puts it to 0, which ends the hold with it). */
export function pumpHolding(pumpWindow: number, holdSec: number, windowSec: number): boolean {
  return holdSec > 0 && pumpWindow > 0 && pumpWindow > windowSec - holdSec;
}
