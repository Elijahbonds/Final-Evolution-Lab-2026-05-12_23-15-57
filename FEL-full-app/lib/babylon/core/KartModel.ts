// KART MODEL — Velocity Kart (2026-09-12).
//
// Owner asked for "karting? maps? gameplay?". Same honest position as Aero Aces: Velocity Kart has NEVER
// existed in this codebase — "retired by decision, do not resurrect" (docs/ASSESSMENT-2026-09-04.md:42,
// MASTER_MODE_LIST.md:77). The ask supersedes that, but it is a new mode, so it starts with handling.
//
// The design target is KART racing, not a driving simulator, and the distinction is one mechanic: THE DRIFT IS
// THE ACCELERATOR. In a sim you drift because you lost grip; in a kart game you drift because it is the fastest
// way round, and a corner you take badly is slower than a corner you slide. Everything below exists to make
// that true:
//
//   1. GRIP vs SLIP. Below the grip limit the kart goes where it points. Past it the rear steps out and the
//      kart travels at an angle to its nose — a real slip angle, not a steering multiplier.
//   2. A DRIFT CHARGES BOOST. Hold a clean slide and you bank boost; let go and you spend it. That is the
//      entire risk/reward loop of the genre.
//   3. OFF THE TRACK COSTS YOU. Grip and top speed both collapse on the dirt, so the racing line is worth
//      finding rather than being decoration.
//
// Pure maths — Vector3 only — so the handling is tunable and testable without a scene.

import { Vector3 } from '@babylonjs/core';

export interface KartSpec {
  /** Top speed on tarmac, m/s. */
  vMax: number;
  /** How hard it pulls, m/s². */
  accel: number;
  /** Braking power, m/s². */
  brake: number;
  /** Rolling resistance, m/s² per (m/s)². */
  drag: number;
  /** Steering rate at low speed, radians/sec. */
  steerRate: number;
  /** Lateral grip, m/s². Past this the rear steps out. */
  grip: number;
  /** How fast a slide straightens itself out when you stop asking for it, 1/sec. */
  slipRecover: number;
  /** Boost banked per second of clean drift, 0..1 of the meter. */
  driftCharge: number;
  /** Extra speed while spending boost, m/s. */
  boostSpeed: number;
  /** How long a full meter of boost lasts, seconds. */
  boostSec: number;
  /** Multiplier on grip and top speed off the track. */
  offTrack: number;
  /**
   * SCRUB: speed lost per m/s² of cornering demand the tyres cannot hold, while NOT drifting.
   *
   * This is the mechanic that makes the drift the fast line. Without it, taking a corner tidily cost nothing
   * at all, so a tidy lap matched a drifted one (measured: 56.29 vs 56.24 — the tidy kart marginally AHEAD)
   * and the whole premise of the model was false. A kart that understeers is washing its front tyres across
   * the tarmac and losing speed doing it; a kart that is SLIDING has put that energy into the slide instead
   * and carries its speed through. That is why you drift.
   */
  scrub: number;
  /** How much of the scrub a proper slide avoids, 0..1. */
  driftScrubRelief: number;
}

/** The starter kart: grippy enough to be forgiving, loose enough that drifting is obviously faster. */
export const KART_STARTER: KartSpec = {
  vMax: 26, accel: 13, brake: 22, drag: 0.012,
  steerRate: 2.5, grip: 11, slipRecover: 3.2,
  driftCharge: 0.55, boostSpeed: 11, boostSec: 1.5,
  offTrack: 0.45,
  scrub: 0.85, driftScrubRelief: 0.8,
};

export interface KartState {
  pos: Vector3;
  /** Where the nose points, radians. */
  heading: number;
  /** Forward speed along the direction of TRAVEL, m/s. */
  speed: number;
  /** The angle between the nose and the direction of travel, radians. THIS is the drift. */
  slip: number;
  /** Boost in the bank, 0..1. */
  boost: number;
  /** Seconds of boost still firing. */
  boosting: number;
  /** True while the kart is sliding enough to count as a drift. */
  drifting: boolean;
}

export interface KartInput {
  /** −1 left .. +1 right. */
  steer: number;
  /** 0..1. */
  throttle: number;
  /** 0..1. */
  brake: number;
  /** The drift button (a handbrake): breaks traction deliberately. */
  drift?: boolean;
  /** Spend the banked boost. */
  fire?: boolean;
}

export const KART_NEUTRAL: KartInput = { steer: 0, throttle: 0, brake: 0 };

/** Slip past this angle counts as a drift worth charging boost. */
export const DRIFT_SLIP = 0.18;
/** Slip is clamped here — a kart spins, it does not travel backwards. */
export const MAX_SLIP = 0.95;

export function spawnKart(at: Vector3, heading = 0): KartState {
  return { pos: at.clone(), heading, speed: 0, slip: 0, boost: 0, boosting: 0, drifting: false };
}

/** The direction the kart is TRAVELLING — the nose rotated by the slip angle. */
export function travelOf(s: KartState): Vector3 {
  const a = s.heading + s.slip;
  return new Vector3(Math.sin(a), 0, Math.cos(a));
}

/** Unit vector the nose points along. */
export function kartNose(s: KartState): Vector3 {
  return new Vector3(Math.sin(s.heading), 0, Math.cos(s.heading));
}

/**
 * One step.
 *
 * Mutates and returns, like BallSim and the flight model: one kart steps every frame and a fresh object per
 * frame is pure garbage.
 */
export function stepKart(s: KartState, input: KartInput, dt: number, onTrack: boolean, spec: KartSpec = KART_STARTER): KartState {
  const grip = spec.grip * (onTrack ? 1 : spec.offTrack);
  const vMax = spec.vMax * (onTrack ? 1 : spec.offTrack) + (s.boosting > 0 ? spec.boostSpeed : 0);

  // FIRE THE BOOST. Spending is a decision: it empties the bank.
  if (input.fire && s.boost > 0.15 && s.boosting <= 0) {
    s.boosting = spec.boostSec * s.boost;
    s.boost = 0;
  }
  s.boosting = Math.max(0, s.boosting - dt);

  // SPEED.
  const push = spec.accel * Math.max(0, Math.min(1, input.throttle)) * (s.boosting > 0 ? 1.6 : 1);
  const stop = spec.brake * Math.max(0, Math.min(1, input.brake));
  const roll = spec.drag * s.speed * s.speed;
  s.speed = Math.max(0, Math.min(vMax, s.speed + (push - stop - roll) * dt));

  // STEERING. A kart turns hardest at moderate speed: at a standstill the wheels do nothing, and at the top
  // end it washes out. The curve peaks around a third of vMax, which is where a corner actually gets taken.
  const v01 = Math.max(0, Math.min(1, s.speed / spec.vMax));
  const steerAuth = Math.min(1, v01 * 3) * (1 - v01 * 0.35);
  const steer = Math.max(-1, Math.min(1, input.steer));
  s.heading = wrap(s.heading + steer * spec.steerRate * steerAuth * dt);

  // GRIP vs SLIP — the heart of it. The lateral acceleration a corner demands grows with speed and how hard
  // you are turning; past the grip limit the rear steps out and the kart starts travelling at an angle to its
  // nose. The handbrake breaks traction on purpose.
  const demand = Math.abs(steer) * s.speed * spec.steerRate * steerAuth;
  const excess = Math.max(0, demand - grip);
  // SCRUB — the understeer tax. A corner the tyres cannot hold costs speed unless you are SLIDING through it,
  // which is precisely what makes the drift the fast line rather than a stylish way to lose time.
  if (excess > 0) {
    const relief = Math.abs(s.slip) > DRIFT_SLIP ? spec.driftScrubRelief : 0;
    s.speed = Math.max(0, s.speed - excess * spec.scrub * (1 - relief) * dt);
  }
  const wanted = (excess / Math.max(1, grip)) * 0.9 + (input.drift && s.speed > spec.vMax * 0.25 ? 0.45 : 0);
  const target = Math.max(-MAX_SLIP, Math.min(MAX_SLIP, -Math.sign(steer || 1) * Math.min(MAX_SLIP, wanted)));
  // slide INTO the target while the corner is being asked for, and straighten out when it is not
  const toward = Math.abs(target) > Math.abs(s.slip) ? 6.5 : spec.slipRecover;
  s.slip += (target - s.slip) * Math.min(1, toward * dt);
  if (Math.abs(s.slip) < 0.01) s.slip = 0;

  // A CLEAN DRIFT BANKS BOOST. Only while actually sliding and actually moving: a stationary handbrake spin
  // must not print boost, which is the first thing anyone tries.
  s.drifting = Math.abs(s.slip) > DRIFT_SLIP && s.speed > spec.vMax * 0.3;
  if (s.drifting && s.boosting <= 0) s.boost = Math.min(1, s.boost + spec.driftCharge * dt);

  // TRAVEL along the direction of travel, not the nose — that difference IS the drift.
  s.pos.addInPlace(travelOf(s).scale(s.speed * dt));
  return s;
}

function wrap(v: number): number {
  let a = v;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Is a drift worth boost right now? For a HUD ring or a spark emitter. */
export function driftQuality(s: KartState): number {
  return Math.max(0, Math.min(1, (Math.abs(s.slip) - DRIFT_SLIP) / (MAX_SLIP - DRIFT_SLIP)));
}

/** Bonk a wall: kill most of the speed and straighten the slide. Returns the speed lost. */
export function kartHitWall(s: KartState, keep = 0.25): number {
  const lost = s.speed * (1 - keep);
  s.speed *= keep;
  s.slip = 0;
  return lost;
}
