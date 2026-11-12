// The biggest families with no loop (DEMO-LOOPS-4, 2026-11-03). Owner: "Make more animations" — after the warm-up and the
// programs' asks, the approved library's largest still-tile families, measured: the upper-body stretches, the dynamic
// warm-up's circles and leg raises, the kettlebell clean / snatch / jerk family, and the hanging and bar-supported leg raises.
// One parametric builder per family where the shapes share a skeleton (a held stretch, a circle, a ballistic bell), each loop
// named for the movement it shows, and lib/library/demo.ts maps entries to them by variation. Same kit and pipeline as the
// library's loops: GATE 0 on every body is poseGuard.test.ts, the floor and the planted feet exercise.test.ts.
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { ANKLE, STAND, STANCE, HANG, HANG_POLES, both, bothDir, loop, type Deg3, type ExKey, type Pair } from './exerciseKit';
import { mirror, SUPINE, LIE_BACK } from './exerciseFloor';
import { run, at } from './exerciseBody';

type Pose = Omit<ExKey, 't'>;
type Builder = (scene: Scene, sk: Skeleton) => AnimationGroup | null;

const TALL: Pose = { bones: { ...STAND }, feet: STANCE, hands: HANG, poles: HANG_POLES, hipsY: 0 };
const ON_HIPS: Pair = { Left: [0.04, -0.42, 0.08], Right: [-0.04, -0.42, 0.08] };
const HIPS_POLES = bothDir(1, -0.2, 0);

// ── the held stretches ───────────────────────────────────────────────────────────────────────────────────────────────

/** A held stretch: ease in from standing tall, to the first firm pull, and on two long breaths out a little deeper; ease out.
 *  `sided`: the right side's stretch, then the same on the left. */
function hold(scene: Scene, sk: Skeleton, name: string, firm: Pose, deep: Pose, sided = false): AnimationGroup | null {
  const side = (a: Pose, b: Pose, t0: number): ExKey[] => [at(a, t0 + 1.0, true), at(b, t0 + 2.2, true), at(a, t0 + 3.2, true), at(b, t0 + 4.4, true), at(b, t0 + 5.0, true)];
  if (!sided) return run(scene, sk, name, 6.6, [at(TALL, 0, true), ...side(firm, deep, 0)]);
  return run(scene, sk, name, 12.4, [at(TALL, 0, true), ...side(firm, deep, 0), at(TALL, 5.9, true), ...side(mirror(firm), mirror(deep), 5.9)]);
}

/** ex_stretch_triceps — the right arm up, the elbow bent so the hand drops behind the neck; the left hand over the head on the
 *  right elbow eases it back. Then the left arm. */
const tricepsOverhead: Builder = (scene, sk) => {
  const p = (d: number): Pose => ({
    bones: { ...STAND, Neck: [6, 0, 0] }, feet: STANCE,
    rel: { Right: [-0.12, 0.12 - 0.04 * d, -0.12], Left: [0.34 + 0.03 * d, 0.36, 0.02] }, poles: { Right: [0.2, 1, 0.2], Left: [-0.5, 0.6, 0.7] }, hipsY: 0,
  });
  return hold(scene, sk, 'ex_stretch_triceps', p(0.4), p(1), true);
};

/** ex_stretch_triceps_side — the right arm brought across the body, the elbow bent so the hand reaches over the left shoulder;
 *  the left hand holds the right elbow and draws it across. Then the left arm. */
const tricepsSide: Builder = (scene, sk) => {
  const p = (d: number): Pose => ({
    bones: { ...STAND }, feet: STANCE,
    rel: { Right: [-0.30 - 0.03 * d, 0.06, -0.02], Left: [0.18 + 0.03 * d, -0.04, 0.24] }, poles: { Right: [-0.3, -0.1, 1], Left: [-0.6, -0.8, 0.2] }, hipsY: 0,
  });
  return hold(scene, sk, 'ex_stretch_triceps_side', p(0.3), p(1), true);
};

/** ex_stretch_cross_arm — the right arm straight across the chest, the left forearm hooked over it above the elbow drawing it
 *  in toward the chest. Then the left arm. */
const crossArm: Builder = (scene, sk) => {
  const p = (d: number): Pose => ({ bones: { ...STAND, Spine: [2, 0, 0] }, feet: STANCE, rel: { Right: [-0.40 - 0.03 * d, -0.06, 0.24 - 0.04 * d], Left: [0.14, -0.04, 0.24 - 0.03 * d] }, poles: { Right: [0.2, -0.6, 0.8], Left: [-0.6, -0.8, 0.1] }, hipsY: 0 });
  return hold(scene, sk, 'ex_stretch_cross_arm', p(0.3), p(1), true);
};

/** ex_stretch_reach_up — the fingers laced, the palms pushed up to the ceiling, standing tall; a little taller each breath out. */
const reachUp: Builder = (scene, sk) => {
  const p = (d: number): Pose => ({ bones: { ...STAND, Spine: [0, 0, 0], Spine1: [-2 * d, 0, 0], Neck: [-4 * d, 0, 0] }, feet: STANCE, rel: { Left: [0.14, 0.58 + 0.03 * d, 0.02], Right: [-0.14, 0.58 + 0.03 * d, 0.02] }, poles: bothDir(1, 0.1, 0), hipsY: 0 });
  return hold(scene, sk, 'ex_stretch_reach_up', p(0), p(1));
};

/** ex_stretch_side_reach (the standing lateral stretch) — a stance a little wider than the hips, the knees soft: the right hand
 *  on the right hip, the left hand up behind the head, the trunk bends over to the right; then the other side. */
const sideReach: Builder = (scene, sk) => {
  const feet = both(0.17, ANKLE, 0.06);
  const p = (d: number): Pose => ({
    bones: { ...STAND, Spine: [0, 0, -14 * d], Spine1: [0, 0, -10 * d], Neck: [0, 0, 4 * d] }, feet, kneePoles: bothDir(0.1, 0, 1),
    rel: { Right: ON_HIPS.Right, Left: [0.14, 0.24, -0.08] }, poles: { Right: HIPS_POLES.Right, Left: [-0.4, 1, 0.1] }, hipsY: -0.02,
  });
  return hold(scene, sk, 'ex_stretch_side_reach', p(0.4), p(1), true);
};

/** ex_stretch_clasp_back — the hands clasped behind the back, the arms straight: the chest lifts and the hands rise away from
 *  the seat until the front of the shoulders and the arms pull. */
const claspBack: Builder = (scene, sk) => {
  const p = (d: number): Pose => ({ bones: { ...STAND, Spine: [-3 * d, 0, 0], Neck: [-4 * d, 0, 0] }, feet: STANCE, rel: { Left: [0.15, -0.46 + 0.18 * d, -0.18 - 0.24 * d], Right: [-0.15, -0.46 + 0.18 * d, -0.18 - 0.24 * d] }, poles: bothDir(0.4, -0.2, -1), hipsY: 0 });
  return hold(scene, sk, 'ex_stretch_clasp_back', p(0.2), p(1));
};

/** ex_stretch_upper_back — the arms out in front at shoulder height, the hands clasped: the hands push away and the upper back
 *  rounds, the chin dropping, until the pull spreads between the shoulder blades. */
const upperBack: Builder = (scene, sk) => {
  const p = (d: number): Pose => ({ bones: { ...STAND, Hips: [4 * d, 0, 0], Spine: [6 * d, 0, 0], Spine1: [14 * d, 0, 0], Neck: [10 * d, 0, 0] }, feet: STANCE, kneePoles: bothDir(0.05, 0, 1), rel: { Left: [0.15, -0.04, 0.48 + 0.04 * d], Right: [-0.15, -0.04, 0.48 + 0.04 * d] }, poles: bothDir(1, -0.4, 0), hipsY: -0.01 * d });
  return hold(scene, sk, 'ex_stretch_upper_back', p(0.4), p(1));
};

/** ex_stretch_neck_side — the head tilts the right ear toward the right shoulder, the right hand resting over the head adds
 *  its weight, the left shoulder reaching down. Then the other side. */
const neckSide: Builder = (scene, sk) => {
  const p = (d: number): Pose => ({ bones: { ...STAND, Neck: [2, 0, -16 * d], Head: [0, 0, -12 * d] }, feet: STANCE, rel: { Right: [-0.22 + 0.04 * d, 0.30 - 0.02 * d, 0.0] }, hands: { Left: [HANG.Left![0] - 0.01, HANG.Left![1] - 0.02 * d, HANG.Left![2]] }, poles: { Right: [0.8, 0.5, 0.1], Left: HANG_POLES.Left }, hipsY: 0 });
  return hold(scene, sk, 'ex_stretch_neck_side', p(0.4), p(1), true);
};

/** ex_stretch_chin_chest — the fingers laced behind the head: the chin drops to the chest, the weight of the arms easing it
 *  down, the elbows pointing at the floor. */
const chinChest: Builder = (scene, sk) => {
  const p = (d: number): Pose => ({ bones: { ...STAND, Spine1: [3 * d, 0, 0], Neck: [22 * d, 0, 0], Head: [12 * d, 0, 0] }, feet: STANCE, rel: { Left: [0.15, 0.24 - 0.06 * d, -0.06 + 0.06 * d], Right: [-0.15, 0.24 - 0.06 * d, -0.06 + 0.06 * d] }, poles: bothDir(0.5, -0.2, 0.8), hipsY: 0 });
  return hold(scene, sk, 'ex_stretch_chin_chest', p(0.2), p(1));
};

/** ex_stretch_behind_head — the hands laced behind the head, the chest up: the elbows open wide and draw back until the chest
 *  pulls. */
const behindHead: Builder = (scene, sk) => {
  const p = (d: number): Pose => ({ bones: { ...STAND, Spine: [-2 * d, 0, 0], Spine1: [-3 * d, 0, 0] }, feet: STANCE, rel: { Left: [0.15, 0.24, -0.08 - 0.02 * d], Right: [-0.15, 0.24, -0.08 - 0.02 * d] }, poles: bothDir(1, 0.1, 0.4 - 0.9 * d), hipsY: 0 });
  return hold(scene, sk, 'ex_stretch_behind_head', p(0), p(1));
};

// ── the dynamic warm-up: the circles, the leg raises, the toe touch ─────────────────────────────────────────────────

const N = 12;
const circle = (f: (a: number) => Pose, t0: number, step: number, turns = 2): ExKey[] => {
  const keys: ExKey[] = [];
  for (let i = 0; i <= N * turns; i++) keys.push(at(f((i / N) * 2 * Math.PI), t0 + i * step, i === 0 || i === N * turns));
  return keys;
};

/** ex_circle_ankle — on the right foot, hands on the hips: the left foot just off the floor draws two slow circles; then the
 *  right foot. */
const ankleCircles: Builder = (scene, sk) => {
  const base = (s: 1 | -1): Pose => ({ bones: { ...STAND }, feet: s > 0 ? { Right: [0.10, ANKLE, 0.06] } : { Left: [-0.10, ANKLE, 0.06] }, kneePoles: s > 0 ? { Right: [0.05, 0, 1] } : { Left: [-0.05, 0, 1] }, rel: ON_HIPS, poles: HIPS_POLES, hipsY: 0, hipsX: 0.05 * s });
  const lift = (s: 1 | -1, a: number, dir: 1 | -1): Pose => {
    const leg = s > 0 ? 'Left' : 'Right';
    return { ...base(s), bones: { ...STAND, [`${leg}UpLeg`]: [-24, 0, 2 * s], [`${leg}Leg`]: [30, 0, 0], [`${leg}Foot`]: [16 * Math.cos(a), 0, 16 * Math.sin(a) * dir * s] } as Record<string, Deg3> };
  };
  const both2: Pose = { ...base(1), feet: both(0.10, ANKLE, 0.06), kneePoles: bothDir(0.05, 0, 1), hipsX: 0 };
  return run(scene, sk, 'ex_circle_ankle', 7.8, [
    at(both2, 0, true), ...circle((a) => lift(1, a, 1), 0.5, 0.12), at(both2, 3.8, true), ...circle((a) => lift(-1, a, 1), 4.3, 0.12),
  ]);
};

/** ex_circle_knee — the legs together, the hands at the waist: the bent knees draw circles together, one way then the other,
 *  the feet flat. */
const kneeCircles: Builder = (scene, sk) => {
  const feet = both(0.07, ANKLE, 0.06);
  const p = (a: number, dir: 1 | -1): Pose => ({
    bones: { Hips: [16, 0, 0], Spine: [2, 0, 0], Neck: [-10, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] }, feet,
    kneePoles: bothDir(0.06 * Math.cos(a) * dir, 0, 1), rel: ON_HIPS, poles: HIPS_POLES,
    hipsY: -0.10 - 0.02 * Math.sin(a), hipsX: 0.05 * Math.cos(a) * dir, hipsZ: -0.03 * Math.sin(a),
  });
  return run(scene, sk, 'ex_circle_knee', 8.0, [at(TALL, 0, true), ...circle((a) => p(a, 1), 0.8, 0.13), ...circle((a) => p(a, -1), 4.0, 0.13), at(TALL, 7.4, true)]);
};

/** ex_circle_hip (standing hip circles) — on the right leg, the hands on the hips: the left knee comes up to hip height and draws
 *  a big slow circle, opening the hip out to the side and back round; then the right knee. */
const hipCircles: Builder = (scene, sk) => {
  const base = (s: 1 | -1): Pose => ({ bones: { ...STAND }, feet: s > 0 ? { Right: [0.10, ANKLE, 0.06] } : { Left: [-0.10, ANKLE, 0.06] }, kneePoles: s > 0 ? { Right: [0.05, 0, 1] } : { Left: [-0.05, 0, 1] }, rel: ON_HIPS, poles: HIPS_POLES, hipsY: 0, hipsX: 0.05 * s });
  const knee = (s: 1 | -1, a: number): Pose => {
    const leg = s > 0 ? 'Left' : 'Right';
    return { ...base(s), bones: { ...STAND, [`${leg}UpLeg`]: [-70 + 20 * Math.cos(a), 0, (24 * Math.sin(a) + 10) * s], [`${leg}Leg`]: [86, 0, 0], [`${leg}Foot`]: [10, 0, 0] } as Record<string, Deg3> };
  };
  const both2: Pose = { ...base(1), feet: both(0.10, ANKLE, 0.06), kneePoles: bothDir(0.05, 0, 1), hipsX: 0 };
  return run(scene, sk, 'ex_circle_hip', 9.0, [
    at(both2, 0, true), ...circle((a) => knee(1, a), 0.6, 0.15), at(both2, 4.4, true), ...circle((a) => knee(-1, a), 5.0, 0.15),
  ]);
};

/** ex_circle_wrist — the arms long out to the sides at shoulder height, palms down (carried a little forward of the T: the T is
 *  the bind pose), the body still: the hands draw circles at the wrists, forward, then back. */
const wristCircles: Builder = (scene, sk) => {
  const p = (a: number, dir: 1 | -1): Pose => ({
    bones: { ...STAND, LeftHand: [32 * Math.sin(a), 0, 32 * Math.cos(a) * dir], RightHand: [32 * Math.sin(a), 0, -32 * Math.cos(a) * dir] }, feet: STANCE,
    rel: { Left: [-0.36, -0.14, 0.42], Right: [0.36, -0.14, 0.42] }, poles: bothDir(0.4, -1, 0), hipsY: 0,
  });
  return run(scene, sk, 'ex_circle_wrist', 7.0, [at(TALL, 0, true), ...circle((a) => p(a, 1), 0.7, 0.11), ...circle((a) => p(a, -1), 3.6, 0.11), at(TALL, 6.6, true)]);
};

/** ex_leg_raise_front / _side — the straight-leg swing, standing on the right leg with the hands on the hips: the left leg swings
 *  forward and back behind (front), or out to the side and back down across the standing leg (side), the range growing;
 *  then the right leg. */
function legSwing(dir: 'front' | 'side'): Builder {
  const name = `ex_leg_raise_${dir}`;
  const p = (u: number, v: number): Pose => ({
    bones: { ...STAND, Hips: [dir === 'front' ? 6 * v : 0, 0, dir === 'side' ? -6 * u : 0], LeftUpLeg: dir === 'front' ? [-64 * u + 22 * v - 2, 0, 0] : [-2, 0, -36 * u + 10 * v], LeftLeg: [4, 0, 0], LeftFoot: [dir === 'front' ? -10 * u : 0, 0, 0] },
    feet: { Right: [0.10, ANKLE, 0.06] }, kneePoles: { Right: [0.05, 0, 1] }, rel: ON_HIPS, poles: HIPS_POLES, hipsY: -0.005, hipsX: 0.06,
  });
  const swing = (t0: number, g: number): ExKey[] => [at(p(g, 0), t0 + 0.55, true), at(p(0, 0), t0 + 1.05), at(p(0, g), t0 + 1.5, true), at(p(0, 0), t0 + 1.95)];
  const R = (k: ExKey): ExKey => ({ ...mirror(k), t: k.t, ...(k.hold ? { hold: true } : {}) });
  const start: Pose = { ...TALL, rel: ON_HIPS, hands: undefined, poles: HIPS_POLES, feet: both(0.10, ANKLE, 0.06) };
  const one = (t0: number) => [at(p(0, 0), t0 + 0.2), ...swing(t0, 0.7), ...swing(t0 + 1.4, 0.85), ...swing(t0 + 2.8, 1)];
  return (scene, sk) => run(scene, sk, name, 10.8, [at(start, 0, true), ...one(0), at(start, 5.2, true), ...one(5.4).map(R)]);
}

/** ex_leg_raise_back (rear leg raises) — on the hands and knees: one leg extends up and back behind, the knee and the hip
 *  straightening, and returns under the hip; three, then the other leg. */
const rearLegRaise: Builder = (scene, sk) => {
  const base: Record<string, Deg3> = { Hips: [90, 0, 0], Spine: [0, 0, 0], Neck: [-50, 0, 0], LeftUpLeg: [-90, 0, 0], RightUpLeg: [-90, 0, 0], LeftLeg: [90, 0, 0], RightLeg: [90, 0, 0], LeftFoot: [34, 0, 0], RightFoot: [34, 0, 0] };
  const hands = both(0.18, 0.05, 0.52);
  const p = (leg: 'Left' | 'Right' | null): Pose => ({ bones: leg ? { ...base, [`${leg}UpLeg`]: [10, 0, 0], [`${leg}Leg`]: [4, 0, 0], [`${leg}Foot`]: [20, 0, 0] } : base, hands, poles: bothDir(0.6, 0.2, -0.5), hipsY: -0.40 });
  const reps = (leg: 'Left' | 'Right', t0: number): ExKey[] => [0, 1, 2].flatMap((i) => [at(p(leg), t0 + i * 1.6 + 0.7, true), at(p(leg), t0 + i * 1.6 + 0.95, true), at(p(null), t0 + i * 1.6 + 1.6, true)]);
  return run(scene, sk, 'ex_leg_raise_back', 9.6, [at(p(null), 0, true), ...reps('Left', 0), ...reps('Right', 4.8)]);
};

/** ex_toe_touch_stand (standing toe touches) — legs long: fold at the waist and let the trunk and the arms hang toward the toes,
 *  held, and roll back up to tall. */
const standToeTouch: Builder = (scene, sk) => {
  const feet = both(0.08, ANKLE, 0.06);
  const down: Pose = { bones: { Hips: [84, 0, 0], Spine: [16, 0, 0], Spine1: [10, 0, 0], Neck: [6, 0, 0], LeftLeg: [6, 0, 0], RightLeg: [6, 0, 0] }, feet, kneePoles: bothDir(0.05, 0, 1), hands: both(0.10, 0.10, 0.20), poles: bothDir(0.3, 0, -1), hipsY: -0.06, hipsZ: -0.10 };
  const up: Pose = { ...TALL, feet, hands: both(0.22, 0.86, 0.08) };
  return run(scene, sk, 'ex_toe_touch_stand', 6.4, [at(up, 0, true), at(down, 1.6, true), at({ ...down, bones: { ...down.bones, Spine1: [14, 0, 0] } }, 3.4, true), at(down, 4.4, true), at(up, 5.9, true)]);
};

// ── the kettlebell: the clean, the snatch, the push press, the jerk, the thruster, the high pull ────────────────────────

// (exerciseAthletic.ts swing(): the hike back between the legs, the hips snapping through.)
const KB_FEET = both(0.20, ANKLE, 0.10);
type Arms = 'one' | 'two';
const armsOf = (arms: Arms, R: [number, number, number], Lfree: [number, number, number] = [0.04, -0.46, 0.10]): Pair =>
  (arms === 'two' ? { Right: R, Left: [-R[0], R[1], R[2]] } : { Right: R, Left: Lfree });
const kb = (bones: Record<string, Deg3>, rel: Pair, poles: Pair, hipsY: number, knee = 0): Pose =>
  ({ bones: { ...bones, LeftLeg: [knee, 0, 0], RightLeg: [knee, 0, 0] }, feet: KB_FEET, kneePoles: bothDir(0.2, 0, 1), rel, poles, hipsY });
const HIKE: Record<string, Deg3> = { Hips: [56, 0, 0], Spine: [4, 0, 0], Neck: [-28, 0, 0] };
const UP: Record<string, Deg3> = { Hips: [-2, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0] };
const DIPPED: Record<string, Deg3> = { Hips: [6, 0, 0], Spine: [0, 0, 0], Neck: [-4, 0, 0], LeftFoot: [-8, 0, 0], RightFoot: [-8, 0, 0] };
const RACK_R: [number, number, number] = [-0.09, -0.08, 0.15];
const OVER_R: [number, number, number] = [-0.02, 0.60, 0.0];
const RACK_POLES = (arms: Arms): Pair => (arms === 'two' ? bothDir(0.2, -1, 0.2) : { Right: [0.2, -1, 0.2], Left: HANG_POLES.Left });
const OVER_POLES = (arms: Arms): Pair => (arms === 'two' ? bothDir(1, 0.1, -0.1) : { Right: [1, 0.1, -0.1], Left: HANG_POLES.Left });

/** ex_kb_clean_one / ex_kb_snatch_one / ex_kb_snatch_two — hike the bell back between the legs, snap the hips through and float
 *  it up close to the body to land soft in the rack at the shoulder (the clean) or punched straight up overhead (the snatch),
 *  a beat, and back down into the next hike. */
function ballistic(name: string, finish: 'rack' | 'overhead', arms: Arms): Builder {
  const end = finish === 'rack' ? RACK_R : OVER_R;
  const endPoles = finish === 'rack' ? RACK_POLES(arms) : OVER_POLES(arms);
  const hike = kb(HIKE, armsOf(arms, [-0.10, -0.52, -0.22]), bothDir(0.2, 0, -1), -0.14, 24);
  const drive = kb(UP, armsOf(arms, [-0.08, -0.36, 0.20]), bothDir(0.5, -0.6, 0), 0, 2);
  const pull = kb(UP, armsOf(arms, finish === 'rack' ? [-0.08, -0.16, 0.24] : [-0.06, 0.06, 0.24]), bothDir(1, 0.2, -0.2), 0.0, 2);
  const caught = kb({ ...UP, Spine: [finish === 'overhead' ? -2 : 0, 0, 0] }, armsOf(arms, end), endPoles, -0.03, 8);
  const top = kb(UP, armsOf(arms, end), endPoles, 0, 2);
  return (scene, sk) => run(scene, sk, name, 2.8, [
    at(hike, 0, true), at(drive, 0.38), at(pull, 0.56), at(caught, 0.76, true), at(top, 1.1, true), at(top, 1.5, true), at(pull, 1.85), at(drive, 2.05), at(hike, 2.4, true),
  ], true);
}

/** ex_kb_push_press_* / ex_kb_jerk_* — the bell(s) racked at the shoulders: a short dip of the knees, drive up through the
 *  legs and press it to lockout overhead (the push press); the jerk drops back under the locked arm in a second dip and stands
 *  up. Lowered to the rack, a beat. */
function overhead(name: string, kind: 'push' | 'jerk', arms: Arms): Builder {
  const rack = kb(UP, armsOf(arms, RACK_R), RACK_POLES(arms), 0, 2);
  const dip = kb(DIPPED, armsOf(arms, RACK_R), RACK_POLES(arms), -0.09, 24);
  const drive = kb({ ...UP, LeftFoot: [14, 0, 0], RightFoot: [14, 0, 0] }, armsOf(arms, [-0.06, 0.20, 0.08]), bothDir(0.8, -0.3, 0.2), 0.02, 0);
  const lock = kb(UP, armsOf(arms, OVER_R), OVER_POLES(arms), 0, 2);
  const under = kb({ ...DIPPED, Hips: [14, 0, 0] }, armsOf(arms, OVER_R), OVER_POLES(arms), -0.20, 44);
  const keys = kind === 'push'
    ? [at(rack, 0, true), at(dip, 0.45, true), at(drive, 0.65), at(lock, 0.95, true), at(lock, 1.45, true), at(rack, 2.25, true)]
    : [at(rack, 0, true), at(dip, 0.45, true), at(drive, 0.62), at(under, 0.85, true), at(under, 1.1, true), at(lock, 1.6, true), at(lock, 2.0, true), at(rack, 2.8, true)];
  return (scene, sk) => run(scene, sk, name, kind === 'push' ? 2.8 : 3.3, keys, true);
}

/** DEMO-LOOPS-9: the clean and the jerk joined, one bell — hike, clean to the rack, a beat; dip, drive, drop under the
 *  locked arm and stand; lower to the rack and back down into the hike. */
const cleanJerkOne: Builder = (scene, sk) => {
  const hike = kb(HIKE, armsOf('one', [-0.10, -0.52, -0.22]), bothDir(0.2, 0, -1), -0.14, 24);
  const drive = kb(UP, armsOf('one', [-0.08, -0.36, 0.20]), bothDir(0.5, -0.6, 0), 0, 2);
  const pull = kb(UP, armsOf('one', [-0.08, -0.16, 0.24]), bothDir(1, 0.2, -0.2), 0.0, 2);
  const rack = kb(UP, armsOf('one', RACK_R), RACK_POLES('one'), 0, 2);
  const caught = kb(UP, armsOf('one', RACK_R), RACK_POLES('one'), -0.03, 8);
  const dip = kb(DIPPED, armsOf('one', RACK_R), RACK_POLES('one'), -0.09, 24);
  const push = kb({ ...UP, LeftFoot: [14, 0, 0], RightFoot: [14, 0, 0] }, armsOf('one', [-0.06, 0.20, 0.08]), { Right: [0.8, -0.3, 0.2], Left: HANG_POLES.Left }, 0.02, 0);
  const under = kb({ ...DIPPED, Hips: [14, 0, 0] }, armsOf('one', OVER_R), OVER_POLES('one'), -0.20, 44);
  const lock = kb(UP, armsOf('one', OVER_R), OVER_POLES('one'), 0, 2);
  return run(scene, sk, 'ex_kb_clean_jerk_one', 5.6, [
    at(hike, 0, true), at(drive, 0.38), at(pull, 0.56), at(caught, 0.76, true), at(rack, 1.2, true), at(dip, 1.6, true), at(push, 1.77), at(under, 2.0, true), at(under, 2.25, true),
    at(lock, 2.75, true), at(lock, 3.1, true), at(rack, 3.8, true), at(rack, 4.1, true), at(pull, 4.45), at(drive, 4.75), at(hike, 5.15, true),
  ], true);
};
/** The split receive: the left foot forward, the right back on its ball, the hips low between them. */
const SPLIT_FEET: Pair = { Left: [-0.13, ANKLE, 0.34], Right: [0.13, ANKLE + 0.06, -0.40] };
const splitUnder = (rel: Pair, poles: Pair): Pose => ({ bones: { Hips: [4, 0, 0], Spine: [0, 0, 0], Neck: [-2, 0, 0], RightFoot: [26, 0, 0], LeftFoot: [-6, 0, 0] }, feet: SPLIT_FEET, kneePoles: { Left: [-0.1, 0, 1], Right: [0.1, -0.6, 0.6] }, rel, poles, hipsY: -0.30 });
/** ex_kb_split_jerk_one — the bell racked: dip, drive, and drop under the locked arm into a split, the front foot flat and
 *  the back on its ball; step the front foot back and the back foot up to stand; lower to the rack. */
const splitJerkOne: Builder = (scene, sk) => {
  const rack = kb(UP, armsOf('one', RACK_R), RACK_POLES('one'), 0, 2);
  const dip = kb(DIPPED, armsOf('one', RACK_R), RACK_POLES('one'), -0.09, 24);
  const push = kb({ ...UP, LeftFoot: [14, 0, 0], RightFoot: [14, 0, 0] }, armsOf('one', [-0.06, 0.20, 0.08]), { Right: [0.8, -0.3, 0.2], Left: HANG_POLES.Left }, 0.02, 0);
  const split = splitUnder(armsOf('one', OVER_R), OVER_POLES('one'));
  const half: Pose = { ...split, feet: { Left: [-0.15, ANKLE, 0.14], Right: SPLIT_FEET.Right }, hipsY: -0.16 };
  const lock = kb(UP, armsOf('one', OVER_R), OVER_POLES('one'), 0, 2);
  return run(scene, sk, 'ex_kb_split_jerk_one', 4.2, [at(rack, 0, true), at(dip, 0.45, true), at(push, 0.62), at(split, 0.88, true), at(split, 1.3, true), at(half, 1.75, true), at(lock, 2.2, true), at(lock, 2.6, true), at(rack, 3.4, true)], true);
};
/** ex_kb_split_snatch_one — hike the bell back, drive the hips through and pull it up overhead, dropping into a split to catch
 *  it on a locked arm; stand up out of the split, and bring it back down into the hike. */
const splitSnatchOne: Builder = (scene, sk) => {
  const hike = kb(HIKE, armsOf('one', [-0.10, -0.52, -0.22]), bothDir(0.2, 0, -1), -0.14, 24);
  const drive = kb(UP, armsOf('one', [-0.08, -0.36, 0.20]), bothDir(0.5, -0.6, 0), 0, 2);
  const pull = kb(UP, armsOf('one', [-0.06, 0.06, 0.24]), bothDir(1, 0.2, -0.2), 0.02, 2);
  const split = splitUnder(armsOf('one', OVER_R), OVER_POLES('one'));
  const half: Pose = { ...split, feet: { Left: [-0.15, ANKLE, 0.14], Right: SPLIT_FEET.Right }, hipsY: -0.16 };
  const top = kb(UP, armsOf('one', OVER_R), OVER_POLES('one'), 0, 2);
  return run(scene, sk, 'ex_kb_split_snatch_one', 4.4, [
    at(hike, 0, true), at(drive, 0.38), at(pull, 0.6), at(split, 0.86, true), at(split, 1.3, true), at(half, 1.75, true), at(top, 2.2, true), at(top, 2.6, true), at(pull, 3.0), at(drive, 3.3), at(hike, 3.8, true),
  ], true);
};
/** ex_kb_dead_clean — the bell on the floor between the feet: hips back and down to take it, then up through the legs and
 *  hips, the bell travelling close up to the rack at the shoulder, the wrist turning in; a beat, and back down to the
 *  floor (no swing between reps). */
const deadClean: Builder = (scene, sk) => {
  const floor = kb({ Hips: [46, 0, 0], Spine: [6, 0, 0], Neck: [-26, 0, 0], LeftFoot: [-16, 0, 0], RightFoot: [-16, 0, 0] }, armsOf('one', [-0.12, -0.50, 0.06], [0.04, -0.42, 0.12]), bothDir(0.3, 0, -1), -0.30, 0);
  const drive = kb(UP, armsOf('one', [-0.08, -0.34, 0.16]), bothDir(0.5, -0.6, 0), 0, 2);
  const pull = kb(UP, armsOf('one', [-0.08, -0.16, 0.22]), bothDir(1, 0.2, -0.2), 0.0, 2);
  const caught = kb(UP, armsOf('one', RACK_R), RACK_POLES('one'), -0.03, 8);
  const rack = kb(UP, armsOf('one', RACK_R), RACK_POLES('one'), 0, 2);
  return run(scene, sk, 'ex_kb_dead_clean', 3.6, [at(floor, 0, true), at(floor, 0.3, true), at(drive, 0.75), at(pull, 0.95), at(caught, 1.15, true), at(rack, 1.5, true), at(rack, 1.9, true), at(pull, 2.3), at(drive, 2.6), at(floor, 3.1, true)], true);
};
/** ex_kb_clean_alt (the alternating hang clean) — one bell racked at the shoulder, the other hanging: the racked bell drops as
 *  the hips sit back and the hanging one drives up to the rack, in one fluid move; then back the other way. */
const cleanAlt: Builder = (scene, sk) => {
  const L = (r: [number, number, number]): [number, number, number] => [-r[0], r[1], r[2]];
  const hang: [number, number, number] = [-0.06, -0.48, 0.06];
  const pose = (rackSide: 'Left' | 'Right'): Pose => kb(UP, rackSide === 'Right' ? { Right: RACK_R, Left: L(hang) } : { Left: L(RACK_R), Right: hang }, rackSide === 'Right' ? { Right: [0.2, -1, 0.2], Left: HANG_POLES.Left } : { Left: [-0.2, -1, 0.2], Right: HANG_POLES.Right }, 0, 2);
  const swap = kb({ Hips: [30, 0, 0], Spine: [4, 0, 0], Neck: [-16, 0, 0] }, { Left: L([-0.08, -0.34, 0.10]), Right: [-0.08, -0.34, 0.10] }, bothDir(0.6, -0.4, -0.4), -0.08, 14);
  return run(scene, sk, 'ex_kb_clean_alt', 3.2, [at(pose('Right'), 0, true), at(pose('Right'), 0.4, true), at(swap, 0.8), at(pose('Left'), 1.2, true), at(pose('Left'), 2.0, true), at(swap, 2.4)], true);
};

/** ex_kb_thruster — the two bells racked: a full front squat, and out of the bottom drive up and press them overhead in one
 *  move; back to the rack. */
const thruster: Builder = (scene, sk) => {
  const rack = kb(UP, armsOf('two', RACK_R), RACK_POLES('two'), 0, 2);
  const low: Pose = { bones: { Hips: [34, 0, 0], Spine: [6, 0, 0], Neck: [-24, 0, 0], LeftFoot: [-30, 0, 0], RightFoot: [-30, 0, 0] }, feet: KB_FEET, kneePoles: bothDir(0.35, 0, 1), rel: armsOf('two', RACK_R), poles: RACK_POLES('two'), hipsY: -0.44 };
  const mid = { ...kb(UP, armsOf('two', [-0.06, 0.24, 0.06]), bothDir(0.8, -0.3, 0.2), -0.06, 20) };
  const lock = kb(UP, armsOf('two', OVER_R), OVER_POLES('two'), 0, 2);
  return run(scene, sk, 'ex_kb_thruster', 3.4, [at(rack, 0, true), at(low, 1.0, true), at(low, 1.2, true), at(mid, 1.6), at(lock, 1.85, true), at(lock, 2.2, true), at(rack, 2.9, true)], true);
};

/** ex_kb_high_pull — the feet wide, one bell in both hands between them: hinge and sit to it, then drive up and pull it to the
 *  chin, the elbows high and wide; lower it back between the feet. */
const highPull: Builder = (scene, sk) => {
  const feet = both(0.30, ANKLE, 0.10);
  const low: Pose = { bones: { Hips: [44, 0, 0], Spine: [6, 0, 0], Neck: [-26, 0, 0], LeftFoot: [-14, 0, 0], RightFoot: [-14, 0, 0] }, feet, kneePoles: bothDir(0.5, 0, 1), rel: { Left: [0.15, -0.54, 0.02], Right: [-0.15, -0.54, 0.02] }, poles: bothDir(0.6, 0, -0.6), hipsY: -0.24 };
  const top: Pose = { bones: { ...UP, LeftUpLeg: [0, 0, 6], RightUpLeg: [0, 0, -6] }, feet, kneePoles: bothDir(0.5, 0, 1), rel: { Left: [0.15, -0.02, 0.12], Right: [-0.15, -0.02, 0.12] }, poles: bothDir(1, 0.6, -0.2), hipsY: -0.03 };
  return run(scene, sk, 'ex_kb_high_pull', 2.6, [at(low, 0, true), at(top, 0.6, true), at(top, 0.9, true), at(low, 1.9, true)], true);
};

// ── hanging and bar-supported leg raises ──────────────────────────────────────────────────────────────────────────────

const BAR_Y = 2.20;   // exerciseProps.ts: the pull-up bar the stage draws
/** ex_hang_leg_raise — hanging from the bar, the legs long: lift them together until they are level with the hips, a beat, and
 *  lower slow without a swing. ex_hang_pike — from the knees bent at a right angle, the thighs level: pull the legs on up
 *  until the shins near the bar, the pelvis curling and the legs straightening, and lower slow. */
function hangRaise(name: string, pike: boolean): Builder {
  const p = (hips: number, spine: number, thigh: number, knee: number, hy: number, hz = 0): Pose => ({
    bones: { Hips: [hips, 0, 0], Spine: [spine, 0, 0], Spine1: [spine * 0.4, 0, 0], Neck: [-spine * 0.3, 0, 0], LeftUpLeg: [-thigh, 0, 2], RightUpLeg: [-thigh, 0, -2], LeftLeg: [knee, 0, 0], RightLeg: [knee, 0, 0], LeftFoot: [20, 0, 0], RightFoot: [20, 0, 0] },
    handsAt: both(0.26, BAR_Y - 0.02, 0.02), poles: bothDir(1, -0.4, 0), hipsY: hy, hipsZ: hz,
  });
  const low = pike ? p(0, 0, 88, 92, 0.26) : p(0, 0, 4, 6, 0.26);
  const top = pike ? p(-46, 34, 112, 26, 0.34, 0.06) : p(-6, 4, 86, 6, 0.27);
  return (scene, sk) => run(scene, sk, name, 3.0, [at(low, 0, true), at(top, 1.0, true), at(top, 1.4, true), at(low, 2.6, true)]);
}

/** ex_bar_leg_raise — held up on the parallel bars, the arms long: the legs lift together, kept straight, until they are about
 *  level with the floor, a beat, and lower slow without a swing. */
const barLegRaise: Builder = (scene, sk) => {
  const p = (u: number): Pose => ({
    bones: { Hips: [6 - 10 * u, 0, 0], Spine: [2 + 2 * u, 0, 0], LeftUpLeg: [-6 - 80 * u, 0, 2], RightUpLeg: [-6 - 80 * u, 0, -2], LeftLeg: [8 - 4 * u, 0, 0], RightLeg: [8 - 4 * u, 0, 0], LeftFoot: [20, 0, 0], RightFoot: [20, 0, 0] },
    handsAt: both(0.27, 1.14, 0.02), poles: bothDir(0.2, 0, -1), hipsY: 0.24,
  });
  return run(scene, sk, 'ex_bar_leg_raise', 2.8, [at(p(0), 0, true), at(p(1), 0.9, true), at(p(1), 1.3, true), at(p(0), 2.4, true)]);
};

// ── the trunk: the crunch with the arms overhead, the tuck crunch, the Russian twist ─────────────────────────────────────

/** ex_crunch_overhead — the crunch (exercise.ts ex_crunch's numbers) with the arms long overhead beside the ears, carried up
 *  with the trunk as it curls. */
const crunchOverhead: Builder = (scene, sk) => {
  const feet = both(0.14, ANKLE, 0.50);
  const down: Pose = { bones: { Hips: [-84, 0, 0], Spine: [0, 0, 0], Spine1: [0, 0, 0], Neck: [10, 0, 0] }, feet, kneePoles: bothDir(0.1, 1, 0.2), rel: { Left: [0.10, 0.06, -0.56], Right: [-0.10, 0.06, -0.56] }, poles: bothDir(1, 0.2, 0), hipsY: -0.82 };
  const up: Pose = { bones: { Hips: [-80, 0, 0], Spine: [18, 0, 0], Spine1: [14, 0, 0], Neck: [14, 0, 0] }, feet, kneePoles: bothDir(0.1, 1, 0.2), rel: { Left: [0.10, 0.36, -0.44], Right: [-0.10, 0.36, -0.44] }, poles: bothDir(1, 0.2, 0), hipsY: -0.82 };
  return run(scene, sk, 'ex_crunch_overhead', 2.1, [at(down, 0, true), at(up, 0.7, true), at(up, 1.0, true), at(down, 1.8, true)], true);
};

/** ex_crunch_tuck — on the back with the legs up, the thighs vertical and the knees a little bent, the arms crossed on the chest:
 *  the shoulders curl up off the floor toward the knees, and lower. */
const crunchTuck: Builder = (scene, sk) => {
  const p = (u: number): Pose => ({
    ...LIE_BACK, bones: { ...LIE_BACK.bones, Spine: [20 * u, 0, 0], Spine1: [14 * u, 0, 0], Neck: [10 + 6 * u, 0, 0], LeftUpLeg: [-88, 0, 2], RightUpLeg: [-88, 0, -2], LeftLeg: [24, 0, 0], RightLeg: [24, 0, 0] },
    rel: { Left: [0.30, -0.12, 0.10], Right: [-0.30, -0.10, 0.12] }, hands: undefined, poles: bothDir(0.8, -0.2, 0.4),
  });
  return run(scene, sk, 'ex_crunch_tuck', 2.1, [at(p(0), 0, true), at(p(1), 0.7, true), at(p(1), 1.0, true), at(p(0), 1.8, true)], true);
};

/** ex_russian_twist — sitting back at about 45° on the floor (a V with the thighs), the knees bent and the heels down, the arms
 *  long in front with the hands clasped: the trunk turns until the arms point out to one side, then the other, knees still. */
const russianTwist: Builder = (scene, sk) => {
  const p = (s: number): Pose => ({
    ...SUPINE, bones: { Hips: [-44, 0, 0], Spine: [8, 16 * s, 0], Spine1: [4, 12 * s, 0], Neck: [-6, -6 * s, 0] },
    rel: { Left: [0.15 + 0.30 * s, -0.12, 0.44 - 0.12 * Math.abs(s)], Right: [-0.15 + 0.30 * s, -0.12, 0.44 - 0.12 * Math.abs(s)] }, poles: bothDir(0.6, -0.8, 0),
  });
  return run(scene, sk, 'ex_russian_twist', 2.4, [at(p(0), 0), at(p(1), 0.6, true), at(p(1), 0.75, true), at(p(0), 1.2), at(p(-1), 1.8, true), at(p(-1), 1.95, true)], true);
};

export const FAMILY_BUILDERS: readonly [string, Builder][] = [
  ['ex_stretch_triceps', tricepsOverhead], ['ex_stretch_triceps_side', tricepsSide],
  ['ex_stretch_cross_arm', crossArm], ['ex_stretch_reach_up', reachUp], ['ex_stretch_side_reach', sideReach],
  ['ex_stretch_clasp_back', claspBack], ['ex_stretch_upper_back', upperBack], ['ex_stretch_neck_side', neckSide],
  ['ex_stretch_chin_chest', chinChest], ['ex_stretch_behind_head', behindHead],
  ['ex_circle_ankle', ankleCircles], ['ex_circle_knee', kneeCircles], ['ex_circle_hip', hipCircles], ['ex_circle_wrist', wristCircles],
  ['ex_leg_raise_front', legSwing('front')], ['ex_leg_raise_side', legSwing('side')], ['ex_leg_raise_back', rearLegRaise],
  ['ex_toe_touch_stand', standToeTouch],
  ['ex_kb_clean_one', ballistic('ex_kb_clean_one', 'rack', 'one')], ['ex_kb_snatch_one', ballistic('ex_kb_snatch_one', 'overhead', 'one')],
  ['ex_kb_snatch_two', ballistic('ex_kb_snatch_two', 'overhead', 'two')],
  ['ex_kb_push_press_one', overhead('ex_kb_push_press_one', 'push', 'one')], ['ex_kb_push_press_two', overhead('ex_kb_push_press_two', 'push', 'two')],
  ['ex_kb_jerk_one', overhead('ex_kb_jerk_one', 'jerk', 'one')], ['ex_kb_jerk_two', overhead('ex_kb_jerk_two', 'jerk', 'two')],
  ['ex_kb_thruster', thruster], ['ex_kb_high_pull', highPull],
  // DEMO-LOOPS-9: two bells cleaned; the clean and jerk; the split jerk and split snatch; the dead clean; the alternating hang clean
  ['ex_kb_clean_two', ballistic('ex_kb_clean_two', 'rack', 'two')], ['ex_kb_clean_jerk_one', cleanJerkOne], ['ex_kb_split_jerk_one', splitJerkOne],
  ['ex_kb_split_snatch_one', splitSnatchOne], ['ex_kb_dead_clean', deadClean], ['ex_kb_clean_alt', cleanAlt],
  ['ex_hang_leg_raise', hangRaise('ex_hang_leg_raise', false)], ['ex_hang_pike', hangRaise('ex_hang_pike', true)], ['ex_bar_leg_raise', barLegRaise],
  ['ex_crunch_overhead', crunchOverhead], ['ex_crunch_tuck', crunchTuck], ['ex_russian_twist', russianTwist],
];
