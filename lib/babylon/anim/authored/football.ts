// Football fills: jukes L/R, spin move, tackled fall.

import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildClip } from '../clipBuilder';

export function buildJuke(scene: Scene, sk: Skeleton, dir: 'left' | 'right'): AnimationGroup | null {
  const s = dir === 'right' ? 1 : -1;
  return buildClip(scene, sk, `football_juke_${dir}`, 0.4, {
    Hips: [[0, 0, 0, 0], [0.15, 0, 22 * s, 10 * s], [0.4, 0, 0, 0]],
    Spine: [[0, 4, 0, 0], [0.15, 10, 18 * s, 8 * s], [0.4, 4, 0, 0]],
    LeftUpLeg: [[0, -14, 0, 0], [0.15, s === -1 ? -70 : -8, 0, -6 * s], [0.4, -14, 0, 0]],
    RightUpLeg: [[0, -14, 0, 0], [0.15, s === 1 ? -70 : -8, 0, -6 * s], [0.4, -14, 0, 0]],
    LeftArm: [[0, 25, 0, 10], [0.15, 45, 10 * s, 18], [0.4, 25, 0, 10]],
    RightArm: [[0, 60, 0, -18], [0.15, 55, 10 * s, -22], [0.4, 60, 0, -18]],
  });
}

export function buildSpinMove(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildClip(scene, sk, 'football_spin_move', 0.55, {
    Hips: [[0, 0, 0, 0], [0.18, 0, 130, 0], [0.36, 0, 260, 0], [0.55, 0, 360, 0]],
    Spine: [[0, 8, 0, 0], [0.27, 14, 0, 6], [0.55, 8, 0, 0]],
    LeftArm: [[0, 20, 0, 10], [0.27, 70, 0, 40], [0.55, 20, 0, 10]],
    RightArm: [[0, 60, 0, -20], [0.27, 30, 0, -40], [0.55, 60, 0, -20]],
  });
}

export function buildTackledFall(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildClip(scene, sk, 'football_tackled_fall', 0.6, {
    Spine: [[0, 4, 0, 0], [0.25, -30, 0, 12], [0.6, -70, 0, 18]],
    Neck: [[0, 0, 0, 0], [0.25, -16, 0, 0], [0.6, -20, 0, 0]],
    LeftArm: [[0, 20, 0, 10], [0.3, -60, 0, 45], [0.6, -80, 0, 55]],
    RightArm: [[0, 60, 0, -20], [0.3, -50, 0, -45], [0.6, -80, 0, -55]],
    LeftUpLeg: [[0, -14, 0, 4], [0.6, -40, 0, 10]],
    RightUpLeg: [[0, -14, 0, -4], [0.6, -30, 0, -8]],
  }, [[0, 0], [0.6, -0.85]]);
}
