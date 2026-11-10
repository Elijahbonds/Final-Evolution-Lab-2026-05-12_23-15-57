// DEMO-LOOPS-9 (2026-11-03): the next measured gaps — jumps, the foam roller, the battle ropes, the medicine ball's throws,
// squats and rows — each read against the movement its entry was imported as (free-exercise-db). (The kettlebell's
// cleans, jerks and snatches are in exerciseFamilies.ts beside the others.) Same kit and pipeline as the library's loops:
// GATE 0 on every body is poseGuard.test.ts, the floor and the closed seam exercise.test.ts.
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import {
  ANKLE, HIGH_PLANK, KNEES_OUT, SQUAT_FEET, STAND, TOE_ANKLE, both, bothDir, rep, seat,
  type Deg3, type ExKey, type Pair, type V3,
} from './exerciseKit';
import { kneel, KNEEL_Y, alternating } from './exerciseMore';
import { run, at } from './exerciseBody';
import { SUPINE } from './exerciseFloor';
import { DIPPED, FLIGHT, LANDED, PUSH, STANDING, legs, walkBack } from './exerciseSignature';
import { SEATED_ROW } from './exerciseVariants';

type Pose = Omit<ExKey, 't'>;
type Builder = (scene: Scene, sk: Skeleton) => AnimationGroup | null;

/** Kneeling with the down shins on targets (exerciseMore kneel()'s legs keyed as ankles behind the knees instead of bone
 *  angles): a loop that moves between kneeling and an IK-legged pose then blends target to target, where blending a keyed
 *  knee into a solved one swung the feet through the floor (measured). */
const kneelIK = (p: Pose, down: readonly ('Left' | 'Right')[]): Pose => {
  const k = kneel(p, down);
  const feet: Pair = { ...(k.feet ?? {}) }, kneePoles: Pair = { ...(k.kneePoles ?? {}) };
  for (const s of down) { feet[s] = [s === 'Left' ? -0.11 : 0.11, 0.07, -0.38]; kneePoles[s] = [s === 'Left' ? -0.05 : 0.05, -0.3, 1]; }
  return { ...k, feet, kneePoles };
};

// ── jumps ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** ex_box_jump_lat — standing beside a low box (demo.ts PROP_SHAPES boxside, at the right): a quick quarter dip and a jump up
 *  and sideways, the knees high to clear its edge, landing soft in the middle of it; stand, and step back down. */
const boxJumpLat: Builder = (scene, sk) => {
  const top = 0.40, xb = 0.45, zb = 0.04;
  const air: Pose = { ...FLIGHT(zb, top + 0.12, xb * 0.5), bones: { Hips: [6, 0, 0], Spine: [0, 0, 0], ...legs(-56, 84), LeftFoot: [20, 0, 0], RightFoot: [20, 0, 0] } };
  const down: Pose = { ...STANDING(zb, xb, top), feet: { Left: [0.02, ANKLE, zb], Right: [xb + 0.12, ANKLE + top, zb] }, hipsY: top - 0.24, hipsX: xb - 0.20 };
  return run(scene, sk, 'ex_box_jump_lat', 4.4, [
    at(STANDING(zb), 0, true), at(DIPPED(zb), 0.45, true), at(PUSH(zb), 0.6), at(air, 0.82), at(LANDED(zb, xb, top), 1.05, true), at(LANDED(zb, xb, top), 1.45, true),
    at(STANDING(zb, xb, top), 1.9, true), at(down, 2.6, true), at(STANDING(zb, 0.02), 3.3, true), at(STANDING(zb), 3.8, true),
  ]);
};

/** ex_hurdle_hops — feet shoulder-width: two-foot hops forward over a row of low hurdles, the knees tucked over each one, the
 *  arms swinging, each landing soft and straight into the next take-off; three, then walk back. */
const hurdleHops: Builder = (scene, sk) => {
  const d = 0.62;
  const air = (z: number): Pose => ({ ...FLIGHT(z, 0.28), bones: { Hips: [8, 0, 0], Spine: [4, 0, 0], ...legs(-74, 104), LeftFoot: [18, 0, 0], RightFoot: [18, 0, 0] } });
  const keys: ExKey[] = [at(STANDING(0), 0, true), at(DIPPED(0), 0.45, true)];
  let t = 0.45;
  for (let i = 0; i < 3; i++) {
    const z0 = i * d;
    keys.push(at(PUSH(z0 + 0.04), t + 0.14), at(air(z0 + d / 2), t + 0.34), at(LANDED(z0 + d), t + 0.56, true));
    t += 0.56;
  }
  keys.push(at(LANDED(3 * d), t + 0.4, true), at(STANDING(3 * d), t + 0.8, true), ...walkBack(3 * d, t + 0.8));
  const end = (keys[keys.length - 1] as ExKey).t;
  return run(scene, sk, 'ex_hurdle_hops', end + 0.4, keys);
};

/** ex_side_long_jump — an athletic stance: leaning to the right, a dip and a long jump sideways to the right, the arms
 *  leading, landing facing the same way on both feet, held; then walk back. */
const sideLongJump: Builder = (scene, sk) => {
  const d = 0.80;
  const dip: Pose = { ...DIPPED(0.04), bones: { Hips: [24, 0, -6], Spine: [10, 0, -6], Neck: [-12, 0, 4], LeftFoot: [-20, 0, 0], RightFoot: [-20, 0, 0] }, hipsX: -0.04 };
  const push: Pose = { ...PUSH(0.04), bones: { Hips: [8, 0, 10], Spine: [2, 0, 6], LeftFoot: [12, 0, 0], RightFoot: [12, 0, 0] }, hands: { Left: [0.10, 1.20, 0.22], Right: [0.50, 1.30, 0.20] }, hipsX: 0.08 };
  return run(scene, sk, 'ex_side_long_jump', 5.2, [
    at(STANDING(0.04), 0, true), at(dip, 0.45, true), at(push, 0.6), at(FLIGHT(0.04, 0.18, d * 0.5), 0.82), at(LANDED(0.04, d), 1.06, true), at(LANDED(0.04, d), 1.8, true),
    at(STANDING(0.04, d), 2.2, true), ...walkBack(0.04, 2.2, 0.3, 0.45, d),
  ]);
};

/** ex_kneel_jump_squat — tall kneeling, the hands at the chest: the hips sit back to the heels, then explode up off the
 *  knees to land with both feet flat in a squat; stand, and step back down onto the knees. */
const kneelJumpSquat: Builder = (scene, sk) => {
  const rel: Pair = { Left: [0.10, -0.20, 0.24], Right: [-0.10, -0.20, 0.24] }, poles = bothDir(0.3, -1, 0);
  const tall: Pose = kneelIK({ bones: { Hips: [0, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0] }, rel, poles, hipsY: 0 }, ['Left', 'Right']);
  // (the knees stay on the floor and the ankles behind them: the shins on targets, the knees pointed down and forward)
  const back: Pose = { bones: { Hips: [26, 0, 0], Spine: [6, 0, 0], Neck: [-14, 0, 0], LeftFoot: [62, 0, 0], RightFoot: [62, 0, 0] }, feet: both(0.11, 0.08, -0.38), kneePoles: bothDir(0.05, 0.2, 1), rel: { Left: [0.12, -0.44, -0.14], Right: [-0.12, -0.44, -0.14] }, poles: bothDir(0.3, 0, -1), hipsY: -0.66, hipsZ: -0.36 };
  // the pop: the hips drive up first, the shins folded up behind, before the legs swing through under the body
  const pop: Pose = { bones: { Hips: [10, 0, 0], Spine: [2, 0, 0], Neck: [-6, 0, 0], LeftUpLeg: [-40, 0, 3], RightUpLeg: [-40, 0, -3], LeftLeg: [150, 0, 0], RightLeg: [150, 0, 0], LeftFoot: [50, 0, 0], RightFoot: [50, 0, 0] }, rel: { Left: [0.08, -0.16, 0.34], Right: [-0.08, -0.16, 0.34] }, poles: bothDir(0.3, -1, 0), hipsY: -0.26, hipsZ: -0.14 };
  const air: Pose = { bones: { Hips: [14, 0, 0], Spine: [2, 0, 0], Neck: [-6, 0, 0], ...legs(-84, 112), LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] }, rel: { Left: [0.08, -0.10, 0.36], Right: [-0.08, -0.10, 0.36] }, poles: bothDir(0.3, -1, 0), hipsY: -0.30, hipsZ: -0.10 };
  const squat: Pose = { bones: { Hips: [28, 0, 0], Spine: [8, 0, 0], Neck: [-18, 0, 0], LeftFoot: [-30, 0, 0], RightFoot: [-30, 0, 0] }, feet: both(0.20, ANKLE, 0.02), kneePoles: bothDir(0.35, 0, 1), rel: { Left: [0.12, -0.24, 0.30], Right: [-0.12, -0.24, 0.30] }, poles: bothDir(0.3, -1, 0), hipsY: -0.44, hipsZ: -0.10 };
  const stand: Pose = { bones: { ...STAND }, feet: both(0.15, ANKLE, 0.02), kneePoles: bothDir(0.1, 0, 1), rel, poles, hipsY: 0, hipsZ: -0.04 };
  const half: Pose = kneelIK({ bones: { Hips: [4, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0] }, rel, poles, hipsY: 0 }, ['Right']);
  return run(scene, sk, 'ex_kneel_jump_squat', 5.0, [
    at(tall, 0, true), at(back, 0.7, true), at(back, 0.9, true), at(pop, 1.02), at(air, 1.16), at(squat, 1.36, true), at(squat, 1.7, true), at(stand, 2.4, true), at(stand, 2.8, true),
    at({ ...half, hipsY: KNEEL_Y + 0.12 }, 3.5), at(half, 3.9, true), at(tall, 4.5, true),
  ], true);
};

// ── the foam roller (demo.ts PROP_SHAPES roller…: the roller stays put, the body rolls over it) ─────────────────────

/** ex_hamstring_smr — sitting, the legs long over the roller under the backs of the thighs, the hands on the floor behind:
 *  the hips lift and the body rolls back and forth from just under the seat to just above the knees. */
const hamstringSmr: Builder = (scene, sk) => {
  const p = (u: number): Pose => ({
    bones: { Hips: [-50, 0, 0], Spine: [10, 0, 0], Neck: [18, 0, 0], LeftFoot: [20, 0, 0], RightFoot: [20, 0, 0] },
    feet: both(0.11, 0.12, 0.96 - u * 0.20), kneePoles: bothDir(0, 1, 0.1), handsAt: both(0.22, 0.06, -0.30 - u * 0.20), poles: bothDir(0.3, 0, -1), hipsY: -0.70, hipsZ: -u * 0.20,
  });
  return run(scene, sk, 'ex_hamstring_smr', 3.4, [at(p(0), 0, true), at(p(1), 1.6, true)], true);
};
/** ex_quad_smr — face down on the forearms, the roller under the fronts of the thighs, the feet off the floor: the body
 *  slides forward and back so the roller travels from above the knees to the hips. */
const quadSmr: Builder = (scene, sk) => {
  const p = (u: number): Pose => ({
    bones: { Hips: [76, 0, 0], Spine: [-4, 0, 0], Neck: [-26, 0, 0], LeftFoot: [40, 0, 0], RightFoot: [40, 0, 0] },
    feet: both(0.11, 0.16, -0.84 + u * 0.22), kneePoles: bothDir(0, -1, 0), handsAt: both(0.16, 0.05, 0.44 + u * 0.22), poles: bothDir(0.4, -1, -0.3), hipsY: -0.70, hipsZ: u * 0.22,
  });
  return run(scene, sk, 'ex_quad_smr', 3.4, [at(p(0), 0, true), at(p(1), 1.6, true)], true);
};
/** ex_upper_back_smr (the rhomboids) — on the back, knees bent, the roller under the upper back, the arms crossed to open the
 *  shoulder blades: the hips lift and the body rolls the roller up and down the mid and upper back. */
const upperBackSmr: Builder = (scene, sk) => {
  const crossed: Pair = { Left: [0.30, 0.04, 0.12], Right: [-0.30, 0.06, 0.14] };
  const p = (u: number): Pose => ({
    bones: { Hips: [-74, 0, 0], Spine: [-4, 0, 0], Neck: [14, 0, 0] },
    feet: both(0.16, ANKLE, 0.42 + u * 0.16), kneePoles: bothDir(0.1, 1, 0.3), rel: crossed, poles: bothDir(-0.2, -0.3, 1), hipsY: -0.56, hipsZ: u * 0.16,
  });
  return run(scene, sk, 'ex_upper_back_smr', 3.4, [at(p(0), 0, true), at(p(1), 1.6, true)], true);
};
/** ex_lower_back_smr — sitting back onto the roller under the low back, knees bent, the arms crossed: the hips lift and the
 *  weight shifts to one side of the spine and then the other (never on the spine itself), with small rolls. */
const lowerBackSmr: Builder = (scene, sk) => {
  const crossed: Pair = { Left: [0.30, 0.04, 0.12], Right: [-0.30, 0.06, 0.14] };
  const p = (side: number, u: number): Pose => ({
    bones: { Hips: [-62, side * 14, 0], Spine: [6, -side * 8, 0], Neck: [10, 0, 0] },
    feet: both(0.17, ANKLE, 0.44 + u * 0.08), kneePoles: bothDir(0.1, 1, 0.3), rel: crossed, poles: bothDir(-0.2, -0.3, 1), hipsY: -0.62, hipsZ: u * 0.08,
  });
  return run(scene, sk, 'ex_lower_back_smr', 5.2, [at(p(0, 0), 0, true), at(p(1, 0), 0.8, true), at(p(1, 1), 1.6, true), at(p(1, 0), 2.4, true), at(p(-1, 0), 3.2, true), at(p(-1, 1), 4.0, true), at(p(-1, 0), 4.6, true)], true);
};

// ── the battle ropes ──────────────────────────────────────────────────────────────────────────────────────────────

/** ex_battle_ropes — an athletic half squat, a rope end in each hand: the arms whip up and down in turn, as fast as they
 *  can, one up to shoulder height as the other drops. */
const battleRopes: Builder = (scene, sk) => {
  const base: Pose = { bones: { Hips: [22, 0, 0], Spine: [6, 0, 0], Neck: [-14, 0, 0], LeftFoot: [-18, 0, 0], RightFoot: [-18, 0, 0] }, feet: both(0.22, ANKLE, 0.10), kneePoles: bothDir(0.3, 0, 1), hipsY: -0.22 };
  const up: V3 = [0.0, -0.04, 0.46], low: V3 = [0.0, -0.40, 0.32];
  const p = (s: 'Left' | 'Right'): Pose => ({ ...base, rel: s === 'Right' ? { Right: [-0.04, up[1], up[2]], Left: [0.04, low[1], low[2]] } : { Left: [0.04, up[1], up[2]], Right: [-0.04, low[1], low[2]] }, poles: bothDir(0.4, -1, -0.2) });
  return run(scene, sk, 'ex_battle_ropes', 1.2, [at(p('Right'), 0), at(p('Left'), 0.3), at(p('Right'), 0.6), at(p('Left'), 0.9)]);
};

// ── the medicine ball ─────────────────────────────────────────────────────────────────────────────────────────────

/** ex_chest_push_fall (the kneeling chest push) — tall kneeling, the ball tight at the chest: the hips drive forward and the
 *  ball is pushed out as hard as possible, the body following it down to catch itself on the hands; push back up to tall
 *  kneeling. */
const chestPushFall: Builder = (scene, sk) => {
  const chest: Pair = { Left: [0.08, -0.18, 0.16], Right: [-0.08, -0.18, 0.16] }, poles = bothDir(0.6, -0.8, 0);
  const tall: Pose = kneelIK({ bones: { Hips: [-2, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0] }, rel: chest, poles, hipsY: 0 }, ['Left', 'Right']);
  const load: Pose = kneelIK({ bones: { Hips: [-8, 0, 0], Spine: [-4, 0, 0], Neck: [2, 0, 0] }, rel: { Left: [0.08, -0.16, 0.10], Right: [-0.08, -0.16, 0.10] }, poles, hipsY: 0 }, ['Left', 'Right']);
  // (the knees stay on the floor where they knelt, the shins flat behind: on targets, the knees pointed down)
  const shins = { bones: { LeftFoot: [62, 0, 0] as Deg3, RightFoot: [62, 0, 0] as Deg3 }, feet: both(0.11, 0.07, -0.38), kneePoles: bothDir(0.05, -1, 0.3) };
  const release: Pose = { ...shins, bones: { Hips: [24, 0, 0], Spine: [0, 0, 0], Neck: [-14, 0, 0], ...shins.bones }, rel: { Left: [0.06, -0.06, 0.56], Right: [-0.06, -0.06, 0.56] }, poles: bothDir(0.4, -1, 0), hipsY: KNEEL_Y - 0.03, hipsZ: 0.08 };
  const caught: Pose = { ...shins, bones: { Hips: [64, 0, 0], Spine: [2, 0, 0], Neck: [-30, 0, 0], ...shins.bones }, hands: both(0.22, 0.05, 0.72), poles: bothDir(0.7, 0.2, -0.5), hipsY: -0.52, hipsZ: 0.18 };
  return run(scene, sk, 'ex_chest_push_fall', 4.4, [at(tall, 0, true), at(load, 0.5, true), at(release, 0.8), at(caught, 1.3, true), at(caught, 1.8, true), at(release, 2.6), at(tall, 3.4, true)], true);
};
/** ex_slam_one — a staggered stance, the ball in the right hand at the side of the back leg: the arm winds up overhead as the
 *  body rises onto the toes, then the trunk folds and the arm slams the ball into the floor in front; stand back up. */
const slamOne: Builder = (scene, sk) => {
  const feet: Pair = { Left: [-0.14, ANKLE, 0.20], Right: [0.14, ANKLE, -0.16] };
  const free: V3 = [0.04, -0.40, 0.14];
  const low: Pose = { bones: { Hips: [4, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0] }, feet, kneePoles: bothDir(0.1, 0, 1), rel: { Right: [0.0, -0.46, -0.08], Left: free }, poles: { Right: [0.3, 0, -1], Left: [-0.3, -0.4, -0.8] }, hipsY: -0.02 };
  const wind: Pose = { bones: { Hips: [-6, 0, 0], Spine: [-6, 0, 0], Neck: [6, 0, 0], LeftFoot: [8, 0, 0], RightFoot: [10, 0, 0] }, feet: { Left: [-0.14, ANKLE + 0.05, 0.20], Right: [0.14, ANKLE + 0.06, -0.16] }, kneePoles: bothDir(0.1, 0, 1), rel: { Right: [-0.02, 0.62, -0.10], Left: [0.04, 0.10, 0.30] }, poles: { Right: [0.8, 0.3, 0], Left: [-0.4, -1, 0] }, hipsY: 0.03 };
  const slam: Pose = { bones: { Hips: [44, 0, 0], Spine: [12, 0, 0], Neck: [-22, 0, 0], LeftFoot: [-26, 0, 0], RightFoot: [-22, 0, 0] }, feet, kneePoles: bothDir(0.2, 0, 1), rel: { Right: [-0.04, -0.52, 0.30], Left: [0.06, -0.40, 0.16] }, poles: { Right: [0.4, 0.4, -0.8], Left: [-0.3, -0.4, -0.8] }, hipsY: -0.26 };
  // (half way up the back foot's ankle is still flexed: a key there keeps its toes off the floor)
  const rising: Pose = { ...slam, bones: { Hips: [22, 0, 0], Spine: [6, 0, 0], Neck: [-10, 0, 0], LeftFoot: [-14, 0, 0], RightFoot: [-14, 0, 0] }, rel: { Right: [-0.02, -0.50, 0.12], Left: free }, hipsY: -0.12 };
  return run(scene, sk, 'ex_slam_one', 2.8, [at(low, 0, true), at(wind, 0.6, true), at(slam, 0.95, true), at(slam, 1.4, true), at(rising, 1.8), at(low, 2.2, true)], true);
};
/** The supine throws: on the back, knees bent, the feet flat. */
const SUP: Pose = { ...SUPINE, hands: undefined };
/** ex_supine_chest_throw — on the back, knees bent, the ball on the chest held from underneath: the arms punch it straight up
 *  as high as possible, catch it as it falls and bring it back to the chest. */
const supineChestThrow: Builder = (scene, sk) => {
  const chest: Pose = { ...SUP, rel: { Left: [0.10, 0.18, 0.10], Right: [-0.10, 0.18, 0.10] }, poles: bothDir(0.8, -0.6, 0) };
  const up: Pose = { ...SUP, rel: { Left: [0.08, 0.60, 0.02], Right: [-0.08, 0.60, 0.02] }, poles: bothDir(0.8, 0.2, 0) };
  return run(scene, sk, 'ex_supine_chest_throw', 3.0, [at(chest, 0, true), at(chest, 0.4, true), at(up, 0.65, true), at(up, 1.5, true), at(chest, 2.2, true)], true);
};
/** ex_supine_throw_one — on the back, knees bent, the ball in the right hand, the arm long behind the head on the floor: the arm
 *  whips over as the trunk curls up, throwing the ball forward for distance; lie back down and reach back again. */
const supineThrowOne: Builder = (scene, sk) => {
  const left: V3 = [0.10, 0.10, 0.20];
  const back: Pose = { ...SUP, rel: { Right: [0.0, 0.04, -0.58], Left: left }, poles: { Right: [0.3, 1, 0], Left: [-0.6, 0.3, 0] } };
  const mid: Pose = { ...SUP, bones: { ...SUP.bones, Hips: [-62, 0, 0], Spine: [12, 0, 0], Neck: [14, 0, 0] }, rel: { Right: [-0.02, 0.56, -0.04], Left: left }, poles: { Right: [0.8, 0.3, 0], Left: [-0.6, 0.3, 0] } };
  const up: Pose = { ...SUP, bones: { ...SUP.bones, Hips: [-40, 0, 0], Spine: [16, 0, 0], Neck: [6, 0, 0] }, rel: { Right: [-0.06, 0.04, 0.56], Left: [0.06, -0.20, 0.24] }, poles: { Right: [0.6, -0.6, 0], Left: [-0.6, -0.4, 0] } };
  return run(scene, sk, 'ex_supine_throw_one', 3.4, [at(back, 0, true), at(back, 0.4, true), at(mid, 0.62), at(up, 0.85, true), at(up, 1.4, true), at(mid, 2.1), at(back, 2.8, true)], true);
};

// ── squats ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The bar across the upper back (exercise.ts ex_squat_bar's hands and grip). */
const BAR: Pair = { Left: [-0.24, 0.02, -0.10], Right: [0.24, 0.02, -0.10] };
const GRIP: Record<string, Deg3> = { LeftHand: [0, 0, -85], RightHand: [0, 0, -85] };
/** ex_box_squat_bar — the bar on the back, a box behind (demo.ts PROP_SHAPES boxback): a wide stance, the hips sit back and down
 *  onto the box, the shins near vertical, a pause seated on it, then drive up off it. */
const boxSquatBar: Builder = (scene, sk) => {
  const feet = both(0.24, ANKLE, 0.08);
  const top: Pose = { bones: { ...STAND, ...GRIP, Hips: [4, 0, 0] }, feet, kneePoles: KNEES_OUT, rel: BAR, poles: bothDir(0.3, -1, -0.3), hipsY: 0 };
  const box: Pose = { bones: { ...GRIP, Hips: [34, 0, 0], Spine: [6, 0, 0], Neck: [-20, 0, 0], LeftFoot: [-14, 0, 0], RightFoot: [-14, 0, 0] }, feet, kneePoles: KNEES_OUT, rel: BAR, poles: bothDir(0.3, -1, -0.3), hipsY: -0.40, hipsZ: -0.26 };
  return run(scene, sk, 'ex_box_squat_bar', 3.4, [at(top, 0, true), at(box, 1.2, true), at(box, 1.7, true), at(top, 2.6, true)], true);
};
/** ex_frankenstein_squat — the bar resting across the fronts of the shoulders, no hands: the arms straight out in front at
 *  shoulder height, the elbows high; a full front squat, the trunk upright so the bar stays on its shelf. */
const frankenstein: Builder = (scene, sk) => rep(scene, sk, 'ex_frankenstein_squat',
  { bones: { ...STAND, Hips: [2, 0, 0] }, feet: SQUAT_FEET, kneePoles: KNEES_OUT, rel: { Left: [0.04, -0.02, 0.58], Right: [-0.04, -0.02, 0.58] }, poles: bothDir(0.3, -1, 0), hipsY: 0 },
  { bones: { Hips: [18, 0, 0], Spine: [4, 0, 0], Neck: [-10, 0, 0], LeftFoot: [-34, 0, 0], RightFoot: [-34, 0, 0] }, feet: SQUAT_FEET, kneePoles: KNEES_OUT, rel: { Left: [0.04, -0.02, 0.58], Right: [-0.04, -0.02, 0.58] }, poles: bothDir(0.3, -1, 0), hipsY: -0.46 },
  1.1, 0.3, 0.9, 0.4);
/** ex_kneel_squat — kneeling, the bar across the back: the hips sit back until the seat touches the calves, then drive forward
 *  to tall kneeling, the glutes squeezed. */
const kneelSquat: Builder = (scene, sk) => {
  const tall: Pose = kneelIK({ bones: { ...GRIP, Hips: [0, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0] }, rel: BAR, poles: bothDir(0.3, -1, -0.3), hipsY: 0 }, ['Left', 'Right']);
  // (the knees stay on the floor and the ankles behind them: the shins on targets, the knees pointed down and forward)
  const sit: Pose = { bones: { ...GRIP, Hips: [22, 0, 0], Spine: [4, 0, 0], Neck: [-12, 0, 0], LeftFoot: [62, 0, 0], RightFoot: [62, 0, 0] }, feet: both(0.11, 0.08, -0.38), kneePoles: bothDir(0.05, 0.2, 1), rel: BAR, poles: bothDir(0.3, -1, -0.3), hipsY: -0.66, hipsZ: -0.36 };
  return run(scene, sk, 'ex_kneel_squat', 3.0, [at(tall, 0, true), at(sit, 1.0, true), at(sit, 1.3, true), at(tall, 2.2, true)], true);
};
/** ex_kb_overhead_squat_one — one bell locked out overhead on a straight right arm, the eyes ahead, the left hand out for
 *  balance: a full squat under it, the arm staying vertical, and up. */
const overheadSquatOne: Builder = (scene, sk) => rep(scene, sk, 'ex_kb_overhead_squat_one',
  { bones: { ...STAND }, feet: SQUAT_FEET, kneePoles: KNEES_OUT, rel: { Right: [-0.02, 0.60, 0.0], Left: [-0.30, -0.24, 0.16] }, poles: { Right: [1, 0.1, -0.1], Left: [-0.4, -1, 0] }, hipsY: 0 },
  { bones: { Hips: [30, 0, 0], Spine: [6, 0, 0], Neck: [-18, 0, 0], LeftFoot: [-34, 0, 0], RightFoot: [-34, 0, 0] }, feet: SQUAT_FEET, kneePoles: KNEES_OUT, rel: { Right: [-0.02, 0.60, -0.06], Left: [-0.30, -0.10, 0.30] }, poles: { Right: [1, 0.1, -0.1], Left: [-0.4, -1, 0] }, hipsY: -0.42 },
  1.2, 0.3, 1.0, 0.4);
/** ex_zercher_squat — the bar held in the crooks of the elbows in front of the body, the hands locked together: a deep squat,
 *  the trunk tall, and up. */
const zercher: Builder = (scene, sk) => {
  const arms: Pair = { Left: [0.12, -0.28, 0.24], Right: [-0.12, -0.28, 0.24] }, poles = bothDir(0.4, -1, 0.6);
  return rep(scene, sk, 'ex_zercher_squat',
    { bones: { ...STAND, Hips: [4, 0, 0] }, feet: SQUAT_FEET, kneePoles: KNEES_OUT, rel: arms, poles, hipsY: 0 },
    { bones: { Hips: [24, 0, 0], Spine: [6, 0, 0], Neck: [-12, 0, 0], LeftFoot: [-34, 0, 0], RightFoot: [-34, 0, 0] }, feet: SQUAT_FEET, kneePoles: KNEES_OUT, rel: arms, poles, hipsY: -0.46 },
    1.1, 0.3, 1.0, 0.4);
};

// ── rows ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** ex_renegade_row — the push-up position, feet wide, the hands on two kettlebells: one bell rows up to the ribs, the elbow
 *  close, while the other hand presses into the floor; down, then the other side. */
const renegadeRow: Builder = (scene, sk) => {
  const P: Pose = { ...HIGH_PLANK, feet: both(0.26, TOE_ANKLE, -0.90), hands: both(0.22, 0.14, 0.44) };
  return alternating(scene, sk, 'ex_renegade_row', {
    a: P, b: { ...P, bones: { ...P.bones, Spine: [0, 6, 0] }, hands: both(0.22, 0.42, 0.26), poles: bothDir(0.3, 1, -0.6) }, t: [0.7, 0.3, 0.8, 0.3],
  });
};
/** The tall kneel the high-pulley rows pull from. */
const TALL_KNEEL = (rel: Pair, poles: Pair): Pose => kneel({ bones: { Hips: [0, 0, 0], Spine: [0, 0, 0], Neck: [0, 0, 0] }, rel, poles, hipsY: 0 }, ['Left', 'Right']);
/** ex_kneel_high_row — kneeling facing a high pulley, the rope held up and out in front, arms long: pulled down to the upper
 *  chest, the elbows out wide and the shoulder blades squeezed; back out. */
const kneelHighRow: Builder = (scene, sk) => rep(scene, sk, 'ex_kneel_high_row',
  TALL_KNEEL({ Left: [0.08, 0.30, 0.46], Right: [-0.08, 0.30, 0.46] }, bothDir(0.6, -0.4, -0.2)),
  TALL_KNEEL({ Left: [0.04, 0.02, 0.18], Right: [-0.04, 0.02, 0.18] }, bothDir(1, 0.2, -0.4)), 0.9, 0.3, 1.0, 0.3);
/** ex_kneel_high_row_one — kneeling in front of a high pulley, one handle in the right hand, the arm up and out in front, palm
 *  forward: pulled down to the side of the chest, the elbow back and the palm turning in; the left hand at the side. */
const kneelHighRowOne: Builder = (scene, sk) => rep(scene, sk, 'ex_kneel_high_row_one',
  TALL_KNEEL({ Right: [-0.06, 0.32, 0.44], Left: [0.04, -0.40, 0.12] }, { Right: [0.6, -0.4, -0.2], Left: [-0.3, -0.4, -0.8] }),
  TALL_KNEEL({ Right: [0.02, -0.16, 0.08], Left: [0.04, -0.40, 0.12] }, { Right: [0.3, -0.4, -1], Left: [-0.3, -0.4, -0.8] }), 0.9, 0.3, 1.0, 0.3);
const ELBOWS_BACK_LOW: Pair = bothDir(0.3, -0.5, -1);
/** ex_seated_high_row — the high-row machine: seated, the handles up and in front, overhand: pulled down and back to the
 *  sides of the chest, the shoulder blades squeezed, a pause, and back up. */
const seatedHighRow: Builder = (scene, sk) => rep(scene, sk, 'ex_seated_high_row',
  seat({ rel: { Left: [0.04, 0.40, 0.34], Right: [-0.04, 0.40, 0.34] }, poles: bothDir(0.6, -0.4, -0.2) }),
  seat({ rel: { Left: [0.02, -0.14, 0.06], Right: [-0.02, -0.14, 0.06] }, poles: ELBOWS_BACK_LOW }), 0.9, 0.4, 1.0, 0.3);
/** ex_row_to_neck — seated at the low pulley, a rope, the back upright and the arms long in front: the elbows lift high and
 *  wide as the rope comes up to the neck; back out. */
const rowToNeck: Builder = (scene, sk) => rep(scene, sk, 'ex_row_to_neck',
  SEATED_ROW.a, { ...SEATED_ROW.a, rel: { Left: [0.06, 0.04, 0.14], Right: [-0.06, 0.04, 0.14] }, poles: bothDir(1, 0.5, -0.3) }, 0.9, 0.3, 1.0, 0.3);

export const FAMILY9_BUILDERS: readonly [string, Builder][] = [
  ['ex_box_jump_lat', boxJumpLat], ['ex_hurdle_hops', hurdleHops], ['ex_side_long_jump', sideLongJump], ['ex_kneel_jump_squat', kneelJumpSquat],
  ['ex_hamstring_smr', hamstringSmr], ['ex_quad_smr', quadSmr], ['ex_upper_back_smr', upperBackSmr], ['ex_lower_back_smr', lowerBackSmr],
  ['ex_battle_ropes', battleRopes],
  ['ex_chest_push_fall', chestPushFall], ['ex_slam_one', slamOne], ['ex_supine_chest_throw', supineChestThrow], ['ex_supine_throw_one', supineThrowOne],
  ['ex_box_squat_bar', boxSquatBar], ['ex_frankenstein_squat', frankenstein], ['ex_kneel_squat', kneelSquat], ['ex_kb_overhead_squat_one', overheadSquatOne], ['ex_zercher_squat', zercher],
  ['ex_renegade_row', renegadeRow], ['ex_kneel_high_row', kneelHighRow], ['ex_kneel_high_row_one', kneelHighRowOne], ['ex_seated_high_row', seatedHighRow], ['ex_row_to_neck', rowToNeck],
];
