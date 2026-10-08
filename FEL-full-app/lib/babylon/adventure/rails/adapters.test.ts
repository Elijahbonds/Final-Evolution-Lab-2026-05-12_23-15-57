// The app's existing rails as Adventure networks (lane A1): every skate and snow venue's rails adapt and pass
// contracts.validateRailNetwork; a live RideWorld's GrindLines adapt as they are; the kinked rail links; the copied
// slope pitch matches rideWorlds; generated parallel switches validate and actually switch.
import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import type { GrindLine } from '@/lib/babylon/core/GroundRide';
import { SLOPE_PITCH as RIDE_SLOPE_PITCH, PARK_BOUND } from '@/lib/babylon/modes/rideWorlds';
import { SKATE_VENUES, SNOW_VENUES, rideOf } from '@/lib/babylon/nexus/boardVenues';
import { plazaRails } from '@/lib/babylon/modes/skatePlaza';
import { validateRailNetwork, type RailNetwork } from '../contracts';
import { createMovementSystem } from '../movement/index';
import { fakeWorld, makeActor, Runner } from '../movement/testkit';
import {
  SLOPE_PITCH, addParallelSwitches, grindLinesToRailNetwork, skateparkRailNetwork, skatePlazaRailNetwork, snowSlopeRailNetwork,
} from './adapters';

describe('adapters: the rideWorlds rails', () => {
  it('every skate venue\'s park and plaza rails adapt and validate', () => {
    for (const v of [...SKATE_VENUES.map((x) => x.bound), PARK_BOUND]) {
      const park = skateparkRailNetwork(v);
      expect(validateRailNetwork(park)).toEqual([]);
      expect(park.segments.length).toBe(6 + plazaRails(v).length);
      const plaza = skatePlazaRailNetwork(v);
      expect(validateRailNetwork(plaza)).toEqual([]);
      // the signature gaps keep their goal ids
      expect(plaza.segments.map((s) => s.id)).toEqual(expect.arrayContaining(['plaza_hubba', 'plaza_gap']));
    }
  });

  it('the plaza\'s kinked rail (two lines) is linked end to end', () => {
    const plaza = skatePlazaRailNetwork(56);
    const linked = plaza.segments.filter((s) => s.next || s.prev);
    expect(linked.length).toBeGreaterThanOrEqual(2);
    const first = linked.find((s) => s.next)!;
    expect(plaza.segments.find((s) => s.id === first.next)?.prev).toBe(first.id);
  });

  it('every snow venue\'s rails (and the lift cable) adapt and validate, on the pitched piste', () => {
    expect(SLOPE_PITCH).toBe(RIDE_SLOPE_PITCH);
    for (const v of SNOW_VENUES) {
      const net = snowSlopeRailNetwork(v.bound, SLOPE_PITCH * rideOf(v).pitch);
      expect(validateRailNetwork(net)).toEqual([]);
      const cable = net.segments.find((s) => s.id === 'snow:lift')!;
      expect(cable.tags).toEqual(['grindable-cable']);
      for (const s of net.segments) expect(s.points[1].y).toBeLessThan(s.points[0].y);   // downhill, every one
    }
  });

  it('a live world\'s GrindLines (Babylon Vector3s) adapt as plain points', () => {
    const lines: GrindLine[] = [
      { a: new Vector3(0, 1, 0), b: new Vector3(0, 1, 6), bonus: 200 },
      { a: new Vector3(0, 1, 6), b: new Vector3(3, 0.5, 9), bonus: 400, gapId: 'gap' },
      { a: new Vector3(5, 1, 0), b: new Vector3(5, 1, 0.2), bonus: 50 },     // too short to ride: dropped
    ];
    const net = grindLinesToRailNetwork('live', lines);
    expect(validateRailNetwork(net)).toEqual([]);
    expect(net.segments.map((s) => s.id)).toEqual(['live:0', 'gap']);
    expect(net.segments[0].next).toBe('gap');
    expect(net.segments[1].tags).toEqual(['trickZone']);
    expect(net.segments[0].points[0]).toEqual({ x: 0, y: 1, z: 0 });
    expect(net.segments[0].points[0]).not.toBeInstanceOf(Vector3);
  });
});

describe('adapters: parallel switches', () => {
  const pair = (): RailNetwork => ({ id: 'pair', segments: [
    { id: 'L', points: [{ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 30 }], speedBias: 0, switches: [] },
    { id: 'R', points: [{ x: 3, y: 1, z: 0 }, { x: 3, y: 1, z: 30 }], speedBias: 0, switches: [] },
    { id: 'far', points: [{ x: 20, y: 1, z: 0 }, { x: 20, y: 1, z: 30 }], speedBias: 0, switches: [] },
  ] });

  it('adds switches both ways on the right sides, none to a rail out of reach, and validates', () => {
    const net = addParallelSwitches(pair());
    expect(validateRailNetwork(net)).toEqual([]);
    const L = net.segments.find((s) => s.id === 'L')!, R = net.segments.find((s) => s.id === 'R')!;
    expect(L.switches.length).toBeGreaterThanOrEqual(4);
    expect(L.switches.every((w) => w.toSegment === 'R' && w.side === 1)).toBe(true);
    expect(R.switches.every((w) => w.toSegment === 'L' && w.side === -1)).toBe(true);
    expect(net.segments.find((s) => s.id === 'far')!.switches).toEqual([]);
    expect(pair().segments[0].switches).toEqual([]);           // the input is untouched
  });

  it('a generated switch really switches', () => {
    const world = fakeWorld({ rails: addParallelSwitches(pair()) });
    const r = new Runner(world, [createMovementSystem()]);
    const p = world.add(makeActor('p1', 'player', { pos: { x: 0, y: 1.2, z: 1 }, vel: { x: 0, y: -1, z: 10 }, grounded: false, state: 'air' }));
    r.tick();
    expect(p.state).toBe('grind');
    r.runUntil(() => (p.rail?.sM ?? 0) >= 8.5, 2);         // switch points every 6 m from 3 m: 9 m is one
    r.input('p1').lean = 1;
    r.press('p1', 'jump'); r.tick();
    expect(r.of('rail:switch')).toEqual([{ actorId: 'p1', from: 'L', to: 'R' }]);
  });
});
