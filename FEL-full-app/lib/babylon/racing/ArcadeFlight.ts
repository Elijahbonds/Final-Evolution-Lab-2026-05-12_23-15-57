// ARCADE FLIGHT — Aero Aces flies like Diddy Kong Racing's plane (owner, 2026-09-15: "Aero aces is supposed to be like
// diddy Kong flyers"). Decisions: arcade handling — you cannot stall or crash out, turns are tight, the wings level
// themselves, and you fly LOW through a course rather than up in open sky.
//
// FlightModel.ts is an energy-management sim (stall, lift from speed, a dive for speed). That is a good model of a
// different game. A kart-racer plane is a KART THAT CAN CLIMB: the stick steers, the trigger is the gas, the brake
// tightens the turn, and the altitude is a lane you pick rather than a resource you manage. Everything a player could
// fumble into a wreck is taken out:
//
//   · NO STALL. Speed never drops below `minSpeed`; the nose never falls on its own.
//   · STEER = YAW, and the BANK is what the plane looks like while it turns — eased toward the stick, levelled when you
//     let go. Rolling is never a control you have to manage.
//   · CLIMB / DIVE is a pitch the stick asks for and gets, eased; hands off, the nose comes back level.
//   · BRAKE (hold) slows toward `minSpeed` and TIGHTENS the turn — DKR's tight-turn button.
//   · THE FLOOR AND THE CEILING are soft: the ground pushes the nose up and costs a little speed, it never stops you.
//   · STUNTS: a BARREL ROLL (a quick sideways dodge — missiles pass through it) and a LOOP (a vertical half loop and roll
//     out: an Immelmann, which comes out facing back the way you came, higher — the DKR U-turn for a missed balloon).
//   · BANANAS lift the top speed a little each, capped; a boost lifts it +40% (the shared BoostKit ramp).
//
// Pure maths — Vector3 only — so the handling is tested headless.

import { Vector3 } from '@babylonjs/core';
import type { Airframe } from '../core/FlightModel';

export interface ArcadeTune {
  /** Speed with the gas held, m/s (before bananas and boost). */
  top: number;
  /** Speed you settle at off the gas — still flying, never stalling. */
  coast: number;
  /** The floor speed the brake pulls toward. */
  minSpeed: number;
  /** m/s² toward the target speed. */
  accel: number;
  /** m/s² while braking. */
  brakeDecel: number;
  /** Yaw rate at full stick, rad/s. */
  turnRate: number;
  /** Turn multiplier while braking. */
  brakeTurn: number;
  /** The most the stick can ask the nose to climb / dive, radians. */
  maxPitch: number;
  /** How quickly the nose follows the stick (1/s). */
  pitchEase: number;
  /** Visual bank at full stick, radians. */
  maxBank: number;
  /** m/s of top speed per banana. */
  bananaSpeed: number;
  /** Bananas that count. */
  bananaCap: number;
}

/** DKR scale: laps of ~1 km flown in 30–40 s, low through canyons and under arches. */
export const ARCADE_TRAINER: ArcadeTune = {
  top: 32, coast: 22, minSpeed: 14, accel: 11, brakeDecel: 16,
  turnRate: 1.55, brakeTurn: 1.65, maxPitch: 0.55, pitchEase: 4.5, maxBank: 0.85,
  bananaSpeed: 0.55, bananaCap: 10,
};

/**
 * A garage airframe as arcade handling. The picker's four planes keep their identities — the darter is the fast one,
 * the kestrel the turner — scaled around the trainer they were tuned against.
 */
export function arcadeFrom(frame: Airframe, base: ArcadeTune = ARCADE_TRAINER): ArcadeTune {
  const speed = frame.cruise / 58;               // AERO_TRAINER.cruise
  const turn = (frame.turnFromBank / 1.25 + frame.rollRate / 2.8) / 2;
  const settle = frame.pitchRate / 1.5;
  return {
    ...base,
    top: base.top * (0.7 + 0.3 * speed), coast: base.coast * (0.75 + 0.25 * speed),
    turnRate: base.turnRate * turn, pitchEase: base.pitchEase * settle,
  };
}

export type Stunt = 'roll_left' | 'roll_right' | 'loop';

export interface ArcadeState {
  pos: Vector3;
  heading: number;
  /** Nose up positive, radians (what the plane is flying). */
  pitch: number;
  /** Visual bank, right wing down positive. */
  roll: number;
  speed: number;
  stunt: Stunt | null;
  /** Seconds into the stunt. */
  stuntT: number;
  /** Heading when the loop began (it comes out reversed). */
  stuntHeading: number;
  /** Spun out by a hit: no control, speed bleeding. */
  spinT: number;
}

export interface ArcadeInput {
  /** −1 left .. +1 right. */
  steer: number;
  /** −1 dive .. +1 climb. */
  climb: number;
  /** 0..1 gas. */
  gas: number;
  /** 0..1 brake. */
  brake: number;
  /** The shared boost ramp, 0..1. */
  boostK: number;
  /** Bananas carried. */
  bananas: number;
}

export const ROLL_SEC = 0.55;
export const LOOP_SEC = 1.15;
/** How far a barrel roll carries you sideways, metres. */
export const ROLL_SHIFT = 7;
export const SPIN_SEC = 1.1;

export function spawnArcade(at: Vector3, heading: number, tune: ArcadeTune = ARCADE_TRAINER): ArcadeState {
  return { pos: at.clone(), heading, pitch: 0, roll: 0, speed: tune.coast, stunt: null, stuntT: 0, stuntHeading: heading, spinT: 0 };
}

export function forwardOf(s: { heading: number; pitch: number }): Vector3 {
  const cp = Math.cos(s.pitch);
  return new Vector3(Math.sin(s.heading) * cp, Math.sin(s.pitch), Math.cos(s.heading) * cp);
}

/** Top speed for this input — gas, bananas, boost. */
export function topFor(input: ArcadeInput, tune: ArcadeTune): number {
  const bananas = Math.max(0, Math.min(tune.bananaCap, input.bananas));
  return (tune.top + bananas * tune.bananaSpeed) * (1 + 0.4 * Math.max(0, Math.min(1, input.boostK)));
}

/** Start a stunt. Refused mid-stunt or while spun out. */
export function startStunt(s: ArcadeState, stunt: Stunt): boolean {
  if (s.stunt || s.spinT > 0) return false;
  s.stunt = stunt; s.stuntT = 0; s.stuntHeading = s.heading;
  return true;
}

/** A barrel roll is a dodge: projectiles pass through it for its middle 80%. */
export function dodging(s: ArcadeState): boolean {
  return (s.stunt === 'roll_left' || s.stunt === 'roll_right') && s.stuntT > ROLL_SEC * 0.1 && s.stuntT < ROLL_SEC * 0.9;
}

/** Knocked into a spin by a missile / mine. */
export function spinOut(s: ArcadeState): void {
  s.spinT = SPIN_SEC; s.stunt = null; s.stuntT = 0;
}

const ease = (cur: number, want: number, rate: number, dt: number): number => cur + (want - cur) * Math.min(1, rate * dt);
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * One frame. `floorAt(x, z)` is the ground height under a point (terrain, water); the plane is held `clearance` above
 * it and below `ceiling`. Returns 'floor' on the frame the plane touches the ground (the mode plays the scrape).
 */
export function stepArcade(
  s: ArcadeState, input: ArcadeInput, dt: number, tune: ArcadeTune,
  floorAt: (x: number, z: number) => number, ceiling: number, clearance = 2.5,
): 'floor' | null {
  if (!(dt > 0)) return null;
  const top = topFor(input, tune);

  // ── speed: toward the gas target, the brake pulls to the floor speed, never below it ──
  let want = input.gas > 0.1 ? tune.coast + (top - tune.coast) * Math.min(1, input.gas) : tune.coast;
  if (input.boostK > 0.05) want = Math.max(want, top);
  if (input.brake > 0.1) want = tune.minSpeed;
  const rate = input.brake > 0.1 && s.speed > want ? tune.brakeDecel : tune.accel;
  if (s.speed < want) s.speed = Math.min(want, s.speed + rate * dt);
  else s.speed = Math.max(want, s.speed - rate * dt * (s.speed > top ? 1.5 : 1));
  s.speed = Math.max(tune.minSpeed, s.speed);

  // ── spun out: no control, the plane tumbles on its heading and loses speed ──
  if (s.spinT > 0) {
    s.spinT = Math.max(0, s.spinT - dt);
    s.speed = Math.max(tune.minSpeed, s.speed - 18 * dt);
    s.roll += 14 * dt;
    s.pitch = ease(s.pitch, 0, 3, dt);
  } else if (s.stunt === 'loop') {
    // ── the Immelmann: half a loop up and over (pitch 0 → π), rolled upright at the top — out facing back ──
    s.stuntT += dt;
    const k = Math.min(1, s.stuntT / LOOP_SEC);
    const arc = Math.PI * k;
    const r = (s.speed * LOOP_SEC) / Math.PI;       // the loop's radius from the speed it is flown at
    const fwd = new Vector3(Math.sin(s.stuntHeading), 0, Math.cos(s.stuntHeading));
    // centre of the half circle sits `r` above the entry; position moves along it
    const prevArc = Math.PI * Math.min(1, Math.max(0, s.stuntT - dt) / LOOP_SEC);
    const d = (a: number) => fwd.scale(Math.sin(a) * r).add(new Vector3(0, r - Math.cos(a) * r, 0));
    s.pos.addInPlace(d(arc).subtract(d(prevArc)));
    s.pitch = arc;                                   // up through vertical and over onto its back, facing home
    s.roll = 0;
    // out of the half loop the plane is flying back the way it came, upside down: flip the frame to (heading + π,
    // level, rolled π) and the normal bank ease rolls it upright — the half roll that finishes an Immelmann
    if (k >= 1) { s.stunt = null; s.heading = wrap(s.stuntHeading + Math.PI); s.pitch = 0; s.roll = Math.PI; }
    return clampAltitude(s, floorAt, ceiling, clearance, tune);
  } else {
    // ── steer: yaw; brake tightens it; the bank follows the stick ──
    const steer = Math.max(-1, Math.min(1, input.steer));
    const turn = tune.turnRate * (input.brake > 0.1 ? tune.brakeTurn : 1);
    s.heading = wrap(s.heading + steer * turn * dt);
    let bankWant = steer * tune.maxBank;
    if (s.stunt === 'roll_left' || s.stunt === 'roll_right') {
      s.stuntT += dt;
      const dir = s.stunt === 'roll_right' ? 1 : -1;
      const k = Math.min(1, s.stuntT / ROLL_SEC);
      bankWant = dir * Math.PI * 2 * k;                 // one full roll
      s.roll = bankWant;
      // the sideways hop, eased in and out across the roll
      const side = new Vector3(Math.cos(s.heading), 0, -Math.sin(s.heading)).scale(dir);
      const v = (ROLL_SHIFT * Math.PI / (2 * ROLL_SEC)) * Math.sin(Math.PI * k);
      s.pos.addInPlace(side.scale(v * dt));
      if (k >= 1) { s.stunt = null; s.roll = 0; }
    } else {
      s.roll = ease(wrap(s.roll), bankWant, 6, dt);
    }
    // ── climb / dive: the nose follows the stick, and levels when released ──
    s.pitch = ease(s.pitch, Math.max(-1, Math.min(1, input.climb)) * tune.maxPitch, tune.pitchEase, dt);
  }

  s.pos.addInPlace(forwardOf(s).scale(s.speed * dt));
  return clampAltitude(s, floorAt, ceiling, clearance, tune);
}

function clampAltitude(s: ArcadeState, floorAt: (x: number, z: number) => number, ceiling: number, clearance: number, tune: ArcadeTune): 'floor' | null {
  const floor = floorAt(s.pos.x, s.pos.z) + clearance;
  if (s.pos.y < floor) {
    s.pos.y = floor;
    const hit = s.pitch < -0.12;
    if (s.stunt !== 'loop') s.pitch = Math.max(s.pitch, 0.08);   // the ground lifts the nose
    if (hit) { s.speed = Math.max(tune.minSpeed, s.speed * 0.8); return 'floor'; }
  }
  if (s.pos.y > ceiling) { s.pos.y = ceiling; if (s.stunt !== 'loop') s.pitch = Math.min(s.pitch, 0); }
  return null;
}

/**
 * THE COURSE EDGE is a wall that turns the plane back (the same lesson as the board fence — WALLS + SPEED, 2026-09-15:
 * a clamp that leaves the vehicle aimed at the wall pins it there). `nx, nz` points back into the course.
 */
export function wallTurn(s: ArcadeState, nx: number, nz: number): boolean {
  const l = Math.hypot(nx, nz); if (!(l > 0)) return false;
  nx /= l; nz /= l;
  const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
  const into = -(fx * nx + fz * nz);
  if (into <= 0.02) return false;
  const dx = fx + into * nx + 0.35 * nx, dz = fz + into * nz + 0.35 * nz;
  s.heading = Math.atan2(dx, dz);
  s.speed = Math.max(0, s.speed * (1 - 0.35 * into));
  return true;
}
