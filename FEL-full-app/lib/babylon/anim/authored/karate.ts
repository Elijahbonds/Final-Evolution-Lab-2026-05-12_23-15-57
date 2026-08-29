// Karate fills: hit react, knockdown. (Strikes alias to real GLB clips —
// jab/hook/roundhouse/uppercut — via clipAliases.)

import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildClip } from '../clipBuilder';

export function buildHitReact(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildClip(scene, sk, 'karate_hit_react', 0.3, {
    Spine: [[0, 0, 0, 0], [0.1, -14, 8, 4], [0.3, 0, 0, 0]],
    Neck: [[0, 0, 0, 0], [0.1, -12, 10, 0], [0.3, 0, 0, 0]],
    Hips: [[0, 0, 0, 0], [0.1, 0, 6, 0], [0.3, 0, 0, 0]],
    LeftArm: [[0, 15, 0, 10], [0.1, 30, 0, 18], [0.3, 15, 0, 10]],
    RightArm: [[0, 15, 0, -10], [0.1, 30, 0, -18], [0.3, 15, 0, -10]],
  });
}

export function buildKnockdown(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildClip(scene, sk, 'karate_knockdown', 0.7, {
    Spine: [[0, 0, 0, 0], [0.3, -40, 10, 8], [0.7, -85, 12, 10]],
    Neck: [[0, 0, 0, 0], [0.3, -18, 0, 0], [0.7, -10, 0, 0]],
    LeftArm: [[0, 15, 0, 10], [0.7, -70, 0, 60]],
    RightArm: [[0, 15, 0, -10], [0.7, -70, 0, -60]],
    LeftUpLeg: [[0, -12, 0, 4], [0.7, -35, 0, 12]],
    RightUpLeg: [[0, -12, 0, -4], [0.7, -25, 0, -10]],
  }, [[0, 0], [0.7, -0.9]]);
}
