// dunkFlush — the FLUSH and the CARRY-UP (DUNK MOTION pass, phase 4, 2026-09-23).
//
// THE GENERIC HANG. The phase-1 baseline found that every named dunk but the windmill and the tomahawk finished on the
// same clip, `dunk_score_hang` (a two-hand hang: the left hand on the rim, the right at the chest, the legs dangling).
// Every trick that ran out before the SLAM flowed into it through a 0.05 s fade, so the finish of fifteen different
// dunks was one body, arrived at by a snap. A one-handed dunk flushed with two hands, and a dunk that ended with the
// ball in the left hand flushed with the right hand's pose.
//
// Two clips replace it, each in three hands (right, left, both) so the finish follows the ball:
//   dunk_carry_up_*  what the body does while it waits for the SLAM once a trick or the take-off has run out: the
//                    ball carried up and cocked over the head, the guide hand coming off it, the knees coming up
//                    under the body and starting to open. It is slow and it is never still, because a body in the
//                    air never is.
//   dunk_flush_*     the SLAM: from the cocked ball over the head, the hand hammers forward over the ring and down
//                    through it, the wrist snapping on the way through. The trunk crunches into the iron, the off arm
//                    drops out for balance, and the legs come long under the body.
// The reach IK owns the ball arm from the press to the contact (HAND_IK_MAX_JAM), so the flush's ball arm is what the
// body does AROUND that reach and after the let-go. Everything else in the flush (the trunk, the off arm, the legs) is the
// flush's own; the wrists are the WristLayer's (it cocks under the ball and snaps on the contact).
//
// The left-hand versions are the right-hand keys mirrored (poseMirror): the same movement, other side.
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3, type PoseKey } from '../poseClip';
import { mirrorPoseKeys } from '../poseMirror';
import { HANG_ONE_LEGS } from './dunkTakeoff';
type V3 = [number, number, number];

const UP_R: V3 = [0.9, 0.1, -0.3], UP_L: V3 = [-0.9, 0.1, -0.3];
/** Knees up under the body (the top of a one-foot jump: the lead knee higher). */
const TUCK: Record<string, Deg3> = { LeftUpLeg: [-58, 0, 8], LeftLeg: [84, 0, 0], RightUpLeg: [-40, 0, -8], RightLeg: [72, 0, 0] };
/** The knees starting to open: the body lengthening toward the iron. */
const OPENING: Record<string, Deg3> = { LeftUpLeg: [-36, 0, 6], LeftLeg: [52, 0, 0], RightUpLeg: [-20, 0, -6], RightLeg: [48, 0, 0] };
/** The flush body: long under the arm, one knee still a touch ahead of the other. */
const LONG: Record<string, Deg3> = { LeftUpLeg: [-14, 0, 5], LeftLeg: [18, 0, 0], RightUpLeg: [-4, 0, -5], RightLeg: [26, 0, 0] };
/** The bow of a wind-up: the knees bent BEHIND the body, the hips a touch forward of the shoulders (DUNK MOTION phase 5). */
const BOW: Record<string, Deg3> = { LeftUpLeg: [-8, 0, 6], LeftLeg: [58, 0, 0], RightUpLeg: [-2, 0, -6], RightLeg: [64, 0, 0] };
/** DUNK MOTION phase 7: the one-foot wait keeps the one-foot hang (the lead leg DROPPED long, the take-off leg folded behind) —
 *  the owner's cue ("not dropping their lead leg on off 1 dunks") — easing a little further into it; never both knees tucked. */
const HANG_ONE_DEEP: Record<string, Deg3> = { RightUpLeg: [-10, 0, -4], RightLeg: [18, 0, 0], LeftUpLeg: [20, 0, 5], LeftLeg: [86, 0, 0] };
/** After the flush: the legs come forward under a body dropping off the rim. */
const DROP: Record<string, Deg3> = { LeftUpLeg: [-24, 0, 6], LeftLeg: [30, 0, 0], RightUpLeg: [-16, 0, -6], RightLeg: [34, 0, 0] };

export const CARRY_UP_SEC = 0.8;
export const FLUSH_SEC = 0.5;

/**
 * One hand (right): THE WIND-UP. DUNK MOTION phase 5: the carry-up began at the chest, so a flight arriving with the ball already
 * overhead (the owner's jump holds it there from 0.35 s) dropped it to the chest and took it back up — a pump nobody threw — and
 * then held it still until the SLAM. It starts overhead now and spends the wait easing the ball back into a cock over the head while
 * the knees bend behind the body, so the flush is thrown OUT of a loaded shape. A deep cock behind the head fought the reach (on the
 * arm from the carry-up) and crossed the arms (measured, 2026-09-23), so it is a modest one. A trick that ends low blends up into
 * the first key through the flow's fade.
 */
export const CARRY_UP_ONE: PoseKey[] = [
  { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-8, 0, 0], ...HANG_ONE_LEGS }, hands: { Right: [0.18, 1.98, 0.12], Left: [-0.46, 1.06, 0.12] }, poles: { Right: UP_R, Left: [-0.8, -0.5, 0.0] } },   // the off arm stays DOWN (phase 9: it pumped back up to 1.84 here)
  { t: 0.4,  bones: { Hips: [2, 0, 0], Spine: [-12, 0, 0], ...HANG_ONE_LEGS }, hands: { Right: [0.19, 2.00, 0.02], Left: [-0.48, 1.02, 0.08] }, poles: { Right: UP_R, Left: [-0.8, -0.5, 0.0] } },
  { t: CARRY_UP_SEC, bones: { Hips: [2, 0, 0], Spine: [-14, 0, 0], ...HANG_ONE_DEEP }, hands: { Right: [0.19, 1.98, -0.08], Left: [-0.48, 1.00, 0.06] }, poles: { Right: UP_R, Left: [-0.8, -0.5, 0.0] }, hold: true },
];
/** Both hands: overhead, then the two-hand wind-up behind the head (the back-scratcher's cock) with the body bowing under it. */
export const CARRY_UP_TWO: PoseKey[] = [
  { t: 0,    bones: { Hips: [0, 0, 0], Spine: [-8, 0, 0], ...OPENING }, hands: { Right: [0.14, 1.98, 0.10], Left: [-0.14, 1.98, 0.10] }, poles: { Right: UP_R, Left: UP_L } },
  { t: 0.4,  bones: { Hips: [2, 0, 0], Spine: [-12, 0, 0], ...TUCK }, hands: { Right: [0.15, 2.00, 0.00], Left: [-0.15, 2.00, 0.00] }, poles: { Right: UP_R, Left: UP_L } },
  { t: CARRY_UP_SEC, bones: { Hips: [2, 0, 0], Spine: [-15, 0, 0], ...BOW }, hands: { Right: [0.15, 1.98, -0.10], Left: [-0.15, 1.98, -0.10] }, poles: { Right: UP_R, Left: UP_L }, hold: true },
];

/** THE FLUSH, one hand (right): cocked over the head → over the ring → through it, the wrist snapping. */
export const FLUSH_ONE: PoseKey[] = [
  { t: 0,    bones: { Hips: [2, 0, 0], Spine: [-14, 0, 0], ...HANG_ONE_DEEP }, hands: { Right: [0.19, 1.98, -0.08], Left: [-0.48, 1.00, 0.06] }, poles: { Right: UP_R, Left: [-0.8, -0.5, 0.0] } },   // the cock the carry ends in, the one-foot hang under it
  { t: 0.12, bones: { Hips: [0, 0, 0], Spine: [2, 0, 0], ...LONG }, hands: { Right: [0.16, 2.06, 0.36], Left: [-0.47, 0.98, 0.06] }, poles: { Right: UP_R, Left: [-0.8, -0.6, 0.0] } },
  { t: 0.24, bones: { Hips: [4, 0, 0], Spine: [14, 0, 0], ...LONG }, hands: { Right: [0.14, 1.80, 0.46], Left: [-0.44, 0.98, 0.10] }, poles: { Right: [0.9, 0.0, -0.3], Left: [-0.8, -0.6, 0.1] } },
  { t: FLUSH_SEC, bones: { Hips: [2, 0, 0], Spine: [8, 0, 0], ...DROP }, hands: { Right: [0.22, 1.52, 0.34], Left: [-0.38, 1.02, 0.18] }, poles: { Right: [0.9, -0.2, -0.3], Left: [-0.8, -0.6, 0.1] }, hold: true },
];
/** THE FLUSH, two hands: over and behind the head → over the ring → both through it. */
export const FLUSH_TWO: PoseKey[] = [
  { t: 0,    bones: { Hips: [2, 0, 0], Spine: [-15, 0, 0], ...BOW }, hands: { Right: [0.15, 1.98, -0.10], Left: [-0.15, 1.98, -0.10] }, poles: { Right: UP_R, Left: UP_L } },   // the two-hand cock
  { t: 0.12, bones: { Hips: [0, 0, 0], Spine: [2, 0, 0], ...LONG }, hands: { Right: [0.15, 2.06, 0.34], Left: [-0.15, 2.06, 0.34] }, poles: { Right: UP_R, Left: UP_L } },
  { t: 0.24, bones: { Hips: [4, 0, 0], Spine: [16, 0, 0], ...LONG }, hands: { Right: [0.15, 1.80, 0.44], Left: [-0.15, 1.80, 0.44] }, poles: { Right: [0.9, 0.0, -0.3], Left: [-0.9, 0.0, -0.3] } },
  { t: FLUSH_SEC, bones: { Hips: [2, 0, 0], Spine: [8, 0, 0], ...DROP }, hands: { Right: [0.24, 1.50, 0.32], Left: [-0.24, 1.50, 0.32] }, poles: { Right: [0.9, -0.2, -0.3], Left: [-0.9, -0.2, -0.3] }, hold: true },
];

export const buildCarryUpOne = (scene: Scene, sk: Skeleton): AnimationGroup | null => buildPoseClip(scene, sk, 'dunk_carry_up', CARRY_UP_SEC, CARRY_UP_ONE);
export const buildCarryUpLeft = (scene: Scene, sk: Skeleton): AnimationGroup | null => buildPoseClip(scene, sk, 'dunk_carry_up_left', CARRY_UP_SEC, mirrorPoseKeys(CARRY_UP_ONE));
export const buildCarryUpTwo = (scene: Scene, sk: Skeleton): AnimationGroup | null => buildPoseClip(scene, sk, 'dunk_carry_up_two', CARRY_UP_SEC, CARRY_UP_TWO);
export const buildFlushOne = (scene: Scene, sk: Skeleton): AnimationGroup | null => buildPoseClip(scene, sk, 'dunk_flush_one', FLUSH_SEC, FLUSH_ONE);
export const buildFlushLeft = (scene: Scene, sk: Skeleton): AnimationGroup | null => buildPoseClip(scene, sk, 'dunk_flush_left', FLUSH_SEC, mirrorPoseKeys(FLUSH_ONE));
export const buildFlushTwo = (scene: Scene, sk: Skeleton): AnimationGroup | null => buildPoseClip(scene, sk, 'dunk_flush_two', FLUSH_SEC, FLUSH_TWO);
