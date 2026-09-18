// dunk_360_eastbay — the reference dunk. Six beats (see timing.ts):
// gather → rise/knee up → ball under the knee → hand-to-hand → carry up →
// one-hand extension → hang. Ball choreography in ballRig uses these SAME
// timestamps: the ball rides the RIGHT hand until T.handOff, the LEFT after.
//
// RE-AUTHORED as pose targets (ship pass 3, rung 1): hands as world-axis
// metres from the root, fitted by the two-bone solver; torso and legs in
// degrees about the parent's bind axes. The old Euler arm keys rotated about
// X — the arm's own axis on this rig — so the left hand never reached the rim
// (coreClips.test.ts, 2026-09-03).
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip } from '../poseClip';
import { EASTBAY_TIMING as T } from './timing';
type V3 = [number, number, number];

const UP_L: V3 = [-0.9, 0.1, -0.3];

export function buildEastbay(scene: Scene, skeleton: Skeleton): AnimationGroup | null {
  return buildPoseClip(scene, skeleton, 'dunk_360_eastbay', T.duration, [
    // gather: ball in the right hand, low in front; knees loaded
    { t: T.gather,    bones: { Hips: [14, 0, 0],  Spine: [22, 0, 0],  Spine2: [12, 0, 0],  Neck: [10, 0, 0],  LeftUpLeg: [-18, 0, 0], LeftLeg: [24, 0, 0],  RightUpLeg: [-20, 0, -4], RightLeg: [30, 0, 0] }, hands: { Right: [0.22, 0.85, 0.30], Left: [-0.22, 0.90, 0.28] } },
    // rise: left knee drives up and STAYS up; right hand takes the ball down and out
    { t: T.rise,      bones: { Hips: [4, 18, 0],  Spine: [8, 0, 0],   Spine2: [4, 0, 0],                       LeftUpLeg: [-95, 0, 8], LeftLeg: [96, 0, 0],  RightUpLeg: [-20, 0, -6], RightLeg: [24, 0, 0] }, hands: { Right: [0.30, 0.75, 0.15], Left: [-0.30, 1.05, 0.20] } },
    // under the knee: the right hand reaches beneath the raised left thigh
    { t: T.underKnee, bones: { Hips: [8, 30, 0],  Spine: [18, 6, 0],  Spine2: [10, 8, 0],  Neck: [24, 0, 0],  LeftUpLeg: [-98, 0, 8], LeftLeg: [98, 0, 0],  RightUpLeg: [-20, 0, -6], RightLeg: [24, 0, 0] }, hands: { Right: [-0.02, 0.62, 0.30], Left: [-0.22, 0.75, 0.42] }, poles: { Right: [0.9, -0.3, 0.3], Left: [-0.9, -0.3, 0.3] } },
    // hand-off beneath the leg: both hands meet under the thigh
    { t: T.handOff,   bones: { Hips: [8, 40, 0],  Spine: [16, -6, 0], Spine2: [8, -8, 0],                      LeftUpLeg: [-100, 0, 8], LeftLeg: [100, 0, 0], RightUpLeg: [-20, 0, -6], RightLeg: [24, 0, 0] }, hands: { Right: [-0.06, 0.60, 0.34], Left: [-0.14, 0.60, 0.36] }, poles: { Right: [0.9, -0.3, 0.3], Left: [-0.9, -0.3, 0.3] } },
    // carry up: the receiving left hand carries the ball up; right arm out for balance
    { t: T.carryUp,   bones: { Hips: [-4, 12, 0], Spine: [-6, 0, 0],  Spine2: [-6, 0, 0], Neck: [-10, 0, 0],  LeftUpLeg: [-60, 0, 4], LeftLeg: [55, 0, 0],  RightUpLeg: [-12, 0, -4], RightLeg: [14, 0, 0] }, hands: { Left: [-0.24, 1.40, 0.30], Right: [0.42, 1.20, -0.05] }, poles: { Left: [-0.9, -0.2, -0.4] } },
    // one-hand extension to the rim
    { t: T.extend,    bones: { Hips: [-8, 0, 0],  Spine: [-14, 0, 0], Spine2: [-10, 0, 0], Neck: [-18, 0, 0], LeftUpLeg: [-30, 0, 0], LeftLeg: [30, 0, 0],  RightUpLeg: [-12, 0, -4], RightLeg: [14, 0, 0] }, hands: { Left: [-0.14, 2.02, 0.24], Right: [0.36, 1.45, -0.10] }, poles: { Left: UP_L } },
    // hang
    { t: T.hang,      bones: { Hips: [-4, 0, 0],  Spine: [-8, 0, 0],  Spine2: [-6, 0, 0],  Neck: [-8, 0, 0],  LeftUpLeg: [-20, 0, 0], LeftLeg: [25, 0, 0],  RightUpLeg: [-16, 0, -4], RightLeg: [18, 0, 0] }, hands: { Left: [-0.14, 1.92, 0.30], Right: [0.32, 1.30, 0.05] }, poles: { Left: UP_L } },
  ]);
}
