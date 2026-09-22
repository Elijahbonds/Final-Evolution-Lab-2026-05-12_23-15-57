import { describe, it, expect } from 'vitest';
import { CourtMovement, CUT_COST_HOOPS, DEFAULT_MOVEMENT, GEARS_HOOPS } from './CourtMovement';

// Phase 5 — the momentum cost on a cut. 2K's rule: you cannot change direction at pace for free. The cost is paid ONCE
// when the stick asks for the cut, graded by angle and speed, and never as a per-frame drag.
const hoops = () => new CourtMovement({ ...DEFAULT_MOVEMENT, gears: GEARS_HOOPS, cutCost: CUT_COST_HOOPS });
const plain = () => new CourtMovement({ ...DEFAULT_MOVEMENT, gears: GEARS_HOOPS });
/** Drive up-stick for `sec`, then flick to (x, y) and hold; returns speed before the cut and the lowest speed inside the next 0.3 s. */
function cut(m: CourtMovement, sprint: boolean, x: number, y: number, dt = 1 / 60, prime = 1.6) {
  for (let t = 0; t < prime; t += dt) m.update(dt, 0, 1, sprint);
  const before = m.vel.length(); let low = before;
  for (let t = 0; t < 0.3; t += dt) low = Math.min(low, m.update(dt, x, y, sprint).vel.length());
  return { before, low, kept: low / before };
}

describe('the cut cost', () => {
  it('a full-sprint 90° cut pays ~a quarter of its speed; the same cut without the tuning is free', () => {
    const paid = cut(hoops(), true, 1, 0), free = cut(plain(), true, 1, 0);
    expect(paid.before).toBeCloseTo(DEFAULT_MOVEMENT.maxSpeed, 1);
    expect(paid.kept).toBeLessThan(0.82); expect(paid.kept).toBeGreaterThan(0.62);
    expect(free.kept).toBeGreaterThan(0.95);
  });
  it('a jog cut is nearly free, and a 30° lane change costs nothing', () => {
    expect(cut(hoops(), false, 1, 0).kept).toBeGreaterThan(0.85);
    expect(cut(hoops(), true, Math.sin(Math.PI / 6), Math.cos(Math.PI / 6)).kept).toBeGreaterThan(0.97);
  });
  it('a sharper cut costs more, up to the plant', () => {
    const c90 = cut(hoops(), true, 1, 0), c60 = cut(hoops(), true, Math.sin(Math.PI / 3), Math.cos(Math.PI / 3));
    expect(c90.kept).toBeLessThan(c60.kept);
  });
  it('is paid once: holding the new line recovers to top speed, and the next cut pays again', () => {
    const m = hoops(); const dt = 1 / 60;
    const first = cut(m, true, 1, 0, dt);
    for (let t = 0; t < 1.2; t += dt) m.update(dt, 1, 0, true);
    expect(m.vel.length()).toBeCloseTo(DEFAULT_MOVEMENT.maxSpeed, 1);
    const before = m.vel.length(); let low = before;
    for (let t = 0; t < 0.3; t += dt) low = Math.min(low, m.update(dt, 0, 1, true).vel.length());
    expect(low / before).toBeLessThan(0.82);
    expect(first.kept).toBeLessThan(0.82);
  });
  it('an authored redirect under cutGrace is exempt', () => {
    const m = hoops(); const dt = 1 / 60;
    for (let t = 0; t < 1.6; t += dt) m.update(dt, 0, 1, true);
    m.cutGrace(0.4);
    const before = m.vel.length(); let low = before;
    for (let t = 0; t < 0.3; t += dt) low = Math.min(low, m.update(dt, 1, 0, true).vel.length());
    expect(low / before).toBeGreaterThan(0.95);
  });
  it('is frame-independent: the same cut keeps the same speed at 30 and 144 fps', () => {
    const a = cut(hoops(), true, 1, 0, 1 / 30), b = cut(hoops(), true, 1, 0, 1 / 144);
    expect(Math.abs(a.kept - b.kept)).toBeLessThan(0.06);
  });
});
