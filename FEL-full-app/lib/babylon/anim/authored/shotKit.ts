// THE SHOT KIT (lane/hoops-shot-content, owner 2026-10-20) — the shot types that played someone else's body:
//   - the STEP-BACK's own release. A step-back gathered on its own clip (bball_stepback_gather: the push, the trail foot, the set
//     step) and then rose on the plain `jumpshot` from a square stance — the split feet and the backward drive gone in one crossfade.
//     bball_stepback_release rises OUT OF that set (its first key IS the gather's last), keeps the split stance, leans back off the
//     push and lets go with the shooting arm high over the front foot. It is paced exactly like the jumpshot (syncedShotSpeed on its
//     own release key, STEPBACK_RELEASE_01): the same meter, the same green, the same windows — only the body differs.
//   - the BANK's follow-through. A called-glass release (R1 held inside the bank band) played the straight follow-through at the rim
//     while the ball went up to the square. bball_follow_through_bank_{left,right} start from the same release key as the green
//     follow-through, turn the chest and carry the wrist toward the glass side, and the eyes stay UP on the square (the neck pitched
//     up, yawed to it). `_left` / `_right` is the side of the glass as the athlete is drawn; the shooting hand is the right in both
//     (NOT mirrorKey: a mirror would swap the hand). The route of the ball is untouched (ShotArc's glass leg).
//   - the CATCH HOP for the 3PT rack. The catch landed in the pull-up gather (a plant from a stand); bball_catch_hop is a small hop
//     into the shot — both feet leave the floor as the ball comes in and land loaded — ending in the pull-up gather's SET key exactly,
//     in the same 0.3 s, so the rise that follows starts from the same pose at the same time (no timing change: the rack's PICK_SEC,
//     NEXT_UP_SEC and the meter are not touched).
// All keys are authored like basketball.ts (degrees about bind; hands in reference metres from the root, +x the athlete's right after
// the hoops mirror, hoopsHand.ts); proven on the shipped rig by shotKit.test.ts.
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3, type PoseKey } from '../poseClip';

type V3 = [number, number, number];
const UP_R: V3 = [0.9, 0.1, -0.3], UP_L: V3 = [-0.9, 0.1, -0.3];
// (basketball.ts's own stance-ankle numbers; the step-back gather's feet are keyed with these)
const ANKLE_Y = 0.095;
const feetAt = (hipsY: number, f: { Left: V3; Right: V3 }) => ({ Left: [f.Left[0], f.Left[1] - hipsY, f.Left[2]] as V3, Right: [f.Right[0], f.Right[1] - hipsY, f.Right[2]] as V3 });
const hold = (k: PoseKey): PoseKey => ({ ...k, hold: true });

export const STEPBACK_RELEASE_CLIP = 'bball_stepback_release';
export const BANK_FOLLOW_CLIP = { left: 'bball_follow_through_bank_left', right: 'bball_follow_through_bank_right' } as const;
export const CATCH_HOP_CLIP = 'bball_catch_hop';
/** Every clip this kit builds (the registry and the scope read it). */
export const SHOT_KIT_CLIPS = [STEPBACK_RELEASE_CLIP, BANK_FOLLOW_CLIP.left, BANK_FOLLOW_CLIP.right, CATCH_HOP_CLIP] as const;

/** The step-back release's duration and its RELEASE key (the ball leaves the hand), seconds. */
export const STEPBACK_RELEASE_SEC = 0.62;
export const STEPBACK_RELEASE_AT = 0.40;
/** …as the clip fraction the modes pace to the meter's green (syncedShotSpeed's `releaseFrame01`). */
export const STEPBACK_RELEASE_01 = STEPBACK_RELEASE_AT / STEPBACK_RELEASE_SEC;

/** The step-back gather's SET key (basketball.ts buildStepbackGather, t 0.46) — the release starts here, so the hold's 0.08 s fade is a
 *  continuation, not a swap. Pinned against the gather by shotKit.test.ts. */
export const STEPBACK_SET_KEY: PoseKey = {
  t: 0, bones: { Hips: [0, 0, 0], Spine: [10, 0, 0], Neck: [-6, 0, 0] }, hands: { Right: [0.14, 1.28, 0.24], Left: [-0.10, 1.26, 0.26] },
  hipsY: -0.11, feet: feetAt(-0.11, { Left: [-0.19, ANKLE_Y, 0.06], Right: [0.21, ANKLE_Y, -0.10] }), kneesFront: true,
};

/** THE STEP-BACK RELEASE: out of the set step, the ball to the forehead, the legs drive up off the split stance, the chest falls back a
 *  touch (the push is still going away), the arm high over the front foot at the release; a beat of the wrist after it (the
 *  follow-through clip takes over at the release in the modes). */
export function stepbackReleaseKeys(): PoseKey[] {
  return [
    STEPBACK_SET_KEY,
    // the set point: the ball up to the forehead, still loaded
    { t: 0.16, bones: { Hips: [0, 0, 0], Spine: [6, 0, 0], Neck: [-8, 0, 0] }, hands: { Right: [0.16, 1.56, 0.22], Left: [-0.08, 1.50, 0.24] },
      hipsY: -0.12, feet: feetAt(-0.12, { Left: [-0.19, ANKLE_Y, 0.06], Right: [0.21, ANKLE_Y, -0.10] }), kneesFront: true },
    // the drive up: the legs extend off the split stance, the chest goes back over the trail foot
    { t: 0.30, bones: { Hips: [0, 0, 0], Spine: [-6, 0, 0], Neck: [-8, 0, 0] }, hands: { Right: [0.17, 1.86, 0.18], Left: [-0.12, 1.80, 0.20] },
      poles: { Right: UP_R, Left: UP_L }, hipsY: 0.0, feet: feetAt(0.0, { Left: [-0.18, ANKLE_Y + 0.02, 0.08], Right: [0.20, ANKLE_Y + 0.03, -0.12] }), kneesFront: true },
    // THE RELEASE: the arm high over the front foot, the off hand coming off, leaning back (the fade the step bought), feet off together
    hold({ t: STEPBACK_RELEASE_AT, bones: { Hips: [0, 0, 0], Spine: [-12, 0, 0], Neck: [-10, 0, 0] }, hands: { Right: [0.18, 2.04, 0.22], Left: [-0.16, 1.92, 0.20] },
      poles: { Right: UP_R, Left: UP_L }, hipsY: 0.03, feet: feetAt(0.03, { Left: [-0.16, ANKLE_Y + 0.05, 0.04], Right: [0.18, ANKLE_Y + 0.05, -0.08] }), kneesFront: true }),
    // the wrist: forward and down, the arm still up, the body still leaning away
    { t: STEPBACK_RELEASE_SEC, bones: { Hips: [0, 0, 0], Spine: [-10, 0, 0], Neck: [-8, 0, 0] }, hands: { Right: [0.22, 1.92, 0.44], Left: [-0.22, 1.56, 0.30] },
      poles: { Right: UP_R, Left: [-0.7, -0.2, -0.5] }, hipsY: 0.02, feet: feetAt(0.02, { Left: [-0.16, ANKLE_Y + 0.04, 0.04], Right: [0.18, ANKLE_Y + 0.04, -0.08] }), kneesFront: true },
  ];
}
export function buildStepbackRelease(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, STEPBACK_RELEASE_CLIP, STEPBACK_RELEASE_SEC, stepbackReleaseKeys());
}

/** How far the chest turns to the glass on a bank's follow-through (deg, + = toward the glass side), and the eyes' glance (deg). */
export const BANK_CHEST_YAW_DEG = 14;
export const BANK_GLANCE_YAW_DEG = 22;
/** THE BANK FOLLOW-THROUGH. `dir` +1 = the glass on the athlete's RIGHT, −1 on his left. +yaw turns the RIGHT shoulder forward (basketball.ts):
 *  a chest turned to the glass on the left brings the right shoulder round (+yaw); on the right, −yaw. The shooting hand is the right
 *  in both; it carries across toward the glass, the eyes stay up on the square. */
export function bankFollowKeys(dir: 1 | -1): PoseKey[] {
  const y = -dir * BANK_CHEST_YAW_DEG, ny = -dir * (BANK_GLANCE_YAW_DEG - BANK_CHEST_YAW_DEG), x = (v: number) => v + dir * 0.12;
  const soft: Record<string, Deg3> = { LeftUpLeg: [-12, 0, 6], RightUpLeg: [-12, 0, -6], LeftLeg: [18, 0, 0], RightLeg: [18, 0, 0] };
  return [
    // the release key — the green follow-through's first key, with the chest already set to the glass (the angled set)
    { t: 0, bones: { Hips: [0, y * 0.4, 0], Spine: [-6, y * 0.6, 0], Neck: [-14, ny, 0], LeftUpLeg: [-6, 0, 4], RightUpLeg: [-6, 0, -4], LeftLeg: [8, 0, 0], RightLeg: [8, 0, 0] },
      hands: { Right: [0.18, 2.02, 0.22], Left: [-0.16, 1.92, 0.24] }, poles: { Right: UP_R, Left: UP_L } },
    // the wrist toward the glass: the hand forward AND across to the square, the arm still up; the eyes up on the glass
    hold({ t: 0.15, bones: { Hips: [0, y * 0.6, 0], Spine: [-4, y, 0], Neck: [-16, ny, 0], LeftUpLeg: [-6, 0, 4], RightUpLeg: [-6, 0, -4], LeftLeg: [8, 0, 0], RightLeg: [8, 0, 0] },
      hands: { Right: [x(0.18), 1.98, 0.38], Left: [x(-0.22), 1.55, 0.32] }, poles: { Right: UP_R, Left: UP_L } }),
    // still watching it come off the glass
    { t: 0.4, bones: { Hips: [0, y * 0.5, 0], Spine: [2, y * 0.8, 0], Neck: [-14, ny, 0], ...soft }, hands: { Right: [x(0.22), 1.74, 0.44], Left: [-0.24, 1.30, 0.30] },
      poles: { Right: UP_R, Left: [-0.7, -0.2, -0.5] }, hipsY: -0.02 },
    // down the front to the ready stance (the green follow-through's end key: the absorb and the loop after it are unchanged)
    { t: 0.7, bones: { Hips: [0, 0, 0], Spine: [8, 0, 0], Neck: [-4, 0, 0], ...soft }, hands: { Right: [0.26, 1.18, 0.34], Left: [-0.26, 1.12, 0.30] }, hipsY: -0.04 },
  ];
}
export function buildBankFollowThrough(scene: Scene, sk: Skeleton, side: 'left' | 'right'): AnimationGroup | null {
  return buildPoseClip(scene, sk, BANK_FOLLOW_CLIP[side], 0.7, bankFollowKeys(side === 'right' ? 1 : -1));
}

/** The pull-up gather's SET key (basketball.ts buildPullupGather, t 0.3) — the hop lands here. Pinned by shotKit.test.ts. */
export const PULLUP_SET_KEY: PoseKey = {
  t: 0.3, bones: { Hips: [0, 0, 0], Spine: [8, 0, 0], Neck: [-6, 0, 0], LeftUpLeg: [-30, 0, 8], RightUpLeg: [-30, 0, -8], LeftLeg: [42, 0, 0], RightLeg: [42, 0, 0] },
  hands: { Right: [0.14, 1.28, 0.26], Left: [-0.10, 1.26, 0.28] }, hipsY: -0.10,
};
export const CATCH_HOP_SEC = 0.3;
/** THE CATCH HOP: the hands out front for the ball, both feet off the floor, down together loaded with the ball at the hip, up to the set. */
export function catchHopKeys(): PoseKey[] {
  return [
    { t: 0, bones: { Hips: [0, 0, 0], Spine: [10, 0, 0], Neck: [-4, 0, 0], LeftUpLeg: [-18, 0, 8], RightUpLeg: [-18, 0, -8], LeftLeg: [28, 0, 0], RightLeg: [28, 0, 0] },
      hands: { Right: [0.20, 1.16, 0.36], Left: [-0.18, 1.14, 0.36] }, hipsY: -0.05 },
    // the hop: the legs long under the body, the hips up — both feet leave the floor; the hands meet the ball out front
    { t: 0.08, bones: { Hips: [0, 0, 0], Spine: [6, 0, 0], Neck: [-6, 0, 0], LeftUpLeg: [-10, 0, 7], RightUpLeg: [-10, 0, -7], LeftLeg: [14, 0, 0], RightLeg: [14, 0, 0] },
      hands: { Right: [0.18, 1.20, 0.40], Left: [-0.12, 1.18, 0.40] }, hipsY: 0.05 },
    // down together, loaded: the ball into both hands at the hip (the pull-up gather's load)
    hold({ t: 0.17, bones: { Hips: [0, 0, 0], Spine: [20, 0, 0], Neck: [-6, 0, 0], LeftUpLeg: [-36, 0, 9], RightUpLeg: [-36, 0, -9], LeftLeg: [50, 0, 0], RightLeg: [50, 0, 0] },
      hands: { Right: [0.22, 0.94, 0.28], Left: [0.02, 0.92, 0.30] }, hipsY: -0.13 }),
    PULLUP_SET_KEY,
  ];
}
export function buildCatchHop(scene: Scene, sk: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, sk, CATCH_HOP_CLIP, CATCH_HOP_SEC, catchHopKeys());
}
