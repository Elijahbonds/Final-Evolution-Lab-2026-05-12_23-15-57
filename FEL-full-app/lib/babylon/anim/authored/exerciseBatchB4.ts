// Exercise loops, BATCH B4 (FITNESS-TPOSE loop plan 2026-10-26, tier 4 by coverage, the next ten non-hoops loops: ranks 57–64,
// 66, 67). Same authoring as exercise.ts and exerciseBatchA.ts (pose clips, targets in the FINAL frame, in place).
// One representative loop per id (named in each doc comment). One-sided movements are authored on the RIGHT and mirrored
// in-loop (exerciseKit.alternate). ex_step_up and ex_grip_wrist use the stage's 'seat' box (0.34 × 0.44 × 0.42 m at the root).
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import {
  ANKLE, both, bothDir, loop, rep, mix, alternate, seat,
  STANCE, SQUAT_FEET, KNEES_OUT, HANG, HANG_POLES, ELBOWS_OUT, ELBOWS_DOWN, ELBOWS_BACK, STAND, SEAT_Y,
  type ExKey, type Pair, type V3, type Deg3,
} from './exerciseKit';

type K = Omit<ExKey, 't'>;
const at = (e: K, t: number, hold = false): ExKey => ({ ...e, t, ...(hold ? { hold: true } : {}) });

/** ex_hip_thrust — the hip thrust shown from the floor (barbell glute bridge): on the back, knees up, both hands holding a bar
 *  across the hips; drive the hips up, squeeze and hold a second, lower (hip thrust, butt lifts, bridge holds). The bench
 *  version needs a bench placed BEHIND the shoulders, which the stage's props (all centred on the root) cannot do. */
export function buildExHipThrust(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.16, ANKLE, 0.46);
  const down: K = { bones: { Hips: [-86, 0, 0], Spine: [0, 0, 0], Neck: [10, 0, 0] }, feet, kneePoles: bothDir(0.1, 1, 0.2), hands: both(0.22, 0.30, 0.02), poles: bothDir(0.8, 0.4, 0), hipsY: -0.80 };
  const up: K = { bones: { Hips: [-118, 0, 0], Spine: [0, 0, 0], Neck: [34, 0, 0] }, feet, kneePoles: bothDir(0.1, 1, 0.4), hands: both(0.22, 0.52, 0.02), poles: bothDir(0.8, 0.4, 0), hipsY: -0.58 };
  return rep(scene, sk, 'ex_hip_thrust', down, up, 0.8, 1.0, 0.9, 0.4);
}

/** ex_row_single — the one-arm dumbbell row: feet square, hinged to about 60°, the left hand braced on the left knee, the
 *  right arm hangs and rows to the hip; then the left arm (one-arm DB / KB rows; renegade and cable rows play it). */
export function buildExRowSingle(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.15, ANKLE, 0.12);
  const bones = { Hips: [56, 0, 0] as Deg3, Spine: [4, 0, 0] as Deg3, Neck: [-28, 0, 0] as Deg3, LeftLeg: [22, 0, 0] as Deg3, RightLeg: [22, 0, 0] as Deg3, LeftFoot: [-10, 0, 0] as Deg3, RightFoot: [-10, 0, 0] as Deg3 };
  const brace: V3 = [-0.16, 0.50, 0.30];
  const hang: K = { bones, feet, kneePoles: bothDir(0.1, 0, 1), hands: { Left: brace }, rel: { Right: [-0.02, -0.50, 0.04] }, poles: { Left: [-0.6, 0, -0.6], Right: [0.3, 0.4, -0.8] }, hipsY: -0.12 };
  const pulled: K = { ...hang, rel: { Right: [0.04, -0.24, -0.20] }, poles: { Left: [-0.6, 0, -0.6], Right: [0.2, 0.6, -0.8] } };
  return loop(scene, sk, 'ex_row_single', 4.0, alternate([at(hang, 0, true), at(mix(hang, pulled, 0.5), 0.35), at(pulled, 0.7, true), at(pulled, 0.95, true), at(mix(pulled, hang, 0.5), 1.4), at(hang, 1.8, true)], 2.0));
}

/** ex_cable_crossover — the standing cable crossover / fly: a slight forward lean, the arms open wide and high, elbows soft,
 *  sweep down and together in front of the hips, and open again (cable / band crossovers, iron cross, standing flyes). */
export function buildExCableCrossover(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet: Pair = { Left: [-0.14, ANKLE, 0.18], Right: [0.14, ANKLE, -0.06] };
  const bones = { Hips: [12, 0, 0] as Deg3, Spine: [4, 0, 0] as Deg3, Neck: [-6, 0, 0] as Deg3, LeftFoot: [-4, 0, 0] as Deg3 };
  const open: K = { bones, feet, kneePoles: bothDir(0.1, 0, 1), hands: both(0.62, 1.46, 0.02), poles: bothDir(0.2, -0.6, -0.8), hipsY: -0.04 };
  const shut: K = { bones, feet, kneePoles: bothDir(0.1, 0, 1), hands: both(0.08, 1.02, 0.44), poles: bothDir(0.8, -0.4, -0.3), hipsY: -0.04 };
  return rep(scene, sk, 'ex_cable_crossover', open, shut, 0.9, 0.3, 1.0, 0.3);
}

/** ex_good_morning_var — the sumo deadlift: a wide stance with the toes out, the hands inside the knees, the hips sit back and
 *  down and stand tall (sumo / band / chain deadlifts, pull-throughs and the hinge-pattern variants play it). */
export function buildExGoodMorningVar(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.30, ANKLE, 0.12);
  const top: K = { bones: { ...STAND, LeftFoot: [0, -16, 0], RightFoot: [0, 16, 0] }, feet, kneePoles: bothDir(0.5, 0, 1), rel: { Left: [0.10, -0.52, 0.08], Right: [-0.10, -0.52, 0.08] }, poles: HANG_POLES, hipsY: -0.02 };
  const bottom: K = { bones: { Hips: [44, 0, 0], Spine: [4, 0, 0], Neck: [-26, 0, 0], LeftFoot: [-16, -16, 0], RightFoot: [-16, 16, 0] }, feet, kneePoles: bothDir(0.6, 0, 1), rel: { Left: [0.12, -0.53, 0.06], Right: [-0.12, -0.53, 0.06] }, poles: HANG_POLES, hipsY: -0.30 };
  return rep(scene, sk, 'ex_good_morning_var', top, bottom, 1.1, 0.2, 1.0, 0.4);
}

/** ex_dynamic_warmup — the front-to-back leg swing: standing tall on the left leg, hands on the hips, the right leg swings
 *  forward and up, back behind, and forward again; then the left (dynamic warm-up: leg raises, groiners, toe touches, joint
 *  circles play this one). */
export function buildExDynamicWarmup(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const hips: Pair = { Left: [-0.20, 0.98, 0.02], Right: [0.20, 0.98, 0.02] };
  const base = (thigh: number, knee: number, foot: number, lean: number): K => ({
    bones: { ...STAND, Hips: [lean, 0, 0], RightUpLeg: [thigh, 0, 0], RightLeg: [knee, 0, 0], RightFoot: [foot, 0, 0] },
    feet: { Left: [-0.10, ANKLE, 0.04] }, kneePoles: bothDir(0.05, 0, 1), hands: hips, poles: bothDir(1, -0.2, -0.3), hipsY: 0,
  });
  const stand: K = { bones: STAND, feet: both(0.10, ANKLE, 0.04), kneePoles: bothDir(0.05, 0, 1), hands: hips, poles: bothDir(1, -0.2, -0.3), hipsY: 0 };
  return loop(scene, sk, 'ex_dynamic_warmup', 4.0, alternate([
    at(stand, 0, true), at(base(-20, 16, 0, 0), 0.3), at(base(-62, 8, 10, -4), 0.65), at(base(-20, 20, 0, 0), 1.0), at(base(26, 26, 10, 8), 1.35), at(base(-20, 20, 0, 0), 1.65), at(stand, 1.85),
  ], 2.0));
}

/** ex_squat_var — the overhead squat: the arms locked out wide overhead, the trunk upright, sit down between the heels and
 *  stand (overhead / one-arm overhead squats; Zercher, box, sandbag and Spanish squats play it). */
export function buildExSquatVar(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const over: Pair = { Left: [-0.20, 0.56, -0.04], Right: [0.20, 0.56, -0.04] };
  const top: K = { bones: { ...STAND, Hips: [2, 0, 0] }, feet: SQUAT_FEET, kneePoles: KNEES_OUT, rel: over, poles: bothDir(1, 0.2, -0.2), hipsY: 0 };
  const bottom: K = { bones: { Hips: [18, 0, 0], Spine: [4, 0, 0], Spine1: [-4, 0, 0], Neck: [-10, 0, 0], LeftFoot: [-34, 0, 0], RightFoot: [-34, 0, 0] }, feet: SQUAT_FEET, kneePoles: KNEES_OUT, rel: over, poles: bothDir(1, 0.2, -0.2), hipsY: -0.40 };
  return rep(scene, sk, 'ex_squat_var', top, bottom, 1.1, 0.25, 0.9, 0.45);
}

/** ex_rotator_cuff — the shoulder external rotation: the elbows bent 90° and pinned to the sides, the forearms swing out from
 *  pointing forward to about 60° out, and back (band / cable external and internal rotation, side-lying and 90-90 variants). */
export function buildExRotatorCuff(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const inK: K = { bones: STAND, feet: STANCE, hands: both(0.16, 1.03, 0.34), poles: bothDir(0.2, -1, -0.3), hipsY: 0 };
  const outK: K = { bones: STAND, feet: STANCE, hands: both(0.42, 1.03, 0.18), poles: bothDir(0.2, -1, -0.3), hipsY: 0 };
  return rep(scene, sk, 'ex_rotator_cuff', inK, outK, 0.8, 0.4, 1.0, 0.3);
}

/** ex_leg_curl_slider — the slider (or ball) leg curl: in a bridge on the heels, hips up, the heels slide out until the legs are
 *  nearly straight and pull back in under the knees, the hips staying high (slider / ball / platform leg curls; Nordic curls are
 *  not shown separately). */
export function buildExLegCurlSlider(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const arms = both(0.30, 0.04, -0.30);
  const inK: K = { bones: { Hips: [-118, 0, 0], Spine: [0, 0, 0], Neck: [34, 0, 0], LeftFoot: [-24, 0, 0], RightFoot: [-24, 0, 0] }, feet: both(0.14, ANKLE, 0.50), kneePoles: bothDir(0.1, 1, 0.4), hands: arms, poles: bothDir(0.6, 0.3, 0), hipsY: -0.60 };
  const outK: K = { bones: { Hips: [-100, 0, 0], Spine: [0, 0, 0], Neck: [24, 0, 0], LeftFoot: [-30, 0, 0], RightFoot: [-30, 0, 0] }, feet: both(0.14, ANKLE, 0.92), kneePoles: bothDir(0.1, 1, 0.3), hands: arms, poles: bothDir(0.6, 0.3, 0), hipsY: -0.70 };
  return loop(scene, sk, 'ex_leg_curl_slider', 2.8, [at(inK, 0, true), at(mix(inK, outK, 0.5), 0.55), at(outK, 1.1, true), at(outK, 1.3, true), at(mix(outK, inK, 0.5), 1.9), at(inK, 2.4, true)]);
}

/** ex_grip_wrist — the seated wrist curl: sitting on the box, the forearms along the thighs, the wrists just past the knees, the
 *  hands curl up and lower (wrist curls palms up / down, finger curls, plate pinches play it). Sits on the 'seat' prop. */
export function buildExGripWrist(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const lean = { Hips: [28, 0, 0] as Deg3, Spine: [10, 0, 0] as Deg3, Neck: [-24, 0, 0] as Deg3 };
  const hands = both(0.17, 0.66, 0.50);
  const pose = (flex: number): K => seat({ bones: { ...lean, LeftHand: [flex, 0, 0], RightHand: [flex, 0, 0] }, hands, poles: bothDir(0.3, 0.6, -0.6) });
  return loop(scene, sk, 'ex_grip_wrist', 2.0, [at(pose(30), 0, true), at(pose(0), 0.45), at(pose(-40), 0.9, true), at(pose(-40), 1.1, true), at(pose(0), 1.55)]);
}

/** ex_step_up — the box step-up: from both feet on the floor behind the box, the right foot steps up onto it, drive up through
 *  the right leg until standing on the box, step the left foot back down, then the right; then lead with the left (step-ups,
 *  lateral / crossover step-ups play it). Uses the 'seat' box (0.44 m) under the body. */
export function buildExStepUp(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const TOP = 0.44 + ANKLE;
  const onBox = (x: number): V3 => [x, TOP, 0.04];
  const back = (x: number): V3 => [x, ANKLE, -0.36];
  const arms: Pair = both(0.24, 0.84 - 0.12, 0.10);
  const floorBoth: K = { bones: { Hips: [24, 0, 0], Spine: [8, 0, 0], Neck: [-16, 0, 0], LeftFoot: [-20, 0, 0], RightFoot: [-20, 0, 0] }, feet: { Left: back(-0.10), Right: back(0.10) }, kneePoles: bothDir(0.1, 0, 1), hands: arms, poles: HANG_POLES, hipsY: -0.12 };
  const stepR: K = { ...floorBoth, bones: { ...floorBoth.bones, RightUpLeg: [-60, 0, 0], RightFoot: [0, 0, 0] }, feet: { Left: back(-0.10), Right: [0.10, TOP + 0.10, -0.14] }, hipsY: -0.12 };
  const start: K = {
    bones: { Hips: [24, 0, 0], Spine: [8, 0, 0], Neck: [-16, 0, 0], LeftFoot: [-20, 0, 0], RightFoot: [-10, 0, 0] },
    feet: { Right: onBox(0.10), Left: back(-0.10) }, kneePoles: bothDir(0.1, 0, 1), hands: { Left: [-0.18, 1.05 - 0.12, 0.22], Right: [0.24, 0.84 - 0.12, -0.10] }, poles: bothDir(0.3, -0.6, -0.7), hipsY: -0.12,
  };
  const lift: K = { ...start, bones: { ...start.bones, Hips: [10, 0, 0], LeftUpLeg: [-30, 0, 0], LeftFoot: [-10, 0, 0] }, feet: { Right: onBox(0.10), Left: [-0.10, TOP + 0.16, -0.18] }, hipsY: 0.22 };
  const topK: K = { bones: { ...STAND }, feet: { Right: onBox(0.10), Left: onBox(-0.10) }, kneePoles: bothDir(0.1, 0, 1), hands: both(0.24, 0.84 + 0.44, 0.06), poles: HANG_POLES, hipsY: 0.44 };
  const down: K = { ...lift, bones: { ...start.bones, Hips: [14, 0, 0], LeftUpLeg: [10, 0, 0], LeftLeg: [20, 0, 0], LeftFoot: [-10, 0, 0] }, feet: { Right: onBox(0.10), Left: [-0.10, TOP + 0.10, -0.30] }, hipsY: 0.18 };
  const stepDownR: K = { ...floorBoth, bones: { ...floorBoth.bones, RightUpLeg: [-50, 0, 0], RightFoot: [0, 0, 0] }, feet: { Left: back(-0.10), Right: [0.10, TOP + 0.08, -0.18] } };
  return loop(scene, sk, 'ex_step_up', 6.0, alternate([
    at(floorBoth, 0, true), at(stepR, 0.35), at(start, 0.65, true), at(mix(start, lift, 0.5), 0.9), at(lift, 1.15), at(mix(lift, topK, 0.5), 1.35), at(topK, 1.6, true), at(topK, 1.8, true),
    at(mix(topK, down, 0.5), 1.98), at(down, 2.15), at(mix(down, start, 0.5), 2.35), at(start, 2.5, true), at(stepDownR, 2.75),
  ], 3.0));
}

/** Batch B4: [clip name, builder], in plan order. */
export const EXERCISE_BATCH_B4_BUILDERS: readonly [string, (scene: Scene, sk: Skeleton) => AnimationGroup | null][] = [
  ['ex_hip_thrust', buildExHipThrust], ['ex_row_single', buildExRowSingle], ['ex_cable_crossover', buildExCableCrossover], ['ex_good_morning_var', buildExGoodMorningVar],
  ['ex_dynamic_warmup', buildExDynamicWarmup], ['ex_squat_var', buildExSquatVar], ['ex_rotator_cuff', buildExRotatorCuff], ['ex_leg_curl_slider', buildExLegCurlSlider],
  ['ex_grip_wrist', buildExGripWrist], ['ex_step_up', buildExStepUp],
];
export const EXERCISE_BATCH_B4_CLIPS: readonly string[] = EXERCISE_BATCH_B4_BUILDERS.map(([n]) => n);
