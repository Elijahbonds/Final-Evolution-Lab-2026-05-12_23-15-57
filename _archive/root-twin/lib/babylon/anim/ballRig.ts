// ballRig (Babylon) — the ball lives in the hands. Ends the floor-ball and
// invisible-flight bugs. Eastbay path is keyed to timing.ts timestamps.

import { Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Skeleton, TransformNode } from '@babylonjs/core';
import { EASTBAY_TIMING as T } from './authored/timing';

const PALM_OFFSET = new Vector3(0, -0.07, 0.1);

function handNode(skeleton: Skeleton, hand: 'LeftHand' | 'RightHand'): TransformNode | null {
  return skeleton.bones.find((b) => b.name === hand)?.getTransformNode() ?? null;
}

/** Parent the ball to a hand. Call on possession change. */
export function attachBallToHand(
  ball: AbstractMesh, skeleton: Skeleton, hand: 'LeftHand' | 'RightHand',
): boolean {
  const node = handNode(skeleton, hand);
  if (!node) { console.warn(`[FEL-BALL] no ${hand} bone`); return false; }
  ball.setParent(node);
  ball.position.copyFrom(PALM_OFFSET);
  ball.rotationQuaternion = null;
  return true;
}

/** Detach into world space keeping the world transform (flight/physics). */
export function releaseBall(ball: AbstractMesh): void {
  ball.setParent(null);   // Babylon setParent(null) preserves world transform
}

/** Eastbay hand-to-hand — call each frame with clip-local time (sec). */
export function runEastbayPath(
  ball: AbstractMesh, skeleton: Skeleton, t: number, state: { inLeftHand: boolean },
): void {
  if (t < T.handOff && state.inLeftHand) {
    attachBallToHand(ball, skeleton, 'RightHand'); state.inLeftHand = false;
  } else if (t >= T.handOff && !state.inLeftHand) {
    attachBallToHand(ball, skeleton, 'LeftHand'); state.inLeftHand = true;
  }
  // ball leads the receiving hand slightly around the pass moment
  const nearPass = Math.max(0, 1 - Math.abs(t - T.handOff) / 0.12);
  ball.position.copyFrom(PALM_OFFSET);
  ball.position.addInPlace(new Vector3(0, -0.05 * nearPass, 0.05 * nearPass));
}

/** Flush through the rim on a make. Call per frame; true when finished. */
export function flushThroughRim(
  ball: AbstractMesh, rimCenter: Vector3, releasePos: Vector3, sinceReleaseSec: number,
): boolean {
  const DUR = 0.22;
  const k = Math.min(1, sinceReleaseSec / DUR);
  const ease = 1 - (1 - k) * (1 - k);
  Vector3.LerpToRef(releasePos, rimCenter, ease, ball.position);
  if (k >= 1) {
    ball.position.y = rimCenter.y - (sinceReleaseSec - DUR) * 2.4;  // through the net
    return sinceReleaseSec > DUR + 0.25;
  }
  return false;
}

/** Miss: visible clank off the rim — never a silent disappear. */
export function clankOffRim(ball: AbstractMesh, rimCenter: Vector3): Vector3 {
  const away = ball.position.subtract(rimCenter); away.y = 0; away.normalize();
  return new Vector3(away.x * 3.2, 2.6, away.z * 3.2);  // caller integrates gravity
}
