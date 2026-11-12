// ballHandoff — THE BALL LEAVES FROM THE HAND (1v1 / 3v3 ten-phase pass, phase 5 "the ball lives in the hand").
//
// A 3v3 teammate's pass (the swing, the ball back to me, the alley-oop lob) started its flight at the passer's ROOT + 1.2 m — wherever
// the ball really was. The ball was released where his hand (or his dribble) had it and drawn on the next frame at his chest height
// over his feet: a one-frame jump out of the hand, the size of the gap between the two (the rig's release read, hoops-gap page.js
// `releaseWarps`). Now the flight starts where the ball IS (as drawn); its aim point is unchanged, so the pass arrives where and when it
// did, give or take the few centimetres the start moved.
//
// Knob `hoops.passFromHandOn` (1); 0 = the old start exactly (root + 1.2 m). Pure: the mode asks, PassFlight flies.
import { Vector3 } from '@babylonjs/core';
import type { AbstractMesh, TransformNode } from '@babylonjs/core';
import { feel } from '../../feel-panel/feel';

export const PASS_FROM_HAND_ON = 1;
/** The old start's height over the passer's root (m) — what a pass started from before this, and still does with the knob at 0. */
export const PASS_ROOT_HEIGHT_M = 1.2;
/** Further than this from the passer's root (m, planar) the ball is not his to throw from (a reset, a ball elsewhere): the old start. */
export const PASS_FROM_HAND_MAX_M = 1.3;

/** Where a teammate's pass flight starts (pure on its inputs): the ball as drawn, or the old root + 1.2 m. */
export function passStart(ballAt: { x: number; y: number; z: number } | null, root: { x: number; y: number; z: number }, on = feel('hoops.passFromHandOn', PASS_FROM_HAND_ON) >= 0.5): Vector3 {
  const old = new Vector3(root.x, root.y + PASS_ROOT_HEIGHT_M, root.z);
  if (!on || !ballAt || ![ballAt.x, ballAt.y, ballAt.z].every(Number.isFinite)) return old;
  if (Math.hypot(ballAt.x - root.x, ballAt.z - root.z) > PASS_FROM_HAND_MAX_M) return old;
  return new Vector3(ballAt.x, ballAt.y, ballAt.z);
}
/** passStart for a live ball and passer: the ball's world position read now (call it BEFORE releaseBall: the world transform is kept). */
export function passStartFor(ball: AbstractMesh, passerRoot: TransformNode): Vector3 {
  ball.computeWorldMatrix(true);
  return passStart(ball.getAbsolutePosition(), passerRoot.position);
}

/**
 * hoops-p05b: THE PASS ARRIVES IN THE HANDS (PassFlight.homeTo). Where a pass in flight lands: the receiver's catch point, live — his root
 * + PASS_ROOT_HEIGHT_M, the height the throw already aims at — or null (knob 0: the flight lands on its thrown aim, as it did). The lob
 * keeps its own aim (the alley-oop's timing is its read); the mode does not ask for it.
 * Knob `hoops.passHomeOn` (1); 0 = as it was.
 */
export const PASS_HOME_ON = 1;
export function passCatchPoint(receiverRoot: { x: number; y: number; z: number }, on = feel('hoops.passHomeOn', PASS_HOME_ON) >= 0.5): Vector3 | null {
  if (!on || ![receiverRoot.x, receiverRoot.y, receiverRoot.z].every(Number.isFinite)) return null;
  return new Vector3(receiverRoot.x, receiverRoot.y + PASS_ROOT_HEIGHT_M, receiverRoot.z);
}

