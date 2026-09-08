// Dunk suite: charge gather, launch, score hang, land crouch.
// RE-AUTHORED as pose targets (ship pass 3, rung 1): torso and legs in degrees
// about the parent's bind axes, hands as world-axis metres from the root,
// fitted by the two-bone solver so the suite plays on any body that passes
// Gate 0. The old Euler arm keys rotated about X — the arm's own axis on this
// rig — so the launch never raised the hands (coreClips.test.ts, 2026-09-03).
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3 } from '../poseClip';
import { DUNK_TIMING as D } from './timing';
type V3 = [number, number, number];

const UP = { Left: [-0.9, 0.1, -0.3] as V3, Right: [0.9, 0.1, -0.3] as V3 };
const legs = (thigh: number, knee: number, flare = 4): Record<string, Deg3> => ({ LeftUpLeg: [thigh, 0, flare], RightUpLeg: [thigh, 0, -flare], LeftLeg: [knee, 0, 0], RightLeg: [knee, 0, 0] });

export function buildChargeGather(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = D.chargeSec;
  return buildPoseClip(scene, sk, 'dunk_charge_gather', T, [
    { t: 0, bones: { Hips: [0, 0, 0], Spine: [6, 0, 0],  ...legs(-12, 16) }, hands: { Left: [-0.24, 0.90, 0.18], Right: [0.24, 0.90, 0.18] }, hipsY: 0 },
    { t: T, bones: { Hips: [0, 0, 0], Spine: [30, 0, 0], ...legs(-55, 80, 8) }, hands: { Left: [-0.28, 0.85, -0.30], Right: [0.28, 0.85, -0.30] }, poles: { Left: [-0.6, 0.4, -0.6], Right: [0.6, 0.4, -0.6] }, hipsY: -0.22 },   // arms swung back, loaded
  ]);
}

export function buildLaunch(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = D.launchSec;
  return buildPoseClip(scene, sk, 'dunk_launch', T, [
    { t: 0, bones: { Hips: [0, 0, 0], Spine: [30, 0, 0],  ...legs(-55, 80, 8) }, hands: { Left: [-0.28, 0.85, -0.30], Right: [0.28, 0.85, -0.30] }, poles: { Left: [-0.6, 0.4, -0.6], Right: [0.6, 0.4, -0.6] }, hipsY: -0.22 },
    { t: T, bones: { Hips: [0, 0, 0], Spine: [-10, 0, 0], ...legs(-26, 34) },    hands: { Left: [-0.18, 1.98, 0.12], Right: [0.18, 1.98, 0.12] }, poles: UP, hipsY: 0.05 },   // both hands thrown overhead, the knees soft (DUNK-POSTURE-LEGS: straight legs read as a stiff hang)
  ]);
}

export function buildScoreHang(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = D.hangSec;
  return buildPoseClip(scene, sk, 'dunk_score_hang', T, [
    // DUNK-POSTURE-LEGS: the knees are keyed too (a soft bend easing out) — un-keyed they held whatever the launch left, a locked leg on the flashy launch
    { t: 0,     bones: { Hips: [0, 0, 0], Spine: [-12, 0, 0], LeftUpLeg: [-25, 0, 4], RightUpLeg: [-25, 0, -4], LeftLeg: [36, 0, 0], RightLeg: [36, 0, 0] }, hands: { Left: [-0.12, 2.02, 0.25], Right: [0.30, 1.25, 0.10] }, poles: { Left: UP.Left } },   // left hand on the rim
    { t: T / 2, bones: { Hips: [0, 0, 0], Spine: [-5, 0, 0],  LeftUpLeg: [-18, 0, 3], RightUpLeg: [-18, 0, -3], LeftLeg: [30, 0, 0], RightLeg: [30, 0, 0] }, hands: { Left: [-0.10, 1.95, 0.28], Right: [0.34, 1.35, 0.05] }, poles: { Left: UP.Left } },
    // DUNK-POSTURE-LEGS (L3): the old "letting go" key put both hands straight out FRONT at shoulder height — the pose the rim hang
    // held for a second after every clean slam read as a forward T. The ball hand stays up near the iron (elbow bent), the off
    // hand settles to the chest: a rim hang, and a shape the land crouch's overhead first key blends from without a sweep.
    { t: T,     bones: { Hips: [0, 0, 0], Spine: [2, 0, 0],   LeftUpLeg: [-10, 0, 2], RightUpLeg: [-10, 0, -2], LeftLeg: [22, 0, 0], RightLeg: [22, 0, 0] }, hands: { Left: [-0.18, 1.74, 0.22], Right: [0.26, 1.30, 0.18] }, poles: { Left: [-0.9, 0.0, -0.3], Right: [0.9, -0.2, -0.3] } },   // letting go: the ball hand still up, the off hand to the chest
  ]);
}

export function buildLandCrouch(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = D.landSec, M = T * 0.4;
  // DUNK-POSTURE (2026-09-08): feet-down crossfades into this clip from a finish (hands overhead) or the blown brace (hands
  // in front of the face), and the old low first key left the arms' descent to the BLEND — the shortest rotation from an
  // overhead arm to a low one passes through the side (measured: the tomahawk → land blend swept the hands to a 1.2 m T
  // at shoulder height for ~100 ms, the "dead land" the eye called). The descent is AUTHORED now: the first key meets the
  // finishes overhead (their own UP elbow poles, so the blend has nothing to turn), the second brings the hands down the
  // FRONT to the chest, then the absorb. A brace's hands (face height, in front) blend into the same front path.
  return buildPoseClip(scene, sk, 'dunk_land_crouch', T, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [2, 0, 0],  ...legs(-12, 16) },    hands: { Left: [-0.20, 1.92, 0.08], Right: [0.20, 1.92, 0.08] }, poles: { Left: [-0.9, 0.1, -0.3], Right: [0.9, 0.1, -0.3] }, hipsY: 0.04 },
    { t: 0.08, bones: { Hips: [0, 0, 0], Spine: [10, 0, 0], ...legs(-30, 42, 6) }, hands: { Left: [-0.22, 1.38, 0.38], Right: [0.22, 1.38, 0.38] }, poles: { Left: [-0.9, 0.0, -0.3], Right: [0.9, 0.0, -0.3] }, hipsY: -0.08 },   // down the front, into the crouch — the elbows stay OUT until the hands are low (a pole flip between keys is a lateral sweep of the arm; at hip height it is invisible)
    { t: M, bones: { Hips: [0, 0, 0], Spine: [26, 0, 0], ...legs(-60, 85, 8) }, hands: { Left: [-0.34, 0.85, 0.34], Right: [0.34, 0.85, 0.34] }, hipsY: -0.26 },   // absorb, arms forward for balance
    { t: T, bones: { Hips: [0, 0, 0], Spine: [6, 0, 0],  ...legs(-14, 18) },    hands: { Left: [-0.26, 0.86, 0.12], Right: [0.26, 0.86, 0.12] }, hipsY: 0 },
  ]);
}
