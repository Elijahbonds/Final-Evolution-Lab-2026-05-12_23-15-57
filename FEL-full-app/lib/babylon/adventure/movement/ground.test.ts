// The momentum run (lane A1). The owner asked for "speed that builds": these runs are the proof, headless at 60 Hz.
import { describe, expect, it } from 'vitest';
import { createMovementSystem } from './index';
import { DEFAULT_MOVEMENT } from './params';
import { stepRunSpeed, targetSpeedFor, topSpeedFor, turnRateFor } from './ground';
import { fakeWorld, makeActor, Runner, type FakeWorldOpts } from './testkit';

function rig(w: FakeWorldOpts = {}) {
  const world = fakeWorld(w);
  const sys = createMovementSystem();
  const r = new Runner(world, [sys]);
  const p = world.add(makeActor('p1'));
  return { world, sys, r, p, inp: r.input('p1') };
}
const planar = (v: { x: number; z: number }) => Math.hypot(v.x, v.z);
const g = DEFAULT_MOVEMENT.ground;

describe('ground: the momentum curve', () => {
  it('speed builds on a straight: the run speed inside a second, then up through the FLOW tiers to the top', () => {
    const { r, p, sys, inp } = rig();
    inp.move.y = 1;
    const samples: number[] = [];
    r.run(12, () => samples.push(planar(p.vel)));
    // never drops while the stick is held straight
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1] - 1e-9);
    const at = (sec: number) => samples[Math.round(sec * 60)];
    expect(at(1)).toBeGreaterThanOrEqual(g.runSpeed - 0.01);          // quick off the mark
    expect(at(1)).toBeLessThan(g.runSpeed + 0.5);
    expect(at(4)).toBeGreaterThan(at(1) + 1);                         // building
    expect(at(11.9)).toBeCloseTo(g.flowTopSpeeds[3], 1);              // the plan's FLOW top: 14 m/s
    expect(sys.inspect('p1')?.flowTier).toBe(3);
    expect(p.state).toBe('ground');
    expect(p.pos.z).toBeGreaterThan(100);
  });

  it('a part tilt jogs, and the curve between is smooth', () => {
    expect(targetSpeedFor(g, 0.3, topSpeedFor(g, 0))).toBeCloseTo(3);
    expect(targetSpeedFor(g, 0.6, topSpeedFor(g, 0))).toBeCloseTo(g.jogSpeed);
    expect(targetSpeedFor(g, 1, topSpeedFor(g, 0))).toBeCloseTo(g.runSpeed);
    expect(targetSpeedFor(g, 1, topSpeedFor(g, 3))).toBeCloseTo(14);
    const { r, p, inp } = rig();
    inp.move.y = 0.5;
    r.run(3);
    expect(planar(p.vel)).toBeLessThanOrEqual(g.jogSpeed);
    expect(planar(p.vel)).toBeGreaterThan(3);
  });

  it('released, the runner coasts to a stop; overspeed is kept slowly while the stick is held', () => {
    expect(stepRunSpeed(g, 9, 0, 9, false, false, false, 0.1)).toBeCloseTo(9 - g.decel * 0.1);
    expect(stepRunSpeed(g, 16, 9, 9, true, false, false, 0.1)).toBeCloseTo(16 - g.overspeedDecay * 0.1);
    const { r, p, inp } = rig();
    inp.move.y = 1; r.run(2);
    inp.move.y = 0; r.run(1.5);
    expect(planar(p.vel)).toBe(0);
  });

  it('slopes: downhill gains past the flat run, uphill loses', () => {
    const run = (slope: number) => {
      const { r, p, inp } = rig({ ground: (_x, z) => -slope * z });
      inp.move.y = 1; r.run(3);
      return planar(p.vel);
    };
    const flat = run(0), down = run(0.25), up = run(-0.25);
    expect(down).toBeGreaterThan(flat + 2);
    expect(up).toBeLessThan(flat - 1);
    // and the runner stays on the slope's surface
    const { r, p, inp } = rig({ ground: (_x, z) => -0.25 * z });
    inp.move.y = 1; r.run(2);
    expect(p.pos.y).toBeCloseTo(-0.25 * p.pos.z, 3);
    expect(p.state).toBe('ground');
  });

  it('turns get wider as the speed climbs (a pivot at a walk)', () => {
    expect(turnRateFor(g, 2)).toBe(Infinity);
    expect(turnRateFor(g, 9)).toBeCloseTo(g.turnRate);
    expect(turnRateFor(g, 14)).toBeCloseTo(g.turnRateAtTop);
  });
});

describe('ground: one stick, three devices (camera-relative)', () => {
  it('stick forward runs where the camera looks', () => {
    const { r, p, inp } = rig();
    inp.move.y = 1; inp.camYaw = Math.PI / 2;
    r.run(1);
    expect(p.pos.x).toBeGreaterThan(4);
    expect(Math.abs(p.pos.z)).toBeLessThan(0.05);
    expect(p.facingYaw).toBeCloseTo(Math.PI / 2, 3);
  });

  it('a keyboard diagonal (W+D) runs at 45° and no faster than one key', () => {
    const { r, p, inp } = rig();
    inp.move.x = 1; inp.move.y = 1;
    r.run(1.5);
    expect(planar(p.vel)).toBeLessThanOrEqual(g.runSpeed + 0.01);
    expect(Math.atan2(p.vel.x, p.vel.z)).toBeCloseTo(Math.PI / 4, 3);
  });

  it('a resting thumb (inside the deadzone) does nothing; just past it means "barely"', () => {
    const { r, p, inp } = rig();
    inp.move.y = 0.1;
    r.run(1);
    expect(planar(p.pos)).toBe(0);
    inp.move.y = 0.2;
    r.run(2);
    expect(planar(p.vel)).toBeGreaterThan(0);
    expect(planar(p.vel)).toBeLessThan(1.5);
  });

  it('a reversal at speed is a skid, not an instant about-face', () => {
    const { r, p, sys, inp } = rig();
    inp.move.y = 1; r.run(2);
    inp.move.y = -1; r.tick(3);
    expect(sys.inspect('p1')?.skidding).toBe(true);
    expect(p.vel.z).toBeGreaterThan(0);                // still going forward, braking
    r.run(1.5);
    expect(p.vel.z).toBeLessThan(-3);                  // and then away the other way
  });

  it('runs off a ledge into the air, and stops at a wall taller than a step', () => {
    const ledge = rig({ ground: (_x, z) => (z < 3 ? 2 : 0) });
    ledge.p.pos.y = 2; ledge.inp.move.y = 1;
    ledge.r.run(0.8);
    expect(ledge.p.state === 'air' || ledge.p.pos.y < 2).toBe(true);
    const wall = rig({ ground: (_x, z) => (z > 3 ? 2 : 0) });
    wall.inp.move.y = 1;
    wall.r.run(2);
    expect(wall.p.pos.z).toBeLessThan(3.01);
    expect(wall.p.pos.y).toBe(0);
  });
});
