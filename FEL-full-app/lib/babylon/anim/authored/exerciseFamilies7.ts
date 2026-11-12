// DEMO-LOOPS-7 (2026-11-03): the next measured gaps — the presses (bench, machine, cable, overhead), the raises, the trunk's
// rotations and decline work, and a few of the dynamic warm-up's — each read against the movement its entry was imported as
// (free-exercise-db). Same kit and pipeline as the library's loops: GATE 0 on every body is poseGuard.test.ts, the floor
// and the closed seam exercise.test.ts.
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import {
  ANKLE, STAND, STANCE, HANG, HANG_POLES, HIGH_PLANK, OVERHEAD, RACK, UPPER, both, bothDir, incline, rep, repOf, seat,
  type Deg3, type ExKey, type Pair, type RepPair, type V3,
} from './exerciseKit';
import { alternating, kneel, oneArm } from './exerciseMore';
import { run, at } from './exerciseBody';

type Pose = Omit<ExKey, 't'>;
type Builder = (scene: Scene, sk: Skeleton) => AnimationGroup | null;
const pair = (x: number, y: number, z: number): Pair => ({ Left: [x, y, z], Right: [-x, y, z] });
const ON_HIPS: Pair = { Left: [0.04, -0.42, 0.08], Right: [-0.04, -0.42, 0.08] };
const HIPS_POLES = bothDir(1, -0.2, 0);
const BAR_BACK = pair(-0.22, 0.02, -0.10);   // the bar across the upper back (exercise.ts ex_squat_bar)
const BAR_BACK_POLES = bothDir(0.3, -1, -0.3);
const twoKey = (scene: Scene, sk: Skeleton, name: string, keys: [Pose, number, boolean?][], dur: number, pivot = true) => run(scene, sk, name, dur, keys.map(([p, t, h]) => at(p, t, h ?? true)), pivot);

// ── the bench press family: one arm, arm after arm, the machine and cable presses ────────────────────────────────────

/** The floor press (exercise.ts ex_floor_press's numbers): lying on the floor, the knees up, the upper arms resting on it. */
const FLOOR_BASE = { bones: { Hips: [-88, 0, 0] as Deg3, Spine: [0, 0, 0] as Deg3, Neck: [10, 0, 0] as Deg3 }, feet: both(0.20, ANKLE, 0.46), kneePoles: bothDir(0.1, 1, 0.3), hipsY: -0.84 };
const FLOOR_PRESS: RepPair = { a: { ...FLOOR_BASE, hands: both(0.22, 0.70, -0.44), poles: bothDir(0.7, -0.5, 0) }, b: { ...FLOOR_BASE, hands: both(0.27, 0.30, -0.34), poles: bothDir(0.8, -0.6, 0) }, t: [0.9, 0.25, 0.8, 0.35] };
/** the free arm on the floor out at the side, the hand flat */
const FLOOR_FREE: Pose = { ...FLOOR_BASE, hands: { Left: [-0.42, 0.06, -0.30] }, poles: { Left: [-0.3, 1, 0] } };

/** ex_floor_press_one — the one-arm floor press (a kettlebell or the bar in one hand): the right arm lowers until the upper
 *  arm rests on the floor and presses back to lockout over the shoulder, the left arm out on the floor. */
const floorPressOne: Builder = (scene, sk) => repOf(scene, sk, 'ex_floor_press_one', oneArm(FLOOR_PRESS, FLOOR_FREE));
/** ex_floor_press_alt — both bells held up over the chest; one lowers to the chest and presses back up, then the other. */
const floorPressAlt: Builder = (scene, sk) => alternating(scene, sk, 'ex_floor_press_alt', FLOOR_PRESS);
/** ex_bench_press_one — the one-arm dumbbell bench press on a flat bench, the free hand at the hip. */
const benchPressOne: Builder = (scene, sk) => repOf(scene, sk, 'ex_bench_press_one', oneArm(UPPER.bench, { ...UPPER.bench.a, hands: { Left: [-0.26, 0.52, 0.04] }, poles: { Left: [-0.4, -1, 0] } } as Pose));

/** The machine / cable chest press, seated upright with the back on the pad (flat; the incline presses up and forward, the
 *  decline down and forward), or standing in a split stance (the cable's): the handles from beside the chest, elbows back at
 *  about 45°, pressed out until the arms are long, the hands coming together. */
function chestPress(name: string, how: 'flat' | 'incline' | 'decline' | 'stand'): Builder {
  const y = how === 'incline' ? 0.24 : how === 'decline' ? -0.30 : -0.10;
  const z = how === 'flat' || how === 'stand' ? 0.52 : 0.44;
  const a: Pair = pair(-0.02, -0.12, 0.08), b: Pair = pair(0.12, y, z);
  const poleA = bothDir(0.8, -0.4, -0.6), poleB = bothDir(0.7, -0.6, 0);
  if (how === 'stand') {
    const feet: Pair = { Left: [-0.13, ANKLE, 0.22], Right: [0.13, ANKLE, -0.22] };
    const base = { bones: { ...STAND, Hips: [6, 0, 0] as Deg3, Spine: [4, 0, 0] as Deg3, RightFoot: [-6, 0, 0] as Deg3 }, feet, kneePoles: bothDir(0.1, 0, 1), hipsY: -0.03 };
    return (scene, sk) => rep(scene, sk, name, { ...base, rel: a, poles: poleA }, { ...base, rel: b, poles: poleB }, 0.8, 0.25, 0.9, 0.3);
  }
  return (scene, sk) => rep(scene, sk, name, seat({ rel: a, poles: poleA }), seat({ rel: b, poles: poleB }), 0.8, 0.25, 0.9, 0.3);
}

// ── the raises ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** ex_incline_shoulder_raise — lying back on an incline bench, the arms straight up over the shoulders: the shoulder blades
 *  push the weight a few centimetres further up (the arms stay straight), and settle back. */
const inclineShoulderRaise: Builder = (scene, sk) => {
  const a = incline({ hands: both(0.22, 1.42, -0.26), poles: bothDir(0.7, -0.3, 0.1) });
  const b = incline({ bones: { LeftShoulder: [0, -12, 0], RightShoulder: [0, 12, 0] }, hands: both(0.21, 1.48, -0.21), poles: bothDir(0.7, -0.3, 0.1) });
  return rep(scene, sk, 'ex_incline_shoulder_raise', a, b, 0.6, 0.4, 0.7, 0.4);
};
/** ex_front_raise_incline — sitting back on an incline bench, the arms hanging: straight arms raised in front to shoulder
 *  height, palms down, and lowered. */
const frontRaiseIncline: Builder = (scene, sk) => {
  const a = incline({ rel: pair(0.04, -0.54, 0.10), poles: bothDir(1, 0, 0) });
  const b = incline({ rel: pair(0.06, -0.04, 0.54), poles: bothDir(1, 0, 0) });
  return rep(scene, sk, 'ex_front_raise_incline', a, b, 0.8, 0.2, 1.0, 0.3);
};
/** ex_front_to_lateral (side laterals to front raise) — the dumbbells raised straight in front to shoulder height, swept out
 *  to the sides at that height, and lowered at the sides; and the other way round. */
const frontToLateral: Builder = (scene, sk) => {
  const down = UPPER.front.a, front = UPPER.front.b, side = UPPER.lateral.b, sideDown = UPPER.lateral.a;
  return twoKey(scene, sk, 'ex_front_to_lateral', [[down, 0], [front, 0.8], [side, 1.5], [sideDown, 2.3], [side, 3.1], [front, 3.8], [down, 4.6]], 5.0);
};
/** ex_single_db_raise — a wide stance, one dumbbell held by its head in both hands at the waist: raised on straight arms to
 *  above shoulder height, and lowered. */
const singleDbRaise: Builder = (scene, sk) => {
  const feet = both(0.24, ANKLE, 0.06);
  const a: Pose = { bones: STAND, feet, kneePoles: bothDir(0.2, 0, 1), hands: both(0.04, 0.82, 0.16), poles: bothDir(1, -0.2, 0), hipsY: -0.02 };
  const b: Pose = { ...a, hands: both(0.04, 1.58, 0.46) };
  return rep(scene, sk, 'ex_single_db_raise', a, b, 0.9, 0.2, 1.0, 0.3);
};
/** ex_cuban_press — the upper arms raised out level with the shoulders, the forearms hanging (the scarecrow); the forearms
 *  turn up (the upper arms still), the dumbbells are pressed overhead; and back down the same way. */
const cubanPress: Builder = (scene, sk) => {
  const hang: Pose = { bones: STAND, feet: STANCE, hands: both(0.20, 0.86, 0.10), poles: bothDir(1, 0, 0), hipsY: 0 };
  const scare: Pose = { ...hang, hands: both(0.44, 1.14, 0.08), poles: bothDir(1, 0.25, 0) };
  const up: Pose = { ...hang, hands: both(0.44, 1.68, 0.02), poles: bothDir(1, -0.25, 0) };
  const press: Pose = { ...hang, rel: OVERHEAD, hands: undefined, poles: bothDir(1, 0.1, -0.1) };
  return twoKey(scene, sk, 'ex_cuban_press', [[hang, 0], [scare, 0.8], [up, 1.6], [press, 2.4], [up, 3.2], [scare, 4.0], [hang, 4.8]], 5.2);
};

// ── the overhead presses ─────────────────────────────────────────────────────────────────────────────────────────

/** ex_arnold_seated — seated tall on a bench, the dumbbells at the upper chest, palms toward the face (a curl's top): the
 *  elbows open out to the sides as the hands turn and press overhead; and back the same way. ex_arnold_one — the kettlebell
 *  Arnold press, standing, the right arm, the left on the hip. */
function arnold(name: string, one: boolean): Builder {
  const low: Pair = pair(0.08, -0.08, 0.16), mid: Pair = pair(-0.04, 0.16, 0.04);
  const lowP = bothDir(0.1, -1, 0.7), midP = bothDir(1, -0.3, 0), topP = bothDir(1, 0.1, -0.1);
  const stand = (rel: Pair, poles: Pair): Pose => ({ bones: { ...STAND, Spine: [0, 0, 0] }, feet: STANCE, rel: one ? { Right: rel.Right, Left: ON_HIPS.Left } : rel, poles: one ? { Right: poles.Right, Left: HIPS_POLES.Left } : poles, hipsY: 0 });
  const p = (rel: Pair, poles: Pair): Pose => (one ? stand(rel, poles) : seat({ rel, poles }));
  return (scene, sk) => twoKey(scene, sk, name, [[p(low, lowP), 0], [p(mid, midP), 0.5, false], [p(OVERHEAD, topP), 0.9], [p(OVERHEAD, topP), 1.2], [p(mid, midP), 1.7, false], [p(low, lowP), 2.2]], 2.6);
}
/** ex_press_behind_neck — standing, the bar across the back of the shoulders, a wide grip: pressed straight up overhead to
 *  lockout, and lowered behind the head. */
const pressBehindNeck: Builder = (scene, sk) => {
  const base = { bones: { ...STAND, Spine: [0, 0, 0] as Deg3, Neck: [4, 0, 0] as Deg3 }, feet: STANCE, hipsY: 0 };
  return rep(scene, sk, 'ex_press_behind_neck', { ...base, rel: BAR_BACK, poles: BAR_BACK_POLES }, { ...base, rel: pair(-0.16, 0.60, -0.06), poles: bothDir(1, 0.1, -0.2) }, 0.8, 0.25, 1.0, 0.35);
};
/** ex_bradford_press (standing; ex_bradford_seated on a bench) — the bar racked on the front of the shoulders: pressed just
 *  over the head (the elbows never lock) and down behind the neck, then back over and down to the front. */
function bradford(name: string, seated: boolean): Builder {
  const over: Pair = pair(0.0, 0.42, -0.02), back: Pair = pair(-0.20, 0.03, -0.10);
  const p = (rel: Pair, poles: Pair): Pose => (seated ? seat({ rel, poles }) : { bones: { ...STAND, Spine: [0, 0, 0] }, feet: STANCE, rel, poles, hipsY: 0 });
  const front = p(RACK, bothDir(0.4, -1, 0.3)), top = p(over, bothDir(1, -0.1, 0)), behind = p(back, BAR_BACK_POLES);
  return (scene, sk) => twoKey(scene, sk, name, [[front, 0], [top, 0.7, false], [behind, 1.3], [top, 2.0, false], [front, 2.6]], 3.0);
}
/** ex_jammer — the landmine's linear jammer: an athletic stance, both hands on the handle at the shoulders; a quick dip of the
 *  knees, then the legs and the arms drive the bar up and forward to lockout, up on the toes; back down to the shoulders.
 *  ex_jammer_one — one arm, a wide stance, pressed up from the shoulder. */
function jammer(name: string, one: boolean): Builder {
  const feet = both(one ? 0.24 : 0.18, ANKLE, 0.04);
  const hold: Pair = one ? { Right: [-0.04, -0.04, 0.16], Left: ON_HIPS.Left } : pair(0.14, -0.04, 0.18);
  const out: Pair = one ? { Right: [-0.04, 0.36, 0.40], Left: ON_HIPS.Left } : pair(0.15, 0.36, 0.40);
  const poles = one ? { Right: [0.5, -1, 0.2] as V3, Left: HIPS_POLES.Left } : bothDir(0.5, -1, 0.2);
  const set: Pose = { bones: { ...STAND, Hips: [6, 0, 0] }, feet, kneePoles: bothDir(0.2, 0, 1), rel: hold, poles, hipsY: -0.02 };
  const dip: Pose = { ...set, bones: { Hips: [14, 0, 0], Spine: [4, 0, 0], Neck: [-8, 0, 0], LeftFoot: [-14, 0, 0], RightFoot: [-14, 0, 0] }, hipsY: -0.12 };
  const drive: Pose = { ...set, bones: { ...STAND, Hips: [-4, 0, 0], LeftFoot: one ? [0, 0, 0] : [20, 0, 0], RightFoot: one ? [0, 0, 0] : [20, 0, 0] }, feet: one ? feet : both(0.18, ANKLE + 0.05, 0.04), rel: out, hipsY: one ? 0 : 0.04 };
  return (scene, sk) => twoKey(scene, sk, name, one ? [[set, 0], [drive, 0.8], [drive, 1.1], [set, 2.0]] : [[set, 0], [dip, 0.4], [drive, 0.75], [drive, 1.05], [set, 1.9]], one ? 2.3 : 2.3);
}

// ── the trunk: rotation, the side bends, the decline ────────────────────────────────────────────────────────────────

/** ex_seat_twist_bar — sitting on the end of a bench, the bar across the back of the shoulders: the upper body turns to one
 *  side and the other, the hips still. ex_side_bend_bar — standing with the bar on the back: bend at the waist to one side and
 *  the other. */
const seatTwistBar: Builder = (scene, sk) => {
  const p = (s: number) => seat({ bones: { Spine: [2, 22 * s, 0], Spine1: [0, 16 * s, 0], Neck: [0, -6 * s, 0] }, rel: BAR_BACK, poles: BAR_BACK_POLES });
  return twoKey(scene, sk, 'ex_seat_twist_bar', [[p(0), 0, false], [p(1), 0.7], [p(1), 0.9], [p(0), 1.5, false], [p(-1), 2.2], [p(-1), 2.4]], 3.0);
};
const sideBendBar: Builder = (scene, sk) => {
  const p = (s: number): Pose => ({ bones: { ...STAND, Spine: [2, 0, -18 * s], Spine1: [0, 0, -12 * s], Neck: [0, 0, 6 * s] }, feet: both(0.15, ANKLE, 0.06), rel: BAR_BACK, poles: BAR_BACK_POLES, hipsY: 0 });
  return twoKey(scene, sk, 'ex_side_bend_bar', [[p(0), 0, false], [p(1), 0.9], [p(1), 1.2], [p(0), 2.0, false], [p(-1), 2.9], [p(-1), 3.2]], 4.0);
};
/** ex_landmine_180 — a wide stance, the bar's end held in both hands at shoulder height, arms long: the trunk and the hips turn
 *  and the weight swings down in an arc to one hip, then back up and over to the other. */
const landmine180: Builder = (scene, sk) => {
  const feet = both(0.26, ANKLE, 0.04);
  const p = (s: number): Pose => {
    const low = Math.abs(s);
    return { bones: { Hips: [4 * low, 18 * s, 0], Spine: [4, 14 * s, 0], Spine1: [0, 10 * s, 0], Neck: [0, -8 * s, 0] }, feet, kneePoles: bothDir(0.3, 0, 1), rel: { Left: [0.16 + 0.42 * s, -0.04 - 0.36 * low, 0.48 - 0.12 * low], Right: [-0.16 + 0.42 * s, -0.04 - 0.36 * low, 0.48 - 0.12 * low] }, poles: bothDir(0.6, -0.8, 0), hipsY: -0.04 - 0.04 * low };
  };
  return twoKey(scene, sk, 'ex_landmine_180', [[p(0), 0, false], [p(1), 0.8], [p(1), 1.0], [p(0), 1.6, false], [p(-1), 2.4], [p(-1), 2.6]], 3.2);
};
/** ex_car_driver — standing, a plate held out in front at shoulder height, the hands at 3 and 9 o'clock: turned like a
 *  steering wheel as far as it goes one way, then the other. */
const carDriver: Builder = (scene, sk) => {
  const p = (deg: number): Pose => {
    const r = (deg * Math.PI) / 180, c = Math.cos(r) * 0.17, s = Math.sin(r) * 0.17;
    return { bones: { ...STAND }, feet: STANCE, hands: { Left: [-c, 1.36 - s, 0.56], Right: [c, 1.36 + s, 0.56] }, poles: bothDir(0.6, -1, 0), hipsY: 0 };
  };
  return twoKey(scene, sk, 'ex_car_driver', [[p(0), 0, false], [p(70), 0.7], [p(70), 0.9], [p(0), 1.4, false], [p(-70), 2.1], [p(-70), 2.3]], 2.8);
};
/** ex_rope_crunch_twist — kneeling under the high pulley, the rope's ends by the ears: the spine curls down and turns the ribs
 *  toward one knee, back up, then toward the other. */
const ropeCrunchTwist: Builder = (scene, sk) => {
  const rope: Pair = pair(0.12, 0.18, 0.04);
  const p = (u: number, s: number): Pose => kneel({ bones: { Hips: [8 * u, 0, 0], Spine: [24 * u, 14 * s, 0], Spine1: [22 * u, 12 * s, 0], Neck: [12 * u, 0, 0] }, rel: rope, poles: bothDir(0.6, 0, 0.8), hipsY: 0 }, ['Left', 'Right']);
  return twoKey(scene, sk, 'ex_rope_crunch_twist', [[p(0, 0), 0], [p(1, 1), 0.8], [p(1, 1), 1.1], [p(0, 0), 1.9], [p(1, -1), 2.7], [p(1, -1), 3.0]], 3.8);
};

/** Lying back on the decline bench, the knees hooked over its high end (exerciseVariants.ts DECLINED's numbers). */
const DECLINED: Pose = { bones: { Hips: [-104, 0, 0], Spine: [0, 0, 0], Neck: [10, 0, 0], LeftFoot: [10, 0, 0], RightFoot: [10, 0, 0] }, feet: both(0.12, 0.26, 0.40), kneePoles: bothDir(0.1, 0.6, 1), hipsY: -0.26 };
const HEAD_HANDS: Pair = pair(0.15, 0.20, -0.02);
const decl = (bones: Record<string, Deg3>, rel: Pair, poles: Pair): Pose => ({ ...DECLINED, bones: { ...DECLINED.bones, ...bones }, rel, poles });
/** ex_decline_crunch — on the decline bench, the hands lightly at the head: the shoulders roll up off the pad, the lower back
 *  staying down, and lower. */
const declineCrunch: Builder = (scene, sk) => rep(scene, sk, 'ex_decline_crunch', decl({}, HEAD_HANDS, bothDir(1, 0.1, 0.2)), decl({ Hips: [-100, 0, 0], Spine: [22, 0, 0], Spine1: [16, 0, 0], Neck: [14, 0, 0] }, HEAD_HANDS, bothDir(1, 0.1, 0.2)), 0.7, 0.3, 0.8, 0.3);
/** ex_decline_oblique — on the decline bench, the torso held up off it at about 40°, the right hand at the head and the left on
 *  the thigh: the trunk rises a little more and turns the right elbow across toward the left knee, and back. */
const declineOblique: Builder = (scene, sk) => {
  const hands = (s: number): Pair => ({ Right: [-0.15, 0.20, -0.02], Left: [0.10, -0.40, 0.30 + 0.04 * s] });
  const poles: Pair = { Right: [1, 0.1, 0.2], Left: [-0.4, -1, 0] };
  return rep(scene, sk, 'ex_decline_oblique', decl({ Hips: [-64, 0, 0], Spine: [4, 0, 0] }, hands(0), poles), decl({ Hips: [-58, 0, 0], Spine: [10, 20, 0], Spine1: [6, 14, 0], Neck: [6, 0, 0] }, hands(1), poles), 0.7, 0.3, 0.8, 0.3);
};
/** ex_decline_situp — on the decline bench, the band handles held at the shoulders: the whole trunk sits up to upright, and
 *  lowers back to the pad. */
const declineSitup: Builder = (scene, sk) => {
  const hands = pair(0.10, -0.04, 0.12), poles = bothDir(0.6, -1, 0.4);
  return run(scene, sk, 'ex_decline_situp', 2.8, [at(decl({}, hands, poles), 0, true), at(decl({ Hips: [-70, 0, 0], Spine: [18, 0, 0], Neck: [12, 0, 0] }, hands, poles), 0.55), at(decl({ Hips: [-22, 0, 0], Spine: [8, 0, 0], Neck: [0, 0, 0] }, hands, poles), 1.1, true), at(decl({ Hips: [-22, 0, 0], Spine: [8, 0, 0], Neck: [0, 0, 0] }, hands, poles), 1.4, true), at(decl({ Hips: [-70, 0, 0], Spine: [18, 0, 0], Neck: [12, 0, 0] }, hands, poles), 1.95)], true);
};
/** ex_gorilla_chin — hanging from the bar, palms toward the face, the knees bent at a right angle: pull up as the knees drive
 *  up to the chest (the crunch), the chin to the bar; lower slow. */
const gorillaChin: Builder = (scene, sk) => {
  const p = (u: number): Pose => ({
    bones: { Hips: [-14 * u, 0, 0], Spine: [10 * u, 0, 0], Neck: [-6 * u, 0, 0], LeftUpLeg: [-6 - 100 * u, 0, 2], RightUpLeg: [-6 - 100 * u, 0, -2], LeftLeg: [90 + 20 * u, 0, 0], RightLeg: [90 + 20 * u, 0, 0], LeftFoot: [20, 0, 0], RightFoot: [20, 0, 0] },
    handsAt: both(0.16, 2.18, 0.02), poles: bothDir(0.3, -0.5, 0.8), hipsY: 0.26 + 0.34 * u,
  });
  return twoKey(scene, sk, 'ex_gorilla_chin', [[p(0), 0], [p(1), 0.9], [p(1), 1.2], [p(0), 2.3]], 2.6);
};

// ── the dynamic warm-up ─────────────────────────────────────────────────────────────────────────────────────────────

const N = 12;
const circle = (f: (a: number) => Pose, t0: number, step: number, turns = 2): ExKey[] => {
  const keys: ExKey[] = [];
  for (let i = 0; i <= N * turns; i++) keys.push(at(f((i / N) * 2 * Math.PI), t0 + i * step, i === 0 || i === N * turns));
  return keys;
};
const TALL: Pose = { bones: { ...STAND }, feet: STANCE, hands: HANG, poles: HANG_POLES, hipsY: 0 };
/** ex_elbow_circles — the fingertips on the shoulders, the elbows out at shoulder height: the elbows draw slow circles,
 *  forward, then back. */
const elbowCircles: Builder = (scene, sk) => {
  const p = (a: number, dir: number): Pose => ({ bones: { ...STAND }, feet: STANCE, rel: pair(0.02, 0.04, 0.06), poles: { Left: [-1, 0.45 * Math.sin(a), 0.45 * Math.cos(a) * dir], Right: [1, 0.45 * Math.sin(a), 0.45 * Math.cos(a) * dir] }, hipsY: 0 });
  return run(scene, sk, 'ex_elbow_circles', 7.4, [at(TALL, 0, true), ...circle((a) => p(a, 1), 0.7, 0.12), ...circle((a) => p(a, -1), 3.8, 0.12), at(TALL, 7.0, true)], true);
};
/** ex_shoulder_rolls (shoulder circles) — the arms loose at the sides: the shoulders roll forward, up, back and down, and the
 *  other way round. */
const shoulderRolls: Builder = (scene, sk) => {
  const arms: Pair = pair(-0.05, -0.56, 0.04);
  const p = (a: number, dir: number): Pose => {
    const f = Math.cos(a) * dir, u = Math.sin(a);
    return { bones: { ...STAND, LeftShoulder: [0, -10 * f, 10 * u], RightShoulder: [0, 10 * f, -10 * u] }, feet: STANCE, rel: arms, poles: HANG_POLES, hipsY: 0 };
  };
  return run(scene, sk, 'ex_shoulder_rolls', 6.6, [...circle((a) => p(a, 1), 0, 0.13), ...circle((a) => p(a, -1), 3.3, 0.13)], true);
};
/** ex_groiner — from the push-up position, both feet jump forward to land beside the hands (the hips low, the head up), and
 *  jump back out to the plank. */
const groiner: Builder = (scene, sk) => {
  const P = HIGH_PLANK;
  const inn: Pose = { ...P, bones: { Hips: [64, 0, 0], Spine: [10, 0, 0], Neck: [-40, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] }, feet: both(0.34, ANKLE, 0.16), kneePoles: bothDir(0.8, 0.2, 0.6), hipsY: -0.62 };
  const air: Pose = { ...P, bones: { ...P.bones, Hips: [74, 0, 0] }, feet: both(0.22, ANKLE + 0.10, -0.40), kneePoles: bothDir(0.4, -0.6, 0.6), hipsY: -0.46 };
  return twoKey(scene, sk, 'ex_groiner', [[P, 0], [air, 0.25, false], [inn, 0.5], [inn, 0.8], [air, 1.05, false], [P, 1.3]], 1.6);
};
/** ex_hip_circle_quad (prone hip circles) — on the hands and knees, one knee lifted, still bent: the knee draws a big circle
 *  out to the side and round; then the other leg. */
const hipCircleQuad: Builder = (scene, sk) => {
  const base: Record<string, Deg3> = { Hips: [90, 0, 0], Spine: [0, 0, 0], Neck: [-50, 0, 0], LeftUpLeg: [-90, 0, 0], RightUpLeg: [-90, 0, 0], LeftLeg: [90, 0, 0], RightLeg: [90, 0, 0], LeftFoot: [34, 0, 0], RightFoot: [34, 0, 0] };
  const hands = both(0.18, 0.05, 0.52), poles = bothDir(0.6, 0.2, -0.5);
  const p = (leg: 'Left' | 'Right' | null, a = 0): Pose => {
    if (!leg) return { bones: base, hands, poles, hipsY: -0.40 };
    const s = leg === 'Left' ? 1 : -1;
    return { bones: { ...base, [`${leg}UpLeg`]: [-60 + 22 * Math.cos(a), 0, (26 + 18 * Math.sin(a)) * s], [`${leg}Leg`]: [90, 0, 0] } as Record<string, Deg3>, hands, poles, hipsY: -0.40 };
  };
  return run(scene, sk, 'ex_hip_circle_quad', 9.2, [at(p(null), 0, true), ...circle((a) => p('Left', a), 0.6, 0.16), at(p(null), 4.6, true), ...circle((a) => p('Right', a), 5.0, 0.16)], true);
};

export const FAMILY7_BUILDERS: readonly [string, Builder][] = [
  ['ex_floor_press_one', floorPressOne], ['ex_floor_press_alt', floorPressAlt], ['ex_bench_press_one', benchPressOne],
  ['ex_chest_press_seat', chestPress('ex_chest_press_seat', 'flat')], ['ex_chest_press_incline', chestPress('ex_chest_press_incline', 'incline')],
  ['ex_chest_press_decline', chestPress('ex_chest_press_decline', 'decline')], ['ex_chest_press_stand', chestPress('ex_chest_press_stand', 'stand')],
  ['ex_incline_shoulder_raise', inclineShoulderRaise], ['ex_front_raise_incline', frontRaiseIncline], ['ex_front_to_lateral', frontToLateral],
  ['ex_single_db_raise', singleDbRaise], ['ex_cuban_press', cubanPress],
  ['ex_arnold_seated', arnold('ex_arnold_seated', false)], ['ex_arnold_one', arnold('ex_arnold_one', true)], ['ex_press_behind_neck', pressBehindNeck],
  ['ex_bradford_press', bradford('ex_bradford_press', false)], ['ex_bradford_seated', bradford('ex_bradford_seated', true)],
  ['ex_jammer', jammer('ex_jammer', false)], ['ex_jammer_one', jammer('ex_jammer_one', true)],
  ['ex_seat_twist_bar', seatTwistBar], ['ex_side_bend_bar', sideBendBar], ['ex_landmine_180', landmine180], ['ex_car_driver', carDriver], ['ex_rope_crunch_twist', ropeCrunchTwist],
  ['ex_decline_crunch', declineCrunch], ['ex_decline_oblique', declineOblique], ['ex_decline_situp', declineSitup], ['ex_gorilla_chin', gorillaChin],
  ['ex_elbow_circles', elbowCircles], ['ex_shoulder_rolls', shoulderRolls], ['ex_groiner', groiner], ['ex_hip_circle_quad', hipCircleQuad],
];
