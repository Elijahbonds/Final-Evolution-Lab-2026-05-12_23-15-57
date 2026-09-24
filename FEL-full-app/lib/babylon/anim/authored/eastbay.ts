// dunk_360_eastbay — the reference dunk: Isaiah Rider's 1994 EAST BAY FUNK DUNK. Seven beats (see timing.ts):
// gather → the off hand takes it (swap) → rise/knee up → ball under the knee → hand-to-hand → carry up → one-hand extension → hang.
// Hands as world-axis metres from the root fitted by the two-bone solver; torso and legs in degrees about the parent's bind axes
// (ship pass 3, rung 1 — the old Euler arm keys rotated about the arm's own axis and the hand never reached the rim).
//
// DUNK MOTION phase 10b (2026-09-24, drafted in phase 7): THE PASS GOES THE OTHER WAY. The dunk is a pass from the NON-dominant hand
// to the dominant hand under the raised leg, and the dominant hand finishes (Haugen's dunk definitions: "transfers the ball under
// their left leg from left to right hand, and finishes the dunk with their right hand"). Ours passed it the other way — the right
// hand reached under the left thigh from between the legs and gave it to the left, which went up and dunked off-handed: a mirror
// image of the dunk, and the finish on the weak hand is what a dunk fan notices first.
//
// So: the ball comes up the front in both hands, the LEFT takes it (T.swap) and swings it down the OUTSIDE of the rising left knee;
// the left hand feeds it under the thigh to the RIGHT hand waiting between the legs (T.handOff); the right hand carries it up the
// middle and extends to the rim, the left arm thrown out for balance. The ball follows the same beats (ballRig.EASTBAY_PASSES).
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip } from '../poseClip';
import { EASTBAY_TIMING as T } from './timing';
type V3 = [number, number, number];

const UP_R: V3 = [0.9, 0.1, -0.3];

export function buildEastbay(scene: Scene, skeleton: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, skeleton, 'dunk_360_eastbay', T.duration, [
    // gather: the ball in both hands up the front, knees loaded
    { t: T.gather,    bones: { Hips: [8, 0, 0],   Spine: [14, 0, 0],  Spine2: [8, 0, 0],   Neck: [6, 0, 0],   LeftUpLeg: [-24, 0, 0], LeftLeg: [30, 0, 0],  RightUpLeg: [-18, 0, -4], RightLeg: [26, 0, 0] }, hands: { Right: [0.12, 1.30, 0.34], Left: [-0.12, 1.30, 0.34] } },
    // the left takes it; the left knee starts to drive
    { t: T.swap, bones: { Hips: [6, -6, 0], Spine: [12, -4, 0], Spine2: [6, 0, 0], LeftUpLeg: [-60, 0, 6], LeftLeg: [70, 0, 0], RightUpLeg: [-18, 0, -5], RightLeg: [24, 0, 0] }, hands: { Left: [-0.14, 1.22, 0.36], Right: [0.02, 1.24, 0.36] } },
    // rise: the left knee UP and it stays up; the left hand swings the ball down the OUTSIDE of it, the right goes to the gap
    { t: T.rise,      bones: { Hips: [8, -10, 0], Spine: [16, -6, 0], Spine2: [8, 0, 0],                      LeftUpLeg: [-95, 0, 10], LeftLeg: [96, 0, 0], RightUpLeg: [-20, 0, -6], RightLeg: [24, 0, 0] }, hands: { Left: [-0.36, 0.86, 0.26], Right: [0.10, 0.92, 0.22] }, poles: { Left: [-0.9, -0.2, 0.1], Right: [0.8, -0.3, 0.2] } },
    // under the knee: the left hand takes it UNDER the raised thigh from the outside, the right waits between the legs; eyes on it
    { t: T.underKnee, bones: { Hips: [10, -14, 0], Spine: [20, -8, 0], Spine2: [10, -6, 0], Neck: [24, 0, 0], LeftUpLeg: [-98, 0, 10], LeftLeg: [98, 0, 0], RightUpLeg: [-20, 0, -6], RightLeg: [24, 0, 0] }, hands: { Left: [-0.24, 0.62, 0.34], Right: [0.00, 0.66, 0.30] }, poles: { Left: [-0.9, -0.3, 0.3], Right: [0.9, -0.3, 0.3] } },
    // the pass under the leg: both palms meet on the ball under the thigh
    { t: T.handOff,   bones: { Hips: [8, -8, 0],  Spine: [16, 6, 0],  Spine2: [8, 8, 0],                       LeftUpLeg: [-100, 0, 10], LeftLeg: [100, 0, 0], RightUpLeg: [-20, 0, -6], RightLeg: [24, 0, 0] }, hands: { Left: [-0.12, 0.60, 0.36], Right: [-0.04, 0.60, 0.34] }, poles: { Left: [-0.9, -0.3, 0.3], Right: [0.9, -0.3, 0.3] } },
    // carry up: the RIGHT hand carries it up the middle, the left arm out for balance, the knee coming down
    { t: T.carryUp,   bones: { Hips: [-4, -6, 0], Spine: [-6, 0, 0],  Spine2: [-6, 0, 0], Neck: [-10, 0, 0], LeftUpLeg: [-58, 0, 6], LeftLeg: [56, 0, 0],  RightUpLeg: [-12, 0, -4], RightLeg: [16, 0, 0] }, hands: { Right: [0.14, 1.42, 0.30], Left: [-0.44, 1.20, -0.05] }, poles: { Right: [0.9, -0.2, -0.4] } },
    // one-hand extension to the rim, the dominant hand
    { t: T.extend,    bones: { Hips: [-8, 0, 0],  Spine: [-14, 0, 0], Spine2: [-10, 0, 0], Neck: [-18, 0, 0], LeftUpLeg: [-30, 0, 4], LeftLeg: [32, 0, 0],  RightUpLeg: [-12, 0, -4], RightLeg: [16, 0, 0] }, hands: { Right: [0.14, 2.02, 0.24], Left: [-0.38, 1.45, -0.10] }, poles: { Right: UP_R } },
    // hang
    { t: T.hang,      bones: { Hips: [-4, 0, 0],  Spine: [-8, 0, 0],  Spine2: [-6, 0, 0],  Neck: [-8, 0, 0],  LeftUpLeg: [-20, 0, 2], LeftLeg: [25, 0, 0],  RightUpLeg: [-16, 0, -4], RightLeg: [18, 0, 0] }, hands: { Right: [0.14, 1.92, 0.30], Left: [-0.32, 1.30, 0.05] }, poles: { Right: UP_R } },
  ]);
}
