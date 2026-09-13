// FLIGHT MODEL — Aero Aces (2026-09-12).
//
// Owner asked for "aero aces, karting? maps? gameplay?". Worth being precise about what this is: Aero Aces
// Flyer has NEVER existed in this codebase. It is listed as "retired by decision, do not resurrect"
// (docs/ASSESSMENT-2026-09-04.md:42, MASTER_MODE_LIST.md:51) and MODE_IMPLEMENTATION_MAP.txt records it as
// "Not found in app/play". The owner's ask supersedes that retirement, but the cost is a NEW MODE, not a
// repair — so it starts where a flying game lives or dies: the handling model.
//
// The design target is ARCADE FLIGHT, not a simulator. Pilot Wings / Star Fox / Ace Combat's assault mode,
// where the aircraft is always recoverable and the skill is energy management — trading height for speed and
// speed for turn rate. Three rules make that real, and all three are in here:
//
//   1. SPEED COMES FROM THROTTLE AND FROM DIVING. Point the nose down and you accelerate whatever the
//      throttle says. That single rule is what makes a dive a decision.
//   2. LIFT COMES FROM SPEED. Slow down too far and you STALL — the nose drops and you fall until speed
//      returns. A plane that cannot stall has no floor to its skill.
//   3. A TURN COSTS SPEED, and it is sharper when you BANK. Rolling into a turn rather than yawing flat is
//      the whole grammar of flying well.
//
// Pure maths — no Babylon beyond Vector3 — so the handling can be tuned and tested without a scene, which is
// the only sane way to build a flight model.

import { Vector3 } from '@babylonjs/core';

/** The aircraft's tuning. One object so a mode can offer different planes later. */
export interface Airframe {
  /** Level flight speed at full throttle, m/s. */
  cruise: number;
  /** Absolute ceiling on speed, m/s — a dive cannot exceed it. */
  vMax: number;
  /** Below this the wing stops flying, m/s. */
  vStall: number;
  /** How hard the throttle pushes, m/s². */
  thrust: number;
  /** Drag coefficient: deceleration grows with speed². */
  drag: number;
  /** Pitch rate at cruise, radians/sec. */
  pitchRate: number;
  /** Roll rate, radians/sec. */
  rollRate: number;
  /** How much BANK becomes turn, radians/sec at full roll. */
  turnFromBank: number;
  /** Flat yaw authority (the rudder) — deliberately weak, so banking is the way to turn. */
  yawRate: number;
  /** Speed bled per radian/sec of turn. A turn must cost something. */
  turnDrag: number;
}

/**
 * The starter plane: forgiving, quick to roll, punishes a flat turn.
 *
 * DRAG IS SOLVED FOR, not guessed. The equilibrium speed is where thrust balances drag, so
 * `drag = thrust * t / cruise^2`. At 0.7 throttle that has to land on `cruise` or the word means nothing —
 * 26 * 0.7 / 58^2 = 0.0054. The first pass used 0.0016, which put the full-throttle equilibrium at 127 m/s,
 * ABOVE vMax: the aircraft simply pegged at its ceiling in level flight and "cruise" described nothing.
 */
export const AERO_TRAINER: Airframe = {
  cruise: 58, vMax: 115, vStall: 22,
  thrust: 26, drag: 0.0054,
  pitchRate: 1.5, rollRate: 2.8, turnFromBank: 1.25, yawRate: 0.35,
  turnDrag: 7,
};

/**
 * How far above the stall speed you must get before the wing flies again.
 *
 * Stall hysteresis is real, and without it this model produced a PHUGOID: it dipped under the stall speed,
 * the nose dropped, speed returned, it unstalled, climbed, slowed, stalled again — self-balancing just above
 * the stall at about 29 m/s forever. That is a neat emergent oscillation and completely wrong for the game,
 * because it means a stall is never a state the player has to fly out of. It latches now.
 */
export const STALL_RECOVER = 1.3;

/** Gravity, m/s². The same number the rest of the game uses. */
const G = 9.81;

export interface FlightState {
  /** World position. */
  pos: Vector3;
  /** Radians. Heading is yaw about +y; pitch is nose up positive; roll is bank, right-wing-down positive. */
  heading: number;
  pitch: number;
  roll: number;
  /** Airspeed along the nose, m/s. */
  speed: number;
  /** True while the wing is not flying. */
  stalled: boolean;
}

export interface FlightInput {
  /** −1 nose down .. +1 nose up. */
  pitch: number;
  /** −1 roll left .. +1 roll right. */
  roll: number;
  /** −1 .. +1 rudder. */
  yaw: number;
  /** 0..1 throttle. */
  throttle: number;
  /** Boost held. */
  boost?: boolean;
}

export const NEUTRAL_INPUT: FlightInput = { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 };

/** A fresh aircraft, flying level at cruise. */
export function spawnFlight(at: Vector3, heading = 0, frame: Airframe = AERO_TRAINER): FlightState {
  return { pos: at.clone(), heading, pitch: 0, roll: 0, speed: frame.cruise * 0.8, stalled: false };
}

/** Unit vector the nose points along. */
export function noseOf(s: FlightState): Vector3 {
  const cp = Math.cos(s.pitch);
  return new Vector3(Math.sin(s.heading) * cp, Math.sin(s.pitch), Math.cos(s.heading) * cp);
}

/** How much control authority the wing has: none at a standstill, full at cruise. */
export function authority(s: FlightState, frame: Airframe): number {
  return Math.max(0, Math.min(1, s.speed / frame.cruise));
}

/** Boost multiplier on thrust while held. */
export const BOOST_THRUST = 2.1;

/**
 * One step of flight.
 *
 * Mutates and returns the state, the way BallSim does, because a mode steps one aircraft every frame and
 * allocating a new state per frame for sixty seconds is pure garbage.
 */
export function stepFlight(s: FlightState, input: FlightInput, dt: number, frame: Airframe = AERO_TRAINER): FlightState {
  const auth = authority(s, frame);

  // ROLL is always available — it is the one control a slow aircraft keeps, which is what makes a stall
  // recoverable rather than a death sentence.
  s.roll = clampAngle(s.roll + input.roll * frame.rollRate * dt, Math.PI * 0.75);

  // PITCH scales with authority: a slow aircraft cannot haul the nose up, which IS the stall.
  s.pitch = clampAngle(s.pitch + input.pitch * frame.pitchRate * auth * dt, Math.PI * 0.48);

  // TURN comes mostly from BANK. The rudder exists but is deliberately weak, so the way to turn well is to
  // roll into it — the grammar of flying rather than of driving.
  const bankTurn = Math.sin(s.roll) * frame.turnFromBank * auth;
  const rudder = input.yaw * frame.yawRate * auth;
  const turn = bankTurn + rudder;
  s.heading = wrapAngle(s.heading + turn * dt);

  // SPEED. Throttle pushes, drag pulls, the nose trades height for speed either way, and a turn costs.
  const thrust = frame.thrust * Math.max(0, Math.min(1, input.throttle)) * (input.boost ? BOOST_THRUST : 1);
  const gravityAlongNose = -Math.sin(s.pitch) * G;      // nose down (negative pitch) accelerates
  const dragDecel = frame.drag * s.speed * s.speed;
  const turnCost = Math.abs(turn) * frame.turnDrag;
  s.speed = Math.max(0, Math.min(frame.vMax, s.speed + (thrust + gravityAlongNose - dragDecel - turnCost) * dt));

  // STALL, with hysteresis: it begins below vStall and does not end until the speed is comfortably back
  // above it, so recovering is a thing the pilot DOES — point down, build speed, fly again.
  s.stalled = s.stalled ? s.speed < frame.vStall * STALL_RECOVER : s.speed < frame.vStall;
  if (s.stalled) {
    s.pitch = Math.max(-Math.PI * 0.48, s.pitch - 1.6 * dt);   // the nose drops on its own
  }

  // TRAVEL along the nose, plus the sink a stalled wing cannot hold up.
  const nose = noseOf(s);
  s.pos.addInPlace(nose.scale(s.speed * dt));
  if (s.stalled) s.pos.y -= (frame.vStall - s.speed) * 0.55 * dt;

  return s;
}

function clampAngle(v: number, lim: number): number { return Math.max(-lim, Math.min(lim, v)); }
function wrapAngle(v: number): number {
  let a = v;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Roll eases back toward level when the stick is released — a plane wants to fly straight. */
export function levelOut(s: FlightState, dt: number, rate = 1.3): void {
  const k = Math.min(1, rate * dt);
  s.roll += (0 - s.roll) * k;
}

/** Keep an aircraft above the ground and inside the world; returns true if it was CLAMPED (a crash read). */
export function clampFlight(s: FlightState, floorY: number, ceilingY: number, halfWidth: number): boolean {
  let hit = false;
  if (s.pos.y < floorY) { s.pos.y = floorY; if (s.pitch < 0) s.pitch = 0; hit = true; }
  if (s.pos.y > ceilingY) { s.pos.y = ceilingY; if (s.pitch > 0) s.pitch = 0; }
  if (Math.abs(s.pos.x) > halfWidth) { s.pos.x = Math.sign(s.pos.x) * halfWidth; hit = true; }
  if (Math.abs(s.pos.z) > halfWidth) { s.pos.z = Math.sign(s.pos.z) * halfWidth; hit = true; }
  return hit;
}
