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
import { strafeBones, STRAFE_PHASES } from './locomotion';

export const VOLLEYBALL_CLIPS = ['volleyball_ready', 'volleyball_spike', 'volleyball_block', 'volleyball_shuffle_left', 'volleyball_shuffle_right'] as const;
type V3 = [number, number, number];
const UP_R: V3 = [0.9, 0.1, -0.3], UP_L: V3 = [-0.9, 0.1, -0.3];   // elbows out for overhead reaches

const crouch = (thigh: number, knee: number, flare = 14): Record<string, Deg3> => ({ LeftUpLeg: [thigh, 0, flare], RightUpLeg: [thigh, 0, -flare], LeftLeg: [knee, 0, 0], RightLeg: [knee, 0, 0] });

export function buildVolleyReady(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const D = 0.9;
  const key = (t: number, spine: number, thigh: number, knee: number, hipsY: number) => ({ t, bones: { Hips: [0, 0, 0] as Deg3, Spine: [spine, 0, 0] as Deg3, ...crouch(thigh, knee) }, hands: { Right: [0.11, 0.95, 0.34] as V3, Left: [-0.11, 0.95, 0.34] as V3 }, hipsY });
  return buildPoseClip(scene, sk, 'volleyball_ready', D, [key(0, 22, -30, 44, -0.10), key(D / 2, 24, -34, 50, -0.13), key(D, 22, -30, 44, -0.10)]);
}

/** Seconds into volleyball_spike where the hand meets the ball (the overhead contact key). */
export const SPIKE_CONTACT_SEC = 0.38;
export function buildVolleySpike(scene: Scene, sk: Skeleton): AnimationGroup | null {
  // ANIM-READABILITY (net / precision, 2026-09-07): the clip used to START in the load (hitting arm back and high). Now
  // that the body waits in volleyball_ready (hands together low in front), the crossfade from the ready to the load
  // blended two near-opposite arm orientations and the hand flipped 0.9 m in one frame at the midpoint. The spike now
  // starts IN the ready and swings the arms back low before the load, so the crossfade blends like with like and the arm
  // travels through keys the author chose. Contact moves 0.3 → 0.38 s.
  return buildPoseClip(scene, sk, 'volleyball_spike', 0.66, [
    // the ready
    { t: 0,    bones: { Hips: [0, 0, 0],   Spine: [22, 0, 0],    ...crouch(-30, 44) }, hands: { Right: [0.11, 0.95, 0.34], Left: [-0.11, 0.95, 0.34] }, hipsY: -0.10 },
    // the approach: both arms swing back LOW, the body loads
    { t: 0.12, bones: { Hips: [0, -12, 0], Spine: [10, -10, 0],  LeftUpLeg: [-36, 0, 10], RightUpLeg: [-30, 0, -10], LeftLeg: [50, 0, 0], RightLeg: [50, 0, 0] }, hands: { Right: [0.30, 0.80, -0.30], Left: [-0.22, 0.82, -0.26] }, poles: { Right: [0.6, 0.3, -0.7], Left: [-0.6, 0.3, -0.7] }, hipsY: -0.14 },
    // load: bow-and-arrow, hitting arm back and high, guide arm up at the ball
    { t: 0.24, bones: { Hips: [0, -25, 0], Spine: [-14, -20, 0], LeftUpLeg: [-40, 0, 10], RightUpLeg: [-30, 0, -10], LeftLeg: [50, 0, 0], RightLeg: [50, 0, 0] }, hands: { Right: [0.30, 1.80, -0.22], Left: [0.11, 1.72, 0.24] }, poles: { Right: UP_R, Left: UP_L }, hipsY: -0.12 },
    // contact overhead, out front
    { t: 0.38, bones: { Hips: [0, 5, 0],   Spine: [14, 5, 0],    LeftUpLeg: [-20, 0, 8],  RightUpLeg: [-20, 0, -8],  LeftLeg: [20, 0, 0], RightLeg: [20, 0, 0] }, hands: { Right: [0.21, 1.97, 0.20], Left: [0.02, 1.22, 0.26] }, poles: { Right: UP_R }, hipsY: 0.02 },
    // snapped down
    { t: 0.66, bones: { Hips: [0, 20, 0],  Spine: [28, 15, 0],   LeftUpLeg: [-30, 0, 8],  RightUpLeg: [-30, 0, -8],  LeftLeg: [40, 0, 0], RightLeg: [40, 0, 0] }, hands: { Right: [0.25, 1.02, 0.32], Left: [-0.12, 1.00, 0.22] }, hipsY: -0.10 },
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

/** The court SHUFFLE (ANIM-READABILITY net / precision, 2026-09-07): the side-step's legs, lower, under the READY arms —
 *  hands together in front at the waist. The generic strafe hung the arms; a defender moves in the platform. Loop. */
export function buildVolleyShuffle(scene: Scene, sk: Skeleton, dir: 'left' | 'right'): AnimationGroup | null {
  const s = dir === 'left' ? 1 : -1;
  const key = (t: number, roll: number, lead: number, trail: number) => ({
    // the LEADING leg (the one on the side you move to) lifts; the generic strafe lifts the left thigh both ways
    t, bones: { ...strafeBones(dir, roll, lead, trail), Spine: [22 + roll * 0.4, 0, -roll * 0.7 * s] as Deg3, LeftUpLeg: [-24 - (s > 0 ? lead : -trail), 0, 10 * s] as Deg3, RightUpLeg: [-24 - (s > 0 ? -trail : lead), 0, 10 * s] as Deg3, LeftLeg: [40, 0, 0] as Deg3, RightLeg: [40, 0, 0] as Deg3 },
    hands: { Right: [0.11, 0.95 + roll * 0.003, 0.34] as V3, Left: [-0.11, 0.95 + roll * 0.003, 0.34] as V3 }, hipsY: -0.10 - (lead ? 0.02 : 0),
  });
  return buildPoseClip(scene, sk, `volleyball_shuffle_${dir}`, 0.6, STRAFE_PHASES.map(([t, r, l, tr]) => key(t, r, l, tr)));
}
