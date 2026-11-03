// The warm-up and the cool-down, as loops (DEMO-LOOPS-4, 2026-11-03). Owner: "Make more animations" — and every session
// plays these: FEL's generated warm-up (lib/coach/warmup.ts: the Pre-Game Wake-Up's phases, the rock-and-hold stretches,
// the pattern primers) and its cool-down (lib/coach/cooldown.ts: the recovery breath, the same rock-and-holds). The session
// player showed "Demo coming" for every one of them (lib/session-player/fromCoachToday.ts generatedStep: clip null).
// lib/library/surfaceDemo.ts WARMUP_DEMO_LOOPS maps each step id to the loop below (or to a loop the library already has).
//
// Each loop is the step's own words (lib/coach/warmupContent.ts setup + cue, lib/drills/drills.ts WAKE_UP phase cue):
//   · ROCK AND HOLD (FEL's step): "a few small, easy rocks into a position, then a still hold with a long breath out" —
//     one parametric loop, rockHold(): three rocks that go a little deeper each time, the hold, and back out. Eight steps,
//     eight start and end poses.
//   · the primers: a few quick, crisp reps ("stand up as fast as you can", "snap up tall, fast") — the library's loop poses
//     with the primer's timing (slow down, fast up), or the primer's own move (a door-frame row, a turn and stop).
//   · the Wake-Up phases the library had no loop for: the wall locks, the rib breath at 4-2-6, the tripod, the joint
//     circles, the launch.
// Same kit, same pipeline as the library's loops (exerciseKit: targets in the final frame, `rel` from the posed shoulder,
// every loop closes). Every loop is held to GATE 0 on every body by poseGuard.test.ts and to the floor by exercise.test.ts.
import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { ANKLE, TOE_ANKLE, STAND, STANCE, SQUAT_FEET, KNEES_OUT, HANG, HANG_POLES, ELBOWS_DOWN, both, bothDir, loop, mix, rep, type Deg3, type ExKey, type Pair } from './exerciseKit';
import { POSITIONS, SUPINE, CHILD } from './exerciseFloor';
import { run, at } from './exerciseBody';

type Pose = Omit<ExKey, 't'>;
type Builder = (scene: Scene, sk: Skeleton) => AnimationGroup | null;

/** The wall's face (demo.ts PROP_SHAPES wall: a 6 cm slab centred at z 0.72). */
const WALL_FACE = 0.69;
/** Hands on the hips (exerciseDrills.ts ON_HIPS). */
const ON_HIPS: Pair = { Left: [0.04, -0.42, 0.08], Right: [-0.04, -0.42, 0.08] };
const HIPS_POLES = bothDir(1, -0.2, 0);
/** Hands together at the chest (the squat's goblet hands). */
const CHEST: Pair = { Left: [0.13, -0.24, 0.26], Right: [-0.13, -0.24, 0.26] };
const TALL: Pose = { bones: { ...STAND }, feet: STANCE, hands: HANG, poles: HANG_POLES, hipsY: 0 };

// ── ROCK AND HOLD ────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * FEL's rock-and-hold: from `base`, three small rocks toward `deep` (a third, a half, two thirds of the way, each eased
 * back a little), then into `deep` and held still for a long breath out, then back to `base`. `deep` is the end of the
 * easy range the step's cue names, never past it. 7.6 s.
 */
function rockHold(scene: Scene, sk: Skeleton, name: string, base: Pose, deep: Pose, pivot = false): AnimationGroup | null {
  const keys: ExKey[] = [at(base, 0, true)];
  let t = 0.4;
  for (const [into, back] of [[0.35, 0.1], [0.55, 0.2], [0.75, 0.3]] as const) {
    keys.push(at(mix(base, deep, into), t + 0.45, true), at(mix(base, deep, back), t + 0.9));
    t += 0.9;
  }
  keys.push(at(deep, t + 0.6, true), at(deep, t + 3.4, true), at(mix(deep, base, 0.5), t + 3.9));
  return loop(scene, sk, name, t + 4.6, keys, { pivot });
}

// Half-kneeling, the left foot flat in front (the stage's floor camera sees the body's left), the right knee down.
const HK_FEET: Pair = { Left: [-0.13, ANKLE, 0.46], Right: [0.12, 0.08, -0.44] };
const HK_KNEES: Pair = { Left: [-0.1, 0, 1], Right: [0, -1, 0.1] };
const ON_FRONT_KNEE: Pair = { Left: [-0.16, 0.56, 0.52], Right: [-0.02, 0.56, 0.50] };

/** ex_ankle_rock — half-kneeling, the hands on the front knee: the knee rocks forward past the toes, the heel stays down. */
const ankleRock: Builder = (scene, sk) => {
  const base: Pose = { bones: { Hips: [-2, 0, 0], Spine: [4, 0, 0], Neck: [-4, 0, 0], RightFoot: [62, 0, 0], LeftFoot: [-4, 0, 0] }, feet: HK_FEET, kneePoles: HK_KNEES, hands: ON_FRONT_KNEE, poles: bothDir(0.8, -0.4, -0.3), hipsY: -0.47, hipsZ: 0.0 };
  const deep: Pose = { ...base, bones: { ...base.bones, Hips: [8, 0, 0], Spine: [8, 0, 0], LeftFoot: [-30, 0, 0] }, hands: { Left: [-0.16, 0.50, 0.66], Right: [-0.02, 0.50, 0.64] }, hipsY: -0.50, hipsZ: 0.16 };
  return rockHold(scene, sk, 'ex_ankle_rock', base, deep, true);
};

/** ex_wall_calf_rock — the hands on a wall, the back leg long, its heel down: lean in and out, the heel stays on the floor. */
const wallCalfRock: Builder = (scene, sk) => {
  const hands: Pair = both(0.24, 1.32, WALL_FACE - 0.03);
  const feet: Pair = { Left: [-0.12, ANKLE, WALL_FACE - 0.32], Right: [0.12, ANKLE, -0.30] };
  const base: Pose = { bones: { Hips: [6, 0, 0], Spine: [2, 0, 0], Neck: [-4, 0, 0], RightFoot: [-6, 0, 0], LeftFoot: [-8, 0, 0] }, feet, kneePoles: { Left: [-0.05, 0, 1], Right: [0.05, 0, 1] }, handsAt: hands, poles: bothDir(0.5, -0.6, -0.4), hipsY: -0.04, hipsZ: 0.06 };
  const deep: Pose = { ...base, bones: { ...base.bones, Hips: [10, 0, 0], RightFoot: [-24, 0, 0], LeftFoot: [-18, 0, 0] }, hipsY: -0.08, hipsZ: 0.18 };
  return rockHold(scene, sk, 'ex_wall_calf_rock', base, deep);
};

/** ex_deep_squat_rock — holding a post, sat in a deep squat, heels down: rocks side to side and front to back, then held. */
const deepSquatRock: Builder = (scene, sk) => {
  const p = POSITIONS.squat[0];
  const s = (x: number, z: number): Pose => ({ ...p, hipsX: x, hipsZ: z });
  const keys: ExKey[] = [at(s(0, 0), 0, true), at(s(-0.07, 0), 0.7, true), at(s(0, 0), 1.3), at(s(0.07, 0), 1.9, true), at(s(0, 0), 2.5), at(s(0, 0.06), 3.1, true), at(s(0, -0.04), 3.8, true), at(s(0, 0), 4.4, true), at(s(0, 0), 7.0, true)];
  return loop(scene, sk, 'ex_deep_squat_rock', 7.6, keys);
};

/** ex_hinge_rock — standing, soft knees, the hands sliding down the fronts of the thighs: the hips push back in small rocks, the back long. */
const hingeRock: Builder = (scene, sk) => {
  const feet = both(0.13, ANKLE, 0.12);
  const base: Pose = { bones: { ...STAND, LeftLeg: [8, 0, 0], RightLeg: [8, 0, 0] }, feet, kneePoles: bothDir(0.05, 0, 1), rel: { Left: [0.06, -0.48, 0.14], Right: [-0.06, -0.48, 0.14] }, poles: HANG_POLES, hipsY: -0.02 };
  const deep: Pose = { bones: { Hips: [50, 0, 0], Spine: [4, 0, 0], Spine1: [0, 0, 0], Neck: [-24, 0, 0], LeftLeg: [14, 0, 0], RightLeg: [14, 0, 0] }, feet, kneePoles: bothDir(0.05, 0, 1), rel: { Left: [0.06, -0.56, 0.10], Right: [-0.06, -0.56, 0.10] }, poles: HANG_POLES, hipsY: -0.08 };
  return rockHold(scene, sk, 'ex_hinge_rock', base, deep);
};

/** ex_ninety_rock — the 90/90 sit, the left shin in front: the chest stays tall and rocks forward over the front shin. */
const ninetyRock: Builder = (scene, sk) => {
  const base = POSITIONS.ninety[0];
  const deep: Pose = { ...base, bones: { ...base.bones, Hips: [26, 0, 0], Spine: [4, 0, 0], Neck: [-12, 0, 0] }, hands: { Left: [-0.18, 0.06, 0.44], Right: [0.20, 0.06, 0.40] }, poles: bothDir(0.6, 0, -0.8) };
  return rockHold(scene, sk, 'ex_ninety_rock', base, deep, true);
};

/** ex_open_book_rock — lying on the side, knees stacked: the top arm opens toward the floor behind in small rocks, knees together. */
const openBookRock: Builder = (scene, sk) => rockHold(scene, sk, 'ex_open_book_rock', POSITIONS.openbook[0], POSITIONS.openbook[1], true);

/** ex_kneeling_reach_rock — kneeling, the hands on the floor out in front, arms long: the hips rock back toward the heels, the chest easing down. */
const kneelingReachRock: Builder = (scene, sk) => {
  const reach: Pair = both(0.20, 0.05, 0.86);
  const base: Pose = { ...POSITIONS.rockback[0], hands: reach, poles: bothDir(0.3, 0.2, -1), bones: { ...POSITIONS.rockback[0].bones, Hips: [84, 0, 0], Neck: [-36, 0, 0] } };
  const deep: Pose = { ...CHILD, hands: reach };
  return rockHold(scene, sk, 'ex_kneeling_reach_rock', base, deep, true);
};

/** The door post the doorway steps stand at (demo.ts PROP_SHAPES doorpost: the post's inner face at x 0.64). */
const POST_FACE = 0.64;
/** ex_doorway_chest_rock — the right forearm up on a door post, the elbow at shoulder height: step through a little at a
 *  time, the chest going past the post, easy on the front of the shoulder. */
const doorwayChestRock: Builder = (scene, sk) => {
  const arm: Pair = { Right: [POST_FACE - 0.02, 1.62, 0.04], Left: [-0.24, 0.84, 0.06] };
  const poles: Pair = { Right: [1, -1, 0], Left: HANG_POLES.Left };
  const base: Pose = { bones: { ...STAND }, feet: { Left: [-0.12, ANKLE, 0.12], Right: [0.13, ANKLE, -0.04] }, kneePoles: bothDir(0.05, 0, 1), handsAt: arm, poles, hipsY: 0 };
  const deep: Pose = { bones: { ...STAND, Spine: [0, 6, 0], Spine1: [0, 4, 0], RightFoot: [-6, 0, 0] }, feet: { Left: [-0.12, ANKLE, 0.34], Right: [0.13, ANKLE, -0.04] }, kneePoles: bothDir(0.05, 0, 1), handsAt: arm, poles, hipsY: -0.04, hipsZ: 0.16 };
  return rockHold(scene, sk, 'ex_doorway_chest_rock', base, deep);
};

// ── the Wake-Up phases ───────────────────────────────────────────────────────────────────────────────────────────────

/** ex_wall_locks (Release the Locks) — the hands on a wall in a split stance, contract and relax, sinking a little further:
 *  first the front ankle (the front knee drives over the toes), then the back hip (the hips go forward, ribs over the pelvis). */
const wallLocks: Builder = (scene, sk) => {
  const hands: Pair = both(0.24, 1.30, WALL_FACE - 0.03);
  const feet: Pair = { Left: [-0.12, ANKLE, WALL_FACE - 0.30], Right: [0.12, ANKLE + 0.08, -0.36] };
  const knees: Pair = { Left: [-0.05, 0, 1], Right: [0.05, 0, 1] };
  const base: Pose = { bones: { Hips: [6, 0, 0], Spine: [2, 0, 0], Neck: [-4, 0, 0], RightFoot: [26, 0, 0], LeftFoot: [-6, 0, 0] }, feet, kneePoles: knees, handsAt: hands, poles: bothDir(0.5, -0.6, -0.4), hipsY: -0.06, hipsZ: 0.04 };
  const ankle = (d: number): Pose => ({ ...base, bones: { ...base.bones, Hips: [8 + 8 * d, 0, 0], LeftFoot: [-6 - 26 * d, 0, 0] }, hipsY: -0.06 - 0.10 * d, hipsZ: 0.04 + 0.14 * d });
  const hip = (d: number): Pose => ({ ...base, bones: { ...base.bones, Hips: [6 - 10 * d, 0, 0], Spine: [2 - 4 * d, 0, 0], LeftFoot: [-6 - 14 * d, 0, 0] }, hipsY: -0.06 - 0.12 * d, hipsZ: 0.04 + 0.20 * d });
  return run(scene, sk, 'ex_wall_locks', 9.0, [
    at(base, 0, true), at(ankle(0.7), 0.8, true), at(ankle(0.4), 1.6, true), at(ankle(1), 2.4, true), at(ankle(1), 3.4, true), at(base, 4.2, true),
    at(hip(0.7), 5.0, true), at(hip(0.4), 5.8, true), at(hip(1), 6.6, true), at(hip(1), 7.6, true), at(base, 8.4, true),
  ]);
};

/** The rib breath (Pressurize the System): standing tall, the hands on the lower ribs; in for 4, hold 2, out for 6 — the
 *  ribs widen into the hands and the chest stays down. */
const RIBS: Pair = { Left: [0.05, -0.30, 0.16], Right: [-0.05, -0.30, 0.16] };
const ribBreath = (inhale: number): Pose => ({ bones: { ...STAND, Spine: [2 - inhale * 3, 0, 0], Spine1: [-inhale * 2, 0, 0] }, feet: STANCE, kneePoles: bothDir(0.1, 0, 1), rel: { Left: [RIBS.Left![0] - inhale * 0.012, RIBS.Left![1], RIBS.Left![2]], Right: [RIBS.Right![0] + inhale * 0.012, RIBS.Right![1], RIBS.Right![2]] }, poles: bothDir(0.8, -0.5, 0), hipsY: inhale * 0.008 });
/** ex_breathe_ribs — the 4-2-6 breath, hands on the lower ribs. 12 s: one breath. */
const breatheRibs: Builder = (scene, sk) => loop(scene, sk, 'ex_breathe_ribs', 12.0, [at(ribBreath(0), 0, true), at(ribBreath(1), 4.0, true), at(ribBreath(1), 6.0, true)]);

/** ex_breathe_supine (the cool-down's recovery breath) — on the back, knees bent, one hand on the belly and one on the lower
 *  ribs: in through the nose for 4, out slow for 6, a short pause. 12 s. */
const breatheSupine: Builder = (scene, sk) => {
  const at0 = (inhale: number): Pose => ({ ...SUPINE, bones: { ...SUPINE.bones, Spine: [0, 0, 0], Spine1: [-inhale * 3, 0, 0] }, rel: { Left: [0.16, 0.10 + inhale * 0.02, 0.40], Right: [-0.10, 0.12 + inhale * 0.015, 0.22] }, hands: undefined, poles: bothDir(1, 0.2, 0) });
  return loop(scene, sk, 'ex_breathe_supine', 12.0, [at(at0(0), 0, true), at(at0(1), 4.0, true), at(at0(0), 10.0, true)], { pivot: true });
};

/** ex_tripod (Wake Up the Tripod) — standing, the hands on the hips: the weight settles onto one foot, its arch draws up
 *  (heel, big-toe base, little-toe base stay down) and holds for three, again; then the other foot. */
const tripod: Builder = (scene, sk) => {
  const p = (s: -1 | 0 | 1, arch: number): Pose => ({
    bones: { ...STAND, LeftFoot: [0, 0, s < 0 ? -5 * arch : 0], RightFoot: [0, 0, s > 0 ? 5 * arch : 0], LeftToeBase: [s < 0 ? -8 * arch : 0, 0, 0], RightToeBase: [s > 0 ? -8 * arch : 0, 0, 0] },
    feet: STANCE, kneePoles: bothDir(0.05, 0, 1), rel: ON_HIPS, poles: HIPS_POLES, hipsY: -0.01, hipsX: s * 0.035,
  });
  return loop(scene, sk, 'ex_tripod', 12.0, [
    at(p(0, 0), 0, true), at(p(-1, 0), 0.8, true), at(p(-1, 1), 1.4, true), at(p(-1, 1), 3.0, true), at(p(-1, 0), 3.6, true), at(p(-1, 1), 4.2, true), at(p(-1, 1), 5.4, true), at(p(0, 0), 6.0, true),
    at(p(1, 0), 6.8, true), at(p(1, 1), 7.4, true), at(p(1, 1), 9.0, true), at(p(1, 0), 9.6, true), at(p(1, 1), 10.2, true), at(p(1, 1), 11.2, true),
  ]);
};

/** ex_joint_circles (Open the Joints) — on the right foot, the hands on the hips: the left foot just off the floor draws
 *  slow ankle circles, then the left knee comes up to hip height and the hip circles. */
const jointCircles: Builder = (scene, sk) => {
  const base: Pose = { bones: { ...STAND }, feet: { Right: [0.10, ANKLE, 0.06] }, kneePoles: { Right: [0.05, 0, 1] }, rel: ON_HIPS, poles: HIPS_POLES, hipsY: 0, hipsX: 0.05 };
  const ankle = (a: number): Pose => ({ ...base, bones: { ...STAND, LeftUpLeg: [-26, 0, 2], LeftLeg: [30, 0, 0], LeftFoot: [14 * Math.cos(a), 0, 14 * Math.sin(a)] } });
  const hip = (a: number): Pose => ({ ...base, bones: { ...STAND, LeftUpLeg: [-62 + 18 * Math.cos(a), 0, 18 * Math.sin(a) + 4], LeftLeg: [80, 0, 0], LeftFoot: [10, 0, 0] } });
  const keys: ExKey[] = [at({ ...base, bones: { ...STAND }, feet: both(0.10, ANKLE, 0.06), kneePoles: bothDir(0.05, 0, 1), hipsX: 0 }, 0, true)];
  for (let i = 0; i <= 12; i++) keys.push(at(ankle((i / 6) * 2 * Math.PI), 0.6 + i * 0.3, i === 0 || i === 12));
  for (let i = 0; i <= 8; i++) keys.push(at(hip((i / 8) * 2 * Math.PI), 5.0 + i * 0.3, i === 0 || i === 8));
  return run(scene, sk, 'ex_joint_circles', 8.8, keys);
};

// The two-foot jump's poses (exerciseDrills.ts ex_wake_up's launch: the same numbers).
const legs = (thigh: number, knee: number): Record<string, Deg3> => ({ LeftUpLeg: [thigh, 0, 4], RightUpLeg: [thigh, 0, -4], LeftLeg: [knee, 0, 0], RightLeg: [knee, 0, 0] });
const DIP: Pose = { bones: { Hips: [24, 0, 0], Spine: [12, 0, 0], Neck: [-14, 0, 0], LeftFoot: [-20, 0, 0], RightFoot: [-20, 0, 0] }, feet: STANCE, kneePoles: bothDir(0.15, 0, 1), hands: both(0.26, 0.62, -0.30), poles: bothDir(0.3, 0.3, -0.9), hipsY: -0.28 };
const takeoff = (h: number): Pose => ({ bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], ...legs(-4, 4), LeftFoot: [34, 0, 0], RightFoot: [34, 0, 0] }, hands: both(0.20, 1.95 + h, 0.12), poles: bothDir(0.9, 0.1, -0.3), hipsY: 0.06 + h * 0.4 });
const peak = (h: number): Pose => ({ bones: { Hips: [0, 0, 0], Spine: [-2, 0, 0], ...legs(-10, 14), LeftFoot: [26, 0, 0], RightFoot: [26, 0, 0] }, hands: both(0.22, 2.0 + h, 0.14), poles: bothDir(0.9, 0.1, -0.3), hipsY: h });
const STICK: Pose = { bones: { Hips: [20, 0, 0], Spine: [10, 0, 0], Neck: [-10, 0, 0], LeftFoot: [-16, 0, 0], RightFoot: [-16, 0, 0] }, feet: STANCE, kneePoles: bothDir(0.15, 0, 1), hands: both(0.26, 0.70, 0.34), poles: HANG_POLES, hipsY: -0.22 };
const swing = (p: Pose): Pose => ({ ...p, bones: { ...p.bones, Hips: [8, 0, 0], Spine: [2, 0, 0] }, hands: both(0.24, 1.40, 0.10), hipsY: -0.02 });

/** ex_squat_jump_stick (the squat jump primer) — dip, jump a little way up, land quiet and stick it for a two-count. */
const squatJumpStick: Builder = (scene, sk) => run(scene, sk, 'ex_squat_jump_stick', 3.6, [
  at(TALL, 0, true), at(DIP, 0.5, true), at(swing(DIP), 0.7), at(takeoff(0.12), 0.82), at(peak(0.14), 1.0, true), at(STICK, 1.36, true), at(STICK, 2.4, true), at(TALL, 3.0, true),
]);

/** ex_launch (Prime the Launch) — stance, dip, jump, land and pause; then a low hop and a stomp, held. */
const launch: Builder = (scene, sk) => {
  const hopAir: Pose = { bones: { ...STAND, ...legs(-6, 10), LeftFoot: [24, 0, 0], RightFoot: [24, 0, 0] }, hands: both(0.26, 1.02, 0.20), poles: bothDir(0.3, -0.4, -0.8), hipsY: 0.06 };
  const stomp: Pose = { ...STICK, bones: { ...STICK.bones, Hips: [16, 0, 0], Spine: [8, 0, 0] }, feet: both(0.16, ANKLE, 0.08), hands: both(0.30, 0.78, 0.30), hipsY: -0.18 };
  return run(scene, sk, 'ex_launch', 6.2, [
    at(TALL, 0, true), at(DIP, 0.5, true), at(swing(DIP), 0.7), at(takeoff(0.22), 0.82), at(peak(0.24), 1.02, true), at(STICK, 1.4, true), at(STICK, 2.2, true), at(TALL, 2.8, true),
    at({ ...TALL, bones: { ...STAND, Hips: [6, 0, 0] }, hipsY: -0.05, kneePoles: bothDir(0.1, 0, 1) }, 3.3), at(hopAir, 3.55), at(stomp, 3.8, true), at(stomp, 4.9, true), at(TALL, 5.6, true),
  ]);
};

// ── the primers ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** ex_fast_squat (Fast Squat Primer) — sit down under control, stand up as fast as you can, heels down. */
const fastSquat: Builder = (scene, sk) => {
  const top: Pose = { bones: { ...STAND, Hips: [4, 0, 0] }, feet: SQUAT_FEET, kneePoles: KNEES_OUT, rel: CHEST, poles: ELBOWS_DOWN, hipsY: 0 };
  const bottom: Pose = { bones: { Hips: [26, 0, 0], Spine: [10, 0, 0], Spine1: [0, 0, 0], Neck: [-18, 0, 0], LeftFoot: [-34, 0, 0], RightFoot: [-34, 0, 0] }, feet: SQUAT_FEET, kneePoles: KNEES_OUT, rel: { Left: [0.13, -0.26, 0.30], Right: [-0.13, -0.26, 0.30] }, poles: ELBOWS_DOWN, hipsY: -0.40 };
  return rep(scene, sk, 'ex_fast_squat', top, bottom, 1.3, 0.1, 0.35, 0.65);
};

/** ex_hip_snap (Hip Snap Primer) — the hands on the hips, the hips pushed back toward the wall behind, then snapped up tall, fast. */
const hipSnap: Builder = (scene, sk) => {
  const feet = both(0.13, ANKLE, 0.14);
  const top: Pose = { bones: { ...STAND, LeftLeg: [4, 0, 0], RightLeg: [4, 0, 0] }, feet, kneePoles: bothDir(0.05, 0, 1), rel: ON_HIPS, poles: HIPS_POLES, hipsY: 0 };
  const back: Pose = { bones: { Hips: [52, 0, 0], Spine: [4, 0, 0], Spine1: [0, 0, 0], Neck: [-26, 0, 0], LeftLeg: [16, 0, 0], RightLeg: [16, 0, 0] }, feet, kneePoles: bothDir(0.05, 0, 1), rel: ON_HIPS, poles: HIPS_POLES, hipsY: -0.08 };
  return rep(scene, sk, 'ex_hip_snap', top, back, 0.9, 0.1, 0.3, 0.55);
};

// The split stance (ex_split_squat's): the left foot in front, the right behind on its toes.
const SPLIT_FEET: Pair = { Left: [-0.13, ANKLE, 0.30], Right: [0.13, 0.13, -0.36] };
const SPLIT_TOP: Pose = { bones: { ...STAND, RightFoot: [18, 0, 0] }, feet: SPLIT_FEET, kneePoles: bothDir(0.1, 0, 1), hands: both(0.24, 0.84 - 0.08, 0.06), poles: HANG_POLES, hipsY: -0.08 };
const SPLIT_LOW: Pose = { bones: { ...STAND, Spine: [4, 0, 0], RightFoot: [-6, 0, 0], LeftFoot: [-14, 0, 0] }, feet: SPLIT_FEET, kneePoles: { Left: [-0.1, 0, 1], Right: [0, -1, 0.3] }, hands: both(0.24, 0.84 - 0.38, 0.06), poles: HANG_POLES, hipsY: -0.42 };

/** ex_split_drive (Split Squat Drive Primer) — lower slow, then drive the floor away fast through the front heel. */
const splitDrive: Builder = (scene, sk) => rep(scene, sk, 'ex_split_drive', SPLIT_TOP, SPLIT_LOW, 1.3, 0.1, 0.35, 0.6);

/** ex_split_hop (Split Stance Hop Primer) — in a split stance, small quick hops, landing in the same stance each time. */
const splitHop: Builder = (scene, sk) => {
  const ground: Pose = { ...SPLIT_TOP, feet: { Left: SPLIT_FEET.Left, Right: [0.13, 0.15, -0.36] }, bones: { ...SPLIT_TOP.bones, Hips: [4, 0, 0] }, kneePoles: { Left: [-0.1, 0, 1], Right: [0, -0.6, 0.6] }, hands: both(0.26, 0.86, 0.14), poles: bothDir(0.2, -0.4, -0.8), hipsY: -0.14 };
  const air: Pose = { bones: { ...STAND, LeftUpLeg: [-24, 0, 3], LeftLeg: [18, 0, 0], LeftFoot: [18, 0, 0], RightUpLeg: [18, 0, -3], RightLeg: [26, 0, 0], RightFoot: [34, 0, 0] }, hands: both(0.26, 0.98, 0.14), poles: bothDir(0.2, -0.4, -0.8), hipsY: 0.02 };
  return loop(scene, sk, 'ex_split_hop', 2.6, [
    at(SPLIT_TOP, 0, true), at(ground, 0.4), at(air, 0.6), at(ground, 0.8), at(air, 1.0), at(ground, 1.2), at(air, 1.4), at(ground, 1.6, true), at(ground, 2.0, true),
  ]);
};

/** ex_fast_pushup (Fast Push-Up Primer) — lower under control, push the floor away fast. */
const fastPushup: Builder = (scene, sk) => {
  const feet = both(0.11, TOE_ANKLE, -0.90);
  const knees = bothDir(0, -1, 0.1);
  const top: Pose = { bones: { Hips: [70, 0, 0], Spine: [0, 0, 0], Neck: [-30, 0, 0], LeftFoot: [8, 0, 0], RightFoot: [8, 0, 0] }, feet, kneePoles: knees, hands: both(0.24, 0.05, 0.44), poles: bothDir(0.6, 0.2, -0.7), hipsY: -0.58 };
  const bottom: Pose = { bones: { Hips: [84, 0, 0], Spine: [0, 0, 0], Neck: [-40, 0, 0], LeftFoot: [8, 0, 0], RightFoot: [8, 0, 0] }, feet, kneePoles: knees, hands: both(0.26, 0.05, 0.44), poles: bothDir(0.7, 0.4, -0.5), hipsY: -0.80 };
  return rep(scene, sk, 'ex_fast_pushup', top, bottom, 1.0, 0.05, 0.3, 0.55);
};

/** The two posts of a doorway in front (demo.ts PROP_SHAPES doorway). */
const DOOR_GRIP: Pair = { Left: [-0.30, 1.12, 0.50], Right: [0.30, 1.12, 0.50] };
/** ex_door_row (Fast Row Primer) — holding a sturdy door frame, leaning back on straight arms: pull the chest in to the
 *  hands fast, lower slowly. */
const doorRow: Builder = (scene, sk) => {
  const feet = both(0.13, ANKLE, 0.30);
  const lean: Pose = { bones: { Hips: [-16, 0, 0], Spine: [0, 0, 0], Neck: [10, 0, 0], LeftLeg: [4, 0, 0], RightLeg: [4, 0, 0], LeftFoot: [-10, 0, 0], RightFoot: [-10, 0, 0] }, feet, kneePoles: bothDir(0.05, 0, 1), handsAt: DOOR_GRIP, poles: bothDir(0.6, -0.8, 0), hipsY: -0.06, hipsZ: -0.24 };
  const pulled: Pose = { ...lean, bones: { ...lean.bones, Hips: [-6, 0, 0], Neck: [4, 0, 0], LeftFoot: [-4, 0, 0], RightFoot: [-4, 0, 0] }, poles: bothDir(0.8, -0.4, -0.4), hipsY: -0.02, hipsZ: -0.02 };
  return rep(scene, sk, 'ex_door_row', lean, pulled, 0.35, 0.15, 1.2, 0.5);
};

/** ex_turn_stop (Turn and Stop Primer) — hands together in front, turn fast from the hips one way, stop square and still;
 *  then the other way. The feet stay where they are. */
const turnStop: Builder = (scene, sk) => {
  const hands: Pair = { Left: [0.20, -0.20, 0.40], Right: [-0.20, -0.20, 0.40] };
  const p = (yaw: number): Pose => ({ bones: { Hips: [4, yaw * 0.55, 0], Spine: [2, yaw * 0.30, 0], Spine1: [0, yaw * 0.15, 0], Neck: [0, -yaw * 0.2, 0] }, feet: both(0.16, ANKLE, 0.08), kneePoles: bothDir(0.15, 0, 1), rel: hands, poles: ELBOWS_DOWN, hipsY: -0.06 });
  return loop(scene, sk, 'ex_turn_stop', 3.6, [
    at(p(0), 0, true), at(p(0), 0.5, true), at(p(50), 0.75, true), at(p(50), 1.05, true), at(p(0), 1.3, true), at(p(0), 1.8, true), at(p(-50), 2.05, true), at(p(-50), 2.35, true), at(p(0), 2.6, true),
  ]);
};

/** ex_pogo_stick (Pogo and Stick Primer) — quick, quiet pogos on the balls of the feet, then one low hop: land and stick it. */
const pogoStick: Builder = (scene, sk) => {
  const down: Pose = { bones: { ...STAND, Hips: [4, 0, 0] }, feet: STANCE, kneePoles: bothDir(0.1, 0, 1), hands: both(0.26, 0.91, 0.16), poles: bothDir(0.15, -0.4, -1), hipsY: -0.05 };
  const up: Pose = { bones: { ...STAND, LeftUpLeg: [-4, 0, 3], RightUpLeg: [-4, 0, -3], LeftLeg: [6, 0, 0], RightLeg: [6, 0, 0], LeftFoot: [28, 0, 0], RightFoot: [28, 0, 0] }, hands: both(0.26, 1.08, 0.16), poles: bothDir(0.15, -0.4, -1), hipsY: 0.10 };
  const keys: ExKey[] = [at(TALL, 0, true)];
  for (let i = 0; i < 6; i++) keys.push(at(down, 0.3 + i * 0.4), at(up, 0.5 + i * 0.4));
  keys.push(at(down, 2.7), at({ ...up, hipsY: 0.18, bones: { ...up.bones, ...legs(-10, 16) } }, 2.95), at(STICK, 3.25, true), at(STICK, 4.3, true), at(TALL, 4.9, true));
  return run(scene, sk, 'ex_pogo_stick', 5.4, keys);
};

/** ex_squat_reach (Squat and Reach Primer) — squat down, stand up into a long reach overhead; smooth, then brisk. */
const squatReach: Builder = (scene, sk) => {
  const reach: Pose = { bones: { ...STAND, Spine: [-2, 0, 0], Neck: [4, 0, 0], LeftFoot: [10, 0, 0], RightFoot: [10, 0, 0] }, feet: { Left: [-0.19, ANKLE + 0.03, 0.10], Right: [0.19, ANKLE + 0.03, 0.10] }, kneePoles: KNEES_OUT, rel: { Left: [-0.04, 0.64, 0.04], Right: [0.04, 0.64, 0.04] }, poles: bothDir(1, 0.1, -0.1), hipsY: 0.03 };
  const top: Pose = { bones: { ...STAND, Hips: [4, 0, 0] }, feet: SQUAT_FEET, kneePoles: KNEES_OUT, rel: CHEST, poles: ELBOWS_DOWN, hipsY: 0 };
  const bottom: Pose = { bones: { Hips: [26, 0, 0], Spine: [10, 0, 0], Spine1: [0, 0, 0], Neck: [-18, 0, 0], LeftFoot: [-34, 0, 0], RightFoot: [-34, 0, 0] }, feet: SQUAT_FEET, kneePoles: KNEES_OUT, rel: { Left: [0.13, -0.26, 0.30], Right: [-0.13, -0.26, 0.30] }, poles: ELBOWS_DOWN, hipsY: -0.40 };
  return loop(scene, sk, 'ex_squat_reach', 3.6, [
    at(top, 0, true), at(mix(top, bottom, 0.5), 0.55), at(bottom, 1.1, true), at(mix(bottom, top, 0.5), 1.45), at(top, 1.75), at(reach, 2.05, true), at(reach, 2.6, true), at(top, 3.1, true),
  ]);
};

export const WARMUP_BUILDERS: readonly [string, Builder][] = [
  ['ex_ankle_rock', ankleRock], ['ex_wall_calf_rock', wallCalfRock], ['ex_deep_squat_rock', deepSquatRock], ['ex_hinge_rock', hingeRock],
  ['ex_ninety_rock', ninetyRock], ['ex_open_book_rock', openBookRock], ['ex_kneeling_reach_rock', kneelingReachRock], ['ex_doorway_chest_rock', doorwayChestRock],
  ['ex_wall_locks', wallLocks], ['ex_breathe_ribs', breatheRibs], ['ex_breathe_supine', breatheSupine], ['ex_tripod', tripod], ['ex_joint_circles', jointCircles],
  ['ex_launch', launch], ['ex_squat_jump_stick', squatJumpStick],
  ['ex_fast_squat', fastSquat], ['ex_hip_snap', hipSnap], ['ex_split_drive', splitDrive], ['ex_split_hop', splitHop], ['ex_fast_pushup', fastPushup],
  ['ex_door_row', doorRow], ['ex_turn_stop', turnStop], ['ex_pogo_stick', pogoStick], ['ex_squat_reach', squatReach],
];

