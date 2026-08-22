// groundGuard — stop the rider falling through the world.
//
// MEASURED ON THE DEPLOYED BUILD, 2026-07-27, with ZERO player input:
//
//   skateboard   24 clamps in 11s   worst y  -2.02
//   snowboard    25 clamps in 11s   worst y  -2.29
//   surf         23 clamps in 11s   worst y  -2.41
//
// Eleven of fourteen modes were clean. These three were not, and the log line
// the app already prints is the diagnosis:
//
//   [FEL-SPAWN] Rider: 1 missed raycasts (y=-1.93) — hard-clamping to floor
//
// It clamps, and one frame later it is under the floor again, at roughly the
// same depth, forever. A clamp that has to keep firing is not holding.
//
// THE CAUSE, FROM THE SHAPE OF THE DATA
// Position is being corrected and velocity is not. Gravity keeps integrating
// into `vy` while the actor sits exactly on the floor, so the very next frame
// it is below again — the clamp fights gravity once per frame and loses once
// per frame. The depth stays roughly constant (~2 units) because it is
// one frame of accumulated fall, not a fall in progress. That constant depth
// is the tell: something falling would get deeper.
//
// So the fix is one line — **zero the downward velocity when you clamp** —
// plus a guard for the case the clamp cannot fix at all, because the other
// possibility the data allows is that the ground query itself is wrong (the
// rider left the collision mesh). Clamping to a floor you cannot find is how
// you get a camera following an actor through an empty void, which is what
// the screenshots show.
//
// NOT A NEW SUBSYSTEM. The app already detects this and already prints that
// line. This is the missing half of a correction it is trying to make.

/** Consecutive clamped frames before we stop trusting the ground query. */
export const STUCK_FRAMES = 12;

/** Terminal velocity, so a long fall cannot tunnel through thin geometry. */
export const MAX_FALL_SPEED = 30;

/**
 * Penetration that counts as a fault rather than a landing.
 *
 * A landing always penetrates a little — the actor crosses the floor partway
 * through the frame. Counting those as faults is how the first draft of this
 * file re-seated an actor that was standing still perfectly happily.
 */
export const FAULT_DEPTH = 0.35;

export interface GroundActor {
  y: number;
  /** Vertical velocity, m/s. Negative is falling. */
  vy: number;
  /**
   * Resting on the floor.
   *
   * This flag is the difference between a guard that works and one that
   * fights itself. Without it, gravity integrates into a stationary actor
   * every frame, the actor dips below the floor every frame, and the guard
   * corrects every frame — which is a faithful reproduction of the bug it was
   * written to fix. The first draft of this file did exactly that.
   */
  grounded: boolean;
  /** Consecutive frames the guard has had to make a FAULT-sized correction. */
  clampedFrames: number;
}

export type GroundAction = 'none' | 'clamped' | 'reseated';

export interface GroundResult extends GroundActor {
  action: GroundAction;
  /** Set when the guard gave up on the ground query. */
  reason?: string;
}

export interface GroundQuery {
  /** Floor height under the actor, or null when the raycast missed. */
  groundY: number | null;
  /** Where to put an actor whose ground cannot be found — spawn, or the last
   *  known-good point on the course. */
  safeY: number;
}

/**
 * Advance one frame of vertical motion, with the correction that sticks.
 *
 * Pure, because the whole point is that this behaviour can be asserted. The
 * version of this fix that lives inside a Babylon `onBeforeRender` is the
 * version nobody can prove works, and that is the state it is in today.
 */
export function groundStep(
  actor: GroundActor,
  q: GroundQuery,
  dt: number,
  gravity = -9.81,
): GroundResult {
  // The raycast missed. Clamping to a floor we cannot locate is what produces
  // an actor at a constant negative depth forever, so treat a missing ground
  // as a lost actor immediately rather than pretending y=0 is the world.
  if (q.groundY === null) {
    return {
      y: q.safeY, vy: 0, grounded: true, clampedFrames: actor.clampedFrames + 1,
      action: 'reseated',
      reason: 'ground query missed — actor is off the collision mesh',
    };
  }

  // RESTING. No gravity integration at all while grounded and not moving up.
  // The actor follows the floor, which is what lets it stand on a moving ramp
  // without the guard treating every frame as a landing.
  if (actor.grounded && actor.vy <= 0) {
    return { y: q.groundY, vy: 0, grounded: true, clampedFrames: 0, action: 'none' };
  }

  const vy = Math.max(-MAX_FALL_SPEED, actor.vy + gravity * dt);
  const y = actor.y + vy * dt;

  if (y > q.groundY) {
    return { y, vy, grounded: false, clampedFrames: 0, action: 'none' };
  }

  // Landing. A normal one penetrates less than one frame of fall; anything
  // deeper is the actor arriving from somewhere it should not have been.
  const penetration = q.groundY - y;
  const clampedFrames = penetration > FAULT_DEPTH ? actor.clampedFrames + 1 : 0;

  // Repeated FAULT-sized correction means the correction is not working.
  // Re-seat rather than clamp for a fortieth frame — the deployed build
  // printed its clamp line 25 times in 11 seconds and never recovered.
  if (clampedFrames >= STUCK_FRAMES) {
    return {
      y: q.safeY, vy: 0, grounded: true, clampedFrames: 0,
      action: 'reseated',
      reason: `corrected ${clampedFrames} frames running — the ground query is not survivable`,
    };
  }

  // THE FIX. Landing means the fall is over: put the actor on the floor, mark
  // it grounded, AND stop it moving downward. Leave out any one of the three
  // and gravity re-penetrates on the very next frame, forever.
  return { y: q.groundY, vy: 0, grounded: true, clampedFrames, action: 'clamped' };
}

/**
 * The old behaviour, kept so the difference is testable rather than asserted.
 *
 * This is what the deployed build does, reconstructed from its log output. A
 * test drives both and shows one settles and the other never does.
 */
export function legacyClampOnly(
  actor: GroundActor,
  q: GroundQuery,
  dt: number,
  gravity = -9.81,
): GroundResult {
  const vy = actor.vy + gravity * dt;
  const y = actor.y + vy * dt;
  if (q.groundY === null || y > q.groundY) {
    return { y, vy, grounded: false, clampedFrames: 0, action: 'none' };
  }
  // Position corrected. Velocity left alone, no grounded state. This is the bug.
  return { y: q.groundY, vy, grounded: false, clampedFrames: actor.clampedFrames + 1, action: 'clamped' };
}

/** Run `frames` frames and report what happened. For tests and for a repro. */
export function simulateGrounding(
  step: typeof groundStep,
  start: GroundActor,
  q: GroundQuery,
  frames: number,
  dt = 1 / 60,
): { clamps: number; reseats: number; finalY: number; settledAfter: number | null } {
  let a: GroundActor = { ...start };
  let clamps = 0; let reseats = 0; let settledAfter: number | null = null;
  let quiet = 0;
  for (let i = 0; i < frames; i++) {
    const r = step(a, q, dt);
    if (r.action === 'clamped') { clamps++; quiet = 0; }
    else if (r.action === 'reseated') { reseats++; quiet = 0; }
    else { quiet++; if (quiet === 30 && settledAfter === null) settledAfter = i - 29; }
    a = { y: r.y, vy: r.vy, grounded: r.grounded, clampedFrames: r.clampedFrames };
  }
  return { clamps, reseats, finalY: a.y, settledAfter };
}
