// THERE IS A RACE, AND YOU CAN LOSE IT (2026-09-13).
//
// The two failure states for AI opponents are opposite and both are worse than no opponents at all:
//   · a field you always beat — then it is scenery, and the position readout is a lie
//   · a field glued to your bumper — the thing players notice, resent, and call rubber-banding
//
// Both are properties, so both are tested as properties: simulate whole races at several player paces and
// check the ORDER that comes out, rather than checking that one constant equals another.

import { describe, it, expect } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import {
  buildRaceLine, pointAt, bendAt, makeField, stepRival, standings, playerPosition, ordinal,
  rivalPlacement, fieldFor, RIVAL_NAMES, BAND_LIMIT, type Rival, type RaceLine,
} from './RaceField';
import { KART_COURSES, courseById } from '../core/RaceCourse';
import { KARTS } from './garage';

const boardwalk = courseById('boardwalk-loop')!;
const line = buildRaceLine(boardwalk);
const TOP = KARTS[0].spec.vMax;

/** Run a whole race. `paceFrac` is the player's share of top speed — 1.0 is a perfect lap. */
function race(paceFrac: number, laps = 2, difficulty = 0.5): { pos: number; rivals: Rival[]; playerDist: number } {
  const rivals = makeField(5, TOP, difficulty);
  let playerDist = 0;
  let t = 0;
  const dt = 1 / 30;
  const finish = line.lapLength * laps;
  while (playerDist < finish && t < 600) {
    playerDist += TOP * paceFrac * dt;
    for (const r of rivals) stepRival(r, line, dt, playerDist, { topSpeed: TOP }, t);
    t += dt;
  }
  return { pos: playerPosition(playerDist, rivals), rivals, playerDist };
}

describe('THE FIELD CAN BE BEATEN AND CAN BEAT YOU', () => {
  it('a perfect lap wins', () => {
    expect(race(1.0).pos).toBe(1);
  });

  it('a bad lap loses — and loses to most of the field, not just one', () => {
    const { pos } = race(0.55);
    expect(pos).toBeGreaterThan(3);
  });

  it('THE ORDER MOVES WITH THE PLAYER, which is what makes it a race', () => {
    const paces = [0.55, 0.7, 0.82, 0.92, 1.0];
    const places = paces.map((p) => race(p).pos);
    // finishing position must improve monotonically as the player drives better
    for (let i = 1; i < places.length; i++) {
      expect(places[i], `pace ${paces[i]} finished ${places[i]}, pace ${paces[i - 1]} finished ${places[i - 1]}`)
        .toBeLessThanOrEqual(places[i - 1]);
    }
    // and the two ends must actually differ, or the field is scenery
    expect(places[0]).toBeGreaterThan(places[places.length - 1]);
  });

  it('the field spreads out instead of finishing as one lump', () => {
    const { rivals } = race(0.85);
    const ds = rivals.map((r) => r.dist).sort((a, b) => a - b);
    const spread = ds[ds.length - 1] - ds[0];
    expect(spread, 'the whole field finished within a few metres of each other').toBeGreaterThan(40);
  });

  it('NOBODY IS GLUED TO THE PLAYER — the band is bounded', () => {
    // drive perfectly and the leader must be genuinely behind by the end, not on the bumper
    const { rivals, playerDist } = race(1.0);
    const leader = Math.max(...rivals.map((r) => r.dist));
    expect(playerDist - leader, 'a rival tracked a perfect lap to the bumper').toBeGreaterThan(25);
  });

  it('and the band cannot push a rival outside its own pace envelope', () => {
    expect(BAND_LIMIT).toBeLessThanOrEqual(0.15);
    const r = makeField(1, TOP)[0];
    const solo: Rival = { ...r };
    const chased: Rival = { ...r };
    let t = 0;
    for (let i = 0; i < 1200; i++) {
      stepRival(solo, line, 1 / 30, solo.dist, { topSpeed: TOP }, t);         // nobody to chase
      stepRival(chased, line, 1 / 30, chased.dist + 5000, { topSpeed: TOP }, t); // player miles ahead
      t += 1 / 30;
    }
    expect(chased.dist / solo.dist).toBeLessThan(1 + BAND_LIMIT + 0.02);
  });

  it('difficulty changes the outcome of the SAME lap', () => {
    const easy = race(0.82, 2, 0.0).pos;
    const hard = race(0.82, 2, 1.0).pos;
    expect(hard, `easy finished ${easy}, hard finished ${hard}`).toBeGreaterThan(easy);
  });
});

describe('rivals are somewhere real on the track', () => {
  it('the line measures the course it was built from', () => {
    expect(line.lapLength).toBeGreaterThan(100);
    expect(line.loop).toBe(true);
    for (const c of KART_COURSES) {
      const l = buildRaceLine(c);
      expect(l.lapLength, c.id).toBeGreaterThan(0);
      expect(l.cum.length, c.id).toBe(l.pts.length);
    }
  });

  it('pointAt walks the line and wraps on a loop', () => {
    const start = pointAt(line, 0).pos;
    const wrapped = pointAt(line, line.lapLength).pos;
    expect(Vector3.Distance(start, wrapped)).toBeLessThan(1);
    const mid = pointAt(line, line.lapLength / 2).pos;
    expect(Vector3.Distance(start, mid)).toBeGreaterThan(10);
  });

  it('never returns a NaN position, at any distance including negative ones', () => {
    for (const d of [-50, -1, 0, 13.7, line.lapLength * 0.999, line.lapLength, line.lapLength * 3.3]) {
      const { pos, heading } = pointAt(line, d);
      expect(Number.isFinite(pos.x) && Number.isFinite(pos.z), `dist ${d}`).toBe(true);
      expect(Number.isFinite(heading), `dist ${d}`).toBe(true);
    }
  });

  it('a bend reads 0 on a straight and high through a corner', () => {
    const bends = Array.from({ length: 40 }, (_, i) => bendAt(line, (i / 40) * line.lapLength));
    expect(Math.min(...bends)).toBeLessThan(0.05);
    expect(Math.max(...bends)).toBeGreaterThan(0.1);
  });

  it('rivals are placed OFF the centre line, so the field is not a conga line', () => {
    const rivals = makeField(5, TOP);
    const lanes = new Set(rivals.map((r) => r.lane));
    expect(lanes.size).toBe(5);
    const p = rivalPlacement(rivals[0], line);
    const centre = pointAt(line, rivals[0].dist).pos;
    expect(Vector3.Distance(p.pos, centre)).toBeGreaterThan(1);
  });

  it('the grid starts BEHIND the line, staggered, with unique names', () => {
    const rivals = makeField(5, TOP);
    for (const r of rivals) expect(r.dist).toBeLessThan(0);
    expect(new Set(rivals.map((r) => r.dist)).size).toBe(5);
    expect(new Set(rivals.map((r) => r.name)).size).toBe(5);
    expect(makeField(99, TOP).length).toBe(RIVAL_NAMES.length);
    expect(makeField(0, TOP)).toEqual([]);
  });

  it('a tight course gets a smaller field — eight cars on a hairpin is a pile-up', () => {
    const spec = KARTS[0].spec;
    const tightField = fieldFor(courseById('rooftop-circuit')!, spec.vMax, spec.grip);
    const openField = fieldFor(courseById('stadium-oval')!, spec.vMax, spec.grip);
    expect(tightField.count).toBeLessThan(openField.count);
  });
});

describe('the standings a player reads', () => {
  it('leader first, with the player in it', () => {
    const rivals = makeField(3, TOP);
    rivals[0].dist = 500; rivals[1].dist = 100; rivals[2].dist = 50;
    const board = standings(200, rivals);
    expect(board.map((s) => s.name)).toEqual(['VOSS', 'YOU', 'KEELE', 'ARIN']);
    expect(board.find((s) => s.isPlayer)!.name).toBe('YOU');
    expect(playerPosition(200, rivals)).toBe(2);
  });

  it('a solo run is always first', () => {
    expect(playerPosition(0, [])).toBe(1);
    expect(standings(0, [])).toHaveLength(1);
  });

  it('ordinals read like a human wrote them', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(
      ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
  });
});
