// dunk_land_absorb — Flight Night's feet-first landing (DUNK-LAND-CELEBRATE, 2026-09-30).
// Balls of the feet touch, heels follow (~0.07 s), knees track over the toes through a hip hinge absorb,
// then rise to stand. The lead foot (dunking-hand side, mirrored on import) lands slightly ahead.
// dunk_land_crouch stays shared with the duel and hoops dunks — this clip is Flight Night only.
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3 } from '../poseClip';

type V3 = [number, number, number];

export const LAND_ABSORB_SEC = 0.55;
export const HEEL_DOWN_T = 0.07;
export const ABSORB_BOTTOM_T = 0.25;
export const RISE_START_T = 0.32;

const UP = { Left: [-0.9, 0.1, -0.3] as V3, Right: [0.9, 0.1, -0.3] as V3 };
const LEAD_Z = 0.09;   // ~9 cm ahead on the dunking (right) foot — the mirror flips it
const TRAIL_Z = -0.02;

const legs = (thigh: number, knee: number, flare = 4): Record<string, Deg3> => ({
  LeftUpLeg: [thigh, 0, flare], RightUpLeg: [thigh, 0, -flare], LeftLeg: [knee, 0, 0], RightLeg: [knee, 0, 0],
});

/** Feet-first absorb: overhead hands meet the finishes, descend in front, knees over toes, uneven stagger. */
export function buildDunkLandAbsorb(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = LAND_ABSORB_SEC;
  return buildPoseClip(scene, sk, 'dunk_land_absorb', T, [
    { t: 0, bones: { Hips: [2, 0, 0], Spine: [2, 0, 0], ...legs(-18, 28, 5) },
      hands: { Left: [-0.20, 1.92, 0.08], Right: [0.20, 1.92, 0.08] }, poles: UP, hipsY: 0.02,
      feet: { Right: [0.10, 0.04, LEAD_Z], Left: [-0.10, 0.04, TRAIL_Z] } },   // toe / ball contact, lead ahead
    { t: HEEL_DOWN_T, bones: { Hips: [4, 0, 0], Spine: [8, 0, 0], ...legs(-32, 48, 6) },
      hands: { Left: [-0.22, 1.55, 0.32], Right: [0.22, 1.55, 0.32] }, poles: { Left: [-0.9, 0.0, -0.3], Right: [0.9, 0.0, -0.3] }, hipsY: -0.04,
      feet: { Right: [0.10, 0.0, LEAD_Z], Left: [-0.10, 0.0, TRAIL_Z] }, kneePoles: { Right: [0.2, -0.5, 0.8], Left: [-0.2, -0.5, 0.8] } },   // heels down
    { t: ABSORB_BOTTOM_T, bones: { Hips: [14, 0, 0], Spine: [18, 0, 0], LeftUpLeg: [-44, 0, 8], RightUpLeg: [-40, 0, -6], LeftLeg: [62, 0, 0], RightLeg: [58, 0, 0] },
      hands: { Left: [-0.28, 0.92, 0.42], Right: [0.28, 0.92, 0.42] }, hipsY: -0.10,
      feet: { Right: [0.10, -0.10, LEAD_Z], Left: [-0.10, -0.10, TRAIL_Z] }, kneePoles: { Right: [0.3, -0.4, 0.7], Left: [-0.3, -0.4, 0.7] } },   // absorb bottom, hands forward of hips
    { t: RISE_START_T, bones: { Hips: [10, 0, 0], Spine: [12, 0, 0], ...legs(-28, 42, 5) },
      hands: { Left: [-0.24, 1.02, 0.28], Right: [0.24, 1.02, 0.28] }, hipsY: -0.08,
      feet: { Right: [0.10, 0.0, LEAD_Z], Left: [-0.10, 0.0, TRAIL_Z] } },   // rising out of the absorb
    { t: T, bones: { Hips: [0, 0, 0], Spine: [4, 0, 0], ...legs(-12, 18) },
      hands: { Left: [-0.26, 0.86, 0.12], Right: [0.26, 0.86, 0.12] }, hipsY: 0 },
  ]);
}
