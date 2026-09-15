// Board suite — the riding vocabulary for skate, surf and snowboard.
//
// WHY THIS EXISTS
// Every board clip in the game was an ALIAS onto a karate or basketball move:
//
//   board_ride_idle -> guard @0.6      the rider's whole stance was a karate guard
//   board_tuck      -> guard @1.25
//   board_grab      -> jumpshot @0.4
//   skate_kickflip  -> high_kick
//   skate_treflip   -> roundhouse
//   skate_bail      -> guard
//
// Nothing errored, because the alias table is a graceful-degradation net and
// every one of those names resolved to a real, playing clip. The rider simply
// stood in a martial-arts stance on a moving board — which is exactly what the
// first capture of Skate showed: bolt upright, arms at his sides, on a plank.
//
// These are authored against the same rig as every other suite, so `resolveClip`
// prefers them over the aliases automatically (exact name beats alias) and all
// three board modes pick them up with no mode changes.
//
// STANCE NOTES. A board rider is not a runner: the knees carry everything, the
// arms are out as a counterweight, turning is a LEAN rather than a step, and
// air is a tuck.
//
// THE ARMS ARE POSE TARGETS NOW (VENICE-SKATE-THPS, 2026-09-09). This suite used to key `LeftArm` / `LeftForeArm` as
// Euler degrees, and a clipBuilder key rotates a bone about its PARENT's bind axes — on this rig the upper arm's bind X
// is (near) the arm's own long axis, so `LeftForeArm: [.., 34, 0, 0]` was a TWIST and never bent an elbow. Half the
// clips (carve, air, grind, land, kickflip) did not key the forearm at all. Measured on the live Venice rider, per
// rendered frame: BOTH elbows held 169–170° for 1241 of 1241 frames across push, carve, ollie, kickflip and manual —
// a scarecrow riding a plank, which is what Elijah's eye called "arms stiff T-pose". karate.ts hit exactly this and
// solved it by authoring HAND TARGETS; the same fix here needed one addition, `PoseKey.handsRel` (poseClip.ts): a wrist
// target measured from the POSED SHOULDER rather than from the root, because a board stance has already yawed the hips
// 74° by the time the arms are solved. Its LENGTH is the elbow angle — |rel| = REF_ARM_LEN (0.54) is a locked straight
// arm, 0.50 ≈ 135°, 0.46 ≈ 117°, 0.42 ≈ 102°, 0.36 ≈ 84° — so every arm below reads as a number you can check.
//
// But the thing that reads first, before any of that, is that a rider stands
// ACROSS the deck. Feet point along the board, hips and shoulders square to it,
// and the head turns back over the leading shoulder to look down the line. The
// first version of these clips missed exactly that: they carried a 16-degree
// spine twist and nothing else, so the rider faced dead ahead, chest to the
// wind, like someone standing on a plank rather than riding it.
//
// The correction belongs in the HIPS, not the spine. The legs are keyed in the
// hips' local frame, so yawing the hips carries the feet across the deck with
// them and the knees bend toward the toe edge -- which is what they really do.
// The board itself is parented to the character root, not the skeleton, so the
// deck stays pointed down the direction of travel while the rider turns on top
// of it. The spine chain then counter-rotates to bring the eyes back forward.

import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3, type PoseKey } from '../poseClip';

/** Degrees the hips turn off the direction of travel. Regular stance. */
const STANCE_YAW = 74;
/**
 * Counter-twist spread up the spine so the head ends up looking down the line.
 * These sum to -72 against the hips' +74, leaving the gaze 2 degrees open --
 * a rider does look slightly across their own line, not straight over the nose.
 * Spreading it over four joints is what keeps it from reading as a broken neck.
 */
const COUNTER: Record<string, number> = { Spine: -16, Spine1: -16, Neck: -28, Head: -12 };

type Bones = Record<string, Deg3>;

/**
 * Turn a square-shouldered pose into a real board stance.
 *
 * `open` unwinds it for the bail: the rider is coming OFF the board, so the stance has to break rather than hold --
 * keeping a textbook stance through a crash is what makes a fall look like a dance move.
 */
function stanced(bones: Bones, open = 1): Bones {
  const out: Bones = { ...bones };
  const h = bones.Hips;
  out.Hips = [h?.[0] ?? 0, STANCE_YAW * open, h?.[2] ?? 0];
  for (const [bone, deg] of Object.entries(COUNTER)) {
    const cur = bones[bone];
    out[bone] = [cur?.[0] ?? 0, deg * open, cur?.[2] ?? 0];
  }
  return out;
}

/** Elbows point down and behind the rider — the counterweight shape, never a chicken wing. */
const POLE_L: [number, number, number] = [-0.62, -0.52, -0.58];
const POLE_R: [number, number, number] = [0.62, -0.52, -0.58];
const POLES = { Left: POLE_L, Right: POLE_R };

/** One key: torso/leg degrees, both wrists as shoulder-relative targets, and the hips' ride height. */
function key(t: number, bones: Bones, L: [number, number, number], R: [number, number, number], hipsY: number, open = 1): PoseKey {
  return { t, bones: stanced(bones, open), handsRel: { Left: L, Right: R }, poles: POLES, hipsY };
}

/** The legs every ground ride shares: knees bent, weight forward, the front knee carrying more. */
function rideLegs(depth: number): Bones {
  return {
    LeftUpLeg: [-44 - depth, 0, 8], LeftLeg: [72 + depth * 1.4, 0, 0],
    RightUpLeg: [-40 - depth, 0, -10], RightLeg: [68 + depth * 1.4, 0, 0],
  };
}

// Cruising counterweight arms (SHARED-ANIM-BUS, 2026-09-14): LOW and a little out. These were [∓0.40, -0.14, …] — 0.14 m
// under the shoulder, so both wrists rode at shoulder height (measured live: front hand 0.03 m under its shoulder, back
// hand 0.33 m out, on 503/503 ride frames) and the rider cruised in the stiff-T the eye flagged. The balance acts
// (grind, manual) keep their arms out on purpose; the cruise and the push do not. |rel| still ≈ 0.46 (elbows ~117°).
const CRUISE_L: [number, number, number] = [-0.30, -0.34, 0.14];
const CRUISE_R: [number, number, number] = [0.30, -0.34, 0.06];

/** Knees bent, arms low, spine twisted toward the nose. The base of everything. */
export function buildBoardRideIdle(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 2.4;                                  // slow breathing loop
  const torso = (x: number): Bones => ({ Spine: [x, 0, 0], Spine1: [4, 0, 0], Neck: [-6, 0, 0] });
  return buildPoseClip(scene, sk, 'board_ride_idle', T, [
    key(0, { ...rideLegs(0), ...torso(14) }, CRUISE_L, CRUISE_R, -0.26),
    key(T / 2, { ...rideLegs(6), ...torso(17) }, [-0.29, -0.36, 0.16], [0.29, -0.36, 0.08], -0.29),
    key(T, { ...rideLegs(0), ...torso(14) }, CRUISE_L, CRUISE_R, -0.26),
  ]);
}

// HOLD LOOPS (ANIM-READABILITY, 2026-09-07). The carve, the tuck and the grab were keyed as one-way transitions —
// stance at t=0, the pose at t=T — and played as LOOPS, so every cycle snapped the rider back upright: measured on the
// snowboard baseline as a 0.60 m hand jump every 0.6 s for the whole run (the tuck is the throttle there), 0.5 s on a
// held carve, 0.7 s on a held grab. The way IN is the animator's crossfade; the loop itself starts in the pose, breathes
// a hair deeper at the midpoint and returns, so its wrap is seamless.

/** Lean into the turn. `sign` is +1 for a toeside/right carve, -1 for heelside. Held pose, loops clean. */
function carve(scene: Scene, sk: Skeleton, name: string, sign: number): AnimationGroup | null {
  const T = 0.8;
  const roll = 22 * sign;
  const legs = (depth: number): Bones => ({
    LeftUpLeg: [-52 - depth, 0, 8 + 5 * sign], LeftLeg: [84 + depth * 1.5, 0, 0],
    RightUpLeg: [-48 - depth, 0, -10 + 5 * sign], RightLeg: [80 + depth * 1.5, 0, 0],
  });
  const torso = (x: number, r: number): Bones => ({ Spine: [x, 0, r], Spine1: [6, 0, r * 0.5], Neck: [-4, 0, r * 0.3] });
  // the arm on the OUTSIDE of the turn reaches across the arc; the inside arm drops toward the edge it is riding
  const lead: [number, number, number] = sign > 0 ? [-0.30, -0.05, 0.34] : [-0.36, -0.26, -0.10];
  const trail: [number, number, number] = sign > 0 ? [0.36, -0.28, -0.12] : [0.30, -0.02, 0.34];
  const dip = (v: [number, number, number], k: number): [number, number, number] => [v[0], v[1] - k, v[2] + k * 0.4];
  return buildPoseClip(scene, sk, name, T, [
    key(0, { ...legs(0), ...torso(16, roll) }, lead, trail, -0.32),
    key(T / 2, { ...legs(4), ...torso(18, roll * 1.15) }, dip(lead, 0.03), dip(trail, 0.03), -0.34),
    key(T, { ...legs(0), ...torso(16, roll) }, lead, trail, -0.32),
  ]);
}
export const buildBoardCarveLeft = (s: Scene, k: Skeleton) => carve(s, k, 'board_carve_left', -1);
export const buildBoardCarveRight = (s: Scene, k: Skeleton) => carve(s, k, 'board_carve_right', 1);

/** Speed tuck — folded up small, hands low and back by the hips. Held pose, loops clean (the fold-in is the crossfade). */
export function buildBoardTuck(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 1.2;
  const legs = (d: number): Bones => ({
    LeftUpLeg: [-58 - d, 0, 7], LeftLeg: [86 + d * 1.5, 0, 0],
    RightUpLeg: [-54 - d, 0, -9], RightLeg: [82 + d * 1.5, 0, 0],
  });
  const torso = (x: number): Bones => ({ Spine: [x, 0, 0], Spine1: [16, 0, 0], Neck: [-26, 0, 0] });
  return buildPoseClip(scene, sk, 'board_tuck', T, [
    key(0, { ...legs(0), ...torso(46) }, [-0.22, -0.34, -0.14], [0.22, -0.34, -0.14], -0.34),
    key(T / 2, { ...legs(4), ...torso(49) }, [-0.20, -0.36, -0.16], [0.20, -0.36, -0.16], -0.37),
    key(T, { ...legs(0), ...torso(46) }, [-0.22, -0.34, -0.14], [0.22, -0.34, -0.14], -0.34),
  ]);
}

/**
 * Skate push (one-shot): the back foot comes off the deck, drops to the ground, shoves behind and steps back on. The
 * torso stays low and open in the stance and the arms hold the counterweight — the front arm swings forward with the
 * shove, the back arm sweeps behind it. This replaces the alias onto the walk cycle, whose arms hung and swung at the
 * rider's sides — measured 40 arms-down frames across two pushes on the baseline.
 */
export function buildBoardPush(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.42;
  const front = (d: number): Bones => ({ LeftUpLeg: [-44 - d, 0, 8], LeftLeg: [72 + d * 1.4, 0, 0] });
  return buildPoseClip(scene, sk, 'board_push', T, [
    key(0, { ...front(0), RightUpLeg: [-40, 0, -10], RightLeg: [68, 0, 0], Spine: [14, 0, 0], Spine1: [4, 0, 0], Neck: [-6, 0, 0] },
      CRUISE_L, CRUISE_R, -0.26),
    // back leg off the deck, straight down to the ground
    key(T * 0.25, { ...front(4), RightUpLeg: [-8, 0, -14], RightLeg: [14, 0, 0], Spine: [20, 0, -3], Spine1: [4, 0, 0], Neck: [-6, 0, 0] },
      [-0.28, -0.36, 0.22], [0.32, -0.30, -0.10], -0.20),
    // the shove: the foot drives behind, the front arm reaches forward with it (low — a swing, not a wing)
    key(T * 0.6, { ...front(6), RightUpLeg: [24, 0, -14], RightLeg: [8, 0, 0], Spine: [22, 0, -4], Spine1: [4, 0, 0], Neck: [-6, 0, 0] },
      [-0.26, -0.36, 0.28], [0.32, -0.28, -0.18], -0.22),
    key(T, { ...front(0), RightUpLeg: [-40, 0, -10], RightLeg: [68, 0, 0], Spine: [14, 0, 0], Spine1: [4, 0, 0], Neck: [-6, 0, 0] },
      CRUISE_L, CRUISE_R, -0.26),
  ]);
}

/** Reach down and hold the board — the shape every board sport shares in the air. Held pose, loops clean. */
export function buildBoardGrab(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.8;
  const legs = (d: number): Bones => ({
    LeftUpLeg: [-70 - d, 0, 12], LeftLeg: [92 + d, 0, 0],
    RightUpLeg: [-58 - d, 0, -12], RightLeg: [84 + d, 0, 0],
  });
  const torso = (x: number): Bones => ({ Spine: [x, 0, 4], Spine1: [10, 0, 2], Neck: [-2, 0, 0] });
  // lead hand DOWN onto the deck (the legs come up to meet it — that is what a grab is), trailing arm up and back
  return buildPoseClip(scene, sk, 'board_grab', T, [
    key(0, { ...legs(0), ...torso(40) }, [-0.18, -0.44, 0.16], [0.30, 0.30, -0.16], -0.28),
    key(T / 2, { ...legs(4), ...torso(44) }, [-0.17, -0.46, 0.15], [0.31, 0.32, -0.17], -0.30),
    key(T, { ...legs(0), ...torso(40) }, [-0.18, -0.44, 0.16], [0.30, 0.30, -0.16], -0.28),
  ]);
}

/** Loose air pose — legs gathered, arms wide and soft, used for spins. */
export function buildBoardAir(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.8;
  const legs = (d: number): Bones => ({
    LeftUpLeg: [-44 - d, 0, 9], LeftLeg: [66 + d * 1.3, 0, 0],
    RightUpLeg: [-40 - d, 0, -11], RightLeg: [62 + d * 1.3, 0, 0],
  });
  return buildPoseClip(scene, sk, 'board_air', T, [
    key(0, { ...legs(0), Spine: [18, 0, 0], Spine1: [6, 0, 0], Neck: [-8, 0, 0] }, [-0.44, 0.02, 0.10], [0.44, 0.04, -0.08], -0.22),
    key(T / 2, { ...legs(8), Spine: [22, 0, 0], Spine1: [6, 0, 0], Neck: [-8, 0, 0] }, [-0.43, 0.06, 0.12], [0.43, 0.08, -0.10], -0.22),
    key(T, { ...legs(0), Spine: [18, 0, 0], Spine1: [6, 0, 0], Neck: [-8, 0, 0] }, [-0.44, 0.02, 0.10], [0.44, 0.04, -0.08], -0.22),
  ]);
}

/** Grinding a rail: knees bent over the deck, arms working the balance — one up, one out, and they trade. */
export function buildBoardGrind(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 1.0;
  const legs: Bones = { LeftUpLeg: [-24, 0, 8], RightUpLeg: [-20, 0, -10] };
  return buildPoseClip(scene, sk, 'board_grind', T, [
    key(0, { ...legs, LeftLeg: [46, 0, 0], RightLeg: [42, 0, 0], Spine: [10, 0, 4], Spine1: [4, 0, 2], Neck: [-4, 0, 0] },
      [-0.38, 0.16, 0.14], [0.36, -0.06, -0.24], -0.18),
    key(T / 2, { ...legs, LeftLeg: [52, 0, 0], RightLeg: [48, 0, 0], Spine: [12, 0, -4], Spine1: [4, 0, -2], Neck: [-4, 0, 0] },
      [-0.34, -0.06, 0.24], [0.38, 0.16, -0.14], -0.18),
    key(T, { ...legs, LeftLeg: [46, 0, 0], RightLeg: [42, 0, 0], Spine: [10, 0, 4], Spine1: [4, 0, 2], Neck: [-4, 0, 0] },
      [-0.38, 0.16, 0.14], [0.36, -0.06, -0.24], -0.18),
  ]);
}

/**
 * Manual (VENICE-SKATE-THPS, 2026-09-09): the back trucks only. Weight goes BACK over the tail, the front foot lifts
 * the nose, the chest stays up and the arms hold the wire — this is a balance act, so both hands are out and low and
 * they never stop moving. There was no manual clip at all before: the tree pointed the manual state at board_ride_idle,
 * so the one THPS link that makes a line a line looked exactly like coasting.
 */
export function buildBoardManual(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 1.1;
  // front leg straightens as it lifts the nose; back leg loads under the tail
  const legs = (lift: number): Bones => ({
    LeftUpLeg: [-30 + lift, 0, 10], LeftLeg: [38 - lift, 0, 0],
    RightUpLeg: [-56 - lift, 0, -12], RightLeg: [88 + lift, 0, 0],
  });
  const torso = (x: number, r: number): Bones => ({ Spine: [x, 0, r], Spine1: [-4, 0, r * 0.4], Neck: [-10, 0, 0] });
  return buildPoseClip(scene, sk, 'board_manual', T, [
    key(0, { ...legs(0), ...torso(-8, 3) }, [-0.42, -0.10, 0.10], [0.42, -0.12, 0.06], -0.30),
    key(T / 2, { ...legs(5), ...torso(-11, -4) }, [-0.40, 0.02, 0.16], [0.41, -0.20, -0.02], -0.32),
    key(T, { ...legs(0), ...torso(-8, 3) }, [-0.42, -0.10, 0.10], [0.42, -0.12, 0.06], -0.30),
  ]);
}

/**
 * Ollie (VENICE-SKATE-THPS): plant, pop, hang. The back foot SNAPS down on the tail while the front foot drags up the
 * deck and levels out at the top — the sticky beat the pop was missing (the mode used to go straight from the ride idle
 * into the air tuck, so the pop had no body at all).
 */
export function buildSkateOllie(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.4;
  return buildPoseClip(scene, sk, 'skate_ollie', T, [
    // plant: load down into the tail
    key(0, { LeftUpLeg: [-62, 0, 8], LeftLeg: [96, 0, 0], RightUpLeg: [-58, 0, -10], RightLeg: [92, 0, 0], Spine: [30, 0, 0], Spine1: [8, 0, 0], Neck: [-14, 0, 0] },
      [-0.34, -0.28, 0.22], [0.36, -0.26, 0.14], -0.44),
    // pop: the back foot drives the tail down, the body extends up
    key(T * 0.3, { LeftUpLeg: [-30, 0, 8], LeftLeg: [42, 0, 0], RightUpLeg: [-6, 0, -10], RightLeg: [18, 0, 0], Spine: [8, 0, 0], Spine1: [2, 0, 0], Neck: [-4, 0, 0] },
      [-0.42, 0.08, 0.14], [0.42, 0.06, 0.02], -0.06),
    // hang: the front foot drags up and levels the deck, knees come to the chest
    key(T * 0.65, { LeftUpLeg: [-72, 0, 10], LeftLeg: [96, 0, 0], RightUpLeg: [-62, 0, -12], RightLeg: [88, 0, 0], Spine: [26, 0, 0], Spine1: [8, 0, 0], Neck: [-10, 0, 0] },
      [-0.38, -0.10, 0.20], [0.40, -0.04, 0.06], -0.30),
    key(T, { LeftUpLeg: [-52, 0, 9], LeftLeg: [76, 0, 0], RightUpLeg: [-46, 0, -11], RightLeg: [70, 0, 0], Spine: [20, 0, 0], Spine1: [6, 0, 0], Neck: [-8, 0, 0] },
      [-0.42, -0.02, 0.14], [0.43, 0.00, -0.02], -0.24),
  ]);
}

/** Compress on landing, then ride it out. */
export function buildBoardLand(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.42;
  return buildPoseClip(scene, sk, 'board_land', T, [
    key(0, { LeftUpLeg: [-34, 0, 7], LeftLeg: [52, 0, 0], RightUpLeg: [-30, 0, -9], RightLeg: [48, 0, 0], Spine: [22, 0, 0], Spine1: [6, 0, 0], Neck: [-6, 0, 0] },
      [-0.42, 0.06, 0.10], [0.42, 0.04, -0.06], -0.14),
    key(T * 0.35, { LeftUpLeg: [-66, 0, 7], LeftLeg: [98, 0, 0], RightUpLeg: [-62, 0, -9], RightLeg: [94, 0, 0], Spine: [40, 0, 0], Spine1: [12, 0, 0], Neck: [-16, 0, 0] },
      [-0.28, -0.30, 0.24], [0.30, -0.28, 0.18], -0.40),
    key(T, { LeftUpLeg: [-26, 0, 7], LeftLeg: [42, 0, 0], RightUpLeg: [-22, 0, -9], RightLeg: [38, 0, 0], Spine: [14, 0, 0], Spine1: [4, 0, 0], Neck: [-6, 0, 0] },
      [-0.38, -0.16, 0.16], [0.39, -0.18, 0.10], -0.16),
  ]);
}

/** Kickflip: a sharp flick from the front foot, body compact over the board, arms tucked in tight. */
export function buildSkateKickflip(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.5;
  return buildPoseClip(scene, sk, 'skate_kickflip', T, [
    key(0, { LeftUpLeg: [-52, 0, 7], LeftLeg: [78, 0, 0], RightUpLeg: [-48, 0, -9], RightLeg: [74, 0, 0], Spine: [30, 0, 0], Spine1: [8, 0, 0], Neck: [-10, 0, 0] },
      [-0.30, -0.16, 0.28], [0.32, -0.18, 0.20], -0.20),
    // the flick: the front foot snaps out to the edge, the body opens over it
    key(T * 0.3, { LeftUpLeg: [-30, 0, 26], LeftLeg: [34, 0, 0], RightUpLeg: [-66, 0, -9], RightLeg: [96, 0, 0], Spine: [12, 0, 0], Spine1: [4, 0, 0], Neck: [-4, 0, 0] },
      [-0.26, -0.04, 0.34], [0.34, -0.08, 0.24], -0.06),
    key(T * 0.6, { LeftUpLeg: [-58, 0, 10], LeftLeg: [82, 0, 0], RightUpLeg: [-52, 0, -9], RightLeg: [80, 0, 0], Spine: [24, 0, 0], Spine1: [6, 0, 0], Neck: [-8, 0, 0] },
      [-0.32, -0.18, 0.26], [0.34, -0.20, 0.18], -0.16),
    key(T, { LeftUpLeg: [-44, 0, 8], LeftLeg: [62, 0, 0], RightUpLeg: [-42, 0, -9], RightLeg: [64, 0, 0], Spine: [22, 0, 0], Spine1: [6, 0, 0], Neck: [-8, 0, 0] },
      [-0.38, -0.10, 0.20], [0.40, -0.12, 0.12], -0.18),
  ]);
}

/** Bail — the board is gone and so is the rider. The stance BREAKS: the hips unwind and the arms flail out straight,
 *  which is the one place in this suite where a locked elbow is the truth. */
export function buildSkateBail(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.75;
  return buildPoseClip(scene, sk, 'skate_bail', T, [
    key(0, { LeftUpLeg: [-30, 0, 7], LeftLeg: [46, 0, 0], RightUpLeg: [-26, 0, -9], RightLeg: [42, 0, 0], Spine: [20, 0, 0], Spine1: [4, 0, 0], Neck: [-6, 0, 0] },
      [-0.40, -0.10, 0.18], [0.40, -0.12, 0.12], -0.16, 1),
    key(T * 0.4, { LeftUpLeg: [-76, 0, 34], LeftLeg: [30, 0, 0], RightUpLeg: [-18, 0, -30], RightLeg: [88, 0, 0], Spine: [58, 0, 26], Spine1: [14, 0, 10], Neck: [10, 0, 0] },
      [-0.28, 0.36, -0.16], [0.31, 0.33, -0.20], -0.10, 0.5),
    key(T, { LeftUpLeg: [-40, 0, 44], LeftLeg: [96, 0, 0], RightUpLeg: [-66, 0, -38], RightLeg: [40, 0, 0], Spine: [74, 0, 34], Spine1: [24, 0, 18], Neck: [26, 0, 0] },
      [-0.40, 0.10, -0.26], [0.42, 0.06, -0.29], -0.62, 0),
  ]);
}
