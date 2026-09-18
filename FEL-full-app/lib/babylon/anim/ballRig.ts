// ballRig (Babylon) — the ball lives in the hands. Ends the floor-ball and
// invisible-flight bugs. Eastbay path is keyed to timing.ts timestamps.

import { Matrix, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Skeleton, TransformNode } from '@babylonjs/core';
import { EASTBAY_TIMING as T } from './authored/timing';
import { boneNode, findBone } from './boneLookup';

// A+ P8 H4 (2026-09-07): the ball's centre in the ball hand's node frame. Measured on the live hero rig (probe: the forearm sits at
// (-0.197, 0.059, -0.116) in RightHand space, so the fingers run along (0.835, -0.25, 0.49) and the palm faces (0.47, -0.14, -0.87)).
// Before: (0, -0.07, 0.10) — 6.6 cm toward the fingers but 8 cm toward the BACK of the hand: the ball rode over the wrist, off
// the palm. After: 7.5 cm along the fingers + 13 cm out of the palm face (ball radius 0.12 + the hand's half thickness) —
// the ball sits in the palm with the fingers around it (closeups: scratchpad palm-*.png, six candidates, two angles).
const PALM_OFFSET = new Vector3(0.12, -0.04, -0.08);
/** The palm offset for callers that settle a caught ball into the hand (read-only: copy it). */
export const PALM_OFFSET_READONLY: Readonly<Vector3> = PALM_OFFSET;
// DUNK-BALL-ARMS-RIM (2026-09-14): PALM_OFFSET was measured on the RIGHT hand. The live rig's LeftHand frame is the right's
// mirror across its local x (forearm at (+0.215, 0.049, −0.083) in LeftHand space vs (−0.197, 0.059, −0.116) in RightHand
// space), so the same offset put a left-hand ball 13 cm BACK toward the forearm — its centre 4.5–7.7 cm from the wrist line,
// the ball through the wrist for the whole eastbay carry (45–49 frames measured). A ball opts in with `metadata.felPalmMirrorLeft`
// (the dunk's does); other modes keep their tuned left-hand carries until they are re-eyed.
const PALM_OFFSET_LEFT = new Vector3(-PALM_OFFSET.x, PALM_OFFSET.y, PALM_OFFSET.z);
/** The ball's centre in `hand`'s frame for this ball (the mirrored left palm when the ball opted in). */
export function palmOffsetOf(ball: AbstractMesh, hand: 'LeftHand' | 'RightHand' | string): Readonly<Vector3> {
  return ball.metadata?.felPalmMirrorLeft && /Left/.test(hand) ? PALM_OFFSET_LEFT : PALM_OFFSET;
}

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
  ball.position.copyFrom(palmOffsetOf(ball, hand));
  ball.rotationQuaternion = null;
  return true;
}

/** Detach into world space keeping the world transform (flight/physics). */
export function releaseBall(ball: AbstractMesh): void {
  (ball.metadata ??= {}).felReleased = true;   // ballCarry: not ours to hand back
  ball.setParent(null);   // Babylon setParent(null) preserves world transform
}

/** A hand-to-hand transfer keyed to a clip: which hand gives, which takes, on which clip second. */
export interface HandOffSpec { at: number; from: 'LeftHand' | 'RightHand'; to: 'LeftHand' | 'RightHand'; blend?: number }
/** The clip seconds either side of the transfer over which the ball travels palm to palm. */
export const HAND_OFF_BLEND = 0.08;

/** How far along the transfer the ball is: 0 in the giving hand, 1 in the receiving hand, smooth across the blend. The
 *  mode's wrist reach (HandIK) crossfades between the arms on the same curve — an arm swap on one frame moved both
 *  hands 0.66 m (measured) and threw the ball with them. */
export function handOffK(t: number, spec: HandOffSpec): number {
  const b = spec.blend ?? HAND_OFF_BLEND;
  const k0 = Math.min(1, Math.max(0, (t - (spec.at - b)) / (2 * b)));
  return k0 * k0 * (3 - 2 * k0);
}

const _palmA = new Vector3(), _palmB = new Vector3(), _inv = Matrix.Identity();
/** Where a hand's palm is in world space this frame. */
function palmWorld(node: TransformNode, offset: Readonly<Vector3>, out: Vector3): Vector3 {
  node.computeWorldMatrix(true);
  return Vector3.TransformCoordinatesToRef(offset, node.getWorldMatrix(), out);
}

/** A hand-off, per frame with clip-local time (DUNK-CONTROL-JUICE, 2026-09-08). The ball used to re-parent on the
 *  transfer frame with no travel: whatever gap the clip left between the palms on that frame was a POP (measured 0.3 m on
 *  the eastbay's under-the-leg pass). Now the ball is parented to the RECEIVING hand from `at − blend` and its local
 *  position is solved so its WORLD position eases from the giving palm to the receiving palm across the blend — the
 *  transfer reads on camera as a palm-to-palm pass, and the ball never floats: outside the blend it sits in a palm.
 *  Returns true on the frame the parent swaps (the mode marks it). */
export function runHandOffPath(
  ball: AbstractMesh, skeleton: Skeleton, t: number, spec: HandOffSpec, state: { inLeftHand: boolean },
): boolean {
  const blend = spec.blend ?? HAND_OFF_BLEND;
  const toLeft = spec.to === 'LeftHand';
  const giveNode = handNode(skeleton, spec.from), takeNode = handNode(skeleton, spec.to);
  if (!giveNode || !takeNode) return false;
  let swapped = false;
  if (t < spec.at - blend) {
    if (state.inLeftHand !== (spec.from === 'LeftHand') || ball.parent !== giveNode) { attachBallToHand(ball, skeleton, spec.from); state.inLeftHand = spec.from === 'LeftHand'; }
    return false;
  }
  if (state.inLeftHand !== toLeft || ball.parent !== takeNode) { attachBallToHand(ball, skeleton, spec.to); state.inLeftHand = toLeft; swapped = true; }
  if (t >= spec.at + blend) { ball.position.copyFrom(palmOffsetOf(ball, spec.to)); return swapped; }
  // inside the blend: world ease from the giving palm to the receiving palm, expressed in the receiving hand's frame
  const k0 = (t - (spec.at - blend)) / (2 * blend), k = k0 * k0 * (3 - 2 * k0);
  palmWorld(giveNode, palmOffsetOf(ball, spec.from), _palmA); palmWorld(takeNode, palmOffsetOf(ball, spec.to), _palmB);
  Vector3.LerpToRef(_palmA, _palmB, k, _palmA);
  takeNode.getWorldMatrix().invertToRef(_inv);
  Vector3.TransformCoordinatesToRef(_palmA, _inv, ball.position);
  return swapped;
}

/** Eastbay hand-to-hand — call each frame with clip-local time (sec). The right hand carries the ball under the knee,
 *  the left takes it beneath the thigh on T.handOff and carries it up (the palm-to-palm blend is runHandOffPath's). */
export function runEastbayPath(
  ball: AbstractMesh, skeleton: Skeleton, t: number, state: { inLeftHand: boolean },
): boolean {
  return runHandOffPath(ball, skeleton, t, { at: T.handOff, from: 'RightHand', to: 'LeftHand' }, state);
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
