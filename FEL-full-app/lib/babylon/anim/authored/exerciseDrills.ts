// The drills and checks the owner sees outside the library (DEMO-LOOPS, 2026-10-27): the Quick Screen's four checks and
// the daily drills that had no loop (lib/library/surfaceDemo.ts), each authored as the movement its own page describes —
// in place where the drill is done in place (lib/drills/drills.ts: "Run in place", "the T in two metres of floor").
//
// Owner decision (2026-10-25, held 2026-10-27): authored loops only, never a wrong movement. Same kit, same pipeline as
// the library's 480 (exerciseKit: targets in the final frame, `rel` from the posed shoulder, every loop closes).
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { ANKLE, STAND, HANG, HANG_POLES, SQUAT_FEET, KNEES_OUT, STANCE, both, bothDir, rep, type Deg3, type ExKey, type Pair } from './exerciseKit';
import { run, at, sx, other, stride } from './exerciseBody';

type Pose = Omit<ExKey, 't'>;
type Side = 'Left' | 'Right';
type Builder = (scene: Scene, sk: Skeleton) => AnimationGroup | null;
/** Hands on the hips (the check's "hands on hips"; the standing leg curl's). */
const ON_HIPS: Pair = { Left: [0.04, -0.42, 0.08], Right: [-0.04, -0.42, 0.08] };
const HIPS_POLES = bothDir(1, -0.2, 0);
const CHEST: Pair = { Left: [0.13, -0.24, 0.26], Right: [-0.13, -0.24, 0.26] };
const ARMS_FWD: Pair = { Left: [0.04, -0.06, 0.50], Right: [-0.04, -0.06, 0.50] };

// ── the Quick Screen's checks ──────────────────────────────────────────────────────────────────────────────────────
/** ex_overhead_squat (T1) — the arms held straight up overhead in a wide Y, a two-foot squat to depth with the trunk
 *  upright enough that the arms stay over the feet. */
function overheadSquat(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const arms: Pair = { Left: [-0.12, 0.52, -0.04], Right: [0.12, 0.52, -0.04] };
  const top: Pose = { bones: { ...STAND, Hips: [2, 0, 0] }, feet: SQUAT_FEET, kneePoles: KNEES_OUT, rel: arms, poles: bothDir(1, 0.1, -0.2), hipsY: 0 };
  const bottom: Pose = { bones: { Hips: [18, 0, 0], Spine: [2, 0, 0], Spine1: [0, 0, 0], Neck: [-10, 0, 0], LeftFoot: [-34, 0, 0], RightFoot: [-34, 0, 0] }, feet: SQUAT_FEET, kneePoles: KNEES_OUT, rel: arms, poles: bothDir(1, 0.1, -0.2), hipsY: -0.40 };
  return rep(scene, sk, 'ex_overhead_squat', top, bottom, 1.2, 0.3, 1.0, 0.4);
}

/** The wall the knee-to-wall check faces (demo.ts PROP_SHAPES wall: its face at z 0.69). Front toes a hand from it. */
const WALL_FACE = 0.69;
/** ex_knee_to_wall (T2; the knee-to-wall ankle rock) — a split stance facing the wall, the hands on it: the front knee
 *  drives forward over the toes to touch the wall, the front heel staying down, and back. */
function kneeToWall(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const hands: Pair = both(0.22, 1.20, WALL_FACE - 0.03);
  const p = (fwd: number): Pose => ({
    bones: { Hips: [6 + fwd * 20, 0, 0], Spine: [0, 0, 0], Neck: [-6, 0, 0], RightFoot: [-fwd * 34, 0, 0], LeftFoot: [22, 0, 0] },
    feet: { Right: [0.12, ANKLE, WALL_FACE - 0.24], Left: [-0.12, ANKLE + 0.09, -0.20] }, kneePoles: { Right: [0.05, 0, 1], Left: [-0.05, 0, 1] },
    handsAt: hands, poles: bothDir(0.6, -0.3, -0.6), hipsY: -0.06 - fwd * 0.10, hipsZ: 0.10 + fwd * 0.16,
  });
  return run(scene, sk, 'ex_knee_to_wall', 2.4, [at(p(0), 0, true), at(p(1), 0.9, true), at(p(1), 1.3, true)]);
}

/** ex_sl_squat_partial (T3) — on the right leg, the left foot just off the floor in front, the arms forward: a partial
 *  squat, the knee over the toes, about half way down, and up. */
function slSquatPartial(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const p = (d: number): Pose => ({
    bones: { Hips: [4 + d * 22, 0, 0], Spine: [2 + d * 6, 0, 0], Neck: [-d * 14, 0, 0], LeftFoot: [-6, 0, 0], RightFoot: [-d * 26, 0, 0] },
    // the free foot held a hand off the floor, a little forward, reaching further forward as the hips sit
    feet: { Right: [0.08, ANKLE, 0.08], Left: [-0.10, ANKLE + 0.12, 0.22 + d * 0.14] }, kneePoles: { Right: [0.1, 0, 1], Left: [-0.05, 0.3, 1] },
    rel: ARMS_FWD, poles: bothDir(0.4, -0.6, -0.4), hipsY: -d * 0.24, hipsX: 0.05,
  });
  return run(scene, sk, 'ex_sl_squat_partial', 2.6, [at(p(0), 0, true), at(p(1), 1.0, true), at(p(1), 1.3, true)]);
}

/** ex_jump_hands_hips (T5) — the countermovement jump with the hands kept on the hips (no arm swing): dip, leave the
 *  floor, land soft. */
function jumpHandsHips(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const legs = (thigh: number, knee: number): Record<string, Deg3> => ({ LeftUpLeg: [thigh, 0, 4], RightUpLeg: [thigh, 0, -4], LeftLeg: [knee, 0, 0], RightLeg: [knee, 0, 0] });
  const k = (t: number, e: Omit<Pose, 'rel' | 'poles'>, hold = false): ExKey => ({ t, ...e, rel: ON_HIPS, poles: HIPS_POLES, ...(hold ? { hold: true } : {}) });
  return chainKeys(scene, sk, 'ex_jump_hands_hips', 2.0, [
    k(0, { bones: { ...STAND }, feet: STANCE, hipsY: 0 }, true),
    k(0.45, { bones: { Hips: [22, 0, 0], Spine: [10, 0, 0], Neck: [-12, 0, 0], LeftFoot: [-20, 0, 0], RightFoot: [-20, 0, 0] }, feet: STANCE, kneePoles: bothDir(0.15, 0, 1), hipsY: -0.24 }, true),
    k(0.58, { bones: { Hips: [8, 0, 0], Spine: [2, 0, 0], LeftFoot: [10, 0, 0], RightFoot: [10, 0, 0] }, feet: both(0.13, ANKLE + 0.06, 0.08), kneePoles: bothDir(0.15, 0, 1), hipsY: 0.02 }),
    k(0.68, { bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], ...legs(-4, 4), LeftFoot: [34, 0, 0], RightFoot: [34, 0, 0] }, hipsY: 0.08 }),
    k(0.86, { bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], ...legs(-10, 14), LeftFoot: [26, 0, 0], RightFoot: [26, 0, 0] }, hipsY: 0.18 }, true),
    k(1.06, { bones: { Hips: [0, 0, 0], Spine: [2, 0, 0], ...legs(-14, 18), LeftFoot: [14, 0, 0], RightFoot: [14, 0, 0] }, hipsY: 0.05 }),
    k(1.26, { bones: { Hips: [20, 0, 0], Spine: [10, 0, 0], Neck: [-10, 0, 0], LeftFoot: [-16, 0, 0], RightFoot: [-16, 0, 0] }, feet: STANCE, kneePoles: bothDir(0.15, 0, 1), hipsY: -0.22 }, true),
    k(1.7, { bones: { ...STAND }, feet: STANCE, hipsY: 0 }),
  ]);
}
/** A loop through keys as given (the jump's keys are its own in-betweens: run's lifted mid-keys would add a hop). */
function chainKeys(scene: Scene, sk: Skeleton, name: string, dur: number, keys: ExKey[]): AnimationGroup | null {
  return run(scene, sk, name, dur, keys.map((e) => ({ ...e, feet: e.feet })));
}

// ── the drills ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** The countermovement's bottom (ex_jump's dip): hips back, knees forward, the trunk over the feet, the arms swung back. */
const DIP: Pose = { bones: { Hips: [24, 0, 0], Spine: [12, 0, 0], Neck: [-14, 0, 0], LeftFoot: [-20, 0, 0], RightFoot: [-20, 0, 0] }, feet: STANCE, kneePoles: bothDir(0.15, 0, 1), hands: both(0.26, 0.62, -0.30), poles: bothDir(0.3, 0.3, -0.9), hipsY: -0.28 };
const TALL: Pose = { bones: { ...STAND }, feet: STANCE, hands: HANG, poles: HANG_POLES, hipsY: 0 };
/** ex_cmj_dip (countermovement-geometry) — slow into the bottom of the dip, held, slow up; no jump. */
const cmjDip = (scene: Scene, sk: Skeleton) => rep(scene, sk, 'ex_cmj_dip', TALL, DIP, 1.4, 1.2, 1.4, 0.4);

/** ex_wall_drive (wall-drive; the wall march) — leaning into the wall from the ankles, one line from heels to head, the
 *  hands on the wall: a knee drives up fast and high and the foot comes back down; then the other. `march`: slower,
 *  held at the top (the wall march). */
function wallDrive(scene: Scene, sk: Skeleton, name: string, march: boolean): AnimationGroup | null {
  const hands: Pair = both(0.22, 1.28, WALL_FACE - 0.03);
  const base: Pose = {
    bones: { Hips: [32, 0, 0], Spine: [0, 0, 0], Neck: [-14, 0, 0], LeftFoot: [22, 0, 0], RightFoot: [22, 0, 0] },
    feet: both(0.11, ANKLE + 0.09, -0.42), kneePoles: bothDir(0, 0, 1), handsAt: hands, poles: bothDir(0.6, -0.4, -0.5), hipsY: -0.10, hipsZ: 0.04,
  };
  const drive = (s: Side): Pose => {
    const o = other(s);
    return { ...base, bones: { ...base.bones, [`${s}UpLeg`]: [-96, 0, 0], [`${s}Leg`]: [104, 0, 0], [`${s}Foot`]: [-10, 0, 0] } as Record<string, Deg3>, feet: { [o]: base.feet![o] } as Pair, kneePoles: { [o]: [sx(o, 0), 0, 1] } as Pair };
  };
  const D = march ? 2.4 : 1.2, up = march ? 0.45 : 0.18;
  return run(scene, sk, name, D, [at(base, 0, true), at(drive('Right'), D * 0.2, march), ...(march ? [at(drive('Right'), D * 0.2 + up)] : []), at(base, D * 0.5, true), at(drive('Left'), D * 0.7, march), ...(march ? [at(drive('Left'), D * 0.7 + up)] : [])]);
}

/** ex_decel_three (three-step-decel) — quick steps in place, then the outside foot planted hard to one side: the knee
 *  bends, the hips drop back and stay inside the foot, held a beat; quick steps, and the plant the other way. */
function decelThree(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const fast = (s: Side): Pose => stride(s, { [`${s}UpLeg`]: [-38, 0, 0], [`${s}Leg`]: [56, 0, 0], [`${s}Foot`]: [10, 0, 0] }, 0.01);
  const plant = (s: Side): Pose => {
    const o = other(s);
    return {
      bones: { Hips: [30, sx(s, -8), 0], Spine: [8, 0, 0], Neck: [-16, 0, 0], [`${s}Foot`]: [-24, 0, 0], [`${o}Foot`]: [-14, 0, 0] } as Record<string, Deg3>,
      feet: { [s]: [sx(s, 0.48), ANKLE, 0.10], [o]: [sx(o, 0.06), ANKLE + 0.03, 0.02] } as Pair, kneePoles: { [s]: [sx(s, 0.4), 0, 1], [o]: [sx(o, 0.1), 0, 1] } as Pair,
      rel: CHEST, poles: bothDir(0.3, -1, -0.2), hipsY: -0.30, hipsX: sx(s, 0.16),
    };
  };
  const steps = (t0: number): ExKey[] => [0, 1, 2, 3].map((i) => at(fast(i % 2 ? 'Right' : 'Left'), t0 + i * 0.16));
  return run(scene, sk, 'ex_decel_three', 3.2, [...steps(0), at(plant('Right'), 0.7, true), at(plant('Right'), 1.45, true), ...steps(1.6), at(plant('Left'), 2.3, true), at(plant('Left'), 3.05, true)]);
}

export const DRILL_BUILDERS: [string, Builder][] = [
  ['ex_overhead_squat', overheadSquat], ['ex_knee_to_wall', kneeToWall], ['ex_sl_squat_partial', slSquatPartial], ['ex_jump_hands_hips', jumpHandsHips],
  ['ex_cmj_dip', cmjDip], ['ex_wall_drive', (scene, sk) => wallDrive(scene, sk, 'ex_wall_drive', false)], ['ex_wall_march', (scene, sk) => wallDrive(scene, sk, 'ex_wall_march', true)],
  ['ex_decel_three', decelThree],
];
