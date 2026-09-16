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
  // hands up at head height, a little out — where a pair of shins would be
  const grip = (y: number): { Left: V3; Right: V3 } => ({ Left: [-0.30, y, 0.16], Right: [0.30, y, 0.16] });
  const key = (t: number, bend: number, spine: number, y: number, hipsY: number) => ({
    t, bones: { Hips: [0, 0, 0] as Deg3, Spine: [spine, 0, 0] as Deg3, Neck: [10, 0, 0] as Deg3, ...legs(bend) },
    hands: grip(y), poles: { Left: [-0.8, -0.3, -0.3] as V3, Right: [0.8, -0.3, -0.3] as V3 }, hipsY,
  });
  return buildPoseClip(scene, sk, 'prop_stack_base', STACK_SEC, [
    key(0, 12, 6, 1.52, -0.04),
    key(STACK_DUCK_T, 20, 10, 1.46, -0.09),   // he takes the weight as the rider leans
    key(STACK_SEC, 12, 6, 1.52, -0.04),
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
    poles: { Left: [-0.8, -0.2, -0.4] as V3, Right: [0.8, -0.2, -0.4] as V3 }, hipsY,
  });
  return buildPoseClip(scene, sk, 'prop_stack_rider', STACK_SEC, [
    // sitting up, hands resting on the base's head
    key(0, 78, 62, 0, 6, [0.22, 1.18, 0.20], 0),
    // THE DUCK: leans back off the line of the feet, chin tucked, arms in — the jump goes over his lap
    key(STACK_DUCK_T, 66, 74, 34, 26, [0.26, 1.02, -0.18], -0.06),
    key(STACK_SEC, 78, 62, 0, 6, [0.22, 1.18, 0.20], 0),
  ]);
}
