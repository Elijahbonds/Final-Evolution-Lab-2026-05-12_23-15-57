import { describe, it, expect } from 'vitest';
import { LUMA_BINS, bodyBox, luma709, lumaHistogram } from './luma';
import { readLight } from './spaceCheck';
import { restPose, synthesize } from '../pose/synth';
import { LEFT_HIP, NOSE, RIGHT_HIP, type Lm } from '../pose/landmarks';

// MOVEMENT PLAY P4 (2026-09-25): the brightness sample the space check reads light from. The page draws the <video>
// into a small canvas and hands the RGBA here; these pin the counting, the body's box, and that the histograms it
// makes are the ones readLight tells dark and backlit from.

/** A w × h RGBA picture, each pixel from fn(x, y) → [r, g, b]. */
function picture(w: number, h: number, fn: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fn(x, y), i = (y * w + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
  }
  return px;
}

describe('the luma histogram', () => {
  it('uses the Rec. 709 weights (RenderWatchdog\'s)', () => {
    expect(luma709(255, 255, 255)).toBeCloseTo(255, 6);
    expect(luma709(255, 0, 0)).toBeCloseTo(0.2126 * 255, 6);
    expect(luma709(0, 255, 0)).toBeCloseTo(0.7152 * 255, 6);
    expect(luma709(0, 0, 255)).toBeCloseTo(0.0722 * 255, 6);
  });

  it('counts every pixel into its bin, and only the box\'s when given one', () => {
    const w = 64, h = 48;
    // the left half black, the right half white
    const px = picture(w, h, (x) => (x < w / 2 ? [0, 0, 0] : [255, 255, 255]));
    const all = lumaHistogram(px, w, h);
    expect(all).toHaveLength(LUMA_BINS);
    expect(all[0]).toBe((w * h) / 2);
    expect(all[LUMA_BINS - 1]).toBe((w * h) / 2);
    const left = lumaHistogram(px, w, h, { x0: 0, y0: 0, x1: 0.5, y1: 1 });
    expect(left[0]).toBe((w * h) / 2);
    expect(left[LUMA_BINS - 1]).toBe(0);
    // a box with no area counts nothing, and a short buffer counts nothing
    expect([...lumaHistogram(px, w, h, { x0: 0.5, y0: 0.5, x1: 0.5, y1: 0.9 })].every((c) => c === 0)).toBe(true);
    expect([...lumaHistogram(px.slice(0, 100), w, h)].every((c) => c === 0)).toBe(true);
  });

  it('makes the histograms readLight tells dark and backlit from', () => {
    const w = 64, h = 48;
    const dark = picture(w, h, () => [25, 25, 25]);
    expect(readLight({ frame: lumaHistogram(dark, w, h) })!.verdict).toBe('dark');
    const room = picture(w, h, (x, y) => [100 + ((x + y) % 60), 110 + ((x * y) % 50), 100]);
    expect(readLight({ frame: lumaHistogram(room, w, h) })!.verdict).toBe('ok');
    // a bright window across the top third, the body a dark shape in the middle
    const box = { x0: 0.4, y0: 0.3, x1: 0.6, y1: 0.95 };
    const backlit = picture(w, h, (x, y) => (y < h / 3 ? [250, 250, 250]
      : x >= box.x0 * w && x < box.x1 * w && y >= box.y0 * h ? [40, 40, 40] : [140, 140, 140]));
    const r = readLight({ frame: lumaHistogram(backlit, w, h), body: lumaHistogram(backlit, w, h, box) })!;
    expect(r.verdict).toBe('backlit');
    // the same room with the body lit is only a bright room
    const lit = picture(w, h, (_x, y) => (y < h / 3 ? [250, 250, 250] : [140, 140, 140]));
    expect(readLight({ frame: lumaHistogram(lit, w, h), body: lumaHistogram(lit, w, h, box) })!.verdict).toBe('ok');
  });
});

describe('the body\'s box', () => {
  it('holds the core points seen, padded, inside the frame', () => {
    const f = synthesize({ fps: 30, frames: [restPose()] }, { camera: { distance: 3.6, heightM: 1.2 }, noise: false, dropRate: 0, missRate: 0 }).frames[0];
    const box = bodyBox(f.image)!;
    const hipX = (f.image[LEFT_HIP].x + f.image[RIGHT_HIP].x) / 2;
    expect(box.x0).toBeLessThan(hipX);
    expect(box.x1).toBeGreaterThan(hipX);
    expect(box.y0).toBeCloseTo(f.image[NOSE].y - 0.04, 6);
    for (const k of ['x0', 'y0', 'x1', 'y1'] as const) { expect(box[k]).toBeGreaterThanOrEqual(0); expect(box[k]).toBeLessThanOrEqual(1); }
  });

  it('is null with too few points seen, or none inside the frame', () => {
    const f = synthesize({ fps: 30, frames: [restPose()] }, { camera: { distance: 3.6, heightM: 1.2 }, noise: false, dropRate: 0, missRate: 0 }).frames[0];
    const unsure: Lm[] = f.image.map((l) => ({ ...l, v: 0.2 }));
    expect(bodyBox(unsure)).toBeNull();
    const outside: Lm[] = f.image.map((l) => ({ ...l, x: l.x + 2 }));
    expect(bodyBox(outside)).toBeNull();
    expect(bodyBox([])).toBeNull();
  });
});
