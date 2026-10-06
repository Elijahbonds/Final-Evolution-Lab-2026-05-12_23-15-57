// RIVAL DRIVERS (10-phase pass, phase 5, 2026-10-02): the field DRIVES now.
//
// RaceField's rivals were pacers by design — "a rival that advances along the racing line at a believable
// PACE cannot get stuck on a wall, cannot spin, and cannot drive the wrong way, and from a chase camera the
// two are indistinguishable". The second half of that sentence stopped being true: a pacer's kart never
// slides and a pacer's plane never banks, and next to the player's drift and roll that reads as on-rails.
//
// So the field runs the SAME models the player gets — stepKart / stepArcade — fed by a pure-pursuit
// driver: steer at a look-ahead point on the line offset by the rival's lane, a throttle/brake servo on
// the pace RaceField's brain (rivalPace) sets, and the drift or bank EMERGES from the model when a corner
// outruns the grip. `r.dist` is measured back off the line (wrap-safe), so standings, contact, items and
// the finish clock read exactly what they always read.
//
// The pacer's guarantee is kept as a NET, not a rail: a rival beached or thrown wide beyond recovery is
// put back on the line at the distance it had earned. It never looks stupid — it just looks like it drives.
//
// Pure maths — Vector3 only — so the drivers are testable without a scene.

import { Vector3 } from '@babylonjs/core';
import { locate, pointAlong, type RacingLine } from './racingLine';
import { spawnKart, stepKart, type KartInput, type KartSpec, type KartState } from '../core/KartModel';
import { spawnArcade, stepArcade, type ArcadeInput, type ArcadeState, type ArcadeTune } from './ArcadeFlight';
import type { Rival } from './RaceField';
import { locateNear, newLineFix, type LineFix } from './lineWindow';   // IMPROVE (2026-10-06): aeroaces #13

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const wrapPi = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Wrap-safe distance advance between two projections onto a looped line. The frame a racer crosses the
 * start line the projection jumps from ~length to ~0 — that is a LAP finished, not a teleport backwards;
 * a shadow across a seam reads the same jump backwards. Anything past half a lap in a frame is the wrap,
 * not the driving.
 */
export function measureAdvance(lastAlong: number, along: number, lapLength: number): number {
  let d = along - lastAlong;
  if (d < -lapLength / 2) d += lapLength;
  else if (d > lapLength / 2) d -= lapLength;
  return d;
}

/** Where the pursuit aims: `look` metres down the line from the projection, shifted into the rival's lane. */
function aimPoint(line: RacingLine, atDist: number, look: number, lane: number): Vector3 {
  const ahead = pointAlong(line, atDist + look);
  return ahead.pos.add(ahead.right.scale(lane));
}

/** The pursuit steer: heading error to the aim point, gained to the stick's −1..1. */
function pursuitSteer(pos: Vector3, heading: number, aim: Vector3): number {
  const err = wrapPi(Math.atan2(aim.x - pos.x, aim.z - pos.z) - heading);
  return clamp(err * 2.2, -1, 1);
}

// ── THE KART ───────────────────────────────────────────────────────────────────────────────────────────

export interface KartDrive {
  /** The rival's kart, on the road — the same state the player steps. */
  state: KartState;
  /** The last projection onto the line, for the wrap-safe distance. */
  lastAlong: number;
  /** Seconds beached or thrown wide — the recovery net's clock. */
  stuckT: number;
}

/** Put a rival's kart on the line at its grid distance, in its lane, at its grid speed. */
export function spawnKartDrive(line: RacingLine, r: Rival): KartDrive {
  const at = pointAlong(line, r.dist);
  const pos = at.pos.add(at.right.scale(r.lane));
  const state = spawnKart(pos, Math.atan2(at.tangent.x, at.tangent.z));
  state.speed = r.speed;
  return { state, lastAlong: locate(line, pos.x, pos.z).dist, stuckT: 0 };
}

/** The inputs a kart rival asks for this frame — what its thumbs would do. */
export function kartDriveInput(s: KartState, line: RacingLine, atDist: number, lane: number, wantSpeed: number, spec: KartSpec): KartInput {
  const look = clamp(s.speed * 0.55, 8, 30);   // a driver looks further down the road at speed
  const steer = pursuitSteer(s.pos, s.heading, aimPoint(line, atDist, look, lane));
  const slow = wantSpeed - s.speed;
  return {
    steer,
    throttle: clamp01(slow * 0.4 + 0.4),
    brake: clamp01((s.speed - wantSpeed - 0.8) * 0.3),
    // the drift is a DECISION the same corner asks of the player: hard lock at speed
    drift: Math.abs(steer) > 0.7 && s.speed > spec.vMax * 0.45,
  };
}

/**
 * One frame of a kart rival: pursue the line at the pace the field's brain set, stepped through the
 * player's own model; measure the distance back off the line. The recovery net puts a beached or
 * thrown-wide rival back at the distance it had earned — never forward, never back.
 */
export function stepKartDrive(d: KartDrive, r: Rival, line: RacingLine, wantSpeed: number, dt: number, spec: KartSpec, halfWidth: number): void {
  const at = locate(line, d.state.pos.x, d.state.pos.z);
  const input = kartDriveInput(d.state, line, at.dist, r.lane, wantSpeed, spec);
  stepKart(d.state, input, dt, Math.abs(at.lateral) <= halfWidth + 1, spec);

  const now = locate(line, d.state.pos.x, d.state.pos.z);
  r.dist += measureAdvance(d.lastAlong, now.dist, line.length);
  d.lastAlong = now.dist;
  r.speed = d.state.speed;

  // THE NET: beached (asking but not moving) or thrown metres past the verge, for two seconds.
  const beached = wantSpeed > 5 && d.state.speed < 1;
  const wide = Math.abs(now.lateral) > halfWidth + 8;
  d.stuckT = beached || wide ? d.stuckT + dt : 0;
  if (d.stuckT > 2) {
    d.stuckT = 0;
    const home = pointAlong(line, r.dist);
    d.state.pos.copyFrom(home.pos.add(home.right.scale(r.lane)));
    d.state.heading = Math.atan2(home.tangent.x, home.tangent.z);
    d.state.speed = Math.min(wantSpeed, spec.vMax) * 0.5;
    d.state.slip = 0;
    d.state.steerAt = 0;
    d.lastAlong = locate(line, d.state.pos.x, d.state.pos.z).dist;
  }
}

// ── THE PLANE ──────────────────────────────────────────────────────────────────────────────────────────

export interface AeroDrive {
  /** The rival's plane — the same arcade state the player flies. */
  state: ArcadeState;
  lastAlong: number;
  stuckT: number;
  /** IMPROVE (2026-10-06), aeroaces #13: the last fix on the line. Both locates a frame search round it (lineWindow)
   *  instead of scanning the whole lap, and write into it instead of allocating. Absent = a fresh fix (full scan). */
  fix?: LineFix;
}

/** Put a rival's plane on the line at its grid distance, in its lane, at its grid speed. */
export function spawnAeroDrive(line: RacingLine, r: Rival, tune: ArcadeTune): AeroDrive {
  const at = pointAlong(line, r.dist);
  const pos = at.pos.add(at.right.scale(r.lane));
  const state = spawnArcade(pos, Math.atan2(at.tangent.x, at.tangent.z));
  state.speed = Math.max(tune.coast, r.speed);
  const fix = newLineFix();
  return { state, lastAlong: line.loop ? locateNear(line, pos.x, pos.z, fix).dist : locate(line, pos.x, pos.z).dist, stuckT: 0, fix };
}

/** The inputs an aero rival asks for: pursue the line, hold its height, fly the pace. */
export function aeroDriveInput(s: ArcadeState, line: RacingLine, atDist: number, lane: number, wantSpeed: number, tune: ArcadeTune): ArcadeInput {
  const look = clamp(s.speed * 0.6, 12, 40);
  const aim = aimPoint(line, atDist, look, lane);
  return {
    steer: pursuitSteer(s.pos, s.heading, aim),
    // the line has height: climb holds the road's altitude ahead, not the altitude under the plane
    climb: clamp((aim.y - s.pos.y) * 0.18, -1, 1),
    gas: clamp01((wantSpeed - tune.coast) / Math.max(1, tune.top - tune.coast)),
    brake: clamp01((s.speed - wantSpeed - 1.2) * 0.25),
    boostK: 0,
    bananas: 0,
  };
}

/**
 * One frame of an aero rival. A plane cannot beach (minSpeed keeps it flying), so the net reads the two
 * ways it CAN look stupid: thrown outside the corridor, or fallen far from the line's height.
 * `laneWeave` is the slow sideways drift the pacer field wore as a pose — as a lane target it makes the
 * weave a real flown line, banked into and out of.
 */
export function stepAeroDrive(
  d: AeroDrive, r: Rival, line: RacingLine, wantSpeed: number, dt: number, tune: ArcadeTune,
  corridor: number, floorAt: (x: number, z: number) => number, ceilingAt: (x: number, z: number) => number,
  laneWeave = 0,
): void {
  // IMPROVE (2026-10-06), aeroaces #13: both fixes are windowed round the last one and written into `d.fix` — the
  // first is read (its dist) before the second overwrites it. A loop line only: a point-to-point keeps the full scan.
  const fix = d.fix ??= newLineFix();
  const near = (x: number, z: number) => (line.loop ? locateNear(line, x, z, fix) : locate(line, x, z));
  const atDist = near(d.state.pos.x, d.state.pos.z).dist;
  const input = aeroDriveInput(d.state, line, atDist, r.lane + laneWeave, wantSpeed, tune);
  stepArcade(d.state, input, dt, tune, floorAt, ceilingAt(d.state.pos.x, d.state.pos.z));

  const now = near(d.state.pos.x, d.state.pos.z);
  r.dist += measureAdvance(d.lastAlong, now.dist, line.length);
  d.lastAlong = now.dist;
  r.speed = d.state.speed;

  const wide = Math.abs(now.lateral) > corridor + 10;
  const lost = Math.abs(d.state.pos.y - now.point.y) > 25;
  d.stuckT = wide || lost ? d.stuckT + dt : 0;
  if (d.stuckT > 2) {
    d.stuckT = 0;
    const home = pointAlong(line, r.dist);
    d.state.pos.copyFrom(home.pos.add(home.right.scale(r.lane)));
    d.state.heading = Math.atan2(home.tangent.x, home.tangent.z);
    d.state.pitch = 0;
    d.state.roll = 0;
    d.state.yawAt = 0;
    d.state.speed = Math.min(wantSpeed, tune.top);
    fix.i = -1;   // a teleport: the next fix is a full scan
    d.lastAlong = near(d.state.pos.x, d.state.pos.z).dist;
  }
}
