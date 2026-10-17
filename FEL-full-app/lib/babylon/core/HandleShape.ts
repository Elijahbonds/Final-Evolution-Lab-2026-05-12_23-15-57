// HandleShape — THE SHAPE OF EACH HANDLE MOVE (HOOPS MOTION phase 4a, plan §3.1; its own module since 4b). Pure DATA, and no clip name
// in it: the carry (anim/ballCarry → anim/handlePaths) reads it, and the carry is on every hoops body AND the dunk runway — HandleSystem's
// clip tables in the dunk's import closure broke its clip scope (clipScope.test: `bball_*` names out of the dunk's suites). HandleSystem
// re-exports all of it, so every existing import stands.
import type { HandleMove } from './HandleSystem';

/** The ball's path family (anim/handlePaths builds one per move). */
export type MovePath = 'front' | 'between' | 'behind' | 'pushOut' | 'feint' | 'float' | 'pound' | 'pull' | 'hold' | 'none';
/** Where a defender could poke: the k range of the move (0..1) and how exposed the ball is inside it (1 = out in front of the body; 0.3
 *  = protected: between the legs, behind the back, at the hips). */
export interface MoveExposure { from: number; to: number; level: number }
/** The posture window a move asks for: the handle stance, the hesi's own (4e), the spin's (the mode owns the yaw), or none. */
export type MovePosture = 'handle' | 'hesi' | 'spin' | 'none';
export interface MoveShape {
  /** How many times the ball crosses the body's midline: 0 keeps the hand, 1 ends in the other hand, 2 ends back in the start hand. */
  crosses: 0 | 1 | 2;
  path: MovePath;
  /** When the defender's CLIP reacts, as a fraction of the move (plan §3.7: the clip beat only — the roll, the stun and the bite slide stay
   *  on the input frame). null: no defender clip. */
  readAtK: number | null;
  exposed: MoveExposure | null;
  /** Does it link in the chain (resolveHandleMove / pushChain)? Every HandleMove does today; the spin links at its exit (gathersIntoShot). */
  chain: boolean;
  /** Does it displace the body (moveImpulse ≠ 0)? The fakes and the momentum moves do not: the momentum moves carry the controller's own
   *  cut (DribbleController.momentumCross / momentumBtb), not the impulse. */
  impulse: boolean;
  posture: MovePosture;
  /** 'motion': the renderer plays it; 'mode': the mode resolves it in place (off the head: the release, the loose ball, the stun). */
  owner: 'motion' | 'mode';
}
const FRONT_EXPOSED: MoveExposure = { from: 0.2, to: 0.8, level: 1 };
const PROTECTED: MoveExposure = { from: 0, to: 1, level: 0.3 };
/**
 * One row per HandleMove (plan §3.1 / §4). assumption (the plan gives no figure): the Shammgod's exposure (k 0.2–0.6, level 1: the ball
 * pushed out alone), the in-and-out's and the slip-slide's (k 0.2–0.7, level 0.6: it comes toward the midline and back), the spin's and
 * the steezo roll's (protected), the double cross's (the front crossing's), the snatchback's (k 0.2–0.7, level 1) and the momentum cross's
 * (the crossover's); the step-back's and the steezo roll's readAtK (0.5, 0.55).
 */
export const MOVE_SHAPE: Readonly<Record<HandleMove, MoveShape>> = {
  crossover:      { crosses: 1, path: 'front',   readAtK: 0.45, exposed: FRONT_EXPOSED, chain: true, impulse: true,  posture: 'handle', owner: 'motion' },
  momentum_cross: { crosses: 1, path: 'front',   readAtK: 0.4,  exposed: FRONT_EXPOSED, chain: true, impulse: false, posture: 'handle', owner: 'motion' },
  between_legs:   { crosses: 1, path: 'between', readAtK: 0.6,  exposed: PROTECTED,     chain: true, impulse: true,  posture: 'handle', owner: 'motion' },
  behind_back:    { crosses: 1, path: 'behind',  readAtK: 0.55, exposed: PROTECTED,     chain: true, impulse: true,  posture: 'handle', owner: 'motion' },
  momentum_btb:   { crosses: 1, path: 'behind',  readAtK: 0.55, exposed: PROTECTED,     chain: true, impulse: false, posture: 'handle', owner: 'motion' },
  double_cross:   { crosses: 2, path: 'front',   readAtK: 0.7,  exposed: FRONT_EXPOSED, chain: true, impulse: true,  posture: 'handle', owner: 'motion' },
  shammgod:       { crosses: 1, path: 'pushOut', readAtK: 0.7,  exposed: { from: 0.2, to: 0.6, level: 1 }, chain: true, impulse: true, posture: 'handle', owner: 'motion' },
  in_and_out:     { crosses: 0, path: 'feint',   readAtK: 0.4,  exposed: { from: 0.2, to: 0.7, level: 0.6 }, chain: true, impulse: false, posture: 'handle', owner: 'motion' },
  slip_slide:     { crosses: 0, path: 'feint',   readAtK: 0.4,  exposed: { from: 0.2, to: 0.7, level: 0.6 }, chain: true, impulse: true, posture: 'handle', owner: 'motion' },
  hesi:           { crosses: 0, path: 'float',   readAtK: 0.3,  exposed: null,          chain: true, impulse: false, posture: 'hesi',   owner: 'motion' },
  yoyo:           { crosses: 0, path: 'pound',   readAtK: null, exposed: null,          chain: true, impulse: false, posture: 'handle', owner: 'motion' },
  spin:           { crosses: 1, path: 'pull',    readAtK: 0.45, exposed: PROTECTED,     chain: true, impulse: false, posture: 'spin',   owner: 'motion' },
  snatch_back:    { crosses: 1, path: 'front',   readAtK: 0.3,  exposed: { from: 0.2, to: 0.7, level: 1 }, chain: true, impulse: true, posture: 'handle', owner: 'motion' },
  steezo_roll:    { crosses: 2, path: 'behind',  readAtK: 0.55, exposed: PROTECTED,     chain: true, impulse: false, posture: 'spin',   owner: 'motion' },
  stepback:       { crosses: 0, path: 'none',    readAtK: 0.5,  exposed: null,          chain: true, impulse: false, posture: 'handle', owner: 'motion' },
  off_the_head:   { crosses: 0, path: 'none',    readAtK: null, exposed: null,          chain: true, impulse: false, posture: 'none',   owner: 'mode' },
};
