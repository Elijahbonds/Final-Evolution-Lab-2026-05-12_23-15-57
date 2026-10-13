// The combat sprites are pure functions over a 2-D context: hold what each one draws (lane/vis-combat, 2026-10-13).
import { describe, expect, it } from 'vitest';
import { paintAuraColumn, paintCrack, paintDot, paintFlame, paintLightPool, paintRing, paintScorch, paintSmoke, paintSpeedLines, paintStar, rng } from './fxPaint';
import { allFinite, recordingCtx } from './canvasShim.test-helper';

const painters: Array<[string, (c: ReturnType<typeof recordingCtx>) => void]> = [
  ['dot', (c) => paintDot(c, 32)], ['star', (c) => paintStar(c, 128)], ['ring', (c) => paintRing(c, 128)], ['smoke', (c) => paintSmoke(c, 128)],
  ['flame', (c) => paintFlame(c, 64, 128)], ['crack', (c) => paintCrack(c, 256)], ['scorch', (c) => paintScorch(c, 128)],
  ['aura', (c) => paintAuraColumn(c, 256, 256)], ['pool', (c) => paintLightPool(c, 128)], ['speed', (c) => paintSpeedLines(c, 640, 360)],
];

describe('the combat sprites', () => {
  for (const [name, paint] of painters) {
    it(`${name} draws something, and nothing it draws is NaN`, () => {
      const c = recordingCtx(); paint(c);
      expect(c.calls.some((k) => ['fillRect', 'fill', 'stroke', 'arc'].includes(k.fn)), `${name} painted nothing`).toBe(true);
      expect(allFinite(c.calls), `${name} drew a non-finite number`).toBe(true);
    });
    it(`${name} is the same every time (seeded, never Math.random)`, () => {
      const a = recordingCtx(), b = recordingCtx(); paint(a); paint(b);
      expect(JSON.stringify(a.calls)).toBe(JSON.stringify(b.calls));
    });
  }

  it('the star is a four-point cross: four long spikes, four short diagonals and a core', () => {
    const c = recordingCtx(); paintStar(c, 128);
    expect(c.calls.filter((k) => k.fn === 'fill').length).toBe(8);   // eight spike triangles
    expect(c.calls.filter((k) => k.fn === 'rotate').length).toBe(8);
  });

  it('a crack seam can be coloured, and the speed lines take a colour', () => {
    const a = recordingCtx(); paintCrack(a, 256, 3, '#00ff00');
    expect(JSON.stringify(a.calls)).toContain('#00ff00');
    const b = recordingCtx(); paintSpeedLines(b, 640, 360, 1, 20, '255,0,0');
    expect(JSON.stringify(b.calls)).toContain('rgba(255,0,0,');
  });

  it('rng is deterministic and spread over 0..1', () => {
    const r1 = rng(7), r2 = rng(7), xs = Array.from({ length: 200 }, () => r1());
    expect(xs).toEqual(Array.from({ length: 200 }, () => r2()));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0); expect(Math.max(...xs)).toBeLessThan(1);
    expect(new Set(xs).size).toBeGreaterThan(190);
  });
});
