// Exercise loops, BATCH B3 (FITNESS-TPOSE loop plan 2026-10-26, tier 4 by coverage, the next ten non-hoops loops: ranks 45–47,
// 49, 51–56). Same authoring as exercise.ts and exerciseBatchA.ts (pose clips, targets in the FINAL frame, in place).
// One representative loop per id (named in each doc comment). One-sided movements are authored on the RIGHT and mirrored
// in-loop (exerciseKit.alternate).
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import {
  ANKLE, TOE_ANKLE, both, bothDir, loop, rep, mix, alternate,
  STANCE, HANG_POLES, ELBOWS_OUT, ELBOWS_BACK, STAND,
  type ExKey, type Pair, type V3, type Deg3,
} from './exerciseKit';

type K = Omit<ExKey, 't'>;
const at = (e: K, t: number, hold = false): ExKey => ({ ...e, t, ...(hold ? { hold: true } : {}) });

/** ex_ladder — agility-ladder quick feet in place, the in-in-out-out pattern: right foot out, left foot out, right in, left
 *  in, on the balls of the feet in an athletic stance; then led by the left (ladder drills; the ladder is not drawn). */
export function buildExLadder(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const IN = 0.10, OUT = 0.30;
  const base = { Hips: [14, 0, 0] as Deg3, Spine: [6, 0, 0] as Deg3, Neck: [-12, 0, 0] as Deg3 };
  const hands: Pair = { Left: [-0.24, 0.92, 0.10], Right: [0.24, 0.92, 0.10] };
  const pose = (lx: number, rx: number, lift?: 'Left' | 'Right'): K => ({
    bones: { ...base, LeftFoot: [lift === 'Left' ? 0 : -8, 0, 0], RightFoot: [lift === 'Right' ? 0 : -8, 0, 0] },
    feet: { Left: [-lx, ANKLE + (lift === 'Left' ? 0.09 : 0), 0.04], Right: [rx, ANKLE + (lift === 'Right' ? 0.09 : 0), 0.04] },
    kneePoles: bothDir(0.15, 0, 1), hands, poles: bothDir(0.3, -0.6, -0.7), hipsY: -0.08,
  });
  return loop(scene, sk, 'ex_ladder', 1.6, alternate([
    at(pose(IN, IN), 0), at(pose(IN, (IN + OUT) / 2, 'Right'), 0.1), at(pose(IN, OUT), 0.2), at(pose((IN + OUT) / 2, OUT, 'Left'), 0.3),
    at(pose(OUT, OUT), 0.4), at(pose(OUT, (IN + OUT) / 2, 'Right'), 0.5), at(pose(OUT, IN), 0.6), at(pose((IN + OUT) / 2, IN, 'Left'), 0.7),
  ], 0.8));
}

/** ex_row_chest_supported — the chest-supported row shape: the torso held at 45°, the feet set back, the arms hanging straight
 *  and rowing up with the elbows wide to the ribs (chest-supported / seal / incline-bench rows). The prone pad is NOT drawn:
 *  the stage has no prone-incline prop (DEMO_PROPS 'incline' is a back-rest). */
export function buildExRowChestSupported(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.15, ANKLE, -0.06);
  const bones = { Hips: [45, 0, 0] as Deg3, Spine: [0, 0, 0] as Deg3, Neck: [-26, 0, 0] as Deg3, LeftLeg: [10, 0, 0] as Deg3, RightLeg: [10, 0, 0] as Deg3, LeftFoot: [-8, 0, 0] as Deg3, RightFoot: [-8, 0, 0] as Deg3 };
  const hang: K = { bones, feet, kneePoles: bothDir(0.1, 0, 1), rel: { Left: [0.02, -0.50, 0.04], Right: [-0.02, -0.50, 0.04] }, poles: ELBOWS_OUT, hipsY: -0.06 };
  const pulled: K = { bones, feet, kneePoles: bothDir(0.1, 0, 1), rel: { Left: [-0.06, -0.26, -0.14], Right: [0.06, -0.26, -0.14] }, poles: bothDir(0.9, 0.4, -0.3), hipsY: -0.06 };
  return rep(scene, sk, 'ex_row_chest_supported', hang, pulled, 0.7, 0.3, 0.9, 0.3);
}

/** ex_lateral_raise_bent — the bent-over rear-delt raise: hinged to about 60°, the arms hang and rise out to the sides to
 *  shoulder line, elbows soft (bent-over lateral raise, reverse fly, rear-delt raise). */
export function buildExLateralRaiseBent(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.14, ANKLE, 0.16);
  const bones = { Hips: [60, 0, 0] as Deg3, Spine: [4, 0, 0] as Deg3, Neck: [-30, 0, 0] as Deg3, LeftLeg: [14, 0, 0] as Deg3, RightLeg: [14, 0, 0] as Deg3 };
  const down: K = { bones, feet, kneePoles: bothDir(0.1, 0, 1), rel: { Left: [0.04, -0.50, 0.04], Right: [-0.04, -0.50, 0.04] }, poles: ELBOWS_OUT, hipsY: -0.10 };
  const up: K = { bones, feet, kneePoles: bothDir(0.1, 0, 1), rel: both(0.34, -0.30, 0.06), poles: bothDir(0.4, 0.6, -0.6), hipsY: -0.10 };
  return rep(scene, sk, 'ex_lateral_raise_bent', down, up, 0.8, 0.2, 1.0, 0.3);
}

/** ex_triceps_single_overhead — the one-arm overhead triceps extension: the right upper arm by the ear, the hand lowering behind
 *  the head and pressing back up, the left hand on the belly; then the left arm. */
export function buildExTricepsSingleOverhead(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const other: V3 = [0.12, -0.40, 0.16];   // left hand at the belly (from the left shoulder: in, down, forward)
  const bent: K = { bones: STAND, feet: STANCE, rel: { Left: other, Right: [-0.12, 0.22, -0.14] }, poles: { Left: [-0.6, -1, -0.2], Right: [0.2, 1, 0.3] }, hipsY: 0 };
  const straight: K = { bones: STAND, feet: STANCE, rel: { Left: other, Right: [-0.10, 0.52, 0.02] }, poles: { Left: [-0.6, -1, -0.2], Right: [0.2, 1, 0.3] }, hipsY: 0 };
  return loop(scene, sk, 'ex_triceps_single_overhead', 4.0, alternate([
    at(bent, 0, true), at(mix(bent, straight, 0.5), 0.45), at(straight, 0.8, true), at(straight, 1.0, true), at(mix(straight, bent, 0.5), 1.4), at(bent, 1.8, true),
  ], 2.0));
}

/** ex_crunch_variants — the oblique (twisting) crunch: on the back, knees up, hands at the temples, the shoulders curl up
 *  with the chest turned to one side, down, then turned to the other (flexion family: twisting, bicycle and reverse crunches
 *  play this one). */
export function buildExCrunchVariants(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.14, ANKLE, 0.50);
  const legs = { kneePoles: bothDir(0.1, 1, 0.2) };
  const head: Pair = { Left: [0.16, 0.20, 0.0], Right: [-0.16, 0.20, 0.0] };
  const down: K = { bones: { Hips: [-84, 0, 0], Spine: [0, 0, 0], Spine1: [0, 0, 0], Neck: [10, 0, 0] }, feet, ...legs, rel: head, poles: bothDir(1, 0, 0), hipsY: -0.82 };
  const upR: K = { bones: { Hips: [-80, 0, 0], Spine: [18, 8, 0], Spine1: [14, 12, 0], Neck: [14, 6, 0] }, feet, ...legs, rel: head, poles: bothDir(1, 0, 0), hipsY: -0.82 };
  return loop(scene, sk, 'ex_crunch_variants', 3.2, alternate([at(down, 0, true), at(mix(down, upR, 0.5), 0.35), at(upR, 0.7, true), at(upR, 0.95, true), at(mix(upR, down, 0.5), 1.3)], 1.6));
}

/** ex_plank_reach — the forearm plank with an arm reach: from the plank the right arm reaches long in front, holds, returns;
 *  then the left (plank matrix: reaches, shoulder taps and limb lifts play this one). */
export function buildExPlankReach(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.13, TOE_ANKLE, -0.95);
  const plank: K = { bones: { Hips: [78, 0, 0], Spine: [0, 0, 0], Neck: [-36, 0, 0], LeftFoot: [8, 0, 0], RightFoot: [8, 0, 0] }, feet, kneePoles: bothDir(0, -1, 0.1), hands: both(0.10, 0.06, 0.52), poles: bothDir(0.3, 0.2, -1), hipsY: -0.66 };
  const reachR: K = { ...plank, bones: { ...plank.bones, Spine: [0, 0, -3] }, hands: { Left: [-0.08, 0.06, 0.52], Right: [0.16, 0.36, 1.02] }, poles: { Left: [-0.3, 0.2, -1], Right: [0.4, -0.6, 0.2] } };
  return loop(scene, sk, 'ex_plank_reach', 4.0, alternate([at(plank, 0, true), at(mix(plank, reachR, 0.5), 0.4), at(reachR, 0.8, true), at(reachR, 1.4, true), at(mix(reachR, plank, 0.5), 1.7)], 2.0));
}

/** ex_row_inverted — the inverted (body) row: hanging under a bar (not drawn), heels on the floor, the hands fixed on the bar;
 *  the chest is pulled up to it and lowered (inverted rows, TRX / ring rows). The pelvis stays put and the trunk rises, so the
 *  top reads with a slight pike rather than one straight line. */
export function buildExRowInverted(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.14, ANKLE, 0.72);
  const bar = both(0.26, 1.18, -0.36);
  const legs = { LeftFoot: [-30, 0, 0] as Deg3, RightFoot: [-30, 0, 0] as Deg3 };
  const low: K = { bones: { Hips: [-62, 0, 0], Spine: [0, 0, 0], Spine1: [0, 0, 0], Neck: [12, 0, 0], ...legs }, feet, kneePoles: bothDir(0.1, 1, 0.3), hands: bar, poles: bothDir(0.8, -0.4, 0), hipsY: -0.46 };
  const top: K = { bones: { Hips: [-62, 0, 0], Spine: [16, 0, 0], Spine1: [10, 0, 0], Neck: [4, 0, 0], ...legs }, feet, kneePoles: bothDir(0.1, 1, 0.3), hands: bar, poles: bothDir(0.9, -0.6, 0.3), hipsY: -0.40 };
  return rep(scene, sk, 'ex_row_inverted', low, top, 0.8, 0.3, 1.0, 0.35);
}

/** ex_throw_rotational — the rotational (side-on) med-ball throw: side-on, the ball loaded at the back hip with the trunk
 *  turned away, then the hips and trunk whip round and the arms release it across the body at chest height, the back heel
 *  turning; reset; then the other side (rotational scoop / shot-put throws). The ball is not drawn. */
export function buildExThrowRotational(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet: Pair = both(0.22, ANKLE, 0.02);
  const load: K = {
    bones: { Hips: [26, 22, 0], Spine: [6, 14, 0], Neck: [-14, -22, 0], RightFoot: [-14, 0, 0], LeftFoot: [-16, 0, 0] }, feet, kneePoles: { Left: [0, 0, 1], Right: [0.3, 0, 1] },
    hands: { Left: [0.20, 0.70, 0.12], Right: [0.36, 0.72, 0.02] }, poles: bothDir(0.4, -0.8, -0.3), hipsY: -0.16,
  };
  const release: K = {
    bones: { Hips: [12, -24, 0], Spine: [4, -18, 0], Neck: [-8, 20, 0], RightFoot: [14, 0, 0], LeftFoot: [-16, 0, 0] }, feet: { Left: feet.Left, Right: [0.22, ANKLE + 0.04, 0.02] }, kneePoles: { Left: [-0.1, 0, 1], Right: [-0.2, 0, 1] },
    hands: { Left: [-0.40, 1.22, 0.42], Right: [-0.18, 1.24, 0.56] }, poles: bothDir(0.5, -0.8, -0.3), hipsY: -0.06,
  };
  const ready: K = { bones: { Hips: [14, 0, 0], Spine: [4, 0, 0], Neck: [-8, 0, 0], RightFoot: [-10, 0, 0], LeftFoot: [-10, 0, 0] }, feet, kneePoles: bothDir(0.15, 0, 1), hands: both(0.10, 0.92, 0.30), poles: bothDir(0.4, -0.8, -0.3), hipsY: -0.08 };
  return loop(scene, sk, 'ex_throw_rotational', 3.6, alternate([
    at(ready, 0, true), at(mix(ready, load, 0.5), 0.35), at(load, 0.7, true), at(mix(load, release, 0.3), 0.85), at(mix(load, release, 0.6), 0.98), at(mix(load, release, 0.85), 1.07), at(release, 1.15, true), at(release, 1.35, true), at(mix(release, ready, 0.5), 1.55),
  ], 1.8));
}

/** ex_dip — the parallel-bar dip: the hands fixed on the bars (not drawn) beside the hips, knees bent and the feet off the
 *  floor, the body lowers until the upper arms are about level, and presses back up (bar dips; bench dips play it too). */
export function buildExDip(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const bars = both(0.27, 1.32, 0.04);
  const legs = { LeftUpLeg: [-14, 0, 2] as Deg3, RightUpLeg: [-14, 0, -2] as Deg3, LeftLeg: [80, 0, 0] as Deg3, RightLeg: [80, 0, 0] as Deg3, LeftFoot: [20, 0, 0] as Deg3, RightFoot: [20, 0, 0] as Deg3 };
  const top: K = { bones: { Hips: [8, 0, 0], Spine: [2, 0, 0], Neck: [-6, 0, 0], ...legs }, hands: bars, poles: ELBOWS_BACK, hipsY: 0.38 };
  const low: K = { bones: { Hips: [20, 0, 0], Spine: [4, 0, 0], Neck: [-10, 0, 0], ...legs }, hands: bars, poles: ELBOWS_BACK, hipsY: 0.14 };
  return rep(scene, sk, 'ex_dip', top, low, 0.9, 0.2, 0.9, 0.35);
}

/** ex_sl_rdl — the single-leg Romanian deadlift: standing on the right leg (knee soft), the trunk hinges forward as the left
 *  leg swings back in line with it, the hands lowering down the front; back to standing; then the left leg (single-leg hinge
 *  family, hip-capacity reaches). */
export function buildExSlRdl(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const stand: K = { bones: { ...STAND, LeftUpLeg: [-16, 0, 0], LeftLeg: [44, 0, 0], LeftFoot: [6, 0, 0], RightFoot: [-6, 0, 0] }, feet: { Right: [0.10, ANKLE, 0.06] }, kneePoles: bothDir(0.1, 0, 1), rel: { Left: [0.04, -0.52, 0.06], Right: [-0.04, -0.52, 0.06] }, poles: HANG_POLES, hipsY: -0.01 };
  const hinge: K = {
    bones: { Hips: [72, 0, 0], Spine: [4, 0, 0], Neck: [-32, 0, 0], LeftUpLeg: [4, 0, 0], LeftLeg: [6, 0, 0], LeftFoot: [-14, 0, 0], RightLeg: [14, 0, 0], RightFoot: [-12, 0, 0] },
    feet: { Right: [0.10, ANKLE, 0.06] }, kneePoles: bothDir(0.1, 0, 1), rel: { Left: [0.05, -0.53, 0.04], Right: [-0.05, -0.53, 0.04] }, poles: HANG_POLES, hipsY: -0.12,
  };
  const down: K = { bones: STAND, feet: both(0.10, ANKLE, 0.06), kneePoles: bothDir(0.1, 0, 1), rel: { Left: [0.04, -0.52, 0.06], Right: [-0.04, -0.52, 0.06] }, poles: HANG_POLES, hipsY: 0 };
  return loop(scene, sk, 'ex_sl_rdl', 5.6, alternate([
    at(down, 0, true), at(stand, 0.4), at(mix(stand, hinge, 0.5), 0.9), at(hinge, 1.4, true), at(hinge, 1.7, true), at(mix(hinge, stand, 0.5), 2.15), at(stand, 2.5),
  ], 2.8));
}

/** Batch B3: [clip name, builder], in plan order. */
export const EXERCISE_BATCH_B3_BUILDERS: readonly [string, (scene: Scene, sk: Skeleton) => AnimationGroup | null][] = [
  ['ex_ladder', buildExLadder], ['ex_row_chest_supported', buildExRowChestSupported], ['ex_lateral_raise_bent', buildExLateralRaiseBent],
  ['ex_triceps_single_overhead', buildExTricepsSingleOverhead], ['ex_crunch_variants', buildExCrunchVariants], ['ex_plank_reach', buildExPlankReach],
  ['ex_row_inverted', buildExRowInverted], ['ex_throw_rotational', buildExThrowRotational], ['ex_dip', buildExDip], ['ex_sl_rdl', buildExSlRdl],
];
export const EXERCISE_BATCH_B3_CLIPS: readonly string[] = EXERCISE_BATCH_B3_BUILDERS.map(([n]) => n);
