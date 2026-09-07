// ballRig (Babylon) — the ball lives in the hands. Ends the floor-ball and
// invisible-flight bugs. Eastbay path is keyed to timing.ts timestamps.

import { Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Skeleton, TransformNode } from '@babylonjs/core';
import { EASTBAY_TIMING as T } from './authored/timing';
import { boneNode, findBone } from './boneLookup';

// A+ P8 H4 (2026-09-07): the ball's centre in the ball hand's node frame. Measured on the live hero rig (probe: the forearm sits at
// (-0.197, 0.059, -0.116) in RightHand space, so the fingers run along (0.835, -0.25, 0.49) and the palm faces (0.47, -0.14, -0.87)).
// Before: (0, -0.07, 0.10) — 6.6 cm toward the fingers but 8 cm toward the BACK of the hand: the ball rode over the wrist, off
// the palm. After: 7.5 cm along the fingers + 13 cm out of the palm face (ball radius 0.12 + the hand's half thickness) —
// the ball sits in the palm with the fingers around it (closeups: scratchpad palm-*.png, six candidates, two angles).
const PALM_OFFSET = new Vector3(0.12, -0.04, -0.08);

function handNode(skeleton: Skeleton, hand: 'LeftHand' | 'RightHand'): TransformNode | null {
  return boneNode(skeleton, hand);
}

/** Parent the ball to a hand. Call on possession change. */
export function attachBallToHand(
  ball: AbstractMesh, skeleton: Skeleton, hand: 'LeftHand' | 'RightHand',
): boolean {
  const node = handNode(skeleton, hand);
  if (!node) { console.warn(`[FEL-BALL] no ${hand} bone`); return false; }
  ball.setParent(node);
  (ball.metadata ??= {}).felReleased = false;
  ball.position.copyFrom(PALM_OFFSET);
  ball.rotationQuaternion = null;
  return true;
}

/** Detach into world space keeping the world transform (flight/physics). */
export function releaseBall(ball: AbstractMesh): void {
  (ball.metadata ??= {}).felReleased = true;   // ballCarry: not ours to hand back
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
