// clipBuilder — turns compact keyframe data into a Babylon AnimationGroup
// targeting the skeleton's linked TransformNodes. Because targets come from the
// LIVE skeleton, bone-name mismatch is impossible.

import {
  Animation, AnimationGroup, Quaternion, Vector3,
} from '@babylonjs/core';
import type { Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { boneNode } from './boneLookup';

const FPS = 30;
const D2R = Math.PI / 180;

/** [timeSec, xDeg, yDeg, zDeg] rotation keys per bone name. */
export type BoneKeys = Record<string, [number, number, number, number][]>;
/** Optional Hips Y offset keys: [timeSec, yMeters]. */
export type HipsYKeys = [number, number][];

/**
 * Resolve a clip's bone name to its transform node.
 *
 * This file used to carry its OWN copy of the name normalisation, and that copy
 * is the whole reason boneLookup exists — which makes it the one place that
 * most needed to use it. boneLookup's header says "everything that resolves a
 * bone goes through here now... it cannot drift back". A private duplicate here
 * is exactly how it drifted back.
 *
 * The cost was the GLB character path. Babylon's instantiation uniquifies every
 * cloned node, so an imported skeleton's bones arrive as `LeftArm_c21`. The
 * local copy stripped the `mixamorig:` prefix but knew nothing about that
 * suffix, so every authored clip built ZERO targets against a GLB rig. It never
 * threw: the group registered, played, and moved nothing, leaving the character
 * in its bind pose. That T-pose is what "the Meshy GLB is visually broken" has
 * meant all along — not broken geometry, a name mismatch — and it is why the
 * whole game fell back to primitive procedural characters.
 */
function nodeOf(skeleton: Skeleton, boneName: string): TransformNode | null {
  return boneNode(skeleton, boneName);
}

export function buildClip(
  scene: Scene,
  skeleton: Skeleton,
  name: string,
  durationSec: number,
  bones: BoneKeys,
  hipsY?: HipsYKeys,
): AnimationGroup | null {
  const group = new AnimationGroup(name, scene);
  let added = 0;

  for (const [boneName, keys] of Object.entries(bones)) {
    const node = nodeOf(skeleton, boneName);
    if (!node) {
      console.warn(`[FEL-ANIM] buildClip(${name}): bone "${boneName}" not in skeleton`);
      continue;
    }
    const anim = new Animation(
      `${name}.${boneName}.rotq`, 'rotationQuaternion', FPS,
      Animation.ANIMATIONTYPE_QUATERNION, Animation.ANIMATIONLOOPMODE_CYCLE,
    );
    anim.setKeys(keys.map(([t, x, y, z]) => ({
      frame: t * FPS,
      value: Quaternion.FromEulerAngles(x * D2R, y * D2R, z * D2R),
    })));
    group.addTargetedAnimation(anim, node);
    added++;
  }

  if (hipsY) {
    const hips = nodeOf(skeleton, 'Hips');
    if (hips) {
      const base = hips.position.clone();
      const anim = new Animation(
        `${name}.Hips.pos`, 'position', FPS,
        Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CYCLE,
      );
      anim.setKeys(hipsY.map(([t, y]) => ({
        frame: t * FPS, value: new Vector3(base.x, base.y + y, base.z),
      })));
      group.addTargetedAnimation(anim, hips);
      added++;
    }
  }

  group.normalize(0, durationSec * FPS);
  if (added === 0) { group.dispose(); return null; }
  return group;
}
