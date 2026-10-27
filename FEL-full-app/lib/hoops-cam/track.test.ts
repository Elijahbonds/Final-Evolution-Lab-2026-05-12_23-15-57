import { describe, expect, it } from 'vitest';
import { BallTracker, COAST_MS } from './track';
import type { BallCand } from './ball';

const cand = (x: number, y: number, r = 5, shape = 0.9): BallCand => ({ x, y, r, area: Math.PI * r * r, fill: 0.78, aspect: 1, shape });

describe('the tracker', () => {
  it('follows the ball that flies, not a disc that jitters in place (a knee, a shoe)', () => {
    const tr = new BallTracker();
    let out = null;
    for (let k = 0; k < 30; k++) {
      const t = k * 33;
      const jitter = cand(200 + (k % 2 ? 1.5 : -1.5), 150 + (k % 3) - 1, 5, 0.95);
      const ball = cand(40 + k * 4, 120 - k * 3, 5, 0.85);
      out = tr.step(t, [jitter, ball]);
    }
    expect(out).not.toBeNull();
    expect(out!.x).toBeCloseTo(40 + 29 * 4, 0);
    expect(out!.vx).toBeGreaterThan(80);           // ~121 px/s
    expect(out!.vy).toBeLessThan(-60);
  });

  it('coasts a ball hidden for a moment, then lets it go', () => {
    const tr = new BallTracker();
    for (let k = 0; k < 10; k++) tr.step(k * 33, [cand(50 + k * 5, 80)]);
    const c = tr.step(10 * 33, []);
    expect(c?.coast).toBe(true);
    expect(c!.x).toBeGreaterThan(95);
    let last = c;
    for (let t = 11 * 33; t < 10 * 33 + COAST_MS + 100; t += 33) last = tr.step(t, []);
    expect(last).toBeNull();
  });

  it('keeps to the size the caller allows', () => {
    const tr = new BallTracker({ rRange: { min: 2, max: 8 } });
    for (let k = 0; k < 6; k++) expect(tr.step(k * 33, [cand(50 + k * 8, 80, 20)])).toBeNull();
  });
});
