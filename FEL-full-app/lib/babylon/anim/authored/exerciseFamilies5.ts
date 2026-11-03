// The next families with no loop (DEMO-LOOPS-5, 2026-11-03): trunk flexion and the upper-body stretches, each read against
// the movement its entry was imported as (free-exercise-db). Same kit and pipeline as the library's loops: GATE 0 on every
// body is poseGuard.test.ts, the floor and the closed seam exercise.test.ts.
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { ANKLE, STAND, STANCE, HANG, HANG_POLES, SEATED, SEAT_Y, LIE_Y, both, bothDir, type Deg3, type ExKey, type Pair } from './exerciseKit';
import { kneel } from './exerciseMore';
import { mirror, LIE_BACK, POSITIONS } from './exerciseFloor';
import { run, at } from './exerciseBody';

type Pose = Omit<ExKey, 't'>;
type Builder = (scene: Scene, sk: Skeleton) => AnimationGroup | null;

const TALL: Pose = { bones: { ...STAND }, feet: STANCE, hands: HANG, poles: HANG_POLES, hipsY: 0 };
const ON_HIPS: Pair = { Left: [0.04, -0.42, 0.08], Right: [-0.04, -0.42, 0.08] };
const HIPS_POLES = bothDir(1, -0.2, 0);
const HEAD_HANDS: Pair = { Left: [0.15, 0.22, -0.06], Right: [-0.15, 0.22, -0.06] };
/** a rep held a beat at each end: a → b → a */
const rep2 = (scene: Scene, sk: Skeleton, name: string, a: Pose, b: Pose, down: number, hold: number, up: number, rest: number, pivot = true) =>
  run(scene, sk, name, down + hold + up + rest, [at(a, 0, true), at(b, down, true), at(b, down + hold, true), at(a, down + hold + up, true)], pivot);

// ── trunk flexion ───────────────────────────────────────────────────────────────────────────────────────────────────

/** ex_leg_pull_in — on the back, the legs long and just off the floor, the hands flat at the sides: the knees bend and pull
 *  in to the chest, and the legs reach back out long. */
const legPullIn: Builder = (scene, sk) => {
  const p = (u: number): Pose => ({ ...LIE_BACK, bones: { ...LIE_BACK.bones, Hips: [-86 + 10 * u, 0, 0], Spine: [6 * u, 0, 0], LeftUpLeg: [-14 - 100 * u, 0, 2], RightUpLeg: [-14 - 100 * u, 0, -2], LeftLeg: [4 + 112 * u, 0, 0], RightLeg: [4 + 112 * u, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] } });
  return rep2(scene, sk, 'ex_leg_pull_in', p(0), p(1), 0.8, 0.3, 0.9, 0.3);
};

/** Lying on a flat bench, the hips at its end and the legs off it, the hands holding the bench by the hips: the straight legs
 *  rise until they point at the ceiling (ex_bench_leg_raise), or the knees pull in to the chest (ex_bench_leg_pull_in). */
function benchLegs(name: string, raise: boolean): Builder {
  const p = (thigh: number, knee: number): Pose => ({
    bones: { Hips: [-90, 0, 0], Spine: [0, 0, 0], Neck: [8, 0, 0], LeftUpLeg: [-thigh, 0, 2], RightUpLeg: [-thigh, 0, -2], LeftLeg: [knee, 0, 0], RightLeg: [knee, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] },
    kneePoles: bothDir(0, 1, 0.2), hands: both(0.20, 0.47, -0.12), poles: bothDir(0.6, 0, 0), hipsY: LIE_Y,
  });
  return (scene, sk) => rep2(scene, sk, name, p(4, 4), raise ? p(88, 6) : p(112, 112), 0.9, 0.3, 1.0, 0.3);
}

/** ex_seated_leg_tuck — sitting on the end of a bench, leaning back about 45°, the hands holding its sides behind, the legs
 *  out long a little below level: the knees draw in toward the chest as the torso comes forward to meet them; reach back out. */
const seatedLegTuck: Builder = (scene, sk) => {
  const p = (u: number): Pose => ({
    bones: { Hips: [-40 + 22 * u, 0, 0], Spine: [4 + 8 * u, 0, 0], Neck: [10, 0, 0], LeftUpLeg: [-34 - 80 * u, 0, 4], RightUpLeg: [-34 - 80 * u, 0, -4], LeftLeg: [6 + 100 * u, 0, 0], RightLeg: [6 + 100 * u, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] },
    kneePoles: bothDir(0.1, 0.3, 1), hands: both(0.21, 0.47, -0.16), poles: bothDir(0.4, 0, -1), hipsY: SEAT_Y,
  });
  return rep2(scene, sk, 'ex_seated_leg_tuck', p(0), p(1), 0.8, 0.3, 0.9, 0.3);
};

/** ex_crunch_weight — the crunch (exercise.ts ex_crunch's numbers) holding a weight to the chest with both hands. */
const crunchWeight: Builder = (scene, sk) => {
  const feet = both(0.14, ANKLE, 0.50);
  const hands: Pair = { Left: [0.15, 0.14, 0.12], Right: [-0.15, 0.14, 0.12] };
  const down: Pose = { bones: { Hips: [-84, 0, 0], Spine: [0, 0, 0], Spine1: [0, 0, 0], Neck: [10, 0, 0] }, feet, kneePoles: bothDir(0.1, 1, 0.2), rel: hands, poles: bothDir(1, -0.2, 0), hipsY: -0.82 };
  const up: Pose = { ...down, bones: { Hips: [-80, 0, 0], Spine: [18, 0, 0], Spine1: [14, 0, 0], Neck: [14, 0, 0] } };
  return rep2(scene, sk, 'ex_crunch_weight', down, up, 0.7, 0.3, 0.8, 0.3);
};

/** ex_frog_situp — on the back, the soles of the feet together and the knees dropped out (a diamond), the arms crossed to the
 *  shoulders: the torso curls up the first quarter of a sit-up, a beat, and lowers. */
const frogSitup: Builder = (scene, sk) => {
  // the soles together a little in front of the hips, the knees dropped out to the sides (the butterfly's legs, on the back)
  const legs = { LeftFoot: [-16, 0, 0] as Deg3, RightFoot: [-16, 0, 0] as Deg3 };
  const arms: Pair = { Left: [0.30, 0.12, 0.06], Right: [-0.30, 0.10, 0.08] };
  const p = (u: number): Pose => ({ ...LIE_BACK, bones: { ...LIE_BACK.bones, ...legs, Hips: [-86 + 4 * u, 0, 0], Spine: [20 * u, 0, 0], Spine1: [14 * u, 0, 0], Neck: [10 + 6 * u, 0, 0] }, feet: both(0.07, 0.10, 0.40), kneePoles: bothDir(1, 0.5, 0.2), hands: undefined, rel: arms, poles: bothDir(0.8, -0.2, 0.4) });
  return rep2(scene, sk, 'ex_frog_situp', p(0), p(1), 0.8, 0.4, 0.8, 0.3);
};

/** ex_cocoon — on the back, the legs long and the arms long overhead: the knees tuck to the chest, the hips curling off the
 *  floor, as the trunk crunches up and the arms come over to the shins; and everything reaches back out long. */
const cocoon: Builder = (scene, sk) => {
  const long: Pose = { ...LIE_BACK, bones: { ...LIE_BACK.bones, LeftUpLeg: [-8, 0, 2], RightUpLeg: [-8, 0, -2], LeftLeg: [2, 0, 0], RightLeg: [2, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] }, hands: undefined, rel: { Left: [0.10, 0.06, -0.56], Right: [-0.10, 0.06, -0.56] }, poles: bothDir(1, 0.2, 0) };
  const tuck: Pose = { ...LIE_BACK, bones: { Hips: [-66, 0, 0], Spine: [20, 0, 0], Spine1: [16, 0, 0], Neck: [16, 0, 0], LeftUpLeg: [-112, 0, 4], RightUpLeg: [-112, 0, -4], LeftLeg: [118, 0, 0], RightLeg: [118, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] }, hands: undefined, rel: { Left: [0.10, 0.36, 0.30], Right: [-0.10, 0.36, 0.30] }, poles: bothDir(1, -0.2, 0.2), hipsY: -0.80 };
  return rep2(scene, sk, 'ex_cocoon', long, tuck, 0.8, 0.3, 0.9, 0.3);
};

/** ex_bottoms_up — on the back, the legs long, the arms at the sides: tuck the knees to the chest, press the legs straight up
 *  to the ceiling, lift the hips off the floor pushing the feet higher, a beat; and back down through the tuck. */
const bottomsUp: Builder = (scene, sk) => {
  const leg = (thigh: number, knee: number, hips = -86, hy = LIE_BACK.hipsY!): Pose => ({ ...LIE_BACK, bones: { ...LIE_BACK.bones, Hips: [hips, 0, 0], Spine: [hips > -80 ? -8 : 0, 0, 0], LeftUpLeg: [-thigh, 0, 2], RightUpLeg: [-thigh, 0, -2], LeftLeg: [knee, 0, 0], RightLeg: [knee, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] }, hipsY: hy });
  const flat = leg(8, 2), tuck = leg(112, 116), up = leg(90, 4), lifted = leg(92, 4, -66, -0.76);
  return run(scene, sk, 'ex_bottoms_up', 4.2, [at(flat, 0, true), at(tuck, 0.7, true), at(up, 1.3, true), at(lifted, 1.9, true), at(lifted, 2.2, true), at(up, 2.7, true), at(tuck, 3.2, true)], true);
};

/** The rope crunch at the cable: kneeling under a high pulley with the rope held either side of the head (kneel), standing
 *  with the back to it and the rope over the shoulders (stand), or seated on a bench with the back to it (seat) — the spine
 *  curls the rib cage down toward the hips, a beat, and unrolls. */
function cableCrunch(name: string, how: 'kneel' | 'stand' | 'seat'): Builder {
  const rope: Pair = how === 'kneel' ? { Left: [0.12, 0.18, 0.04], Right: [-0.12, 0.18, 0.04] } : { Left: [0.14, 0.04, 0.10], Right: [-0.14, 0.04, 0.10] };
  const poles = how === 'kneel' ? bothDir(0.6, 0, 0.8) : bothDir(0.6, -0.6, 0.4);
  const p = (u: number): Pose => {
    const bones: Record<string, Deg3> = { Hips: [(how === 'stand' ? 12 : how === 'kneel' ? 8 : 4) * u, 0, 0], Spine: [24 * u, 0, 0], Spine1: [22 * u, 0, 0], Neck: [12 * u, 0, 0] };
    if (how === 'kneel') return kneel({ bones, rel: rope, poles, hipsY: 0 }, ['Left', 'Right']);
    if (how === 'seat') return { ...SEATED, bones: { ...SEATED.bones, ...bones }, rel: rope, poles, hipsY: SEAT_Y };
    return { bones: { ...STAND, ...bones }, feet: both(0.13, ANKLE, 0.06), kneePoles: bothDir(0.1, 0, 1), rel: rope, poles, hipsY: -0.02 * u };
  };
  return (scene, sk) => rep2(scene, sk, name, p(0), p(1), 0.8, 0.3, 0.9, 0.3);
}

// ── the upper-body stretches ─────────────────────────────────────────────────────────────────────────────────────────

/** ex_arm_swing_up (dynamic back stretch) — feet apart, the arms straight: they swing up in front, each swing higher, until
 *  they reach overhead, and swing back down past the hips. */
const armSwingUp: Builder = (scene, sk) => {
  const p = (deg: number): Pose => {
    const r = (deg * Math.PI) / 180, y = -0.56 * Math.cos(r), z = 0.56 * Math.sin(r) + 0.04;
    return { bones: { ...STAND, Spine1: [-4 * Math.max(0, Math.sin(r - Math.PI / 2)), 0, 0] }, feet: both(0.15, ANKLE, 0.06), rel: { Left: [0.06, y, z], Right: [-0.06, y, z] }, poles: bothDir(1, 0, 0), hipsY: 0 };
  };
  return run(scene, sk, 'ex_arm_swing_up', 4.2, [at(p(-14), 0), at(p(100), 0.6, true), at(p(-14), 1.2), at(p(140), 1.9, true), at(p(-14), 2.6), at(p(176), 3.4, true)], true);
};

/** ex_chest_swing (dynamic chest stretch) — the arms straight out in front, the hands together: they swing back as far as they
 *  go, wide and level, and in again, like a big clap; faster each time. */
const chestSwing: Builder = (scene, sk) => {
  const front: Pose = { bones: { ...STAND }, feet: STANCE, rel: { Left: [0.15, -0.04, 0.54], Right: [-0.15, -0.04, 0.54] }, poles: bothDir(0.2, -1, 0), hipsY: 0 };
  const open: Pose = { ...front, bones: { ...STAND, Spine1: [-4, 0, 0] }, rel: { Left: [-0.44, -0.06, -0.22], Right: [0.44, -0.06, -0.22] }, poles: bothDir(0.2, -1, 0) };
  return run(scene, sk, 'ex_chest_swing', 3.0, [at(front, 0, true), at(open, 0.55, true), at(front, 1.1, true), at(open, 1.55, true), at(front, 2.0, true), at(open, 2.4, true)], true);
};

/** ex_stand_twist (middle back stretch) — feet apart, the hands on the hips: the trunk twists at the waist to one side to the
 *  first firm pull, held; then the other way. */
const standTwist: Builder = (scene, sk) => {
  const p = (s: number): Pose => ({ bones: { ...STAND, Spine: [2, 22 * s, 0], Spine1: [0, 16 * s, 0], Neck: [0, 8 * s, 0] }, feet: both(0.15, ANKLE, 0.06), rel: ON_HIPS, poles: HIPS_POLES, hipsY: 0 });
  return run(scene, sk, 'ex_stand_twist', 7.6, [at(p(0), 0, true), at(p(1), 1.0, true), at(p(1), 3.0, true), at(p(0), 3.8, true), at(p(-1), 4.8, true), at(p(-1), 6.8, true)], true);
};

/** ex_pelvic_tilt_stand — feet hip-width, the knees soft, the hands on the hips: the pelvis rocks back and forward a few times
 *  and then holds the tailbone tucked forward. */
const pelvicTilt: Builder = (scene, sk) => {
  const p = (u: number): Pose => ({ bones: { ...STAND, Hips: [10 * u, 0, 0], Spine: [2 - 12 * u, 0, 0] }, feet: both(0.12, ANKLE, 0.06), kneePoles: bothDir(0.1, 0, 1), rel: ON_HIPS, poles: HIPS_POLES, hipsY: -0.03, hipsZ: -0.03 * u });
  return run(scene, sk, 'ex_pelvic_tilt_stand', 6.0, [at(p(0), 0, true), at(p(1), 0.6, true), at(p(-1), 1.3, true), at(p(1), 2.0, true), at(p(-1), 2.7, true), at(p(-1), 4.8, true), at(p(0), 5.5, true)], true);
};

/** ex_wrist_pull — the right arm crossed in front of the body, its wrist held by the left hand down at the hip: the left hand
 *  pulls it across and lifts it to shoulder height, the right arm straightening, held; and down. Then the other arm. */
const wristPull: Builder = (scene, sk) => {
  const p = (u: number): Pose => ({ bones: { ...STAND, Spine: [2, -6 * u, 0] }, feet: STANCE, rel: { Right: [-0.38 - 0.04 * u, -0.40 + 0.34 * u, 0.20 + 0.12 * u], Left: [-0.02 - 0.04 * u, -0.40 + 0.34 * u, 0.22 + 0.12 * u] }, poles: { Right: [0.2, -0.8, 0.6], Left: [-0.6, -0.8, 0.2] }, hipsY: 0 });
  const side = (t0: number, m: (x: Pose) => Pose): ExKey[] => [at(m(p(0)), t0 + 0.6, true), at(m(p(1)), t0 + 1.6, true), at(m(p(1)), t0 + 3.4, true), at(m(p(0)), t0 + 4.2, true)];
  return run(scene, sk, 'ex_wrist_pull', 9.6, [at(TALL, 0, true), ...side(0, (x) => x), at(TALL, 4.8, true), ...side(4.8, mirror)], true);
};

/** ex_seat_side_bend (the chair lower-back stretch) — sitting tall on a bench: one arm over the head, the other hand on the
 *  bench, the trunk bends to the side, held; then the other side. */
const seatSideBend: Builder = (scene, sk) => {
  const p = (d: number): Pose => ({ ...SEATED, bones: { ...SEATED.bones, Spine: [0, 0, 16 * d], Spine1: [0, 0, 12 * d], Neck: [0, 0, -4 * d] }, rel: { Right: [-0.10 - 0.20 * d, 0.54 - 0.06 * d, 0.0] }, hands: { Left: [-0.24, 0.47, 0.02] }, poles: { Right: [1, 0.2, 0], Left: [-0.4, 0, -1] }, hipsY: SEAT_Y });
  const tall: Pose = { ...SEATED, hands: both(0.20, 0.86 + SEAT_Y, 0.30), poles: bothDir(0.4, -1, 0), hipsY: SEAT_Y };
  const side = (t0: number, m: (x: Pose) => Pose): ExKey[] => [at(m(p(0.3)), t0 + 0.8, true), at(m(p(1)), t0 + 1.8, true), at(m(p(1)), t0 + 3.6, true), at(tall, t0 + 4.4, true)];
  return run(scene, sk, 'ex_seat_side_bend', 9.4, [at(tall, 0, true), ...side(0, (x) => x), ...side(4.6, mirror)], true);
};

/** ex_seat_twist (the seated spinal stretch) — sitting tall on a bench, the fingers laced behind the head, elbows out, chin down:
 *  the upper body twists to one side and back, the other side; then leans forward and turns to take an elbow down inside the
 *  knee, and back up. */
const seatTwist: Builder = (scene, sk) => {
  const p = (s: number, lean = 0): Pose => ({ ...SEATED, bones: { ...SEATED.bones, Hips: [34 * lean, 0, 0], Spine: [10 * lean, 20 * s, 0], Spine1: [6 * lean, 14 * s, 0], Neck: [8, 4 * s, 0] }, rel: HEAD_HANDS, poles: bothDir(1, 0.1, -0.2), hipsY: SEAT_Y });
  return run(scene, sk, 'ex_seat_twist', 8.4, [
    at(p(0), 0, true), at(p(1), 0.9, true), at(p(1), 1.6, true), at(p(-1), 2.7, true), at(p(-1), 3.4, true), at(p(0), 4.1, true),
    at(p(0, 1), 4.9, true), at(p(1, 1), 5.7, true), at(p(1, 1), 6.6, true), at(p(0, 1), 7.4, true),
  ], true);
};

/** ex_butterfly_side_reach (the seated overhead stretch) — sitting tall, the soles together in front: one hand on the floor
 *  beside the hip, the other behind the head, the elbow lifting to the ceiling as the trunk inclines to the other side;
 *  held, then the other side. */
const butterflySideReach: Builder = (scene, sk) => {
  const base = POSITIONS.butterfly[0];
  const p = (d: number): Pose => ({ ...base, bones: { ...base.bones, Spine: [4, 0, 14 * d], Spine1: [0, 0, 10 * d], Neck: [-4, 0, -4 * d] }, hands: { Left: [-0.30, 0.06, 0.02] }, rel: { Right: [-0.14, 0.24, -0.08] }, poles: { Left: [-0.5, 0, -1], Right: [0.4, 1, 0.1] } });
  const side = (t0: number, m: (x: Pose) => Pose): ExKey[] => [at(m(p(0.3)), t0 + 0.8, true), at(m(p(1)), t0 + 1.8, true), at(m(p(1)), t0 + 3.6, true), at(base, t0 + 4.4, true)];
  return run(scene, sk, 'ex_butterfly_side_reach', 9.4, [at(base, 0, true), ...side(0, (x) => x), ...side(4.6, mirror)], true);
};

export const FAMILY5_BUILDERS: readonly [string, Builder][] = [
  ['ex_leg_pull_in', legPullIn], ['ex_bench_leg_raise', benchLegs('ex_bench_leg_raise', true)], ['ex_bench_leg_pull_in', benchLegs('ex_bench_leg_pull_in', false)],
  ['ex_seated_leg_tuck', seatedLegTuck], ['ex_crunch_weight', crunchWeight], ['ex_frog_situp', frogSitup], ['ex_cocoon', cocoon], ['ex_bottoms_up', bottomsUp],
  ['ex_rope_crunch_kneel', cableCrunch('ex_rope_crunch_kneel', 'kneel')], ['ex_rope_crunch_stand', cableCrunch('ex_rope_crunch_stand', 'stand')], ['ex_rope_crunch_seat', cableCrunch('ex_rope_crunch_seat', 'seat')],
  ['ex_arm_swing_up', armSwingUp], ['ex_chest_swing', chestSwing], ['ex_stand_twist', standTwist], ['ex_pelvic_tilt_stand', pelvicTilt], ['ex_wrist_pull', wristPull],
  ['ex_seat_side_bend', seatSideBend], ['ex_seat_twist', seatTwist], ['ex_butterfly_side_reach', butterflySideReach],
];
