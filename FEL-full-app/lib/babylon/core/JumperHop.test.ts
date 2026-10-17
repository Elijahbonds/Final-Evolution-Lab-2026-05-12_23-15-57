// H3d (owner 2026-10-17, D8: the shot motion — stiff / floaty, the ball leaving the hands at the wrong moment): the jump shot's hop.
// Before: the root left the floor at the rise's start (the load in the air), rode a sine of rise + 0.32 s (over a second airborne for a
// 0.30 m jump) and peaked ~200 ms before the release.
import { describe, expect, it } from 'vitest';
import { jumperHop, jumperHopY, JUMPER_G, JUMPER_APEX_AFTER_RELEASE_SEC, JUMPER_MIN_LOAD_SEC } from './BallHandling';

const APEX = 0.3;

describe('the jump shot\'s hop (BallHandling.jumperHop)', () => {
  for (const [label, rise] of [['open', 0.72], ['contested', 0.5]] as const) {
    it(`${label} (rise ${rise} s, green at 0.62): the load on the floor, the apex just after the release, a body's own air time`, () => {
      const h = jumperHop(rise, 0.62, APEX);
      expect(h.releaseSec).toBeCloseTo(0.62 * rise, 9);
      expect(h.apexSec - h.releaseSec).toBeCloseTo(JUMPER_APEX_AFTER_RELEASE_SEC, 9);   // the ball leaves at the top, a hair before it
      expect(h.takeoffSec).toBeGreaterThanOrEqual(JUMPER_MIN_LOAD_SEC);                  // the dip happens on the floor
      expect(h.airSec).toBeCloseTo(2 * Math.sqrt(2 * APEX / JUMPER_G), 9);                // 0.49 s for 0.30 m (it was rise + 0.32 s)
      expect(jumperHopY(h, h.takeoffSec * 0.5)).toBe(0);
      expect(jumperHopY(h, h.apexSec)).toBeCloseTo(APEX, 6);
      expect(jumperHopY(h, h.landSec + 0.01)).toBe(0);
      let prev = 0; for (let t = h.takeoffSec; t <= h.apexSec; t += 0.005) { const y = jumperHopY(h, t); expect(y).toBeGreaterThanOrEqual(prev - 1e-9); prev = y; }
    });
  }
  it('a release too early for the load leaves the floor after the load and keeps the air time (the apex later)', () => {
    const h = jumperHop(0.3, 0.3, APEX);   // release at 0.09 s
    expect(h.takeoffSec).toBe(JUMPER_MIN_LOAD_SEC);
    expect(h.landSec - h.takeoffSec).toBeCloseTo(h.airSec, 9);
  });
});
