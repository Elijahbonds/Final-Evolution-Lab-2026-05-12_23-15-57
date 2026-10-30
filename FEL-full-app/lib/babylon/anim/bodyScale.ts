// COACH-SCALE-191 (2026-10-29): one body scale, read off the loaded rig. The 1.91 m coach is 3D Art's prep2 body with a uniform
// root scale (s = 1.106631 on `Human.rig`). Clips are authored against the forge hero by joint heights (poseClip REF_HIP_JOINT_Y),
// and buildPoseClip already sized every hand and foot target by this ratio; this module names it once so everything reads one value.
// Behind `anim.bodyScale` (default OFF): off, every clip builds exactly as before.
import { Vector3 } from '@babylonjs/core';
import type { Skeleton, TransformNode } from '@babylonjs/core';
import { feel } from '../../feel-panel/feel';

/** `anim.bodyScale` default: off. */
export const ANIM_BODY_SCALE_ON = 0;
/** The forge hero's hip JOINTS (mean UpLeg height) at bind — poseClip's REF_HIP_JOINT_Y, repeated here so this module has no cycle. */
const REF_HIP_JOINT_Y = 0.91;
/** The forge hero's Hips height — poseClip's REF_HIPS_Y. */
const REF_HIPS_Y = 0.96;

export function bodyScaleOn(): boolean {
  return feel('anim.bodyScale', ANIM_BODY_SCALE_ON) >= 0.5;
}

/**
 * The body's size against the forge hero: (mean UpLeg height − root height) / 0.91, else Hips height / 0.96 — the math
 * buildPoseClip has always used (EVERYONE-BODY-MOCAP-OPPONENTS), now one function. Read it at BIND: a posed rig reads short.
 */
export function bodyScaleOf(sk: Skeleton, root?: TransformNode | null): number {
  const nodes = new Map<string, TransformNode>();
  for (const b of sk.bones) { const n = b.getTransformNode(); if (n) nodes.set(b.name.replace(/^mixamorig:?/, ''), n); }
  const hips = nodes.get('Hips');
  const rootY = root ? root.getAbsolutePosition().y : 0;
  const upLegs = ['LeftUpLeg', 'RightUpLeg'].map((n) => nodes.get(n)).filter((n): n is TransformNode => !!n);
  return upLegs.length
    ? (upLegs.reduce((a, n) => a + n.getAbsolutePosition().y, 0) / upLegs.length - rootY) / REF_HIP_JOINT_Y || 1
    : hips ? (hips.getAbsolutePosition().y - rootY) / REF_HIPS_Y || 1 : 1;
}

/**
 * The world length of one local metre UP in a node's frame (1 when absent). The Hips position key is written in the Hips' PARENT
 * frame; under the 1.91 coach's scaled root that frame is 1.1066× world, so a key already in this body's world metres (key × scale)
 * rendered ×1.1066 again — measured: world hips drop = 1.1066 × the local key on every crouched capture (BS-2).
 */
export function worldUpScaleOf(node: TransformNode | null | undefined): number {
  if (!node) return 1;
  node.computeWorldMatrix(true);
  const len = Vector3.TransformNormal(Vector3.Up(), node.getWorldMatrix()).length();
  return len > 1e-6 ? len : 1;
}
