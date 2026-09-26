// luma — the space check's brightness sample (movement play, phase 4, 2026-09-25).
//
// The check reads light two ways (lib/move/spaceCheck.ts): how sure the model is of the body (visibility, from the
// landmarks), and how bright the picture is (readLight, from luma histograms). The histograms are made here from a
// small canvas sample of the video (the page's glue draws the <video> into a 64×48 canvas a few times a second, and
// hands this the RGBA): one for the whole frame, one for the body's box, which tells a backlit silhouette from a bright
// room. The weights are Rec. 709, as lib/babylon/core/RenderWatchdog.ts reads a frame's luma.
//
// Nothing here leaves the page: the pixels are counted into 32 numbers and dropped.
// Pure: no DOM (the RGBA is handed in).
import { CORE_POINTS, type Lm } from '../pose/landmarks';

/** Bins in a histogram: 8 luma levels each (readLight takes any count). */
export const LUMA_BINS = 32;
/** A core point counts toward the body's box at this visibility (calibrate.ts's SEEN_VIS). */
const BOX_VIS = 0.5;

/** Rec. 709 luma of one pixel, 0..255. */
export const luma709 = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * A luma histogram of an RGBA buffer (w × h), or of the part of it inside `box` (0..1 of the width and height; an
 * empty box counts nothing). Bin i counts luma in [i, i + 1) × 256 / LUMA_BINS.
 */
export function lumaHistogram(
  rgba: ArrayLike<number>, w: number, h: number, box?: { x0: number; y0: number; x1: number; y1: number },
): Float32Array {
  const hist = new Float32Array(LUMA_BINS);
  if (!(w > 0) || !(h > 0) || rgba.length < w * h * 4) return hist;
  const x0 = box ? Math.max(0, Math.floor(box.x0 * w)) : 0, x1 = box ? Math.min(w, Math.ceil(box.x1 * w)) : w;
  const y0 = box ? Math.max(0, Math.floor(box.y0 * h)) : 0, y1 = box ? Math.min(h, Math.ceil(box.y1 * h)) : h;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      const l = luma709(rgba[i], rgba[i + 1], rgba[i + 2]);
      hist[Math.min(LUMA_BINS - 1, Math.max(0, Math.floor((l * LUMA_BINS) / 256)))]++;
    }
  }
  return hist;
}

/**
 * The body's box in the picture (0..1): the core points the model is sure of (the nose, shoulders, hips, knees and
 * ankles), padded by `pad` and clipped to the frame. Null with fewer than 3 of them, or a box with no area.
 */
export function bodyBox(image: readonly Lm[], pad = 0.04): { x0: number; y0: number; x1: number; y1: number } | null {
  const seen = CORE_POINTS.map((i) => image[i]).filter((l) => l && l.v >= BOX_VIS && l.x >= 0 && l.x <= 1 && l.y >= 0 && l.y <= 1);
  if (seen.length < 3) return null;
  const xs = seen.map((l) => l.x), ys = seen.map((l) => l.y);
  const box = {
    x0: Math.max(0, Math.min(...xs) - pad), y0: Math.max(0, Math.min(...ys) - pad),
    x1: Math.min(1, Math.max(...xs) + pad), y1: Math.min(1, Math.max(...ys) + pad),
  };
  return box.x1 > box.x0 && box.y1 > box.y0 ? box : null;
}
