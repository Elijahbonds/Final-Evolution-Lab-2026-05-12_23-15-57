// clipBuilder — turns compact keyframe data into a Babylon AnimationGroup
// targeting the skeleton's linked TransformNodes. Because targets come from the
// LIVE skeleton, bone-name mismatch is impossible.

import {
  Animation, AnimationGroup, Quaternion, Vector3,
} from '@babylonjs/core';
import type { Scene, Skeleton, TransformNode } from '@babylonjs/core';

const FPS = 30;
const D2R = Math.PI / 180;

/** [timeSec, xDeg, yDeg, zDeg] rotation keys per bone name. */
export type BoneKeys = Record<string, [number, number, number, number][]>;
/** Optional Hips Y offset keys: [timeSec, yMeters]. */
export type HipsYKeys = [number, number][];

/** Mixamo's own exports prefix every bone; hand-authored rigs usually don't. */
const MIXAMO_PREFIX = 'mixamorig:';
const bare = (n: string): string =>
  (n.startsWith(MIXAMO_PREFIX) ? n.slice(MIXAMO_PREFIX.length) : n);

/**
 * Resolve a clip's bone name to its transform node, tolerating the
 * 'mixamorig:' prefix on EITHER side.
 *
 * This used to be an exact string match against unprefixed names, which meant a
 * genuine Mixamo rig — where every bone is 'mixamorig:LeftArm' — resolved
 * nothing and every clip silently built zero targets. The procedural rig only
 * exposed that because Gate 0 requires the same prefix; the bug was already
 * there for the GLB path it was supposed to serve.
 */
function nodeOf(skeleton: Skeleton, boneName: string): TransformNode | null {
  const want = bare(boneName);
  const bone = skeleton.bones.find((b) => bare(b.name) === want);
  return bone?.getTransformNode() ?? null;
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
