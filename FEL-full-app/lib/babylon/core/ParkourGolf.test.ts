// Does the pad pay, is a flick an edge, does a ring count a crossing, does the fan push, does the bank bring it back?
import { describe, it, expect } from 'vitest';
import { PAD, padMult, FLICK, flickRead, flickVel, ringsFor, ringPass, RINGS, turbineFor, gustAt, TURBINE, bankReflect, BANK } from './ParkourGolf';

describe('the launch pad and the flicks', () => {
  it('the springboard augments the strike; nothing without it', () => { expect(padMult('springboard')).toBe(PAD.springboard.mult); expect(padMult(null)).toBe(1); });
  it('a flick is an edge from centre, once per flick left, and pushes sideways to the flight', () => {
    expect(flickRead(0, 0.9, 2)).toBe(1); expect(flickRead(0, -0.9, 2)).toBe(-1); expect(flickRead(0.8, 0.9, 2)).toBe(0); expect(flickRead(0, 0.5, 2)).toBe(0); expect(flickRead(0, 0.9, 0)).toBe(0);
    const v = flickVel({ x: 0, z: 20 }, 1); expect(v.x).toBeCloseTo(FLICK.impulse, 6); expect(v.z).toBeCloseTo(0, 6);
    expect(flickVel({ x: 0, z: 20 }, -1).x).toBeCloseTo(-FLICK.impulse, 6);
  });
});

describe('the rings', () => {
  const tee = { x: 0, z: 0 }, hole = { x: 0, z: 40 };
  const rings = ringsFor(tee, hole);
  it('sit on the line at their shares of it', () => { expect(rings[0].z).toBeCloseTo(18, 6); expect(rings[1].z).toBeCloseTo(30, 6); expect(rings[0].y).toBe(RINGS.y[0]); });
  it('count a step through the plane inside the radius, not beside it, not backwards', () => {
    const line = { x: 0, z: 1 };
    expect(ringPass({ x: 0.5, y: 3.6, z: 17 }, { x: 0.5, y: 3.3, z: 19 }, rings[0], line)).toBe(true);
    expect(ringPass({ x: 3, y: 3.6, z: 17 }, { x: 3, y: 3.3, z: 19 }, rings[0], line)).toBe(false);
    expect(ringPass({ x: 0, y: 3.6, z: 19 }, { x: 0, y: 3.3, z: 17 }, rings[0], line)).toBe(false);
    expect(ringPass({ x: 0, y: 1, z: 17 }, { x: 0, y: 0.5, z: 19 }, rings[0], line)).toBe(false);
  });
});

describe('the turbine and the bank', () => {
  it('the fan sits off the line and gusts the ball away from itself inside its zone', () => {
    const fan = turbineFor({ x: 0, z: 0 }, { x: 0, z: 40 }); expect(fan.z).toBeCloseTo(24, 6); expect(fan.x).toBeCloseTo(TURBINE.side, 6);
    const g = gustAt({ x: fan.x - 2, z: fan.z }, fan)!; expect(g).not.toBeNull(); expect(g.x).toBeLessThan(0); expect(Math.abs(g.z)).toBeLessThan(1e-6);
    expect(gustAt({ x: fan.x - 6, z: fan.z }, fan)).toBeNull();
  });
  it('a putt running out through the band comes back curled to the cup; inside the band or coming in it is left alone', () => {
    const hole = { x: 0, z: 0 };
    const r = bankReflect({ x: 5, z: 0 }, { x: 3, z: 0 }, hole, false)!; expect(r).not.toBeNull(); expect(r.x).toBeLessThan(0);
    const slide = bankReflect({ x: 5, z: 0 }, { x: 3, z: 0 }, hole, true)!; expect(slide.x).toBeLessThan(r.x);
    expect(bankReflect({ x: 5, z: 0 }, { x: -3, z: 0 }, hole, false)).toBeNull();
    expect(bankReflect({ x: 2, z: 0 }, { x: 3, z: 0 }, hole, false)).toBeNull();
    expect(BANK.outerR).toBeLessThan(6.01);
  });
});
