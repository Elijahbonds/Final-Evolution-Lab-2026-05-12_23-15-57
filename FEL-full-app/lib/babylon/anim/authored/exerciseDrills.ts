// The drills and checks the owner sees outside the library (DEMO-LOOPS, 2026-10-27): the Quick Screen's four checks and
// the daily drills that had no loop (lib/library/surfaceDemo.ts), each authored as the movement its own page describes —
// in place where the drill is done in place (lib/drills/drills.ts: "Run in place", "the T in two metres of floor").
//
// Owner decision (2026-10-25, held 2026-10-27): authored loops only, never a wrong movement. Same kit, same pipeline as
// the library's 480 (exerciseKit: targets in the final frame, `rel` from the posed shoulder, every loop closes).
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { ANKLE, STAND, HANG, HANG_POLES, SQUAT_FEET, KNEES_OUT, STANCE, both, bothDir, rep, type Deg3, type ExKey, type Pair, type V3 } from './exerciseKit';
import { run, at, sx, other, stride } from './exerciseBody';

type Pose = Omit<ExKey, 't'>;
type Side = 'Left' | 'Right';
type Builder = (scene: Scene, sk: Skeleton) => AnimationGroup | null;
/** Hands on the hips (the check's "hands on hips"; the standing leg curl's). */
const ON_HIPS: Pair = { Left: [0.04, -0.42, 0.08], Right: [-0.04, -0.42, 0.08] };
const HIPS_POLES = bothDir(1, -0.2, 0);
const ELBOWS_OUT_BACK = bothDir(0.15, -0.4, -1);
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
  // toe-off: the heel comes up behind and the foot leaves the floor before the knee swings through (a foot swung straight
  // forward from the floor dragged its toes through it)
  const toeOff = (s: Side): Pose => {
    const o = other(s);
    return { ...base, bones: { ...base.bones, [`${s}UpLeg`]: [-20, 0, 0], [`${s}Leg`]: [80, 0, 0], [`${s}Foot`]: [30, 0, 0] } as Record<string, Deg3>, feet: { [o]: base.feet![o] } as Pair, kneePoles: { [o]: [sx(o, 0), 0, 1] } as Pair };
  };
  const D = march ? 2.4 : 1.2, up = march ? 0.45 : 0.18;
  return run(scene, sk, name, D, [
    at(base, 0, true), at(toeOff('Right'), D * 0.09), at(drive('Right'), D * 0.2, march), ...(march ? [at(drive('Right'), D * 0.2 + up)] : []), at(toeOff('Right'), D * 0.2 + (march ? up : 0) + D * 0.09),
    at(base, D * 0.5, true), at(toeOff('Left'), D * 0.59), at(drive('Left'), D * 0.7, march), ...(march ? [at(drive('Left'), D * 0.7 + up)] : []), at(toeOff('Left'), D * 0.7 + (march ? up : 0) + D * 0.09),
  ]);
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

// ── travelling a few steps (the T in two metres, the approach's two steps) ──────────────────────────────────────────
/** The athletic stance: knees and hips bent, the trunk forward, the hands up in front at the waist. */
const ATHLETIC = { bones: { Hips: [16, 0, 0] as Deg3, Spine: [6, 0, 0] as Deg3, Neck: [-12, 0, 0] as Deg3, LeftFoot: [-14, 0, 0] as Deg3, RightFoot: [-14, 0, 0] as Deg3 }, rel: { Left: [0.0, -0.30, 0.22] as V3, Right: [0.0, -0.30, 0.22] as V3 }, poles: bothDir(0.4, -1, 0), hipsY: -0.14 };
/** A stance key: the feet where given (final frame), the hips over their middle. */
function stanceAt(lx: number, lz: number, rx: number, rz: number, o: Partial<Pose> = {}): Pose {
  return { ...ATHLETIC, feet: { Left: [lx, ANKLE, lz], Right: [rx, ANKLE, rz] }, kneePoles: bothDir(0.15, 0, 1), hipsX: (lx + rx) / 2, hipsZ: (lz + rz) / 2 - 0.08, ...o, bones: { ...ATHLETIC.bones, ...(o.bones ?? {}) } };
}
/** Down to touch the floor (the T-drill's cone) beside the `s` foot with that hand, the other hand up in front. */
function touch(base: Pose, s: Side): Pose {
  const f = base.feet![s]!, o = other(s);
  return { ...base, bones: { ...base.bones, Hips: [44, 0, 0], Spine: [14, 0, 0], Neck: [-24, 0, 0], LeftFoot: [-26, 0, 0], RightFoot: [-26, 0, 0] }, hands: { [s]: [f[0] + sx(s, 0.12), 0.08, f[2] + 0.22] } as Pair, rel: { [o]: [0, -0.30, 0.22] } as Pair, hipsY: -0.42 };
}
/** ex_t_drill — the T in two metres: fast feet forward, touch the cone; shuffle left, touch; shuffle right across, touch;
 *  shuffle back to the middle; backpedal to the start. The feet never cross on a shuffle. */
function tDrill(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const W = 0.15, F = 0.70, L = 0.50;
  const seq: [Pose, number][] = [];
  let t = 0;
  const add = (p: Pose, dt: number) => { seq.push([p, t]); t += dt; };
  // forward: four quick steps
  for (let i = 0; i <= 4; i++) { const z = (F * i) / 4; const lead = i % 2 === 0; add(stanceAt(-W, z + (lead ? 0 : 0.0), W, z + (lead ? 0.10 : 0)), 0.22); }
  add(touch(stanceAt(-W, F, W, F + 0.10), 'Right'), 0.45);
  // shuffle left (the left foot leads, the right follows, never past it)
  for (let i = 1; i <= 2; i++) { const x = -(L * i) / 2; add(stanceAt(x - W - 0.12, F, x + W - 0.06, F), 0.16); add(stanceAt(x - W, F, x + W, F), 0.16); }
  add(touch(stanceAt(-L - W, F, -L + W, F), 'Left'), 0.45);
  // shuffle right across, two widths
  for (let i = 1; i <= 4; i++) { const x = -L + (2 * L * i) / 4; add(stanceAt(x - W + 0.06, F, x + W + 0.12, F), 0.16); add(stanceAt(x - W, F, x + W, F), 0.16); }
  add(touch(stanceAt(L - W, F, L + W, F), 'Right'), 0.45);
  // back to the middle
  for (let i = 1; i <= 2; i++) { const x = L - (L * i) / 2; add(stanceAt(x - W - 0.12, F, x + W - 0.06, F), 0.16); add(stanceAt(x - W, F, x + W, F), 0.16); }
  // backpedal to the start: short steps back, the trunk over the feet
  for (let i = 1; i <= 4; i++) { const z = F - (F * i) / 4; const lead = i % 2 === 1; add(stanceAt(-W, z + (lead ? -0.08 : 0), W, z + (lead ? 0 : -0.08), { bones: { Hips: [22, 0, 0] } }), 0.22); }
  return run(scene, sk, 'ex_t_drill', t + 0.3, seq.map(([p, tt], i) => at(p, tt, i === 0)));
}

/** ex_approach_one / ex_approach_two — run in place on the beat; then the push: a long, low penultimate step (the right
 *  foot), a quick plant, and up — off the left foot with the right knee driving (one), or both feet closing under a
 *  deeper gather and off two (two); the arms swing back on the penultimate and drive up; land soft on two feet, and
 *  walk back to the start. */
function approach(scene: Scene, sk: Skeleton, name: string, two: boolean, o: { runIn?: boolean; extra?: number; oz?: number } = { runIn: true }): AnimationGroup | null {
  const extra = o.extra ?? 0, oz = o.oz ?? 0;
  const Z = (p: Pose): Pose => {
    const f = (v?: V3): V3 | undefined => (v ? [v[0], v[1], v[2] + oz] : undefined);
    const pair = (q?: Pair): Pair | undefined => (q ? { ...(q.Left ? { Left: f(q.Left) } : {}), ...(q.Right ? { Right: f(q.Right) } : {}) } : undefined);
    return { ...p, feet: pair(p.feet), hands: pair(p.hands), hipsZ: (p.hipsZ ?? 0) + oz };
  };
  const runIn = (s: Side, t: number): ExKey => at(stride(s, { [`${s}UpLeg`]: [-56, 0, 0], [`${s}Leg`]: [80, 0, 0], [`${s}Foot`]: [10, 0, 0] }, 0.03), t);
  const armsBack: Pair = both(0.24, 0.66, -0.34), armsUp: Pair = both(0.22, 2.10, 0.30);
  const pen: Pose = { bones: { Hips: [18, 0, 0], Spine: [6, 0, 0], Neck: [-10, 0, 0], LeftFoot: [30, 0, 0], RightFoot: [-16, 0, 0] }, feet: { Left: [-0.12, ANKLE + 0.11, 0.02], Right: [0.12, ANKLE, 0.72] }, kneePoles: bothDir(0.1, 0, 1), hands: armsBack, poles: bothDir(0.3, 0.3, -0.9), hipsY: -0.26, hipsZ: 0.36 };
  const plant: Pose = two
    ? { bones: { Hips: [26, 0, 0], Spine: [10, 0, 0], Neck: [-12, 0, 0], LeftFoot: [-20, 0, 0], RightFoot: [-20, 0, 0] }, feet: { Left: [-0.13, ANKLE, 0.86], Right: [0.13, ANKLE, 0.80] }, kneePoles: bothDir(0.15, 0, 1), hands: both(0.26, 0.62, 0.40), poles: bothDir(0.3, 0.3, -0.9), hipsY: -0.32, hipsZ: 0.78 }
    : { bones: { Hips: [16, 0, 0], Spine: [6, 0, 0], Neck: [-10, 0, 0], LeftFoot: [-14, 0, 0], RightFoot: [10, 0, 0] }, feet: { Left: [-0.11, ANKLE, 0.98], Right: [0.12, ANKLE + 0.06, 0.70] }, kneePoles: bothDir(0.1, 0, 1), hands: both(0.26, 0.70, 0.62), poles: bothDir(0.3, 0.3, -0.9), hipsY: -0.18, hipsZ: 0.86 };
  const z0 = two ? 0.83 : 0.98;
  const air: Pose = two
    ? { bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], LeftUpLeg: [-6, 0, 4], RightUpLeg: [-6, 0, -4], LeftLeg: [8, 0, 0], RightLeg: [8, 0, 0], LeftFoot: [34, 0, 0], RightFoot: [34, 0, 0] }, hands: armsUp, poles: bothDir(0.9, 0.1, -0.3), hipsY: 0.24, hipsZ: z0 + 0.06 }
    : { bones: { Hips: [-2, 0, 0], Spine: [-2, 0, 0], LeftUpLeg: [4, 0, 4], LeftLeg: [10, 0, 0], LeftFoot: [36, 0, 0], RightUpLeg: [-84, 0, -4], RightLeg: [90, 0, 0], RightFoot: [10, 0, 0] }, hands: armsUp, poles: bothDir(0.9, 0.1, -0.3), hipsY: 0.26, hipsZ: z0 + 0.04 };
  const land: Pose = { bones: { Hips: [22, 0, 0], Spine: [10, 0, 0], Neck: [-10, 0, 0], LeftFoot: [-16, 0, 0], RightFoot: [-16, 0, 0] }, feet: both(0.13, ANKLE, z0 + 0.12), kneePoles: bothDir(0.15, 0, 1), hands: both(0.26, 0.80, z0 + 0.42), poles: HANG_POLES, hipsY: -0.24, hipsZ: z0 + 0.06 };
  const stand = (z: number, lz = z, rz = z): Pose => ({ bones: { ...STAND }, feet: { Left: [-0.12, ANKLE, lz], Right: [0.12, ANKLE, rz] }, kneePoles: bothDir(0.1, 0, 1), hands: { Left: [-0.24, 0.84, z + 0.06], Right: [0.24, 0.84, z + 0.06] }, poles: HANG_POLES, hipsY: 0, hipsZ: z - 0.06 });
  // the approach's own steps before the penultimate (a walk-in: the right, then the left landing where the penultimate starts)
  const z1 = 0.02 - extra * 0.45;
  const lead: ExKey[] = [];
  let t = 0;
  if (o.runIn) { lead.push(runIn('Left', 0), runIn('Right', 0.3), runIn('Left', 0.6), runIn('Right', 0.9)); t = 1.35; }
  else {
    lead.push(at(Z(stand(z1)), 0, true)); t = 0.5;
    const feet = { Left: z1, Right: z1 };
    for (let k = 0; k < extra; k++) {
      const s: Side = (extra - k) % 2 === 0 ? 'Right' : 'Left';
      const from = feet[s]; feet[s] = z1 + (k + 1) * 0.45 + (s === 'Right' ? 0.25 : 0);
      const mid = (feet.Left + feet.Right) / 2;
      // the rear foot rolls onto its ball as the body passes over the front one
      const rear: Side = feet.Left < feet.Right ? 'Left' : 'Right';
      const w = stand(mid, feet.Left, feet.Right);
      const rf = w.feet![rear]!;
      lead.push(at(Z({ ...w, feet: { ...w.feet, [rear]: [rf[0], ANKLE + 0.06, rf[2]] }, bones: { ...STAND, Hips: [10, 0, 0], Spine: [4, 0, 0], [`${rear}Foot`]: [20, 0, 0] } }), t));
      t += 0.32;
      void from;
    }
    t += 0.15;
    // the lean into the penultimate: the left heel already peeling up as the hips go forward over it
    const w = stand(0.02);
    lead.push(at(Z({ ...w, feet: { Left: [-0.12, ANKLE + 0.06, 0.02], Right: [0.12, ANKLE, feet.Right] }, bones: { ...STAND, Hips: [12, 0, 0], Spine: [4, 0, 0], LeftFoot: [18, 0, 0] }, hipsZ: 0.10 }), t - 0.2));
  }
  const zb = z0 + 0.12;
  // the touchdown: the balls of the feet meet the floor, the legs long, just before the landing sinks (a waypoint: without
  // it the hips' spline overshot the landing and the toes went through the floor)
  const touchdown: Pose = { bones: { Hips: [6, 0, 0], Spine: [2, 0, 0], LeftFoot: [14, 0, 0], RightFoot: [14, 0, 0] }, feet: both(0.13, ANKLE + 0.05, z0 + 0.12), kneePoles: bothDir(0.15, 0, 1), hands: both(0.24, 1.30, z0 + 0.36), poles: bothDir(0.6, -0.2, -0.5), hipsY: -0.02, hipsZ: z0 + 0.10 };
  // the push: the take-off feet still down on their balls as the legs drive long, the arms swinging up (the last contact)
  const push: Pose = two
    ? { bones: { Hips: [8, 0, 0], Spine: [2, 0, 0], LeftFoot: [14, 0, 0], RightFoot: [14, 0, 0] }, feet: { Left: [-0.13, ANKLE + 0.06, 0.86], Right: [0.13, ANKLE + 0.06, 0.80] }, kneePoles: bothDir(0.15, 0, 1), hands: both(0.24, 1.40, 0.90), poles: bothDir(0.6, -0.2, -0.5), hipsY: 0.0, hipsZ: 0.84 }
    : { bones: { Hips: [6, 0, 0], Spine: [0, 0, 0], LeftFoot: [16, 0, 0], RightUpLeg: [-60, 0, -4], RightLeg: [80, 0, 0], RightFoot: [10, 0, 0] }, feet: { Left: [-0.11, ANKLE + 0.06, 0.98] }, kneePoles: { Left: [-0.1, 0, 1] }, hands: both(0.24, 1.40, 1.04), poles: bothDir(0.6, -0.2, -0.5), hipsY: 0.02, hipsZ: 0.96 };
  const keys: ExKey[] = [...lead, at(Z(pen), t, true), at(Z(plant), t + 0.27), at(Z(push), t + 0.42), at(Z(air), t + 0.6), at(Z(touchdown), t + 0.8), at(Z(land), t + 0.98, true), at(Z(land), t + 1.25, true), at(Z(stand(zb)), t + 1.75, true)];
  // walk back to the start
  const home = o.runIn ? 0 : z1;
  const n = Math.max(1, Math.ceil((zb - home) / 0.4));
  let tt = t + 1.75;
  for (let i = 1; i <= n; i++) {
    const zf = zb - ((zb - home) * i) / n, zp = zb - ((zb - home) * (i - 1)) / n;
    keys.push(at(Z(stand(zf, zf, zp)), tt + 0.5), at(Z(stand(zf)), tt + 0.9, i === n));
    tt += 0.9;
  }
  return run(scene, sk, name, tt + 0.4, keys);
}

/** ex_wake_up — the Pre-Game Wake-Up's phases in order, one beat each: tall, hands on the lower ribs, a slow breath (the
 *  ribs widen); a knee lifted and circled at the hip (open the joints); four quick pogos (the rhythm); then the launch —
 *  stance, dip, jump, land and pause. */
function wakeUp(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const ribs: Pair = { Left: [0.05, -0.30, 0.16], Right: [-0.05, -0.30, 0.16] };
  const breath = (inhale: number): Pose => ({ bones: { ...STAND, Spine: [2 - inhale * 3, 0, 0], Spine1: [-inhale * 2, 0, 0] }, feet: STANCE, kneePoles: bothDir(0.1, 0, 1), rel: ribs, poles: bothDir(0.8, -0.5, 0), hipsY: inhale * 0.01 });
  // the right thigh lifted to level and circled: forward-out-back-in at the hip, on the left leg
  const circle = (a: number): Pose => ({
    bones: { ...STAND, RightUpLeg: [-62 + 18 * Math.cos(a), 0, -18 * Math.sin(a) - 4], RightLeg: [80, 0, 0], RightFoot: [10, 0, 0] },
    feet: { Left: [-0.10, ANKLE, 0.06] }, kneePoles: { Left: [-0.05, 0, 1] }, rel: ON_HIPS, poles: HIPS_POLES, hipsY: 0, hipsX: -0.05,
  });
  const pogoDown: Pose = { bones: { ...STAND, Hips: [4, 0, 0] }, feet: STANCE, kneePoles: bothDir(0.1, 0, 1), hands: both(0.26, 0.91, 0.16), poles: ELBOWS_OUT_BACK, hipsY: -0.05 };
  const pogoUp: Pose = { bones: { ...STAND, LeftUpLeg: [-4, 0, 3], RightUpLeg: [-4, 0, -3], LeftLeg: [6, 0, 0], RightLeg: [6, 0, 0], LeftFoot: [28, 0, 0], RightFoot: [28, 0, 0] }, hands: both(0.26, 1.10, 0.16), poles: ELBOWS_OUT_BACK, hipsY: 0.12 };
  const legs = (thigh: number, knee: number): Record<string, Deg3> => ({ LeftUpLeg: [thigh, 0, 4], RightUpLeg: [thigh, 0, -4], LeftLeg: [knee, 0, 0], RightLeg: [knee, 0, 0] });
  const takeoff: Pose = { bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], ...legs(-4, 4), LeftFoot: [34, 0, 0], RightFoot: [34, 0, 0] }, hands: both(0.20, 2.15, 0.12), poles: bothDir(0.9, 0.1, -0.3), hipsY: 0.10 };
  const peak: Pose = { bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], ...legs(-10, 14), LeftFoot: [26, 0, 0], RightFoot: [26, 0, 0] }, hands: both(0.22, 2.24, 0.14), poles: bothDir(0.9, 0.1, -0.3), hipsY: 0.24 };
  const landing: Pose = { bones: { Hips: [20, 0, 0], Spine: [10, 0, 0], Neck: [-10, 0, 0], LeftFoot: [-16, 0, 0], RightFoot: [-16, 0, 0] }, feet: STANCE, kneePoles: bothDir(0.15, 0, 1), hands: both(0.26, 0.70, 0.34), poles: HANG_POLES, hipsY: -0.22 };
  const keys: ExKey[] = [at(TALL, 0, true), at(breath(0), 0.5, true), at(breath(1), 1.6, true), at(breath(0), 2.8, true)];
  for (let i = 0; i <= 8; i++) keys.push(at(circle((i / 8) * 2 * Math.PI), 3.3 + i * 0.25, i === 0 || i === 8));
  keys.push(at(TALL, 5.8, true));
  for (let i = 0; i < 4; i++) { keys.push(at(pogoDown, 6.1 + i * 0.5)); keys.push(at(pogoUp, 6.35 + i * 0.5)); }
  keys.push(at(pogoDown, 8.1), at(TALL, 8.5, true), at(DIP, 9.0, true), at({ ...DIP, bones: { ...DIP.bones, Hips: [8, 0, 0], Spine: [2, 0, 0] }, hands: both(0.24, 1.40, 0.10), hipsY: -0.02 }, 9.2), at(takeoff, 9.32), at(peak, 9.52, true), at(landing, 9.9, true), at(landing, 10.5, true), at(TALL, 11.0, true));
  return run(scene, sk, 'ex_wake_up', 11.6, keys);
}

export const DRILL_BUILDERS: [string, Builder][] = [
  ['ex_overhead_squat', overheadSquat], ['ex_knee_to_wall', kneeToWall], ['ex_sl_squat_partial', slSquatPartial], ['ex_jump_hands_hips', jumpHandsHips],
  ['ex_cmj_dip', cmjDip], ['ex_wall_drive', (scene, sk) => wallDrive(scene, sk, 'ex_wall_drive', false)], ['ex_wall_march', (scene, sk) => wallDrive(scene, sk, 'ex_wall_march', true)],
  ['ex_decel_three', decelThree], ['ex_t_drill', tDrill], ['ex_wake_up', wakeUp],
  ['ex_approach_one', (scene, sk) => approach(scene, sk, 'ex_approach_one', false)], ['ex_approach_two', (scene, sk) => approach(scene, sk, 'ex_approach_two', true)],
  // the library's approach jumps: walked in, a step or three, no running in place
  ['ex_approach_jump_one_step', (scene, sk) => approach(scene, sk, 'ex_approach_jump_one_step', true, { extra: 0, oz: -0.40 })],
  ['ex_approach_jump_two_step', (scene, sk) => approach(scene, sk, 'ex_approach_jump_two_step', true, { extra: 1, oz: -0.30 })],
  ['ex_approach_jump_three_step', (scene, sk) => approach(scene, sk, 'ex_approach_jump_three_step', true, { extra: 2, oz: -0.10 })],
  ['ex_approach_jump_one_foot', (scene, sk) => approach(scene, sk, 'ex_approach_jump_one_foot', false, { extra: 2, oz: -0.10 })],
];
