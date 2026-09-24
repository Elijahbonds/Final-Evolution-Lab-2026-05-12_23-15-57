// dunkTakeoff — PUSH 1-2 and the take-off, off one foot and off two (DUNK MOTION phase 7, 2026-09-23).
//
// Owner, mid-pass: "pay attention to the lower body … the running needs to be cleaned up. Lets fix the models not dropping
// their lead leg on off 1 dunks for more flight time — a real cue. Have them forcefully strike their arms into the air at the
// same time they take off. That looks different off 1 and off 2. I teach push 1-2. Reference my book." The book is Elijah
// Bonds, THE ART OF DUNKING (Final Evolution Press), chapters 7 and 8. What it says, and what these clips do:
//
//   · "The penultimate step is the most important step in an approach jump. It is the gather." It is the LONGEST step: a
//     heel-first strike that lowers the centre of mass and starts turning run into rise, and "the arms are driving downward
//     as the penultimate foot strikes the ground". Then the plant, and the arms whip UP as the body leaves it.
//   · One-foot: faster, shallower flexion, "the free leg is not a passenger" — its drive is height and timing. Two-foot:
//     a deeper gather, "the second leg adding impulse through the final ascent", both arms swung from behind.
//   · In the air: "extending the non-dunking arm downward and managing the non-dunking leg … elevating the finishing hand
//     relative to the rim": the hang-time illusion, built from shapes made while the centre of mass is already falling.
//
// The measured faults these replace: the gather was ONE symmetric crouch (legs() gave both legs the same angles), so for the
// last 0.57 s of every run-up both feet sat side by side while the body slid 1.4 m forward — no steps at all. And every
// take-off, one foot or two, played the owner's two-foot capture (both feet leave together, both knees rise together), so a
// one-foot dunk never drove a knee.
//
//   dunk_gather_one / dunk_gather_two   PUSH (the trail foot pushes the run on) · 1 (the long, low penultimate, heel first,
//                                        the ball driven down to the hip) · 2 (the plant ahead — or, off two, the second foot
//                                        closing beside the first under a deeper gather and both arms swung back)
//   dunk_take_off_one                   the plant leg extends and leaves LAST, the free knee drives, both arms STRIKE up on
//                                        the take-off frame, and through the rise the lead leg DROPS long while the take-off
//                                        leg folds behind — the one-foot hang silhouette — with the off arm coming down
//   (off two, the flight stays the owner's own two-foot capture, dunk_mocap)
//
// Convention: the ball hand is the rig's Right, so the take-off foot is the Left and the free (drive) knee the Right, the
// same side as the dunking hand. Foot targets are ankle heights ABOVE THE FLOOR less the key's hipsY (the Hips track lowers
// the legs too, so a target that ignored it would put a planted ankle under the court).
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3, type PoseKey } from '../poseClip';
type V3 = [number, number, number];

export const GATHER_SEC = 0.5;
export const TAKE_OFF_ONE_SEC = 0.82;
/** Ankle height above the floor for a foot on it. */
const ANKLE = 0.09;
/** A foot target (body frame) for an ankle `aboveFloor` metres up, at a key whose Hips track sits at `hipsY`. */
const foot = (x: number, aboveFloor: number, z: number, hipsY: number): V3 => [x, aboveFloor - hipsY, z];
const RIP_POLE = { Left: [-0.3, -0.5, -0.8] as V3, Right: [0.5, -0.4, -0.8] as V3 };
const UP_R: V3 = [0.9, 0.1, -0.3], UP_L: V3 = [-0.9, 0.1, -0.3];

/** PUSH and 1: the legs, shared by both gathers (the penultimate is the right foot; the plant, 2, is the left). The arms are
 *  each gather's own — off one foot the ball comes up off the dribble and is driven down on the penultimate; off two both
 *  arms swing BACK on the push and come UP on 2 (owner, 2026-09-23: "back on push, up on 2 in push 1 2 … that's in a 2 foot
 *  jump"). `hands` are [ball hand, off hand] at PUSH, 1, on 1 and over 1. */
function pushOne(hands: [V3, V3][], poles: { Left: V3; Right: V3 } = RIP_POLE): PoseKey[] {
  // (DUNK MOTION phase 8: every foot here is inside the leg's reach. The strike at 0.5 m ahead was 0.86 m from the hip joint on a
  // 0.82 m leg — the knee locked straight for three frames and snapped 29° — the push leg sat dead straight behind (178°) and
  // folded 62° in two frames, and between keys the penultimate foot dipped 3 cm under the floor. The mid-contact key pins it.)
  return [
    // PUSH: the left foot drives the run on behind (a soft knee, not a locked one), the right swinging through
    { t: 0,    bones: { Hips: [2, 0, 0], Spine: [10, 0, 0] }, feet: { Left: foot(-0.12, ANKLE + 0.02, -0.26, -0.04), Right: foot(0.12, 0.26, 0.14, -0.04) }, hands: { Right: hands[0][0], Left: hands[0][1] }, poles, hipsY: -0.04 },
    // 1 — THE PENULTIMATE: long, low, heel first; the arms drive DOWN as it strikes (the book: that drive is ground force)
    { t: 0.12, bones: { Hips: [4, 0, 0], Spine: [14, 0, 0] }, feet: { Left: foot(-0.12, ANKLE + 0.16, -0.44, -0.14), Right: foot(0.12, ANKLE, 0.40, -0.14) }, hands: { Right: hands[1][0], Left: hands[1][1] }, poles, hipsY: -0.14 },
    // on it: the right foot flat under the body, the left heel kicked up behind as that knee folds to come through
    { t: 0.22, bones: { Hips: [4, 0, 0], Spine: [15, 0, 0] }, feet: { Left: foot(-0.12, 0.28, -0.22, -0.18), Right: foot(0.12, ANKLE, 0.07, -0.18) }, hands: { Right: hands[2][0], Left: hands[2][1] }, poles, hipsY: -0.18 },
    // over the penultimate: the right foot stays on the floor as the body runs over it (it slides back in the body's frame), the
    // hips at their lowest, the left leg swinging through — "lower the hips without breaking the table of the trunk"
    { t: 0.32, bones: { Hips: [4, 0, 0], Spine: [16, 0, 0] }, feet: { Left: foot(-0.12, 0.26, 0.14, -0.20), Right: foot(0.12, ANKLE, -0.26, -0.20) }, hands: { Right: hands[3][0], Left: hands[3][1] }, poles, hipsY: -0.20 },
  ];
}

/** Off ONE: the ball up off the last bounce at the chest, driven down on 1 and ripped to the hip; 2 is the left foot planted AHEAD
 *  of the hips, the right toeing off behind, the arms loaded back at the hip for the strike. */
export const GATHER_ONE: PoseKey[] = [
  ...pushOne([[[0.22, 1.05, 0.28], [0.02, 1.07, 0.30]], [[0.26, 0.92, 0.12], [0.06, 0.94, 0.16]], [[0.27, 0.93, 0.04], [0.07, 0.95, 0.09]], [[0.28, 0.96, -0.04], [0.08, 0.98, 0.02]]]),
  { t: GATHER_SEC, bones: { Hips: [2, 0, 0], Spine: [12, 0, 0] }, feet: { Left: foot(-0.12, ANKLE, 0.38, -0.16), Right: foot(0.12, ANKLE + 0.08, -0.55, -0.16) }, hands: { Right: [0.28, 1.00, -0.12], Left: [0.07, 1.02, -0.04] }, poles: RIP_POLE, hipsY: -0.16 },
];
/** The swinging arms' elbow pole: OUT to the side and a little back — pointed back along an arm swung behind the body, the pole was
 *  degenerate and the upper arm's twist flipped on the backswing (6600°/s on the push, p8b). */
const SWING_POLE = { Left: [-0.85, -0.25, -0.45] as V3, Right: [0.85, -0.25, -0.45] as V3 };
/** Off TWO: the double-arm swing. Both arms BACK on the push (the ball in its hand, the off arm free), driven DOWN past the hips
 *  on 1, through the bottom over it, and on the way UP on 2 — the left foot CLOSING beside the right under a deeper gather.
 *  2 ends where the owner's own two-foot jump (dunk_mocap) begins: the ball hand still low at the hip, the off hand coming
 *  up the front, both rising — the capture whips them overhead from there. */
export const GATHER_TWO: PoseKey[] = [
  ...pushOne([[[0.24, 1.00, -0.38], [-0.22, 1.00, -0.36]], [[0.24, 0.84, -0.22], [-0.22, 0.84, -0.20]], [[0.24, 0.84, -0.17], [-0.22, 0.84, -0.09]], [[0.24, 0.86, -0.12], [-0.23, 0.86, 0.02]]], SWING_POLE),
  { t: GATHER_SEC, bones: { Hips: [6, 0, 0], Spine: [20, 0, 0] }, feet: { Left: foot(-0.14, ANKLE, -0.20, -0.26), Right: foot(0.14, ANKLE, -0.26, -0.26) }, hands: { Right: [0.24, 1.24, -0.15], Left: [-0.25, 1.21, 0.33] }, poles: SWING_POLE, hipsY: -0.26 },   // (hand targets ride the hips' drop: these land ~1.0 m, the capture's own start)
];

/** The one-foot hang: the lead leg dropped long, the take-off leg folded behind (the carry-ups and the flush start from it). */
export const HANG_ONE_LEGS: Record<string, Deg3> = { RightUpLeg: [-16, 0, -4], RightLeg: [20, 0, 0], LeftUpLeg: [16, 0, 5], LeftLeg: [80, 0, 0] };

/** OFF ONE: the plant, the toe-off with the knee drive and the arm strike, the drop, the apex. The root holds on the floor for the
 *  mode's PLANT_SEC (0.1 s), so the toe-off key sits there. */
export const TAKE_OFF_ONE: PoseKey[] = [
  // the plant: the take-off (left) leg under the body and a little ahead, flexed; the free leg behind; the ball loaded at the hip
  { t: 0,    bones: { Hips: [2, 0, 0], Spine: [8, 0, 0], RightUpLeg: [26, 0, -5], RightLeg: [58, 0, 0] }, feet: { Left: foot(-0.12, ANKLE, 0.24, -0.14) }, hands: { Right: [0.28, 1.00, -0.10], Left: [0.08, 1.02, -0.02] }, poles: RIP_POLE, hipsY: -0.14 },
  // TOE-OFF, and the ARMS STRIKE: the take-off leg extended under and behind (it leaves last), the free knee DRIVEN to the hip,
  // both hands struck up the front with the ball — on the same beat, which is the cue
  { t: 0.1,  bones: { Hips: [0, 0, 0], Spine: [2, 0, 0], RightUpLeg: [-86, 0, -6], RightLeg: [96, 0, 0] }, feet: { Left: foot(-0.12, ANKLE, -0.16, 0) }, hands: { Right: [0.16, 1.86, 0.24], Left: [-0.08, 1.80, 0.26] }, poles: { Right: [0.8, -0.3, 0.1], Left: [-0.8, -0.3, 0.1] }, hipsY: 0 },
  // rising: the knee still high, the take-off leg trailing long, the ball overhead with the guide hand still on it
  { t: 0.3,  bones: { Hips: [-2, 0, 0], Spine: [-4, 0, 0], RightUpLeg: [-86, 0, -6], RightLeg: [100, 0, 0], LeftUpLeg: [18, 0, 5], LeftLeg: [40, 0, 0] }, hands: { Right: [0.16, 1.96, 0.16], Left: [-0.14, 1.86, 0.20] }, poles: { Right: UP_R, Left: UP_L } },   // (a touch short of straight: the arms struck up, not locked up)
  // THE DROP: the lead leg comes DOWN long (the cue — the body lengthens under the reaching hand), the take-off leg folds behind
  { t: 0.55, bones: { Hips: [-2, 0, 0], Spine: [-8, 0, 0], RightUpLeg: [-30, 0, -4], RightLeg: [30, 0, 0], LeftUpLeg: [22, 0, 5], LeftLeg: [74, 0, 0] }, hands: { Right: [0.18, 1.98, 0.10], Left: [-0.28, 1.66, 0.22] }, poles: { Right: UP_R, Left: [-0.8, -0.4, 0.1] } },
  // the apex: long under the ball hand, the off arm THROWN DOWN (the book's instrument for the finishing hand's height)
  { t: TAKE_OFF_ONE_SEC, bones: { Hips: [-2, 0, 0], Spine: [-10, 0, 0], ...HANG_ONE_LEGS }, hands: { Right: [0.19, 1.99, 0.04], Left: [-0.40, 1.48, 0.18] }, poles: { Right: UP_R, Left: [-0.8, -0.5, 0.0] }, hold: true },
];
/** Where the ball hand is at the lob's catch beat (clip 0.62) on the one-foot take-off — the key's own target (CATCH_HAND_OFFSET's rule). */
export const TAKE_OFF_ONE_CATCH: V3 = [0.18, 1.985, 0.08];

export const buildGatherOne = (scene: Scene, sk: Skeleton): AnimationGroup | null => buildPoseClip(scene, sk, 'dunk_gather_one', GATHER_SEC, GATHER_ONE);
export const buildGatherTwo = (scene: Scene, sk: Skeleton): AnimationGroup | null => buildPoseClip(scene, sk, 'dunk_gather_two', GATHER_SEC, GATHER_TWO);
export const buildTakeOffOne = (scene: Scene, sk: Skeleton): AnimationGroup | null => buildPoseClip(scene, sk, 'dunk_take_off_one', TAKE_OFF_ONE_SEC, TAKE_OFF_ONE);
