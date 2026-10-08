// Part geometry toolkit — the few primitives the Creator's part library is built from (IMPROVE (2026-10-06),
// docs/CREATOR-PLAN.md phase 2). Arrays in, arrays out: no meshes, no scene, so every shape can be built, measured and
// tested without an engine, and baked straight into one merged buffer per (bone, material).
//
// THE TWO CONVENTIONS EVERY SHAPE KEEPS.
//   · Metres, about 10 cm across, so a part's `scale` reads as "how many times the base size".
//   · Normals point out of the solid and every triangle is wound to agree with its normals (`fixWinding` asks
//     Babylon's own ComputeNormals which way a triangle faces, so this file never has to know the engine's winding
//     convention). A reflected placement (the mirror copy) flips the winding back when it is baked (`bake`).
//
// No UVs: parts are flat colours with a finish (matte, gloss, metal, glow), and phase 3's paint goes on the body.

import { Matrix, Vector3, VertexData } from '@babylonjs/core';

export interface Geo { positions: number[]; normals: number[]; indices: number[] }

export const emptyGeo = (): Geo => ({ positions: [], normals: [], indices: [] });

export function vertexCount(g: { positions: ArrayLike<number> }): number { return g.positions.length / 3; }

/** Append `b` to `a` (in place) and return `a`. */
export function append(a: Geo, b: Geo): Geo {
  const base = a.positions.length / 3;
  for (const v of b.positions) a.positions.push(v);
  for (const v of b.normals) a.normals.push(v);
  for (const i of b.indices) a.indices.push(i + base);
  return a;
}

export function concat(...gs: Geo[]): Geo {
  const out = emptyGeo();
  for (const g of gs) append(out, g);
  return out;
}

/** Row-vector matrix (Babylon's convention) from three axis rows and a translation. */
export function basis(x: [number, number, number], y: [number, number, number], z: [number, number, number], t: [number, number, number] = [0, 0, 0]): Matrix {
  return Matrix.FromValues(x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, t[0], t[1], t[2], 1);
}

/**
 * Transform a geometry by `m`: positions as points, normals by the inverse transpose (so a squash keeps them true), and
 * the winding flipped when `m` reflects (a mirror copy), so the faces still face out. Returns a new Geo.
 */
export function bake(g: Geo, m: Matrix): Geo {
  const out: Geo = { positions: new Array(g.positions.length), normals: new Array(g.normals.length), indices: g.indices.slice() };
  const nm = m.clone().invert().transpose();
  const p = new Vector3(), q = new Vector3();
  for (let i = 0; i < g.positions.length; i += 3) {
    p.set(g.positions[i], g.positions[i + 1], g.positions[i + 2]);
    Vector3.TransformCoordinatesToRef(p, m, q);
    out.positions[i] = q.x; out.positions[i + 1] = q.y; out.positions[i + 2] = q.z;
    p.set(g.normals[i], g.normals[i + 1], g.normals[i + 2]);
    Vector3.TransformNormalToRef(p, nm, q);
    const l = q.length() || 1;
    out.normals[i] = q.x / l; out.normals[i + 1] = q.y / l; out.normals[i + 2] = q.z / l;
  }
  if (m.determinant() < 0) flipWinding(out.indices);
  return out;
}

export function flipWinding(idx: number[]): void {
  for (let i = 0; i + 2 < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
}

/** +1 when Babylon reads (a, b, c) as facing cross(b − a, c − a), −1 when it reads the opposite. Measured once. */
let windSign = 0;
function windingSign(): number {
  if (windSign) return windSign;
  const n: number[] = [];
  VertexData.ComputeNormals([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2], n);
  windSign = n[2] >= 0 ? 1 : -1;
  return windSign;
}

/** Wind every triangle so Babylon reads it as facing the way its vertex normals say (in place). */
export function fixWinding(g: Geo): Geo {
  const s = windingSign();
  const P = g.positions, N = g.normals, I = g.indices;
  for (let t = 0; t + 2 < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const nx = N[a] + N[b] + N[c], ny = N[a + 1] + N[b + 1] + N[c + 1], nz = N[a + 2] + N[b + 2] + N[c + 2];
    if (s * (cx * nx + cy * ny + cz * nz) < 0) { const k = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = k; }
  }
  return g;
}

/** Un-index and give every triangle its own face normal: hard edges for faceted shapes (gem, pyramid). */
export function flatten(g: Geo): Geo {
  const out = emptyGeo();
  const P = g.positions;
  for (let t = 0; t + 2 < g.indices.length; t += 3) {
    const [a, b, c] = [g.indices[t] * 3, g.indices[t + 1] * 3, g.indices[t + 2] * 3];
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    // keep the side the smooth normals said was out
    const sx = g.normals[a] + g.normals[b] + g.normals[c], sy = g.normals[a + 1] + g.normals[b + 1] + g.normals[c + 1], sz = g.normals[a + 2] + g.normals[b + 2] + g.normals[c + 2];
    if (nx * sx + ny * sy + nz * sz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) continue;   // a degenerate sliver at a pole: nothing to draw
    nx /= l; ny /= l; nz /= l;
    const base = out.positions.length / 3;
    for (const i of [a, b, c]) { out.positions.push(P[i], P[i + 1], P[i + 2]); out.normals.push(nx, ny, nz); }
    out.indices.push(base, base + 1, base + 2);
  }
  return fixWinding(out);
}

type P2 = [number, number];

/**
 * Lathe: spin (r, y) profile strips about the y axis. Each strip is smooth along itself; a corner between strips stays
 * hard. A strip's OUTSIDE is to its right as it is walked in (r, y) — walk a solid's outline counter-clockwise (up the
 * outside, across the top inward). `arc` limits the spin to [from, to] radians, measured from +z towards +x, and caps the
 * two open ends; `closed` strips wrap their last point back to their first.
 */
export function lathe(strips: P2[][], sides: number, opts: { arc?: [number, number]; closedStrips?: boolean } = {}): Geo {
  const out = emptyGeo();
  const [a0, a1] = opts.arc ?? [0, Math.PI * 2];
  const full = !opts.arc;
  const steps = sides;
  for (const strip of strips) {
    const closed = opts.closedStrips === true;
    const n = strip.length;
    // per-point 2D outward normals: the mean of the adjoining segments' right-hand normals
    const segN: P2[] = [];
    const segCount = closed ? n : n - 1;
    for (let i = 0; i < segCount; i++) {
      const p = strip[i], q = strip[(i + 1) % n];
      const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
      segN.push([dy / l, -dx / l]);
    }
    const ptN: P2[] = strip.map((_, i) => {
      const prev = closed ? segN[(i - 1 + segCount) % segCount] : segN[i - 1];
      const next = closed ? segN[i % segCount] : segN[i];
      const sx = (prev?.[0] ?? 0) + (next?.[0] ?? 0), sy = (prev?.[1] ?? 0) + (next?.[1] ?? 0);
      const l = Math.hypot(sx, sy) || 1;
      return [sx / l, sy / l];
    });
    const rows = closed ? n + 1 : n;
    const base = out.positions.length / 3;
    const cols = steps + 1;
    for (let j = 0; j < cols; j++) {
      const th = a0 + ((a1 - a0) * j) / steps;
      const s = Math.sin(th), c = Math.cos(th);
      for (let i = 0; i < rows; i++) {
        const [r, y] = strip[i % n];
        const [nr, ny] = ptN[i % n];
        out.positions.push(r * s, y, r * c);
        out.normals.push(nr * s, ny, nr * c);
      }
    }
    for (let j = 0; j < steps; j++) {
      for (let i = 0; i < rows - 1; i++) {
        const k = base + j * rows + i, k2 = base + (j + 1) * rows + i;
        out.indices.push(k, k2, k + 1, k + 1, k2, k2 + 1);
      }
    }
  }
  fixWinding(out);
  if (!full) {
    // cap each open end with the outline the strips trace (they must form one closed loop)
    const loop: P2[] = [];
    for (const s of strips) for (const p of s) { const last = loop[loop.length - 1]; if (!last || last[0] !== p[0] || last[1] !== p[1]) loop.push(p); }
    if (loop.length > 2 && loop[0][0] === loop[loop.length - 1][0] && loop[0][1] === loop[loop.length - 1][1]) loop.pop();
    if (loop.length >= 3) {
      const tris = earClip(loop);
      for (const [th, sign] of [[a0, -1], [a1, 1]] as const) {
        const s = Math.sin(th), c = Math.cos(th);
        // the tangent of the spin at this end (d/dθ of (sinθ, 0, cosθ)) — the cap faces along it, outwards
        const tx = c * sign, tz = -s * sign;
        const capBase = out.positions.length / 3;
        for (const [r, y] of loop) { out.positions.push(r * s, y, r * c); out.normals.push(tx, 0, tz); }
        for (const [i, j, k] of tris) out.indices.push(capBase + i, capBase + j, capBase + k);
      }
      fixWinding(out);
    }
  }
  return out;
}

/** Twice the signed area of a simple polygon (positive = counter-clockwise). */
function area2(poly: P2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a;
}

/** Ear-clipping triangulation of a simple polygon (either winding). Returns index triples into `poly`. */
export function earClip(poly: P2[]): [number, number, number][] {
  const idx = poly.map((_, i) => i);
  if (area2(poly) < 0) idx.reverse();
  const out: [number, number, number][] = [];
  const cross = (a: P2, b: P2, c: P2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p: P2, a: P2, b: P2, c: P2) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 10_000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i - 1 + idx.length) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = poly[ia], b = poly[ib], c = poly[ic];
      if (cross(a, b, c) <= 1e-12) continue;   // reflex (or flat): not an ear
      let blocked = false;
      for (const j of idx) { if (j === ia || j === ib || j === ic) continue; if (inside(poly[j], a, b, c)) { blocked = true; break; } }
      if (blocked) continue;
      out.push([ia, ib, ic]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;   // not simple: give up on the rest rather than loop
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}

/** A flat outline in the XY plane, `depth` thick along z (centred on z = 0), with hard edges. */
export function extrude(outline: P2[], depth: number): Geo {
  const out = emptyGeo();
  const tris = earClip(outline);
  const h = depth / 2;
  for (const [z, nz] of [[h, 1], [-h, -1]] as const) {
    const base = out.positions.length / 3;
    for (const [x, y] of outline) { out.positions.push(x, y, z); out.normals.push(0, 0, nz); }
    for (const [i, j, k] of tris) out.indices.push(base + i, base + j, base + k);
  }
  const ccw = area2(outline) > 0 ? 1 : -1;
  for (let i = 0; i < outline.length; i++) {
    const p = outline[i], q = outline[(i + 1) % outline.length];
    const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
    const nx = (dy / l) * ccw, ny = (-dx / l) * ccw;   // the edge's outward normal
    const base = out.positions.length / 3;
    out.positions.push(p[0], p[1], h, q[0], q[1], h, q[0], q[1], -h, p[0], p[1], -h);
    for (let k = 0; k < 4; k++) out.normals.push(nx, ny, 0);
    out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return fixWinding(out);
}

/**
 * A tube swept along a path in the YZ plane (x = 0), radius per point, `sides` round; capped at the start when its
 * radius is above zero. The path's frame uses x as the fixed binormal, which is exact for a planar path.
 */
export function sweep(path: [number, number, number][], radii: number[], sides: number, flattenX = 1): Geo {
  const out = emptyGeo();
  const n = path.length;
  const rings: { c: Vector3; nrm: Vector3 }[] = [];
  for (let i = 0; i < n; i++) {
    const a = Vector3.FromArray(path[Math.max(0, i - 1)]), b = Vector3.FromArray(path[Math.min(n - 1, i + 1)]);
    const t = b.subtract(a).normalize();
    const bin = new Vector3(1, 0, 0);
    const nrm = Vector3.Cross(t, bin).normalize();
    rings.push({ c: Vector3.FromArray(path[i]), nrm });
  }
  const cols = sides + 1;
  for (let i = 0; i < n; i++) {
    const { c, nrm } = rings[i];
    const r = radii[i];
    // the slope of the radius along the path tilts the normal towards the thin end
    const prev = Math.max(0, i - 1), next = Math.min(n - 1, i + 1);
    const segLen = Vector3.Distance(Vector3.FromArray(path[prev]), Vector3.FromArray(path[next])) || 1;
    const dr = (radii[next] - radii[prev]) / segLen;
    const a = Vector3.FromArray(path[prev]), b = Vector3.FromArray(path[next]);
    const t = b.subtract(a).normalize();
    for (let j = 0; j < cols; j++) {
      const th = (j / sides) * Math.PI * 2;
      const dir = new Vector3(Math.cos(th) * flattenX, 0, 0).add(nrm.scale(Math.sin(th)));
      const p = c.add(dir.scale(r));
      out.positions.push(p.x, p.y, p.z);
      const radial = new Vector3(Math.cos(th) / Math.max(1e-3, flattenX), 0, 0).add(nrm.scale(Math.sin(th))).normalize();
      const nn = radial.subtract(t.scale(dr)).normalize();
      out.normals.push(nn.x, nn.y, nn.z);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const k = i * cols + j, k2 = (i + 1) * cols + j;
      out.indices.push(k, k2, k + 1, k + 1, k2, k2 + 1);
    }
  }
  if (radii[0] > 0) {
    const { c } = rings[0];
    const t0 = Vector3.FromArray(path[1]).subtract(Vector3.FromArray(path[0])).normalize().negate();
    const centre = out.positions.length / 3;
    out.positions.push(c.x, c.y, c.z); out.normals.push(t0.x, t0.y, t0.z);
    const ringBase = out.positions.length / 3;
    for (let j = 0; j < sides; j++) {
      const i0 = j * 3;
      out.positions.push(out.positions[i0], out.positions[i0 + 1], out.positions[i0 + 2]);
      out.normals.push(t0.x, t0.y, t0.z);
    }
    for (let j = 0; j < sides; j++) out.indices.push(centre, ringBase + j, ringBase + ((j + 1) % sides));
  }
  return fixWinding(out);
}

/** A rectangular grid surface f(u, v) → point, with normals from `normal(u, v)`; both sides when `twoSided`. */
export function surface(cols: number, rows: number, f: (u: number, v: number) => [number, number, number], normal: (u: number, v: number) => [number, number, number]): Geo {
  const out = emptyGeo();
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const u = i / cols, v = j / rows;
    out.positions.push(...f(u, v));
    out.normals.push(...normal(u, v));
  }
  const w = cols + 1;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * w + i;
    out.indices.push(k, k + w, k + 1, k + 1, k + w, k + w + 1);
  }
  return fixWinding(out);
}

/** A copy of `g` facing the other way (normals negated, winding reversed): the inside of a thin shell. */
export function backFace(g: Geo): Geo {
  const out: Geo = { positions: g.positions.slice(), normals: g.normals.map((v) => -v), indices: g.indices.slice() };
  flipWinding(out.indices);
  return out;
}

/** Points on a circle in (r, y), counter-clockwise from angle a0 to a1 (radians), `n` segments. */
export function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, n: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
}

/** Pack a Geo into typed arrays (what a Mesh's VertexData takes). */
export function pack(g: Geo): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
  return { positions: Float32Array.from(g.positions), normals: Float32Array.from(g.normals), indices: Uint32Array.from(g.indices) };
}
