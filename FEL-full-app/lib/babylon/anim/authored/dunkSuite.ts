// Dunk suite: charge gather, launch, score hang, land crouch.
// RE-AUTHORED as pose targets (ship pass 3, rung 1): torso and legs in degrees
// about the parent's bind axes, hands as world-axis metres from the root,
// fitted by the two-bone solver so the suite plays on any body that passes
// Gate 0. The old Euler arm keys rotated about X — the arm's own axis on this
// rig — so the launch never raised the hands (coreClips.test.ts, 2026-09-03).
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3 } from '../poseClip';
import { DUNK_TIMING as D } from './timing';
type V3 = [number, number, number];

const UP = { Left: [-0.9, 0.1, -0.3] as V3, Right: [0.9, 0.1, -0.3] as V3 };
const legs = (thigh: number, knee: number, flare = 4): Record<string, Deg3> => ({ LeftUpLeg: [thigh, 0, flare], RightUpLeg: [thigh, 0, -flare], LeftLeg: [knee, 0, 0], RightLeg: [knee, 0, 0] });

/**
 * THE GATHER: the penultimate step's two-hand RIP (DUNK MOTION, 2026-09-23 — owner: "fix the arms when running too").
 *
 * It was two keys: arms hanging, then both hands swung back and APART behind the hips (±0.28 m, elbows near straight) — an
 * empty-handed sprinter's arm swing, with the ball actually low in one hand by the right knee and the other arm reaching across
 * the body for it (the carry's gather IK). A dunker gathering a power dunk takes the ball in BOTH hands out of the last bounce
 * and rips it to the hip on the long, low penultimate step (the elbows bent, the trunk folding over it), which is the loaded
 * shape the jump's own first frame starts from: the owner's capture plants with the ball back at the right hip.
 */
export function buildChargeGather(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = D.chargeSec;
  const RIP_POLE = { Left: [-0.3, -0.5, -0.8] as V3, Right: [0.5, -0.4, -0.8] as V3 };
  return buildPoseClip(scene, sk, 'dunk_charge_gather', T, [
    { t: 0,        bones: { Hips: [0, 0, 0], Spine: [8, 0, 0],  ...legs(-14, 18) },    hands: { Right: [0.22, 1.02, 0.28], Left: [-0.02, 1.04, 0.30] }, poles: RIP_POLE, hipsY: 0 },       // both hands onto the ball out of the last bounce
    { t: T * 0.55, bones: { Hips: [4, 0, 0], Spine: [20, 0, 0], ...legs(-36, 52, 6) }, hands: { Right: [0.26, 0.98, 0.10], Left: [0.04, 1.00, 0.14] }, poles: RIP_POLE, hipsY: -0.12 },   // the long, low penultimate step
    { t: T,        bones: { Hips: [6, 0, 0], Spine: [28, 0, 0], ...legs(-55, 80, 8) }, hands: { Right: [0.26, 1.02, -0.10], Left: [0.06, 1.02, -0.02] }, poles: RIP_POLE, hipsY: -0.22 },   // ripped to the right hip, loaded — the jump's first frame
  ]);
}

export function buildLaunch(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = D.launchSec;
  return buildPoseClip(scene, sk, 'dunk_launch', T, [
    { t: 0, bones: { Hips: [0, 0, 0], Spine: [30, 0, 0],  ...legs(-55, 80, 8) }, hands: { Left: [-0.28, 0.85, -0.30], Right: [0.28, 0.85, -0.30] }, poles: { Left: [-0.6, 0.4, -0.6], Right: [0.6, 0.4, -0.6] }, hipsY: -0.22 },
    // HOOPS MOVEMENT (2026-09-15): the arms swing UP THE FRONT. Two keys (loaded low-behind → overhead) left the path to the
    // solver and the crossfade, and the shortest way from a hand behind the hip to one over the head passes out to the SIDE:
    // _hoops-biomech-probe measured a T — hands 1.25 m apart at shoulder height, elbows 178° — for ~100 ms of every 1v1 drive
    // dunk launch (the owner: "the arm movement isn't natural"). The mid key carries both hands forward past the chest with
    // the elbows down and in, the way a jumper actually throws the arms, so there is no side to pass through.
    { t: T * 0.45, bones: { Hips: [0, 0, 0], Spine: [12, 0, 0], ...legs(-40, 56, 6) }, hands: { Left: [-0.2, 1.3, 0.42], Right: [0.2, 1.3, 0.42] }, poles: { Left: [-0.5, -0.8, 0.2], Right: [0.5, -0.8, 0.2] }, hipsY: -0.08 },
    { t: T, bones: { Hips: [0, 0, 0], Spine: [-10, 0, 0], ...legs(-26, 34) },    hands: { Left: [-0.18, 1.98, 0.12], Right: [0.18, 1.98, 0.12] }, poles: UP, hipsY: 0.05 },   // both hands thrown overhead, the knees soft (DUNK-POSTURE-LEGS: straight legs read as a stiff hang)
  ]);
}

export function buildScoreHang(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = D.hangSec;
  return buildPoseClip(scene, sk, 'dunk_score_hang', T, [
    // DUNK-POSTURE-LEGS: the knees are keyed too (a soft bend easing out) — un-keyed they held whatever the launch left, a locked leg on the flashy launch
    // DUNK-JOINTS (2026-09-17): and they come UP under a man hanging on the iron — the side frames showed a pole at the contact
    { t: 0,     bones: { Hips: [4, 0, 0], Spine: [-12, 0, 0], LeftUpLeg: [-42, 0, 6], RightUpLeg: [-34, 0, -6], LeftLeg: [58, 0, 0], RightLeg: [50, 0, 0] }, hands: { Left: [-0.12, 2.02, 0.25], Right: [0.30, 1.25, 0.10] }, poles: { Left: UP.Left } },   // left hand on the rim
    { t: T / 2, bones: { Hips: [2, 0, 0], Spine: [-5, 0, 0],  LeftUpLeg: [-26, 0, 4], RightUpLeg: [-22, 0, -4], LeftLeg: [40, 0, 0], RightLeg: [36, 0, 0] }, hands: { Left: [-0.10, 1.95, 0.28], Right: [0.34, 1.35, 0.05] }, poles: { Left: UP.Left } },
    // DUNK-POSTURE-LEGS (L3): the old "letting go" key put both hands straight out FRONT at shoulder height — the pose the rim hang
    // held for a second after every clean slam read as a forward T. The ball hand stays up near the iron (elbow bent), the off
    // hand settles to the chest: a rim hang, and a shape the land crouch's overhead first key blends from without a sweep.
    { t: T,     bones: { Hips: [0, 0, 0], Spine: [2, 0, 0],   LeftUpLeg: [-10, 0, 2], RightUpLeg: [-10, 0, -2], LeftLeg: [22, 0, 0], RightLeg: [22, 0, 0] }, hands: { Left: [-0.18, 1.74, 0.22], Right: [0.26, 1.30, 0.18] }, poles: { Left: [-0.9, 0.0, -0.3], Right: [0.9, -0.2, -0.3] } },   // letting go: the ball hand still up, the off hand to the chest
  ]);
}

export function buildLandCrouch(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = D.landSec, M = T * 0.4;
  // DUNK-POSTURE (2026-09-08): feet-down crossfades into this clip from a finish (hands overhead) or the blown brace (hands
  // in front of the face), and the old low first key left the arms' descent to the BLEND — the shortest rotation from an
  // overhead arm to a low one passes through the side (measured: the tomahawk → land blend swept the hands to a 1.2 m T
  // at shoulder height for ~100 ms, the "dead land" the eye called). The descent is AUTHORED now: the first key meets the
  // finishes overhead (their own UP elbow poles, so the blend has nothing to turn), the second brings the hands down the
  // FRONT to the chest, then the absorb. A brace's hands (face height, in front) blend into the same front path.
  return buildPoseClip(scene, sk, 'dunk_land_crouch', T, [
    { t: 0,    bones: { Hips: [0, 0, 0], Spine: [2, 0, 0],  ...legs(-12, 16) },    hands: { Left: [-0.20, 1.92, 0.08], Right: [0.20, 1.92, 0.08] }, poles: { Left: [-0.9, 0.1, -0.3], Right: [0.9, 0.1, -0.3] }, hipsY: 0.04 },
    { t: 0.08, bones: { Hips: [0, 0, 0], Spine: [10, 0, 0], ...legs(-30, 42, 6) }, hands: { Left: [-0.22, 1.38, 0.38], Right: [0.22, 1.38, 0.38] }, poles: { Left: [-0.9, 0.0, -0.3], Right: [0.9, 0.0, -0.3] }, hipsY: -0.08 },   // down the front, into the crouch — the elbows stay OUT until the hands are low (a pole flip between keys is a lateral sweep of the arm; at hip height it is invisible)
    { t: M, bones: { Hips: [0, 0, 0], Spine: [26, 0, 0], ...legs(-60, 85, 8) }, hands: { Left: [-0.34, 0.85, 0.34], Right: [0.34, 0.85, 0.34] }, hipsY: -0.26 },   // absorb, arms forward for balance
    { t: T, bones: { Hips: [0, 0, 0], Spine: [6, 0, 0],  ...legs(-14, 18) },    hands: { Left: [-0.26, 0.86, 0.12], Right: [0.26, 0.86, 0.12] }, hipsY: 0 },
  ]);
}
