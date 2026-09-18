// FreeRun fills (ANIM-READABILITY creative, 2026-09-07). The runner used to fly on the last frame of jump_up until the
// clip ran out (0.45 s), then neverBindPose's chain dropped him into idle_stand MID-AIR for the rest of the flight (0.8 s of
// standing in the sky on a rooftop drop); a flip played the BOARD air pose (a rider's counterweight arms, no board); the
// slide was the football juke (a knee-up sidestep). Three HOLD loops, authored as pose targets like the rest of the
// suite: they start IN the pose, breathe a hair and return, so the animator's crossfade is the way in and the loop never
// snaps. Landing, bail and the floor reuse jump_land / football_tackled_fall / karate_floor_hold / karate_get_up.
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3 } from '../poseClip';
type V3 = [number, number, number];

/**
 * In the air after the take-off: the arms REACH for where he is going, knees drawn up a little.
 *
 * They used to be held overhead and a little out (hands at y 1.86, the take-off pose frozen), and the scorecard's body
 * sampler read the flight as a T on 9 frames of 404 and as arms-too-high on 3 more — 2.2 %, the whole of free run's
 * Body deduction (rc20: 6.7). Overhead is also the wrong shape: a runner who jumps a gap does not hold his arms up like
 * a goalpost, he throws them FORWARD at the thing he is jumping to and pulls his knees under him. Shoulder height, in
 * front of the chest, and narrower than the shoulders — which is what a hand reaching for a ledge looks like, and what
 * the loco arm window has always asked for.
 */
const AIR = {
  bones: { Hips: [0, 0, 0] as Deg3, Spine: [6, 0, 0] as Deg3, LeftUpLeg: [-25, 0, 4] as Deg3, LeftLeg: [30, 0, 0] as Deg3, RightUpLeg: [-25, 0, -4] as Deg3, RightLeg: [30, 0, 0] as Deg3 },
  hands: { Left: [-0.20, 1.34, 0.44] as V3, Right: [0.21, 1.30, 0.46] as V3 },
  poles: { Left: [-0.8, -0.4, -0.2] as V3, Right: [0.8, -0.4, -0.2] as V3 },
};
export function buildFreeRunAirHold(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.8;
  return buildPoseClip(scene, sk, 'freerun_air_hold', T, [
    { t: 0, ...AIR, hipsY: 0 },
    { t: T / 2, bones: { ...AIR.bones, LeftUpLeg: [-30, 0, 4], RightUpLeg: [-30, 0, -4], LeftLeg: [36, 0, 0], RightLeg: [36, 0, 0] }, hands: { Left: [-0.19, 1.38, 0.46], Right: [0.22, 1.27, 0.44] }, poles: AIR.poles, hipsY: 0 },
    { t: T, ...AIR, hipsY: 0 },
  ]);
}

/** The TUCK — a flip / twist in the air: knees to the chest, the hands wrapped on the shins. The root's own rotation
 *  (the mode spins it) turns the tuck into the trick; the pose holds. */
const TUCK = {
  bones: { Hips: [0, 0, 0] as Deg3, Spine: [34, 0, 0] as Deg3, Neck: [18, 0, 0] as Deg3, LeftUpLeg: [-105, 0, 8] as Deg3, LeftLeg: [125, 0, 0] as Deg3, RightUpLeg: [-105, 0, -8] as Deg3, RightLeg: [125, 0, 0] as Deg3 },
  hands: { Left: [-0.16, 0.78, 0.40] as V3, Right: [0.16, 0.78, 0.40] as V3 },
  poles: { Left: [-0.9, 0.2, 0.2] as V3, Right: [0.9, 0.2, 0.2] as V3 },
};
export function buildFreeRunTuck(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.7;
  return buildPoseClip(scene, sk, 'freerun_tuck', T, [
    { t: 0, ...TUCK, hipsY: 0 },
    { t: T / 2, bones: { ...TUCK.bones, Spine: [36, 0, 0] }, hands: { Left: [-0.16, 0.76, 0.41], Right: [0.16, 0.76, 0.41] }, poles: TUCK.poles, hipsY: 0 },
    { t: T, ...TUCK, hipsY: 0 },
  ]);
}

/** The SLIDE — low under the bar: hips dropped, the lead leg out front along the ground, the trail leg folded under, the
 *  torso back, the trail hand down for balance, the lead hand out front. */
const SLIDE = {
  bones: { Hips: [0, 0, 0] as Deg3, Spine: [-22, 0, 0] as Deg3, Neck: [16, 0, 0] as Deg3, LeftUpLeg: [-78, 0, 6] as Deg3, LeftLeg: [10, 0, 0] as Deg3, LeftFoot: [30, 0, 0] as Deg3, RightUpLeg: [-40, 0, -12] as Deg3, RightLeg: [125, 0, 0] as Deg3 },
  hands: { Left: [-0.30, 0.78, 0.55] as V3, Right: [0.34, 0.30, -0.15] as V3 },
  poles: { Left: [-0.8, 0.4, -0.3] as V3, Right: [0.9, 0.3, -0.4] as V3 },
  hipsY: -0.52,
};
export function buildFreeRunSlide(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.7;
  return buildPoseClip(scene, sk, 'freerun_slide', T, [
    { t: 0, ...SLIDE },
    { t: T / 2, ...SLIDE, bones: { ...SLIDE.bones, Spine: [-24, 0, 0] }, hipsY: -0.54 },
    { t: T, ...SLIDE },
  ]);
}
