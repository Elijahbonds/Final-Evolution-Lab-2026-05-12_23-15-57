// Mirrored clip support + dance alias fallbacks. (M28 Phase 13.)
//
// The shipped skeleton's bones are UNPREFIXED (LeftArm, RightUpLeg, …).
// Mirroring = swap L/R bone TARGETS and reflect rotations across the sagittal
// plane (negate y+z quaternion components), registered as a '<name>.M'
// AnimationGroup at load. NEVER a negative root scale (inverts winding → model
// renders inside-out).

import { Animation, AnimationGroup, Quaternion } from '@babylonjs/core';
import type { Scene, Skeleton } from '@babylonjs/core';
import type { CharacterAnimator } from './CharacterAnimator';

const MIRROR_PAIRS: [string, string][] = [
  ['LeftShoulder', 'RightShoulder'],
  ['LeftArm', 'RightArm'],
  ['LeftForeArm', 'RightForeArm'],
  ['LeftHand', 'RightHand'],
  ['LeftUpLeg', 'RightUpLeg'],
  ['LeftLeg', 'RightLeg'],
  ['LeftFoot', 'RightFoot'],
  ['LeftToeBase', 'RightToeBase'],
];
const mirrorName = (bone: string): string => {
  for (const [l, r] of MIRROR_PAIRS) {
    if (bone === l) return r;
    if (bone === r) return l;
  }
  return bone;                          // spine/neck/head/hips stay put
};

/** Build and register a mirrored variant '<clip>.M' for each given clip. */
export function registerMirroredClips(
  animator: CharacterAnimator, scene: Scene, skeleton: Skeleton, clipNames: string[],
): void {
  for (const name of clipNames) {
    const source = (animator as unknown as { groups: Map<string, AnimationGroup> })
      .groups?.get?.(name) ?? null;
    if (!source) continue;
    const mirrored = new AnimationGroup(`${name}.M`, scene);
    for (const ta of source.targetedAnimations) {
      const targetName = (ta.target as { name?: string }).name ?? '';
      const swapped = mirrorName(targetName.replace(/_c\d+$/, ''));
      const node = skeleton.bones.find((b) => b.name === swapped)?.getTransformNode();
      if (!node) continue;
      const anim = ta.animation.clone();
      if (anim.targetProperty === 'rotationQuaternion') {
        const keys = anim.getKeys().map((k) => {
          const q = k.value as Quaternion;
          // sagittal reflection: negate y and z
          return { frame: k.frame, value: new Quaternion(q.x, -q.y, -q.z, q.w) };
        });
        (anim as Animation).setKeys(keys);
      }
      mirrored.addTargetedAnimation(anim, node);
    }
    if (mirrored.targetedAnimations.length > 0) animator.register(mirrored);
    else mirrored.dispose();
  }
}

/**
 * Dance alias fallbacks — DANCE_LIBRARY ids resolve to existing clips until the
 * authored dance pack lands. Merge into CLIP_ALIASES (M24) at startup:
 *   Object.assign(CLIP_ALIASES, DANCE_ALIASES)
 */
export const DANCE_ALIASES: Record<string, [string, number]> = {
  dance_toprock_basic:   ['walk', 0.9],
  dance_bounce_two_step: ['walk', 1.15],
  dance_wave_arm:        ['guard', 0.5],
  dance_footwork_six:    ['run', 0.6],
  dance_freeze_baby:     ['guard', 0.25],
  dance_power_windmill:  ['roundhouse', 0.7],
  dance_trans_spin:      ['roundhouse', 1.2],
  dance_bounce_shoulder: ['guard', 0.9],
  // Mirrored variants resolve to the '<base>.M' groups made by
  // registerMirroredClips(DANCE_MIRROR_BASES). Keeps zero T-pose frames: a
  // mirrored dance step always has a real reflected group to play.
  'dance_toprock_basic.M':   ['walk.M', 0.9],
  'dance_bounce_two_step.M': ['walk.M', 1.15],
  'dance_wave_arm.M':        ['guard.M', 0.5],
  'dance_footwork_six.M':    ['run.M', 0.6],
  'dance_freeze_baby.M':     ['guard.M', 0.25],
  'dance_power_windmill.M':  ['roundhouse.M', 0.7],
  'dance_trans_spin.M':      ['roundhouse.M', 1.2],
  'dance_bounce_shoulder.M': ['guard.M', 0.9],
};

/** Base asset clips that dance steps mirror. Mirror THESE at character load so
 * every '<base>.M' group exists before any mirrored dance alias resolves. */
export const DANCE_MIRROR_BASES = ['walk', 'run', 'guard', 'roundhouse'];
