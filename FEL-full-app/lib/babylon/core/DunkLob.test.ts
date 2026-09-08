import { describe, expect, it } from 'vitest';
import { GRAVITY, LOB_CATCH_RADIUS, canCatch, lobApex, lobAt, lobFlightTime, lobVelocity, runTimeToLine } from './DunkLob';

describe('DunkLob — the self-lob arc', () => {
  it('arrives at the catch point at the flight time, exactly', () => {
    const from = { x: 0.2, y: 1.1, z: -4 }, to = { x: 0, y: 2.7, z: -9 };
    for (const tf of [0.8, 1.3, 2.1]) {
      const v = lobVelocity(from, to, tf);
      const p = lobAt(from, v, tf);
      expect(p.x).toBeCloseTo(to.x, 5); expect(p.y).toBeCloseTo(to.y, 5); expect(p.z).toBeCloseTo(to.z, 5);
    }
  });
  it('integrates like the ball sim (gravity 9.81, no drag)', () => {
    const from = { x: 0, y: 1, z: 0 }, v = lobVelocity(from, { x: 0, y: 2.5, z: -5 }, 1.2);
    let p = { ...from }, vel = { ...v }; const dt = 1 / 600;
    for (let i = 0; i < 720; i++) { vel.y -= GRAVITY * dt; p = { x: p.x + vel.x * dt, y: p.y + vel.y * dt, z: p.z + vel.z * dt }; }
    const a = lobAt(from, v, 1.2);
    expect(p.y).toBeCloseTo(a.y, 1); expect(p.z).toBeCloseTo(a.z, 2);
  });
  it('is a real lob: the apex sits above both ends', () => {
    const from = { x: 0, y: 1.1, z: -3 }, to = { x: 0, y: 2.7, z: -9 };
    const v = lobVelocity(from, to, 1.4);
    expect(lobApex(from, v)).toBeGreaterThan(to.y + 0.3);
    expect(v.y).toBeGreaterThan(0);
  });
  it('a longer run-in buys a longer, higher toss', () => {
    const near = lobFlightTime(1.5, 7, false), far = lobFlightTime(5.5, 7, false);
    expect(far).toBeGreaterThan(near + 0.4);
    expect(lobFlightTime(4, 7, true)).toBeGreaterThan(lobFlightTime(4, 7, false));   // a standing thrower ramps into the run
    expect(lobFlightTime(0, 7, false)).toBeGreaterThanOrEqual(0.55);   // the catch beat alone
    expect(lobFlightTime(0, 7, false, 0)).toBeLessThan(0.1);   // the run alone, from the line: nothing to add
  });
  it('the catch is a proximity check on the ball hand', () => {
    expect(canCatch({ x: 0, y: 2.6, z: -9 }, { x: 0.2, y: 2.9, z: -9.2 })).toBe(true);
    expect(canCatch({ x: 0, y: 2.6, z: -9 }, { x: 0, y: 2.6 + LOB_CATCH_RADIUS + 0.05, z: -9 })).toBe(false);
  });
});

describe('runTimeToLine — the hold-run ramp', () => {
  it('holds a run already at the max', () => { expect(runTimeToLine(7, 7, 7, 6)).toBeCloseTo(1, 5); });
  it('ramps 2 → 7 at 6 m/s² then holds', () => {
    // ramp: 5/6 s over (49 − 4)/12 = 3.75 m, then 2.25 m at 7 m/s
    expect(runTimeToLine(6, 2, 7, 6)).toBeCloseTo(5 / 6 + 2.25 / 7, 5);
  });
  it('is shorter than the throw-frame speed said when the run keeps ramping', () => {
    expect(runTimeToLine(5.5, 3.4, 7, 6)).toBeLessThan(5.5 / 3.4 - 0.5);
  });
  it('never divides by zero on a standing start', () => { expect(Number.isFinite(runTimeToLine(4, 0, 7, 6))).toBe(true); });
});
