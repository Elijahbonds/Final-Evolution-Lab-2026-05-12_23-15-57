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
// The clubs are scaled to THIS course (holes 22–38 m out on a 60 x 90 field, GolfLoop.PAR_BANDS): a driver reaches the far pin, a wedge
// does not, so the club stays a decision. Every field a headless suite already reads (reach / launch / forgive) is kept.

import { Vector3 } from '@babylonjs/core';
import { GOLF_BALL, GolfBallSim, SURFACE_FRICTION, greenBreakSlope, resolvePutt, type Surface } from './GolfBall';

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
  const { vel, spin } = launchVelocity(club, power01, yaw);
  return flyAhead(vel, spin, from, air, surfaceAt, maxSec);
}

/** Any launch, flown ahead on the sim the mode flies (a `cup` lets a slow ball drop, as the live flight's tryHole does). */
export function flyAhead(
  vel: Vector3, spin: Vector3, from: { x: number; y: number; z: number }, air: AirLike = STILL_AIR,
  surfaceAt: (p: Vector3) => Surface = () => 'fairway', maxSec = 14, cup?: { x: number; z: number },
): ShotPrediction {
  const mesh = { position: new Vector3(from.x, from.y, from.z) };
  const sim = new GolfBallSim(mesh);
  sim.wind.set(air.wind.x, 0, air.wind.z); sim.wet01 = air.wet01; sim.airDensity = air.density;
  sim.launch(new Vector3(from.x, Math.max(from.y, 0.05), from.z), vel, spin);
  const dt = 1 / 120; let t = 0, hang = 0;
  while (sim.ball.active && t < maxSec) { sim.step(dt, surfaceAt); if (cup) sim.tryHole(cup.x, cup.z); t += dt; if (!sim.carryPoint) hang = t; }
  const c = sim.carryPoint ?? sim.ball.pos; const r = sim.ball.pos;
  const dist = (p: { x: number; z: number }) => Math.hypot(p.x - from.x, p.z - from.z);
  return { carry: { x: c.x, z: c.z }, rest: { x: r.x, z: r.z }, carryM: dist(c), totalM: dist(r), hangSec: hang };
}

// ── THE PUTT (IMPROVE 2026-10-06, Golf #3 / #5) ─────────────────────────────────────────────────────────────────────
// The mode's putt is not a club launch: resolvePutt sets the PACE (how far it should roll) from the distance and the
// power, and the green's break turns the line (offlineRad). Two things were wrong with how that reached the ball:
//   · the arrow's ring was the PUTTER flown by launchVelocity — another speed, no break — so the preview on the green
//     said one thing and the putt did another (#5). One launch now, for both;
//   · the pace became a speed as `paceM / 1.15`, as if the roll grew with the speed. The green brakes at a constant
//     rate (SoccerBall: grassFriction m/s²) after the hop's one skid, so the roll grows with the SQUARE of the speed and
//     a short putt died far short: measured, a 2 m putt at FULL power rolled 0.8 m, a 4 m putt 2.8 m. The 1.6 m gimme
//     (HOLED_M) is what hid it. The speed is now the one that rolls `paceM` on a dry or wet green — 42 % power
//     reaches the cup from any distance, full power runs 35 % past, which is what resolvePutt's [TUNE] always said.
/** The putt's little hop off the face (m/s up). */
export const PUTT_LIFT_MPS = 0.15;
/** The hop's air time from the sim's launch height (0.05 m, flyAhead's floor) down to the turf: ~0.056 s at full speed. */
const PUTT_HOP_SEC = (PUTT_LIFT_MPS + Math.sqrt(PUTT_LIFT_MPS ** 2 + 2 * 9.81 * (0.05 - GOLF_BALL.radius))) / 9.81;
/**
 * The ground speed that rolls `paceM` on the green: the hop carries it `v·t` at full speed, its touch-down keeps `skid`
 * of it, and the green brakes the rest at a constant rate — `v·t + (v·skid)² / 2·brake = pace`, solved for v. The wet
 * terms are GolfBallSim.step's (a soaked green brakes harder and the skid keeps less).
 */
export function puttSpeedFor(paceM: number, wet01 = 0): number {
  const w = Math.max(0, Math.min(1, wet01));
  const brake = SURFACE_FRICTION.green * (1 + 0.6 * w);
  const skid = GOLF_BALL.skidFactor * (1 - 0.45 * w);
  const a = (skid * skid) / (2 * brake), b = PUTT_HOP_SEC, pace = Math.max(0, paceM);
  return (-b + Math.sqrt(b * b + 4 * a * pace)) / (2 * a);
}
/** The putt's launch: resolvePutt's pace and line from this power, face, distance and break, along the aim. */
export function puttLaunch(power01: number, face01: number, aimYaw: number, distM: number, breakSlope: number, wet01 = 0): { vel: Vector3; yaw: number } {
  const putt = resolvePutt({ power01, face01 }, distM, breakSlope);
  const yaw = aimYaw + putt.offlineRad;
  const spd = puttSpeedFor(putt.paceM, wet01);
  return { vel: new Vector3(Math.sin(yaw) * spd, PUTT_LIFT_MPS, Math.cos(yaw) * spd), yaw };
}
/** A pure-faced putt at this power along this aim, rolled ahead on the green's break — dropping if it would, unless
 *  `dropInCup` is false (the meter's lines read the pace: how far each power ROLLS, cup or no cup). */
export function simulatePutt(
  power01: number, aimYaw: number, from: { x: number; y: number; z: number }, cup: { x: number; z: number }, air: AirLike = STILL_AIR,
  surfaceAt: (p: Vector3) => Surface = () => 'green', maxSec = 14, dropInCup = true,
): ShotPrediction {
  const distM = Math.hypot(from.x - cup.x, from.z - cup.z);
  const { vel } = puttLaunch(power01, 1, aimYaw, distM, greenBreakSlope(from.x, cup.x), air.wet01);
  return flyAhead(vel, Vector3.Zero(), from, air, surfaceAt, maxSec, dropInCup ? cup : undefined);
}

/**
 * The meter's lines, built a few simulations at a time (IMPROVE 2026-10-06, Golf #14): eleven full flights in one frame
 * was a visible hitch on every club change. The mode steps this once a frame; `finish()` completes it on demand.
 */
export class MeterTickJob {
  readonly ticks: number[] = [];
  constructor(private readonly read: (power01: number) => number) {}
  get done(): boolean { return this.ticks.length >= 11; }
  /** Run up to `n` more of the eleven; true once all are in. */
  step(n = 1): boolean {
    for (let i = 0; i < n && !this.done; i++) this.ticks.push(Math.round(this.read(this.ticks.length / 10)));
    return this.done;
  }
  finish(): number[] { this.step(11); return this.ticks; }
}

/** The meter's lines: the carry (m) at 0 %, 10 % … 100 % of this club along this aim in this air. Eleven numbers. */
export function meterTicks(club: WiiClub, yaw: number, from: { x: number; y: number; z: number }, air: AirLike = STILL_AIR, surfaceAt?: (p: Vector3) => Surface): number[] {
  return new MeterTickJob((p) => simulateShot(club, p, yaw, from, air, surfaceAt).carryM).finish();
}
/** A putt's meter lines: the ROLL (m) each tenth of power buys — a putt is read by where it stops, not where it lands. */
export function puttTicks(aimYaw: number, from: { x: number; y: number; z: number }, cup: { x: number; z: number }, air: AirLike = STILL_AIR, surfaceAt?: (p: Vector3) => Surface): number[] {
  return new MeterTickJob((p) => simulatePutt(p, aimYaw, from, cup, air, surfaceAt, 14, false).totalM).finish();
}
/** The carry a meter reading buys, off the ticks. */
export function carryAt(ticks: readonly number[], power01: number): number {
  const p = Math.max(0, Math.min(1, power01)) * 10; const i = Math.min(9, Math.floor(p)); const f = p - i;
  return ticks[i] + (ticks[i + 1] - ticks[i]) * f;
}
