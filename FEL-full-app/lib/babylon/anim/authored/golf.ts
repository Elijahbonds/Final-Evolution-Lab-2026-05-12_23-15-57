// Golf (Phase 3 clips, 2026-09-03) — RE-AUTHORED as pose targets (ship pass 3,
// rung 1): torso keys in degrees, hands in body-local metres, fitted at build
// time by the two-bone solver. The same file makes the swing on any body that
// passes Gate 0. Previous form: solved quaternion offsets, valid for one body.
//
//   golf_address_idle — bent at the waist, hands together low in front (loop)
//   golf_swing_full   — takeaway to the top over the right shoulder, down
//                       through the ball, finish high over the left shoulder
//   golf_putt         — the putter: a short pendulum from the address, hands low, contact at 0.42 s (ANIM-READABILITY 2026-09-07)
//   golf_finish_hold  — the swing's finish, held watching the ball (loop; ANIM-READABILITY 2026-09-07)
// Yaw convention (measured 2026-09-03): +yaw turns the RIGHT shoulder FORWARD (+z).
// A right-hander's backswing/take-back therefore keys NEGATIVE yaw so the racket
// shoulder goes back and the target stays inside the arm's reach.
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3 } from '../poseClip';

export const GOLF_CLIPS = ['golf_address_idle', 'golf_swing_full', 'golf_putt', 'golf_finish_hold'] as const;

const LEGS_SOFT: Record<string, Deg3> = { LeftUpLeg: [-14, 0, 8], RightUpLeg: [-14, 0, -8], LeftLeg: [20, 0, 0], RightLeg: [20, 0, 0] };
const GRIP: [number, number, number] = [0.02, 0.85, 0.30];

export function buildGolfAddress(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const D = 1.4;
  const key = (t: number, spine: number) => ({ t, bones: { Hips: [0, 0, 0] as Deg3, Spine: [spine, 0, 0] as Deg3, ...LEGS_SOFT }, hands: { Left: GRIP, Right: GRIP }, hipsY: -0.04 });
  return buildPoseClip(scene, sk, 'golf_address_idle', D, [key(0, 32), key(D / 2, 33), key(D, 32)]);
}

/** See baseball.ts swingPoles: two fists on one shaft share an arm plane, so the elbows trail
 *  it together. The address and impact keys used to specify NO poles at all, which drops the
 *  solver onto its mirrored default and flips one elbow between every pair of keys — measured,
 *  the hands opened to 0.59 m through the backswing with the club held by one of them. */
const swingPoles = (x: number, y: number, z: number) => ({
  Right: [x, y, z] as [number, number, number],
  Left: [x - 0.3, y - 0.15, z - 0.1] as [number, number, number],
});

export function buildGolfSwing(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'golf_swing_full', 0.9, [
    { t: 0,    bones: { Hips: [0, 0, 0],   Spine: [32, 0, 0],   ...LEGS_SOFT }, hands: { Left: GRIP, Right: GRIP }, poles: swingPoles(0.55, -0.55, -0.60), hipsY: -0.04 },
    // mid backswing — the club is travelling fastest here and the 0 -> 0.35 gap was where the
    // hands came off the shaft (measured 0.59 m at t=0.20 before this key existed).
    { t: 0.18, bones: { Hips: [0, -22, 0], Spine: [29, -19, 0], ...LEGS_SOFT }, hands: { Right: [0.38, 1.40, -0.05], Left: [0.34, 1.38, -0.02] }, poles: swingPoles(0.68, -0.42, -0.60), hipsY: -0.04 },
    { t: 0.35, bones: { Hips: [0, -40, 0],  Spine: [25, -35, 0],  ...LEGS_SOFT }, hands: { Right: [0.35, 1.75, -0.15], Left: [0.30, 1.70, -0.10] }, poles: swingPoles(0.80, -0.30, -0.60), hipsY: -0.04 },
    // mid DOWNSWING — the fastest arc in the motion: the hands fall from over the shoulder to
    // the ball in 0.2s. Without a key here the rotation interpolation opened them to 0.39 m
    // right before impact, so the club was in one hand at the only moment that scores.
    { t: 0.46, bones: { Hips: [0, -10, 0], Spine: [28, -12, 0], ...LEGS_SOFT }, hands: { Right: [0.38, 1.12, 0.18], Left: [0.34, 1.10, 0.21] }, poles: swingPoles(0.58, -0.48, -0.60), hipsY: -0.05 },
    { t: 0.55, bones: { Hips: [0, 20, 0], Spine: [30, 10, 0], ...LEGS_SOFT }, hands: { Left: [0.0, 0.85, 0.30], Right: [0.0, 0.85, 0.30] }, poles: swingPoles(0.30, -0.65, -0.60), hipsY: -0.06 },
    // mid follow-through, same reason on the way out
    { t: 0.65, bones: { Hips: [0, 38, 0], Spine: [24, 30, 0], LeftUpLeg: [-12, 0, 7], RightUpLeg: [-18, 0, -6], LeftLeg: [20, 0, 0], RightLeg: [20, 0, 0] }, hands: { Right: [-0.14, 1.22, 0.26], Left: [-0.18, 1.20, 0.26] }, poles: swingPoles(-0.02, -0.60, -0.60), hipsY: -0.04 },
    { t: 0.76, bones: { Hips: [0, 56, 0], Spine: [16, 44, 0], LeftUpLeg: [-12, 0, 7], RightUpLeg: [-18, 0, -6], LeftLeg: [20, 0, 0], RightLeg: [20, 0, 0] }, hands: { Right: [-0.30, 1.46, 0.14], Left: [-0.34, 1.44, 0.14] }, poles: swingPoles(-0.22, -0.52, -0.60), hipsY: -0.03 },
    { t: 0.9,  bones: { Hips: [0, 80, 0], Spine: [5, 70, 0],  LeftUpLeg: [-10, 0, 6], RightUpLeg: [-22, 0, -4], LeftLeg: [20, 0, 0], RightLeg: [20, 0, 0] }, hands: { Right: [-0.30, 1.70, 0.05], Left: [-0.35, 1.70, 0.05] }, poles: swingPoles(-0.55, -0.45, -0.60), hipsY: 0.0 },
  ]);
}

/** Seconds into golf_swing_full / golf_putt where the club meets the ball — the mode launches the ball on this beat. */
export const GOLF_CONTACT_SEC = { golf_swing_full: 0.55, golf_putt: 0.42 } as const;

/** The PUTT (ANIM-READABILITY net / precision, 2026-09-07): on the green the mode played the full driver swing — hands over
 *  the shoulder for a 2 m putt. A pendulum: takeaway a hand's width back, through the ball, a short hold. Hands stay low. */
export function buildGolfPutt(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, 'golf_putt', 0.8, [
    { t: 0,    bones: { Hips: [0, 0, 0],   Spine: [32, 0, 0],  ...LEGS_SOFT }, hands: { Left: GRIP, Right: GRIP }, hipsY: -0.04 },
    { t: 0.28, bones: { Hips: [0, -8, 0],  Spine: [32, -8, 0], ...LEGS_SOFT }, hands: { Left: [0.20, 0.87, 0.26], Right: [0.20, 0.87, 0.26] }, hipsY: -0.04 },
    { t: 0.42, bones: { Hips: [0, 4, 0],   Spine: [32, 3, 0],  ...LEGS_SOFT }, hands: { Left: GRIP, Right: GRIP }, hipsY: -0.04 },
    { t: 0.6,  bones: { Hips: [0, 12, 0],  Spine: [31, 10, 0], ...LEGS_SOFT }, hands: { Left: [-0.16, 0.90, 0.30], Right: [-0.16, 0.90, 0.30] }, hipsY: -0.04 },
    { t: 0.8,  bones: { Hips: [0, 12, 0],  Spine: [31, 10, 0], ...LEGS_SOFT }, hands: { Left: [-0.16, 0.90, 0.30], Right: [-0.16, 0.90, 0.30] }, hipsY: -0.04 },
  ]);
}

/** The FINISH, HELD (ANIM-READABILITY net / precision, 2026-09-07): the full swing ends facing the target with the hands high
 *  over the left shoulder, and neverBindPose's chain then crossfaded the ADDRESS back over it in 0.12 s — the hips un-turned
 *  80° and the hands dropped 0.9 m in seven frames (measured 0.28–0.38 m of hand travel per frame, 28 pops in four swings).
 *  A golfer holds the finish and watches the ball; the address returns when they walk to the next lie. Starts IN the
 *  swing's last key, breathes, returns — the crossfade from the swing is the way in. */
export function buildGolfFinishHold(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 1.6;
  const FIN = { Hips: [0, 80, 0] as Deg3, Spine: [5, 70, 0] as Deg3, LeftUpLeg: [-10, 0, 6] as Deg3, RightUpLeg: [-22, 0, -4] as Deg3, LeftLeg: [20, 0, 0] as Deg3, RightLeg: [20, 0, 0] as Deg3 };
  const HANDS = { Right: [-0.30, 1.70, 0.05] as [number, number, number], Left: [-0.35, 1.70, 0.05] as [number, number, number] };
  const POLES = { Right: [-0.6, -0.6, -0.6] as [number, number, number], Left: [-0.8, -0.3, -0.6] as [number, number, number] };
  return buildPoseClip(scene, sk, 'golf_finish_hold', T, [
    { t: 0, bones: FIN, hands: HANDS, poles: POLES, hipsY: 0.0 },
    { t: T / 2, bones: { ...FIN, Spine: [7, 72, 0] }, hands: { Right: [-0.31, 1.68, 0.06], Left: [-0.36, 1.68, 0.06] }, poles: POLES, hipsY: -0.01 },
    { t: T, bones: FIN, hands: HANDS, poles: POLES, hipsY: 0.0 },
  ]);
}
