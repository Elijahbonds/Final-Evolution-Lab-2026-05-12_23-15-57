// RACING LINE — the geometry every course is derived from.
//
// WHY THIS FILE EXISTS. The kart courses used to be a polyline through their checkpoints: VelocityKartMode says it
// outright, "the road is the polyline through the checkpoints, so the track and the gates can never disagree about
// where the course goes". That invariant is right and this file keeps it. What it cost was SHAPE — BOARDWALK LOOP had
// four gates, so its road was a quadrilateral with 212 m dead-straight legs, and no amount of scenery fixes a
// quadrilateral. Measured, the four courses were already circuit-sized (748-1046 m a lap, against ~1100-1200 m for a
// real kart circuit) and already 52-56 s a lap at gold, which is LONGER than the arcade racers they answer to. The
// deficit was never length. It was that a lap had four corners.
//
// So the line comes first and the checkpoints are derived from it, exactly the way racing/aeroCircuits.ts already does
// it for the air. A course authors 16-20 points; the lap gates, the road edges, the kerbs, the ramps and the scenery
// are all read off the same curve, so they still cannot disagree.
//
// CORNER RADIUS IS THE LOAD-BEARING MEASUREMENT. RaceCourse.ts documents, with evidence, that the starter kart holds
// at most a ~61 m corner (26 m/s top speed, 11 m/s^2 grip) and that the first boardwalk loop was scaled UP because
// every corner was tighter than that: a run with drifting DISABLED still logged 516 drift frames, so the drift was
// not a choice, and the choice is the whole mechanic. Adding corners is therefore the fastest way to destroy it by
// accident. `tightestCorner` exists so a course can declare the floor it means to respect and a test can hold it to
// that, which is the difference between ROOFTOP CIRCUIT's deliberate exception and a bug.
//
// Pure: Vector3 and numbers. No scene, no meshes.

import { Vector3 } from '@babylonjs/core';

export interface RacingLine {
  /** Densely sampled points along the curve. y is world height. */
  pts: Vector3[];
  /** cum[i] = metres along the line at pts[i], measured flat (x/z). */
  cum: number[];
  /** Total length. For a loop this includes the closing segment. */
  length: number;
  loop: boolean;
}

export interface LinePoint {
  pos: Vector3;
  /** Unit vector along travel, flat. */
  tangent: Vector3;
  /** Unit vector to the right of travel, flat. */
  right: Vector3;
}

/** Catmull-Rom on one axis. */
const catmull = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

const rightOf = (tangent: Vector3): Vector3 => new Vector3(tangent.z, 0, -tangent.x);

/**
 * Sample authored points into a dense line.
 *
 * `perSegment` is what buys back the shape: at 14 samples a 200 m leg becomes fourteen 14 m chords, which is fine
 * enough that a corner reads as a curve rather than a vertex, and cheap enough that the whole line is a few hundred
 * points rather than a mesh problem.
 */
export function sampleLine(
  authored: readonly [number, number, number][],
  opts: { loop: boolean; perSegment?: number } ,
): RacingLine {
  const { loop, perSegment = 14 } = opts;
  if (authored.length < 4) throw new Error(`a racing line needs at least 4 authored points, got ${authored.length}`);

  const n = authored.length;
  const at = (i: number): [number, number, number] => {
    if (loop) return authored[((i % n) + n) % n];
    return authored[Math.max(0, Math.min(n - 1, i))];
  };

  const pts: Vector3[] = [];
  const segs = loop ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let j = 0; j < perSegment; j++) {
      const t = j / perSegment;
      pts.push(new Vector3(
        catmull(p0[0], p1[0], p2[0], p3[0], t),
        catmull(p0[2], p1[2], p2[2], p3[2], t),   // authored order is x, z, y
        catmull(p0[1], p1[1], p2[1], p3[1], t),
      ));
    }
  }
  if (!loop) {
    const last = at(n - 1);
    pts.push(new Vector3(last[0], last[2], last[1]));
  }

  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  }
  const closing = loop
    ? Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z)
    : 0;
  return { pts, cum, length: cum[cum.length - 1] + closing, loop };
}

/** The point `dist` metres along the line. Wraps on a loop, clamps on a point-to-point. */
export function pointAlong(line: RacingLine, dist: number): LinePoint {
  const { pts, cum, length, loop } = line;
  const d = loop ? ((dist % length) + length) % length : Math.max(0, Math.min(length, dist));

  let lo = 0, hi = pts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid - 1; }

  const a = pts[lo];
  const b = loop ? pts[(lo + 1) % pts.length] : pts[Math.min(lo + 1, pts.length - 1)];
  const segEnd = lo + 1 < cum.length ? cum[lo + 1] : length;
  const seg = segEnd - cum[lo];
  const t = seg > 1e-6 ? (d - cum[lo]) / seg : 0;

  // AT THE END OF A POINT-TO-POINT LINE there is no next sample, so a == b and the direction is undefined. Fall
  // back to the last real segment rather than to a fixed axis: the finish checkpoint's facing is derived from this,
  // and a default of (0,0,1) made ALPINE DESCENT's finish gate face north no matter which way the course ran.
  let tangent = new Vector3(b.x - a.x, 0, b.z - a.z);
  if (tangent.length() <= 1e-6 && lo > 0) {
    const prev = pts[lo - 1];
    tangent = new Vector3(a.x - prev.x, 0, a.z - prev.z);
  }
  const tan = tangent.length() > 1e-6 ? tangent.normalize() : new Vector3(0, 0, 1);
  return {
    pos: new Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t),
    tangent: tan,
    right: rightOf(tan),
  };
}

/** Nearest place on the line: distance along, and sideways offset (+ = right of travel). */
export function locate(line: RacingLine, x: number, z: number): {
  dist: number; lateral: number; i: number; tangent: Vector3; point: Vector3;
} {
  const { pts, cum, length, loop } = line;
  const last = loop ? pts.length : pts.length - 1;
  let best = Infinity, bi = 0, bt = 0;
  for (let i = 0; i < last; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const abx = b.x - a.x, abz = b.z - a.z;
    const l2 = abx * abx + abz * abz;
    const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / l2));
    const dx = a.x + abx * t - x, dz = a.z + abz * t - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) { best = d2; bi = i; bt = t; }
  }
  const a = pts[bi], b = pts[(bi + 1) % pts.length];
  const segEnd = bi + 1 < cum.length ? cum[bi + 1] : length;
  const seg = segEnd - cum[bi];
  const tangent = new Vector3(b.x - a.x, 0, b.z - a.z).normalize();
  const point = new Vector3(a.x + (b.x - a.x) * bt, a.y + (b.y - a.y) * bt, a.z + (b.z - a.z) * bt);
  const lateral = (x - point.x) * tangent.z - (z - point.z) * tangent.x;
  return { dist: cum[bi] + seg * bt, lateral, i: bi, tangent, point };
}

/**
 * The corner radius at `dist`, in metres. Infinity on a straight.
 *
 * Measured over a WINDOW rather than between adjacent samples, and that matters: adjacent samples on a dense curve
 * are a few metres apart, where floating-point noise in the spline reads as a 3 m corner that no car ever
 * experiences. A ~12 m window is about what a kart at speed actually traverses while turning in, so it returns the
 * radius the DRIVER feels rather than the radius the polyline technically has.
 */
export function cornerRadiusAt(line: RacingLine, dist: number, window = 12): number {
  const a = pointAlong(line, dist - window).pos;
  const b = pointAlong(line, dist).pos;
  const c = pointAlong(line, dist + window).pos;

  // circumradius of the flat triangle: R = abc / 4A
  const ab = Math.hypot(b.x - a.x, b.z - a.z);
  const bc = Math.hypot(c.x - b.x, c.z - b.z);
  const ca = Math.hypot(a.x - c.x, a.z - c.z);
  const area2 = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z));
  if (area2 < 1e-6) return Infinity;
  return (ab * bc * ca) / (2 * area2);
}

/** The tightest corner on the line, and where it is. */
export function tightestCorner(line: RacingLine, step = 4, window = 12): { radius: number; dist: number } {
  let radius = Infinity, dist = 0;
  const span = line.loop ? line.length : Math.max(0, line.length - window);
  for (let d = line.loop ? 0 : window; d < span; d += step) {
    const r = cornerRadiusAt(line, d, window);
    if (r < radius) { radius = r; dist = d; }
  }
  return { radius, dist };
}

/**
 * The speed a corner of this radius can be held at, given grip in m/s^2: v = sqrt(r * a).
 * The inverse of the number RaceCourse.ts is built around.
 */
export const holdableSpeed = (radius: number, grip: number): number => Math.sqrt(radius * grip);

/** The tightest corner holdable at `speed` on `grip`: r = v^2 / a. */
export const holdableRadius = (speed: number, grip: number): number => (speed * speed) / grip;

/** Total climb and descent along the line, metres. What makes a descent a descent. */
export function elevationProfile(line: RacingLine): { climb: number; drop: number; low: number; high: number } {
  let climb = 0, drop = 0, low = Infinity, high = -Infinity;
  const pts = line.loop ? [...line.pts, line.pts[0]] : line.pts;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) {
      const dy = pts[i].y - pts[i - 1].y;
      if (dy > 0) climb += dy; else drop -= dy;
    }
    low = Math.min(low, pts[i].y);
    high = Math.max(high, pts[i].y);
  }
  return { climb, drop, low, high };
}
