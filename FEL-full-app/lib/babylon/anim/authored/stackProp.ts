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
