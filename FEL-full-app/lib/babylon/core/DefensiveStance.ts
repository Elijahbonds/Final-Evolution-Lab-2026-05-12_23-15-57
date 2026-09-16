// THE DEFENSIVE STANCE, AS A THING THAT DOES SOMETHING (owner ask, 2026-09-13).
//
// "Add defensive and offensive stationary movement and behavior." The offensive half was TripleThreat, which
// existed in 1v1 and has now been ported. The defensive half turned out to be a different kind of gap: the
// ANIMATION was already there in both modes — `defending`, `slideDir`, `bball_defend_slide_left/right`, a
// `defend_idle` in the tree — and it was purely cosmetic. Measured by reading every speed path in both
// modes: being on defence changed your movement by exactly nothing. A body crouched in a slide and a body
// standing straight up covered ground identically.
//
// So a defender looked like he was working and wasn't. This is the part that makes the stance a decision.
//
// THE TRADE, which is the whole point of a real stance:
//   · IN A STANCE you slide sideways faster and you cannot go forward as fast. You are set up to mirror
//     somebody, not to chase them.
//   · UPRIGHT you cover ground forward and you are slow to move laterally. You are set up to recover, or
//     to run, and that is exactly when you get crossed over.
//
// The blow-by is the interesting consequence: an attacker who gets you moving forward has taken your
// lateral speed away for as long as you are moving that way, without any special "blow-by" state existing.
// The geometry does it.
//
// Pure: no Babylon scene, no clock. `Vector3` is the only import and only as a value type.

import { Vector3 } from '@babylonjs/core';

/** Past this from your man there is nobody to guard — you are recovering, not sliding. */
export const STANCE_RANGE = 3.2;
/** Sprinting is standing up. You cannot sprint in a stance; that is what makes it a choice. */
export const STANCE_SPRINT_MAX = 0.72;
/** Sideways, in a stance. Faster than upright — this is what you bought. */
export const STANCE_LATERAL_GAIN = 1.24;
/** Forwards/backwards, in a stance. Slower — this is what you paid. */
export const STANCE_FORWARD_PENALTY = 0.76;
/** Sideways, standing upright. Crossing your feet over is slow, which is why the crossover works. */
export const UPRIGHT_LATERAL_PENALTY = 0.72;

// INTENSE D — L2 HELD (owner, 2026-09-16): "L2 on defense has them get low to sit and slide faster, better
// perimeter defense". 2K's intense defence, and the stance above already had the right shape for it — what it did
// not have was a way for the player to ASK. Auto-engagement reads the situation (near your man, not sprinting);
// sitting down is a decision you make early, before he has moved, and it costs you more if he goes by.
/** Sideways, sitting down on him. This is the reward for committing. */
export const INTENSE_LATERAL_GAIN = 1.42;
/** Forwards/backwards, sitting down. Steeper than the ordinary stance — a deep sit is hard to stand up out of. */
export const INTENSE_FORWARD_PENALTY = 0.62;

export interface StanceRead {
  /** My team does not have the ball. */
  onDefense: boolean;
  /** Planar distance to the man I am guarding. Infinity when there is nobody. */
  distToMan: number;
  /** 0..1 — how hard I am pushing. Sprinting stands you up. */
  speed01: number;
  /** A stunned or floored body is not in any stance. */
  disabled?: boolean;
  /** L2 held — sit down on him deliberately. Engages the stance at ANY range, not just inside STANCE_RANGE. */
  intense?: boolean;
}

/** Am I actually in a stance right now? */
export function inStance(read: StanceRead): boolean {
  if (!read.onDefense || read.disabled) return false;
  // Sitting down is a CHOICE, so asking for it beats the proximity read — you can set before he arrives, which is
  // the whole point of picking a man up early. Sprinting still stands you up: that part is not negotiable, it is
  // what makes the stance cost something.
  if (read.intense) return read.speed01 <= STANCE_SPRINT_MAX;
  if (!Number.isFinite(read.distToMan) || read.distToMan > STANCE_RANGE) return false;
  return read.speed01 <= STANCE_SPRINT_MAX;
}

/**
 * Scale a wish velocity by the stance.
 *
 * `yaw` is the body's facing. The wish is split into the component along the facing (forward/back) and the
 * component across it (the slide), each scaled on its own, then recomposed — so the SAME input produces a
 * different body depending on which way it is asking to go, which is the entire idea.
 *
 * Returns a new vector; the input is never mutated (a mode passing its own velocity in would otherwise
 * compound the scale every frame — the same trap the jab burst has a comment about).
 */
export function stanceWish(wish: Vector3, yaw: number, engaged: boolean, intense = false): Vector3 {
  // the repo's convention: facing (sin yaw, cos yaw), right = (fz, -fx) = (cos yaw, -sin yaw)
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const rx = fz, rz = -fx;
  const forward = wish.x * fx + wish.z * fz;
  const lateral = wish.x * rx + wish.z * rz;

  const sitting = engaged && intense;
  const f = forward * (sitting ? INTENSE_FORWARD_PENALTY : engaged ? STANCE_FORWARD_PENALTY : 1);
  const l = lateral * (sitting ? INTENSE_LATERAL_GAIN : engaged ? STANCE_LATERAL_GAIN : UPRIGHT_LATERAL_PENALTY);

  return new Vector3(f * fx + l * rx, wish.y, f * fz + l * rz);
}

/**
 * How much of a lateral move this body can answer, 0..1 — for an AI defender deciding whether it can stay
 * in front, and for the HUD if it ever wants to show it.
 *
 * Deliberately the same two constants the movement uses, so the number a brain reasons with and the speed a
 * body actually gets can never disagree.
 */
export function lateralAuthority(engaged: boolean): number {
  return engaged ? STANCE_LATERAL_GAIN / STANCE_LATERAL_GAIN : UPRIGHT_LATERAL_PENALTY / STANCE_LATERAL_GAIN;
}
