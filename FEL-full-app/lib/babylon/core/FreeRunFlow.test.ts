// Does flow buy speed and spend as a burst, does a rebound reflect, is a vault graded by the frame, does a gate need speed?
import { describe, it, expect } from 'vitest';
import { FLOW, FlowMeter, KINETIC, KineticMeter, vectorRebound, approachDeg, vaultTiming, draftStep, isDrafting, gateOpen, canGrapple, swingAt, GRAPPLE } from './FreeRunFlow';

describe('the flow meter', () => {
  it('tiers up as it fills, buys top speed, and spends a tier as a landing burst', () => {
    const f = new FlowMeter();
    expect(f.tier).toBe(0); expect(f.topSpeedMult()).toBe(1);
    f.add(FLOW.wallRunPerSec * 2.5); expect(f.tier).toBe(1);
    f.add(200); expect(f.tier).toBe(3); expect(f.topSpeedMult()).toBeCloseTo(1 + 3 * FLOW.topSpeedPerTier, 6);
    expect(f.burst()).toBeCloseTo(3 * FLOW.burstPerTier, 6);
    expect(f.tier).toBe(2);
    const empty = new FlowMeter(); expect(empty.burst()).toBe(0);
  });
  it('drains standing still, not while a move is going', () => {
    const f = new FlowMeter(); f.add(100);
    f.tick(1, false); expect(f.value).toBe(100);
    f.tick(1, true); expect(f.value).toBeCloseTo(100 - FLOW.decayPerSec, 6);
  });
});

describe('the kinetic meter', () => {
  it('a burst costs half, a slam all of it', () => {
    const k = new KineticMeter();
    expect(k.spendBurst()).toBe(false);
    k.add(KINETIC.hit * 2); expect(k.canBurst).toBe(true); expect(k.canSlam).toBe(false);
    expect(k.spendBurst()).toBe(true); expect(k.value).toBe(0);
    k.add(999); expect(k.value).toBe(KINETIC.max); expect(k.spendSlam()).toBe(true); expect(k.value).toBe(0);
  });
});

describe('the vector rebound', () => {
  const wall = { x: -1, z: 0 };   // a wall on the right (+x) whose inward normal points −x
  it('reflects an oblique approach and keeps the forward component', () => {
    const r = vectorRebound({ x: 0.6, z: 0.8 }, wall)!;
    expect(r).not.toBeNull();
    expect(r.x).toBeCloseTo(-0.6, 6); expect(r.z).toBeCloseTo(0.8, 6);
  });
  it('refuses a head-on run (that is a wall run) and a graze', () => {
    expect(vectorRebound({ x: 1, z: 0.05 }, wall)).toBeNull();
    expect(vectorRebound({ x: 0.05, z: 1 }, wall)).toBeNull();
    expect(approachDeg({ x: 1, z: 0 }, wall)).toBeCloseTo(0, 6);
  });
});

describe('the momentum vault', () => {
  it('grades the press by the frame: perfect a lead ahead, good around it, early and late outside', () => {
    const v = 6;
    expect(vaultTiming(0.16 * v, v)).toBe('perfect');
    expect(vaultTiming(0.3 * v, v)).toBe('good');
    expect(vaultTiming(0.5 * v, v)).toBe('early');
    expect(vaultTiming(0, v)).toBe('good');
    expect(vaultTiming(-0.3 * v, v)).toBe('late');
  });
});

describe('drafting, gates and the grapple', () => {
  it('the gauge fills behind a runner and decays away from one; a slingshot needs it full', () => {
    let g = 0; for (let i = 0; i < 60; i++) g = draftStep(g, true, 1 / 30); expect(g).toBeGreaterThan(1 - 1e-9);
    for (let i = 0; i < 30; i++) g = draftStep(g, false, 1 / 30); expect(g).toBeLessThan(1);
    expect(isDrafting({ along: 10, lateral: 0 }, { along: 14, lateral: 0.5 })).toBe(true);
    expect(isDrafting({ along: 10, lateral: 0 }, { along: 8, lateral: 0.5 })).toBe(false);
    expect(isDrafting({ along: 10, lateral: 0 }, { along: 14, lateral: 3 })).toBe(false);
  });
  it('a gate opens only above its tier\'s share of top speed', () => {
    expect(gateOpen(6, 1, 6.4)).toBe(true);
    expect(gateOpen(6, 2, 6.4)).toBe(false);
    expect(gateOpen(7.4, 3, 6.4)).toBe(true);
  });
  it('an anchor ahead and above inside reach can be latched, and the swing dips then exits past it', () => {
    const p = { x: 0, y: 0, z: 10 }, a = { x: 1, y: 4, z: 16 };
    expect(canGrapple(p, a)).toBe(true);
    expect(canGrapple(p, { x: 1, y: 4, z: 9 })).toBe(false);
    expect(canGrapple(p, { x: 1, y: 4, z: 30 })).toBe(false);
    const mid = swingAt(p, a, 0.5), end = swingAt(p, a, 1);
    expect(mid.y).toBeLessThan(a.y); expect(end.z).toBeCloseTo(a.z + GRAPPLE.exitPastM, 6); expect(end.x).toBeCloseTo(a.x, 6);
  });
});
