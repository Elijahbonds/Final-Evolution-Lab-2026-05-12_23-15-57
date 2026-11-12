// What the programs ask for, and the "single leg" search (DEMO-LOOPS-4, 2026-11-03). Owner: "Make more animations" — the
// gaps measured first: the coach templates' and the signature programs' exercises with no loop (Band Pulldown, Band
// Pull-Through, Pike Push-Up, Step-In Mountain Climber, 90/90 Lean, Elbows Back; the coach loop's Half-Kneeling Cable Row
// and Suitcase Carry are in exerciseAthletic.ts), and the one-leg entries a "single leg" search shows as still tiles.
// Each loop is the entry's own setup and cues (data/library, lib/coach/templateCatalogue.ts). Same kit and pipeline as the
// library's loops; GATE 0 on every body is poseGuard.test.ts, the floor exercise.test.ts.
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { ANKLE, TOE_ANKLE, STAND, HANG_POLES, HIGH_PLANK, SEATED, SEAT_Y, both, bothDir, loop, rep, type Deg3, type ExKey, type Pair } from './exerciseKit';
import { kneel } from './exerciseMore';
import { POSITIONS } from './exerciseFloor';
import { run, at, inPlace, stride } from './exerciseBody';

type Pose = Omit<ExKey, 't'>;
type Builder = (scene: Scene, sk: Skeleton) => AnimationGroup | null;

/** ex_band_pulldown — kneeling tall under a band anchored high, a hand on each end: the ends come down to the shoulders,
 *  the elbows driving toward the back pockets, held a beat, and back up. */
const bandPulldown: Builder = (scene, sk) => {
  const top: Pose = { bones: { ...STAND, Spine: [0, 0, 0] }, rel: { Left: [-0.14, 0.52, 0.06], Right: [0.14, 0.52, 0.06] }, poles: bothDir(1, -0.2, 0), hipsY: 0 };
  const low: Pose = { bones: { ...STAND, Spine: [-4, 0, 0], Neck: [2, 0, 0] }, rel: { Left: [-0.08, 0.02, 0.10], Right: [0.08, 0.02, 0.10] }, poles: bothDir(0.8, -1, -0.4), hipsY: 0 };
  return rep(scene, sk, 'ex_band_pulldown', kneel(top, ['Left', 'Right']), kneel(low, ['Left', 'Right']), 0.8, 0.4, 1.0, 0.3);
};

/** ex_pull_through — facing away from a low anchor, the band (or the cable) between the legs in both hands: the hips push
 *  back toward the wall behind, the hands following the line back between the knees; then the hips drive forward to stand
 *  tall, a beat at the top. */
const pullThrough: Builder = (scene, sk) => {
  const feet = both(0.20, ANKLE, 0.12);
  const top: Pose = { bones: { ...STAND, Spine: [0, 0, 0] }, feet, kneePoles: bothDir(0.25, 0, 1), rel: { Left: [0.10, -0.50, 0.14], Right: [-0.10, -0.50, 0.14] }, poles: HANG_POLES, hipsY: 0 };
  const back: Pose = { bones: { Hips: [64, 0, 0], Spine: [4, 0, 0], Spine1: [0, 0, 0], Neck: [-26, 0, 0], LeftLeg: [22, 0, 0], RightLeg: [22, 0, 0] }, feet, kneePoles: bothDir(0.25, 0, 1), rel: { Left: [0.12, -0.56, -0.12], Right: [-0.12, -0.56, -0.12] }, poles: bothDir(0.2, 0.2, -1), hipsY: -0.14 };
  return rep(scene, sk, 'ex_pull_through', top, back, 1.1, 0.15, 0.8, 0.6);
};

/** The pike: hands on the floor, the hips high so the body is an upside-down V, the heels lifted (exerciseFloor.ts DOG, the
 *  feet walked in). */
const PIKE_FEET: Pair = both(0.13, TOE_ANKLE + 0.04, -0.34);
const PIKE_HANDS: Pair = both(0.22, 0.05, 0.50);
/** ex_pike_pushup — from the pike, the elbows bend and the top of the head lowers toward a spot just in front of the
 *  hands, the hips staying high; then press away. */
const pikePushup: Builder = (scene, sk) => {
  const top: Pose = { bones: { Hips: [128, 0, 0], Spine: [0, 0, 0], Neck: [-10, 0, 0], LeftFoot: [22, 0, 0], RightFoot: [22, 0, 0] }, feet: PIKE_FEET, kneePoles: bothDir(0, 0, 1), hands: PIKE_HANDS, poles: bothDir(0.6, 0, -0.8), hipsY: -0.22, hipsZ: -0.10 };
  const low: Pose = { ...top, bones: { ...top.bones, Hips: [138, 0, 0], Neck: [-20, 0, 0] }, poles: bothDir(1, 0.3, -0.4), hipsY: -0.36, hipsZ: -0.02 };
  return rep(scene, sk, 'ex_pike_pushup', top, low, 1.0, 0.15, 0.9, 0.45);
};

/** ex_stepin_climber — from the high plank, one foot steps in and sets down beside its hand, then back; then the other:
 *  a mountain climber at a walk, the hips level. */
const stepinClimber: Builder = (scene, sk) => {
  const P = HIGH_PLANK;
  const step = (s: 'Left' | 'Right'): Pose => {
    const o = s === 'Left' ? 'Right' : 'Left';
    return { ...P, bones: { ...P.bones, Hips: [66, 0, 0], [`${s}Foot`]: [26, 0, 0], [`${o}Foot`]: [12, 0, 0] }, feet: { [o]: P.feet![o], [s]: [s === 'Left' ? -0.30 : 0.30, TOE_ANKLE + 0.09, 0.18] } as Pair, kneePoles: { [o]: [0, -1, 0.1], [s]: [s === 'Left' ? -0.4 : 0.4, 0.2, 1] } as Pair, hipsY: -0.48 };
  };
  const L = step('Left'), R = step('Right');
  // half way in (and out), the swinging foot clears the floor
  const mid = (st: Pose, s: 'Left' | 'Right'): Pose => ({ ...st, bones: { ...st.bones, Hips: [66, 0, 0] }, feet: { ...st.feet, [s]: [s === 'Left' ? -0.22 : 0.22, TOE_ANKLE + 0.16, -0.36] } as Pair });
  return run(scene, sk, 'ex_stepin_climber', 3.2, [
    at(P, 0, true), at(mid(L, 'Left'), 0.3), at(L, 0.6, true), at(L, 0.9, true), at(mid(L, 'Left'), 1.2), at(P, 1.5, true),
    at(mid(R, 'Right'), 1.8), at(R, 2.1, true), at(R, 2.4, true), at(mid(R, 'Right'), 2.7), at(P, 3.0, true),
  ]);
};

/** ex_ninety_lean — the 90/90 sit, the left shin in front: sit tall, then lean the belt line toward the front shin and hold
 *  still at the first firm pull, breathing; and back up. */
const ninetyLean: Builder = (scene, sk) => {
  const base = POSITIONS.ninety[0];
  const lean: Pose = { ...base, bones: { ...base.bones, Hips: [24, 0, 0], Spine: [4, 0, 0], Neck: [-12, 0, 0] }, hands: { Left: [-0.18, 0.06, 0.44], Right: [0.20, 0.06, 0.40] }, poles: bothDir(0.6, 0, -0.8) };
  return loop(scene, sk, 'ex_ninety_lean', 6.0, [at(base, 0, true), at(lean, 1.4, true), at(lean, 4.2, true), at(base, 5.4, true)], { pivot: true });
};

/** ex_elbows_back — standing tall, the hands on the lower back, fingers down: the elbows draw back toward each other until
 *  the first firm pull across the front, held for a long breath out, and eased forward. */
const elbowsBack: Builder = (scene, sk) => {
  const feet = both(0.13, ANKLE, 0.08);
  const base: Pose = { bones: { ...STAND }, feet, rel: { Left: [0.10, -0.42, -0.14], Right: [-0.10, -0.42, -0.14] }, poles: bothDir(1, -0.3, 0.2), hipsY: 0 };
  const back: Pose = { bones: { ...STAND, Spine: [-3, 0, 0], Neck: [-4, 0, 0] }, feet, rel: { Left: [0.12, -0.42, -0.18], Right: [-0.12, -0.42, -0.18] }, poles: bothDir(0.6, -0.3, -0.9), hipsY: 0 };
  return loop(scene, sk, 'ex_elbows_back', 5.6, [at(base, 0, true), at(back, 1.2, true), at(back, 3.8, true), at(base, 4.8, true)]);
};

// ── the "single leg" search ──────────────────────────────────────────────────────────────────────────────────────────

/** ex_butt_kick_one (the single-leg butt kick, free-exercise-db's) — standing on the left leg, the right knee raised and held:
 *  a quick dip and a jump straight up off the left leg, its heel kicking to the seat in the air, the leg back under the hip
 *  to land soft on it. */
const buttKickOne: Builder = (scene, sk) => {
  const knee: Record<string, Deg3> = { RightUpLeg: [-70, 0, 0], RightLeg: [92, 0, 0], RightFoot: [12, 0, 0] };
  const arms = (u: number): Pick<Pose, 'rel' | 'poles'> => ({ rel: { Left: [0.04, -0.34 + 0.16 * u, 0.06 + 0.16 * u], Right: [-0.04, -0.34 + 0.16 * u, 0.06 + 0.16 * u] }, poles: bothDir(0.3, -1, -0.3) });
  const stand: Pose = { bones: { ...STAND, ...knee }, feet: { Left: [-0.08, ANKLE, 0.04] }, kneePoles: { Left: [0, 0, 1] }, ...arms(0), hipsY: -0.01, hipsX: -0.05 };
  const dip: Pose = { ...stand, bones: { ...STAND, Hips: [14, 0, 0], Spine: [6, 0, 0], ...knee, LeftFoot: [-12, 0, 0] }, ...arms(-0.4), hipsY: -0.10 };
  const take: Pose = { bones: { ...STAND, ...knee, LeftFoot: [30, 0, 0] }, feet: { Left: [-0.08, ANKLE + 0.06, 0.04] }, kneePoles: { Left: [0, 0, 1] }, ...arms(1), hipsY: 0.08, hipsX: -0.05 };
  const kick: Pose = { bones: { ...STAND, ...knee, LeftUpLeg: [8, 0, 0], LeftLeg: [130, 0, 0], LeftFoot: [40, 0, 0] }, ...arms(1), hipsY: 0.20, hipsX: -0.05 };
  const under: Pose = { bones: { ...STAND, ...knee, LeftFoot: [24, 0, 0] }, feet: { Left: [-0.08, ANKLE + 0.08, 0.04] }, kneePoles: { Left: [0, 0, 1] }, ...arms(0.4), hipsY: 0.06, hipsX: -0.05 };
  return run(scene, sk, 'ex_butt_kick_one', 1.7, [at(stand, 0, true), at(dip, 0.35, true), at(take, 0.5), at(kick, 0.68, true), at(under, 0.86), at(dip, 1.0, true), at(stand, 1.35, true)]);
};

/** ex_box_pushoff (Single Leg Push-off) / ex_stride_jump (Single-Leg Stride Jump) / ex_stride_jump_cross (Stride Jump
 *  Crossover) — one foot up on a box (in front; or beside, the inside foot on its near edge), the other on the floor: the arms
 *  swing up as the top leg drives the body straight up, the free knee driving; land back the same way — or, crossing over,
 *  on the box's far side with the other foot up, and back. */
function pushOff(name: string, kind: 'front' | 'side' | 'cross'): Builder {
  const on = 0.40 + ANKLE;   // exerciseProps.ts BOX_TOP: the box the stage draws
  const swing = (u: number): Pick<Pose, 'rel' | 'poles'> => ({ rel: { Left: [0.06, -0.42 + 0.92 * u, -0.20 + 0.34 * u], Right: [-0.06, -0.42 + 0.92 * u, -0.20 + 0.34 * u] }, poles: bothDir(0.6, -0.2 + 0.4 * u, -0.6) });
  // `s` +1: the right foot up (on the box's left part, the body to its left); −1: crossed over, the left foot up on its right part
  const base = (s: 1 | -1) => {
    if (kind === 'front') return { up: [0.10, on, 0.32] as [number, number, number], down: [-0.12, ANKLE, -0.02] as [number, number, number], hx: 0, hz: 0.06 };
    return s > 0 ? { up: [0.30, on, 0.04] as [number, number, number], down: [-0.10, ANKLE, 0.04] as [number, number, number], hx: 0.12, hz: 0 }
      : { up: [0.60, on, 0.04] as [number, number, number], down: [1.00, ANKLE, 0.04] as [number, number, number], hx: 0.78, hz: 0 };
  };
  const feetOf = (s: 1 | -1): Pair => { const b = base(s); return s > 0 ? { Right: b.up, Left: b.down } : { Left: b.up, Right: b.down }; };
  const setP = (s: 1 | -1, dip: number): Pose => ({ bones: { ...STAND, Hips: [8 + 14 * dip, 0, 0], Spine: [2 + 6 * dip, 0, 0], [s > 0 ? 'LeftFoot' : 'RightFoot']: [-10 - 8 * dip, 0, 0] }, feet: feetOf(s), kneePoles: bothDir(0.1, 0, 1), ...swing(dip > 0 ? -0.1 : 0), hipsY: -0.03 - 0.08 * dip, hipsX: base(s).hx, hipsZ: base(s).hz + 0.03 * dip });
  const air = (s: 1 | -1, hx: number): Pose => {
    const top = s > 0 ? 'Right' : 'Left', free = s > 0 ? 'Left' : 'Right', b = base(s);
    return { bones: { ...STAND, [`${free}UpLeg`]: [-72, 0, 0], [`${free}Leg`]: [92, 0, 0], [`${free}Foot`]: [10, 0, 0], [`${top}Foot`]: [30, 0, 0] } as Record<string, Deg3>, feet: { [top]: [b.up[0] + (hx - b.hx), b.up[1] + 0.20, b.up[2]] } as Pair, kneePoles: bothDir(0.1, 0, 1), ...swing(1), hipsY: 0.30, hipsX: hx, hipsZ: b.hz + 0.04 };
  };
  if (kind !== 'cross') return (scene, sk) => run(scene, sk, name, 2.4, [at(setP(1, 0), 0, true), at(setP(1, 1), 0.45, true), at(air(1, base(1).hx), 0.8, true), at(setP(1, 1), 1.15, true), at(setP(1, 0), 1.8, true)], true);
  return (scene, sk) => run(scene, sk, name, 4.4, [
    at(setP(1, 0), 0, true), at(setP(1, 1), 0.4, true), at(air(1, 0.45), 0.75), at(setP(-1, 1), 1.1, true), at(setP(-1, 0), 1.9, true),
    at(setP(-1, 1), 2.6, true), at(air(-1, 0.45), 2.95), at(setP(1, 1), 3.3, true), at(setP(1, 0), 4.0, true),
  ], true);
}

/** ex_seated_calf_one — seated, the knees at right angles: ONE heel (the right) rises and lowers, a dumbbell on that knee,
 *  the other foot flat. */
const seatedCalfOne: Builder = (scene, sk) => {
  const down: Pose = { ...SEATED, bones: { ...SEATED.bones }, hands: both(0.20, 0.56, 0.40), poles: bothDir(0.6, -0.4, -0.4), hipsY: SEAT_Y };
  const up: Pose = { ...down, bones: { ...down.bones, RightFoot: [32, 0, 0] }, feet: { Left: [-0.19, ANKLE, 0.48], Right: [0.19, ANKLE + 0.08, 0.48] }, hands: { Left: [-0.20, 0.56, 0.40], Right: [0.20, 0.62, 0.40] } };
  return run(scene, sk, 'ex_seated_calf_one', 1.8, [at(down, 0, true), at(up, 0.6, true), at(up, 0.9, true)], true);
};

export const ASK_BUILDERS: readonly [string, Builder][] = [
  ['ex_band_pulldown', bandPulldown], ['ex_pull_through', pullThrough], ['ex_pike_pushup', pikePushup], ['ex_stepin_climber', stepinClimber],
  ['ex_ninety_lean', ninetyLean], ['ex_elbows_back', elbowsBack],
  ['ex_butt_kick_one', buttKickOne], ['ex_seated_calf_one', seatedCalfOne],
  ['ex_box_pushoff', pushOff('ex_box_pushoff', 'front')], ['ex_stride_jump', pushOff('ex_stride_jump', 'side')], ['ex_stride_jump_cross', pushOff('ex_stride_jump_cross', 'cross')],
];
