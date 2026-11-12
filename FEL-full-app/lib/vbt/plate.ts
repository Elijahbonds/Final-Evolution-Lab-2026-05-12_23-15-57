// lib/vbt/plate.ts — VBT (2026-10-25): the plate's centre and radius in one frame, in plain JS (no new dependency).
//
// HOW. Side-on, the near plate covers the hands, so the pose's wrists say where to look (the SEED) and the body's size
// says how big a 45 cm plate should be there (the radius RANGE). In a window around the seed: Sobel edges, the strongest
// share kept; the centre voted for by every edge along its own gradient (a gradient Hough transform: a plate's rim is a
// radial step in brightness, so its votes pile on one point; a rack upright or a leg spreads them on a line); the radius
// the most common distance of the radial edges from it; then an algebraic (Kåsa) least-squares fit on the rim. The rim
// must show ≥ MIN_COVER of its angles (a plate may be partly hidden by a hand or the frame edge, never mostly).
// Deterministic. Nothing is found → null, and the set falls back to the pose (lib/vbt/track.ts).
//
// THE PICTURE NEVER LEAVES THE DEVICE. This reads a downscaled grey copy of a frame the page already holds (the caller
// draws the <video> into an offscreen canvas); it keeps nothing and sends nothing.
//
// Pure.
import { rng } from './rng';
import type { PlateObs } from './track';

/** One grey frame: w × h, one byte per pixel (luma). */
export interface Luma { w: number; h: number; data: Uint8Array | Uint8ClampedArray }

export interface PlateFit { cx: number; cy: number; r: number; inliers: number; cover: number }

/** (new) The strongest edge share kept, and the share of the rim's angles a plate must show. */
export const EDGE_KEEP = 0.18;
export const MIN_COVER = 0.5;
export const MIN_DENSITY = 0.6;
const ANGLE_BINS = 36;
const MAX_POINTS = 2500;

/** Luma from RGBA (an ImageData's bytes), Rec. 601 weights. */
export function lumaOf(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Luma {
  const data = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) data[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
  return { w, h, data };
}

interface Edge { x: number; y: number; gx: number; gy: number }

function edgesIn(f: Luma, x0: number, y0: number, x1: number, y1: number): Edge[] {
  const { w, data } = f;
  const pts: (Edge & { m: number })[] = [];
  for (let y = Math.max(1, y0); y < Math.min(f.h - 1, y1); y++) {
    for (let x = Math.max(1, x0); x < Math.min(w - 1, x1); x++) {
      const i = y * w + x;
      const gx = data[i - w + 1] + 2 * data[i + 1] + data[i + w + 1] - data[i - w - 1] - 2 * data[i - 1] - data[i + w - 1];
      const gy = data[i + w - 1] + 2 * data[i + w] + data[i + w + 1] - data[i - w - 1] - 2 * data[i - w] - data[i - w + 1];
      const m = Math.abs(gx) + Math.abs(gy);
      if (m > 40) pts.push({ x: x + 0.5, y: y + 0.5, gx, gy, m });   // the pixel's centre
    }
  }
  if (!pts.length) return [];
  const ms = pts.map((p) => p.m).sort((a, b) => b - a);
  const cut = ms[Math.min(ms.length - 1, Math.floor(ms.length * EDGE_KEEP))];
  let keep = pts.filter((p) => p.m >= cut);
  if (keep.length > MAX_POINTS) { const s = keep.length / MAX_POINTS; keep = keep.filter((_, i) => Math.floor(i % s) === 0); }
  return keep;
}

const tolOf = (r: number) => Math.max(1.5, 0.025 * r);

function inliersOf(pts: readonly Edge[], c: { cx: number; cy: number; r: number }, widen = 1): Edge[] {
  const tol = tolOf(c.r) * widen;
  return pts.filter((p) => {
    const dx = p.x - c.cx, dy = p.y - c.cy, d = Math.hypot(dx, dy);
    if (Math.abs(d - c.r) > tol || d < 1e-6) return false;
    const g = Math.hypot(p.gx, p.gy);
    return Math.abs((p.gx * dx + p.gy * dy) / (g * d)) > 0.8;      // the brightness step runs along the radius
  });
}

function coverOf(pts: readonly Edge[], c: { cx: number; cy: number }): number {
  const bins = new Set<number>();
  for (const p of pts) bins.add(Math.floor(((Math.atan2(p.y - c.cy, p.x - c.cx) + Math.PI) / (2 * Math.PI)) * ANGLE_BINS) % ANGLE_BINS);
  return bins.size / ANGLE_BINS;
}

/** Kåsa's algebraic circle fit: x² + y² + Dx + Ey + F = 0 by least squares. */
export function fitCircle(pts: readonly { x: number; y: number }[]): { cx: number; cy: number; r: number } | null {
  if (pts.length < 3) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sz = 0, sxz = 0, syz = 0;
  const n = pts.length;
  for (const p of pts) {
    const z = p.x * p.x + p.y * p.y;
    sx += p.x; sy += p.y; sxx += p.x * p.x; syy += p.y * p.y; sxy += p.x * p.y; sz += z; sxz += p.x * z; syz += p.y * z;
  }
  // [sxx sxy sx; sxy syy sy; sx sy n] [D E F]ᵀ = −[sxz syz sz]ᵀ
  const m = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
  const v = [-sxz, -syz, -sz];
  const det3 = (a: number[][]) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const det = det3(m);
  if (Math.abs(det) < 1e-9) return null;
  const col = (k: number) => det3(m.map((row, i) => row.map((x, j) => (j === k ? v[i] : x))));
  const D = col(0) / det, E = col(1) / det, F = col(2) / det;
  const cx = -D / 2, cy = -E / 2, r2 = cx * cx + cy * cy - F;
  return r2 > 0 ? { cx, cy, r: Math.sqrt(r2) } : null;
}

/**
 * The plate near `seed` (px), with a radius in [rMin, rMax] px, or null. `maxShift` (px, default rMax) bounds how far
 * the centre may be from the seed.
 *
 * The centre is voted for (a gradient Hough transform): every strong edge votes along its own gradient line at every
 * distance in the radius range, both ways (the plate may be darker or lighter than what is behind it). A circle's rim
 * piles its votes on the centre; a straight edge spreads them along a line. Then the radius is the peak of the edge
 * distances from that centre (radial edges only), and an algebraic fit on the rim refines both.
 */
export function detectPlate(f: Luma, seed: { x: number; y: number }, rMin: number, rMax: number, maxShift = rMax): PlateFit | null {
  const half = Math.ceil(rMax + maxShift + 3);
  const x0 = Math.floor(seed.x - half), y0 = Math.floor(seed.y - half), W = 2 * half + 1;
  const pts = edgesIn(f, x0, y0, x0 + W, y0 + W);
  if (pts.length < 12) return null;
  const acc = new Float32Array(W * W);
  const lo = Math.max(1, Math.floor(rMin)), hi = Math.ceil(rMax);
  for (const p of pts) {
    const g = Math.hypot(p.gx, p.gy);
    const ux = p.gx / g, uy = p.gy / g;
    for (let d = lo; d <= hi; d++) {
      for (const sgn of [1, -1]) {
        const ax = Math.round(p.x + sgn * ux * d) - x0, ay = Math.round(p.y + sgn * uy * d) - y0;
        if (ax >= 0 && ay >= 0 && ax < W && ay < W) acc[ay * W + ax] += 1;
      }
    }
  }
  // the best 3×3 sum within maxShift of the seed
  let bx = -1, by = -1, bv = 0;
  const sx = seed.x - x0, sy = seed.y - y0;
  for (let y = 1; y < W - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (Math.hypot(x - sx, y - sy) > maxShift) continue;
      let v = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) v += acc[(y + dy) * W + x + dx];
      if (v > bv) { bv = v; bx = x; by = y; }
    }
  }
  if (bx < 0) return null;
  const cx0 = bx + x0, cy0 = by + y0;
  // the radius: the most common distance of the radial edges
  const hist = new Float32Array(hi + 2);
  for (const p of pts) {
    const dx = p.x - cx0, dy = p.y - cy0, d = Math.hypot(dx, dy);
    if (d < lo || d > hi) continue;
    const g = Math.hypot(p.gx, p.gy);
    if (Math.abs((p.gx * dx + p.gy * dy) / (g * d)) > 0.8) hist[Math.round(d)] += 1;
  }
  let br = 0, bh = 0;
  for (let r = lo; r <= hi; r++) { const v = hist[r - 1] + hist[r] + (hist[r + 1] ?? 0); if (v > bh) { bh = v; br = r; } }
  if (!br) return null;
  let c = { cx: cx0, cy: cy0, r: br };
  for (let pass = 0; pass < 3; pass++) {
    const fit = fitCircle(inliersOf(pts, { ...c, r: c.r }, pass === 0 ? 2.5 : 1));
    if (!fit || fit.r < rMin * 0.95 || fit.r > rMax * 1.05) break;
    c = fit;
  }
  const ins = inliersOf(pts, c);
  const cover = coverOf(ins, c);
  // a rim is a near-continuous line of edges: at least MIN_DENSITY edge points per pixel of the arc it shows
  if (cover < MIN_COVER || ins.length < MIN_DENSITY * 2 * Math.PI * c.r * cover) return null;
  return { cx: c.cx, cy: c.cy, r: c.r, inliers: ins.length, cover };
}

/**
 * Frame to frame: seeds from the last plate when it is recent, else from the wrists; the radius held near the last one.
 * Outputs a PlateObs in IMAGE HEIGHTS (px ÷ the frame's height), the unit lib/vbt/track.ts reads.
 */
export class PlateTracker {
  private last: { cx: number; cy: number; r: number; t: number } | null = null;

  /** (new) A plate this recent (ms) seeds the next search and bounds its radius to ±RADIUS_HOLD. */
  static readonly HOLD_MS = 250;
  static readonly RADIUS_HOLD = 0.15;

  /**
   * `wrist` and `rRange` in image heights (the caller's pose-based guess of where the plate is and how big it can be).
   */
  push(t: number, f: Luma, wrist: { x: number; y: number } | null, rRange: { min: number; max: number }): PlateObs | null {
    const H = f.h;
    const recent = this.last && t - this.last.t <= PlateTracker.HOLD_MS ? this.last : null;
    const seed = recent ? { x: recent.cx, y: recent.cy } : wrist ? { x: wrist.x * H, y: wrist.y * H } : null;
    if (!seed) return null;
    const rMin = recent ? recent.r * (1 - PlateTracker.RADIUS_HOLD) : rRange.min * H;
    const rMax = recent ? recent.r * (1 + PlateTracker.RADIUS_HOLD) : rRange.max * H;
    const shift = recent ? Math.max(8, recent.r * 0.6) : rMax;
    const fit = detectPlate(f, seed, rMin, rMax, shift);
    if (!fit) { if (!recent) this.last = null; return null; }
    this.last = { cx: fit.cx, cy: fit.cy, r: fit.r, t };
    return { cx: fit.cx / H, cy: fit.cy / H, r: fit.r / H };
  }

  reset(): void { this.last = null; }
}

/** Draw a synthetic side-on frame with a plate (tests and the rig): a dark bumper with a light hub on a lit gym. */
export function drawPlateFrame(w: number, h: number, plate: { cx: number; cy: number; r: number } | null, o: { seed?: number; noise?: number; clutter?: boolean } = {}): Luma {
  const R = rng(o.seed ?? 3);
  const data = new Uint8Array(w * h);
  const noise = o.noise ?? 6;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 150 + 40 * (y / h) - 20 * (x / w);                       // a lit wall, darker to one side
      if (o.clutter) {
        if (x > w * 0.72 && x < w * 0.76) v = 60;                        // a rack upright
        if (y > h * 0.55 && x > w * 0.3 && x < w * 0.42) v = 95;         // the lifter's legs, behind the plate
      }
      if (plate) {
        const d = Math.hypot(x + 0.5 - plate.cx, y + 0.5 - plate.cy);
        // anti-aliased rim: a dark bumper (35), a lighter steel hub (170) at a quarter of the radius
        const a = Math.min(1, Math.max(0, plate.r - d + 0.5));
        const hub = Math.min(1, Math.max(0, plate.r * 0.22 - d + 0.5));
        v = v * (1 - a) + 35 * a;
        v = v * (1 - hub) + 170 * hub;
      }
      data[y * w + x] = Math.max(0, Math.min(255, Math.round(v + R.n() * noise)));
    }
  }
  return { w, h, data };
}
