// The SURFACE MAP: the body's regions and chart rasterised into a mesh's own UV space (IMPROVE (2026-10-06),
// CREATOR-PLAN phase 3). Pure maths over typed arrays.
//
// Every texel of the paint texture gets: a LABEL (which atom of bodyChart.ts it is, 0 = off the mesh), and its CHART
// position in that atom's group (the angle around the group's axis and t along it). The compositor then paints in
// metres on the body by reading these per texel, so a pattern runs straight across a UV seam: the texels either side of
// a seam sit at the same chart position because the vertices they come from do.
//
// HOW A TEXEL IS LABELLED. Each triangle is filled in UV space with a top-left fill rule (a texel centre on a shared
// edge belongs to exactly one triangle, so neighbouring triangles neither double up nor leave a crack). Inside it, the
// three vertices' atom weights are interpolated and the texel takes the strongest atom, so a region boundary runs through
// the middle of a triangle where the weights cross, not along its edges. The angle is unwrapped across the triangle
// before it is interpolated (a triangle straddling the back's ±π line would otherwise smear through the front).
//
// PADDING. A texture sampled bilinearly and through mipmaps reads a few texels past the edge of every UV island. Those
// texels belong to no triangle, so they are filled from their nearest labelled neighbour (`dilate` texels deep): paint
// reaches past every island's edge and a coloured suit never shows a hairline of skin along a seam.
//
// TILES. The map is cut into TILE×TILE tiles, each with the set of labels in it and the range of chart positions it
// covers, so the compositor can skip every tile a layer cannot touch (a chest stamp redraws a handful of tiles, not the
// whole body).

import { ATOM_COUNT as ATOM_COUNT_, ATOM_GROUP as ATOM_GROUP_, GROUP_COUNT as GROUP_COUNT_, type Classified } from './bodyChart';

// Module-local copies for the hot loops: a transpiled import is a property getter on every read (measured 2026-10-06:
// the getters were a third of the raster's time under tsx/vitest).
const ATOM_COUNT = ATOM_COUNT_;
const GROUP_COUNT = GROUP_COUNT_;
const ATOM_GROUP = Uint8Array.from(ATOM_GROUP_);

/** Angle quantisation: Int16 over (−π, π]. */
export const ANG_Q = 32767 / Math.PI;
/** t quantisation: Int16 metres × 4096 (±8 m, 0.24 mm steps). */
export const T_Q = 4096;
export const TILE = 16;

export interface SurfaceMap {
  size: number;
  /** atom index + 1 per texel; 0 = off the mesh */
  label: Uint8Array;
  /** the texel's angle in its atom's group, × ANG_Q (front origin) */
  ang: Int16Array;
  /** the texel's t in its atom's group, × T_Q */
  tt: Int16Array;
  /** texels a triangle covered (the rest of the labelled texels are padding) */
  covered: Uint8Array;
  tiles: Tiles;
  /** the paint's size on the body: metres per texel (mean over the mesh), for antialiasing */
  metresPerTexel: number;
  /** measured while rasterising: texels two triangles of DIFFERENT atoms both claimed (overlapping UVs) */
  overlaps: number;
}

export interface Tiles {
  /** tiles per side */
  n: number;
  /** bit (label) set per tile */
  labels: Uint32Array;
  /** the smallest arc (front-origin angle) covering every texel's angle in the tile: start and span (rad) */
  angLo: Float32Array; angSpan: Float32Array;
  tLo: Float32Array; tHi: Float32Array;
}

export interface RasterInput {
  /** UVs, 2 per vertex, in the texture's own orientation (row = v × size) */
  uv: ArrayLike<number>;
  indices: ArrayLike<number>;
  /** rest positions (m), for the paint's scale on the body */
  P: ArrayLike<number>;
  cls: Classified;
}

const TWO_PI = Math.PI * 2;
const wrap = (a: number): number => a - TWO_PI * Math.floor((a + Math.PI) / TWO_PI);

/** Rasterise a classified mesh into a size×size surface map, all at once (tests, probes). */
export function rasteriseSurface(input: RasterInput, size: number, dilate?: number): SurfaceMap {
  const it = rasteriseSteps(input, size, dilate);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}

/** Triangles rasterised between two yields of rasteriseSteps (a few ms of work on a phone). */
export const RASTER_CHUNK = 1500;

/**
 * The same, as steps: it yields every RASTER_CHUNK triangles and between the padding passes, so a caller can spread a
 * first build over frames (measured 2026-10-06 on the kit body: ~0.3 s at 1024 and ~1.2 s at 2048 on a shared desktop
 * CPU, too long to block one frame). `dilate` defaults to size/256 texels (4 at 1024).
 */
export function* rasteriseSteps(input: RasterInput, size: number, dilate = Math.max(2, Math.round(size / 256))): Generator<void, SurfaceMap, void> {
  const { uv, indices, cls, P } = input;
  const N = size * size;
  const label = new Uint8Array(N);
  const ang = new Int16Array(N);
  const tt = new Int16Array(N);
  const covered = new Uint8Array(N);
  let overlaps = 0;
  let area3 = 0;
  const cand = new Int32Array(ATOM_COUNT);
  const aw = cls.atomW;
  for (let f = 0; f + 2 < indices.length; f += 3) {
    if (f && f % (RASTER_CHUNK * 3) === 0) yield;
    const i0 = indices[f], i1 = indices[f + 1], i2 = indices[f + 2];
    const x0 = uv[i0 * 2] * size, y0 = uv[i0 * 2 + 1] * size;
    const x1 = uv[i1 * 2] * size, y1 = uv[i1 * 2 + 1] * size;
    const x2 = uv[i2 * 2] * size, y2 = uv[i2 * 2 + 1] * size;
    // 3D and UV areas, for the metres-per-texel scale
    {
      const ax = P[i1 * 3] - P[i0 * 3], ay = P[i1 * 3 + 1] - P[i0 * 3 + 1], az = P[i1 * 3 + 2] - P[i0 * 3 + 2];
      const bx = P[i2 * 3] - P[i0 * 3], by = P[i2 * 3 + 1] - P[i0 * 3 + 1], bz = P[i2 * 3 + 2] - P[i0 * 3 + 2];
      area3 += 0.5 * Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
    }
    let area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-12) continue;
    // orient counter-clockwise in texel space so the edge functions are positive inside
    let ax0 = x0, ay0 = y0, ax1 = x1, ay1 = y1, ax2 = x2, ay2 = y2, v0 = i0, v1 = i1, v2 = i2;
    if (area < 0) { ax1 = x2; ay1 = y2; ax2 = x1; ay2 = y1; v1 = i2; v2 = i1; area = -area; }
    // the atoms any corner carries
    let nc = 0;
    for (let a = 0; a < ATOM_COUNT; a++) if (aw[v0 * ATOM_COUNT + a] > 0 || aw[v1 * ATOM_COUNT + a] > 0 || aw[v2 * ATOM_COUNT + a] > 0) cand[nc++] = a;
    const minX = Math.max(0, Math.floor(Math.min(ax0, ax1, ax2))), maxX = Math.min(size - 1, Math.ceil(Math.max(ax0, ax1, ax2)));
    const minY = Math.max(0, Math.floor(Math.min(ay0, ay1, ay2))), maxY = Math.min(size - 1, Math.ceil(Math.max(ay0, ay1, ay2)));
    // edge e_k runs opposite vertex k. A texel centre exactly on an edge belongs to the triangle only when the edge
    // points one agreed way (y decreasing, or flat and x increasing): the neighbour sharing that edge sees it reversed,
    // so exactly one of the two claims it — no double-counting and no crack along a shared edge.
    const e0x = ax2 - ax1, e0y = ay2 - ay1, e1x = ax0 - ax2, e1y = ay0 - ay2, e2x = ax1 - ax0, e2y = ay1 - ay0;
    const own0 = e0y < 0 || (e0y === 0 && e0x > 0), own1 = e1y < 0 || (e1y === 0 && e1x > 0), own2 = e2y < 0 || (e2y === 0 && e2x > 0);
    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const w0 = e0x * (py - ay1) - e0y * (px - ax1);
        const w1 = e1x * (py - ay2) - e1y * (px - ax2);
        const w2 = e2x * (py - ay0) - e2y * (px - ax0);
        if (!(w0 > 0 || (w0 === 0 && own0)) || !(w1 > 0 || (w1 === 0 && own1)) || !(w2 > 0 || (w2 === 0 && own2))) continue;
        const l0 = w0 / area, l1 = w1 / area, l2 = 1 - l0 - l1;
        let best = -1, bw = 0;
        for (let k = 0; k < nc; k++) {
          const a = cand[k];
          const w = l0 * aw[v0 * ATOM_COUNT + a] + l1 * aw[v1 * ATOM_COUNT + a] + l2 * aw[v2 * ATOM_COUNT + a];
          if (w > bw) { bw = w; best = a; }
        }
        const i = y * size + x;
        if (best < 0) continue;
        if (covered[i] && label[i] !== best + 1) overlaps++;
        const g = ATOM_GROUP[best];
        const a0 = cls.ang[v0 * GROUP_COUNT + g];
        let a1 = cls.ang[v1 * GROUP_COUNT + g] - a0, a2 = cls.ang[v2 * GROUP_COUNT + g] - a0;
        a1 = wrap(a1); a2 = wrap(a2);
        const A = wrap(a0 + l1 * a1 + l2 * a2);
        const T = l0 * cls.t[v0 * GROUP_COUNT + g] + l1 * cls.t[v1 * GROUP_COUNT + g] + l2 * cls.t[v2 * GROUP_COUNT + g];
        label[i] = best + 1;
        ang[i] = Math.round(A * ANG_Q);
        tt[i] = Math.max(-32768, Math.min(32767, Math.round(T * T_Q)));
        covered[i] = 1;
      }
    }
  }
  yield;
  yield* dilateMap(label, ang, tt, size, dilate);
  const coveredCount = covered.reduce((n, c) => n + c, 0);
  const metresPerTexel = coveredCount ? Math.sqrt(area3 / coveredCount) : 0.002;
  yield;
  return { size, label, ang, tt, covered, tiles: buildTiles(label, ang, tt, size), metresPerTexel, overlaps };
}

/** Grow labelled texels into unlabelled neighbours, `steps` texels deep (breadth first; straight neighbours first, so a
 *  padded texel copies the texel it borders rather than a diagonal one). Each texel is queued at most once. */
function* dilateMap(label: Uint8Array, ang: Int16Array, tt: Int16Array, size: number, steps: number): Generator<void, void, void> {
  const N = size * size;
  const queued = new Uint8Array(N);
  let frontier = new Int32Array(1024), count = 0;
  const push = (j: number) => {
    if (label[j] || queued[j]) return;
    queued[j] = 1;
    if (count === frontier.length) { const g = new Int32Array(count * 2); g.set(frontier); frontier = g; }
    frontier[count++] = j;
  };
  const eachNeighbour = (i: number, visit: (j: number) => void) => {
    const x = i % size, y = (i - x) / size;
    for (let k = 0; k < 8; k++) {
      const X = x + NEIGHBOURS[k][0], Y = y + NEIGHBOURS[k][1];
      if (X >= 0 && Y >= 0 && X < size && Y < size) visit(Y * size + X);
    }
  };
  for (let i = 0; i < N; i++) if (label[i]) eachNeighbour(i, push);
  for (let s = 0; s < steps && count; s++) {
    yield;
    const cur = frontier.slice(0, count);
    const from = new Int32Array(cur.length).fill(-1);
    for (let q = 0; q < cur.length; q++) {
      const x = cur[q] % size, y = (cur[q] - x) / size;
      for (let k = 0; k < 8; k++) {
        const X = x + NEIGHBOURS[k][0], Y = y + NEIGHBOURS[k][1];
        if (X < 0 || Y < 0 || X >= size || Y >= size) continue;
        const j = Y * size + X;
        if (label[j]) { from[q] = j; break; }
      }
    }
    for (let q = 0; q < cur.length; q++) {
      const i = cur[q], f = from[q];
      if (f >= 0) { label[i] = label[f]; ang[i] = ang[f]; tt[i] = tt[f]; }
    }
    count = 0;
    for (let q = 0; q < cur.length; q++) if (from[q] >= 0) eachNeighbour(cur[q], push);
  }
}
const NEIGHBOURS: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

export function buildTiles(label: Uint8Array, ang: Int16Array, tt: Int16Array, size: number): Tiles {
  const n = Math.ceil(size / TILE);
  const labels = new Uint32Array(n * n);
  const angLo = new Float32Array(n * n), angSpan = new Float32Array(n * n);
  const tLo = new Float32Array(n * n).fill(Infinity), tHi = new Float32Array(n * n).fill(-Infinity);
  const lo1 = new Float32Array(n * n).fill(Infinity), hi1 = new Float32Array(n * n).fill(-Infinity);   // in (−π, π]
  const lo2 = new Float32Array(n * n).fill(Infinity), hi2 = new Float32Array(n * n).fill(-Infinity);   // in [0, 2π)
  for (let y = 0; y < size; y++) {
    const ty = (y / TILE) | 0;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const l = label[i];
      if (!l) continue;
      const k = ty * n + ((x / TILE) | 0);
      labels[k] |= 1 << l;
      const a = ang[i] / ANG_Q, t = tt[i] / T_Q;
      if (a < lo1[k]) lo1[k] = a; if (a > hi1[k]) hi1[k] = a;
      const b = a < 0 ? a + TWO_PI : a;
      if (b < lo2[k]) lo2[k] = b; if (b > hi2[k]) hi2[k] = b;
      if (t < tLo[k]) tLo[k] = t; if (t > tHi[k]) tHi[k] = t;
    }
  }
  for (let k = 0; k < n * n; k++) {
    if (!labels[k]) continue;
    const s1 = hi1[k] - lo1[k], s2 = hi2[k] - lo2[k];
    if (s1 <= s2) { angLo[k] = lo1[k]; angSpan[k] = s1; } else { angLo[k] = lo2[k]; angSpan[k] = s2; }
  }
  return { n, labels, angLo, angSpan, tLo, tHi };
}

/** Do two arcs on the circle overlap? Each is a start angle and a span (rad, span ≥ 0; ≥ 2π is the whole circle). */
export function arcsOverlap(lo1: number, span1: number, lo2: number, span2: number): boolean {
  if (span1 >= TWO_PI - 1e-9 || span2 >= TWO_PI - 1e-9) return true;
  const d = ((lo2 - lo1) % TWO_PI + TWO_PI) % TWO_PI;   // where arc 2 starts, measured from arc 1's start
  return d <= span1 || d + span2 >= TWO_PI;
}
