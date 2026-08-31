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
// arms are out as a counterweight, and the spine twists toward the nose of the
// board. Turning is a LEAN, not a step. Air is a tuck. Those four ideas are what
// separates a board stance from a standing pose, and they are what these keys
// express.

import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildClip } from '../clipBuilder';

/** Knees bent, arms out, spine twisted toward the nose. The base of everything. */
export function buildBoardRideIdle(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 2.4;                                  // slow breathing loop
  return buildClip(scene, sk, 'board_ride_idle', T, {
    // ride low — the knees are the suspension
    LeftUpLeg: [[0, -44, 0, 8], [T / 2, -50, 0, 8], [T, -44, 0, 8]],
    LeftLeg: [[0, 72, 0, 0], [T / 2, 80, 0, 0], [T, 72, 0, 0]],
    RightUpLeg: [[0, -40, 0, -10], [T / 2, -46, 0, -10], [T, -40, 0, -10]],
    RightLeg: [[0, 68, 0, 0], [T / 2, 76, 0, 0], [T, 68, 0, 0]],
    // torso open toward the nose, weight forward
    Spine: [[0, 14, 16, 0], [T / 2, 17, 18, 0], [T, 14, 16, 0]],
    Spine1: [[0, 4, 10, 0], [T, 4, 10, 0]],
    Neck: [[0, -6, -14, 0], [T, -6, -14, 0]],     // eyes down the line of travel
    // arms out as a counterweight, drifting gently
    LeftArm: [[0, 26, 0, 34], [T / 2, 22, 0, 39], [T, 26, 0, 34]],
    LeftForeArm: [[0, 34, 0, 0], [T, 29, 0, 0]],
    RightArm: [[0, 30, 0, -30], [T / 2, 26, 0, -35], [T, 30, 0, -30]],
    RightForeArm: [[0, 38, 0, 0], [T, 33, 0, 0]],
  }, [[0, -0.26], [T / 2, -0.29], [T, -0.26]]);
}

/** Lean into the turn. `sign` is +1 for a toeside/right carve, -1 for heelside. */
function carve(scene: Scene, sk: Skeleton, name: string, sign: number): AnimationGroup | null {
  const T = 0.5;
  const roll = 22 * sign;
  return buildClip(scene, sk, name, T, {
    // a carve is a LEAN — the whole body banks, it does not step
    Spine: [[0, 14, 16, 0], [T, 16, 16 + 8 * sign, roll]],
    Spine1: [[0, 4, 10, 0], [T, 6, 10, roll * 0.5]],
    LeftUpLeg: [[0, -44, 0, 8], [T, -52, 0, 8 + 5 * sign]],
    LeftLeg: [[0, 72, 0, 0], [T, 84, 0, 0]],
    RightUpLeg: [[0, -40, 0, -10], [T, -48, 0, -10 + 5 * sign]],
    RightLeg: [[0, 68, 0, 0], [T, 80, 0, 0]],
    // outside arm reaches across the turn, inside arm drops
    LeftArm: [[0, 26, 0, 34], [T, 6 - 24 * sign, 0, 62 + 14 * sign]],
    RightArm: [[0, 30, 0, -30], [T, 10 - 24 * sign, 0, -56 + 14 * sign]],
  }, [[0, -0.24], [T, -0.32]]);
}
export const buildBoardCarveLeft = (s: Scene, k: Skeleton) => carve(s, k, 'board_carve_left', -1);
export const buildBoardCarveRight = (s: Scene, k: Skeleton) => carve(s, k, 'board_carve_right', 1);

/** Speed tuck — fold up small, arms swept back. */
export function buildBoardTuck(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.6;
  return buildClip(scene, sk, 'board_tuck', T, {
    Spine: [[0, 14, 16, 0], [T, 46, 12, 0]],
    Spine1: [[0, 4, 10, 0], [T, 16, 8, 0]],
    Neck: [[0, -6, -14, 0], [T, -26, -10, 0]],
    LeftUpLeg: [[0, -26, 0, 7], [T, -58, 0, 7]],
    LeftLeg: [[0, 42, 0, 0], [T, 86, 0, 0]],
    RightUpLeg: [[0, -22, 0, -9], [T, -54, 0, -9]],
    RightLeg: [[0, 38, 0, 0], [T, 82, 0, 0]],
    LeftArm: [[0, 26, 0, 34], [T, 34, 0, 22]],
    LeftForeArm: [[0, 18, 0, 0], [T, 62, 0, 0]],
    RightArm: [[0, 30, 0, -30], [T, 34, 0, -22]],
    RightForeArm: [[0, 22, 0, 0], [T, 62, 0, 0]],
  }, [[0, -0.16], [T, -0.34]]);
}

/** Reach down and hold the board — the shape every board sport shares in the air. */
export function buildBoardGrab(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.7;
  return buildClip(scene, sk, 'board_grab', T, {
    Spine: [[0, 20, 16, 0], [T / 2, 44, 22, 6], [T, 40, 20, 4]],
    LeftUpLeg: [[0, -30, 0, 7], [T / 2, -74, 0, 12], [T, -70, 0, 12]],
    LeftLeg: [[0, 46, 0, 0], [T / 2, 96, 0, 0], [T, 92, 0, 0]],
    RightUpLeg: [[0, -26, 0, -9], [T / 2, -62, 0, -12], [T, -58, 0, -12]],
    RightLeg: [[0, 42, 0, 0], [T / 2, 88, 0, 0], [T, 84, 0, 0]],
    // lead hand down to the deck, trailing arm up for balance
    LeftArm: [[0, 6, 0, 62], [T / 2, 74, 0, 26], [T, 70, 0, 26]],
    LeftForeArm: [[0, 18, 0, 0], [T / 2, 46, 0, 0], [T, 44, 0, 0]],
    RightArm: [[0, 10, 0, -56], [T / 2, -34, 0, -76], [T, -30, 0, -74]],
  }, [[0, -0.2], [T / 2, -0.3], [T, -0.28]]);
}

/** Loose air pose — legs gathered, arms wide, used for spins. */
export function buildBoardAir(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.8;
  return buildClip(scene, sk, 'board_air', T, {
    Spine: [[0, 18, 16, 0], [T / 2, 22, 16, 0], [T, 18, 16, 0]],
    LeftUpLeg: [[0, -44, 0, 9], [T / 2, -52, 0, 9], [T, -44, 0, 9]],
    LeftLeg: [[0, 66, 0, 0], [T / 2, 76, 0, 0], [T, 66, 0, 0]],
    RightUpLeg: [[0, -40, 0, -11], [T / 2, -48, 0, -11], [T, -40, 0, -11]],
    RightLeg: [[0, 62, 0, 0], [T / 2, 72, 0, 0], [T, 62, 0, 0]],
    LeftArm: [[0, -18, 0, 84], [T / 2, -24, 0, 90], [T, -18, 0, 84]],
    RightArm: [[0, -14, 0, -80], [T / 2, -20, 0, -86], [T, -14, 0, -80]],
  }, [[0, -0.22], [T, -0.22]]);
}

/** Grinding a rail: locked knees-bent stance, arms wide, holding balance. */
export function buildBoardGrind(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 1.0;
  return buildClip(scene, sk, 'board_grind', T, {
    Spine: [[0, 10, 18, 4], [T / 2, 12, 18, -4], [T, 10, 18, 4]],
    LeftUpLeg: [[0, -24, 0, 8], [T, -24, 0, 8]],
    LeftLeg: [[0, 46, 0, 0], [T / 2, 52, 0, 0], [T, 46, 0, 0]],
    RightUpLeg: [[0, -20, 0, -10], [T, -20, 0, -10]],
    RightLeg: [[0, 42, 0, 0], [T / 2, 48, 0, 0], [T, 42, 0, 0]],
    // arms working hard to keep the line
    LeftArm: [[0, -10, 0, 88], [T / 2, 4, 0, 76], [T, -10, 0, 88]],
    RightArm: [[0, -6, 0, -84], [T / 2, 8, 0, -72], [T, -6, 0, -84]],
  }, [[0, -0.18], [T, -0.18]]);
}

/** Compress on landing, then ride it out. */
export function buildBoardLand(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.42;
  return buildClip(scene, sk, 'board_land', T, {
    Spine: [[0, 22, 16, 0], [T * 0.35, 40, 16, 0], [T, 14, 16, 0]],
    LeftUpLeg: [[0, -34, 0, 7], [T * 0.35, -66, 0, 7], [T, -26, 0, 7]],
    LeftLeg: [[0, 52, 0, 0], [T * 0.35, 98, 0, 0], [T, 42, 0, 0]],
    RightUpLeg: [[0, -30, 0, -9], [T * 0.35, -62, 0, -9], [T, -22, 0, -9]],
    RightLeg: [[0, 48, 0, 0], [T * 0.35, 94, 0, 0], [T, 38, 0, 0]],
    LeftArm: [[0, -6, 0, 72], [T * 0.35, 20, 0, 50], [T, 6, 0, 62]],
    RightArm: [[0, -2, 0, -68], [T * 0.35, 20, 0, -46], [T, 10, 0, -56]],
  }, [[0, -0.14], [T * 0.35, -0.4], [T, -0.16]]);
}

/** Kickflip: a sharp flick from the front foot, body compact over the board. */
export function buildSkateKickflip(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.5;
  return buildClip(scene, sk, 'skate_kickflip', T, {
    Spine: [[0, 30, 16, 0], [T * 0.3, 12, 16, 0], [T, 22, 16, 0]],
    // front foot snaps out and flicks, back leg tucks under
    LeftUpLeg: [[0, -52, 0, 7], [T * 0.3, -30, 0, 26], [T * 0.6, -58, 0, 10], [T, -44, 0, 8]],
    LeftLeg: [[0, 78, 0, 0], [T * 0.3, 34, 0, 0], [T * 0.6, 82, 0, 0], [T, 62, 0, 0]],
    RightUpLeg: [[0, -48, 0, -9], [T * 0.3, -66, 0, -9], [T, -42, 0, -9]],
    RightLeg: [[0, 74, 0, 0], [T * 0.3, 96, 0, 0], [T, 64, 0, 0]],
    LeftArm: [[0, 2, 0, 70], [T * 0.3, -22, 0, 86], [T, -6, 0, 76]],
    RightArm: [[0, 6, 0, -66], [T * 0.3, -18, 0, -82], [T, -2, 0, -72]],
  }, [[0, -0.2], [T * 0.3, -0.06], [T, -0.18]]);
}

/** Bail — the board is gone and so is the rider. */
export function buildSkateBail(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const T = 0.75;
  return buildClip(scene, sk, 'skate_bail', T, {
    Spine: [[0, 20, 16, 0], [T * 0.4, 58, 0, 26], [T, 74, -10, 34]],
    Spine1: [[0, 4, 10, 0], [T, 24, -8, 18]],
    Neck: [[0, -6, -14, 0], [T, 26, 0, 0]],
    LeftUpLeg: [[0, -30, 0, 7], [T * 0.4, -76, 0, 34], [T, -40, 0, 44]],
    LeftLeg: [[0, 46, 0, 0], [T * 0.4, 30, 0, 0], [T, 96, 0, 0]],
    RightUpLeg: [[0, -26, 0, -9], [T * 0.4, -18, 0, -30], [T, -66, 0, -38]],
    RightLeg: [[0, 42, 0, 0], [T * 0.4, 88, 0, 0], [T, 40, 0, 0]],
    // arms flail
    LeftArm: [[0, 6, 0, 62], [T * 0.4, -104, 0, 74], [T, -60, 0, 96]],
    LeftForeArm: [[0, 18, 0, 0], [T * 0.4, 66, 0, 0], [T, 30, 0, 0]],
    RightArm: [[0, 10, 0, -56], [T * 0.4, -96, 0, -70], [T, -52, 0, -92]],
    RightForeArm: [[0, 22, 0, 0], [T * 0.4, 58, 0, 0], [T, 26, 0, 0]],
  }, [[0, -0.16], [T * 0.4, -0.1], [T, -0.62]]);
}
