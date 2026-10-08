// BULK AND MESH SCALE — the inflate maths (IMPROVE (2026-10-06), CREATOR-PLAN phase 4b, shape v2). Pure: typed arrays in,
// typed arrays out; no Babylon. renderShape.ts reads a mesh's rest pose (paint/surfaceMap.restSkin) and feeds it here.
//
// WHAT A VERTEX DOES. In the shared REST space (metres, the skeleton's own space; restSkin), for a vertex v with skin
// joints j_k and weights w_k:
//
//   bulk   d += N(v) · Σ_k w_k · girth(j_k)                      girth(j) = (segment girth − 1) × the segment's radius
//   scale  d += Σ_k w_k · (scale(j_k) − 1) · (P(v) − pivot(j_k))  hands about the wrist, feet about the sole under the ankle
//
// so the bulk tapers through the skin weights exactly as the body bends, and nothing at all moves where a bone has no
// value. N is the WELDED normal (area-weighted over every vertex at the same rest position), so a UV seam — two vertices
// at one point — moves as one point and never cracks open.
//
// NO BONE MOVES. The result is a morph target (a vertex offset applied before skinning), so the skeleton, every bone
// origin, the ball on the hand bone, a staff or a bat, the hitboxes and the reach are exactly what they were.

export interface SkinField {
  /** rest positions, metres (n × 3) */
  P: Float32Array;
  /** welded rest normals, unit (n × 3) */
  N: Float32Array;
  /** skin joints and weights (n × 4), and the extra four when the mesh has them */
  J: ArrayLike<number>;
  W: ArrayLike<number>;
  J2?: ArrayLike<number> | null;
  W2?: ArrayLike<number> | null;
}

/** Per bone (by skin-joint index): the bulk in metres along the normal, the mesh scale − 1, and the scale's pivot. */
export interface BoneShapeTable {
  girth: Float32Array;
  scale: Float32Array;
  /** bones × 3 */
  pivot: Float32Array;
}

export function emptyTable(bones: number): BoneShapeTable {
  return { girth: new Float32Array(bones), scale: new Float32Array(bones), pivot: new Float32Array(bones * 3) };
}

/** True when the table moves nothing. */
export function tableIsNeutral(t: BoneShapeTable): boolean {
  for (let i = 0; i < t.girth.length; i++) if (t.girth[i] !== 0 || t.scale[i] !== 0) return false;
  return true;
}

/** The welded, area-weighted vertex normals of a triangle list over rest positions. Vertices within `quantum` metres of
 *  each other share one normal (a UV seam is one point). Unit length; a vertex in no triangle gets (0, 0, 0). */
export function weldedNormals(P: Float32Array, indices: ArrayLike<number>, quantum = 1e-4): Float32Array {
  const n = P.length / 3;
  const key = (v: number) => `${Math.round(P[v * 3] / quantum)},${Math.round(P[v * 3 + 1] / quantum)},${Math.round(P[v * 3 + 2] / quantum)}`;
  const groupOf = new Int32Array(n);
  const groups = new Map<string, number>();
  for (let v = 0; v < n; v++) {
    const k = key(v);
    let g = groups.get(k);
    if (g === undefined) { g = groups.size; groups.set(k, g); }
    groupOf[v] = g;
  }
  const acc = new Float64Array(groups.size * 3);
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    // the cross product's length is twice the area: area-weighted for free
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { const g = groupOf[v] * 3; acc[g] += nx; acc[g + 1] += ny; acc[g + 2] += nz; }
  }
  const N = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const g = groupOf[v] * 3;
    const l = Math.hypot(acc[g], acc[g + 1], acc[g + 2]);
    if (l > 1e-12) { N[v * 3] = acc[g] / l; N[v * 3 + 1] = acc[g + 1] / l; N[v * 3 + 2] = acc[g + 2] / l; }
  }
  return N;
}

/** Each vertex's total skin weight on a set of joints (by index). */
export function weightOn(f: Pick<SkinField, 'J' | 'W' | 'J2' | 'W2'>, joints: ReadonlySet<number>, n: number): Float32Array {
  const out = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    let s = 0;
    for (let k = 0; k < 4; k++) if (f.W[v * 4 + k] && joints.has(f.J[v * 4 + k])) s += f.W[v * 4 + k];
    if (f.J2 && f.W2) for (let k = 0; k < 4; k++) if (f.W2[v * 4 + k] && joints.has(f.J2[v * 4 + k])) s += f.W2[v * 4 + k];
    out[v] = s;
  }
  return out;
}

/** 1 where a vertex's heaviest skin joint is one of `joints` (and that weight is at least `minWeight`), else 0: the
 *  vertices a bone DOMINATES. Steadier than a weight threshold on a bone whose weights are spread thin (the kit's neck,
 *  clavicles and middle spine reach 0.8 nowhere). */
export function dominantOn(f: Pick<SkinField, 'J' | 'W' | 'J2' | 'W2'>, joints: ReadonlySet<number>, n: number, minWeight = 0.3): Float32Array {
  const out = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    let j = -1, w = 0;
    for (let k = 0; k < 4; k++) if (f.W[v * 4 + k] > w) { w = f.W[v * 4 + k]; j = f.J[v * 4 + k]; }
    if (f.J2 && f.W2) for (let k = 0; k < 4; k++) if (f.W2[v * 4 + k] > w) { w = f.W2[v * 4 + k]; j = f.J2[v * 4 + k]; }
    if (w >= minWeight && joints.has(j)) out[v] = 1;
  }
  return out;
}

/** Distance from p to the segment a–b. */
function distToSegment(px: number, py: number, pz: number, a: readonly number[], b: readonly number[]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L2 = dx * dx + dy * dy + dz * dz;
  let t = L2 > 1e-12 ? ((px - a[0]) * dx + (py - a[1]) * dy + (pz - a[2]) * dz) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy), pz - (a[2] + t * dz));
}

/**
 * A segment's radius: the median distance from the bone line a–b of the vertices with `weight` ≥ `minWeight` (renderShape
 * passes dominantOn: the vertices the bone dominates).
 * The bulk is a multiple of it, so 1.3 on a thigh and 1.3 on a forearm are both "30 % thicker". 0 when no vertex qualifies.
 */
export function segmentRadius(P: Float32Array, weight: Float32Array, a: readonly number[], b: readonly number[], minWeight = 0.8): number {
  const d: number[] = [];
  for (let v = 0; v < weight.length; v++) if (weight[v] >= minWeight) d.push(distToSegment(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], a, b));
  if (!d.length) return 0;
  d.sort((x, y) => x - y);
  return d[d.length >> 1];
}

/** The lowest point of a vertex set along `up` (unit), or null when the set is empty: the sole under a foot. */
export function lowestAlong(P: Float32Array, weight: Float32Array, up: readonly number[], minWeight = 0.5): number | null {
  let lo = Infinity;
  for (let v = 0; v < weight.length; v++) {
    if (weight[v] < minWeight) continue;
    const h = P[v * 3] * up[0] + P[v * 3 + 1] * up[1] + P[v * 3 + 2] * up[2];
    if (h < lo) lo = h;
  }
  return Number.isFinite(lo) ? lo : null;
}

/** The span along `up` of a vertex set (max − min), or 0: the visible neck's length. */
export function spanAlong(P: Float32Array, weight: Float32Array, up: readonly number[], minWeight = 0.5): number {
  let lo = Infinity, hi = -Infinity;
  for (let v = 0; v < weight.length; v++) {
    if (weight[v] < minWeight) continue;
    const h = P[v * 3] * up[0] + P[v * 3 + 1] * up[1] + P[v * 3 + 2] * up[2];
    if (h < lo) lo = h;
    if (h > hi) hi = h;
  }
  return hi > lo ? hi - lo : 0;
}

/** The rest-space offset of every vertex (n × 3) for a bone table. See the header for the formula. */
export function shapeDelta(f: SkinField, t: BoneShapeTable, out?: Float32Array): Float32Array {
  const n = f.P.length / 3;
  const d = out && out.length === n * 3 ? out.fill(0) : new Float32Array(n * 3);
  const one = (v: number, j: number, w: number) => {
    if (!w) return;
    const g = t.girth[j], s = t.scale[j];
    if (g) { d[v * 3] += f.N[v * 3] * w * g; d[v * 3 + 1] += f.N[v * 3 + 1] * w * g; d[v * 3 + 2] += f.N[v * 3 + 2] * w * g; }
    if (s) {
      d[v * 3] += w * s * (f.P[v * 3] - t.pivot[j * 3]);
      d[v * 3 + 1] += w * s * (f.P[v * 3 + 1] - t.pivot[j * 3 + 1]);
      d[v * 3 + 2] += w * s * (f.P[v * 3 + 2] - t.pivot[j * 3 + 2]);
    }
  };
  for (let v = 0; v < n; v++) {
    for (let k = 0; k < 4; k++) one(v, f.J[v * 4 + k], f.W[v * 4 + k]);
    if (f.J2 && f.W2) for (let k = 0; k < 4; k++) one(v, f.J2[v * 4 + k], f.W2[v * 4 + k]);
  }
  return d;
}

/**
 * Small rigid pieces (each eyeball) carried by the surface around them: every vertex of a group gets ONE offset, the mean
 * offset of the source vertices within `radius` of the group's centre. A per-vertex nearest transfer would hand each
 * eyeball vertex the offset of a different eye-socket vertex (their normals point every way) and crumple the eye; this
 * moves each eye as a whole with the face around it. `groupOf[v]` names each target vertex's group.
 */
export function groupTransfer(srcP: Float32Array, srcD: Float32Array, dstP: Float32Array, groupOf: ArrayLike<number>, radius: number): Float32Array {
  const n = dstP.length / 3, m = srcP.length / 3;
  const out = new Float32Array(n * 3);
  const groups = new Map<number, number[]>();
  for (let v = 0; v < n; v++) { const g = groupOf[v]; (groups.get(g) ?? groups.set(g, []).get(g)!).push(v); }
  const r2 = radius * radius;
  for (const vs of groups.values()) {
    const c = [0, 0, 0];
    for (const v of vs) for (let k = 0; k < 3; k++) c[k] += dstP[v * 3 + k] / vs.length;
    const acc = [0, 0, 0];
    let cnt = 0;
    for (let u = 0; u < m; u++) {
      const dx = srcP[u * 3] - c[0], dy = srcP[u * 3 + 1] - c[1], dz = srcP[u * 3 + 2] - c[2];
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      for (let k = 0; k < 3; k++) acc[k] += srcD[u * 3 + k];
      cnt++;
    }
    if (!cnt) continue;
    for (const v of vs) for (let k = 0; k < 3; k++) out[v * 3 + k] = acc[k] / cnt;
  }
  return out;
}

/**
 * Rest-space offsets back into the mesh's own vertex space (a quantised kit mesh keeps its positions in a [-1, 1] box and
 * the dequantisation in its inverse bind matrices): per vertex, `d × L⁻¹` with L the linear part of the dominant joint's
 * rest skinning matrix (inverse bind × absolute rest; row vectors). `linv` holds L⁻¹ per joint (joints × 9, row-major).
 * At rest every influence of a vertex maps it to the same point (measured on the kit: 0.0 mm), so the dominant joint's is
 * the vertex's.
 */
export function toLocal(d: Float32Array, f: Pick<SkinField, 'J' | 'W'>, linv: Float32Array): Float32Array {
  const n = d.length / 3;
  const out = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    let j = f.J[v * 4], w = f.W[v * 4];
    for (let k = 1; k < 4; k++) if (f.W[v * 4 + k] > w) { w = f.W[v * 4 + k]; j = f.J[v * 4 + k]; }
    const m = j * 9, x = d[v * 3], y = d[v * 3 + 1], z = d[v * 3 + 2];
    out[v * 3] = x * linv[m] + y * linv[m + 3] + z * linv[m + 6];
    out[v * 3 + 1] = x * linv[m + 1] + y * linv[m + 4] + z * linv[m + 7];
    out[v * 3 + 2] = x * linv[m + 2] + y * linv[m + 5] + z * linv[m + 8];
  }
  return out;
}

/** Inverse of a 3×3 (row-major), or identity when singular. */
export function invert3(m: ArrayLike<number>): Float32Array {
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const r = 1 / det;
  return Float32Array.from([
    A * r, -(b * i - c * h) * r, (b * f - c * e) * r,
    B * r, (a * i - c * g) * r, -(a * f - c * d) * r,
    C * r, -(a * h - b * g) * r, (a * e - b * d) * r,
  ]);
}
