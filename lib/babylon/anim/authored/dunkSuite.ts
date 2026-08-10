// Dunk suite: charge gather, launch, score hang, land crouch.

import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildClip } from '../clipBuilder';
import { DUNK_TIMING as D } from './timing';

export function buildChargeGather(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = D.chargeSec;
  return buildClip(scene, sk, 'dunk_charge_gather', T, {
    Spine: [[0, 6, 0, 0], [T, 30, 0, 0]],
    LeftUpLeg: [[0, -12, 0, 4], [T, -55, 0, 8]],
    LeftLeg: [[0, 16, 0, 0], [T, 80, 0, 0]],
    RightUpLeg: [[0, -12, 0, -4], [T, -55, 0, -8]],
    RightLeg: [[0, 16, 0, 0], [T, 80, 0, 0]],
    LeftArm: [[0, 20, 0, 10], [T, 45, 0, 14]],
    RightArm: [[0, 20, 0, -10], [T, 45, 0, -14]],
  }, [[0, 0], [T, -0.22]]);
}

export function buildLaunch(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = D.launchSec;
  return buildClip(scene, sk, 'dunk_launch', T, {
    Spine: [[0, 30, 0, 0], [T, -10, 0, 0]],
    LeftUpLeg: [[0, -55, 0, 8], [T, -20, 0, 4]],
    LeftLeg: [[0, 80, 0, 0], [T, 20, 0, 0]],
    RightUpLeg: [[0, -55, 0, -8], [T, -20, 0, -4]],
    RightLeg: [[0, 80, 0, 0], [T, 20, 0, 0]],
    LeftArm: [[0, 45, 0, 14], [T, -140, 0, 10]],
    RightArm: [[0, 45, 0, -14], [T, -140, 0, -10]],
  }, [[0, -0.22], [T, 0.05]]);
}

export function buildScoreHang(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = D.hangSec;
  return buildClip(scene, sk, 'dunk_score_hang', T, {
    LeftArm: [[0, -160, 0, 10], [T / 2, -150, 0, 12], [T, -100, 0, 10]],
    LeftForeArm: [[0, 8, 0, 0], [T / 2, 25, 0, 0], [T, 40, 0, 0]],
    RightArm: [[0, -30, 0, -10], [T, 10, 0, -12]],
    Spine: [[0, -12, 0, 0], [T, 2, 0, 0]],
    LeftUpLeg: [[0, -25, 0, 4], [T, -10, 0, 2]],
    RightUpLeg: [[0, -25, 0, -4], [T, -10, 0, -2]],
  });
}

export function buildLandCrouch(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = D.landSec, M = T * 0.4;
  return buildClip(scene, sk, 'dunk_land_crouch', T, {
    Spine: [[0, 0, 0, 0], [M, 26, 0, 0], [T, 6, 0, 0]],
    LeftUpLeg: [[0, -10, 0, 4], [M, -60, 0, 8], [T, -14, 0, 4]],
    LeftLeg: [[0, 12, 0, 0], [M, 85, 0, 0], [T, 18, 0, 0]],
    RightUpLeg: [[0, -10, 0, -4], [M, -60, 0, -8], [T, -14, 0, -4]],
    RightLeg: [[0, 12, 0, 0], [M, 85, 0, 0], [T, 18, 0, 0]],
    LeftArm: [[0, 10, 0, 12], [M, 40, 0, 30], [T, 15, 0, 12]],
    RightArm: [[0, 10, 0, -12], [M, 40, 0, -30], [T, 15, 0, -12]],
  }, [[0, 0.05], [M, -0.26], [T, 0]]);
}
