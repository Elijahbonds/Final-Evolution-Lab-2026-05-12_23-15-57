// dunkFinishes — M111 performance/timing-driven dunk finishes.
//
// WHY: DunkMode's contest LOGIC (3-judge scoring, chain, variety memory, QTE
// timing) is rich, but every attempt finished with the SAME two poses —
// dunk_score_hang on a made slam, jump_land on a whiffed one, then always
// dunk_land_crouch. The finish never reflected HOW WELL you timed the slam or
// HOW BIG the judges scored it. These authored clips give the finish real
// variety so the visual pays off the result:
//   dunk_finish_windmill — perfect-timing aerial: a full one-arm windmill.
//   dunk_finish_tomahawk — good-timing aerial: two-hand cock-back tomahawk.
//   dunk_finish_blown    — mistimed/whiffed aerial: arms flail off-balance.
//   dunk_celebrate_big   — landing after a huge score: crouch into a flex.
// (Clean/ok timing reuses dunk_score_hang; modest scores reuse
//  dunk_land_crouch — both already authored, so we only add the extremes.)
//
// Sign conventions (same as dunkSuite.ts / proceduralClips.ts):
//   Arm  +X = swing back/behind, -X = raise toward front/overhead.
//   Arm  Z: Left +Z abducts outward, Right -Z abducts outward.
//   ForeArm +X = flex (bend elbow).
//   UpLeg -X = raise knee to front; Leg +X = flex knee (heel back).
//   Spine +X = lean forward, -X = lean back; Spine Y = twist.
// All values are anatomically reasonable; the mesh is rigid-parented primitives
// so nothing skins — these are pure orientation keys, deterministic and assetless.

import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildClip } from '../clipBuilder';

// PERFECT timing → the crowd-popper. Right arm sweeps a full circle: cocked
// back-and-down, up and over the top, then down to slam. Left arm rides high
// for balance and the spine adds a small windmill twist.
export function buildFinishWindmill(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.85;
  return buildClip(scene, sk, 'dunk_finish_windmill', T, {
    Spine:        [[0, -6, -8, 0], [0.4, -12, 6, 0], [T, 6, 0, 0]],
    Spine2:       [[0, -3, -4, 0], [0.4, -6, 3, 0], [T, 3, 0, 0]],
    RightArm:     [[0, 55, 0, -8], [0.3, -30, 0, -8], [0.55, -178, 0, -8], [T, -95, 0, -8]],
    RightForeArm: [[0, 10, 0, 0], [0.55, 5, 0, 0], [T, 15, 0, 0]],
    LeftArm:      [[0, -125, 0, 12], [T, -85, 0, 12]],
    LeftForeArm:  [[0, 20, 0, 0], [T, 30, 0, 0]],
    LeftUpLeg:    [[0, -35, 0, 6], [T, -14, 0, 4]],
    LeftLeg:      [[0, 55, 0, 0], [T, 18, 0, 0]],
    RightUpLeg:   [[0, -22, 0, -6], [T, -12, 0, -4]],
    RightLeg:     [[0, 40, 0, 0], [T, 14, 0, 0]],
  });
}

// GOOD timing → both arms cock straight overhead, then crunch down together in
// a two-hand tomahawk. Spine loads back then snaps forward for the slam.
export function buildFinishTomahawk(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.75;
  return buildClip(scene, sk, 'dunk_finish_tomahawk', T, {
    Spine:        [[0, -14, 0, 0], [0.35, -20, 0, 0], [T, 10, 0, 0]],
    LeftArm:      [[0, -150, 0, 10], [0.35, -178, 0, 10], [T, -70, 0, 10]],
    RightArm:     [[0, -150, 0, -10], [0.35, -178, 0, -10], [T, -70, 0, -10]],
    LeftForeArm:  [[0, 30, 0, 0], [0.35, 50, 0, 0], [T, 10, 0, 0]],
    RightForeArm: [[0, 30, 0, 0], [0.35, 50, 0, 0], [T, 10, 0, 0]],
    LeftUpLeg:    [[0, -30, 0, 6], [T, -12, 0, 4]],
    LeftLeg:      [[0, 45, 0, 0], [T, 16, 0, 0]],
    RightUpLeg:   [[0, -30, 0, -6], [T, -12, 0, -4]],
    RightLeg:     [[0, 45, 0, 0], [T, 16, 0, 0]],
  });
}

// MISTIMED / whiffed → arms flail out wide, torso twists off-balance, legs
// splay asymmetrically. Reads clearly as a blown attempt (no clean finish).
export function buildFinishBlown(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.7;
  return buildClip(scene, sk, 'dunk_finish_blown', T, {
    Spine:        [[0, 0, 0, 0], [0.35, -8, 14, 16], [T, 6, 6, 8]],
    Spine2:       [[0, 0, 0, 0], [0.35, -4, 8, 8], [T, 3, 4, 4]],
    LeftArm:      [[0, 10, 0, 40], [0.35, -35, 0, 72], [T, 18, 0, 55]],
    RightArm:     [[0, 10, 0, -40], [0.35, -52, 0, -78], [T, 18, 0, -52]],
    LeftForeArm:  [[0, 15, 0, 0], [0.35, 35, 0, 0], [T, 20, 0, 0]],
    RightForeArm: [[0, 15, 0, 0], [0.35, 45, 0, 0], [T, 25, 0, 0]],
    LeftUpLeg:    [[0, -40, 0, 10], [T, -18, 0, 6]],
    LeftLeg:      [[0, 30, 0, 0], [T, 22, 0, 0]],
    RightUpLeg:   [[0, -10, 0, -10], [T, -8, 0, -6]],
    RightLeg:     [[0, 60, 0, 0], [T, 26, 0, 0]],
  });
}

// BIG score landing → absorb into a deep crouch, then rise into a proud
// two-arm bicep flex (chest out, spine leaned back). The Hips dip and recover.
export function buildCelebrateBig(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.9, M = 0.3;
  return buildClip(scene, sk, 'dunk_celebrate_big', T, {
    Spine:        [[0, 20, 0, 0], [M, 26, 0, 0], [0.6, -8, 0, 0], [T, -2, 0, 0]],
    LeftUpLeg:    [[0, -55, 0, 8], [M, -60, 0, 8], [T, -10, 0, 4]],
    LeftLeg:      [[0, 80, 0, 0], [M, 85, 0, 0], [T, 14, 0, 0]],
    RightUpLeg:   [[0, -55, 0, -8], [M, -60, 0, -8], [T, -10, 0, -4]],
    RightLeg:     [[0, 80, 0, 0], [M, 85, 0, 0], [T, 14, 0, 0]],
    LeftArm:      [[0, 15, 0, 14], [M, 30, 0, 24], [0.6, -35, 0, 55], [T, -55, 0, 42]],
    RightArm:     [[0, 15, 0, -14], [M, 30, 0, -24], [0.6, -35, 0, -55], [T, -55, 0, -42]],
    LeftForeArm:  [[0, 20, 0, 0], [0.6, 95, 0, 0], [T, 85, 0, 0]],
    RightForeArm: [[0, 20, 0, 0], [0.6, 95, 0, 0], [T, 85, 0, 0]],
  }, [[0, 0.02], [M, -0.26], [0.6, -0.02], [T, 0]]);
}
