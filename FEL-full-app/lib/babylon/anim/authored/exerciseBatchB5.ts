// Exercise loops, BATCH B5 (FITNESS-TPOSE loop plan 2026-10-26, tier 4 by coverage, the next ten non-hoops loops: ranks 68–77).
// Same authoring as exercise.ts and exerciseBatchA.ts (pose clips, targets in the FINAL frame, in place).
// One representative loop per id (named in each doc comment). One-sided movements are authored on the RIGHT and mirrored
// in-loop (exerciseKit.alternate). ex_row_seated_cable and ex_leg_press use the stage's 'seat' box (0.34 × 0.44 × 0.42 m).
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import {
  ANKLE, TOE_ANKLE, both, bothDir, loop, rep, mix, alternate, seat,
  STANCE, SQUAT_FEET, KNEES_OUT, HANG, HANG_POLES, ELBOWS_OUT, ELBOWS_BACK, STAND,
  type ExKey, type Pair, type V3, type Deg3,
} from './exerciseKit';

type K = Omit<ExKey, 't'>;
const at = (e: K, t: number, hold = false): ExKey => ({ ...e, t, ...(hold ? { hold: true } : {}) });

/** ex_row_seated_cable — the seated cable row: sitting on the box, the trunk tall, the arms reach long to the front with a
 *  slight lean, then the hands pull to the belly, the elbows close by the ribs, and reach again (seated / elevated / kneeling
 *  cable rows, band rows; the cable and the foot plate are not drawn). Sits on the 'seat' prop. */
export function buildExRowSeatedCable(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const reach: K = seat({ bones: { Hips: [16, 0, 0], Spine: [4, 0, 0], Neck: [-12, 0, 0] }, rel: { Left: [0.08, -0.12, 0.50], Right: [-0.08, -0.12, 0.50] }, poles: bothDir(0.4, -0.6, -0.6) });
  const pulled: K = seat({ bones: { Hips: [-4, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0] }, rel: { Left: [0.02, -0.32, 0.06], Right: [-0.02, -0.32, 0.06] }, poles: bothDir(0.2, -0.3, -1) });
  return rep(scene, sk, 'ex_row_seated_cable', reach, pulled, 0.8, 0.35, 1.0, 0.3);
}

/** ex_carry_strongman — the front-rack carry walked in place: two bells held at the shoulders, elbows down, tall, short steps
 *  (front-rack / overhead / sandbag / yoke carries, holds and loaded marches play it; the load is not drawn). */
export function buildExCarryStrongman(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const rack: Pair = { Left: [0.06, -0.16, 0.18], Right: [-0.06, -0.16, 0.18] };
  const step = (s: 1 | -1, t: number): ExKey => ({
    t, bones: { ...STAND, Spine: [0, 0, 0], LeftUpLeg: [-22 * s, 0, 0], RightUpLeg: [22 * s, 0, 0], LeftLeg: [s > 0 ? 20 : 6, 0, 0], RightLeg: [s > 0 ? 6 : 20, 0, 0] },
    rel: rack, poles: bothDir(0.25, -1, 0.1), hipsY: -0.01,
  });
  const pass = (t: number, s: 1 | -1): ExKey => ({
    t, bones: { ...STAND, Spine: [0, 0, 0], [`${s > 0 ? 'Right' : 'Left'}UpLeg`]: [-28, 0, 0], [`${s > 0 ? 'Right' : 'Left'}Leg`]: [40, 0, 0] } as Record<string, Deg3>,
    rel: rack, poles: bothDir(0.25, -1, 0.1), hipsY: 0.0,
  });
  return loop(scene, sk, 'ex_carry_strongman', 1.3, [step(1, 0), pass(0.325, 1), step(-1, 0.65), pass(0.975, -1)]);
}

/** ex_jump_rope_variants — the boxer skip: a small bounce, the weight shifting foot to foot, the free foot just off the floor,
 *  the hands at the hips turning the rope (boxer / scissor / ski / heel-toe / running rope jumps play it; no rope drawn). */
export function buildExJumpRopeVariants(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const hand = (a: number, lift: number): Pair => both(0.32 + 0.04 * Math.cos(a), 0.92 + 0.05 * Math.sin(a) + lift, 0.10 + 0.05 * Math.cos(a));
  const ground: K = { bones: { ...STAND, Hips: [3, 0, 0] }, feet: STANCE, kneePoles: bothDir(0.1, 0, 1), hands: hand(0, -0.04), poles: ELBOWS_BACK, hipsY: -0.04 };
  const air: K = { bones: { ...STAND, LeftUpLeg: [-3, 0, 3], RightUpLeg: [-18, 0, -3], LeftLeg: [5, 0, 0], RightLeg: [34, 0, 0], LeftFoot: [24, 0, 0], RightFoot: [20, 0, 0] }, hands: hand(Math.PI, 0.07), poles: ELBOWS_BACK, hipsY: 0.07 };
  return loop(scene, sk, 'ex_jump_rope_variants', 1.0, alternate([at(ground, 0), at(air, 0.25)], 0.5));
}

/** ex_throw_overhead — the med-ball slam: up tall with the ball overhead, slam it down in front of the feet as the hips drop,
 *  pick it up and reach tall again (slams, overhead throws standing / kneeling / split; the ball is not drawn). */
export function buildExThrowOverhead(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.17, ANKLE, 0.10);
  const top: K = { bones: { ...STAND, Spine: [-4, 0, 0], Neck: [-6, 0, 0] }, feet, kneePoles: KNEES_OUT, rel: { Left: [0.12, 0.56, 0.08], Right: [-0.12, 0.56, 0.08] }, poles: bothDir(0.7, 0.3, -0.4), hipsY: 0 };
  const bottom: K = { bones: { Hips: [52, 0, 0], Spine: [8, 0, 0], Neck: [-28, 0, 0], LeftFoot: [-18, 0, 0], RightFoot: [-18, 0, 0] }, feet, kneePoles: KNEES_OUT, hands: both(0.12, 0.30, 0.42), poles: bothDir(0.5, 0.2, -0.6), hipsY: -0.30 };
  return loop(scene, sk, 'ex_throw_overhead', 2.4, [
    at(top, 0, true), at(top, 0.35, true), at(mix(top, bottom, 0.5), 0.5), at(bottom, 0.68, true), at(bottom, 1.05, true), at(mix(bottom, top, 0.5), 1.55), at(top, 2.0, true),
  ]);
}

/** ex_leg_press — the leg extension: sitting on the box, the hands holding the seat edges, both knees straighten until the legs
 *  are long, a squeeze, and lower (leg extensions; leg press and hack squat entries play it — the machine is not drawn). */
export function buildExLegPress(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const grip = both(0.22, 0.47, 0.02);
  const pose = (knee: number, foot: number): K => seat({ bones: { Spine: [0, 0, 0], LeftLeg: [knee, 0, 0], RightLeg: [knee, 0, 0], LeftFoot: [foot, 0, 0], RightFoot: [foot, 0, 0] }, feet: {}, kneePoles: undefined, hands: grip, poles: bothDir(0.3, 0.3, -1) });
  const down = pose(78, 0), up = pose(6, -14);
  return loop(scene, sk, 'ex_leg_press', 2.6, [at(down, 0, true), at(mix(down, up, 0.5), 0.45), at(up, 0.9, true), at(up, 1.25, true), at(mix(up, down, 0.5), 1.8), at(down, 2.3, true)]);
}

/** ex_straight_arm_pulldown — the straight-arm pulldown: a slight hinge, the arms long and up in front, they sweep down in an
 *  arc to the thighs with the elbows soft, and rise again (cable / rope / band straight-arm pulldowns; the cable not drawn). */
export function buildExStraightArmPulldown(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.14, ANKLE, 0.12);
  const bones = { Hips: [22, 0, 0] as Deg3, Spine: [2, 0, 0] as Deg3, Neck: [-14, 0, 0] as Deg3, LeftLeg: [12, 0, 0] as Deg3, RightLeg: [12, 0, 0] as Deg3, LeftFoot: [-6, 0, 0] as Deg3, RightFoot: [-6, 0, 0] as Deg3 };
  const up: K = { bones, feet, kneePoles: bothDir(0.1, 0, 1), rel: { Left: [0.06, 0.22, 0.46], Right: [-0.06, 0.22, 0.46] }, poles: bothDir(0.6, -0.4, -0.6), hipsY: -0.06 };
  const down: K = { bones, feet, kneePoles: bothDir(0.1, 0, 1), rel: { Left: [0.06, -0.48, 0.18], Right: [-0.06, -0.48, 0.18] }, poles: bothDir(0.6, 0, -0.8), hipsY: -0.06 };
  return loop(scene, sk, 'ex_straight_arm_pulldown', 2.4, [at(up, 0, true), at(mix(up, down, 0.5), 0.4), at(down, 0.8, true), at(down, 1.1, true), at(mix(down, up, 0.5), 1.6), at(up, 2.1, true)]);
}

/** ex_leg_raise — the lying leg raise: flat on the back, the hands by the hips, both legs long lift together to vertical and
 *  lower to just off the floor (leg raises, leg lifts, pull-ins; hanging leg / knee raises play it on the floor). */
export function buildExLegRaise(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const arms = both(0.26, 0.04, -0.24);
  const pose = (thigh: number, foot: number): K => ({ bones: { Hips: [-86, 0, 0], Spine: [0, 0, 0], Neck: [10, 0, 0], LeftUpLeg: [thigh, 0, 3], RightUpLeg: [thigh, 0, -3], LeftLeg: [4, 0, 0], RightLeg: [4, 0, 0], LeftFoot: [foot, 0, 0], RightFoot: [foot, 0, 0] }, hands: arms, poles: bothDir(0.6, 0.3, 0), hipsY: -0.86 });
  const low = pose(-6, 20), high = pose(-84, 10);
  return loop(scene, sk, 'ex_leg_raise', 3.0, [at(low, 0, true), at(mix(low, high, 0.5), 0.6), at(high, 1.2, true), at(high, 1.5, true), at(mix(high, low, 0.5), 2.1), at(low, 2.7, true)]);
}

/** ex_side_plank — the forearm side plank held, the top arm up, a small hip dip and lift (side plank / side bridge,
 *  Copenhagen holds and side-plank variants play it). On the left forearm, the top arm reaching to the ceiling. */
export function buildExSidePlank(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const pose = (dip: number): K => ({
    bones: { Hips: [0, 0, -66 + dip], Spine: [0, 0, 0], Neck: [0, 0, 30] },
    feet: { Left: [0.84, 0.06 - dip * 0.004, 0.02], Right: [0.84, 0.17 - dip * 0.004, -0.02] }, kneePoles: bothDir(0, 0, 1),
    hands: { Left: [-0.42, 0.05, 0.26], Right: [-0.40, 1.00 - dip * 0.004, 0.04] }, poles: { Left: [0, -1, -0.2], Right: [0.6, 0, -0.6] }, hipsY: -0.70 - dip * 0.006,
  });
  return loop(scene, sk, 'ex_side_plank', 3.0, [at(pose(0), 0, true), at(pose(6), 1.2, true), at(pose(6), 1.6, true), at(pose(0), 2.6, true)]);
}

/** ex_sled_push — the sled push driven in place: leaning about 45°, the arms long on the (undrawn) poles, short powerful steps
 *  on the balls of the feet, one knee driving through as the other foot is planted (sled pushes, prowler sprints, sled drags). */
export function buildExSledPush(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const arms: Pair = { Left: [0.06, -0.10, 0.44], Right: [-0.06, -0.10, 0.44] };
  const base = { Hips: [44, 0, 0] as Deg3, Spine: [2, 0, 0] as Deg3, Neck: [-34, 0, 0] as Deg3 };
  const plantL: V3 = [-0.12, TOE_ANKLE + 0.04, -0.22], plantR: V3 = [0.12, TOE_ANKLE + 0.04, -0.22];
  const both2: K = { bones: { ...base, LeftFoot: [32, 0, 0], RightFoot: [32, 0, 0] }, feet: { Left: plantL, Right: plantR }, kneePoles: bothDir(0.1, 0, 1), rel: arms, poles: bothDir(0.4, -0.6, -0.5), hipsY: -0.16 };
  const driveR: K = { ...both2, bones: { ...both2.bones }, feet: { Left: plantL, Right: [0.12, 0.30, 0.14] }, kneePoles: { Left: [-0.1, 0, 1], Right: [0.1, 0.2, 1] }, hipsY: -0.14 };
  return loop(scene, sk, 'ex_sled_push', 1.4, alternate([at(both2, 0), at(mix(both2, driveR, 0.5), 0.14), at(driveR, 0.3, true), at(mix(driveR, both2, 0.5), 0.5), at(both2, 0.62)], 0.7));
}

/** ex_kb_swing — the two-hand kettlebell swing: hike the bell back between the thighs in a hinge, snap the hips through to
 *  stand tall, the arms float to chest height, and fall back into the hinge (two-hand / one-arm / double / dead-stop swings,
 *  dumbbell swings; the bell is not drawn). */
export function buildExKbSwing(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.19, ANKLE, 0.10);
  const hike: K = { bones: { Hips: [58, 0, 0], Spine: [4, 0, 0], Neck: [-30, 0, 0], LeftFoot: [-14, 0, 0], RightFoot: [-14, 0, 0] }, feet, kneePoles: KNEES_OUT, rel: { Left: [0.17, -0.50, -0.16], Right: [-0.17, -0.50, -0.16] }, poles: HANG_POLES, hipsY: -0.16 };
  const mid: K = { bones: { Hips: [26, 0, 0], Spine: [2, 0, 0], Neck: [-12, 0, 0], LeftFoot: [-8, 0, 0], RightFoot: [-8, 0, 0] }, feet, kneePoles: KNEES_OUT, rel: { Left: [0.16, -0.48, 0.14], Right: [-0.16, -0.48, 0.14] }, poles: HANG_POLES, hipsY: -0.08 };
  const top: K = { bones: { ...STAND, Spine: [-2, 0, 0] }, feet, kneePoles: KNEES_OUT, rel: { Left: [0.15, -0.06, 0.50], Right: [-0.15, -0.06, 0.50] }, poles: bothDir(0.4, -0.6, -0.6), hipsY: 0 };
  return loop(scene, sk, 'ex_kb_swing', 1.8, [at(hike, 0, true), at(mid, 0.3), at(top, 0.6, true), at(top, 0.78, true), at(mid, 1.15), at(hike, 1.5, true)]);
}

/** Batch B5: [clip name, builder], in plan order. */
export const EXERCISE_BATCH_B5_BUILDERS: readonly [string, (scene: Scene, sk: Skeleton) => AnimationGroup | null][] = [
  ['ex_row_seated_cable', buildExRowSeatedCable], ['ex_carry_strongman', buildExCarryStrongman], ['ex_jump_rope_variants', buildExJumpRopeVariants], ['ex_throw_overhead', buildExThrowOverhead],
  ['ex_leg_press', buildExLegPress], ['ex_straight_arm_pulldown', buildExStraightArmPulldown], ['ex_leg_raise', buildExLegRaise], ['ex_side_plank', buildExSidePlank],
  ['ex_sled_push', buildExSledPush], ['ex_kb_swing', buildExKbSwing],
];
export const EXERCISE_BATCH_B5_CLIPS: readonly string[] = EXERCISE_BATCH_B5_BUILDERS.map(([n]) => n);
