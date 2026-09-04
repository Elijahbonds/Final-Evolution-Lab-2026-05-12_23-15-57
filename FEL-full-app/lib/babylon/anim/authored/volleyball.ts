// Volleyball (Phase 3 clips, 2026-09-03) — RE-AUTHORED as pose targets (ship
// pass 3, rung 1): torso keys in degrees, hands as world-axis metres from the
// root, fitted at build time by the two-bone solver so one authoring plays on
// any body that passes Gate 0. Targets are the positions the previous
// offset-authored form was solved to.
// Yaw convention (measured 2026-09-03): +yaw turns the RIGHT shoulder FORWARD (+z),
// so the hitting shoulder loads on NEGATIVE yaw.
//
//   volleyball_ready — low, hands together in front, weight bouncing (loop)
//   volleyball_spike — load with the hitting arm back, contact overhead, snap down
//   volleyball_block — both hands straight up over the net
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3 } from '../poseClip';

export const VOLLEYBALL_CLIPS = ['volleyball_ready', 'volleyball_spike', 'volleyball_block'] as const;
type V3 = [number, number, number];
const UP_R: V3 = [0.9, 0.1, -0.3], UP_L: V3 = [-0.9, 0.1, -0.3];   // elbows out for overhead reaches

const crouch = (thigh: number, knee: number, flare = 14): Record<string, Deg3> => ({ LeftUpLeg: [thigh, 0, flare], RightUpLeg: [thigh, 0, -flare], LeftLeg: [knee, 0, 0], RightLeg: [knee, 0, 0] });

export function buildVolleyReady(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const D = 0.9;
  const key = (t: number, spine: number, thigh: number, knee: number, hipsY: number) => ({ t, bones: { Hips: [0, 0, 0] as Deg3, Spine: [spine, 0, 0] as Deg3, ...crouch(thigh, knee) }, hands: { Right: [0.11, 0.95, 0.34] as V3, Left: [-0.11, 0.95, 0.34] as V3 }, hipsY });
  return buildPoseClip(scene, sk, 'volleyball_ready', D, [key(0, 22, -30, 44, -0.10), key(D / 2, 24, -34, 50, -0.13), key(D, 22, -30, 44, -0.10)]);
}

export function buildVolleySpike(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'volleyball_spike', 0.6, [
    // load: bow-and-arrow, hitting arm back and high, guide arm up at the ball
    { t: 0,   bones: { Hips: [0, -25, 0], Spine: [-14, -20, 0], LeftUpLeg: [-40, 0, 10], RightUpLeg: [-30, 0, -10], LeftLeg: [50, 0, 0], RightLeg: [50, 0, 0] }, hands: { Right: [0.30, 1.80, -0.22], Left: [0.11, 1.72, 0.24] }, poles: { Right: UP_R, Left: UP_L }, hipsY: -0.12 },
    // contact overhead, out front
    { t: 0.3, bones: { Hips: [0, 5, 0],   Spine: [14, 5, 0],    LeftUpLeg: [-20, 0, 8],  RightUpLeg: [-20, 0, -8],  LeftLeg: [20, 0, 0], RightLeg: [20, 0, 0] }, hands: { Right: [0.21, 1.97, 0.20], Left: [0.02, 1.22, 0.26] }, poles: { Right: UP_R }, hipsY: 0.02 },
    // snapped down
    { t: 0.6, bones: { Hips: [0, 20, 0],  Spine: [28, 15, 0],   LeftUpLeg: [-30, 0, 8],  RightUpLeg: [-30, 0, -8],  LeftLeg: [40, 0, 0], RightLeg: [40, 0, 0] }, hands: { Right: [0.25, 1.02, 0.32], Left: [-0.12, 1.00, 0.22] }, hipsY: -0.10 },
  ]);
}

export function buildVolleyBlock(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const up = { Right: [0.21, 1.97, 0.20] as V3, Left: [-0.21, 1.97, 0.20] as V3 };
  return buildPoseClip(scene, sk, 'volleyball_block', 0.5, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [22, 0, 0], ...crouch(-30, 44) },   hands: { Right: [0.11, 0.95, 0.34], Left: [-0.11, 0.95, 0.34] }, hipsY: -0.10 },
    { t: 0.25, bones: { Hips: [0, 0, 0], Spine: [0, 0, 0],  ...crouch(-4, 6, 8) },  hands: up, poles: { Right: UP_R, Left: UP_L }, hipsY: 0.02 },
    { t: 0.5,  bones: { Hips: [0, 0, 0], Spine: [-4, 0, 0], ...crouch(0, 0, 8) },   hands: up, poles: { Right: UP_R, Left: UP_L }, hipsY: 0.05 },
  ]);
}
