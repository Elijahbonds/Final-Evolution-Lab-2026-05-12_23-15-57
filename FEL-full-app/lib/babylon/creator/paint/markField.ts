// A player-drawn stamp as a SIGNED DISTANCE, so it draws like every other stamp (IMPROVE (2026-10-06), CREATOR-PLAN
// phase 4c; the mark itself is lib/creator/look/marks.ts).
//
// stamps.ts gives each library shape as a signed distance in its unit square (x right, y up, [-1, 1], negative inside),
// which is what lets the compositor antialias the edge and draw an outline of any width. A mark is 128² one-bit cells, so
// it is turned into the same thing once: an exact Euclidean distance transform (two passes propagating each cell's
// nearest boundary point, 8SSEDT) gives every cell's distance to the ink's edge, and `sampleMark` reads it bilinearly in
// the unit square. The jaggies of the cells are softened by the bilinear read and the compositor's antialias; a mark
// drawn at the brush sizes the pad offers reads as a drawing, not as pixels, at the stamp sizes the sliders allow.
//
// Built once per mark text and shared (a small cache: a doc carries at most two marks, an editor drag reuses them).

import { MARK_SIZE, decodeMark } from '../../../creator/look/marks';

const N = MARK_SIZE;
const BIG = 1e9;

/** Distance (in cells) from every cell to the nearest cell where `inside(cell)` is true, exact Euclidean (8SSEDT). */
function edt(inside: (i: number) => boolean): Float32Array {
  const dx = new Float32Array(N * N), dy = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) { if (inside(i)) { dx[i] = 0; dy[i] = 0; } else { dx[i] = BIG; dy[i] = BIG; } }
  const d2 = (i: number) => dx[i] * dx[i] + dy[i] * dy[i];
  const test = (i: number, x: number, y: number, ox: number, oy: number) => {
    const nx = x + ox, ny = y + oy;
    if (nx < 0 || ny < 0 || nx >= N || ny >= N) return;
    const j = ny * N + nx;
    if (dx[j] >= BIG) return;
    const cx = dx[j] + Math.abs(ox), cy = dy[j] + Math.abs(oy);
    if (cx * cx + cy * cy < d2(i)) { dx[i] = cx; dy[i] = cy; }
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) { const i = y * N + x; test(i, x, y, -1, 0); test(i, x, y, 0, -1); test(i, x, y, -1, -1); test(i, x, y, 1, -1); }
    for (let x = N - 1; x >= 0; x--) test(y * N + x, x, y, 1, 0);
  }
  for (let y = N - 1; y >= 0; y--) {
    for (let x = N - 1; x >= 0; x--) { const i = y * N + x; test(i, x, y, 1, 0); test(i, x, y, 0, 1); test(i, x, y, 1, 1); test(i, x, y, -1, 1); }
    for (let x = 0; x < N; x++) test(y * N + x, x, y, -1, 0);
  }
  const out = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) out[i] = dx[i] >= BIG ? BIG : Math.sqrt(d2(i));
  return out;
}

/** The mark's signed distance per cell, in UNIT-SQUARE units (2 / 128 per cell), negative on ink; null if invalid. */
export function markField(data: string): Float32Array | null {
  const hit = cache.get(data);
  if (hit) { cache.delete(data); cache.set(data, hit); return hit; }
  const cells = decodeMark(data);
  if (!cells) return null;
  const toInk = edt((i) => cells[i] === 1);
  const toEmpty = edt((i) => cells[i] === 0);
  const f = new Float32Array(N * N);
  const unit = 2 / N;
  // the edge sits half a cell from a cell centre on either side of it
  for (let i = 0; i < N * N; i++) f[i] = (cells[i] ? -(Math.min(toEmpty[i], N) - 0.5) : Math.min(toInk[i], N) - 0.5) * unit;
  cache.set(data, f);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return f;
}
const CACHE_MAX = 8;
const cache = new Map<string, Float32Array>();

/** The mark's signed distance at (x, y) in its unit square (x right, y up, [-1, 1]); outside the square, the distance
 *  to the square added on (so an outline never wraps round the pad's edge). */
export function sampleMark(f: Float32Array, x: number, y: number): number {
  const cx = Math.min(1, Math.max(-1, x)), cy = Math.min(1, Math.max(-1, y));
  const out = Math.hypot(x - cx, y - cy);
  // cell centres sit at ((c + 0.5) / N) * 2 − 1; row 0 is the top (y = 1)
  const gx = ((cx + 1) / 2) * N - 0.5, gy = ((1 - cy) / 2) * N - 0.5;
  const x0 = Math.max(0, Math.min(N - 1, Math.floor(gx))), y0 = Math.max(0, Math.min(N - 1, Math.floor(gy)));
  const x1 = Math.min(N - 1, x0 + 1), y1 = Math.min(N - 1, y0 + 1);
  const tx = Math.min(1, Math.max(0, gx - x0)), ty = Math.min(1, Math.max(0, gy - y0));
  const a = f[y0 * N + x0] + (f[y0 * N + x1] - f[y0 * N + x0]) * tx;
  const b = f[y1 * N + x0] + (f[y1 * N + x1] - f[y1 * N + x0]) * tx;
  return a + (b - a) * ty + out;
}
