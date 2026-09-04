// HandIK — the carrying arm reaches for the ball (Phase 2, owner decision:
// "code-driven + IK planting + hand IK for the ball"). Same node-space solver
// as the feet: shoulder and elbow receive rotations only, blended by weight so
// the clip's arm still reads when the hand is waiting for the ball.
import type { Vector3 } from '@babylonjs/core';
import type { Skeleton, TransformNode } from '@babylonjs/core';
import { findBone } from './boneLookup';
import { solveChainInFrame } from './TwoBoneIK';

export interface ArmChain { shoulder: TransformNode; elbow: TransformNode; hand: TransformNode }

export function armChain(skeleton: Skeleton, side: 'Left' | 'Right'): ArmChain | null {
  const shoulder = findBone(skeleton, `${side}Arm`)?.getTransformNode() ?? null;
  const elbow = findBone(skeleton, `${side}ForeArm`)?.getTransformNode() ?? null;
  const hand = findBone(skeleton, `${side}Hand`)?.getTransformNode() ?? null;
  return shoulder && elbow && hand ? { shoulder, elbow, hand } : null;
}

/** Reach the hand (wrist) toward `target` (world), elbow toward `pole`
 *  (world direction: for a dribble, outward and back). Returns the miss. */
export function reachArm(arm: ArmChain, target: Vector3, pole: Vector3, weight = 1): number {
  // solved in the rig's own frame — see TwoBoneIK.solveChainInFrame (handedness)
  return solveChainInFrame(arm.shoulder, arm.elbow, arm.hand, target, pole, weight).miss;
}
