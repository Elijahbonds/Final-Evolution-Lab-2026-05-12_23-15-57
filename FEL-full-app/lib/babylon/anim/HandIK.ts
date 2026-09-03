// HandIK — the carrying arm reaches for the ball (Phase 2, owner decision:
// "code-driven + IK planting + hand IK for the ball"). Same node-space solver
// as the feet: shoulder and elbow receive rotations only, blended by weight so
// the clip's arm still reads when the hand is waiting for the ball.
import { Quaternion, Vector3 } from '@babylonjs/core';
import type { Skeleton, TransformNode } from '@babylonjs/core';
import { findBone } from './boneLookup';
import { localAfterWorldDelta, solveTwoBone } from './TwoBoneIK';

export interface ArmChain { shoulder: TransformNode; elbow: TransformNode; hand: TransformNode }

export function armChain(skeleton: Skeleton, side: 'Left' | 'Right'): ArmChain | null {
  const shoulder = findBone(skeleton, `${side}Arm`)?.getTransformNode() ?? null;
  const elbow = findBone(skeleton, `${side}ForeArm`)?.getTransformNode() ?? null;
  const hand = findBone(skeleton, `${side}Hand`)?.getTransformNode() ?? null;
  return shoulder && elbow && hand ? { shoulder, elbow, hand } : null;
}

function parentRot(n: TransformNode): Quaternion {
  const p = n.parent as TransformNode | null;
  return p && 'absoluteRotationQuaternion' in p ? p.absoluteRotationQuaternion.clone() : Quaternion.Identity();
}
function applyWorldDelta(n: TransformNode, delta: Quaternion, w: number): void {
  n.computeWorldMatrix(true);
  const local = localAfterWorldDelta(parentRot(n), n.absoluteRotationQuaternion.clone(), delta);
  const cur = n.rotationQuaternion ?? Quaternion.FromEulerVector(n.rotation);
  n.rotationQuaternion = w >= 1 ? local : Quaternion.Slerp(cur, local, w);
  n.computeWorldMatrix(true);
}

/** Reach the hand (wrist) toward `target` (world), elbow toward `pole`
 *  (world direction: for a dribble, outward and back). Returns the miss. */
export function reachArm(arm: ArmChain, target: Vector3, pole: Vector3, weight = 1): number {
  arm.shoulder.computeWorldMatrix(true); arm.elbow.computeWorldMatrix(true); arm.hand.computeWorldMatrix(true);
  const s = solveTwoBone({
    root: arm.shoulder.getAbsolutePosition().clone(),
    mid: arm.elbow.getAbsolutePosition().clone(),
    end: arm.hand.getAbsolutePosition().clone(),
    target: target.clone(),
    pole: pole.clone(),
  });
  applyWorldDelta(arm.elbow, s.mid, weight);
  applyWorldDelta(arm.shoulder, s.root, weight);
  arm.hand.computeWorldMatrix(true);
  return Vector3.Distance(arm.hand.getAbsolutePosition(), target);
}
