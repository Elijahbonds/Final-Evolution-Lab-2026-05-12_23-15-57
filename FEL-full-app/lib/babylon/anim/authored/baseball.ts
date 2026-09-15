// Baseball packages (Phase 6, 2026-09-03) — RE-AUTHORED as pose targets (ship
// pass 3, rung 1): torso and legs in degrees about the parent's bind axes,
// hands as world-axis metres from the root, fitted at build time by the
// two-bone solver so one authoring plays on any body that passes Gate 0.
// Targets are the positions the previous offset-authored form was solved to.
// Yaw convention (measured 2026-09-03): +yaw turns the RIGHT shoulder FORWARD
// (+z). A right-handed batter's load and a pitcher's leg lift are closed
// (right shoulder back), so they key NEGATIVE yaw; contact and release open.
//
//   baseball_stance      — bat up by the back shoulder, knees loaded (loop)
//   baseball_swing       — hips lead, hands sweep through the zone, follow-through
//   baseball_pitch_over  — over-the-top: fastball and changeup (same look)
//   baseball_pitch_side  — three-quarter: the slider's arm slot
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3 } from '../poseClip';

export const BASEBALL_CLIPS = ['baseball_stance', 'baseball_swing', 'baseball_pitch_over', 'baseball_pitch_side'] as const;
type V3 = [number, number, number];

// Both hands up by the back shoulder, IN FRONT of the chest. SHARED-ANIM-BUS (2026-09-14): this was [0.30, 1.45, -0.25] —
// behind the root and wide of the back shoulder, so the lead arm had to reach 0.47 m across the chest and locked straight
// (178°) with both hands 0.13–0.15 m behind the chest plane on every stance frame (the eye's "arms locked behind"). Now
// 0.19 m in front, lead elbow ~93°, rear ~47° (tucked, the way a batter's back elbow is): LocoBus ARM_LIMITS.stance.
const BAT_LOAD: V3 = [0.28, 1.32, 0.18];
const LOADED_LEGS: Record<string, Deg3> = { LeftUpLeg: [-24, 0, 12], RightUpLeg: [-24, 0, -12], LeftLeg: [36, 0, 0], RightLeg: [36, 0, 0] };
const BACK_POLES = { Right: [0.8, -0.2, -0.6] as V3, Left: [0.2, -0.6, -0.8] as V3 };

/** Right-handed batter: hands together up by the back (right) shoulder. */
export function buildBatStance(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const D = 1.2;
  const key = (t: number, spine: number, hipsY: number) => ({ t, bones: { Hips: [0, -18, 0] as Deg3, Spine: [spine, -14, 0] as Deg3, ...LOADED_LEGS }, hands: { Left: BAT_LOAD, Right: BAT_LOAD }, poles: BACK_POLES, hipsY });
  return buildPoseClip(scene, sk, 'baseball_stance', D, [key(0, 16, -0.05), key(D / 2, 18, -0.06), key(D, 16, -0.05)]);
}

/** The swing: hips open first, hands come through the zone, full follow-through. */
export function buildBatSwing(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'baseball_swing', 0.55, [
    { t: 0,    bones: { Hips: [0, -18, 0], Spine: [16, -14, 0], ...LOADED_LEGS }, hands: { Left: BAT_LOAD, Right: BAT_LOAD }, poles: BACK_POLES, hipsY: -0.05 },
    { t: 0.15, bones: { Hips: [0, 10, 0],  Spine: [12, 20, 0],  LeftUpLeg: [-18, 0, 10], RightUpLeg: [-26, 0, -9], LeftLeg: [24, 0, 0], RightLeg: [30, 0, 0] }, hands: { Left: [0.25, 1.20, 0.15], Right: [0.30, 1.22, 0.05] }, hipsY: -0.07 },
    // contact: extended through the zone in front
    { t: 0.3,  bones: { Hips: [0, 55, 0],  Spine: [8, 50, 0],   LeftUpLeg: [-10, 0, 8],  RightUpLeg: [-30, 0, -6], LeftLeg: [20, 0, 0], RightLeg: [26, 0, 0] }, hands: { Left: [0.10, 1.15, 0.55], Right: [0.14, 1.15, 0.52] }, poles: { Left: [-0.7, -0.5, -0.2], Right: [0.7, -0.5, -0.2] }, hipsY: -0.06 },
    // wrapped high on the left
    { t: 0.55, bones: { Hips: [0, 60, 0],  Spine: [6, 55, 0],   LeftUpLeg: [-12, 0, 8],  RightUpLeg: [-30, 0, -6], LeftLeg: [20, 0, 0], RightLeg: [26, 0, 0] }, hands: { Left: [-0.35, 1.55, 0.10], Right: [-0.30, 1.55, 0.14] }, poles: { Left: [-0.8, -0.3, -0.5], Right: [-0.4, -0.6, -0.6] }, hipsY: -0.02 },
  ]);
}

const PITCH_LEGS = {
  set:  { LeftUpLeg: [-10, 0, 6] as Deg3, LeftLeg: [12, 0, 0] as Deg3, RightUpLeg: [-8, 0, -6] as Deg3, RightLeg: [10, 0, 0] as Deg3 },
  lift: { LeftUpLeg: [-80, 0, 8] as Deg3, LeftLeg: [70, 0, 0] as Deg3, RightUpLeg: [-12, 0, -6] as Deg3, RightLeg: [16, 0, 0] as Deg3 },
  land: { LeftUpLeg: [-30, 0, 10] as Deg3, LeftLeg: [20, 0, 0] as Deg3, RightUpLeg: [-6, 0, -6] as Deg3, RightLeg: [8, 0, 0] as Deg3 },
  done: { LeftUpLeg: [-20, 0, 10] as Deg3, LeftLeg: [20, 0, 0] as Deg3, RightUpLeg: [-4, 0, -6] as Deg3, RightLeg: [6, 0, 0] as Deg3 },
};
const GLOVE = { set: [-0.20, 1.05, 0.15] as V3, lift: [-0.15, 1.35, 0.12] as V3, land: [-0.25, 1.10, 0.30] as V3, done: [-0.20, 1.00, 0.20] as V3 };
const OVER_POLE: V3 = [0.9, 0.1, -0.3];

/** Over-the-top delivery: the arm goes high behind, then whips over and forward. */
export function buildPitchOver(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'baseball_pitch_over', 0.7, [
    { t: 0,    bones: { Hips: [0, 0, 0],   Spine: [6, 0, 0],     ...PITCH_LEGS.set },  hands: { Right: [0.20, 1.05, -0.25], Left: GLOVE.set }, hipsY: -0.02 },
    // leg lift, arm back and up
    { t: 0.25, bones: { Hips: [0, -15, 0], Spine: [-12, -20, 0], ...PITCH_LEGS.lift }, hands: { Right: [0.20, 1.25, -0.40], Left: GLOVE.lift }, poles: { Right: [0.8, 0.3, -0.5] }, hipsY: 0.02 },
    // over the top, nearly overhead
    { t: 0.42, bones: { Hips: [0, 5, 0],   Spine: [10, 0, 0],    ...PITCH_LEGS.land }, hands: { Right: [0.25, 2.00, -0.05], Left: GLOVE.land }, poles: { Right: OVER_POLE }, hipsY: -0.04 },
    // release forward and down
    { t: 0.7,  bones: { Hips: [0, 20, 0],  Spine: [24, 25, 0],   ...PITCH_LEGS.done }, hands: { Right: [0.30, 1.50, 0.45], Left: GLOVE.done }, poles: { Right: [0.8, 0.2, 0.2] }, hipsY: -0.06 },
  ]);
}

/** Three-quarter delivery (the slider): the same wind-up, a lower arm slot at release. */
export function buildPitchSide(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'baseball_pitch_side', 0.7, [
    { t: 0,    bones: { Hips: [0, 0, 0],   Spine: [6, 0, 0],     ...PITCH_LEGS.set },  hands: { Right: [0.20, 1.05, -0.25], Left: GLOVE.set }, hipsY: -0.02 },
    { t: 0.25, bones: { Hips: [0, -15, 0], Spine: [-8, -22, 0],  ...PITCH_LEGS.lift }, hands: { Right: [0.20, 1.25, -0.40], Left: GLOVE.lift }, poles: { Right: [0.8, 0.3, -0.5] }, hipsY: 0.02 },
    // side-top: the arm comes through lower and wider
    { t: 0.42, bones: { Hips: [0, 5, 0],   Spine: [8, 5, 6],     ...PITCH_LEGS.land }, hands: { Right: [0.58, 1.66, -0.10], Left: GLOVE.land }, poles: { Right: [0.6, 0.6, -0.5] }, hipsY: -0.04 },
    // release from the three-quarter slot: shoulder height, out to the side
    { t: 0.7,  bones: { Hips: [0, 20, 0],  Spine: [22, 30, 6],   ...PITCH_LEGS.done }, hands: { Right: [0.58, 1.30, 0.35], Left: GLOVE.done }, poles: { Right: [0.8, -0.2, 0.3] }, hipsY: -0.06 },
  ]);
}
