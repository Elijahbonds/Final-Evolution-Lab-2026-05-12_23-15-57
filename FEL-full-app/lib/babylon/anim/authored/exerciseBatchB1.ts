// Exercise loops, BATCH B1 (FITNESS-TPOSE loop plan 2026-10-26, tier 4 by coverage, the first ten non-hoops loops: ranks 19, 20,
// 22, 23, 26–31). Same authoring as exercise.ts and exerciseBatchA.ts (pose clips, targets in the FINAL frame, in place).
// Most of these are the plan's catch-alls: ONE representative loop per id (named in each doc comment), not the per-entry
// variant tables the plan sketches. One-sided movements are authored on the RIGHT and mirrored in-loop (exerciseKit.alternate).
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import {
  ANKLE, TOE_ANKLE, both, bothDir, loop, rep, mix, alternate, mirrorKey, seat,
  STANCE, SQUAT_FEET, KNEES_OUT, HANG, HANG_POLES, ELBOWS_DOWN, ELBOWS_OUT, ELBOWS_BACK, STAND, RACK, OVERHEAD, SEAT_Y,
  type ExKey, type Pair, type V3, type Deg3,
} from './exerciseKit';

type K = Omit<ExKey, 't'>;
const at = (e: K, t: number, hold = false): ExKey => ({ ...e, t, ...(hold ? { hold: true } : {}) });

/** ex_jump_stick — a countermovement jump that lands and STICKS: dip, drive the arms up and leave the floor, land soft into a
 *  held athletic quarter squat (knees out over the toes), stand (jump-land matrix, box / tuck / split / drop-landing family,
 *  shown as the vertical jump-to-stick in place). */
export function buildExJumpStick(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const legs = (thigh: number, knee: number): Record<string, Deg3> => ({ LeftUpLeg: [thigh, 0, 4], RightUpLeg: [thigh, 0, -4], LeftLeg: [knee, 0, 0], RightLeg: [knee, 0, 0] });
  const stand: K = { bones: { ...STAND }, feet: STANCE, hands: HANG, poles: HANG_POLES, hipsY: 0 };
  const dip: K = { bones: { Hips: [24, 0, 0], Spine: [12, 0, 0], Neck: [-14, 0, 0], LeftFoot: [-20, 0, 0], RightFoot: [-20, 0, 0] }, feet: STANCE, kneePoles: bothDir(0.15, 0, 1), hands: both(0.26, 0.62, -0.30), poles: bothDir(0.3, 0.3, -0.9), hipsY: -0.28 };
  const stick: K = { bones: { Hips: [32, 0, 0], Spine: [10, 0, 0], Neck: [-18, 0, 0], LeftFoot: [-22, 0, 0], RightFoot: [-22, 0, 0] }, feet: STANCE, kneePoles: KNEES_OUT, hands: both(0.22, 0.98 - 0.30, 0.40), poles: ELBOWS_DOWN, hipsY: -0.30 };
  return loop(scene, sk, 'ex_jump_stick', 2.8, [
    at(stand, 0, true), { ...mix(stand, dip, 0.5), t: 0.22, bones: { ...mix(stand, dip, 0.5).bones, LeftFoot: [-16, 0, 0], RightFoot: [-16, 0, 0] } }, at(dip, 0.45, true),
    { t: 0.57, bones: { Hips: [10, 0, 0], Spine: [4, 0, 0], Neck: [-6, 0, 0], LeftFoot: [24, 0, 0], RightFoot: [24, 0, 0] }, feet: both(0.13, ANKLE + 0.07, 0.08), kneePoles: bothDir(0.15, 0, 1), hands: both(0.24, 1.30, 0.06), poles: bothDir(0.6, 0, -0.6), hipsY: -0.08 },
    { t: 0.68, bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], ...legs(-4, 4), LeftFoot: [34, 0, 0], RightFoot: [34, 0, 0] }, hands: both(0.20, 2.05 + 0.10, 0.12), poles: bothDir(0.9, 0.1, -0.3), hipsY: 0.10 },
    { t: 0.88, bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], ...legs(-10, 14), LeftFoot: [26, 0, 0], RightFoot: [26, 0, 0] }, hands: both(0.22, 2.0 + 0.24, 0.14), poles: bothDir(0.9, 0.1, -0.3), hipsY: 0.24, hold: true },
    { t: 1.1, bones: { Hips: [0, 0, 0], Spine: [2, 0, 0], ...legs(-14, 18), LeftFoot: [14, 0, 0], RightFoot: [14, 0, 0] }, hands: both(0.24, 1.70 + 0.06, 0.20), poles: bothDir(0.6, -0.2, -0.6), hipsY: 0.06 },
    { ...mix(stand, stick, 0.55), t: 1.28, feet: STANCE },
    at(stick, 1.45, true), at(stick, 2.1, true),
    { ...mix(stick, stand, 0.5), t: 2.4 },
  ]);
}

/** ex_flow_squat_lunge — the mobility flow, shown as deep squat ↔ forward fold (the plan's "A to B Flow" pose chain): sit
 *  into a deep squat, elbows inside the knees, then lift the hips into a long-legged forward fold, hands to the floor, and
 *  back down. 2.0 s each way. */
export function buildExFlowSquatLunge(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.20, ANKLE, 0.12);
  const squat: K = { bones: { Hips: [18, 0, 0], Spine: [14, 0, 0], Spine1: [4, 0, 0], Neck: [-26, 0, 0], LeftFoot: [-30, 0, 0], RightFoot: [-30, 0, 0] }, feet, kneePoles: bothDir(0.45, 0, 1), hands: both(0.06, 0.98 - 0.56, 0.36), poles: bothDir(0.8, -0.4, 0.2), hipsY: -0.56 };
  const fold: K = { bones: { Hips: [92, 0, 0], Spine: [16, 0, 0], Spine1: [8, 0, 0], Neck: [-6, 0, 0], LeftLeg: [10, 0, 0], RightLeg: [10, 0, 0], LeftFoot: [-8, 0, 0], RightFoot: [-8, 0, 0] }, feet, kneePoles: bothDir(0.1, 0, 1), hands: both(0.16, 0.12, 0.30), poles: bothDir(0.6, 0.2, -0.7), hipsY: -0.14 };
  return loop(scene, sk, 'ex_flow_squat_lunge', 4.0, [
    at(squat, 0, true), at(squat, 0.4, true), { ...mix(squat, fold, 0.5), t: 1.2 }, { ...mix(squat, fold, 0.75), t: 1.6, bones: { ...mix(squat, fold, 0.75).bones, LeftFoot: [-18, 0, 0], RightFoot: [-18, 0, 0] } }, at(fold, 2.0, true), at(fold, 2.4, true), { ...mix(fold, squat, 0.5), t: 3.2 },
  ]);
}

/** ex_cut — the change-of-direction cut in place: two quick steps, then a hard plant on the outside (right) foot — wide, hips
 *  low and turned — and the push-off back the other way; then the mirror (cut matrix, 45/90 cuts, shuttles, racket and
 *  football footwork: a generic placeholder, the angle is not shown). */
export function buildExCut(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const home: Pair = both(0.13, ANKLE, 0.04);
  const step = (side: 'Left' | 'Right'): K => {
    const up = side, x = side === 'Left' ? -1 : 1;
    return {
      bones: { Hips: [16, 0, 0], Spine: [6, 0, 0], Neck: [-10, 0, 0], [`${up}UpLeg`]: [-50, 0, 0], [`${up}Leg`]: [70, 0, 0], [`${up}Foot`]: [16, 0, 0] } as Record<string, Deg3>,
      feet: { [side === 'Left' ? 'Right' : 'Left']: [-x * 0.13, ANKLE, 0.04] } as Pair, kneePoles: bothDir(0.1, 0, 1),
      hands: { [side]: [x * 0.24, 0.90, -0.16], [side === 'Left' ? 'Right' : 'Left']: [-x * 0.20, 1.16, 0.30] } as Pair, poles: bothDir(0.3, -0.6, -0.7), hipsY: -0.06,
    };
  };
  const plant: K = {
    bones: { Hips: [30, -24, -8], Spine: [8, -6, 0], Neck: [-16, 18, 0], RightFoot: [-14, 0, 0], LeftFoot: [-22, 0, 0] },
    feet: { Right: [0.36, ANKLE, 0.06], Left: [-0.10, ANKLE, 0.02] }, kneePoles: { Right: [0.3, 0, 1], Left: [-0.1, 0, 1] },
    hands: { Left: [-0.34, 0.90, 0.20], Right: [0.10, 0.78, 0.36] }, poles: bothDir(0.3, -0.6, -0.7), hipsY: -0.24,
  };
  const ready: K = { bones: { Hips: [16, 0, 0], Spine: [6, 0, 0], Neck: [-10, 0, 0], LeftFoot: [-6, 0, 0], RightFoot: [-6, 0, 0] }, feet: home, kneePoles: bothDir(0.1, 0, 1), hands: both(0.24, 0.92, 0.16), poles: HANG_POLES, hipsY: -0.08 };
  const reach: K = { ...ready, bones: { ...ready.bones, RightUpLeg: [-20, 0, -10], RightFoot: [10, 0, 0], LeftFoot: [-14, 0, 0] }, feet: { Left: home.Left, Right: [0.26, ANKLE + 0.10, 0.06] }, hipsY: -0.12 };
  return loop(scene, sk, 'ex_cut', 3.2, alternate([
    at(ready, 0), at(step('Left'), 0.2), at(ready, 0.4), at(step('Right'), 0.6), at(ready, 0.8), at(reach, 0.95),
    at(plant, 1.1, true), at(plant, 1.3, true), { ...mix(plant, ready, 0.5), t: 1.45, feet: { Left: home.Left, Right: [0.26, ANKLE + 0.06, 0.06] } },
  ], 1.6));
}

/** ex_stretch_hold — a standing static stretch, eased in, held, eased out, then the other side: shown as the cross-body
 *  shoulder stretch (the right arm long across the chest, the left hand pressing it in above the elbow). Stands in for the
 *  stretch matrix's per-stretch poses (upper-body, chest, hamstring, shoulder-mobility holds). */
export function buildExStretchHold(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const stand: K = { bones: STAND, feet: STANCE, hands: HANG, poles: HANG_POLES, hipsY: 0 };
  const hold = (deep: number): K => ({
    bones: { ...STAND, Spine1: [0, -6 * deep, 0], Neck: [0, 10 * deep, 0] }, feet: STANCE,
    hands: { Right: [-0.24 - 0.06 * deep, 1.34, 0.26 - 0.04 * deep], Left: [-0.02, 1.22, 0.34] },
    poles: { Right: [0, -0.3, 1], Left: [-0.4, -1, 0] }, hipsY: 0,
  });
  return loop(scene, sk, 'ex_stretch_hold', 6.4, alternate([
    at(stand, 0, true), { ...mix(stand, hold(0), 0.5), t: 0.45 }, at(hold(0), 0.9), at(hold(1), 1.5, true), at(hold(1), 2.5, true), { ...mix(hold(0), stand, 0.5), t: 2.85 },
  ], 3.2));
}

/** ex_pushup_variants — the spiderman push-up: as the chest lowers the right knee comes up the outside to the right elbow,
 *  back on the push, then the left (push-up 56, push-extra, staggered / T / archer family shown by the one alternating shape). */
export function buildExPushupVariants(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.11, TOE_ANKLE + 0.015, -0.90);
  const knees = bothDir(0, -1, 0.1);
  const top: K = { bones: { Hips: [70, 0, 0], Spine: [0, 0, 0], Neck: [-30, 0, 0], LeftFoot: [8, 0, 0], RightFoot: [8, 0, 0] }, feet, kneePoles: knees, hands: both(0.24, 0.05, 0.44), poles: bothDir(0.6, 0.2, -0.7), hipsY: -0.58 };
  const bottom: K = {
    bones: { Hips: [82, 0, 0], Spine: [0, 0, 0], Neck: [-40, 0, 0], LeftFoot: [8, 0, 0], RightFoot: [-10, 0, 0] },
    feet: { Left: feet.Left, Right: [0.40, 0.30, -0.34] }, kneePoles: { Left: knees.Left, Right: [1, 0.4, 0.2] },
    hands: both(0.26, 0.05, 0.44), poles: bothDir(0.7, 0.4, -0.5), hipsY: -0.76,
  };
  const liftR: K = { ...mix(top, bottom, 0.5), feet: { Left: feet.Left, Right: [0.28, 0.24, -0.62] }, kneePoles: { Left: knees.Left, Right: [0.8, 0.2, 0.4] } };
  return loop(scene, sk, 'ex_pushup_variants', 4.4, alternate([
    at(top, 0, true), at(top, 0.25, true), at(liftR, 0.6), at(bottom, 0.95, true), at(bottom, 1.15, true), at(liftR, 1.5), at(top, 1.9, true),
  ], 2.2));
}

/** ex_sprint_start — a two-point start: the staggered start stance (left foot forward, weight on it, the opposite arm
 *  forward), then the first three drive steps in place with the body leaning into them, and back to the line (sprint starts,
 *  acceleration; the 3-point / half-kneeling / prone starts are not shown separately). */
export function buildExSprintStart(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const set: K = {
    bones: { Hips: [34, 0, 0], Spine: [8, 0, 0], Neck: [-26, 0, 0], RightFoot: [26, 0, 0], LeftFoot: [-12, 0, 0] },
    feet: { Left: [-0.12, ANKLE, 0.22], Right: [0.12, ANKLE + 0.07, -0.30] }, kneePoles: bothDir(0.05, 0, 1),
    hands: { Right: [0.18, 1.02, 0.32], Left: [-0.24, 0.86, -0.22] }, poles: bothDir(0.3, -0.6, -0.7), hipsY: -0.16,
  };
  const drive = (up: 'Left' | 'Right'): K => {
    const dn = up === 'Left' ? 'Right' : 'Left', x = up === 'Left' ? -1 : 1;
    return {
      bones: { Hips: [40, 0, 0], Spine: [0, 0, 0], Neck: [-30, 0, 0], [`${up}UpLeg`]: [-58, 0, 0], [`${up}Leg`]: [96, 0, 0], [`${up}Foot`]: [12, 0, 0], [`${dn}Foot`]: [2, 0, 0] } as Record<string, Deg3>,
      feet: { [dn]: [-x * 0.12, ANKLE + 0.03, -0.06] } as Pair, kneePoles: bothDir(0.05, 0, 1),
      hands: { [dn]: [-x * 0.18, 1.06, 0.36], [up]: [x * 0.24, 0.80, -0.26] } as Pair, poles: bothDir(0.3, -0.6, -0.7), hipsY: -0.10,
    };
  };
  return loop(scene, sk, 'ex_sprint_start', 2.6, [
    at(set, 0, true), at(set, 0.5, true), at(drive('Right'), 0.8), at(drive('Left'), 1.1), at(drive('Right'), 1.4),
    { ...mix(drive('Right'), set, 0.5), t: 1.75, feet: { Left: [-0.12, ANKLE + 0.08, 0.10], Right: [0.12, ANKLE + 0.08, -0.18] } }, at(set, 2.1, true),
  ]);
}

/** ex_raise_overhead — the straight-arm raise past the shoulders to overhead (about 160°) and back down: front raise above
 *  head, scaption, side-laterals-to-front-raise family; the incline-bench and Cuban-press entries play the same arc. */
export function buildExRaiseOverhead(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const at2 = (y: number, z: number): K => ({ bones: { ...STAND, Neck: [y > 0.3 ? -6 : 0, 0, 0] }, feet: STANCE, rel: { Left: [-0.02, y, z], Right: [0.02, y, z] }, poles: ELBOWS_OUT, hipsY: 0 });
  const down = at2(-0.56, 0.12), mid = at2(-0.02, 0.58), up = at2(0.56, 0.20);
  return loop(scene, sk, 'ex_raise_overhead', 3.0, [
    at(down, 0, true), at(at2(-0.36, 0.44), 0.4), at(mid, 0.75), at(at2(0.34, 0.46), 1.05), at(up, 1.3, true), at(up, 1.6, true),
    at(at2(0.34, 0.46), 1.85), at(mid, 2.15), at(at2(-0.36, 0.44), 2.45), at(down, 2.8, true),
  ]);
}

/** ex_curl_supported — the preacher curl, seated, the upper arms forward and down along the pad, the elbows fixed: from
 *  nearly straight to the hands at the shoulders (preacher, spider, concentration and prone-incline curls). Sits on the
 *  same 'seat' prop as ex_seated_curl. */
export function buildExCurlSupported(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const sh = 1.40 + SEAT_Y;
  const lean = { Hips: [16, 0, 0] as Deg3, Spine: [6, 0, 0] as Deg3, Neck: [-14, 0, 0] as Deg3 };
  const down = seat({ bones: lean, hands: both(0.17, sh - 0.50, 0.56), poles: bothDir(0.1, -0.7, 0.7) });
  const up = seat({ bones: lean, hands: both(0.16, sh - 0.02, 0.36), poles: bothDir(0.1, -0.7, 0.7) });
  return rep(scene, sk, 'ex_curl_supported', down, up, 0.8, 0.2, 1.1, 0.3);
}

/** ex_sprint_drill — the A-skip: a knee drive with a small skip off the standing foot, the opposite arm driving, then the
 *  other side (A/B-skips, high knees, butt kicks, wall and arm drills: one shape for the sprint-mechanics family). */
export function buildExSprintDrill(scene: Scene, sk: Skeleton): AnimationGroup | null {
  // the RIGHT knee drives; the left foot skips
  const drive: K = {
    bones: { ...STAND, Hips: [4, 0, 0], RightUpLeg: [-82, 0, 0], RightLeg: [92, 0, 0], RightFoot: [-10, 0, 0], LeftFoot: [26, 0, 0] },
    feet: { Left: [-0.12, ANKLE + 0.05, 0.04] }, kneePoles: bothDir(0.05, 0, 1),
    hands: { Left: [-0.20, 1.24, 0.30], Right: [0.24, 0.90, -0.24] }, poles: bothDir(0.3, -0.6, -0.7), hipsY: 0.05,
  };
  const down: K = { bones: { ...STAND, Hips: [6, 0, 0], RightFoot: [0, 0, 0], LeftFoot: [0, 0, 0] }, feet: both(0.12, ANKLE, 0.04), kneePoles: bothDir(0.05, 0, 1), hands: both(0.24, 0.94, 0.04), poles: bothDir(0.3, -0.6, -0.7), hipsY: -0.04 };
  const strike: K = { ...mix(down, drive, 0.4), feet: { Left: [-0.12, ANKLE + 0.02, 0.04], Right: [0.12, ANKLE + 0.10, 0.10] }, hipsY: -0.02 };
  return loop(scene, sk, 'ex_sprint_drill', 1.4, alternate([at(down, 0), at(strike, 0.12), at(drive, 0.3), at(drive, 0.4), at(mix(drive, down, 0.5), 0.55)], 0.7));
}

/** ex_olympic_lift — the hang clean: from the hang (hinged, bar at mid-thigh), the triple extension up onto the toes with a
 *  shrug and high elbows, the catch in a front rack and quarter squat (elbows forward), stand, and lower back to the hang
 *  (clean, snatch, jerk and kettlebell clean family; the snatch / jerk overhead catch is not shown separately). */
export function buildExOlympicLift(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.15, ANKLE, 0.10);
  const hang: K = { bones: { Hips: [40, 0, 0], Spine: [4, 0, 0], Neck: [-24, 0, 0], LeftLeg: [16, 0, 0], RightLeg: [16, 0, 0] }, feet, kneePoles: bothDir(0.2, 0, 1), rel: { Left: [0.04, -0.52, 0.10], Right: [-0.04, -0.52, 0.10] }, poles: HANG_POLES, hipsY: -0.10 };
  const ext: K = { bones: { Hips: [-4, 0, 0], Spine: [-4, 0, 0], Neck: [0, 0, 0], LeftFoot: [30, 0, 0], RightFoot: [30, 0, 0] }, feet: both(0.15, ANKLE + 0.07, 0.10), kneePoles: bothDir(0.2, 0, 1), rel: { Left: [0.06, -0.32, 0.12], Right: [-0.06, -0.32, 0.12] }, poles: bothDir(0.8, 0.3, -0.3), hipsY: 0.07 };
  const catchK: K = { bones: { Hips: [18, 0, 0], Spine: [-2, 0, 0], Neck: [-6, 0, 0], LeftFoot: [-16, 0, 0], RightFoot: [-16, 0, 0] }, feet, kneePoles: KNEES_OUT, rel: { Left: [0.07, 0.0, 0.20], Right: [-0.07, 0.0, 0.20] }, poles: bothDir(-0.1, -0.1, 1), hipsY: -0.22 };
  const rack: K = { bones: { ...STAND, Spine: [-2, 0, 0] }, feet, kneePoles: bothDir(0.2, 0, 1), rel: { Left: [0.07, 0.01, 0.20], Right: [-0.07, 0.01, 0.20] }, poles: bothDir(-0.1, -0.1, 1), hipsY: 0 };
  return loop(scene, sk, 'ex_olympic_lift', 3.2, [
    at(hang, 0, true), at(hang, 0.3, true), at(ext, 0.62), { ...mix(ext, catchK, 0.5), t: 0.77, feet: both(0.15, ANKLE + 0.03, 0.10), bones: { ...mix(ext, catchK, 0.5).bones, LeftFoot: [6, 0, 0], RightFoot: [6, 0, 0] } }, at(catchK, 0.92, true), at(catchK, 1.15, true), { ...mix(catchK, rack, 0.5), t: 1.45 }, at(rack, 1.75, true),
    at(rack, 2.05, true), { ...mix(rack, hang, 0.5), t: 2.45 }, at(hang, 2.9, true),
  ]);
}

/** Batch B1: [clip name, builder], in plan order. */
export const EXERCISE_BATCH_B1_BUILDERS: readonly [string, (scene: Scene, sk: Skeleton) => AnimationGroup | null][] = [
  ['ex_jump_stick', buildExJumpStick], ['ex_flow_squat_lunge', buildExFlowSquatLunge], ['ex_cut', buildExCut], ['ex_stretch_hold', buildExStretchHold],
  ['ex_pushup_variants', buildExPushupVariants], ['ex_sprint_start', buildExSprintStart], ['ex_raise_overhead', buildExRaiseOverhead],
  ['ex_curl_supported', buildExCurlSupported], ['ex_sprint_drill', buildExSprintDrill], ['ex_olympic_lift', buildExOlympicLift],
];
export const EXERCISE_BATCH_B1_CLIPS: readonly string[] = EXERCISE_BATCH_B1_BUILDERS.map(([n]) => n);
