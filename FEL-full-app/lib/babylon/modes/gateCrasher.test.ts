import { describe, it, expect } from 'vitest';
import {
  GATE_HALF_WIDTH, POLE_BRUSH_M, crashTarget, crashChip, crashGoal, judgeGate, resolveSolids, solidTop, OVER_M, RIDER_RADIUS,
  wipeRoll, WIPE_SEC, WIPE_ROLL_MAX, carveSpeed01, treeline, edgePoles, rampUnder, kickerPop, type RideSolid,
} from './gateCrasher';
import { SNOW_VENUES } from '../nexus/boardVenues';
import { SNOW_CROWD, CROWD_INSET_M } from './snowSlope';

describe('the gate verdict (GATE-CRASHER-MAJOR)', () => {
  const gate = { x: 3.2, z: 100 };
  it('credits a gate only when the rider crossed BETWEEN the poles', () => {
    // the baseline's three dishonest credits: 0.10, 0.14 and 0.29 m outside a pole
    for (const off of [1.8, 1.84, 1.99]) {
      const v = judgeGate({ x: gate.x - off, z: 99.8 }, { x: gate.x - off, z: 100.1 }, gate);
      expect(v.crossed && v.hit, `credited ${off} m from the centre, poles at ${GATE_HALF_WIDTH}`).toBe(false);
    }
    for (const off of [0, 0.9, 1.6, -1.65]) {
      const v = judgeGate({ x: gate.x + off, z: 99.8 }, { x: gate.x + off, z: 100.1 }, gate);
      expect(v.crossed && v.hit, `missed ${off} m from the centre`).toBe(true);
    }
  });
  it('judges at the crossing point, not at the frame', () => {
    // a fast diagonal frame: outside the pole before the line, inside after it — crossed exactly at 1.7 − 0.3·(mid)
    const v = judgeGate({ x: 3.2 + 2.2, z: 99 }, { x: 3.2 + 1.0, z: 101 }, gate);
    expect(v.crossed).toBe(true);
    if (v.crossed) { expect(v.dx).toBeCloseTo(1.6, 5); expect(v.hit).toBe(true); expect(v.brush).toBe(true); }
    // and the old rule's 0.3 m early judgement is gone: 0.2 m short of the line is not a crossing yet
    expect(judgeGate({ x: 3.2, z: 99.5 }, { x: 3.2, z: 99.8 }, gate).crossed).toBe(false);
  });
  it('whips the pole a body brushes, on either side of it', () => {
    for (const off of [GATE_HALF_WIDTH - POLE_BRUSH_M + 0.05, GATE_HALF_WIDTH + POLE_BRUSH_M - 0.05]) {
      const v = judgeGate({ x: gate.x + off, z: 99.9 }, { x: gate.x + off, z: 100.05 }, gate);
      expect(v.crossed && v.brush).toBe(true);
    }
    const clean = judgeGate({ x: gate.x, z: 99.9 }, { x: gate.x, z: 100.05 }, gate);
    expect(clean.crossed && clean.brush).toBe(false);
  });
});

describe('the win, said out loud', () => {
  it('is half the gates, rounded up', () => {
    expect(crashTarget(30)).toBe(15);
    expect(crashTarget(29)).toBe(15);
    expect(crashTarget(1)).toBe(1);
  });
  it('names the target before the run and the verdict once it is reached', () => {
    expect(crashGoal(30)).toMatch(/15 OF 30 GATES/);
    expect(crashChip(4, 30)).toBe('WIN AT 15 · 11 TO GO');
    expect(crashChip(15, 30)).toBe('GATE CRASHER ✓');
  });
});

describe('the solids: nothing on the mountain is ridden through', () => {
  const box: RideSolid = { kind: 'box', tag: 'snow_box', x0: -1, x1: 1, z0: 10, z1: 20, y0: 1, slope: 0, h: 1, ramp: false };
  it('keeps a body under the deck out of the footprint, and names the face it met', () => {
    const r = resolveSolids({ x: -1.1, z: 15 }, 0, [box]);
    expect(r.x).toBeCloseTo(-1 - RIDER_RADIUS, 6);
    expect(r.contact).toMatchObject({ nx: -1, nz: 0, tag: 'snow_box' });
    const end = resolveSolids({ x: 0, z: 9.9 }, 0, [box]);
    expect(end.z).toBeCloseTo(10 - RIDER_RADIUS, 6);
    expect(end.contact).toMatchObject({ nx: 0, nz: -1 });
  });
  it('leaves a body riding the deck, or flying over it, alone', () => {
    expect(resolveSolids({ x: 0, z: 15 }, 2 - OVER_M + 0.01, [box]).contact).toBeNull();
    expect(resolveSolids({ x: 0, z: 15 }, 3, [box]).contact).toBeNull();
  });
  it('lets a ramp be ridden on from its uphill end, and blocks its high side', () => {
    const ramp: RideSolid = { ...box, ramp: true, h: 2 };
    expect(solidTop(ramp, 10)).toBeCloseTo(1, 6);
    expect(solidTop(ramp, 20)).toBeCloseTo(3, 6);
    expect(resolveSolids({ x: 0, z: 10.2 }, 1, [ramp]).contact).toBeNull();          // on at the toe
    expect(resolveSolids({ x: 0.9, z: 19 }, 1, [ramp]).contact).not.toBeNull();       // into the side at the lip
  });
  it('rounds a post (a pylon, a rock, a spectator) off the way the body met it', () => {
    const post: RideSolid = { kind: 'post', tag: 'pylon', x: 0, z: 0, r: 0.2, y0: 0, h: 5 };
    const r = resolveSolids({ x: 0.3, z: 0.1 }, 0, [post]);
    expect(Math.hypot(r.x, r.z)).toBeCloseTo(0.2 + RIDER_RADIUS, 6);
    expect(r.contact!.nx).toBeGreaterThan(0.9);
    // a rock is cleared by a body high enough over it
    const rock: RideSolid = { kind: 'post', tag: 'rock', x: 0, z: 0, r: 0.85, y0: 0, h: 0.8 };
    expect(resolveSolids({ x: 0.3, z: 0 }, 0.6, [rock]).contact).toBeNull();
    expect(resolveSolids({ x: 0.3, z: 0 }, 0.1, [rock]).contact).not.toBeNull();
  });
  it('never leaves a body inside after the push (a wall cannot pin a rider it has swallowed)', () => {
    const wall: RideSolid = { kind: 'box', tag: 'snow_wallride', x0: -0.3, x1: 0.3, z0: 0, z1: 14, y0: 0, slope: -0.22, h: 3, ramp: false };
    for (let x = -0.6; x <= 0.6; x += 0.05) for (let z = -0.3; z <= 14.3; z += 0.7) {
      const r = resolveSolids({ x, z }, -3, [wall]);
      const inside = r.x > wall.x0 - RIDER_RADIUS + 1e-6 && r.x < wall.x1 + RIDER_RADIUS - 1e-6 && r.z > wall.z0 - RIDER_RADIUS + 1e-6 && r.z < wall.z1 + RIDER_RADIUS - 1e-6;
      expect(inside, `(${x.toFixed(2)}, ${z.toFixed(2)}) still inside`).toBe(false);
    }
  });
});

describe('the wipeout reads as a fall', () => {
  it('slams him over fast, holds him in the snow, and brings him back to level', () => {
    expect(wipeRoll(0)).toBe(0);
    expect(wipeRoll(0.22)).toBeCloseTo(WIPE_ROLL_MAX, 6);          // on his side in a fifth of a second
    expect(wipeRoll(0.5)).toBe(WIPE_ROLL_MAX);
    expect(wipeRoll(WIPE_SEC - 0.001)).toBeLessThan(0.01);          // up again, no step into the ride bank
    expect(wipeRoll(WIPE_SEC)).toBe(0);
    expect(WIPE_ROLL_MAX).toBeGreaterThan(1);                         // past 57°: not a lean, a fall
    // no frame-to-frame jump bigger than a 60 fps slam allows once he is going down
    let prev = 0, worst = 0;
    for (let t = 1 / 60; t < WIPE_SEC; t += 1 / 60) { const r = wipeRoll(t); worst = Math.max(worst, Math.abs(r - prev)); prev = r; }
    expect(worst).toBeLessThan(0.2);
  });
});

describe('the carve reads on the edge', () => {
  it('banks against the cruise pace, so a gate-speed carve is on its edge', () => {
    expect(carveSpeed01(13.4, 13.4)).toBe(1);
    expect(carveSpeed01(9, 13.4)).toBeGreaterThan(0.6);
    expect(carveSpeed01(0, 13.4)).toBe(0);
  });
});

describe('the treeline and the edge', () => {
  const RUN = 678;
  it('lines the whole run, outside the groom, on every venue that has trees', () => {
    for (const v of SNOW_VENUES) {
      const t = treeline(v.bound, RUN, v.trees ?? 22);
      if (!(v.trees ?? 22)) { expect(t).toEqual([]); continue; }
      expect(Math.max(...t.map((s) => s.dist)), v.id).toBeGreaterThan(RUN - 40);          // the bottom of the mountain too
      for (const s of t) expect(Math.abs(s.x), `${v.id} tree at ${s.x.toFixed(1)}`).toBeGreaterThan(v.bound + 1);   // never inside the clamp
      // no stretch of the run longer than 40 m without a tree beside it
      const ds = t.map((s) => s.dist).sort((a, b) => a - b);
      for (let i = 1; i < ds.length; i++) expect(ds[i] - ds[i - 1], `${v.id} gap at ${ds[i - 1]}`).toBeLessThan(40);
    }
  });
  it('keeps the crowd between the edge poles and the racing line', () => {
    for (const v of SNOW_VENUES) {
      const poles = edgePoles(v.bound, RUN);
      expect(poles.every((p) => Math.abs(p.x) === v.bound - 0.5)).toBe(true);
      expect(v.bound - CROWD_INSET_M + 1.4).toBeLessThan(v.bound - 1);                    // the crowd stands inside the clamp
      expect(SNOW_CROWD.length).toBeGreaterThan(0);
    }
  });
});

describe('the kicker throws you', () => {
  const kicker: RideSolid = { kind: 'box', tag: 'snow_kicker', x0: -3, x1: 3, z0: 0, z1: 7, y0: 0, slope: -0.22, h: 1.9, ramp: true };
  it('finds the ramp under a body riding it, and not one beside it or over it', () => {
    expect(rampUnder([kicker], 0, 6.5, solidTop(kicker, 6.5))).toBe(kicker);
    expect(rampUnder([kicker], 4, 6.5, solidTop(kicker, 6.5))).toBeNull();
    expect(rampUnder([kicker], 0, 6.5, solidTop(kicker, 6.5) + 1)).toBeNull();
  });
  it('pops harder off a steeper ramp and at more speed, never down', () => {
    expect(kickerPop(11, kicker)).toBeGreaterThan(2);
    expect(kickerPop(14, kicker)).toBeGreaterThan(kickerPop(11, kicker));
    expect(kickerPop(0, kicker)).toBe(0);
    expect(kickerPop(11, { ...kicker, ramp: false })).toBe(0);
  });
});
