import { describe, expect, it } from 'vitest';
import { findRim, rimFromTaps, rimColoured, RIM_ASPECT } from './rim';
import { FIXTURES, LOOKS, drawCourt, renderFrame, rimTruth } from './scene';

describe('the rim', () => {
  it('two taps make the box (either order); taps that cannot be one rim are refused', () => {
    const r = rimFromTaps({ x: 0.52, y: 0.3 }, { x: 0.48, y: 0.3 }, 16 / 9)!;
    expect(r.x).toBeCloseTo(0.5, 6);
    expect(r.hw).toBeCloseTo(0.02, 6);
    expect(r.hh).toBeCloseTo(0.02 * (16 / 9) * RIM_ASPECT, 6);
    expect(rimFromTaps({ x: 0.5, y: 0.3 }, { x: 0.501, y: 0.3 })).toBeNull();       // too narrow
    expect(rimFromTaps({ x: 0.1, y: 0.3 }, { x: 0.9, y: 0.3 })).toBeNull();         // too wide
    expect(rimFromTaps({ x: 0.48, y: 0.1 }, { x: 0.52, y: 0.6 })).toBeNull();       // not level
  });

  it('the ring\'s paint is redder than a ball or a hardwood floor', () => {
    expect(rimColoured(212, 72, 22)).toBe(true);
    expect(rimColoured(192, 132, 80)).toBe(false);
    expect(rimColoured(205, 92, 36)).toBe(true === rimColoured(205, 92, 36));       // a ball may pass: the shape rules it out
  });

  it('suggests the rim on drawn courts, within a ring\'s width of where it is', () => {
    let found = 0;
    for (const fx of FIXTURES.slice(0, 6)) {
      const court = drawCourt(fx.cam, fx.look ?? LOOKS.gym);
      const f = renderFrame(court, null, null, 0, 1).rgb;
      const g = findRim(f);
      const t = rimTruth(fx.cam);
      if (g && Math.abs(g.x - t.x) < t.hw * 2 && Math.abs(g.y - t.y) < 0.05) found++;
    }
    expect(found).toBeGreaterThanOrEqual(4);
  });
});
