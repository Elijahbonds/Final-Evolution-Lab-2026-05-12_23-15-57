// hoops-play (owner 2026-11-21, "Gameplay could still be improved greatly"): THE 1V1 RIVAL GOES AND GETS A LOOSE BALL.
//
// 3v3 has sent every AI body after a live board since ONEVONE/3V3 phase 3 ("EVERY AI BODY GOES FOR IT. Without this the brains held their
// seals and crash lanes while the ball rolled away", ThreeVThreeMode liveBoard → DefenderBrain.chaseBall). 1v1 never got the rule: on MY
// miss the rival held his box-out seal while the ball rolled away, and on HIS miss he crashed at a walk (3 m/s, after his follow-through)
// toward a ball running off at 5–7 m/s. Measured on the rig (docs/HOOPS-PLAY-AUDIT.md): 4 of 16 1v1 boards were still loose when the
// mode's 4 s stall guard gave up on them ("nobody came down with it") and teleported both bodies to the check; the median miss → board
// was 2.3 s (3v3, where the AI chases: 0.8 s, no stall in 9). With this on, 1v1 runs 3v3's rule: while a board is live and the rival is
// on his feet, his brain's chase (which outranks the seal) takes him to the ball, on my possession and on his. Off = as before exactly.
import { feel } from '../../feel-panel/feel';

/** 1 = the 1v1 rival chases a live board (3v3's rule); 0 = his seal / his crash as before. Knob `hoops.rivalChaseBoardOn`. */
export const RIVAL_CHASE_BOARD_ON = 1;
export const rivalChaseBoardOn = (): boolean => feel('hoops.rivalChaseBoardOn', RIVAL_CHASE_BOARD_ON) >= 0.5;

interface Planar { x: number; z: number }
/** Where the rival's chase points this frame: the ball while a board is live and he can go (not floored, not stunned), else null (no chase:
 *  the brain's own job). Null whenever the knob is off. */
export function rivalChaseTarget<T extends Planar>(boardLive: boolean, able: boolean, ball: T): T | null {
  return rivalChaseBoardOn() && boardLive && able ? ball : null;
}
