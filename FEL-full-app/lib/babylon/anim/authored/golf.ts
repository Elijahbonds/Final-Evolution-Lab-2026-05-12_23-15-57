// Golf (Phase 3 clips, 2026-09-03) — RE-AUTHORED as pose targets (ship pass 3,
// rung 1): torso keys in degrees, hands in body-local metres, fitted at build
// time by the two-bone solver. The same file makes the swing on any body that
// passes Gate 0. Previous form: solved quaternion offsets, valid for one body.
//
//   golf_address_idle — bent at the waist, hands together low in front (loop)
//   golf_swing_full   — takeaway to the top over the right shoulder, down
//                       through the ball, finish high over the left shoulder
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3 } from '../poseClip';

export const GOLF_CLIPS = ['golf_address_idle', 'golf_swing_full'] as const;

const LEGS_SOFT: Record<string, Deg3> = { LeftUpLeg: [-14, 0, 8], RightUpLeg: [-14, 0, -8], LeftLeg: [20, 0, 0], RightLeg: [20, 0, 0] };
const GRIP: [number, number, number] = [0.02, 0.85, 0.30];

export function buildGolfAddress(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const D = 1.4;
  const key = (t: number, spine: number) => ({ t, bones: { Hips: [0, 0, 0] as Deg3, Spine: [spine, 0, 0] as Deg3, ...LEGS_SOFT }, hands: { Left: GRIP, Right: GRIP }, hipsY: -0.04 });
  return buildPoseClip(scene, sk, 'golf_address_idle', D, [key(0, 32), key(D / 2, 33), key(D, 32)]);
}

export function buildGolfSwing(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'golf_swing_full', 0.9, [
    { t: 0,    bones: { Hips: [0, 0, 0],   Spine: [32, 0, 0],   ...LEGS_SOFT }, hands: { Left: GRIP, Right: GRIP }, hipsY: -0.04 },
    { t: 0.35, bones: { Hips: [0, 40, 0],  Spine: [25, 35, 0],  ...LEGS_SOFT }, hands: { Right: [0.35, 1.75, -0.15], Left: [0.30, 1.70, -0.10] }, poles: { Right: [0.8, -0.3, -0.6], Left: [0.6, -0.6, -0.6] }, hipsY: -0.04 },
    { t: 0.55, bones: { Hips: [0, -20, 0], Spine: [30, -10, 0], ...LEGS_SOFT }, hands: { Left: [0.0, 0.85, 0.30], Right: [0.0, 0.85, 0.30] }, hipsY: -0.06 },
    { t: 0.9,  bones: { Hips: [0, -80, 0], Spine: [5, -70, 0],  LeftUpLeg: [-10, 0, 6], RightUpLeg: [-22, 0, -4], LeftLeg: [20, 0, 0], RightLeg: [20, 0, 0] }, hands: { Right: [-0.30, 1.70, 0.05], Left: [-0.35, 1.70, 0.05] }, poles: { Right: [-0.6, -0.6, -0.6], Left: [-0.8, -0.3, -0.6] }, hipsY: 0.0 },
  ]);
}
