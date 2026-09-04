// Football fills: jukes L/R, spin move, tackled fall.
// RE-AUTHORED as pose targets (ship pass 3, rung 1): degrees about the parent's
// bind axes, hands as world-axis metres from the root, fitted by the two-bone
// solver so the fills play on any body that passes Gate 0. The old Euler arm
// keys rotated about X — the arm's own axis on this rig — so the ball-carry arm
// never actually tucked.
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3 } from '../poseClip';
type V3 = [number, number, number];

const CARRY = { Right: [0.20, 1.12, 0.22] as V3, Left: [-0.28, 1.00, 0.18] as V3 };   // ball tucked high on the right, off arm ready to stiff-arm

export function buildJuke(scene: Scene, sk: Skeleton, dir: 'left' | 'right'): AnimationGroup | null {
  const s = dir === 'right' ? 1 : -1;
  const plant: Record<string, Deg3> = dir === 'right' ? { LeftUpLeg: [-8, 0, -6], RightUpLeg: [-70, 0, -6], RightLeg: [60, 0, 0] } : { RightUpLeg: [-8, 0, 6], LeftUpLeg: [-70, 0, 6], LeftLeg: [60, 0, 0] };
  return buildPoseClip(scene, sk, `football_juke_${dir}`, 0.4, [
    { t: 0,    bones: { Hips: [0, 0, 0],           Spine: [4, 0, 0],             LeftUpLeg: [-14, 0, 0], RightUpLeg: [-14, 0, 0] }, hands: CARRY },
    { t: 0.15, bones: { Hips: [0, 22 * s, 10 * s], Spine: [10, 18 * s, 8 * s],   ...plant },                                       hands: { Right: [0.22, 1.10, 0.20], Left: [-0.34 - 0.1 * s, 1.05, 0.30] } },   // knee up, off arm out
    { t: 0.4,  bones: { Hips: [0, 0, 0],           Spine: [4, 0, 0],             LeftUpLeg: [-14, 0, 0], RightUpLeg: [-14, 0, 0] }, hands: CARRY },
  ]);
}

export function buildSpinMove(scene: Scene, sk: Skeleton): AnimationGroup | null {
  // the hips turn a full circle; the hands stay tucked so they ride round with the body
  const k = (t: number, yaw: number, spine: V3) => ({ t, bones: { Hips: [0, yaw, 0] as V3, Spine: spine } });
  return buildPoseClip(scene, sk, 'football_spin_move', 0.55, [
    { ...k(0, 0, [8, 0, 0]),       hands: CARRY },
    k(0.18, 130, [14, 0, 6]),
    k(0.36, 260, [14, 0, 6]),
    { ...k(0.55, 360, [8, 0, 0]),  hands: CARRY },
  ]);
}

export function buildTackledFall(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'football_tackled_fall', 0.6, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [4, 0, 0],     Neck: [0, 0, 0],   LeftUpLeg: [-14, 0, 4],  RightUpLeg: [-14, 0, -4] }, hands: CARRY, hipsY: 0 },
    { t: 0.25, bones: { Hips: [0, 0, 0], Spine: [-30, 0, 12],  Neck: [-16, 0, 0], LeftUpLeg: [-24, 0, 8],  RightUpLeg: [-20, 0, -6] }, hands: { Right: [0.40, 1.30, -0.05], Left: [-0.45, 1.25, -0.10] }, hipsY: -0.35 },
    { t: 0.6,  bones: { Hips: [0, 0, 0], Spine: [-70, 0, 18],  Neck: [-20, 0, 0], LeftUpLeg: [-40, 0, 10], RightUpLeg: [-30, 0, -8] }, hands: { Right: [0.55, 0.35, -0.40], Left: [-0.55, 0.35, -0.35] }, poles: { Left: [-0.3, 0.8, -0.4], Right: [0.3, 0.8, -0.4] }, hipsY: -0.85 },
  ]);
}
