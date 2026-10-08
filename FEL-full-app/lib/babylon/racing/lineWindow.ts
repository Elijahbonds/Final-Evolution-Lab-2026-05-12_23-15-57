// LINE WINDOW — `locate` near where the racer was last frame (IMPROVE 2026-10-06, aeroaces #13).
//
// aeroCircuits.locate and racingLine.locate scan EVERY segment of a ~1.5 km line sampled every 4 m (~400 segments)
// and allocate two Vector3s per call. Aero Aces called it for the player several times a frame and twice per rival per
// frame inside the rival driver — about twenty full scans a frame for a racer that moved a metre since the last one.
//
// A racer is near where it was. So this searches a window of segments round the last index, and keeps that answer only
// when it is PROVABLY the full scan's: the line's CLEARANCE at that segment (how close any far part of the lap comes to
// it, measured once per line) is more than twice the racer's distance from the line, so no segment outside the window
// can be nearer (triangle inequality). Anything else — a racer far off the line, a hairpin or a city leg that passes
// close to its own lap, an answer drifting toward the window's edge, a respawn, no hint yet — is a full scan. The
// result is written into a caller-owned object, so a frame's locate allocates nothing.
//
// It returns exactly what the full scan returns: lineWindow.test flies every circuit's corridor edge to edge and
// compares segment for segment.
// Pure: Vector3 and numbers. Works on any line with pts / cum / length (the aero CircuitLine and a looped RacingLine).

import { Vector3 } from '@babylonjs/core';

export interface LoopLine { pts: readonly Vector3[]; cum: readonly number[]; length: number }

export interface LineFix {
  dist: number;
  lateral: number;
  /** Segment index — the hint for the next call. */
  i: number;
  tangent: Vector3;
  point: Vector3;
}

export function newLineFix(): LineFix {
  return { dist: 0, lateral: 0, i: -1, tangent: new Vector3(0, 0, 1), point: new Vector3() };
}

/** Segments either side of the hint that are searched. 24 × 4 m ≈ 96 m: far more than a frame's flight. */
export const LINE_WINDOW = 24;
/** The clearance is measured against points more than this many samples away along the lap; the window's answer must
 *  sit within LINE_WINDOW − CLEAR_SKIP − 1 of the hint, so every segment outside the window is one the clearance saw. */
const CLEAR_SKIP = 12;

/** Per line, once: for each segment, the distance to the nearest point of the lap more than CLEAR_SKIP samples away,
 *  less the slack for a point anywhere on the two segments (1.5 × the longest segment). */
const clearances = new WeakMap<readonly Vector3[], Float64Array>();
function clearanceOf(pts: readonly Vector3[]): Float64Array {
  let c = clearances.get(pts);
  if (c) return c;
  const n = pts.length;
  let segMax = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; segMax = Math.max(segMax, Math.hypot(b.x - a.x, b.z - a.z)); }
  const near = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let m = Infinity;
    for (let j = 0; j < n; j++) {
      const di = Math.abs(i - j), ring = Math.min(di, n - di);
      if (ring <= CLEAR_SKIP) continue;
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
      if (d < m) m = d;
    }
    near[i] = m;
  }
  c = new Float64Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.min(near[i], near[(i + 1) % n]) - 1.5 * segMax;
  clearances.set(pts, c);
  return c;
}

/** The segment parameter of the last nearestOn (a scratch, so the scan allocates nothing). */
let lastT = 0;
function nearestOn(pts: readonly Vector3[], i: number, x: number, z: number): number {
  const a = pts[i], b = pts[(i + 1) % pts.length];
  const abx = b.x - a.x, abz = b.z - a.z; const l2 = abx * abx + abz * abz;
  const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / l2));
  const dx = a.x + abx * t - x, dz = a.z + abz * t - z;
  lastT = t;
  return dx * dx + dz * dz;
}

/** How many fixes the window answered and how many fell back to the full scan (for the test's hit-rate pin). */
export const lineWindowStats = { windowed: 0, full: 0 };

/**
 * Where on the looped line (x, z) is nearest, searched round `out.i` (the last answer). Writes and returns `out`.
 * `out.i < 0` (a fresh fix), or an answer the clearance cannot prove (see the header), scans every segment.
 */
export function locateNear(line: LoopLine, x: number, z: number, out: LineFix, window = LINE_WINDOW): LineFix {
  const { pts, cum, length } = line;
  const n = pts.length;
  let best = Infinity, bi = 0, bt = 0;
  const full = out.i < 0 || out.i >= n || n <= window * 2 + 3 || window <= CLEAR_SKIP + 1;
  if (!full) {
    let off = 0;
    for (let k = -window; k <= window; k++) {
      const i = (((out.i + k) % n) + n) % n;
      const d2 = nearestOn(pts, i, x, z);
      if (d2 < best) { best = d2; bi = i; bt = lastT; off = Math.abs(k); }
    }
    // keep it only if no segment outside the window can be nearer (see the header)
    const clear = clearanceOf(pts)[bi];
    if (off > window - CLEAR_SKIP - 1 || !(clear > 0) || 4 * best >= clear * clear) best = Infinity;
  }
  if (best === Infinity) {
    lineWindowStats.full++;
    for (let i = 0; i < n; i++) {
      const d2 = nearestOn(pts, i, x, z);
      if (d2 < best) { best = d2; bi = i; bt = lastT; }
    }
  } else lineWindowStats.windowed++;
  const a = pts[bi], b = pts[(bi + 1) % n];
  const seg = (bi + 1 < n ? cum[bi + 1] : length) - cum[bi];
  out.tangent.set(b.x - a.x, 0, b.z - a.z).normalize();
  out.point.set(a.x + (b.x - a.x) * bt, a.y + (b.y - a.y) * bt, a.z + (b.z - a.z) * bt);
  out.lateral = (x - out.point.x) * out.tangent.z - (z - out.point.z) * out.tangent.x;
  out.dist = cum[bi] + seg * bt;
  out.i = bi;
  return out;
}
