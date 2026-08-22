// restPoseApply — finishes the E25 fix that M64 started.
//
// WHAT THE LIVE PLAYTEST FOUND (this build, clicked through the start gate)
// M64's solver IS working. The console proves it on every spawn:
//     [FEL-ANIM] restPose solved for 4 bone(s): LeftArm, RightArm,
//                LeftForeArm, RightForeArm
// And yet the 1v1 screenshot shows the near character with arms hanging
// correctly at its sides while the far character is in the arms-out bind
// pose — same scene, same frame, same rig.
//
// THE REASON: M64 bakes the solved pose into the AUTHORED `idle_stand`
// CLIP. That fixes any character playing `idle_stand`. It does nothing for a
// character that is in some other state — a defender holding position, an
// AI between behaviours, anyone playing a clip that does not key the arms.
// Babylon leaves an un-keyed bone wherever it last was, and at spawn that is
// the bind pose: arms straight out.
//
// So the fix belongs on the SKELETON, not in one clip. Apply the solved
// quaternions to the bone nodes themselves and they become the resting
// state for every character in every state. Clips that DO key the arms still
// override them, exactly as they should — this only changes what happens
// when nothing is driving the arms, which today is the bind pose and should
// never have been.

import type { Quaternion, Skeleton, TransformNode } from '@babylonjs/core';
import type { RestPose } from './restPose';

function nodeOf(skeleton: Skeleton, boneName: string): TransformNode | null {
  return skeleton.bones.find((b) => b.name === boneName)?.getTransformNode() ?? null;
}

export interface RestPoseHandle {
  /** Re-assert the rest pose — call after a clip that keyed the arms ends. */
  reapply(): void;
  /** Bone names actually written. */
  applied: string[];
}

/**
 * Write a solved rest pose onto the live skeleton so it is the DEFAULT for
 * every character, not a property of one clip.
 *
 * Returns a handle whose `reapply()` re-asserts the pose; a mode that stops
 * an arm-keying clip and returns to a neutral state should call it.
 */
export function applyRestPoseToSkeleton(skeleton: Skeleton, pose: RestPose): RestPoseHandle {
  const writes: [TransformNode, Quaternion][] = [];

  for (const [boneName, q] of pose) {
    const node = nodeOf(skeleton, boneName);
    if (!node) {
      console.warn(`[FEL-ANIM] restPoseApply: bone "${boneName}" not on this rig — skipped. `
        + 'Names are UNPREFIXED (see AvatarSkeletonSpec.md).');
      continue;
    }
    writes.push([node, q]);
  }

  const write = () => {
    for (const [node, q] of writes) {
      // rotationQuaternion and rotation are mutually exclusive in Babylon —
      // assigning the quaternion is what makes the node ignore `rotation`.
      node.rotationQuaternion = q.clone();
    }
    // Push the change through to the skinning matrices immediately, so the
    // very first rendered frame already shows the corrected pose rather than
    // one frame of T-pose flicker at spawn.
    try { skeleton.computeAbsoluteMatrices(true); } catch { /* older Babylon: next frame picks it up */ }
  };

  write();
  const applied = writes.map(([n]) => n.name);
  console.info(`[FEL-ANIM] restPose applied to skeleton for ${applied.length} bone(s): ${applied.join(', ')}`);
  return { reapply: write, applied };
}

// WIRING — CharacterLibrary.spawn(), immediately after the pose is solved
// and BEFORE the first clip starts, so it covers every spawn path (hero, AI
// teammate, AI defender, crowd) rather than only the one that plays
// `idle_stand`:
//
//   import { solveArmsDown } from './restPose';
//   import { applyRestPoseToSkeleton } from './restPoseApply';
//
//   const pose = solveArmsDown(skeleton);
//   applyRestPoseToSkeleton(skeleton, pose);   // ← the new line
//
// M64's locomotion.ts keeps using the same `pose` for `idle_stand`; nothing
// there changes. This only adds a floor under every other state.
