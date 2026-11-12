// poseGuard — T-POSE (owner playtest, 2026-10-27): "the avatar wasn't performing the exercise properly, it was a T-pose."
//
// A body every demo surface shows is a kit or scan GLB whose BIND pose is the T-pose (arms straight out). A demo that
// shows it has failed: the clip did not bind, did not build, or nothing is driving the bones. This measures it on the
// live skeleton instead of trusting that a play() call worked: how far the limbs and trunk are from their bind rotations.
// Every authored loop and idle moves them well away (the rest pose alone drops the arms ~80°); a body at its bind pose
// reads ~0°. The library stage (components/library/exercise-stage.tsx) checks it before it fades the 3D in and after
// every clip change, and shows the cue card instead of a T-pose; the guard test (poseGuard.test.ts) holds every loop a
// demo surface can play, on every body a player can wear, to it.
import { Quaternion, type Skeleton } from '@babylonjs/core';
import { findBone } from '../anim/boneLookup';

/** The bones a T-pose gives away: the arms out, the legs and trunk at bind. */
export const POSE_GUARD_BONES = ['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'Spine', 'Hips'] as const;
/** At or under this (degrees, the largest bone's turn from bind), the body is in its bind pose. */
export const BIND_POSE_DEG = 4;

const angleDeg = (a: Quaternion, b: Quaternion): number => {
  const d = Math.min(1, Math.abs(Quaternion.Dot(a, b)));
  return (2 * Math.acos(d) * 180) / Math.PI;
};

/** The largest turn (degrees) of any guard bone from its bind rotation, on the live skeleton; null if none is found. */
export function bindPoseDeviationDeg(skeleton: Skeleton): number | null {
  let worst: number | null = null;
  for (const name of POSE_GUARD_BONES) {
    const bone = findBone(skeleton, name);
    const node = bone?.getTransformNode();
    if (!bone || !node) continue;
    const bind = new Quaternion();
    bone.getBindMatrix().decompose(undefined, bind);
    const now = node.rotationQuaternion ?? Quaternion.FromEulerVector(node.rotation);
    const d = angleDeg(bind, now);
    worst = worst == null ? d : Math.max(worst, d);
  }
  return worst;
}

/** Is the body standing in its bind (T-) pose? */
export const atBindPose = (skeleton: Skeleton): boolean => { const d = bindPoseDeviationDeg(skeleton); return d != null && d <= BIND_POSE_DEG; };
