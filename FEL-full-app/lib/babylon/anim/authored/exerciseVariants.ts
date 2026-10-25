// Exercise loops for the variations the library files most often and the first passes had no loop for
// (LIBRARY-ANATOMY-2, 2026-10-25): calf raises on one leg, with the knees bent and off a step; the high cable curl; the
// Z press; the wall sit and the Spanish squat (each held at the depth its entry names: lib/library/demo.ts holds a frame
// of the loop); the seated cable row.
//
// Owner decision (2026-10-25): raise coverage only with correct, authored loops — never a near-miss. Each loop here is
// the movement its entries name; a prop it leans on or sits on is drawn (demo.ts PROP_SHAPES, by exerciseProps.data.ts).
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { ANKLE, TOE_ANKLE, STAND, HANG, HANG_POLES, RACK, OVERHEAD, ELBOWS_BACK, both, bothDir, loop, mix, rep, type Deg3, type ExKey, type Pair, type V3 } from './exerciseKit';
import { alternating, oneArm } from './exerciseMore';
import { run, at } from './exerciseBody';

type Pose = Omit<ExKey, 't'>;
type Builder = (scene: Scene, sk: Skeleton) => AnimationGroup | null;
type Side = 'Left' | 'Right';
const sx = (s: Side, x: number) => (s === 'Left' ? -x : x);
/** Arms long at the sides, from the shoulders (they ride the body up a step or down a wall). */
const HANG_REL: Pair = both(0.06, -0.52, 0.04);
const CHEST: Pair = { Left: [0.13, -0.24, 0.26], Right: [-0.13, -0.24, 0.26] };
const ARMS_FWD: Pair = { Left: [0.06, -0.04, 0.52], Right: [-0.06, -0.04, 0.52] };

// ── calf raises ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** The step a calf raise drops its heels off (demo.ts PROP_SHAPES calfstep: its back edge just behind the balls of the feet). */
export const CALF_STEP = 0.20;
/**
 * ex_calf_raise_* — up onto the balls of the feet and down. `bent`: the knees held bent through the rep (the soleus raise).
 * `single`: on the left foot, the right knee bent and the foot held up behind. `step`: the balls of the feet on a step's
 * edge, the heels dropping below it at the bottom (measured on the rig: the ball sits 14 cm in front of the ankle, so the
 * ankle drops 5 cm when the heel goes 20° down round it).
 */
function calfRaise(scene: Scene, sk: Skeleton, name: string, o: { bent?: boolean; single?: boolean; step?: boolean }): AnimationGroup | null {
  const h = o.step ? CALF_STEP : 0;
  const bend = o.bent ? -0.07 : 0;
  const lowY = o.step ? h + ANKLE - 0.05 : ANKLE;
  // bent knees tip the shins forward, and the feet with them: the ankles flex back by as much (measured: 4 cm of toe)
  const lowFoot = (o.step ? -20 : 0) + (o.bent ? -16 : 0), upFoot = 34 + (o.bent ? -16 : 0);
  const hipsLow = (o.step ? h - 0.05 : 0) + bend, hipsUp = h + 0.09 + bend;
  const trunk: Record<string, Deg3> = o.bent ? { ...STAND, Hips: [12, 0, 0], Spine: [2, 0, 0] } : { ...STAND };
  const free: Record<string, Deg3> = o.single ? { RightUpLeg: [6, 0, 0], RightLeg: [78, 0, 0], RightFoot: [24, 0, 0] } : {};
  const feet = (y: number): Pair => (o.single ? { Left: [-0.11, y, 0.08] } : both(0.13, y, 0.08));
  const poses = (y: number, foot: number, hipsY: number): Pose => ({
    bones: { ...trunk, ...free, LeftFoot: [foot, 0, 0], ...(o.single ? {} : { RightFoot: [foot, 0, 0] as Deg3 }) },
    feet: feet(y), kneePoles: bothDir(0.1, 0, 1), rel: HANG_REL, poles: HANG_POLES, hipsY, ...(o.single ? { hipsX: -0.05 } : {}),
  });
  const down = poses(lowY, lowFoot, hipsLow);
  const up = poses(h + ANKLE + 0.09, upFoot, hipsUp);
  return run(scene, sk, name, 2.2, [at(down, 0, true), at(up, 0.7, true), at(up, 1.1, true), at(down, 1.8, true)]);
}

// ── the high cable curl ───────────────────────────────────────────────────────────────────────────────────────────────
/** ex_high_curl — standing between two high pulleys, the arms out to the sides at shoulder height: the elbows stay up
 *  and the hands curl in toward the ears, and back out (high cable curl, overhead cable curl). */
const HIGH_CURL = {
  a: { bones: STAND, feet: both(0.15, ANKLE, 0.08), rel: { Left: [-0.50, 0.0, 0.06] as V3, Right: [0.50, 0.0, 0.06] as V3 }, poles: bothDir(0.3, -1, -0.2), hipsY: 0 },
  b: { bones: STAND, feet: both(0.15, ANKLE, 0.08), rel: { Left: [-0.12, 0.19, 0.02] as V3, Right: [0.12, 0.19, 0.02] as V3 }, poles: bothDir(1, -0.4, -0.1), hipsY: 0 },
  t: [0.8, 0.2, 1.0, 0.3] as [number, number, number, number],
};

// ── the Z press ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** Sitting tall on the floor, the legs long in front (the Z press: no back rest, no help from the legs). */
const LONG_SIT: Pose = {
  bones: { Hips: [-4, 0, 0], Spine: [3, 0, 0], Neck: [2, 0, 0], LeftUpLeg: [-86, 0, 5], RightUpLeg: [-86, 0, -5], LeftLeg: [2, 0, 0], RightLeg: [2, 0, 0], LeftFoot: [-12, 0, 0], RightFoot: [-12, 0, 0] },
  hipsY: -0.80,
};
const Z_PRESS = {
  a: { ...LONG_SIT, rel: RACK, poles: bothDir(0.4, -1, 0.3) },
  b: { ...LONG_SIT, bones: { ...LONG_SIT.bones, Neck: [6, 0, 0] as Deg3 }, rel: OVERHEAD, poles: bothDir(1, 0.1, -0.1) },
  t: [0.8, 0.25, 1.0, 0.35] as [number, number, number, number],
};

// ── against the wall, and the Spanish squat ──────────────────────────────────────────────────────────────────────────
/** The wall sit's depths (hipsY): the thighs level with the floor at the bottom, the shins upright, the back on the wall
 *  (demo.ts PROP_SHAPES wallback: its face a hand behind the hip joints). */
export const WALL_SIT = { top: -0.17, bottom: -0.41 };
const WALL_FEET: Pair = both(0.15, ANKLE, 0.46);
const wallSit = (hipsY: number): Pose => ({ bones: { ...STAND, Spine: [0, 0, 0], Neck: [0, 0, 0] }, feet: WALL_FEET, kneePoles: bothDir(0.15, 0, 1), rel: CHEST, poles: bothDir(0.25, -1, -0.1), hipsY });
/** ex_wall_sit — the back on the wall: slide down to thighs level, hold, slide up to a shallow sit. demo.ts holds a frame
 *  of it for each depth an entry names (shallow, quarter, half, thighs level). */
function wallSitLoop(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const top = wallSit(WALL_SIT.top), bottom = wallSit(WALL_SIT.bottom);
  return run(scene, sk, 'ex_wall_sit', 4.0, [at(top, 0, true), at(top, 0.3, true), at(bottom, 1.8, true), at(bottom, 2.6, true)]);
}
/** ex_wall_sit_sl — in the deep wall sit, the right leg straightens out level in front and is held, lowered; then the left. */
function wallSitSl(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const base = wallSit(WALL_SIT.bottom);
  const lift = (s: Side): Pose => ({ ...base, feet: { ...WALL_FEET, [s]: [sx(s, 0.13), 0.44, 0.86] as V3 }, kneePoles: { ...base.kneePoles, [s]: [sx(s, 0.1), 1, 0.2] as V3 }, bones: { ...base.bones, [`${s}Foot`]: [-10, 0, 0] as Deg3 } });
  // solved half-way up and down as well (mix), not through run's lifted mid-key: the foot rises straight to level, no higher
  const R = lift('Right'), L = lift('Left');
  return loop(scene, sk, 'ex_wall_sit_sl', 4.8, [
    at(base, 0, true), { ...mix(base, R, 0.5), t: 0.3 }, at(R, 0.6, true), at(R, 1.6, true), { ...mix(R, base, 0.5), t: 1.9 },
    at(base, 2.2, true), { ...mix(base, L, 0.5), t: 2.5 }, at(L, 2.8, true), at(L, 3.8, true), { ...mix(L, base, 0.5), t: 4.1 }, at(base, 4.4, true),
  ]);
}
/** ex_spanish_squat — a band round the backs of the knees holds the shins upright: the hips sit back and down to thighs
 *  level, the trunk a little forward, the arms long in front; and up. The band is not drawn. */
export const SPANISH = { top: -0.10, bottom: -0.38 };
function spanishSquat(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const p = (hipsY: number, lean: number): Pose => ({ bones: { ...STAND, Hips: [lean, 0, 0], Spine: [4, 0, 0], Neck: [-lean * 0.6, 0, 0] }, feet: both(0.16, ANKLE, 0.30), kneePoles: bothDir(0.15, 0, 1), rel: ARMS_FWD, poles: bothDir(0.4, -0.6, -0.4), hipsY, hipsZ: -0.10 });
  const top = p(SPANISH.top, 8), bottom = p(SPANISH.bottom, 24);
  return run(scene, sk, 'ex_spanish_squat', 4.0, [at(top, 0, true), at(top, 0.3, true), at(bottom, 1.8, true), at(bottom, 2.6, true)]);
}

// ── the seated cable row ─────────────────────────────────────────────────────────────────────────────────────────────
/** On the row's low seat (demo.ts PROP_SHAPES rowseat), the feet on its foot plate, the knees soft: the arms long to the
 *  handle in front, then the handle drawn to the waist, the chest up and the elbows back past the trunk. */
export const ROW_SEAT_Y = -0.53;
const ROW_SIT: Pose = {
  bones: { Hips: [8, 0, 0], Spine: [0, 0, 0], Neck: [-6, 0, 0], LeftFoot: [-14, 0, 0], RightFoot: [-14, 0, 0] },
  feet: both(0.15, 0.22, 0.66), kneePoles: bothDir(0.15, 1, 0.3), hipsY: ROW_SEAT_Y,
};
const SEATED_ROW = {
  a: { ...ROW_SIT, rel: { Left: [0.08, -0.12, 0.52] as V3, Right: [-0.08, -0.12, 0.52] as V3 }, poles: bothDir(0.3, -1, 0), hipsY: ROW_SEAT_Y },
  b: { ...ROW_SIT, bones: { ...ROW_SIT.bones, Hips: [-4, 0, 0] as Deg3, Neck: [2, 0, 0] as Deg3 }, rel: { Left: [0.06, -0.36, 0.14] as V3, Right: [-0.06, -0.36, 0.14] as V3 }, poles: ELBOWS_BACK, hipsY: ROW_SEAT_Y },
  t: [0.8, 0.3, 1.0, 0.3] as [number, number, number, number],
};
/** The free hand of a one-arm seated row: on the thigh. */
const ROW_FREE: Pose = { rel: { Left: [0.02, -0.40, 0.30] }, poles: { Left: [-0.3, -1, 0] } };

// ── on the decline bench ─────────────────────────────────────────────────────────────────────────────────────────────
/** Lying back on the decline bench (demo.ts PROP_SHAPES decline: the pad 14° head-down, its top a hand above a flat
 *  bench's at the hips), the knees bent over its high end and the ankles hooked under the roller. */
const DECLINE_Y = -0.26;
const DECLINED: Pose = {
  bones: { Hips: [-104, 0, 0], Spine: [0, 0, 0], Neck: [10, 0, 0], LeftFoot: [10, 0, 0], RightFoot: [10, 0, 0] },
  feet: both(0.12, 0.26, 0.40), kneePoles: bothDir(0.1, 0.6, 1), hipsY: DECLINE_Y,
};
const decl = (rel: Pair, poles: Pair): Pose => ({ ...DECLINED, rel, poles });
/** The bench press, the fly and the skull crusher on the decline: the same reps as the flat bench's (exerciseKit UPPER),
 *  the hands set from the shoulders, the bar path straight up over the lower chest. */
const DECLINE_PRESS = {
  a: decl({ Left: [-0.05, 0.50, 0.06], Right: [0.05, 0.50, 0.06] }, bothDir(0.7, -0.5, 0)),
  b: decl({ Left: [-0.09, 0.14, 0.14], Right: [0.09, 0.14, 0.14] }, bothDir(0.7, -0.7, 0.1)),
  t: [1.0, 0.2, 0.9, 0.35] as [number, number, number, number],
};
const DECLINE_FLY = {
  a: decl({ Left: [0.04, 0.50, 0.06], Right: [-0.04, 0.50, 0.06] }, bothDir(0.6, -0.3, 0.2)),
  b: decl({ Left: [-0.46, 0.10, 0.06], Right: [0.46, 0.10, 0.06] }, bothDir(0.2, -1, 0.1)),
  t: [1.1, 0.2, 1.0, 0.35] as [number, number, number, number],
};
const DECLINE_SKULL = {
  a: decl({ Left: [0.05, 0.50, 0.0], Right: [-0.05, 0.50, 0.0] }, bothDir(0.2, 0.6, 0.6)),
  b: decl({ Left: [0.06, 0.24, -0.24], Right: [-0.06, 0.24, -0.24] }, bothDir(0.15, 1, 0.3)),
  t: [0.9, 0.2, 0.9, 0.35] as [number, number, number, number],
};
/** The free hand of a one-arm lift on the bench: on the belly. */
const BENCH_FREE: Pose = { rel: { Left: [0.12, 0.06, 0.30] }, poles: { Left: [-0.6, 0.2, 0] } };

// ── push-up variations ───────────────────────────────────────────────────────────────────────────────────────────────
const PUSH_TOP: Pose = { bones: { Hips: [70, 0, 0], Spine: [0, 0, 0], Neck: [-30, 0, 0], LeftFoot: [8, 0, 0], RightFoot: [8, 0, 0] }, feet: both(0.11, TOE_ANKLE, -0.90), kneePoles: bothDir(0, -1, 0.1), hands: both(0.24, 0.05, 0.44), poles: bothDir(0.6, 0.2, -0.7), hipsY: -0.58 };
const PUSH_LOW: Pose = { ...PUSH_TOP, bones: { ...PUSH_TOP.bones, Hips: [84, 0, 0], Neck: [-40, 0, 0] }, hands: both(0.26, 0.05, 0.44), poles: bothDir(0.7, 0.4, -0.5), hipsY: -0.80 };
/** A loop through poses, each move solved at two eased in-between keys (a planted hand or foot stays planted). */
function chain(scene: Scene, sk: Skeleton, name: string, dur: number, steps: [Pose, number, boolean?][]): AnimationGroup | null {
  const ease = (u: number) => u * u * (3 - 2 * u);
  const keys: ExKey[] = [];
  steps.forEach(([p, t, hold], i) => {
    keys.push(at(p, t, !!hold));
    const [q, t2] = steps[i + 1] ?? [steps[0][0], dur];
    if (q === p) return;
    for (const f of [1 / 3, 2 / 3]) keys.push({ ...mix(p, q, ease(f)), t: t + (t2 - t) * f });
  });
  return loop(scene, sk, name, dur, keys);
}
/** ex_spiderman_pushup — down into the push-up, the right knee drawn out to the side up to the right elbow at the bottom;
 *  press up, the foot back; then the left. */
function spidermanPushup(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const low = (s: Side): Pose => ({ ...PUSH_LOW, bones: { ...PUSH_LOW.bones, [`${s}Foot`]: [-6, 0, 0] }, feet: { ...PUSH_LOW.feet, [s]: [sx(s, 0.42), 0.20, -0.30] as V3 }, kneePoles: { ...PUSH_LOW.kneePoles, [s]: [sx(s, 1), 0.3, 0.5] as V3 } });
  return chain(scene, sk, 'ex_spiderman_pushup', 4.2, [[PUSH_TOP, 0, true], [low('Right'), 0.9, true], [low('Right'), 1.1, true], [PUSH_TOP, 1.9, true], [PUSH_TOP, 2.1, true], [low('Left'), 3.0, true], [low('Left'), 3.2, true]]);
}
/** ex_archer_pushup — the hands wide: the chest lowers toward the right hand, the right elbow bending, the left arm long
 *  out to the side; press back to the middle; then toward the left. */
function archerPushup(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const top: Pose = { ...PUSH_TOP, hands: both(0.48, 0.05, 0.44), poles: bothDir(0.6, 0.2, -0.5) };
  const low = (s: Side): Pose => {
    const o: Side = s === 'Left' ? 'Right' : 'Left';
    return { ...PUSH_LOW, hands: both(0.48, 0.05, 0.44), poles: { [s]: [sx(s, 0.4), 0.6, -0.6] as V3, [o]: [sx(o, 0.2), 1, 0] as V3 }, hipsX: sx(s, 0.18), hipsY: -0.76 };
  };
  return chain(scene, sk, 'ex_archer_pushup', 4.2, [[top, 0, true], [low('Right'), 0.9, true], [low('Right'), 1.1, true], [top, 1.9, true], [top, 2.1, true], [low('Left'), 3.0, true], [low('Left'), 3.2, true]]);
}

/** A two-pose rep (exerciseKit rep) over a pair. */
const pair = (name: string, p: { a: Pose; b: Pose; t: [number, number, number, number] }): [string, Builder] => [name, (scene, sk) => rep(scene, sk, name, p.a, p.b, ...p.t)];

export const VARIANT_BUILDERS: [string, Builder][] = [
  ['ex_calf_raise_sl', (scene, sk) => calfRaise(scene, sk, 'ex_calf_raise_sl', { single: true })],
  ['ex_calf_raise_bent', (scene, sk) => calfRaise(scene, sk, 'ex_calf_raise_bent', { bent: true })],
  ['ex_calf_raise_bent_sl', (scene, sk) => calfRaise(scene, sk, 'ex_calf_raise_bent_sl', { bent: true, single: true })],
  ['ex_calf_raise_step', (scene, sk) => calfRaise(scene, sk, 'ex_calf_raise_step', { step: true })],
  ['ex_calf_raise_step_sl', (scene, sk) => calfRaise(scene, sk, 'ex_calf_raise_step_sl', { step: true, single: true })],
  ['ex_calf_raise_bent_step', (scene, sk) => calfRaise(scene, sk, 'ex_calf_raise_bent_step', { step: true, bent: true })],
  ['ex_calf_raise_bent_step_sl', (scene, sk) => calfRaise(scene, sk, 'ex_calf_raise_bent_step_sl', { step: true, bent: true, single: true })],
  pair('ex_high_curl', HIGH_CURL),
  pair('ex_high_curl_one', oneArm(HIGH_CURL, { hands: { Left: HANG.Left }, poles: { Left: HANG_POLES.Left } })),
  pair('ex_z_press', Z_PRESS),
  pair('ex_z_press_one', oneArm(Z_PRESS, { rel: { Left: [0.04, -0.40, 0.30] }, poles: { Left: [-0.3, -1, 0] } })),
  ['ex_z_press_alt', (scene, sk) => alternating(scene, sk, 'ex_z_press_alt', Z_PRESS)],
  ['ex_wall_sit', wallSitLoop], ['ex_wall_sit_sl', wallSitSl], ['ex_spanish_squat', spanishSquat],
  pair('ex_seated_row', SEATED_ROW),
  pair('ex_seated_row_one', oneArm(SEATED_ROW, ROW_FREE)),
  pair('ex_decline_press', DECLINE_PRESS), pair('ex_decline_fly', DECLINE_FLY), pair('ex_decline_fly_one', oneArm(DECLINE_FLY, BENCH_FREE)),
  pair('ex_decline_skull', DECLINE_SKULL), pair('ex_decline_skull_one', oneArm(DECLINE_SKULL, BENCH_FREE)),
  ['ex_spiderman_pushup', spidermanPushup], ['ex_archer_pushup', archerPushup],
];
