// How far a screenshot is from its baseline (QG-02). Both are scaled to the baseline's size (COMPARE_WIDTH wide), so
// the stored baselines stay small and sub-pixel anti-aliasing between two Chromium builds washes out; what is left is
// what a person would call "the screen changed": a moved block, a missing button, a new colour, a black canvas.
//
//   changed  — the share of pixels whose largest channel moved by more than PIXEL_TOLERANCE (0–255)
//   mean     — the mean absolute channel difference (0–255), for the log
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import sharp from 'sharp';
import { raster } from '../e2e/pixels';

export const COMPARE_WIDTH = 256;
export const PIXEL_TOLERANCE = 40;
export const BLUR = 1.2;

export interface Diff { changed: number; mean: number; width: number; height: number }

export async function toBaseline(png: Buffer): Promise<Buffer> {
  const meta = await sharp(png).metadata();
  const h = Math.max(1, Math.round(((meta.height ?? 1) / (meta.width ?? 1)) * COMPARE_WIDTH));
  return sharp(png).removeAlpha().resize(COMPARE_WIDTH, h, { fit: 'fill', kernel: 'lanczos3' }).png({ compressionLevel: 9, palette: false }).toBuffer();
}

/** Compare a full-size screenshot with a stored baseline; writes a diff image (changed pixels in magenta) to diffPath. */
export async function compare(current: Buffer, baselinePath: string, diffPath?: string): Promise<Diff> {
  // a light blur on both sides first: two Chromium builds place a glyph's anti-aliasing a pixel apart, which on a
  // text-heavy screen is 2% of "changed" pixels (measured: this box vs the GitHub runner's Chrome, coach-book, 1.96%);
  // a moved block, a new colour or a missing element is far larger than the blur
  const plain = await raster(readFileSync(baselinePath));
  const base = await raster(readFileSync(baselinePath), { width: plain.width, height: plain.height }, BLUR);
  const cur = await raster(current, { width: base.width, height: base.height }, BLUR);
  let changed = 0, sum = 0;
  const out = Buffer.alloc(base.width * base.height * 3);
  for (let i = 0, px = 0; i < base.data.length; i += base.channels, px++) {
    const d = Math.max(Math.abs(base.data[i] - cur.data[i]), Math.abs(base.data[i + 1] - cur.data[i + 1]), Math.abs(base.data[i + 2] - cur.data[i + 2]));
    sum += (Math.abs(base.data[i] - cur.data[i]) + Math.abs(base.data[i + 1] - cur.data[i + 1]) + Math.abs(base.data[i + 2] - cur.data[i + 2])) / 3;
    const hit = d > PIXEL_TOLERANCE;
    if (hit) changed++;
    const g = Math.round((cur.data[i] + cur.data[i + 1] + cur.data[i + 2]) / 9);
    out[px * 3] = hit ? 255 : g; out[px * 3 + 1] = hit ? 0 : g; out[px * 3 + 2] = hit ? 255 : g;
  }
  const n = base.width * base.height;
  if (diffPath) {
    mkdirSync(dirname(diffPath), { recursive: true });
    writeFileSync(diffPath, await sharp(out, { raw: { width: base.width, height: base.height, channels: 3 } }).png().toBuffer());
  }
  return { changed: changed / n, mean: sum / n, width: base.width, height: base.height };
}

export function hasBaseline(path: string): boolean { return existsSync(path); }
