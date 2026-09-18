// THE FLOOR ANSWERS A HARD STOP (2026-09-14).
//
// Polish brief: "shoe-dust puffs on hard stops". `EffectsKit.burst(..., 'dust')` already exists and ten
// modes call it — for knockdowns, tackles, landings and bails. Not one fires it for STOPPING, which is the
// most common violent thing a body does in a court sport and the one the player performs deliberately.
// A hard cut currently costs the floor nothing.
//
// THE DECISION THAT MAKES THIS FRAME-INDEPENDENT, which is the whole reason it is a module and not four
// lines in a mode:
//
// The naive version compares this frame's speed to last frame's and fires when the drop exceeds a
// threshold. That is a TRAP: the same stop fires at 30 fps and does not at 144, because a bigger frame
// sees a bigger delta. The threshold has to be a DECELERATION — metres per second per second — which is a
// property of the body, not of the frame rate. `(prev - now) / dt` is the same number at any refresh.
//
// The cooldown is in seconds and counted down by dt for exactly the same reason.
//
// Pure: no Babylon, no scene, no particles. It decides WHEN; the mode decides what that looks like.

/** Below this there is nothing to scuff — you were already walking. */
export const SCUFF_MIN_SPEED = 3.2;
/** Deceleration that counts as a hard stop, m/s². A jog easing up is ~4; a planted cut is 18+. */
export const SCUFF_MIN_DECEL = 16;
/** One puff per stop: a body that keeps decelerating must not emit every frame. */
export const SCUFF_COOLDOWN_SEC = 0.45;
/** Above this deceleration the puff is at full strength. */
export const SCUFF_FULL_DECEL = 42;

export interface ScuffState {
  /** Planar speed last frame, m/s. */
  prevSpeed: number;
  /** Seconds until another puff is allowed. */
  cooldown: number;
}

export const SCUFF_IDLE: ScuffState = { prevSpeed: 0, cooldown: 0 };

export interface ScuffResult {
  state: ScuffState;
  /** 0 = nothing happened. Above 0, how hard — scale the puff and the squeak with it. */
  strength: number;
}

/**
 * Did this body just stop hard?
 *
 * `grounded` is required and not optional: a body slowing down in the AIR has not scuffed anything, and
 * that is the difference between a cut and the top of a jump. A mode with no air state passes true.
 */
export function tickScuff(state: ScuffState, speed: number, dt: number, grounded: boolean): ScuffResult {
  const cooldown = Math.max(0, state.cooldown - dt);
  // a frame with no time in it tells us nothing about acceleration
  if (dt <= 1e-5) return { state: { prevSpeed: state.prevSpeed, cooldown }, strength: 0 };

  const next: ScuffState = { prevSpeed: speed, cooldown };
  if (!grounded || cooldown > 0) return { state: next, strength: 0 };
  if (state.prevSpeed < SCUFF_MIN_SPEED) return { state: next, strength: 0 };

  // DECELERATION, not the per-frame drop. The drop scales with dt; this does not.
  const decel = (state.prevSpeed - speed) / dt;
  if (decel < SCUFF_MIN_DECEL) return { state: next, strength: 0 };

  const span = Math.max(1, SCUFF_FULL_DECEL - SCUFF_MIN_DECEL);
  const strength = Math.max(0, Math.min(1, (decel - SCUFF_MIN_DECEL) / span));
  return { state: { prevSpeed: speed, cooldown: SCUFF_COOLDOWN_SEC }, strength };
}

/** Puff size for a scuff strength. Small even at full — a stop is a puff, not an explosion. */
export function scuffPuffScale(strength: number): number {
  return 0.35 + 0.45 * Math.max(0, Math.min(1, strength));
}

/** How loud the shoe is. Deliberately quiet: a squeak that competes with the whistle is a toy. */
export function scuffVolume(strength: number): number {
  return 0.10 + 0.16 * Math.max(0, Math.min(1, strength));
}
