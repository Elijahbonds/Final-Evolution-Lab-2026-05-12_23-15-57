// Body-weight exercise loops (LIBRARY-ANATOMY-2, 2026-10-25): lunges that step sideways and behind, single-leg hinges, sit-ups
// and crunches, planks with a limb moving, burpees, sprint drills in place, jumps (tuck, star, split, one-leg), pogos and
// lateral hops, skater bounds, rope-jump footwork, and crawls (bear, leopard, crab).
//
// Owner decision (2026-10-25): coverage rises only with correct, authored loops. Travel is shown in place where the
// library's own entry is a drill done on the spot or across a few feet (a crawl, a skip, a run is the athlete's limbs
// doing it with the body held where the stage can see it — exercise.ts's `run` and ex_carry do the same); a hop or a
// bound that lands somewhere else carries the hips there and back (exerciseKit hipsX / hipsZ) so a planted foot stays put.
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { ANKLE, TOE_ANKLE, HIGH_PLANK, STAND, HANG, HANG_POLES, both, bothDir, loop, mix, type Deg3, type ExKey, type Pair, type V3 } from './exerciseKit';
import { LIE_BACK, SUPINE, turn } from './exerciseFloor';

type Pose = Omit<ExKey, 't'>;
type Side = 'Left' | 'Right';
type Builder = (scene: Scene, sk: Skeleton) => AnimationGroup | null;
const other = (s: Side): Side => (s === 'Left' ? 'Right' : 'Left');
const sx = (s: Side, x: number) => (s === 'Left' ? -x : x);

/** Keys at the given times, each move solved half-way too (a planted foot stays planted between two far-apart keys); a foot
 *  or hand that travels further than a step between two keys is lifted at the half-way key, not slid. */
function dense(keys: ExKey[], dur: number): ExKey[] {
  const out: ExKey[] = [];
  keys.forEach((k, i) => {
    out.push(k);
    const n = keys[i + 1] ?? { ...keys[0], t: dur };
    const m: ExKey = { ...mix(k, n, 0.5), t: (k.t + n.t) / 2 };
    for (const f of ['feet', 'hands'] as const) {
      const a = k[f], b = n[f], c = m[f];
      if (!a || !b || !c) continue;
      for (const s of ['Left', 'Right'] as const) {
        const x = a[s], y = b[s], z = c[s];
        if (x && y && z && Math.hypot(x[0] - y[0], x[2] - y[2]) > 0.18) c[s] = [z[0], Math.max(x[1], y[1]) + (f === 'feet' ? 0.12 : 0.10), z[2]];
      }
    }
    out.push(m);
  });
  return out;
}
const run = (scene: Scene, sk: Skeleton, name: string, dur: number, keys: ExKey[], pivot = false) => loop(scene, sk, name, dur, dense(keys, dur), { pivot });
const at = (p: Pose, t: number, hold = false): ExKey => ({ ...p, t, ...(hold ? { hold: true } : {}) });

// ── lunges to the side and behind, the sumo pull, single-leg hinges ───────────────────────────────────────────────────
const CHEST_HANDS: Pair = { Left: [0.13, -0.24, 0.26], Right: [-0.13, -0.24, 0.26] };
const CHEST_POLES = bothDir(0.25, -1, -0.1);

/** ex_lateral_lunge — from standing, the right foot steps wide and the hips sit over it, the left leg long; push back. The
 *  hips travel with the step (they finish over the right foot), the left foot planted throughout. */
function lateralLunge(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const home: Pose = { bones: { ...STAND }, feet: { Left: [-0.45, ANKLE, 0.06], Right: [-0.19, ANKLE, 0.06] }, kneePoles: bothDir(0.1, 0, 1), rel: CHEST_HANDS, poles: CHEST_POLES, hipsY: 0, hipsX: -0.32 };
  const air: Pose = { ...home, feet: { Left: [-0.45, ANKLE, 0.06], Right: [0.20, ANKLE + 0.10, 0.06] }, hipsX: -0.18, hipsY: -0.04 };
  const low: Pose = { bones: { Hips: [30, 0, 0], Spine: [8, 0, 0], Neck: [-18, 0, 0], RightFoot: [-30, 0, 0], LeftFoot: [-6, 0, 0] }, feet: { Left: [-0.45, ANKLE, 0.06], Right: [0.60, ANKLE, 0.10] }, kneePoles: { Left: [0, 0, 1], Right: [0.5, 0, 1] }, rel: CHEST_HANDS, poles: CHEST_POLES, hipsY: -0.38, hipsX: 0.30 };
  return run(scene, sk, 'ex_lateral_lunge', 2.8, [at(home, 0, true), at(air, 0.4), at(low, 0.95, true), at(low, 1.35, true), at(air, 1.9), at(home, 2.3, true)]);
}

/** ex_curtsy_lunge — the right foot steps back and across behind the left, the hips drop, and the foot returns. */
function curtsyLunge(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const home: Pose = { bones: { ...STAND }, feet: both(0.12, ANKLE, 0.06), kneePoles: bothDir(0.1, 0, 1), rel: CHEST_HANDS, poles: CHEST_POLES, hipsY: 0 };
  const air: Pose = { ...home, feet: { Left: [-0.12, ANKLE, 0.06], Right: [-0.02, ANKLE + 0.10, -0.20] }, hipsY: -0.04 };
  const low: Pose = { bones: { Hips: [12, 0, 0], Spine: [4, 0, 0], Neck: [-6, 0, 0], RightFoot: [28, 0, 0], LeftFoot: [-16, 0, 0] }, feet: { Left: [-0.12, ANKLE, 0.10], Right: [-0.32, ANKLE + 0.05, -0.40] }, kneePoles: { Left: [-0.1, 0, 1], Right: [-0.3, -1, 0.3] }, rel: CHEST_HANDS, poles: CHEST_POLES, hipsY: -0.36, hipsX: -0.06 };
  return run(scene, sk, 'ex_curtsy_lunge', 2.6, [at(home, 0, true), at(air, 0.35), at(low, 0.9, true), at(low, 1.2, true), at(air, 1.75), at(home, 2.1, true)]);
}

/** ex_sumo_deadlift — feet wide and toes out, the hands hanging between the knees: hips down and back, up to standing. */
function sumoDeadlift(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet = both(0.32, ANKLE, 0.12), knees = bothDir(0.6, 0, 1);
  const top: Pose = { bones: { ...STAND }, feet, kneePoles: knees, rel: { Left: [0.10, -0.52, 0.08], Right: [-0.10, -0.52, 0.08] }, poles: HANG_POLES, hipsY: -0.02 };
  const low: Pose = { bones: { Hips: [44, 0, 0], Spine: [6, 0, 0], Neck: [-26, 0, 0], LeftFoot: [-18, 0, 0], RightFoot: [-18, 0, 0] }, feet, kneePoles: knees, rel: { Left: [0.12, -0.52, 0.04], Right: [-0.12, -0.52, 0.04] }, poles: HANG_POLES, hipsY: -0.34 };
  return run(scene, sk, 'ex_sumo_deadlift', 2.6, [at(top, 0, true), at(low, 1.0, true), at(low, 1.25, true), at(top, 2.1, true)], true);
}

/** ex_sl_rdl — the single-leg Romanian deadlift: standing on the left, the trunk tips forward as the right leg reaches long
 *  behind, one line from the head to the heel; the hands hang toward the floor. */
function slRdl(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const top: Pose = { bones: { ...STAND, RightUpLeg: [10, 0, 0], RightLeg: [12, 0, 0] }, feet: { Left: [-0.10, ANKLE, 0.06] }, kneePoles: { Left: [0, 0, 1] }, rel: { Left: [0.04, -0.50, 0.06], Right: [-0.04, -0.50, 0.06] }, poles: HANG_POLES, hipsY: 0 };
  const low: Pose = { bones: { Hips: [76, 0, 0], Spine: [2, 0, 0], Neck: [-34, 0, 0], RightUpLeg: [2, 0, 0], RightLeg: [4, 0, 0], RightFoot: [-10, 0, 0] }, feet: { Left: [-0.10, ANKLE, 0.06] }, kneePoles: { Left: [0, 0, 1] }, rel: { Left: [0.05, -0.52, 0.02], Right: [-0.05, -0.52, 0.02] }, poles: HANG_POLES, hipsY: -0.08, hipsZ: -0.10 };
  return run(scene, sk, 'ex_sl_rdl', 3.0, [at(top, 0, true), at(low, 1.2, true), at(low, 1.5, true), at(top, 2.6, true)], true);
}

/** ex_kickstand_rdl — the staggered (kickstand) hinge: the right foot back by the left heel, on its toes; the hinge is the
 *  left leg's. */
function kickstandRdl(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const feet: Pair = { Left: [-0.10, ANKLE, 0.16], Right: [0.14, ANKLE + 0.06, -0.10] };
  const top: Pose = { bones: { ...STAND, RightFoot: [32, 0, 0], LeftLeg: [6, 0, 0] }, feet, kneePoles: bothDir(0.1, 0, 1), rel: { Left: [0.04, -0.52, 0.10], Right: [-0.04, -0.52, 0.10] }, poles: HANG_POLES, hipsY: 0 };
  const low: Pose = { bones: { Hips: [62, 0, 0], Spine: [6, 0, 0], Neck: [-30, 0, 0], RightFoot: [36, 0, 0] }, feet, kneePoles: bothDir(0.1, 0, 1), rel: { Left: [0.05, -0.53, 0.02], Right: [-0.05, -0.53, 0.02] }, poles: HANG_POLES, hipsY: -0.10 };
  return run(scene, sk, 'ex_kickstand_rdl', 2.7, [at(top, 0, true), at(low, 1.1, true), at(low, 1.3, true), at(top, 2.3, true)], true);
}

// ── on the back: crunches, sit-ups, leg work ───────────────────────────────────────────────────────────────────────
const LEGS_TABLE: Record<string, Deg3> = { LeftUpLeg: [-90, 0, 4], RightUpLeg: [-90, 0, -4], LeftLeg: [90, 0, 0], RightLeg: [90, 0, 0] };
const HEAD_HANDS = (curl: number): Pair => both(0.11, 0.18 + 0.14 * curl, -0.62 + 0.12 * curl);
const HEAD_POLES = bothDir(1, 0.3, 0);

/** ex_reverse_crunch — on the back, knees over the hips: the pelvis curls up off the floor, the knees toward the chest. */
function reverseCrunch(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const down: Pose = { ...LIE_BACK, bones: { ...LIE_BACK.bones, ...LEGS_TABLE } };
  const up: Pose = { ...LIE_BACK, bones: { ...LIE_BACK.bones, Hips: [-64, 0, 0], Spine: [-10, 0, 0], LeftUpLeg: [-118, 0, 4], RightUpLeg: [-118, 0, -4], LeftLeg: [105, 0, 0], RightLeg: [105, 0, 0] }, hipsY: -0.80 };
  return run(scene, sk, 'ex_reverse_crunch', 2.2, [at(down, 0, true), at(up, 0.8, true), at(up, 1.1, true)], true);
}

/** ex_situp / ex_situp_34 — knees bent, feet flat, the hands crossed on the chest: the trunk rolls up (to upright, or
 *  three-quarters of the way) and lowers. */
function situp(scene: Scene, sk: Skeleton, name: string, top: number): AnimationGroup | null {
  const down: Pose = { ...SUPINE, rel: { Left: [0.16, 0.10, 0.06], Right: [-0.16, 0.10, 0.06] }, poles: bothDir(1, 0.3, 0) };
  const mid: Pose = { ...SUPINE, bones: { Hips: [-70, 0, 0], Spine: [20, 0, 0], Neck: [16, 0, 0] }, rel: { Left: [0.16, 0.0, 0.14], Right: [-0.16, 0.0, 0.14] }, poles: bothDir(1, 0, 0) };
  const up: Pose = { ...SUPINE, bones: { Hips: [top, 0, 0], Spine: [12, 0, 0], Neck: [0, 0, 0] }, rel: { Left: [0.16, -0.18, 0.18], Right: [-0.16, -0.18, 0.18] }, poles: bothDir(1, -0.4, 0) };
  return run(scene, sk, name, 2.8, [at(down, 0, true), at(mid, 0.55), at(up, 1.1, true), at(up, 1.4, true), at(mid, 1.95)], true);
}

/** ex_bicycle — on the back, the hands at the head: one knee drives in as the opposite elbow turns to meet it, the other
 *  leg long and off the floor, then the other side (bicycle / cross-body crunch / elbow to knee). */
function bicycle(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const side = (s: Side): Pose => ({
    ...LIE_BACK, bones: { ...LIE_BACK.bones, Spine: [22, sx(s, 20), 0], Spine1: [10, sx(s, 10), 0], Neck: [14, 0, 0], [`${s}UpLeg`]: [-112, 0, 0], [`${s}Leg`]: [104, 0, 0], [`${other(s)}UpLeg`]: [-38, 0, 0], [`${other(s)}Leg`]: [6, 0, 0] } as Record<string, Deg3>,
    hands: HEAD_HANDS(1), poles: HEAD_POLES,
  });
  return run(scene, sk, 'ex_bicycle', 1.6, [at(side('Left'), 0, true), at(side('Right'), 0.8, true)], true);
}

/** ex_heel_touch — on the back, knees bent, the shoulders just off the floor: the trunk bends side to side, each hand
 *  reaching down along the floor toward its heel. */
function heelTouch(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const side = (s: Side): Pose => ({
    ...SUPINE, bones: { Hips: [-86, 0, 0], Spine: [16, 0, sx(s, -16)], Spine1: [6, 0, sx(s, -10)], Neck: [14, 0, 0] },
    hands: { [s]: [sx(s, 0.34), 0.10, 0.20], [other(s)]: [sx(other(s), 0.04), 0.20, -0.08] } as Pair, poles: bothDir(0.6, 0.6, 0),
  });
  return run(scene, sk, 'ex_heel_touch', 1.6, [at(side('Left'), 0, true), at(side('Right'), 0.8, true)], true);
}

/** ex_flutter — on the back, the legs long and just off the floor, kicking small and fast up and down in turn. */
function flutter(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const kick = (u: number): Pose => ({ ...LIE_BACK, bones: { ...LIE_BACK.bones, Neck: [14, 0, 0], LeftUpLeg: [-22 - 14 * u, 0, 3], RightUpLeg: [-22 + 14 * u, 0, -3], LeftLeg: [4, 0, 0], RightLeg: [4, 0, 0], LeftFoot: [-14, 0, 0], RightFoot: [-14, 0, 0] }, hands: both(0.18, 0.04, -0.06), poles: bothDir(0.6, 0.3, 0) });
  return run(scene, sk, 'ex_flutter', 0.8, [at(kick(1), 0), at(kick(-1), 0.4)], true);
}

/** ex_toe_touch — on the back, the legs straight up: the shoulders curl off the floor and the hands reach up to the toes. */
function toeTouch(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const legs = { LeftUpLeg: [-88, 0, 3] as Deg3, RightUpLeg: [-88, 0, -3] as Deg3, LeftLeg: [2, 0, 0] as Deg3, RightLeg: [2, 0, 0] as Deg3 };
  const down: Pose = { ...LIE_BACK, bones: { ...LIE_BACK.bones, ...legs }, rel: { Left: [0.04, 0.50, 0.06], Right: [-0.04, 0.50, 0.06] }, poles: bothDir(1, 0, 0) };
  const up: Pose = { ...LIE_BACK, bones: { ...LIE_BACK.bones, ...legs, Spine: [26, 0, 0], Spine1: [10, 0, 0], Neck: [18, 0, 0] }, hands: both(0.08, 0.86, 0.10), poles: bothDir(1, 0, -0.3) };
  return run(scene, sk, 'ex_toe_touch', 2.0, [at(down, 0, true), at(up, 0.7, true), at(up, 1.0, true)], true);
}

/** ex_vup — from flat on the back, arms long overhead, the legs and trunk lift together to a V, the hands to the shins. */
function vup(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const flat: Pose = { ...LIE_BACK, bones: { ...LIE_BACK.bones, LeftUpLeg: [-2, 0, 3], RightUpLeg: [-2, 0, -3], LeftLeg: [2, 0, 0], RightLeg: [2, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] }, hands: both(0.16, 0.08, -1.02), poles: bothDir(0.4, 1, 0) };
  const v: Pose = { ...LIE_BACK, bones: { Hips: [-42, 0, 0], Spine: [8, 0, 0], Neck: [6, 0, 0], LeftUpLeg: [-100, 0, 3], RightUpLeg: [-100, 0, -3], LeftLeg: [4, 0, 0], RightLeg: [4, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] }, hands: both(0.12, 0.72, 0.30), poles: bothDir(1, -0.2, 0), hipsY: -0.82 };
  return run(scene, sk, 'ex_vup', 2.4, [at(flat, 0, true), at(v, 0.8, true), at(v, 1.1, true)], true);
}

/** ex_hollow (hold) / ex_hollow_tuck / ex_hollow_rock — on the back, the low back pressed down, the shoulders and legs off
 *  the floor, the arms long overhead (tucked: the knees in, the arms reaching forward); the rock rolls on that shape. */
const HOLLOW: Pose = { ...LIE_BACK, bones: { ...LIE_BACK.bones, Spine: [12, 0, 0], Spine1: [6, 0, 0], Neck: [16, 0, 0], LeftUpLeg: [-22, 0, 3], RightUpLeg: [-22, 0, -3], LeftLeg: [2, 0, 0], RightLeg: [2, 0, 0], LeftFoot: [-14, 0, 0], RightFoot: [-14, 0, 0] }, hands: both(0.14, 0.34, -0.98), poles: bothDir(0.4, 1, 0) };
const HOLLOW_TUCK: Pose = { ...HOLLOW, bones: { ...HOLLOW.bones, LeftUpLeg: [-96, 0, 3], RightUpLeg: [-96, 0, -3], LeftLeg: [100, 0, 0], RightLeg: [100, 0, 0] }, hands: both(0.16, 0.40, 0.20), poles: bothDir(1, 0, 0) };
const breathe = (p: Pose, d: number): Pose => ({ ...p, bones: { ...p.bones, Spine1: [((p.bones?.Spine1 ?? [0, 0, 0]) as Deg3)[0] - d, 0, 0] } });
function hollowHold(scene: Scene, sk: Skeleton, name: string, p: Pose): AnimationGroup | null {
  return loop(scene, sk, name, 3.2, [at(breathe(p, 0), 0, true), at(breathe(p, 2), 1.6, true)], { pivot: true });
}
function hollowRock(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const rock = (u: number): Pose => ({ ...HOLLOW, bones: { ...HOLLOW.bones, Hips: [-86 + 10 * u, 0, 0] }, hipsY: -0.84 + 0.02 * Math.abs(u) });
  return run(scene, sk, 'ex_hollow_rock', 1.2, [at(rock(1), 0, true), at(rock(-1), 0.6, true)], true);
}

/** ex_dead_bug_heel — the dead bug with the knees bent: one heel lowers to tap the floor and returns, then the other. */
function deadBugHeel(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const base: Pose = { ...LIE_BACK, bones: { ...LIE_BACK.bones, ...LEGS_TABLE }, hands: both(0.20, 1.48, 0.10), poles: bothDir(0.6, 0.2, 0), hipsY: -0.86 };
  const tap = (s: Side): Pose => ({ ...base, bones: { ...base.bones, [`${s}UpLeg`]: [-42, 0, 0], [`${s}Leg`]: [92, 0, 0] } });
  return run(scene, sk, 'ex_dead_bug_heel', 3.2, [at(base, 0, true), at(tap('Left'), 0.8, true), at(base, 1.6, true), at(tap('Right'), 2.4, true)], true);
}

// ── planks with a limb moving; side planks ──────────────────────────────────────────────────────────────────────────
const FOREARM: Pose = { bones: { Hips: [78, 0, 0], Spine: [0, 0, 0], Neck: [-36, 0, 0], LeftFoot: [8, 0, 0], RightFoot: [8, 0, 0] }, feet: both(0.13, TOE_ANKLE, -0.95), kneePoles: bothDir(0, -1, 0.1), hands: both(0.10, 0.06, 0.52), poles: bothDir(0.3, 0.2, -1), hipsY: -0.66 };
const HIGH: Pose = { ...HIGH_PLANK, feet: both(0.14, TOE_ANKLE, -0.90) };
const BEAR: Pose = { bones: { Hips: [88, 0, 0], Spine: [0, 0, 0], Neck: [-46, 0, 0], LeftFoot: [0, 0, 0], RightFoot: [0, 0, 0] }, feet: both(0.14, TOE_ANKLE + 0.04, -0.36), kneePoles: bothDir(0, -1, 0.3), hands: both(0.18, 0.05, 0.52), poles: bothDir(0.6, 0.2, -0.5), hipsY: -0.36 };
type PlankAct = 'leg' | 'reach' | 'knee' | 'tap';
/** A plank (`base`) holding still while one limb moves and returns, then the other side's. */
function plankAct(scene: Scene, sk: Skeleton, name: string, base: Pose, act: PlankAct): AnimationGroup | null {
  const handY = base.hands!.Left![1], handZ = base.hands!.Left![2], footZ = base.feet!.Left![2], footY = base.feet!.Left![1];
  const shoulderY = base === FOREARM ? 0.40 : base === BEAR ? 0.56 : 0.58;
  const move = (s: Side): Pose => {
    const o = other(s);
    switch (act) {
      case 'leg': return { ...base, feet: { [o]: base.feet![o], [s]: [sx(s, 0.14), footY + (base === BEAR ? 0.24 : 0.30), footZ - 0.06] } as Pair, kneePoles: { [o]: base.kneePoles![o], [s]: [0, -1, -0.2] } as Pair };
      case 'reach': return { ...base, hands: { [o]: base.hands![o], [s]: [sx(s, 0.16), shoulderY, handZ + 0.48] } as Pair, poles: { [o]: base.poles![o], [s]: [sx(s, 0.3), -1, 0] } as Pair };
      case 'knee': return { ...base, bones: { ...base.bones, Hips: [((base.bones!.Hips as Deg3)[0]) - 6, 0, 0] }, feet: { [o]: base.feet![o], [s]: [sx(s, 0.30), handY + 0.20, footZ + (base === BEAR ? 0.30 : 0.62)] } as Pair, kneePoles: { [o]: base.kneePoles![o], [s]: [sx(s, 0.9), 0.2, 0.6] } as Pair };
      case 'tap': return { ...base, hands: { [o]: base.hands![o], [s]: [sx(o, 0.10), shoulderY + 0.06, handZ - 0.08] } as Pair, poles: { [o]: base.poles![o], [s]: [sx(s, 1), 0, 0] } as Pair };
    }
  };
  const D = act === 'tap' ? 1.6 : 2.4, q = D / 4;
  return run(scene, sk, name, D, [at(base, 0, true), at(move('Left'), q, true), at(base, 2 * q, true), at(move('Right'), 3 * q, true)], true);
}

/** The side plank: on the right forearm, the body one straight line tilted up from the feet, the top arm up (authored
 *  head toward −z like exerciseFloor's side-lying, and turned the same way to face the floor camera). */
const SIDE_PLANK: Pose = {
  bones: { Hips: [0, -90, 90], Spine: [0, 0, -14], Spine1: [0, 0, -10], Neck: [0, 0, -4], LeftUpLeg: [0, 0, 0], RightUpLeg: [0, 0, 0], LeftLeg: [2, 0, 0], RightLeg: [2, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] },
  feet: { Right: [0.02, 0.07, 0.84], Left: [-0.02, 0.17, 0.84] }, kneePoles: { Right: [1, 0, 0], Left: [1, 0, 0] },
  hands: { Right: [0.24, 0.07, -0.50], Left: [0.02, 0.98, -0.30] }, poles: { Right: [0, -1, 0.1], Left: [1, 0, 0] }, hipsY: -0.52,
};
function sidePlank(scene: Scene, sk: Skeleton, name: string, legLift: boolean): AnimationGroup | null {
  const p = SIDE_PLANK;
  const lift: Pose = { ...p, feet: { Right: p.feet!.Right, Left: [-0.02, 0.48, 0.80] } };
  if (!legLift) return loop(scene, sk, name, 3.0, [at(turn(breathe(p, 0)), 0, true), at(turn(breathe(p, 2)), 1.5, true)], { pivot: true });
  return run(scene, sk, name, 2.4, [at(turn(p), 0, true), at(turn(lift), 0.9, true), at(turn(lift), 1.3, true)], true);
}

// ── conditioning ────────────────────────────────────────────────────────────────────────────────────────────────────
const STANDING: Pose = { bones: { ...STAND }, feet: both(0.13, ANKLE, 0.08), kneePoles: bothDir(0.1, 0, 1), hands: HANG, poles: HANG_POLES, hipsY: 0 };
const SQUAT_DOWN: Pose = { bones: { Hips: [42, 0, 0], Spine: [18, 0, 0], Neck: [-26, 0, 0], LeftFoot: [-46, 0, 0], RightFoot: [-46, 0, 0] }, feet: both(0.16, ANKLE, 0.10), kneePoles: bothDir(0.35, 0, 1), hands: both(0.22, 0.05, 0.46), poles: bothDir(0.5, 0, -0.8), hipsY: -0.52 };
const PLANK_BACK: Pose = { ...HIGH_PLANK, hands: both(0.22, 0.05, 0.46) };
const AIR_UP: Pose = { bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], LeftUpLeg: [-4, 0, 4], RightUpLeg: [-4, 0, -4], LeftLeg: [4, 0, 0], RightLeg: [4, 0, 0], LeftFoot: [32, 0, 0], RightFoot: [32, 0, 0] }, hands: both(0.18, 2.12, 0.10), poles: bothDir(0.9, 0.1, -0.3), hipsY: 0.14 };
/** ex_squat_thrust — squat, hands to the floor, the feet jump back to a plank and in again, stand. ex_burpee adds the jump. */
function burpee(scene: Scene, sk: Skeleton, name: string, jump: boolean): AnimationGroup | null {
  // the feet jump back (and in) clear of the floor: a key half-way with them up and pointing, the hips held on the hands
  const KICK: Pose = { ...PLANK_BACK, bones: { ...PLANK_BACK.bones, Hips: [56, 0, 0], LeftFoot: [20, 0, 0], RightFoot: [20, 0, 0] }, feet: both(0.13, 0.24, -0.40), kneePoles: bothDir(0, -0.6, 0.8), hipsY: -0.52 };
  const keys = [at(STANDING, 0, true), at(SQUAT_DOWN, 0.45, true), at(KICK, 0.62), at(PLANK_BACK, 0.8, true), at(PLANK_BACK, 1.05, true), at(KICK, 1.22), at(SQUAT_DOWN, 1.4, true)];
  if (jump) { keys.push(at({ ...STANDING, hands: both(0.22, 1.40, 0.20), poles: bothDir(0.6, 0, -0.6), hipsY: -0.04 }, 1.75), at(AIR_UP, 2.0, true), at({ ...SQUAT_DOWN, bones: { ...SQUAT_DOWN.bones, Hips: [20, 0, 0], Spine: [8, 0, 0] }, hands: both(0.24, 0.90, 0.30), hipsY: -0.24 }, 2.3)); return run(scene, sk, name, 2.8, keys); }
  return run(scene, sk, name, 2.1, keys);
}

/** ex_seal_jack — the jumping jack with the arms straight out in front, clapping together and opening wide. */
function sealJack(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const closed: Pose = { bones: { ...STAND, Hips: [2, 0, 0] }, feet: both(0.10, ANKLE, 0.06), kneePoles: bothDir(0.1, 0, 1), rel: { Left: [0.15, -0.04, 0.50], Right: [-0.15, -0.04, 0.50] }, poles: bothDir(0.3, -1, 0), hipsY: -0.03 };
  const air = (spread: number, open: number): Pose => ({ bones: { ...STAND, LeftUpLeg: [0, 0, spread], RightUpLeg: [0, 0, -spread], LeftLeg: [4, 0, 0], RightLeg: [4, 0, 0], LeftFoot: [18, 0, 0], RightFoot: [18, 0, 0] }, rel: { Left: [0.15 - 0.6 * open, -0.04, 0.50 - 0.38 * open], Right: [-0.15 + 0.6 * open, -0.04, 0.50 - 0.38 * open] }, poles: bothDir(0.1, -1, -0.2), hipsY: 0.06 });
  const open: Pose = { bones: { ...STAND, Hips: [2, 0, 0] }, feet: both(0.36, ANKLE, 0.06), kneePoles: bothDir(0.3, 0, 1), rel: { Left: [-0.45, -0.04, 0.12], Right: [0.45, -0.04, 0.12] }, poles: bothDir(0.1, -1, -0.2), hipsY: -0.04 };
  return loop(scene, sk, 'ex_seal_jack', 1.0, [at(closed, 0), at(air(10, 0.5), 0.18), at(open, 0.36, true), at(open, 0.5), at(air(10, 0.5), 0.68), at(closed, 0.86, true)]);
}

// ── sprint drills in place ──────────────────────────────────────────────────────────────────────────────────────────
/** One running step in place: `s`'s knee up (or heel kicked up), the other foot on its ball, the opposite arm driving. */
function stride(s: Side, legBones: Record<string, Deg3>, hop: number): Pose {
  const o = other(s);
  return {
    bones: { Hips: [4, 0, 0], Spine: [4, 0, 0], Neck: [-2, 0, 0], ...legBones, [`${o}Foot`]: [16, 0, 0] } as Record<string, Deg3>,
    feet: { [o]: [sx(o, 0.11), ANKLE + 0.03 + hop, 0.04] } as Pair, kneePoles: bothDir(0, 0, 1),
    rel: { [o]: [sx(o, -0.02), -0.16, 0.26], [s]: [sx(s, 0.0), -0.40, -0.18] } as Pair, poles: { [o]: [sx(o, 0.2), -1, 0.2], [s]: [sx(s, 0.2), -0.4, -1] } as Pair,
    hipsY: 0.02 + hop,
  };
}
const kneeUp = (s: Side, h = 1): Record<string, Deg3> => ({ [`${s}UpLeg`]: [-84 * h, 0, 0], [`${s}Leg`]: [94 * h, 0, 0], [`${s}Foot`]: [10, 0, 0] });
const heelUp = (s: Side): Record<string, Deg3> => ({ [`${s}UpLeg`]: [6, 0, 0], [`${s}Leg`]: [132, 0, 0], [`${s}Foot`]: [40, 0, 0] });
function inPlace(scene: Scene, sk: Skeleton, name: string, dur: number, poses: Pose[]): AnimationGroup | null {
  return run(scene, sk, name, dur, poses.map((p, i) => at(p, (dur * i) / poses.length)));
}
const highKnees = (scene: Scene, sk: Skeleton) => inPlace(scene, sk, 'ex_high_knees', 0.6, [stride('Left', kneeUp('Left'), 0.03), stride('Right', kneeUp('Right'), 0.03)]);
const buttKicks = (scene: Scene, sk: Skeleton) => inPlace(scene, sk, 'ex_butt_kicks', 0.6, [stride('Left', heelUp('Left'), 0.02), stride('Right', heelUp('Right'), 0.02)]);
/** ex_a_skip / ex_power_skip — the skip: a knee drives up as the other foot hops (higher, and the arms bigger, for the power
 *  skip), the foot steps down, and the other side. */
function skip(scene: Scene, sk: Skeleton, name: string, hop: number): AnimationGroup | null {
  const down = (s: Side): Pose => ({ ...stride(s, { [`${s}UpLeg`]: [-20, 0, 0], [`${s}Leg`]: [30, 0, 0] }, 0), feet: both(0.11, ANKLE, 0.04), hipsY: -0.02 });
  return inPlace(scene, sk, name, 1.2, [down('Right'), stride('Left', kneeUp('Left'), hop), down('Left'), stride('Right', kneeUp('Right'), hop)]);
}
/** ex_b_skip — the A-skip whose raised leg then reaches out long and paws back down under the hip. */
function bSkip(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const reach = (s: Side): Pose => ({ ...stride(s, { [`${s}UpLeg`]: [-74, 0, 0], [`${s}Leg`]: [12, 0, 0], [`${s}Foot`]: [-6, 0, 0] }, 0.05) });
  const down = (s: Side): Pose => ({ ...stride(s, { [`${s}UpLeg`]: [-14, 0, 0], [`${s}Leg`]: [20, 0, 0] }, 0), feet: both(0.11, ANKLE, 0.04), hipsY: -0.02 });
  return inPlace(scene, sk, 'ex_b_skip', 1.6, [stride('Left', kneeUp('Left'), 0.05), reach('Left'), down('Left'), stride('Right', kneeUp('Right'), 0.05), reach('Right'), down('Right')]);
}

// ── jumps ──────────────────────────────────────────────────────────────────────────────────────────────────────────
/** A two-foot jump (exercise.ts ex_jump's dip, drive and soft landing) with `flight` the shape held at the top. */
function jump(scene: Scene, sk: Skeleton, name: string, flight: Pose): AnimationGroup | null {
  const stand: Pose = { bones: { ...STAND }, feet: both(0.13, ANKLE, 0.08), hands: HANG, poles: HANG_POLES, hipsY: 0 };
  const dip: Pose = { bones: { Hips: [24, 0, 0], Spine: [12, 0, 0], Neck: [-14, 0, 0], LeftFoot: [-22, 0, 0], RightFoot: [-22, 0, 0] }, feet: both(0.13, ANKLE, 0.08), kneePoles: bothDir(0.15, 0, 1), hands: both(0.26, 0.62, -0.30), poles: bothDir(0.3, 0.3, -0.9), hipsY: -0.28 };
  // (the take-off keeps its ankles on targets just off the floor: a free foot pointing as the hips rise put its toes through it)
  const off: Pose = { bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], LeftFoot: [34, 0, 0], RightFoot: [34, 0, 0] }, feet: both(0.13, ANKLE + 0.14, 0.06), kneePoles: bothDir(0.1, 0, 1), hands: both(0.20, 2.15, 0.12), poles: bothDir(0.9, 0.1, -0.3), hipsY: 0.10 };
  const land: Pose = { ...dip, bones: { ...dip.bones, Hips: [20, 0, 0], Spine: [10, 0, 0] }, hands: both(0.26, 0.70, 0.34), poles: HANG_POLES, hipsY: -0.22 };
  return loop(scene, sk, name, 2.2, [at(stand, 0, true), at(dip, 0.45, true), at(off, 0.66), at(flight, 0.9, true), at({ ...off, hipsY: 0.08 }, 1.14), at(land, 1.36, true), at(stand, 1.8)]);
}
const TUCK: Pose = { bones: { Hips: [-4, 0, 0], Spine: [10, 0, 0], LeftUpLeg: [-108, 0, 6], RightUpLeg: [-108, 0, -6], LeftLeg: [118, 0, 0], RightLeg: [118, 0, 0], LeftFoot: [20, 0, 0], RightFoot: [20, 0, 0] }, hands: both(0.20, 1.26 + 0.28, 0.34), poles: bothDir(0.8, -0.4, 0), hipsY: 0.28 };
const STAR: Pose = { bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], LeftUpLeg: [0, 0, 30], RightUpLeg: [0, 0, -30], LeftLeg: [4, 0, 0], RightLeg: [4, 0, 0], LeftFoot: [30, 0, 0], RightFoot: [30, 0, 0] }, hands: both(0.72, 1.86 + 0.22, 0.06), poles: bothDir(0.3, 0.5, -0.8), hipsY: 0.22 };

/** ex_split_jump — from a split-squat bottom, jump and switch the legs in the air, land in the other split, and back. */
function splitJump(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const low = (front: Side): Pose => {
    const back = other(front);
    return { bones: { Hips: [4, 0, 0], Spine: [4, 0, 0], [`${back}Foot`]: [-6, 0, 0], [`${front}Foot`]: [-14, 0, 0] } as Record<string, Deg3>, feet: { [front]: [sx(front, 0.13), ANKLE, 0.30], [back]: [sx(back, 0.13), 0.15, -0.36] } as Pair, kneePoles: { [front]: [sx(front, 0.1), 0, 1], [back]: [0, -1, 0.3] } as Pair, rel: { [front]: [sx(front, 0.0), -0.40, -0.16], [back]: [sx(back, -0.02), -0.20, 0.26] } as Pair, poles: bothDir(0.2, -1, 0), hipsY: -0.40 };
  };
  const air: Pose = { bones: { Hips: [0, 0, 0], Spine: [0, 0, 0], LeftUpLeg: [-10, 0, 0], RightUpLeg: [-10, 0, 0], LeftLeg: [20, 0, 0], RightLeg: [20, 0, 0], LeftFoot: [20, 0, 0], RightFoot: [20, 0, 0] }, rel: { Left: [0.04, -0.12, 0.30], Right: [-0.04, -0.12, 0.30] }, poles: bothDir(0.2, -1, 0), hipsY: 0.10 };
  return loop(scene, sk, 'ex_split_jump', 2.2, [at(low('Left'), 0, true), at(low('Left'), 0.3, true), at(air, 0.6), at(low('Right'), 1.1, true), at(low('Right'), 1.4, true), at(air, 1.7)]);
}

/** ex_sl_jump — a one-leg vertical jump: on the left, the right knee up; dip, jump, land soft on the same foot. */
function slJump(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const free = { RightUpLeg: [-48, 0, 0] as Deg3, RightLeg: [80, 0, 0] as Deg3, RightFoot: [20, 0, 0] as Deg3 };
  const stand: Pose = { bones: { ...STAND, ...free }, feet: { Left: [-0.08, ANKLE, 0.06] }, kneePoles: bothDir(0, 0, 1), hands: HANG, poles: HANG_POLES, hipsY: 0 };
  const dip: Pose = { ...stand, bones: { Hips: [22, 0, 0], Spine: [10, 0, 0], Neck: [-12, 0, 0], LeftFoot: [-20, 0, 0], ...free }, hands: both(0.26, 0.66, -0.26), poles: bothDir(0.3, 0.3, -0.9), hipsY: -0.20 };
  const air: Pose = { bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], LeftUpLeg: [-4, 0, 0], LeftLeg: [4, 0, 0], LeftFoot: [30, 0, 0], RightUpLeg: [-70, 0, 0], RightLeg: [90, 0, 0], RightFoot: [20, 0, 0] }, hands: both(0.20, 2.0 + 0.18, 0.12), poles: bothDir(0.9, 0.1, -0.3), hipsY: 0.18 };
  return loop(scene, sk, 'ex_sl_jump', 2.2, [at(stand, 0, true), at(dip, 0.45, true), at(air, 0.8, true), at({ ...dip, hipsY: -0.16 }, 1.25, true), at(stand, 1.7)]);
}

/** Hops: two feet (or one) leaving and landing, `places` the spots they land on in turn (x, z offsets of the hips). */
function hops(scene: Scene, sk: Skeleton, name: string, places: [number, number][], oneLeg: boolean, height: number, period: number): AnimationGroup | null {
  const keys: ExKey[] = [];
  const n = places.length;
  places.forEach(([x, z], i) => {
    const t = (period * i) / n;
    const feet: Pair = oneLeg ? { Left: [x - 0.08, ANKLE, z + 0.06] } : { Left: [x - 0.13, ANKLE, z + 0.08], Right: [x + 0.13, ANKLE, z + 0.08] };
    const free: Record<string, Deg3> = oneLeg ? { RightUpLeg: [-40, 0, 0], RightLeg: [76, 0, 0], RightFoot: [20, 0, 0] } : {};
    keys.push({ t, bones: { Hips: [8, 0, 0], Spine: [4, 0, 0], ...free, LeftFoot: [-10, 0, 0], ...(oneLeg ? {} : { RightFoot: [-10, 0, 0] }) }, feet, kneePoles: bothDir(0.1, 0, 1), rel: { Left: [0.0, -0.36, 0.14], Right: [0.0, -0.36, 0.14] }, poles: bothDir(0.3, -0.6, -0.6), hipsY: -0.10, hipsX: x, hipsZ: z, hold: true });
    const [nx, nz] = places[(i + 1) % n];
    keys.push({ t: t + period / n / 2, bones: { Hips: [2, 0, 0], Spine: [2, 0, 0], ...free, LeftUpLeg: [-6, 0, 0], LeftLeg: [10, 0, 0], LeftFoot: [26, 0, 0], ...(oneLeg ? {} : { RightUpLeg: [-6, 0, 0], RightLeg: [10, 0, 0], RightFoot: [26, 0, 0] }) }, rel: { Left: [0.0, -0.30, 0.18], Right: [0.0, -0.30, 0.18] }, poles: bothDir(0.3, -0.6, -0.6), hipsY: height, hipsX: (x + nx) / 2, hipsZ: (z + nz) / 2 });
  });
  return loop(scene, sk, name, period, keys);
}

/** ex_lateral_bound — the skater bound: from one leg to the other a body-width and more apart, landing soft on the outside
 *  leg with the other trailing behind it, the arms swinging across. */
function lateralBound(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const land = (s: Side): Pose => {
    const o = other(s), x = sx(s, 0.42);
    return {
      bones: { Hips: [26, sx(s, 10), 0], Spine: [10, 0, 0], Neck: [-12, 0, 0], [`${o}UpLeg`]: [18, 0, sx(o, -18)], [`${o}Leg`]: [70, 0, 0], [`${o}Foot`]: [30, 0, 0], [`${s}Foot`]: [-18, 0, 0] } as Record<string, Deg3>,
      feet: { [s]: [x + sx(s, 0.06), ANKLE, 0.06] } as Pair, kneePoles: { [s]: [sx(s, 0.2), 0, 1] } as Pair,
      rel: { [o]: [sx(o, -0.30), -0.30, 0.26], [s]: [sx(s, 0.06), -0.42, -0.18] } as Pair, poles: bothDir(0.3, -0.6, -0.6), hipsY: -0.30, hipsX: x,
    };
  };
  const air: Pose = { bones: { Hips: [8, 0, 0], Spine: [4, 0, 0], LeftUpLeg: [-14, 0, 6], RightUpLeg: [-14, 0, -6], LeftLeg: [30, 0, 0], RightLeg: [30, 0, 0], LeftFoot: [20, 0, 0], RightFoot: [20, 0, 0] }, rel: { Left: [0.0, -0.36, 0.10], Right: [0.0, -0.36, 0.10] }, poles: bothDir(0.3, -0.6, -0.6), hipsY: 0.06, hipsX: 0 };
  return loop(scene, sk, 'ex_lateral_bound', 2.0, [at(land('Right'), 0, true), at(land('Right'), 0.35, true), at(air, 0.65), at(land('Left'), 1.0, true), at(land('Left'), 1.35, true), at(air, 1.65)]);
}

// ── rope jumping footwork (the hands turning the rope low at the hips, as exercise.ts ex_jump_rope) ─────────────────
type RopeStep = { feet: Pair; bones?: Record<string, Deg3>; hipsX?: number; hipsZ?: number };
/** A rope loop: each step is a contact (its feet), a turn of the rope between contacts; `turns` turns per contact (2: double under). */
function rope(scene: Scene, sk: Skeleton, name: string, steps: RopeStep[], hop: number, turns = 1): AnimationGroup | null {
  const per = 0.5, keys: ExKey[] = [];
  const hand = (a: number, lift: number): Pair => both(0.32 + 0.04 * Math.cos(a), 0.92 + 0.05 * Math.sin(a) + lift, 0.10 + 0.05 * Math.cos(a));
  steps.forEach((st, i) => {
    const t0 = i * per;
    keys.push({ t: t0, bones: { ...STAND, Hips: [3, 0, 0], ...(st.bones ?? {}) }, feet: st.feet, kneePoles: bothDir(0.1, 0, 1), hands: hand(0, -0.04), poles: bothDir(0.15, -0.4, -1), hipsY: -0.04, ...(st.hipsX ? { hipsX: st.hipsX } : {}), ...(st.hipsZ ? { hipsZ: st.hipsZ } : {}) });
    const n = steps[(i + 1) % steps.length];
    const mx = ((st.hipsX ?? 0) + (n.hipsX ?? 0)) / 2, mz = ((st.hipsZ ?? 0) + (n.hipsZ ?? 0)) / 2;
    for (const f of [0.25, 0.5, 0.75]) {
      const a = 2 * Math.PI * turns * f;
      keys.push({ t: t0 + per * f, bones: { ...STAND, LeftUpLeg: [-3, 0, 3], RightUpLeg: [-3, 0, -3], LeftLeg: [5, 0, 0], RightLeg: [5, 0, 0], LeftFoot: [24, 0, 0], RightFoot: [24, 0, 0], ...(st.bones ?? {}) }, hands: hand(a, hop * Math.sin(Math.PI * f)), poles: bothDir(0.15, -0.4, -1), hipsY: hop * Math.sin(Math.PI * f), ...(mx ? { hipsX: mx } : {}), ...(mz ? { hipsZ: mz } : {}) });
    }
  });
  return loop(scene, sk, name, steps.length * per, keys);
}
const TWO: Pair = both(0.13, ANKLE, 0.08);
const ONE = (s: Side): Pair => ({ [s]: [sx(s, 0.10), ANKLE, 0.06] }) as Pair;
const LIFTED = (s: Side, knee = false): Record<string, Deg3> => (knee ? kneeUp(s, 0.95) : { [`${s}UpLeg`]: [-14, 0, 0], [`${s}Leg`]: [60, 0, 0], [`${s}Foot`]: [20, 0, 0] });

// ── crawls (in place: the limbs walk, the body held where the stage sees it) ──────────────────────────────────────────
/** A diagonal crawl: the right hand and left foot step forward together while the other two push back, then the other pair. */
function crawl(scene: Scene, sk: Skeleton, name: string, base: Pose, stride: number): AnimationGroup | null {
  const shift = (p: Pair | undefined, d: Partial<Record<Side, number>>): Pair => Object.fromEntries(Object.entries(p ?? {}).map(([s, v]) => [s, [v[0], v[1], v[2] + (d[s as Side] ?? 0)]])) as Pair;
  const phase = (fwd: Side): Pose => {
    const back = other(fwd);
    return { ...base, hands: shift(base.hands, { [fwd]: stride / 2, [back]: -stride / 2 }), feet: shift(base.feet, { [back]: stride / 2, [fwd]: -stride / 2 }) };
  };
  return run(scene, sk, name, 1.4, [at(phase('Right'), 0, true), at(phase('Left'), 0.7, true)], true);
}
const LEOPARD: Pose = { ...BEAR, bones: { ...BEAR.bones, Neck: [-40, 0, 0] }, feet: both(0.20, TOE_ANKLE + 0.02, -0.40), hands: both(0.26, 0.05, 0.56), hipsY: -0.44 };
/** The crab: face up, hands on the floor behind, feet flat in front, the hips lifted off the floor. */
const CRAB: Pose = { bones: { Hips: [-48, 0, 0], Spine: [-6, 0, 0], Neck: [14, 0, 0] }, feet: both(0.17, ANKLE, 0.42), kneePoles: bothDir(0.2, 1, 0.4), hands: both(0.22, 0.05, -0.38), poles: bothDir(0.3, 0, -1), hipsY: -0.56 };
/** ex_crab_reach — from the crab, the hips drive up as one hand reaches up and over to the other side; back down; the other hand. */
function crabReach(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const reach = (s: Side): Pose => ({ ...CRAB, bones: { Hips: [-76, 0, 0], Spine: [-10, sx(s, -20), 0], Neck: [10, 0, 0] }, hands: { [other(s)]: CRAB.hands![other(s)], [s]: [sx(other(s), 0.30), 0.86, -0.48] } as Pair, hipsY: -0.48 });
  return run(scene, sk, 'ex_crab_reach', 3.2, [at(CRAB, 0, true), at(reach('Left'), 0.8, true), at(CRAB, 1.6, true), at(reach('Right'), 2.4, true)], true);
}

export const BODY_BUILDERS: readonly [string, Builder][] = [
  ['ex_lateral_lunge', lateralLunge], ['ex_curtsy_lunge', curtsyLunge], ['ex_sumo_deadlift', sumoDeadlift], ['ex_sl_rdl', slRdl], ['ex_kickstand_rdl', kickstandRdl],
  ['ex_reverse_crunch', reverseCrunch], ['ex_situp', (scene, sk) => situp(scene, sk, 'ex_situp', -8)], ['ex_situp_34', (scene, sk) => situp(scene, sk, 'ex_situp_34', -40)],
  ['ex_bicycle', bicycle], ['ex_heel_touch', heelTouch], ['ex_flutter', flutter], ['ex_toe_touch', toeTouch], ['ex_vup', vup],
  ['ex_hollow', (scene, sk) => hollowHold(scene, sk, 'ex_hollow', HOLLOW)], ['ex_hollow_tuck', (scene, sk) => hollowHold(scene, sk, 'ex_hollow_tuck', HOLLOW_TUCK)], ['ex_hollow_rock', hollowRock],
  ['ex_dead_bug_heel', deadBugHeel],
  ...(([['forearm', FOREARM], ['high', HIGH], ['bear', BEAR]] as const).flatMap(([n, b]) => (['leg', 'reach', 'knee'] as const).map((a): [string, Builder] => [`ex_plank_${n}_${a}`, (scene, sk) => plankAct(scene, sk, `ex_plank_${n}_${a}`, b, a)]))),
  ['ex_shoulder_tap', (scene, sk) => plankAct(scene, sk, 'ex_shoulder_tap', HIGH, 'tap')], ['ex_bear_tap', (scene, sk) => plankAct(scene, sk, 'ex_bear_tap', BEAR, 'tap')],
  ['ex_side_plank', (scene, sk) => sidePlank(scene, sk, 'ex_side_plank', false)], ['ex_side_plank_leg', (scene, sk) => sidePlank(scene, sk, 'ex_side_plank_leg', true)],
  ['ex_squat_thrust', (scene, sk) => burpee(scene, sk, 'ex_squat_thrust', false)], ['ex_burpee', (scene, sk) => burpee(scene, sk, 'ex_burpee', true)], ['ex_seal_jack', sealJack],
  ['ex_high_knees', highKnees], ['ex_butt_kicks', buttKicks], ['ex_a_skip', (scene, sk) => skip(scene, sk, 'ex_a_skip', 0.06)], ['ex_power_skip', (scene, sk) => skip(scene, sk, 'ex_power_skip', 0.22)], ['ex_b_skip', bSkip],
  ['ex_tuck_jump', (scene, sk) => jump(scene, sk, 'ex_tuck_jump', TUCK)], ['ex_star_jump', (scene, sk) => jump(scene, sk, 'ex_star_jump', STAR)], ['ex_split_jump', splitJump], ['ex_sl_jump', slJump],
  ['ex_pogo_fb', (scene, sk) => hops(scene, sk, 'ex_pogo_fb', [[0, 0.12], [0, -0.12]], false, 0.10, 0.9)],
  ['ex_pogo_lat', (scene, sk) => hops(scene, sk, 'ex_pogo_lat', [[0.14, 0], [-0.14, 0]], false, 0.10, 0.9)],
  ['ex_pogo_sl', (scene, sk) => hops(scene, sk, 'ex_pogo_sl', [[0, 0], [0, 0]], true, 0.08, 0.9)],
  ['ex_lateral_hops', (scene, sk) => hops(scene, sk, 'ex_lateral_hops', [[0.24, 0], [-0.24, 0]], false, 0.18, 1.2)],
  ['ex_lateral_hops_sl', (scene, sk) => hops(scene, sk, 'ex_lateral_hops_sl', [[0.20, 0], [-0.20, 0]], true, 0.14, 1.3)],
  ['ex_lateral_bound', lateralBound],
  ['ex_rope_alt', (scene, sk) => rope(scene, sk, 'ex_rope_alt', [{ feet: ONE('Left'), bones: LIFTED('Right') }, { feet: ONE('Right'), bones: LIFTED('Left') }], 0.05)],
  ['ex_rope_highknee', (scene, sk) => rope(scene, sk, 'ex_rope_highknee', [{ feet: ONE('Left'), bones: LIFTED('Right', true) }, { feet: ONE('Right'), bones: LIFTED('Left', true) }], 0.06)],
  ['ex_rope_sl', (scene, sk) => rope(scene, sk, 'ex_rope_sl', [{ feet: ONE('Left'), bones: LIFTED('Right') }], 0.07)],
  ['ex_rope_side', (scene, sk) => rope(scene, sk, 'ex_rope_side', [{ feet: both(0.13, ANKLE, 0.08), hipsX: 0.12 }, { feet: both(0.13, ANKLE, 0.08), hipsX: -0.12 }].map((s) => ({ ...s, feet: Object.fromEntries(Object.entries(s.feet).map(([k, v]) => [k, [v[0] + s.hipsX, v[1], v[2]]])) as Pair })), 0.07)],
  ['ex_rope_fb', (scene, sk) => rope(scene, sk, 'ex_rope_fb', [{ feet: both(0.13, ANKLE, 0.20), hipsZ: 0.12 }, { feet: both(0.13, ANKLE, -0.04), hipsZ: -0.12 }], 0.07)],
  ['ex_rope_double', (scene, sk) => rope(scene, sk, 'ex_rope_double', [{ feet: TWO }], 0.18, 2)],
  ['ex_rope_boxer', (scene, sk) => rope(scene, sk, 'ex_rope_boxer', [{ feet: { Left: [-0.13, ANKLE, 0.08], Right: [0.15, ANKLE + 0.05, 0.04] }, bones: { RightFoot: [30, 0, 0] } }, { feet: { Right: [0.13, ANKLE, 0.08], Left: [-0.15, ANKLE + 0.05, 0.04] }, bones: { LeftFoot: [30, 0, 0] } }], 0.04)],
  ['ex_rope_scissor', (scene, sk) => rope(scene, sk, 'ex_rope_scissor', [{ feet: { Left: [-0.13, ANKLE, 0.22], Right: [0.13, ANKLE + 0.02, -0.10] } }, { feet: { Right: [0.13, ANKLE, 0.22], Left: [-0.13, ANKLE + 0.02, -0.10] } }], 0.07)],
  ['ex_rope_wide', (scene, sk) => rope(scene, sk, 'ex_rope_wide', [{ feet: both(0.30, ANKLE, 0.08) }, { feet: both(0.10, ANKLE, 0.08) }], 0.07)],
  ['ex_bear_crawl', (scene, sk) => crawl(scene, sk, 'ex_bear_crawl', BEAR, 0.22)],
  ['ex_leopard_crawl', (scene, sk) => crawl(scene, sk, 'ex_leopard_crawl', LEOPARD, 0.24)],
  ['ex_crab_walk', (scene, sk) => crawl(scene, sk, 'ex_crab_walk', CRAB, -0.20)],
  ['ex_crab_reach', crabReach],
];
