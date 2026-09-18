// mocapClip — build a Babylon clip on the LIVE skeleton from a segmented,
// retargeted DeepMotion take (scripts/mocap/retarget.mts → public/models/clips/mocap/*.json).
// Gate 0 applies: the hero rig is the 22-bone unprefixed FEL spec; the JSON's
// bone names are the same names (Mixamo prefix stripped at retarget time).
// Assumption (to be measured by the rig test): the take's LOCAL rotations can
// be applied to the hero's bones directly because both rigs descend from the
// Mixamo rest orientation. Root translation is not carried — movement is code-driven.
import { Quaternion } from '@babylonjs/core';
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { buildQuatClip, type QuatKeys } from './restPose';
import { buildPoseClip, type PoseKey } from './poseClip';

export interface MocapClipJson { name: string; source: string; segment: [number, number]; duration: number; tracks: Record<string, [number, number, number, number, number][]>; poseKeys?: PoseKey[] }

/** Pose keys (wrists and ankles as hips-relative targets, from the take's forward
 *  kinematics) play on any body; the raw local rotations only on a rig with the
 *  take's bind frames. Prefer the pose keys when the retarget wrote them. */
export function buildMocapClip(scene: Scene, sk: Skeleton, json: MocapClipJson, name = json.name): AnimationGroup | null {
  if (json.poseKeys?.length) return buildPoseClip(scene, sk, name, json.duration, json.poseKeys);
  const keys: QuatKeys = {};
  for (const [bone, ks] of Object.entries(json.tracks)) {
    keys[bone] = ks.map(([t, x, y, z, w]) => [t, new Quaternion(x, y, z, w)] as [number, Quaternion]);
  }
  return buildQuatClip(scene, sk, name, json.duration, keys);
}
