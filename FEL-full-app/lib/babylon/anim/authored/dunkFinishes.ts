// dunkFinishes — M111 performance/timing-driven dunk finishes: the finish
// reflects HOW WELL you timed the slam and HOW BIG the judges scored it.
//   dunk_finish_windmill — perfect-timing aerial: a full one-arm windmill.
//   dunk_finish_tomahawk — good-timing aerial: two-hand cock-back tomahawk.
//   dunk_finish_blown    — mistimed/whiffed aerial: arms flail off-balance.
//   dunk_celebrate_big   — landing after a huge score: crouch into a flex.
//
// RE-AUTHORED as pose targets (ship pass 3, rung 1): hands as world-axis metres
// from the root, fitted by the two-bone solver; torso and legs in degrees about
// the parent's bind axes. The old Euler arm keys rotated about X — the arm's own
// axis on this rig — so the tomahawk's hands never rose above the head
// (coreClips.test.ts, 2026-09-03). The mode owns the jump; these are aerial shapes.
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3 } from '../poseClip';
type V3 = [number, number, number];

const UP = { Left: [-0.9, 0.1, -0.3] as V3, Right: [0.9, 0.1, -0.3] as V3 };
const AIR_LEGS: Record<string, Deg3> = { LeftUpLeg: [-30, 0, 6], LeftLeg: [45, 0, 0], RightUpLeg: [-30, 0, -6], RightLeg: [45, 0, 0] };
const SETTLE_LEGS: Record<string, Deg3> = { LeftUpLeg: [-12, 0, 4], LeftLeg: [16, 0, 0], RightUpLeg: [-12, 0, -4], RightLeg: [16, 0, 0] };

// PERFECT timing → the crowd-popper. Right arm sweeps a full circle: cocked
// back-and-down, out and up over the top, then down to slam. Left arm rides high.
export function buildFinishWindmill(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.85;
  return buildPoseClip(scene, sk, 'dunk_finish_windmill', T, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-6, -8, 0],  LeftUpLeg: [-35, 0, 6], LeftLeg: [55, 0, 0], RightUpLeg: [-22, 0, -6], RightLeg: [40, 0, 0] }, hands: { Right: [0.30, 0.80, -0.30], Left: [-0.20, 1.85, 0.15] }, poles: { Right: [0.8, 0.2, -0.5], Left: UP.Left } },
    { t: 0.3,  bones: { Hips: [0, 0, 0], Spine: [-10, 0, 0],  ...AIR_LEGS }, hands: { Right: [0.62, 1.40, -0.15], Left: [-0.20, 1.90, 0.15] }, poles: { Right: [0.4, -0.3, -0.9], Left: UP.Left } },   // out to the side
    { t: 0.55, bones: { Hips: [0, 0, 0], Spine: [-12, 6, 0],  ...AIR_LEGS }, hands: { Right: [0.15, 2.02, 0.05], Left: [-0.22, 1.85, 0.18] }, poles: { Right: UP.Right, Left: UP.Left } },   // over the top
    { t: T,    bones: { Hips: [0, 0, 0], Spine: [6, 0, 0],    ...SETTLE_LEGS }, hands: { Right: [0.12, 1.90, 0.35], Left: [-0.22, 1.60, 0.25] }, poles: { Right: UP.Right } },   // slam, forward and down
  ]);
}

// GOOD timing → both arms cock straight overhead, then crunch down together.
export function buildFinishTomahawk(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.75;
  return buildPoseClip(scene, sk, 'dunk_finish_tomahawk', T, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-14, 0, 0], LeftUpLeg: [-30, 0, 6], LeftLeg: [45, 0, 0], RightUpLeg: [-30, 0, -6], RightLeg: [45, 0, 0] }, hands: { Left: [-0.20, 1.92, -0.05], Right: [0.20, 1.92, -0.05] }, poles: UP },
    { t: 0.35, bones: { Hips: [0, 0, 0], Spine: [-20, 0, 0], ...AIR_LEGS }, hands: { Left: [-0.18, 1.98, -0.22], Right: [0.18, 1.98, -0.22] }, poles: UP },   // cocked back overhead
    { t: T,    bones: { Hips: [0, 0, 0], Spine: [10, 0, 0],  ...SETTLE_LEGS }, hands: { Left: [-0.16, 1.75, 0.40], Right: [0.16, 1.75, 0.40] }, poles: UP },   // crunched down and through
  ]);
}

// MISTIMED / whiffed → arms flail wide, torso twists off-balance, legs splay.
export function buildFinishBlown(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.7;
  return buildPoseClip(scene, sk, 'dunk_finish_blown', T, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [0, 0, 0],      LeftUpLeg: [-40, 0, 10], LeftLeg: [30, 0, 0], RightUpLeg: [-10, 0, -10], RightLeg: [60, 0, 0] }, hands: { Left: [-0.45, 1.25, 0.15], Right: [0.45, 1.25, 0.15] } },
    { t: 0.35, bones: { Hips: [0, 0, 0], Spine: [-8, 14, 16],   LeftUpLeg: [-35, 0, 10], LeftLeg: [28, 0, 0], RightUpLeg: [-8, 0, -10],  RightLeg: [50, 0, 0] }, hands: { Left: [-0.60, 1.55, -0.10], Right: [0.62, 1.62, 0.05] }, poles: { Left: [-0.3, -0.6, -0.7], Right: [0.3, -0.6, -0.7] } },   // flail
    { t: T,    bones: { Hips: [0, 0, 0], Spine: [6, 6, 8],      LeftUpLeg: [-18, 0, 6],  LeftLeg: [22, 0, 0], RightUpLeg: [-8, 0, -6],   RightLeg: [26, 0, 0] }, hands: { Left: [-0.52, 1.30, 0.10], Right: [0.50, 1.32, 0.15] } },
  ]);
}

// BIG score landing → absorb into a deep crouch, then rise into a proud
// two-arm bicep flex (chest out, spine leaned back). The hips dip and recover.
export function buildCelebrateBig(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.9, M = 0.3;
  const FLEX = { Left: [-0.34, 1.52, 0.12] as V3, Right: [0.34, 1.52, 0.12] as V3 };   // fists up beside the head, elbows out at shoulder height
  const FLEX_POLES = { Left: [-0.9, -0.2, -0.3] as V3, Right: [0.9, -0.2, -0.3] as V3 };
  return buildPoseClip(scene, sk, 'dunk_celebrate_big', T, [
    { t: 0,   bones: { Hips: [0, 0, 0], Spine: [20, 0, 0], LeftUpLeg: [-55, 0, 8], LeftLeg: [80, 0, 0], RightUpLeg: [-55, 0, -8], RightLeg: [80, 0, 0] }, hands: { Left: [-0.30, 0.85, 0.30], Right: [0.30, 0.85, 0.30] }, hipsY: 0.02 },
    { t: M,   bones: { Hips: [0, 0, 0], Spine: [26, 0, 0], LeftUpLeg: [-60, 0, 8], LeftLeg: [85, 0, 0], RightUpLeg: [-60, 0, -8], RightLeg: [85, 0, 0] }, hands: { Left: [-0.34, 0.80, 0.34], Right: [0.34, 0.80, 0.34] }, hipsY: -0.26 },
    { t: 0.6, bones: { Hips: [0, 0, 0], Spine: [-8, 0, 0], LeftUpLeg: [-10, 0, 4], LeftLeg: [14, 0, 0], RightUpLeg: [-10, 0, -4], RightLeg: [14, 0, 0] }, hands: FLEX, poles: FLEX_POLES, hipsY: -0.02 },
    { t: T,   bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], LeftUpLeg: [-10, 0, 4], LeftLeg: [14, 0, 0], RightUpLeg: [-10, 0, -4], RightLeg: [14, 0, 0] }, hands: FLEX, poles: FLEX_POLES, hipsY: 0 },
  ]);
}
