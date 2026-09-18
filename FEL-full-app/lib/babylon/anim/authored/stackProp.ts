// stackProp — the two bodies of THE TETRIS (owner, 2026-09-16: "jumping over 2 people stacked sitting on the others
// shoulders").
//
// Every other thing you dunk over in this mode is a PROP: a baked sedan, a Kenney barrier, a block. This one is two of
// the game's own characters, which means it needs poses rather than a GLB — and poses that read from the runway at
// speed, because the player has about a second to understand what is in front of them.
//
//   THE BASE  stands square to the runway, knees soft under the load, hands up gripping the rider's shins. A person
//             carrying another person does not stand at attention: the spine is stacked, the chin is down, the arms
//             are the giveaway that there is weight above.
//   THE RIDER sits on the shoulders, legs hanging down the base's chest, and DUCKS as the dunker comes over — leaning
//             back and dropping his head under the line of the feet, which is the only reason the jump is possible
//             (DunkObstacles.tetris: the hitbox is their lap, not their heads).
//
// The duck is the second half of each clip, so the mode can play the pair as a one-shot when the take-off fires and the
// bodies do the right thing without any per-frame driving.
import type { Scene, Skeleton, AnimationGroup } from '@babylonjs/core';
import { buildPoseClip, type Deg3 } from '../poseClip';
type V3 = [number, number, number];

export const STACK_SEC = 1.1;
/** The clip second the duck is at its deepest — the mode starts the pair so this lands under the dunker's feet. */
export const STACK_DUCK_T = 0.55;

/** The base: standing, loaded, hands up on the rider's shins. */
export function buildStackBase(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const legs = (bend: number): Record<string, Deg3> => ({
    LeftUpLeg: [-bend, 0, 7], LeftLeg: [bend * 1.7, 0, 0],
    RightUpLeg: [-bend, 0, -7], RightLeg: [bend * 1.7, 0, 0],
  });
  // THE GRIP IS LOW AND IN FRONT (rc28 eye, 2026-09-16). Hands out at ±0.30 with the poles winged gave the base two
  // elbows level with the rider's shoulders, and from the runway — where the base's own head and body are hidden behind
  // the rider and the dunker — those elbows read as the RIDER'S arms, flexed in a bodybuilder's double biceps. (Which
  // body they belonged to was settled by moving the rider's arms and watching these not move.) A person carrying
  // another holds the shins DOWN against his own chest: hands close together, forearms vertical, elbows at the ribs.
  const grip = (y: number): { Left: V3; Right: V3 } => ({ Left: [-0.17, y, 0.30], Right: [0.17, y, 0.30] });
  const key = (t: number, bend: number, spine: number, y: number, hipsY: number) => ({
    t, bones: { Hips: [0, 0, 0] as Deg3, Spine: [spine, 0, 0] as Deg3, Neck: [10, 0, 0] as Deg3, ...legs(bend) },
    hands: grip(y), poles: { Left: [-0.35, -0.9, -0.25] as V3, Right: [0.35, -0.9, -0.25] as V3 }, hipsY,   // elbows DOWN at the ribs
  });
  return buildPoseClip(scene, sk, 'prop_stack_base', STACK_SEC, [
    key(0, 12, 6, 1.24, -0.04),
    key(STACK_DUCK_T, 20, 10, 1.18, -0.09),   // he takes the weight as the rider leans
    key(STACK_SEC, 12, 6, 1.24, -0.04),
  ]);
}

/**
 * The rider: seated, legs hanging, and the DUCK.
 *
 * The seat is expressed as a deep hip fold with the shins dropped — the mode parks this body at the base's shoulder
 * height, so what the pose has to sell is "sitting on something", not "floating".
 */
export function buildStackRider(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const seat = (fold: number, hang: number): Record<string, Deg3> => ({
    LeftUpLeg: [-fold, 0, 9], LeftLeg: [hang, 0, 0],
    RightUpLeg: [-fold, 0, -9], RightLeg: [hang, 0, 0],
  });
  const key = (t: number, fold: number, hang: number, lean: number, neck: number, arms: V3, hipsY: number) => ({
    t,
    bones: { Hips: [-lean, 0, 0] as Deg3, Spine: [-lean * 0.6, 0, 0] as Deg3, Neck: [neck, 0, 0] as Deg3, ...seat(fold, hang) },
    hands: { Left: [-arms[0], arms[1], arms[2]] as V3, Right: arms },
    poles: { Left: [-0.5, -0.9, -0.3] as V3, Right: [0.5, -0.9, -0.3] as V3 }, hipsY,   // elbows DOWN, not winged out
  });
  // STRAIGHT ARMS, DOWN TO THE HEAD. A rider holds the head he is sitting on, and an arm reaching down and out to it is
  // nearly straight — which is worth having for its own sake: a hand tucked up by the shoulder leaves the elbow free to
  // go wherever the IK pole is not, and at runway distance a winged elbow is the whole silhouette. (Moving these is
  // also what proved the winged elbows in the rc26/27 frames belonged to the BASE: these moved, those did not.)
  return buildPoseClip(scene, sk, 'prop_stack_rider', STACK_SEC, [
    key(0, 78, 62, 0, 6, [0.26, 0.72, 0.34], 0),
    // THE DUCK: leans back off the line of the feet, chin tucked, hands ride down onto the head — the jump goes over his lap
    key(STACK_DUCK_T, 66, 74, 34, 26, [0.30, 0.62, 0.18], -0.06),
    key(STACK_SEC, 78, 62, 0, 6, [0.26, 0.72, 0.34], 0),
  ]);
}

/**
 * THE ROW — one of the people you go over, standing shoulder to shoulder (owner, 2026-09-16: "over a # of people in a
 * row").
 *
 * Same contract as the TETRIS rider: they stand at their full height, and they DUCK as the dunker comes over, because
 * the hitbox is set at 1.75 m and the dunker's apex is 1.84 — a line of bodies that stood to attention through the jump
 * would be a dunk nobody in this game could land, and it would look like it too.
 *
 * What a person in that line actually does: arms folded or braced in front, weight back, chin down, and a flinch at the
 * moment of the jump. It is the flinch that sells it — a row of people holding perfectly still is a row of mannequins.
 */
export function buildRowStand(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const legs = (bend: number): Record<string, Deg3> => ({
    LeftUpLeg: [-bend, 0, 5], LeftLeg: [bend * 1.6, 0, 0],
    RightUpLeg: [-bend, 0, -5], RightLeg: [bend * 1.6, 0, 0],
  });
  const key = (t: number, bend: number, lean: number, neck: number, y: number, hipsY: number) => ({
    t,
    bones: { Hips: [-lean * 0.4, 0, 0] as Deg3, Spine: [-lean * 0.6, 0, 0] as Deg3, Neck: [neck, 0, 0] as Deg3, ...legs(bend) },
    // arms folded in front of the chest: hands crossed toward the far side, elbows down
    // arms: folded in front at rest, thrown WIDE and high on the pose (y drives both, so one number does the whole arm)
    hands: { Left: [-(y - 1.0) * 1.9 - 0.10, y, 0.24 - (y - 1.0) * 0.5] as V3, Right: [(y - 1.0) * 1.9 + 0.10, y, 0.24 - (y - 1.0) * 0.5] as V3 },
    poles: { Left: [-0.45, -0.9, -0.2] as V3, Right: [0.45, -0.9, -0.2] as V3 }, hipsY,
  });
  return buildPoseClip(scene, sk, 'prop_row_stand', STACK_SEC, [
    // THEY HIT A POSE (owner, 2026-09-16: "yes it can, hit a pose"). Nobody in that line flinches — they stand up
    // straight and throw their arms out as the dunker goes over, which is the whole reason anybody volunteers for it.
    key(0, 6, 0, 4, 1.16, 0),
    key(STACK_DUCK_T, 2, -8, -10, 1.62, 0.02),   // chest out, chin up, arms thrown wide
    key(STACK_SEC, 6, 0, 4, 1.16, 0),
  ]);
}

/**
 * THE LINE — bent over, head down, in a row running away down the runway (owner: "5 in a row longitudinal, straight").
 *
 * (Kept for anything that wants a bent-over line. The ROW does not use it any more — the owner's people stand up and
 * hit a pose, and the jump rises to them instead.)
 */
export function buildRowCrouch(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const legs = (bend: number): Record<string, Deg3> => ({
    LeftUpLeg: [-bend, 0, 6], LeftLeg: [bend * 1.5, 0, 0],
    RightUpLeg: [-bend, 0, -6], RightLeg: [bend * 1.5, 0, 0],
  });
  const key = (t: number, fold: number, bend: number, neck: number, y: number, hipsY: number) => ({
    t,
    bones: { Hips: [fold, 0, 0] as Deg3, Spine: [fold * 0.7, 0, 0] as Deg3, Neck: [neck, 0, 0] as Deg3, ...legs(bend) },
    hands: { Left: [-0.22, y, 0.26] as V3, Right: [0.22, y, 0.26] as V3 },   // hands on the knees
    poles: { Left: [-0.5, -0.8, -0.2] as V3, Right: [0.5, -0.8, -0.2] as V3 }, hipsY,
  });
  return buildPoseClip(scene, sk, 'prop_row_crouch', STACK_SEC, [
    key(0, 52, 26, 22, 0.86, -0.12),
    key(STACK_DUCK_T, 64, 38, 30, 0.74, -0.22),   // lower as the feet come over
    key(STACK_SEC, 52, 26, 22, 0.86, -0.12),
  ]);
}

/**
 * ON THE BIKE — a cyclist, leaning over the bars (owner: "have someone on the bike").
 *
 * Seated, hands forward and down on the handlebars, one knee up and one down because pedals do not stop for anybody,
 * chest low over the front wheel. The lean is what keeps the head under 1.5 m: a cyclist sitting bolt upright would be
 * taller than the dunker's apex, and this has to be a dunk somebody can land.
 */
export function buildBikeRider(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const key = (t: number, lead: boolean, lean: number, hipsY: number) => ({
    t,
    bones: {
      Hips: [lean, 0, 0] as Deg3, Spine: [lean * 0.8, 0, 0] as Deg3, Neck: [-lean * 0.9, 0, 0] as Deg3,
      LeftUpLeg: [lead ? -78 : -34, 0, 8] as Deg3, LeftLeg: [lead ? 84 : 44, 0, 0] as Deg3,
      RightUpLeg: [lead ? -34 : -78, 0, -8] as Deg3, RightLeg: [lead ? 44 : 84, 0, 0] as Deg3,
    },
    hands: { Left: [-0.26, 1.02, 0.40] as V3, Right: [0.26, 1.02, 0.40] as V3 },   // out and down on the bars
    poles: { Left: [-0.6, -0.7, -0.2] as V3, Right: [0.6, -0.7, -0.2] as V3 }, hipsY,
  });
  return buildPoseClip(scene, sk, 'prop_bike_rider', STACK_SEC, [
    key(0, true, 26, -0.26),
    key(STACK_SEC / 2, false, 30, -0.28),          // the pedals go round
    key(STACK_SEC, true, 26, -0.26),
  ]);
}

/**
 * ON THE BOARD — a skater in a crouch (owner: "do the same thing for a skateboard").
 *
 * Feet across the deck, knees deep, arms out for balance, weight low. Low is the point: a skater standing up straight
 * is 1.85 m and the dunker's apex is 1.84, so the crouch is both what a skater rolling under a dunk actually does and
 * the reason the dunk exists.
 */
export function buildSkateRider(scene: Scene, sk: Skeleton): AnimationGroup | null {
  const key = (t: number, bend: number, twist: number, arms: number, hipsY: number) => ({
    t,
    bones: {
      Hips: [12, twist, 0] as Deg3, Spine: [16, twist * 0.6, 0] as Deg3, Neck: [-18, -twist, 0] as Deg3,
      LeftUpLeg: [-bend, 0, 16] as Deg3, LeftLeg: [bend * 1.7, 0, 0] as Deg3,
      RightUpLeg: [-bend, 0, -16] as Deg3, RightLeg: [bend * 1.7, 0, 0] as Deg3,
    },
    hands: { Left: [-arms, 1.06, 0.10] as V3, Right: [arms, 1.02, -0.14] as V3 },   // out for balance, one lead one trail
    poles: { Left: [-0.9, -0.3, -0.2] as V3, Right: [0.9, -0.3, -0.2] as V3 }, hipsY,
  });
  return buildPoseClip(scene, sk, 'prop_skate_rider', STACK_SEC, [
    key(0, 48, 10, 0.54, -0.26),
    key(STACK_DUCK_T, 62, 16, 0.60, -0.36),        // deeper as the feet come over
    key(STACK_SEC, 48, 10, 0.54, -0.26),
  ]);
}
