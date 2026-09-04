// Locomotion — idle, strafes, jump. RE-AUTHORED as pose targets (ship pass 3,
// rung 1): the hands hang where hands hang, in world-axis metres from the root,
// fitted by the two-bone solver; torso and legs in degrees about the parent's
// bind axes. One authoring plays on any body that passes Gate 0.
//
// History: the M24 idle keyed the arms ~8-10° off the T-pose bind, so a standing
// character looked bind-posed; v2 fixed idle and strafe on a measured arms-down
// rest but left jump_up / jump_land on Euler X keys — which on this rig rotate
// the arm about its own axis (a twist), so the arms never swung on a jump
// (measured 2026-09-03 by coreClips.test.ts). Now every clip is a pose.
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3 } from '../poseClip';
type V3 = [number, number, number];

/** Hands hanging at the sides, slightly forward of the hip, palms in. */
const HANG = { Left: [-0.24, 0.84, 0.06] as V3, Right: [0.24, 0.84, 0.06] as V3 };
const HANG_POLES = { Left: [-0.2, -0.3, -0.9] as V3, Right: [0.2, -0.3, -0.9] as V3 };   // elbows slightly back

export function buildIdleStand(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const key = (t: number, spine: number, neck: Deg3, lift: number, hipsY: number) => ({
    t, bones: { Hips: [0, 0, 0] as Deg3, Spine: [spine, 0, 0] as Deg3, Neck: neck },
    hands: { Left: [HANG.Left[0] - lift * 0.3, HANG.Left[1] + lift, HANG.Left[2]] as V3, Right: [HANG.Right[0] + lift * 0.3, HANG.Right[1] + lift, HANG.Right[2]] as V3 },
    poles: HANG_POLES, hipsY,
  });
  return buildPoseClip(scene, sk, 'idle_stand', 3.0, [key(0, 2, [0, 0, 0], 0, 0), key(1.5, 4.5, [2, 3, 0], 0.02, -0.012), key(3, 2, [0, 0, 0], 0, 0)]);
}

export function buildStrafe(scene: Scene, sk: Skeleton, dir: 'left' | 'right'): AnimationGroup | null {
  const s = dir === 'left' ? 1 : -1;
  const key = (t: number, roll: number, lead: number, trail: number, swing: number) => ({
    t, bones: { Hips: [0, 0, roll * s] as Deg3, Spine: [4 + roll * 0.4, 0, -roll * 0.7 * s] as Deg3, LeftUpLeg: [-12 - lead, 0, 8 * s] as Deg3, RightUpLeg: [-12 + trail, 0, 8 * s] as Deg3 },
    hands: { Left: [HANG.Left[0], HANG.Left[1] + swing, HANG.Left[2] + swing * 2] as V3, Right: [HANG.Right[0], HANG.Right[1] + swing, HANG.Right[2] + swing * 2] as V3 }, poles: HANG_POLES,
  });
  return buildPoseClip(scene, sk, `strafe_${dir}`, 0.6, [key(0, 6, 0, 0, 0.02), key(0.3, 10, 10, 8, 0.05), key(0.6, 6, 0, 0, 0.02)]);
}

export function buildJumpUp(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'jump_up', 0.45, [
    // gather: deep, arms swung back
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [18, 0, 0], LeftUpLeg: [-45, 0, 6], LeftLeg: [65, 0, 0], RightUpLeg: [-45, 0, -6], RightLeg: [65, 0, 0] }, hands: { Left: [-0.30, 0.95, -0.32], Right: [0.30, 0.95, -0.32] }, poles: { Left: [-0.6, 0.4, -0.6], Right: [0.6, 0.4, -0.6] }, hipsY: -0.18 },
    // take-off: arms thrown overhead
    { t: 0.2,  bones: { Hips: [0, 0, 0], Spine: [-8, 0, 0], LeftUpLeg: [-18, 0, 3], LeftLeg: [18, 0, 0], RightUpLeg: [-18, 0, -3], RightLeg: [18, 0, 0] }, hands: { Left: [-0.18, 1.98, 0.10], Right: [0.18, 1.98, 0.10] }, poles: { Left: [-0.9, 0.1, -0.3], Right: [0.9, 0.1, -0.3] }, hipsY: 0.02 },
    { t: 0.45, bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], LeftUpLeg: [-25, 0, 4], LeftLeg: [30, 0, 0], RightUpLeg: [-25, 0, -4], RightLeg: [30, 0, 0] }, hands: { Left: [-0.22, 1.90, 0.15], Right: [0.22, 1.90, 0.15] }, poles: { Left: [-0.9, 0.1, -0.3], Right: [0.9, 0.1, -0.3] }, hipsY: 0 },
  ]);
}

export function buildJumpLand(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'jump_land', 0.35, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], LeftUpLeg: [-25, 0, 4], LeftLeg: [30, 0, 0], RightUpLeg: [-25, 0, -4], RightLeg: [30, 0, 0] }, hands: { Left: [-0.22, 1.90, 0.15], Right: [0.22, 1.90, 0.15] }, poles: { Left: [-0.9, 0.1, -0.3], Right: [0.9, 0.1, -0.3] }, hipsY: 0.02 },
    // absorb: deep crouch, arms come down and forward for balance
    { t: 0.15, bones: { Hips: [0, 0, 0], Spine: [24, 0, 0], LeftUpLeg: [-55, 0, 8], LeftLeg: [80, 0, 0], RightUpLeg: [-55, 0, -8], RightLeg: [80, 0, 0] }, hands: { Left: [-0.30, 0.95, 0.35], Right: [0.30, 0.95, 0.35] }, hipsY: -0.24 },
    { t: 0.35, bones: { Hips: [0, 0, 0], Spine: [6, 0, 0],  LeftUpLeg: [-14, 0, 4], LeftLeg: [18, 0, 0], RightUpLeg: [-14, 0, -4], RightLeg: [18, 0, 0] }, hands: { Left: [-0.26, 0.86, 0.12], Right: [0.26, 0.86, 0.12] }, poles: HANG_POLES, hipsY: 0 },
  ]);
}
