// Soccer (Phase 3 clips, 2026-09-03) — RE-AUTHORED as pose targets (ship pass
// 3, rung 1): legs and torso in degrees, hands as world-axis metres from the
// root, fitted at build time by the two-bone solver so one authoring plays on
// any body that passes Gate 0. Targets are the positions the previous
// offset-authored form was solved to.
// Yaw convention (measured 2026-09-03): +yaw turns the RIGHT side FORWARD (+z),
// so the right hip goes back on NEGATIVE yaw in the back-swing.
//
//   soccer_kick_shoot — plant, back-swing, strike through the ball, follow high
//   keeper_set        — low, wide, hands at knee height (loop)
//   keeper_dive       — set → full stretch to the right (the left dive is the registered mirror 'keeper_dive.M')
//   keeper_dive_hold  — the stretch, held on the ground until the kick is decided (loop; ANIM-READABILITY 2026-09-07)
//   keeper_rise       — the dive in reverse: off the ground back to the set (one-shot)
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3 } from '../poseClip';

export const SOCCER_CLIPS = ['soccer_kick_shoot', 'keeper_set', 'keeper_dive', 'keeper_dive_hold', 'keeper_rise'] as const;
type V3 = [number, number, number];

/** Right-footed strike. Legs carry it; the arms counterbalance. */
export function buildSoccerKick(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'soccer_kick_shoot', 0.7, [
    // plant
    { t: 0,    bones: { Hips: [0, -10, 0], Spine: [6, 0, 0],     LeftUpLeg: [-12, 0, 8],  LeftLeg: [18, 0, 0], RightUpLeg: [-6, 0, -6],  RightLeg: [10, 0, 0] }, hands: { Left: [-0.22, 1.00, 0.10], Right: [0.22, 1.00, 0.10] }, hipsY: -0.02 },
    // back-swing: thigh back, knee folded; left arm forward for balance
    { t: 0.25, bones: { Hips: [0, -20, 0], Spine: [-14, -10, 0], LeftUpLeg: [-13, 0, 9],  LeftLeg: [19, 0, 0], RightUpLeg: [38, 0, -8],  RightLeg: [75, 0, 0] }, hands: { Left: [-0.15, 1.15, 0.30], Right: [0.35, 1.05, -0.15] }, hipsY: -0.05 },
    // through the ball: thigh forward, knee straight; left hand out front, right hand back
    { t: 0.45, bones: { Hips: [0, 15, 0],  Spine: [18, 10, 0],   LeftUpLeg: [-15, 0, 10], LeftLeg: [21, 0, 0], RightUpLeg: [-70, 0, -6], RightLeg: [8, 0, 0] },  hands: { Left: [0.07, 1.32, 0.38], Right: [0.42, 1.21, -0.20] }, hipsY: -0.02 },
    // follow high
    { t: 0.7,  bones: { Hips: [0, 25, 0],  Spine: [10, 15, 0],   LeftUpLeg: [-16, 0, 10], LeftLeg: [22, 0, 0], RightUpLeg: [-85, 0, -4], RightLeg: [4, 0, 0] },  hands: { Left: [-0.05, 1.25, 0.25], Right: [0.35, 1.15, -0.05] }, hipsY: 0.0 },
  ]);
}

const SET_LEGS = (thigh: number, knee: number): Record<string, Deg3> => ({ LeftUpLeg: [thigh, 0, 22], RightUpLeg: [thigh, 0, -22], LeftLeg: [knee, 0, 0], RightLeg: [knee, 0, 0] });
const SET_HANDS = { Right: [0.31, 0.91, 0.30] as V3, Left: [-0.31, 0.91, 0.30] as V3 };

export function buildKeeperSet(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const D = 1.0;
  const key = (t: number, spine: number, thigh: number, knee: number, hipsY: number) => ({ t, bones: { Hips: [0, 0, 0] as Deg3, Spine: [spine, 0, 0] as Deg3, ...SET_LEGS(thigh, knee) }, hands: SET_HANDS, hipsY });
  return buildPoseClip(scene, sk, 'keeper_set', D, [key(0, 30, -36, 50, -0.14), key(D / 2, 32, -40, 56, -0.17), key(D, 30, -36, 50, -0.14)]);
}

/** Dive to the keeper's right: OFF THE GROUND and FLAT OUT, both hands past the head, landing on the side.
 *  RECOGNISABLE (2026-09-15): the first cut rolled the hips 55° with the feet still planted — a keeper leaning over, not
 *  diving (the move sheet's stills). A dive is read by the body going HORIZONTAL in the air: the push leg drives, the
 *  hips roll past 80° and lift, the arms reach beyond the head along the line, and the body comes down on its side. */
export function buildKeeperDive(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'keeper_dive', 0.6, [
    { t: 0,    bones: { Hips: [0, 0, 0],  Spine: [30, 0, 0],  ...SET_LEGS(-36, 50) }, hands: SET_HANDS, hipsY: -0.14 },
    // the push: the far (left) leg drives, the body starts over, the arms swing up toward the ball
    { t: 0.14, bones: { Hips: [0, 0, 30], Spine: [12, 0, 18], LeftUpLeg: [-30, 0, 18], RightUpLeg: [-20, 0, -14], LeftLeg: [30, 0, 0], RightLeg: [40, 0, 0] }, hands: { Right: [0.62, 1.40, 0.24], Left: [0.30, 1.52, 0.26] }, poles: { Right: [0.3, -0.8, -0.4], Left: [0.2, 0.7, -0.6] }, hipsY: -0.10 },
    // FLIGHT: flat out in the air, hands past the head along the dive line, legs long
    { t: 0.32, bones: { Hips: [0, 0, 84], Spine: [4, 0, 8],   LeftUpLeg: [-8, 0, 6],   RightUpLeg: [-14, 0, -4], LeftLeg: [12, 0, 0], RightLeg: [22, 0, 0] }, hands: { Right: [1.30, 0.98, 0.22], Left: [1.24, 1.12, 0.30] }, poles: { Right: [0.3, -0.9, -0.3], Left: [0.3, 0.9, -0.4] }, hipsY: -0.08 },
    { t: 0.6,  ...STRETCH },   // (declared below; read when the clip is built)
  ]);
}

/** The dive's END pose — down on the side, flat, arms still reaching — shared by the hold and the rise. */
const STRETCH = {
  bones: { Hips: [0, 0, 86] as Deg3, Spine: [6, 0, 10] as Deg3, LeftUpLeg: [-14, 0, 6] as Deg3, RightUpLeg: [-26, 0, -4] as Deg3, LeftLeg: [18, 0, 0] as Deg3, RightLeg: [36, 0, 0] as Deg3 },
  hands: { Right: [1.20, 0.18, 0.24] as V3, Left: [1.14, 0.32, 0.34] as V3 },
  poles: { Right: [0.3, -0.9, -0.3] as V3, Left: [0.3, 0.9, -0.4] as V3 },
  hipsY: -0.84,
};

/** The stretch HELD (ANIM-READABILITY net / precision, 2026-09-07): the dive used to run out 0.6 s after the press and
 *  neverBindPose's chain stood the keeper straight up in a 0.12 s fade while the ball was still in the air. A HOLD loop:
 *  starts in the stretch, breathes a hair, returns — the crossfade from the dive is the way in and the loop never snaps. */
export function buildKeeperDiveHold(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 1.0;
  return buildPoseClip(scene, sk, 'keeper_dive_hold', T, [
    { t: 0, ...STRETCH },
    { t: T / 2, ...STRETCH, bones: { ...STRETCH.bones, Spine: [8, 0, 12] }, hands: { Right: [1.21, 0.20, 0.25], Left: [1.15, 0.34, 0.35] }, hipsY: -0.83 },
    { t: T, ...STRETCH },
  ]);
}

/** Off the ground and back to the set — the dive's keys in reverse. One-shot, settles into keeper_set. */
export function buildKeeperRise(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'keeper_rise', 0.5, [
    { t: 0, ...STRETCH, hipsY: -0.35 },
    { t: 0.28, bones: { Hips: [0, 0, 35], Spine: [24, 0, 16], LeftUpLeg: [-70, 0, 10], RightUpLeg: [-20, 0, -10], LeftLeg: [80, 0, 0], RightLeg: [40, 0, 0] }, hands: { Right: [0.46, 0.70, 0.30], Left: [0.10, 0.96, 0.30] }, poles: { Left: [0.2, 0.6, -0.6] }, hipsY: -0.18 },   // pushed up off the ground onto a knee
    { t: 0.5, bones: { Hips: [0, 0, 0], Spine: [30, 0, 0], ...SET_LEGS(-36, 50) }, hands: SET_HANDS, hipsY: -0.05 },
  ]);
}
