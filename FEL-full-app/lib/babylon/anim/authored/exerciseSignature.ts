// The four signature programs' exercises that had no loop (DEMO-LOOPS, 2026-10-27): stances and holds, band and wall
// work, landings and sticks, single-leg balance, the start. Each is the movement its library entry describes, authored
// in the same kit as the library's 480 (exerciseKit: targets in the final frame, `rel` from the posed shoulder).
//
// Owner decision (2026-10-25, held 2026-10-27): authored loops only, never a wrong movement.
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { ANKLE, TOE_ANKLE, STAND, HANG, HANG_POLES, SEATED, SEAT_Y, both, bothDir, rep, type Deg3, type ExKey, type Pair, type V3 } from './exerciseKit';
import { run, at, sx, other } from './exerciseBody';
import { SUPINE, PRONE } from './exerciseFloor';

type Pose = Omit<ExKey, 't'>;
type Side = 'Left' | 'Right';
type Builder = (scene: Scene, sk: Skeleton) => AnimationGroup | null;
const ON_HIPS: Pair = { Left: [0.04, -0.42, 0.08], Right: [-0.04, -0.42, 0.08] };
const HIPS_POLES = bothDir(1, -0.2, 0);
const WALL_FACE = 0.69;   // demo.ts PROP_SHAPES wall: the face in front
const WALL_BACK = -0.12;  // demo.ts PROP_SHAPES wallback: the face behind

// ── stances and holds ─────────────────────────────────────────────────────────────────────────────────────────────
/** ex_def_stance (defensive stance hold) — wide, low, the weight on the balls of the feet, the hands out wide and active;
 *  held, breathing. */
function defStance(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const p = (b: number): Pose => ({ bones: { Hips: [22, 0, 0], Spine: [6 - b * 2, 0, 0], Neck: [-16, 0, 0], LeftFoot: [-14, 0, 0], RightFoot: [-14, 0, 0] }, feet: both(0.34, ANKLE + 0.01, 0.06), kneePoles: bothDir(0.35, 0, 1), rel: { Left: [-0.38, -0.12 + b * 0.02, 0.22], Right: [0.38, -0.12 + b * 0.02, 0.22] }, poles: bothDir(0.3, -1, 0), hipsY: -0.30 + b * 0.01 });
  return run(scene, sk, 'ex_def_stance', 3.0, [at(p(0), 0, true), at(p(1), 1.5, true)]);
}

/** ex_sl_balance / ex_sl_balance_head — standing on the left leg, the right foot lifted beside the left shin, the hands on
 *  the hips, the small sway of balancing; `head`: the head turns slowly to one side and the other. */
function slBalance(scene: Scene, sk: Skeleton, name: string, head: boolean): AnimationGroup | null {
  const p = (sway: number, turn: number): Pose => ({
    bones: { ...STAND, Hips: [2, 0, sway * 1.5], Neck: [0, turn * 45, 0], RightUpLeg: [-40, 0, -2], RightLeg: [70, 0, 0], RightFoot: [12, 0, 0] },
    feet: { Left: [-0.09, ANKLE, 0.06] }, kneePoles: { Left: [0, 0, 1] }, rel: ON_HIPS, poles: HIPS_POLES, hipsY: 0, hipsX: -0.07 + sway * 0.01,
  });
  return head
    ? run(scene, sk, name, 4.0, [at(p(0, 0), 0, true), at(p(1, 1), 1.0, true), at(p(0, 0), 2.0, true), at(p(-1, -1), 3.0, true)])
    : run(scene, sk, name, 3.0, [at(p(0, 0), 0), at(p(1, 0), 1.0), at(p(-1, 0), 2.0)]);
}

/** ex_seated_breathe (seated long-exhale breathing) — sitting tall on the bench, one hand on the belly, one on the ribs: a
 *  slow breath in (the ribs and belly widen) and a long breath out. */
function seatedBreathe(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const p = (b: number): Pose => ({ ...SEATED, bones: { ...SEATED.bones, Spine: [-b * 3, 0, 0], Spine1: [-b * 2, 0, 0], Neck: [b * 2, 0, 0] }, rel: { Left: [0.10, -0.40, 0.18 + b * 0.02], Right: [-0.05, -0.30, 0.16 + b * 0.02] }, poles: bothDir(0.8, -0.6, 0), hipsY: SEAT_Y });
  return run(scene, sk, 'ex_seated_breathe', 6.0, [at(p(0), 0, true), at(p(1), 2.0, true), at(p(1), 2.4, true), at(p(0), 5.6, true)]);
}

/** ex_adductor_squeeze — on the back, knees bent, a ball between the knees (not drawn): the knees squeeze together and ease. */
function adductorSqueeze(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const p = (sq: number): Pose => ({ ...SUPINE, feet: both(0.13, ANKLE, 0.50), kneePoles: bothDir(0.06 - sq * 0.08, 1, 0.2) });
  return run(scene, sk, 'ex_adductor_squeeze', 2.6, [at(p(0), 0, true), at(p(1), 0.6, true), at(p(1), 1.6, true), at(p(0), 2.2, true)]);
}

// ── bands and walls ───────────────────────────────────────────────────────────────────────────────────────────────
/** ex_band_row — standing tall, a band anchored in front: the arms reach long in front at chest height and row back to the
 *  ribs, the elbows close past the trunk, the shoulders back. */
function bandRow(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const base = { bones: { ...STAND, Hips: [4, 0, 0] as Deg3 }, feet: both(0.13, ANKLE, 0.10), kneePoles: bothDir(0.1, 0, 1), hipsY: -0.03 };
  const a: Pose = { ...base, rel: { Left: [0.08, -0.14, 0.50], Right: [-0.08, -0.14, 0.50] }, poles: bothDir(0.3, -1, 0) };
  const b: Pose = { ...base, rel: { Left: [0.04, -0.30, 0.08], Right: [-0.04, -0.30, 0.08] }, poles: bothDir(0.3, -0.3, -1) };
  return rep(scene, sk, 'ex_band_row', a, b, 0.7, 0.3, 0.9, 0.3);
}

/** ex_tke (band terminal knee extension) — the right foot a little forward, a band behind the knee (not drawn): the knee
 *  softens forward and snaps straight, the heel down. */
function tke(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const p = (bend: number): Pose => ({ bones: { ...STAND, Hips: [4 + bend * 6, 0, 0], RightFoot: [-bend * 18, 0, 0] }, feet: { Right: [0.12, ANKLE, 0.20], Left: [-0.12, ANKLE + 0.03, -0.12] }, kneePoles: bothDir(0.05, 0, 1), rel: ON_HIPS, poles: HIPS_POLES, hipsY: -bend * 0.07, hipsZ: 0.04 + bend * 0.06 });
  return run(scene, sk, 'ex_tke', 1.8, [at(p(1), 0, true), at(p(0), 0.5, true), at(p(0), 0.9, true)]);
}

/** ex_lateral_walk (banded lateral walk) — a quarter squat, a band round the legs (not drawn): two steps to the right, the
 *  trailing foot never closing the gap, then two back to the left. */
function lateralWalk(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const sq = { bones: { Hips: [18, 0, 0] as Deg3, Spine: [4, 0, 0] as Deg3, Neck: [-12, 0, 0] as Deg3, LeftFoot: [-14, 0, 0] as Deg3, RightFoot: [-14, 0, 0] as Deg3 }, kneePoles: bothDir(0.2, 0, 1), rel: ON_HIPS, poles: HIPS_POLES, hipsY: -0.16 };
  const st = (lx: number, rx: number): Pose => ({ ...sq, feet: { Left: [lx, ANKLE, 0.08], Right: [rx, ANKLE, 0.08] }, hipsX: (lx + rx) / 2 });
  const W = 0.20, S = 0.22;
  const seq = [st(-W, W), st(-W, W + S), st(-W + S, W + S), st(-W + S, W + 2 * S), st(-W + 2 * S, W + 2 * S), st(-W + S, W + 2 * S), st(-W + S, W + S), st(-W, W + S)];
  return run(scene, sk, 'ex_lateral_walk', 4.0, seq.map((p, i) => at(p, i * 0.5)));
}

/** ex_back_wall_arm_raise — the back, head and arms on the wall behind, the elbows bent at the shoulders (a W): the arms
 *  slide up the wall overhead and back down, staying on it. */
function backWallArmRaise(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const base = { bones: { ...STAND, Spine: [0, 0, 0] as Deg3 }, feet: both(0.12, ANKLE, 0.10), kneePoles: bothDir(0.1, 0, 1), hipsY: -0.02 };
  const w: Pose = { ...base, handsAt: both(0.40, 1.48, WALL_BACK + 0.06), poles: bothDir(1, -0.6, -0.4) };
  const up: Pose = { ...base, handsAt: both(0.26, 2.02, WALL_BACK + 0.08), poles: bothDir(1, 0, -0.3) };
  return rep(scene, sk, 'ex_back_wall_arm_raise', w, up, 1.2, 0.3, 1.2, 0.4);
}

/** ex_wall_chin_tuck — the back and head against the wall: the chin draws straight back (a double chin), held, released. */
function wallChinTuck(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const p = (tuck: number): Pose => ({ bones: { ...STAND, Spine: [0, 0, 0], Neck: [6 * tuck, 0, 0], Head: [8 * tuck, 0, 0] }, feet: both(0.12, ANKLE, 0.10), kneePoles: bothDir(0.1, 0, 1), hands: HANG, poles: HANG_POLES, hipsY: -0.02, hipsZ: -0.01 * tuck });
  return run(scene, sk, 'ex_wall_chin_tuck', 2.4, [at(p(0), 0, true), at(p(1), 0.6, true), at(p(1), 1.6, true)]);
}

/** ex_wall_slide_liftoff — facing the wall, the forearms on it: they slide up the wall, the hands lift a few centimetres off
 *  it at the top, back on, and slide down. */
function wallSlideLiftOff(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const base = { bones: { ...STAND, Hips: [4, 0, 0] as Deg3 }, feet: both(0.12, ANKLE, 0.32), kneePoles: bothDir(0.1, 0, 1), hipsY: -0.02, hipsZ: 0.20 };
  const low: Pose = { ...base, handsAt: both(0.22, 1.42, WALL_FACE - 0.03), poles: bothDir(0.4, -1, 0.2) };
  const high: Pose = { ...base, handsAt: both(0.24, 1.86, WALL_FACE - 0.03), poles: bothDir(0.4, -1, 0.3) };
  const off: Pose = { ...high, handsAt: both(0.24, 1.88, WALL_FACE - 0.10) };
  return run(scene, sk, 'ex_wall_slide_liftoff', 3.2, [at(low, 0, true), at(high, 1.0, true), at(off, 1.4, true), at(off, 1.7, true), at(high, 2.0, true), at(low, 2.9, true)]);
}

// ── landings and sticks ───────────────────────────────────────────────────────────────────────────────────────────
const legs = (thigh: number, knee: number): Record<string, Deg3> => ({ LeftUpLeg: [thigh, 0, 4], RightUpLeg: [thigh, 0, -4], LeftLeg: [knee, 0, 0], RightLeg: [knee, 0, 0] });
/** The landing: hips back, knees over the toes, the arms forward — held (the stick). */
const LANDED = (z: number, x = 0, y = 0): Pose => ({ bones: { Hips: [24, 0, 0], Spine: [10, 0, 0], Neck: [-12, 0, 0], LeftFoot: [-18, 0, 0], RightFoot: [-18, 0, 0] }, feet: { Left: [x - 0.14, ANKLE + y, z], Right: [x + 0.14, ANKLE + y, z] }, kneePoles: bothDir(0.15, 0, 1), rel: { Left: [0.06, -0.20, 0.32], Right: [-0.06, -0.20, 0.32] }, poles: bothDir(0.3, -1, 0), hipsY: -0.24 + y, hipsX: x, hipsZ: z - 0.12 });
const STANDING = (z: number, x = 0, y = 0, lz = z, rz = z): Pose => ({ bones: { ...STAND }, feet: { Left: [x - 0.12, ANKLE + y, lz], Right: [x + 0.12, ANKLE + y, rz] }, kneePoles: bothDir(0.1, 0, 1), hands: { Left: [x - 0.24, 0.84 + y, z], Right: [x + 0.24, 0.84 + y, z] }, poles: HANG_POLES, hipsY: y, hipsX: x, hipsZ: z - 0.06 });
const DIPPED = (z: number, y = 0): Pose => ({ bones: { Hips: [26, 0, 0], Spine: [12, 0, 0], Neck: [-14, 0, 0], LeftFoot: [-20, 0, 0], RightFoot: [-20, 0, 0] }, feet: both(0.13, ANKLE + y, z), kneePoles: bothDir(0.15, 0, 1), hands: { Left: [-0.26, 0.62 + y, z - 0.36], Right: [0.26, 0.62 + y, z - 0.36] }, poles: bothDir(0.3, 0.3, -0.9), hipsY: -0.28 + y, hipsZ: z - 0.10 });
/** The push: the feet still down on their balls, the legs driving long, the arms swinging through (the take-off's last contact). */
const PUSH = (z: number, y = 0): Pose => ({ bones: { Hips: [10, 0, 0], Spine: [2, 0, 0], LeftFoot: [12, 0, 0], RightFoot: [12, 0, 0] }, feet: both(0.13, ANKLE + 0.06 + y, z), kneePoles: bothDir(0.15, 0, 1), hands: { Left: [-0.24, 1.30 + y, z + 0.20], Right: [0.24, 1.30 + y, z + 0.20] }, poles: bothDir(0.6, -0.2, -0.5), hipsY: 0.0 + y, hipsZ: z + 0.02 });
const FLIGHT = (z: number, y: number, x = 0): Pose => ({ bones: { Hips: [4, 0, 0], Spine: [0, 0, 0], ...legs(-30, 50), LeftFoot: [20, 0, 0], RightFoot: [20, 0, 0] }, hands: { Left: [x - 0.22, 1.60 + y, z + 0.30], Right: [x + 0.22, 1.60 + y, z + 0.30] }, poles: bothDir(0.9, 0.1, -0.3), hipsY: y, hipsX: x, hipsZ: z });
/** Walking back from (x, z) to the start in short steps (the loop closes standing where it began). */
function walkBack(z0: number, t0: number, step = 0.4, dt = 0.45, x0 = 0): ExKey[] {
  const keys: ExKey[] = [];
  const n = Math.max(1, Math.ceil(Math.hypot(z0, x0) / step));
  for (let i = 1; i <= n; i++) {
    const f = 1 - i / n, fPrev = 1 - (i - 1) / n;
    keys.push(at(STANDING(z0 * f, x0 * f, 0, z0 * f, z0 * fPrev), t0 + (i - 0.5) * dt));
    keys.push(at(STANDING(z0 * f, x0 * f), t0 + i * dt, i === n));
  }
  return keys;
}

/** ex_box_jump — a two-foot dip and jump up onto the box in front (demo.ts PROP_SHAPES box), landing soft on top; stand
 *  tall, step back down, one foot then the other. */
function boxJump(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const top = 0.40, zb = 0.42;
  return run(scene, sk, 'ex_box_jump', 4.4, [
    at(STANDING(0), 0, true), at(DIPPED(0), 0.5, true), at(PUSH(0), 0.66), at(FLIGHT(0.22, 0.40), 0.86), at(LANDED(zb, 0, top), 1.1, true), at(LANDED(zb, 0, top), 1.5, true),
    at(STANDING(zb, 0, top), 2.0, true), at({ ...STANDING(zb, 0, top), feet: { Left: [-0.12, ANKLE + top, zb], Right: [0.12, ANKLE, 0.0] }, hipsY: top - 0.22, hipsZ: zb - 0.20 }, 2.6, true),
    at(STANDING(0), 3.3, true),
  ]);
}

/** ex_broad_jump_stick — a two-foot dip and a long jump forward, the arms swinging through, landing on two feet and holding
 *  the stick; walk back. */
function broadJumpStick(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const d = 0.95;
  return run(scene, sk, 'ex_broad_jump_stick', 5.0, [
    at(STANDING(0), 0, true), at(DIPPED(0), 0.5, true), at(PUSH(0.06), 0.64), at(FLIGHT(d * 0.45, 0.20), 0.84), at(LANDED(d), 1.1, true), at(LANDED(d), 1.9, true), at(STANDING(d), 2.3, true),
    ...walkBack(d, 2.3),
  ]);
}

/** A one-leg hop and stick: on the right leg, a dip, a hop of (dx, dz) landing on the same leg, held, then back. */
function oneLegLand(s: Side, x: number, z: number, deep: number): Pose {
  const o = other(s);
  return { bones: { Hips: [22 + deep * 8, 0, 0], Spine: [8, 0, 0], Neck: [-12, 0, 0], [`${o}UpLeg`]: [-40 - deep * 12, 0, 0], [`${o}Leg`]: [92, 0, 0], [`${o}Foot`]: [20, 0, 0], [`${s}Foot`]: [-20, 0, 0] } as Record<string, Deg3>, feet: { [s]: [x + sx(s, 0.09), ANKLE, z] } as Pair, kneePoles: { [s]: [sx(s, 0.1), 0, 1] } as Pair, rel: { Left: [0.04, -0.22, 0.30], Right: [-0.04, -0.22, 0.30] }, poles: bothDir(0.3, -1, 0), hipsY: -0.20 - deep * 0.06, hipsX: x, hipsZ: z - 0.10 };
}
/** The one-leg push: the stance foot still down on its ball, the leg driving long. */
function oneLegPush(s: Side, x: number, z: number): Pose {
  const o = other(s);
  return { bones: { Hips: [10, 0, 0], Spine: [2, 0, 0], [`${o}UpLeg`]: [-40, 0, 0], [`${o}Leg`]: [84, 0, 0], [`${o}Foot`]: [20, 0, 0], [`${s}Foot`]: [12, 0, 0] } as Record<string, Deg3>, feet: { [s]: [x + sx(s, 0.09), ANKLE + 0.06, z] } as Pair, kneePoles: { [s]: [sx(s, 0.1), 0, 1] } as Pair, hands: { Left: [x - 0.24, 1.10, z + 0.24], Right: [x + 0.24, 1.10, z + 0.24] }, poles: bothDir(0.6, -0.4, -0.4), hipsY: 0.0, hipsX: x, hipsZ: z - 0.04 };
}
function oneLegStand(s: Side, x: number, z: number): Pose {
  const o = other(s);
  return { bones: { ...STAND, [`${o}UpLeg`]: [-30, 0, 0], [`${o}Leg`]: [70, 0, 0], [`${o}Foot`]: [20, 0, 0] } as Record<string, Deg3>, feet: { [s]: [x + sx(s, 0.09), ANKLE, z] } as Pair, kneePoles: { [s]: [sx(s, 0.1), 0, 1] } as Pair, hands: { Left: [x - 0.24, 0.86, z], Right: [x + 0.24, 0.86, z] }, poles: HANG_POLES, hipsY: 0, hipsX: x, hipsZ: z - 0.06 };
}
function oneLegAir(s: Side, x: number, z: number): Pose {
  const o = other(s);
  return { bones: { Hips: [8, 0, 0], Spine: [2, 0, 0], [`${s}UpLeg`]: [-10, 0, 0], [`${s}Leg`]: [20, 0, 0], [`${s}Foot`]: [14, 0, 0], [`${o}UpLeg`]: [-40, 0, 0], [`${o}Leg`]: [80, 0, 0], [`${o}Foot`]: [20, 0, 0] } as Record<string, Deg3>, hands: { Left: [x - 0.24, 1.20, z + 0.24], Right: [x + 0.24, 1.20, z + 0.24] }, poles: bothDir(0.6, -0.4, -0.4), hipsY: 0.12, hipsX: x, hipsZ: z };
}
/** ex_sl_hop_stick — on the right leg: dip, hop forward, land on the same leg and hold the stick; step back. */
function slHopStick(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const d = 0.40;
  return run(scene, sk, 'ex_sl_hop_stick', 3.8, [
    at(oneLegStand('Right', 0, 0), 0, true), at(oneLegLand('Right', 0, 0, 0), 0.45, true), at(oneLegPush('Right', 0, 0), 0.58), at(oneLegAir('Right', 0, d / 2), 0.74), at(oneLegLand('Right', 0, d, 1), 0.95, true), at(oneLegLand('Right', 0, d, 1), 1.75, true),
    at(oneLegStand('Right', 0, d), 2.15, true), at(STANDING(d), 2.5, true), at(STANDING(d / 2, 0, 0, d / 2, d), 2.9), at(STANDING(0, 0, 0, 0, d / 2), 3.3), at(oneLegStand('Right', 0, 0), 3.6, true),
  ]);
}
/** ex_lateral_hop_stick — on the right leg, a hop sideways to the right, stick; then on the left leg a hop back, stick. */
function lateralHopStick(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const d = 0.40;
  return run(scene, sk, 'ex_lateral_hop_stick', 4.0, [
    at(oneLegStand('Right', 0, 0.04), 0, true), at(oneLegLand('Right', 0, 0.04, 0), 0.4, true), at(oneLegPush('Right', 0, 0.04), 0.52), at(oneLegAir('Right', d / 2, 0.04), 0.68), at(oneLegLand('Right', d, 0.04, 1), 0.9, true), at(oneLegLand('Right', d, 0.04, 1), 1.6, true),
    at(STANDING(0.04, d), 1.95, true), at(oneLegStand('Left', d - 0.02, 0.04), 2.2, true), at(oneLegLand('Left', d - 0.02, 0.04, 0), 2.45, true), at(oneLegPush('Left', d - 0.02, 0.04), 2.56), at(oneLegAir('Left', d / 2, 0.04), 2.72), at(oneLegLand('Left', 0.02, 0.04, 1), 2.95, true), at(oneLegLand('Left', 0.02, 0.04, 1), 3.4, true),
    at(oneLegStand('Left', 0.02, 0.04), 3.65, true), at(STANDING(0.04), 3.85, true),
  ]);
}
/** ex_drop_landing — standing on a low box (demo.ts PROP_SHAPES stepbox), step off forward (not a jump), land on both feet
 *  and stick; step back up. */
function dropLanding(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const top = 0.40, z1 = 0.52;
  return run(scene, sk, 'ex_drop_landing', 4.6, [
    at(STANDING(0, 0, top), 0, true),
    at({ ...STANDING(0, 0, top), bones: { ...STAND, RightUpLeg: [-34, 0, 0], RightLeg: [30, 0, 0] }, feet: { Left: [-0.12, ANKLE + top, 0] }, hipsZ: 0.02 }, 0.5, true),
    at(FLIGHT(z1 * 0.6, top - 0.10), 0.85), at(LANDED(z1), 1.1, true), at(LANDED(z1), 1.9, true), at(STANDING(z1), 2.3, true),
    at({ ...STANDING(z1), feet: { Left: [-0.12, ANKLE, z1], Right: [0.12, ANKLE + top, 0.02] }, hipsY: 0.10, hipsZ: 0.30 }, 3.0, true),
    at(STANDING(0, 0, top), 3.8, true),
  ]);
}
/** ex_snap_down — tall on the toes, the arms up; snap down fast into the landing position (hips back, the arms swung back),
 *  held; and up. */
function snapDown(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const tall: Pose = { bones: { ...STAND, LeftFoot: [30, 0, 0], RightFoot: [30, 0, 0] }, feet: both(0.13, ANKLE + 0.08, 0.08), kneePoles: bothDir(0.1, 0, 1), hands: both(0.22, 2.06, 0.10), poles: bothDir(0.9, 0.1, -0.3), hipsY: 0.08 };
  const low: Pose = { ...DIPPED(0.08), hipsZ: -0.02 };
  return run(scene, sk, 'ex_snap_down', 2.6, [at(tall, 0, true), at(tall, 0.5, true), at(low, 0.75, true), at(low, 1.6, true)]);
}

// ── hinges, the start, the arms ───────────────────────────────────────────────────────────────────────────────────
/** ex_supported_sl_rdl — the single-leg RDL on the left leg with the right hand on a dowel planted beside (demo.ts
 *  PROP_SHAPES dowel); the left hand hangs. */
function supportedSlRdl(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const dowel: V3 = [0.42, 0, 0.20];
  const top: Pose = { bones: { ...STAND, RightUpLeg: [10, 0, 0], RightLeg: [12, 0, 0] }, feet: { Left: [-0.10, ANKLE, 0.06] }, kneePoles: { Left: [0, 0, 1] }, rel: { Left: [0.04, -0.50, 0.06] }, handsAt: { Right: [dowel[0], 0.98, dowel[2]] }, poles: bothDir(0.5, -0.6, -0.3), hipsY: 0 };
  const low: Pose = { bones: { Hips: [70, 0, 0], Spine: [2, 0, 0], Neck: [-32, 0, 0], RightUpLeg: [2, 0, 0], RightLeg: [4, 0, 0], RightFoot: [-10, 0, 0] }, feet: { Left: [-0.10, ANKLE, 0.06] }, kneePoles: { Left: [0, 0, 1] }, rel: { Left: [0.05, -0.52, 0.02] }, handsAt: { Right: [dowel[0], 0.72, dowel[2]] }, poles: bothDir(0.5, -0.6, -0.3), hipsY: -0.08, hipsZ: -0.10 };
  return run(scene, sk, 'ex_supported_sl_rdl', 3.0, [at(top, 0, true), at(low, 1.2, true), at(low, 1.5, true), at(top, 2.6, true)], true);
}
/** ex_hip_airplane — the single-leg hinge on the left leg, the right hand on the dowel: the pelvis turns open (the right hip
 *  up toward the ceiling) and back closed, square to the floor. */
function hipAirplane(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const dowel: V3 = [0.42, 0, 0.20];
  const p = (open: number): Pose => ({ bones: { Hips: [58, -open * 34, 0], Spine: [2, open * 6, 0], Neck: [-28, 0, 0], RightUpLeg: [-14, 0, 0], RightLeg: [60, 0, 0], RightFoot: [10, 0, 0] }, feet: { Left: [-0.10, ANKLE, 0.06] }, kneePoles: { Left: [0, 0, 1] }, rel: { Left: [0.05, -0.50, 0.02] }, handsAt: { Right: [dowel[0], 0.78, dowel[2]] }, poles: bothDir(0.5, -0.6, -0.3), hipsY: -0.08, hipsZ: -0.06 });
  return run(scene, sk, 'ex_hip_airplane', 3.0, [at(p(0), 0, true), at(p(1), 1.1, true), at(p(1), 1.5, true), at(p(0), 2.6, true)], true);
}
/** ex_two_point_start — the two-point stance (the left foot forward, the weight on it, the trunk leaning, the right arm
 *  forward), then the drive: three hard, low steps out; walk back. */
function twoPointStart(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const set: Pose = { bones: { Hips: [36, 0, 0], Spine: [6, 0, 0], Neck: [-20, 0, 0], RightFoot: [26, 0, 0], LeftFoot: [-14, 0, 0] }, feet: { Left: [-0.12, ANKLE, 0.20], Right: [0.12, ANKLE + 0.10, -0.24] }, kneePoles: bothDir(0.1, 0, 1), rel: { Left: [0.02, -0.40, -0.18], Right: [-0.02, -0.18, 0.26] }, poles: bothDir(0.2, -0.6, -0.6), hipsY: -0.18, hipsZ: -0.02 };
  const drive = (s: Side, z: number): Pose => {
    const o = other(s);
    return { bones: { Hips: [30, 0, 0], Spine: [4, 0, 0], Neck: [-16, 0, 0], [`${o}UpLeg`]: [-70, 0, 0], [`${o}Leg`]: [80, 0, 0], [`${o}Foot`]: [10, 0, 0], [`${s}Foot`]: [16, 0, 0] } as Record<string, Deg3>, feet: { [s]: [sx(s, 0.12), ANKLE + 0.05, z] } as Pair, kneePoles: { [s]: [sx(s, 0.1), 0, 1] } as Pair, rel: { [s]: [sx(s, 0.02), -0.40, -0.18], [o]: [sx(o, -0.02), -0.16, 0.26] } as Pair, poles: bothDir(0.2, -0.6, -0.6), hipsY: -0.08, hipsZ: z + 0.10 };
  };
  return run(scene, sk, 'ex_two_point_start', 5.2, [
    at(set, 0, true), at(set, 0.6, true), at(drive('Left', 0.24), 0.85), at(drive('Right', 0.62), 1.1), at(drive('Left', 1.02), 1.35), at(STANDING(1.10), 1.9, true),
    ...walkBack(1.10, 1.9, 0.38, 0.4), at(set, 4.9, true),
  ]);
}
/** ex_arm_swing (the standing sprint arm swing) — standing tall in a short split, the arms bent at right angles swinging
 *  from the shoulders: one hand up to the face as the other drives back past the hip. */
function armSwing(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const p = (s: Side): Pose => {
    const o = other(s);
    return { bones: { ...STAND, Hips: [6, 0, 0] }, feet: { Left: [-0.12, ANKLE, 0.18], Right: [0.12, ANKLE + 0.04, -0.14] }, kneePoles: bothDir(0.1, 0, 1), rel: { [s]: [sx(s, 0.04), 0.08, 0.30], [o]: [sx(o, -0.02), -0.40, -0.24] } as Pair, poles: { [s]: [sx(s, 0.2), -1, 0.2], [o]: [sx(o, 0.2), -0.4, -1] } as Pair, hipsY: -0.02 };
  };
  return run(scene, sk, 'ex_arm_swing', 1.0, [at(p('Left'), 0), at(p('Right'), 0.5)]);
}

// ── on the floor and the bench ────────────────────────────────────────────────────────────────────────────────────
/** ex_prone_t — face down, the arms out to the sides in a T, the thumbs up: the arms lift off the floor, the shoulder
 *  blades squeezing, held, and lower. */
function proneT(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const p = (lift: number): Pose => ({ ...PRONE, bones: { ...PRONE.bones, Neck: [-6 - lift * 6, 0, 0] }, hands: both(0.72, 0.05 + lift * 0.12, 0.30), poles: bothDir(0.2, 1, 0.2) });
  return run(scene, sk, 'ex_prone_t', 2.4, [at(p(0), 0, true), at(p(1), 0.7, true), at(p(1), 1.5, true)], true);
}
/** ex_incline_scap_push_up — the hands on a bench (demo.ts PROP_SHAPES handbench), the arms straight: the chest sinks
 *  between the shoulder blades and pushes away (the blades only, no elbow bend). */
function inclineScapPushup(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const top: Pose = { bones: { Hips: [56, 0, 0], Spine: [-4, 0, 0], Neck: [-20, 0, 0], LeftFoot: [22, 0, 0], RightFoot: [22, 0, 0] }, feet: both(0.11, TOE_ANKLE + 0.04, -0.78), kneePoles: bothDir(0, -1, 0.1), handsAt: both(0.22, 0.47, 0.52), poles: bothDir(0.6, 0.2, -0.7), hipsY: -0.33, hipsZ: -0.04 };
  const sink: Pose = { ...top, bones: { ...top.bones, Spine: [6, 0, 0] }, hipsY: -0.38 };
  return run(scene, sk, 'ex_incline_scap_push_up', 2.0, [at(top, 0, true), at(sink, 0.7, true), at(sink, 1.0, true)], true);
}

// ── running a few steps, and stopping ─────────────────────────────────────────────────────────────────────────────
/** A running step forward: `s` foot landing at z, the other pushing off behind on its ball, the arms driving. */
function runStep(s: Side, z: number, oz: number): Pose {
  const o = other(s);
  return { bones: { Hips: [20, 0, 0], Spine: [4, 0, 0], Neck: [-14, 0, 0], [`${s}Foot`]: [-6, 0, 0], [`${o}Foot`]: [26, 0, 0] } as Record<string, Deg3>, feet: { [s]: [sx(s, 0.11), ANKLE, z], [o]: [sx(o, 0.11), ANKLE + 0.09, oz] } as Pair, kneePoles: bothDir(0.1, 0, 1), rel: { [o]: [sx(o, -0.02), -0.16, 0.26], [s]: [sx(s, 0.0), -0.40, -0.18] } as Pair, poles: { [o]: [sx(o, 0.2), -1, 0.2], [s]: [sx(s, 0.2), -0.4, -1] } as Pair, hipsY: -0.06, hipsZ: (z + oz) / 2 + 0.06 };
}
/** The stick: a wide two-foot athletic stance, hips back and low, the chest over the knees, held. */
const STICK = (z: number): Pose => ({ bones: { Hips: [30, 0, 0], Spine: [8, 0, 0], Neck: [-16, 0, 0], LeftFoot: [-22, 0, 0], RightFoot: [-22, 0, 0] }, feet: both(0.24, ANKLE, z), kneePoles: bothDir(0.25, 0, 1), rel: { Left: [-0.06, -0.24, 0.30], Right: [0.06, -0.24, 0.30] }, poles: bothDir(0.3, -1, 0), hipsY: -0.30, hipsZ: z - 0.14 });
/** ex_decel_stick (decel to stick) — three quick running steps, then the brake: the feet land wide, the hips drop back and
 *  the stick is held; walk back. */
function decelStick(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const z0 = -0.50;
  return run(scene, sk, 'ex_decel_stick', 4.8, [
    at(STANDING(z0), 0, true), at(runStep('Right', z0 + 0.40, z0), 0.4), at(runStep('Left', z0 + 0.85, z0 + 0.40), 0.65), at(runStep('Right', z0 + 1.25, z0 + 0.85), 0.9),
    at(STICK(z0 + 1.45), 1.15, true), at(STICK(z0 + 1.45), 1.9, true), at(STANDING(z0 + 1.45), 2.3, true),
    ...walkBack2(z0 + 1.45, z0, 2.3),
  ]);
}
/** ex_jump_stop — two running steps, a low hop off one foot, landing on BOTH feet at once in the athletic stance (the
 *  basketball jump stop), held; walk back. */
function jumpStop(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const z0 = -0.40;
  const hop: Pose = { bones: { Hips: [12, 0, 0], Spine: [4, 0, 0], ...legs(-24, 40), LeftFoot: [16, 0, 0], RightFoot: [16, 0, 0] }, rel: { Left: [-0.02, -0.26, 0.26], Right: [0.02, -0.26, 0.26] }, poles: bothDir(0.3, -1, 0), hipsY: 0.06, hipsZ: z0 + 1.0 };
  return run(scene, sk, 'ex_jump_stop', 4.6, [
    at(STANDING(z0), 0, true), at(runStep('Right', z0 + 0.40, z0), 0.4), at(runStep('Left', z0 + 0.85, z0 + 0.40), 0.65), at(hop, 0.88), at(STICK(z0 + 1.20), 1.08, true), at(STICK(z0 + 1.20), 1.8, true), at(STANDING(z0 + 1.20), 2.2, true),
    ...walkBack2(z0 + 1.20, z0, 2.2),
  ]);
}
/** Walk from z1 back to z0 in short steps, ending standing at z0 (closing the loop). */
function walkBack2(z1: number, z0: number, t0: number): ExKey[] {
  const keys: ExKey[] = [];
  const n = Math.max(1, Math.ceil(Math.abs(z1 - z0) / 0.4));
  for (let i = 1; i <= n; i++) {
    const zf = z1 + ((z0 - z1) * i) / n, zp = z1 + ((z0 - z1) * (i - 1)) / n;
    keys.push(at(STANDING(zf, 0, 0, zf, zp), t0 + (i - 0.5) * 0.45), at(STANDING(zf), t0 + i * 0.45, i === n));
  }
  return keys;
}
/** ex_lateral_skip — skipping sideways: the right foot leads out, the left chases it in the air, three to the right and three
 *  back to the left, light on the balls of the feet, the arms swinging out and in. */
function lateralSkip(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const keys: ExKey[] = [];
  const W = 0.14, S = 0.34;
  const ground = (x: number, open: boolean): Pose => ({ bones: { Hips: [8, 0, 0], Spine: [2, 0, 0], LeftFoot: [8, 0, 0], RightFoot: [8, 0, 0] }, feet: { Left: [x - W - (open ? 0.08 : 0), ANKLE + 0.02, 0.06], Right: [x + W + (open ? 0.08 : 0), ANKLE + 0.02, 0.06] }, kneePoles: bothDir(0.2, 0, 1), rel: open ? { Left: [-0.30, -0.22, 0.10], Right: [0.30, -0.22, 0.10] } : { Left: [-0.04, -0.46, 0.06], Right: [0.04, -0.46, 0.06] }, poles: bothDir(0.6, -0.6, -0.2), hipsY: -0.06, hipsX: x });
  const air = (x: number): Pose => ({ bones: { Hips: [4, 0, 0], ...legs(-10, 20), LeftUpLeg: [-10, 0, 10], RightUpLeg: [-10, 0, -10], LeftFoot: [28, 0, 0], RightFoot: [28, 0, 0] }, rel: { Left: [-0.40, -0.10, 0.08], Right: [0.40, -0.10, 0.08] }, poles: bothDir(0.6, -0.6, -0.2), hipsY: 0.10, hipsX: x });
  let t = 0, x = 0;
  const dir = [1, 1, 1, -1, -1, -1];
  keys.push(at(ground(0, false), 0, true)); t = 0.3;
  for (const d of dir) { keys.push(at(air(x + (d * S) / 2), t)); x += d * S; keys.push(at(ground(x, d > 0 ? false : false), t + 0.22)); t += 0.44; }
  return run(scene, sk, 'ex_lateral_skip', t + 0.2, keys);
}

export const SIGNATURE_BUILDERS: [string, Builder][] = [
  ['ex_def_stance', defStance], ['ex_sl_balance', (scene, sk) => slBalance(scene, sk, 'ex_sl_balance', false)], ['ex_sl_balance_head', (scene, sk) => slBalance(scene, sk, 'ex_sl_balance_head', true)],
  ['ex_seated_breathe', seatedBreathe], ['ex_adductor_squeeze', adductorSqueeze],
  ['ex_band_row', bandRow], ['ex_tke', tke], ['ex_lateral_walk', lateralWalk], ['ex_back_wall_arm_raise', backWallArmRaise], ['ex_wall_chin_tuck', wallChinTuck], ['ex_wall_slide_liftoff', wallSlideLiftOff],
  ['ex_box_jump', boxJump], ['ex_broad_jump_stick', broadJumpStick], ['ex_sl_hop_stick', slHopStick], ['ex_lateral_hop_stick', lateralHopStick], ['ex_drop_landing', dropLanding], ['ex_snap_down', snapDown],
  ['ex_supported_sl_rdl', supportedSlRdl], ['ex_hip_airplane', hipAirplane], ['ex_two_point_start', twoPointStart], ['ex_arm_swing', armSwing],
  ['ex_prone_t', proneT], ['ex_incline_scap_push_up', inclineScapPushup],
  ['ex_decel_stick', decelStick], ['ex_jump_stop', jumpStop], ['ex_lateral_skip', lateralSkip],
];
