// GolfAim — the Wii Sports read of a golf shot (owner, 2026-09-17: "the aim system need to be like wii sports. i need a
// directional arrow, a meter with lines to gauge power. upgrade physics, weather").
//
// Wii Sports Golf shows THREE things before you swing, and this file is all three as pure numbers:
//   1. THE ARROW — a direction on the ground from the ball; the stick turns it, the camera looks along it.
//   2. THE LANDING — where THIS club at FULL power would come down along that arrow, in this wind, on this turf. Not
//      a range table: the same physics sim the shot will fly (GolfBallSim) is run ahead of the swing, so the ring the
//      player aims with is the truth of the swing they are about to make.
//   3. THE METER — power in tenths, with the CARRY each tenth buys written on the tick (meterTicks). A player gauges
//      "70 % of a driver" as "43 m", which is what Wii's meter lines are for.
//
// The clubs are scaled to THIS course (holes 26–39 m out on a 60 x 90 field): a driver reaches the far pin, a wedge
// does not, so the club stays a decision. Every field a headless suite already reads (reach / launch / forgive) is kept.

import { Vector3 } from '@babylonjs/core';
import { GolfBallSim, type Surface } from './GolfBall';

export interface WiiClub {
  id: string;
  /** Ball speed off the face at full power (m/s). */
  speedMps: number;
  loftDeg: number;
  /** Backspin (rad/s in the sim's Magnus units): lift + the check on landing. */
  backspin: number;
  /** A forgiving club punishes a bad strike less (side error → sidespin divided by this). */
  forgive: number;
  /** Legacy readouts the precision suite compares (reach: distance band; launch: height band). */
  reach: number; launch: number;
}

export const WII_CLUBS: readonly WiiClub[] = [
  { id: 'DRIVER', speedMps: 36, loftDeg: 14, backspin: 4, forgive: 0.8, reach: 1.0, launch: 0.85 },
  { id: 'IRON', speedMps: 27, loftDeg: 24, backspin: 6, forgive: 1.0, reach: 0.68, launch: 1.15 },
  { id: 'WEDGE', speedMps: 19, loftDeg: 44, backspin: 9, forgive: 1.25, reach: 0.38, launch: 1.75 },
] as const;
export const WII_PUTTER: WiiClub = { id: 'PUTTER', speedMps: 8.5, loftDeg: 1.5, backspin: 0, forgive: 0.55, reach: 0.16, launch: 0.06 };

/** How fast the stick turns the arrow (rad/s at full deflection) and how far off the pin line it may go. */
export const AIM_TURN_RATE = 1.1;
export const AIM_LIMIT_RAD = 1.05;
const DEAD = 0.12;

/** The smallest signed angle from a to b. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Turn the aim with the stick, held inside ±AIM_LIMIT_RAD of the pin line. Pure; dt-scaled. */
export function turnAim(yaw: number, pinYaw: number, stickX: number, dt: number): number {
  const x = Math.abs(stickX) < DEAD ? 0 : stickX;
  let off = wrap(yaw - pinYaw) + x * AIM_TURN_RATE * dt;
  off = Math.max(-AIM_LIMIT_RAD, Math.min(AIM_LIMIT_RAD, off));
  return wrap(pinYaw + off);
}

/** Ball speed for a power reading: a soft tap is a third of the club, full is the club. */
export function powerSpeed(club: WiiClub, power01: number): number {
  return club.speedMps * (0.32 + 0.68 * Math.max(0, Math.min(1, power01)));
}

/**
 * The launch: velocity along the arrow at the club's loft, backspin about the axis that lifts it (right-hand rule
 * against the flight direction), sidespin from the strike's side error — a slice or a hook CURVES, it is not a random
 * lateral kick. `sideErr01` 0 = pure; `sideSign` −1 hooks, +1 slices.
 */
export function launchVelocity(club: WiiClub, power01: number, yaw: number, sideErr01 = 0, sideSign: -1 | 1 = 1): { vel: Vector3; spin: Vector3 } {
  const speed = powerSpeed(club, power01);
  const loft = (club.loftDeg * Math.PI) / 180;
  const dx = Math.sin(yaw), dz = Math.cos(yaw);
  const vel = new Vector3(dx * Math.cos(loft) * speed, Math.sin(loft) * speed, dz * Math.cos(loft) * speed);
  const w = club.backspin * (0.3 + 0.7 * power01);   // a soft swing spins less — keeps the carry monotonic in power
  // backspin axis: (d.z, 0, −d.x)·(−ω) — at yaw 0 that is (−ω, 0, 0), which SoccerBall's Magnus turns into lift
  const spin = new Vector3(-w * dz, (sideErr01 * 10 * sideSign) / club.forgive, w * dx);
  return { vel, spin };
}

export interface AirLike { wind: { x: number; z: number }; wet01: number; density: number }
export const STILL_AIR: AirLike = { wind: { x: 0, z: 0 }, wet01: 0, density: 1 };

export interface ShotPrediction {
  /** Where it first comes down (the carry) and where it stops (the roll-out). */
  carry: { x: number; z: number }; rest: { x: number; z: number };
  carryM: number; totalM: number; hangSec: number;
}

/** Fly a shot ahead of time on the same sim, headless. */
export function simulateShot(
  club: WiiClub, power01: number, yaw: number, from: { x: number; y: number; z: number }, air: AirLike = STILL_AIR,
  surfaceAt: (p: Vector3) => Surface = () => 'fairway', maxSec = 14,
): ShotPrediction {
  const mesh = { position: new Vector3(from.x, from.y, from.z) };
  const sim = new GolfBallSim(mesh);
  sim.wind.set(air.wind.x, 0, air.wind.z); sim.wet01 = air.wet01; sim.airDensity = air.density;
  const { vel, spin } = launchVelocity(club, power01, yaw);
  sim.launch(new Vector3(from.x, Math.max(from.y, 0.05), from.z), vel, spin);
  const dt = 1 / 120; let t = 0, hang = 0;
  while (sim.ball.active && t < maxSec) { sim.step(dt, surfaceAt); t += dt; if (!sim.carryPoint) hang = t; }
  const c = sim.carryPoint ?? sim.ball.pos; const r = sim.ball.pos;
  const dist = (p: { x: number; z: number }) => Math.hypot(p.x - from.x, p.z - from.z);
  return { carry: { x: c.x, z: c.z }, rest: { x: r.x, z: r.z }, carryM: dist(c), totalM: dist(r), hangSec: hang };
}

/** The meter's lines: the carry (m) at 0 %, 10 % … 100 % of this club along this aim in this air. Eleven numbers. */
export function meterTicks(club: WiiClub, yaw: number, from: { x: number; y: number; z: number }, air: AirLike = STILL_AIR, surfaceAt?: (p: Vector3) => Surface): number[] {
  const out: number[] = [];
  for (let i = 0; i <= 10; i++) out.push(Math.round(simulateShot(club, i / 10, yaw, from, air, surfaceAt).carryM));
  return out;
}
/** The carry a meter reading buys, off the ticks. */
export function carryAt(ticks: readonly number[], power01: number): number {
  const p = Math.max(0, Math.min(1, power01)) * 10; const i = Math.min(9, Math.floor(p)); const f = p - i;
  return ticks[i] + (ticks[i + 1] - ticks[i]) * f;
}
