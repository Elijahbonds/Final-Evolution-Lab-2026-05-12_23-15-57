/**
 * Rail maths for the Adventure (lane A1; docs/ADVENTURE-PLAN.md "rails/railMath.ts").
 *
 * A `RailSegment` (contracts.ts) is a list of points, read as a polyline or, when `smooth`, as a Catmull-Rom spline
 * through them. Every rail question the grind, the catch and the world builders ask comes down to three answers:
 * how long is it, where is the point `s` metres along it (and which way does it run there), and where on it is the
 * point nearest to these feet. This file answers them once, on a path baked when the network loads, so a tick never
 * re-walks the spline.
 *
 * Pure: plain numbers and typed arrays. Per-tick calls write into caller-owned objects (no allocation).
 */

import type { RailNetwork, RailSegment, Vec3 } from '../contracts';
import { polylineLength } from '../contracts';
import { wrapAngle, yawOf } from '../movement/math';

/** Spline pieces per control span for a `smooth` rail. 8 keeps a 90° bend of radius 4 m under 2 cm of chord error. */
export const SMOOTH_SUBDIV = 8;

/** A rail baked for sampling: dense points, the arc length at each, and a bounding box for a cheap first reject. */
export interface RailPath {
  id: string;
  seg: RailSegment;
  xs: Float64Array; ys: Float64Array; zs: Float64Array;
  /** cum[i] = arc length from the start to sample i. cum[0] = 0, cum[n−1] = length. */
  cum: Float64Array;
  length: number;
  min: Vec3; max: Vec3;
}

/** Uniform Catmull-Rom between p1 and p2 with neighbours p0 and p3, at t in 0..1, one axis. */
function cr(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Bake a segment. A polyline keeps its own points; a smooth rail is subdivided through them (ends mirrored). */
export function buildRailPath(seg: RailSegment, subdiv = SMOOTH_SUBDIV): RailPath {
  const P = seg.points;
  const n = P.length;
  let px: number[], py: number[], pz: number[];
  if (seg.smooth && n >= 3) {
    px = []; py = []; pz = [];
    const at = (i: number): Vec3 => {
      if (i < 0) return { x: 2 * P[0].x - P[1].x, y: 2 * P[0].y - P[1].y, z: 2 * P[0].z - P[1].z };
      if (i >= n) return { x: 2 * P[n - 1].x - P[n - 2].x, y: 2 * P[n - 1].y - P[n - 2].y, z: 2 * P[n - 1].z - P[n - 2].z };
      return P[i];
    };
    for (let i = 0; i < n - 1; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      for (let k = 0; k < subdiv; k++) {
        const t = k / subdiv;
        px.push(cr(p0.x, p1.x, p2.x, p3.x, t)); py.push(cr(p0.y, p1.y, p2.y, p3.y, t)); pz.push(cr(p0.z, p1.z, p2.z, p3.z, t));
      }
    }
    px.push(P[n - 1].x); py.push(P[n - 1].y); pz.push(P[n - 1].z);
  } else {
    px = P.map((p) => p.x); py = P.map((p) => p.y); pz = P.map((p) => p.z);
  }
  const m = px.length;
  const xs = Float64Array.from(px), ys = Float64Array.from(py), zs = Float64Array.from(pz);
  const cum = new Float64Array(m);
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let i = 0; i < m; i++) {
    if (i > 0) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1], zs[i] - zs[i - 1]);
    min.x = Math.min(min.x, xs[i]); min.y = Math.min(min.y, ys[i]); min.z = Math.min(min.z, zs[i]);
    max.x = Math.max(max.x, xs[i]); max.y = Math.max(max.y, ys[i]); max.z = Math.max(max.z, zs[i]);
  }
  return { id: seg.id, seg, xs, ys, zs, cum, length: m > 0 ? cum[m - 1] : 0, min, max };
}

/** The span index i such that cum[i] ≤ s ≤ cum[i+1] (binary search; s clamped to the rail). */
export function spanAt(path: RailPath, s: number): number {
  const c = path.cum;
  let lo = 0, hi = c.length - 2;
  if (hi <= 0) return 0;
  if (s <= 0) return 0;
  if (s >= path.length) return hi;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (c[mid] <= s) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/**
 * The point `s` metres along the rail (clamped to it) into `outPos`, and the unit tangent there, pointing toward
 * increasing `s`, into `outTan` when given. No allocation.
 */
export function sampleRail(path: RailPath, s: number, outPos: Vec3, outTan?: Vec3): Vec3 {
  const i = spanAt(path, s);
  const { xs, ys, zs, cum } = path;
  const j = Math.min(i + 1, xs.length - 1);
  const segLen = cum[j] - cum[i];
  const t = segLen > 1e-9 ? Math.max(0, Math.min(1, (s - cum[i]) / segLen)) : 0;
  outPos.x = xs[i] + (xs[j] - xs[i]) * t;
  outPos.y = ys[i] + (ys[j] - ys[i]) * t;
  outPos.z = zs[i] + (zs[j] - zs[i]) * t;
  if (outTan) {
    const inv = segLen > 1e-9 ? 1 / segLen : 0;
    outTan.x = (xs[j] - xs[i]) * inv; outTan.y = (ys[j] - ys[i]) * inv; outTan.z = (zs[j] - zs[i]) * inv;
  }
  return outPos;
}

/** Result of a nearest-point query. Reused by the caller across ticks. */
export interface RailNearest { s: number; d: number; point: Vec3; span: number }

export const railNearest = (): RailNearest => ({ s: 0, d: Infinity, point: { x: 0, y: 0, z: 0 }, span: 0 });

/** The point on the rail nearest `p`, written into `out`. */
export function nearestOnPath(path: RailPath, p: Vec3, out: RailNearest): RailNearest {
  const { xs, ys, zs, cum } = path;
  out.d = Infinity;
  for (let i = 0; i < xs.length - 1; i++) {
    const ax = xs[i], ay = ys[i], az = zs[i];
    const bx = xs[i + 1] - ax, by = ys[i + 1] - ay, bz = zs[i + 1] - az;
    const l2 = bx * bx + by * by + bz * bz;
    const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - ax) * bx + (p.y - ay) * by + (p.z - az) * bz) / l2));
    const qx = ax + bx * t, qy = ay + by * t, qz = az + bz * t;
    const d = Math.hypot(p.x - qx, p.y - qy, p.z - qz);
    if (d < out.d) {
      out.d = d; out.span = i;
      out.s = cum[i] + (cum[i + 1] - cum[i]) * t;
      out.point.x = qx; out.point.y = qy; out.point.z = qz;
    }
  }
  return out;
}

/** True when `p` is within `pad` metres of the rail's bounding box (the cheap reject before nearestOnPath). */
export function nearBox(path: RailPath, p: Vec3, pad: number): boolean {
  return p.x >= path.min.x - pad && p.x <= path.max.x + pad
    && p.y >= path.min.y - pad && p.y <= path.max.y + pad
    && p.z >= path.min.z - pad && p.z <= path.max.z + pad;
}

const scratchA: Vec3 = { x: 0, y: 0, z: 0 }, scratchB: Vec3 = { x: 0, y: 0, z: 0 };
const scratchP: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * How fast the rail turns under a rider going `dir` (+1 = toward increasing s), in radians of heading per metre,
 * measured flat (XZ) over ±`h` metres. Positive = the rail bends to the rider's RIGHT (yaw increases; contracts' yaw
 * is atan2(x, z) with +x on the right of +z). Zero on a straight, and on a vertical piece.
 */
export function turnPerMetre(path: RailPath, s: number, dir: 1 | -1, h = 1): number {
  const s0 = Math.max(0, s - h), s1 = Math.min(path.length, s + h);
  if (s1 - s0 < 1e-6) return 0;
  sampleRail(path, s0, scratchP, scratchA);
  sampleRail(path, s1, scratchP, scratchB);
  if (Math.hypot(scratchA.x, scratchA.z) < 1e-4 || Math.hypot(scratchB.x, scratchB.z) < 1e-4) return 0;
  const dyaw = wrapAngle(yawOf(scratchB.x, scratchB.z) - yawOf(scratchA.x, scratchA.z));
  return (dyaw / (s1 - s0)) * dir;
}

/** A network's paths, baked once and looked up by id. Rebuild when the network object changes. */
export interface RailIndex {
  net: RailNetwork;
  paths: RailPath[];
  byId: Map<string, RailPath>;
}

export function buildRailIndex(net: RailNetwork): RailIndex {
  const paths = net.segments.filter((s) => s.points.length >= 2).map((s) => buildRailPath(s));
  return { net, paths, byId: new Map(paths.map((p) => [p.id, p])) };
}

/** The polyline length the contract validates against, for a path's segment (equals `length` for a polyline). */
export const authoredLength = (path: RailPath): number => polylineLength(path.seg.points);
