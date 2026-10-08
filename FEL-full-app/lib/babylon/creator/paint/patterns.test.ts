// The pattern generators, the stamp shapes and the text face (IMPROVE (2026-10-06), CREATOR-PLAN phase 3): pure,
// deterministic, every id drawable, generic shapes that fit their square.
import { describe, expect, it } from 'vitest';
import { PAINT_PATTERNS, PAINT_STAMPS } from '../../../creator/look/doc';
import { sanitizeStampText } from '../../../creator/look/sanitize';
import { fbm, gradientMix, hash2, samplePattern } from './patterns';
import { GLYPH_STROKE, TEXT_CHARS, stampDistance, textBlock, textDistance } from './stamps';

const out = new Float32Array(2);
/** A pattern over a 64 × 64 grid of 4 × 4 repeats: its ink and accent coverage, and a checksum of both. */
function grid(kind: typeof PAINT_PATTERNS[number], weight = 0.5) {
  let ink = 0, acc = 0, h = 0;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    samplePattern(kind, (x - 32) / 16 + 0.013, (y - 32) / 16 + 0.007, weight, 1 / 16, out);
    expect(out[0], kind).toBeGreaterThanOrEqual(0); expect(out[0], kind).toBeLessThanOrEqual(1);
    expect(out[1], kind).toBeGreaterThanOrEqual(0); expect(out[1], kind).toBeLessThanOrEqual(1);
    ink += out[0]; acc += out[1];
    h = (Math.imul(h, 31) + Math.round(out[0] * 255) * 7 + Math.round(out[1] * 255)) | 0;
  }
  return { ink: ink / 4096, acc: acc / 4096, h };
}

describe('patterns', () => {
  it('every pattern but the gradient (which runs across its region, in the compositor) draws some ink and leaves some ground', () => {
    for (const p of PAINT_PATTERNS) {
      if (p === 'gradient') continue;
      const g = grid(p);
      expect(g.ink, p).toBeGreaterThan(0.03);
      expect(g.ink, p).toBeLessThan(0.97);
    }
  });
  it('is deterministic: the same grid twice gives the same pixels (camo is hashed, never random)', () => {
    for (const p of PAINT_PATTERNS) expect(grid(p).h, p).toBe(grid(p).h);
    expect(hash2(3, -7, 11)).toBe(hash2(3, -7, 11));
    expect(fbm(1.25, 2.5, 11)).toBe(fbm(1.25, 2.5, 11));
  });
  it('weight is the shape knob: stripes cover about their weight, dots grow with it, camo spreads with it', () => {
    expect(grid('stripes', 0.25).ink).toBeCloseTo(0.25, 1);
    expect(grid('stripes', 0.75).ink).toBeCloseTo(0.75, 1);
    expect(grid('dots', 0.8).ink).toBeGreaterThan(grid('dots', 0.2).ink);
    expect(grid('camo', 0.8).ink).toBeGreaterThan(grid('camo', 0.2).ink);
    expect(grid('lines', 0.9).ink).toBeGreaterThan(grid('lines', 0.1).ink);
  });
  it('checks are half and half; camo uses its accent', () => {
    expect(grid('checks').ink).toBeCloseTo(0.5, 1);
    expect(grid('camo').acc).toBeGreaterThan(0.02);
  });
  it('a gradient\'s midpoint moves with its weight, and three colours split at the middle', () => {
    expect(gradientMix(0.3, 2, 0.3).k).toBeCloseTo(0.5, 5);
    expect(gradientMix(0, 2, 0.5)).toEqual({ from: 0, to: 1, k: 0 });
    expect(gradientMix(0.75, 3, 0.5)).toEqual({ from: 1, to: 2, k: 0.5 });
  });
});

describe('stamps', () => {
  it('every stamp fits its unit square, holds ink, and is a shape (not the whole square)', () => {
    for (const s of PAINT_STAMPS) {
      let inside = 0;
      for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if (stampDistance(s, (x + 0.5) / 24 - 1, (y + 0.5) / 24 - 1) < 0) inside++;
      expect(inside, s).toBeGreaterThan(48 * 48 * 0.05);
      expect(inside, s).toBeLessThan(48 * 48 * 0.92);
      // the border of the square is outside the shape
      for (let k = -1; k <= 1; k += 0.05) {
        for (const [x, y] of [[k, 1.02], [k, -1.02], [1.02, k], [-1.02, k]]) expect(stampDistance(s, x, y), `${s} at ${x},${y}`).toBeGreaterThan(0);
      }
    }
  });
  it('symmetric shapes are symmetric (a mirrored copy of a circle, star, heart or eye is the same shape)', () => {
    for (const s of ['circle', 'star', 'heart', 'eye', 'diamond', 'plus', 'hexagon', 'triangle'] as const) {
      for (const [x, y] of [[0.3, 0.2], [0.55, -0.4], [0.1, 0.8]]) expect(stampDistance(s, x, y), s).toBeCloseTo(stampDistance(s, -x, y), 6);
    }
  });
  it('the eye has a pupil (an accent distance), the others none', () => {
    const acc = new Float32Array(1);
    stampDistance('eye', 0, 0, acc); expect(acc[0]).toBeLessThan(0);
    stampDistance('star', 0, 0, acc); expect(acc[0]).toBe(Infinity);
  });
});

describe('text', () => {
  it('draws exactly the jersey plate\'s characters, so any sanitised text is drawable', () => {
    expect([...TEXT_CHARS].sort().join('')).toBe([...' -0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'].sort().join(''));
    const sample = sanitizeStampText('go-team 2026 <script>!');
    for (const ch of sample) expect(TEXT_CHARS).toContain(ch);
  });
  it('a stroke is ink, the gap between letters is not, and the block measures its strokes', () => {
    // "I": its stem runs up the middle of the block
    expect(textDistance('I', 0, 0)).toBeLessThan(0);
    expect(textDistance('II', 0, 0)).toBeGreaterThan(0);   // between the two letters
    expect(textDistance('', 0, 0)).toBe(Infinity);
    expect(textBlock('AB').w).toBeCloseTo(2 * 5.5 - 1.5 + 2 * GLYPH_STROKE, 6);
  });
});
