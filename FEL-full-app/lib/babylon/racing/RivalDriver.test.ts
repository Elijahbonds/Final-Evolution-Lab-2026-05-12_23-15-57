// 10-PHASE PASS, phase 5 (2026-10-02): the field drives and flies the SAME model the player gets.
// These pins ask the only questions that matter about a rival driver: does it get round, does it stay
// on the road, does the slide EMERGE (not get faked), does the net catch the one that beaches, and does
// the distance it reports still wrap cleanly — standings, contact and the finish clock all read r.dist.

import { describe, it, expect } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { sampleLine, locate, cornerRadiusAt, holdableSpeed, type RacingLine } from './racingLine';
import { makeField, rivalPace, stepRival, raceLineFromPoints, type Rival } from './RaceField';
import {
  measureAdvance, spawnKartDrive, stepKartDrive, spawnAeroDrive, stepAeroDrive,
} from './RivalDriver';
import { KART_STARTER, DRIFT_SLIP } from '../core/KartModel';
import { ARCADE_TRAINER } from './ArcadeFlight';

const K = KART_STARTER;
const T = ARCADE_TRAINER;

/** An 80 m square, looped — two long straights and four real corners. Authored order is x, z, y. */
function squareLine(): RacingLine {
  return sampleLine([[0, 0, 0], [80, 0, 0], [80, 80, 0], [0, 80, 0]], { loop: true });
}
/** A tight circle, radius ~14 m — a corner that never ends. */
function circleLine(radius = 14, n = 10): RacingLine {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * radius, Math.sin(a) * radius, 0]);   // authored order is x, z, y
  }
  return sampleLine(pts, { loop: true });
}
const holdAtFor = (line: RacingLine) => (dist: number): number => {
  const L = line.length;
  return holdableSpeed(cornerRadiusAt(line, ((dist % L) + L) % L), K.grip);
};
const finite = (d: { state: { pos: Vector3; speed: number; heading: number } }): boolean =>
  Number.isFinite(d.state.pos.x) && Number.isFinite(d.state.pos.y) && Number.isFinite(d.state.pos.z)
  && Number.isFinite(d.state.speed) && Number.isFinite(d.state.heading);

describe('measureAdvance — the wrap seam the standings read', () => {
  it('crossing the line forward is a lap finished, not a teleport backwards', () => {
    expect(measureAdvance(95, 5, 100)).toBeCloseTo(10, 9);
    expect(measureAdvance(5, 95, 100)).toBeCloseTo(-10, 9);   // a shadow across the seam reads small, not -90
    expect(measureAdvance(40, 42.5, 100)).toBeCloseTo(2.5, 9);
  });
});

describe('a kart rival DRIVES the line', () => {
  it('laps a synthetic circuit inside a sane window of the pacer, on the road, never NaN', () => {
    const line = squareLine();
    const raceLine = raceLineFromPoints(line.pts, true);
    const r: Rival = makeField(1, K.vMax, 0.5)[0];
    r.dist = 0; r.speed = K.vMax * 0.25; r.lane = -2;
    const pacer: Rival = { ...r };
    const d = spawnKartDrive(line, r);
    const spec = { topSpeed: K.vMax, holdAt: holdAtFor(line) };
    let wide = 0, frames = 0;
    for (let i = 0; i < 60 * 60; i++) {
      const t = i / 60;
      stepKartDrive(d, r, line, rivalPace(r, raceLine, 0, spec, t), 1 / 60, K, 6);
      stepRival(pacer, raceLine, 1 / 60, 0, spec, t);
      const at = locate(line, d.state.pos.x, d.state.pos.z);
      if (Math.abs(at.lateral) > 6 + 1) wide++;
      frames++;
      expect(finite(d)).toBe(true);
    }
    expect(r.dist).toBeGreaterThan(line.length);                 // lapped at least once in a minute
    expect(wide / frames).toBeLessThan(0.01);                    // on the road ~always
    expect(r.dist).toBeGreaterThan(pacer.dist * 0.7);            // corners cost a driver a little…
    expect(r.dist).toBeLessThan(pacer.dist * 1.15);              // …but it is the same race
  });

  it('the drift EMERGES when a corner outruns the grip — it is not a pose', () => {
    const line = circleLine();
    const r: Rival = makeField(1, K.vMax, 0.5)[0];
    r.dist = 0; r.speed = 14; r.lane = 0;
    const d = spawnKartDrive(line, r);
    let maxSlip = 0;
    for (let i = 0; i < 20 * 60; i++) {
      stepKartDrive(d, r, line, 20, 1 / 60, K, 6);               // asked to hold 20 round a 12-ish corner
      maxSlip = Math.max(maxSlip, Math.abs(d.state.slip));
    }
    expect(maxSlip).toBeGreaterThan(DRIFT_SLIP);
  });

  it('a beached rival is put back on the line at the distance it earned — never forward', () => {
    const line = squareLine();
    const r: Rival = makeField(1, K.vMax, 0.5)[0];
    r.dist = 0; r.speed = 10; r.lane = 0;
    const d = spawnKartDrive(line, r);
    for (let i = 0; i < 5 * 60; i++) stepKartDrive(d, r, line, 15, 1 / 60, K, 6);
    const earned = r.dist;
    d.state.pos.x += 100;                                        // thrown out of the world
    d.state.speed = 0;
    for (let i = 0; i < 5 * 60; i++) stepKartDrive(d, r, line, 15, 1 / 60, K, 6);
    const at = locate(line, d.state.pos.x, d.state.pos.z);
    expect(Math.abs(at.lateral)).toBeLessThan(7);                // back on the road
    expect(d.state.speed).toBeGreaterThan(5);                    // and racing again
    expect(r.dist).toBeGreaterThan(earned - 5);                  // the net never teleports it forward…
  });
});

describe('an aero rival FLIES the line', () => {
  // authored order is x, z, height — a loop that climbs and falls through its corners
  const line3d = (): RacingLine => sampleLine(
    [[0, 0, 8], [120, 0, 20], [120, 120, 35], [0, 120, 12]],
    { loop: true },
  );
  const floorAt = () => 0;
  const ceilingAt = () => 200;

  it('holds the corridor and the line’s altitude band, laps, never NaN', () => {
    const line = line3d();
    const r: Rival = makeField(1, T.top, 0.5)[0];
    r.dist = 0; r.speed = T.coast; r.lane = 4;
    const d = spawnAeroDrive(line, r, T);
    let wide = 0, high = 0, frames = 0;
    for (let i = 0; i < 60 * 60; i++) {
      stepAeroDrive(d, r, line, 26, 1 / 60, T, 34, floorAt, ceilingAt);
      const at = locate(line, d.state.pos.x, d.state.pos.z);
      if (Math.abs(at.lateral) > 34) wide++;
      if (Math.abs(d.state.pos.y - at.point.y) > 8) high++;
      frames++;
      expect(finite(d)).toBe(true);
    }
    expect(r.dist).toBeGreaterThan(line.length);                 // lapped inside a minute
    expect(wide / frames).toBeLessThan(0.01);
    expect(high / frames).toBeLessThan(0.05);                    // the climb servo holds the road's height
  });

  it('a rival thrown out of the corridor is recovered onto the line', () => {
    const line = line3d();
    const r: Rival = makeField(1, T.top, 0.5)[0];
    r.dist = 0; r.speed = T.coast; r.lane = 0;
    const d = spawnAeroDrive(line, r, T);
    for (let i = 0; i < 3 * 60; i++) stepAeroDrive(d, r, line, 26, 1 / 60, T, 34, floorAt, ceilingAt);
    d.state.pos.x += 80;                                         // blown sideways out of the corridor
    for (let i = 0; i < 5 * 60; i++) stepAeroDrive(d, r, line, 26, 1 / 60, T, 34, floorAt, ceilingAt);
    const at = locate(line, d.state.pos.x, d.state.pos.z);
    expect(Math.abs(at.lateral)).toBeLessThan(34);
    expect(d.state.speed).toBeGreaterThan(T.minSpeed);
  });
});
