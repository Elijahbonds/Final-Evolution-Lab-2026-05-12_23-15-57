// CLIPPING A MESH BY A FIELD (IMPROVE (2026-10-06), CREATOR-PLAN phase 4e). Pure: typed arrays in, typed arrays out.
//
// A code-built garment is the body's own surface, cut where the garment ends. A cut along triangle edges would leave a
// jagged hem (the kit body's triangles are 1–2 cm), so each triangle a cut crosses is CLIPPED: a scalar field f is given
// per vertex (a signed distance in metres for a plane or a sphere, a weight minus a threshold for a region), the zero of
// f is found on every edge it crosses by linear interpolation, and the part with f ≤ 0 is kept. The hem lands exactly on
// the cut, straight across the triangles.
//
// A VERTEX IS A BLEND OF BODY VERTICES. Every output vertex is a weighted combination of at most four body vertices
// (`vi` / `vw`, four slots each, unused slots −1): an original vertex is itself, a cut point is a lerp of two, a cut of a
// cut point (the two-tone pass after the garment's own cut) a lerp of up to four. So the garment's rest position, normal,
// UV and SKIN WEIGHTS all come from the body by the same weights — a cut point on the hem is skinned exactly like the
// skin it lies on. A cut point is shared by the two triangles on either side of its edge (keyed by the edge), so a clipped
// surface has no cracks.

export interface CMesh {
  /** vertex count */
  n: number;
  /** body vertex indices per vertex (4 slots; −1 unused) */
  vi: Int32Array;
  /** their weights (sum 1) */
  vw: Float32Array;
  /** triangles, indices into this mesh's vertices */
  tris: Int32Array;
  /** the BODY triangle each triangle was cut from */
  src: Int32Array;
}

/** The body's own triangles as a CMesh (every vertex itself). */
export function bodyCMesh(nVerts: number, indices: ArrayLike<number>): CMesh {
  const vi = new Int32Array(nVerts * 4).fill(-1), vw = new Float32Array(nVerts * 4);
  for (let v = 0; v < nVerts; v++) { vi[v * 4] = v; vw[v * 4] = 1; }
  const nt = Math.floor(indices.length / 3);
  const tris = new Int32Array(nt * 3), src = new Int32Array(nt);
  for (let t = 0; t < nt; t++) { tris[t * 3] = indices[t * 3]; tris[t * 3 + 1] = indices[t * 3 + 1]; tris[t * 3 + 2] = indices[t * 3 + 2]; src[t] = t; }
  return { n: nVerts, vi, vw, tris, src };
}

/** Evaluate a per-body-vertex field at a mesh's vertices (linear in the blend: what a cut point interpolates). */
export function sampleField(m: CMesh, field: ArrayLike<number>): Float32Array {
  const out = new Float32Array(m.n);
  for (let v = 0; v < m.n; v++) {
    let s = 0;
    for (let k = 0; k < 4; k++) { const b = m.vi[v * 4 + k]; if (b >= 0) s += m.vw[v * 4 + k] * field[b]; }
    out[v] = s;
  }
  return out;
}

/** Mix two blends: (1 − t)·a + t·b, merged by body vertex, at most four kept (the largest; renormalised). */
function mixInto(m: CMesh, a: number, b: number, t: number, vi: number[], vw: number[], o: number): void {
  const idx: number[] = [], w: number[] = [];
  const add = (bi: number, wi: number) => {
    if (bi < 0 || wi === 0) return;
    const j = idx.indexOf(bi);
    if (j >= 0) w[j] += wi; else { idx.push(bi); w.push(wi); }
  };
  for (let k = 0; k < 4; k++) add(m.vi[a * 4 + k], (1 - t) * m.vw[a * 4 + k]);
  for (let k = 0; k < 4; k++) add(m.vi[b * 4 + k], t * m.vw[b * 4 + k]);
  const order = idx.map((_, i) => i).sort((x, y) => w[y] - w[x]).slice(0, 4);
  let sum = 0;
  for (const i of order) sum += w[i];
  for (let k = 0; k < 4; k++) {
    const i = order[k];
    vi[o * 4 + k] = i === undefined ? -1 : idx[i];
    vw[o * 4 + k] = i === undefined ? 0 : w[i] / (sum || 1);
  }
}

export interface ClipResult {
  mesh: CMesh;
  /** f at the output vertices (0 on a cut point) */
  f: Float32Array;
  /** for each output vertex, the input vertex it is (−1 for a cut point) */
  parent: Int32Array;
}

/**
 * Keep the part of `m` where `f` ≤ 0 (f per vertex of m). A triangle wholly inside is kept as it is, one wholly outside is
 * dropped, one the zero crosses is cut on its edges (one corner inside: a triangle; two: a quad as two triangles), the
 * winding kept. Cut points are shared per edge. A corner exactly at 0 counts as inside.
 */
export function clipKeep(m: CMesh, f: ArrayLike<number>): ClipResult {
  const vi: number[] = [], vw: number[] = [], fo: number[] = [], parent: number[] = [];
  const remap = new Int32Array(m.n).fill(-1);
  const cuts = new Map<number, number>();
  const tris: number[] = [], src: number[] = [];
  const keepVert = (v: number): number => {
    let o = remap[v];
    if (o >= 0) return o;
    o = parent.length;
    remap[v] = o;
    for (let k = 0; k < 4; k++) { vi[o * 4 + k] = m.vi[v * 4 + k]; vw[o * 4 + k] = m.vw[v * 4 + k]; }
    fo[o] = f[v]; parent[o] = v;
    return o;
  };
  const cutVert = (a: number, b: number): number => {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const key = lo * m.n + hi;
    const hit = cuts.get(key);
    if (hit !== undefined) return hit;
    const fl = f[lo], fh = f[hi];
    const t = fl === fh ? 0.5 : Math.min(1, Math.max(0, fl / (fl - fh)));
    const o = parent.length;
    mixInto(m, lo, hi, t, vi, vw, o);
    fo[o] = 0; parent[o] = -1;
    cuts.set(key, o);
    return o;
  };
  const nt = m.tris.length / 3;
  for (let t = 0; t < nt; t++) {
    const a = m.tris[t * 3], b = m.tris[t * 3 + 1], c = m.tris[t * 3 + 2];
    const ia = f[a] <= 0, ib = f[b] <= 0, ic = f[c] <= 0;
    const inside = (ia ? 1 : 0) + (ib ? 1 : 0) + (ic ? 1 : 0);
    if (inside === 0) continue;
    if (inside === 3) { tris.push(keepVert(a), keepVert(b), keepVert(c)); src.push(m.src[t]); continue; }
    // rotate so the odd corner is first: (p, q, r) keeps the winding of (a, b, c)
    let p: number, q: number, r: number;
    if (inside === 1) { [p, q, r] = ia ? [a, b, c] : ib ? [b, c, a] : [c, a, b]; }
    else { [p, q, r] = !ia ? [a, b, c] : !ib ? [b, c, a] : [c, a, b]; }
    const pq = cutVert(p, q), pr = cutVert(p, r);
    if (inside === 1) {
      tris.push(keepVert(p), pq, pr); src.push(m.src[t]);
    } else {
      // p is outside: the quad q, r, pr, pq
      const vq = keepVert(q), vr = keepVert(r);
      tris.push(pq, vq, vr, pq, vr, pr); src.push(m.src[t], m.src[t]);
    }
  }
  const n = parent.length;
  return {
    mesh: { n, vi: Int32Array.from(vi.length ? vi : []).subarray(0, n * 4), vw: Float32Array.from(vw).subarray(0, n * 4), tris: Int32Array.from(tris), src: Int32Array.from(src) },
    f: Float32Array.from(fo), parent: Int32Array.from(parent),
  };
}

/** Split a mesh in two along f = 0: the part where f ≤ 0 (`a`) and where f ≥ 0 (`b`). The vertices on the line are in
 *  both, as separate copies (so each side can carry its own colour with a crisp edge). */
export function splitBy(m: CMesh, f: ArrayLike<number>): { a: CMesh; b: CMesh } {
  const neg = new Float32Array(m.n);
  for (let v = 0; v < m.n; v++) neg[v] = -f[v];
  return { a: clipKeep(m, f).mesh, b: clipKeep(m, neg).mesh };
}

/** Concatenate meshes (vertex indices offset). */
export function concatCMesh(ms: readonly CMesh[]): CMesh {
  let n = 0, nt = 0;
  for (const m of ms) { n += m.n; nt += m.tris.length / 3; }
  const vi = new Int32Array(n * 4), vw = new Float32Array(n * 4), tris = new Int32Array(nt * 3), src = new Int32Array(nt);
  let o = 0, ot = 0;
  for (const m of ms) {
    vi.set(m.vi.subarray(0, m.n * 4), o * 4); vw.set(m.vw.subarray(0, m.n * 4), o * 4);
    for (let i = 0; i < m.tris.length; i++) tris[ot * 3 + i] = m.tris[i] + o;
    src.set(m.src, ot);
    o += m.n; ot += m.tris.length / 3;
  }
  return { n, vi, vw, tris, src };
}

/** Keep only the triangles `keep(t)` says (vertices left unreferenced are dropped too). */
export function filterTris(m: CMesh, keep: (t: number) => boolean): CMesh {
  const remap = new Int32Array(m.n).fill(-1);
  const vi: number[] = [], vw: number[] = [], tris: number[] = [], src: number[] = [];
  let n = 0;
  const map = (v: number) => {
    if (remap[v] < 0) { remap[v] = n; for (let k = 0; k < 4; k++) { vi.push(m.vi[v * 4 + k]); vw.push(m.vw[v * 4 + k]); } n++; }
    return remap[v];
  };
  const nt = m.tris.length / 3;
  for (let t = 0; t < nt; t++) {
    if (!keep(t)) continue;
    tris.push(map(m.tris[t * 3]), map(m.tris[t * 3 + 1]), map(m.tris[t * 3 + 2])); src.push(m.src[t]);
  }
  return { n, vi: Int32Array.from(vi), vw: Float32Array.from(vw), tris: Int32Array.from(tris), src: Int32Array.from(src) };
}

/** Rest positions (or any 3-vector per body vertex) at a mesh's vertices. */
export function blend3(m: CMesh, data: ArrayLike<number>): Float32Array {
  const out = new Float32Array(m.n * 3);
  for (let v = 0; v < m.n; v++) {
    for (let k = 0; k < 4; k++) {
      const b = m.vi[v * 4 + k];
      if (b < 0) continue;
      const w = m.vw[v * 4 + k];
      out[v * 3] += w * data[b * 3]; out[v * 3 + 1] += w * data[b * 3 + 1]; out[v * 3 + 2] += w * data[b * 3 + 2];
    }
  }
  return out;
}

/** UVs (2 per body vertex) at a mesh's vertices. */
export function blend2(m: CMesh, data: ArrayLike<number>): Float32Array {
  const out = new Float32Array(m.n * 2);
  for (let v = 0; v < m.n; v++) {
    for (let k = 0; k < 4; k++) {
      const b = m.vi[v * 4 + k];
      if (b < 0) continue;
      const w = m.vw[v * 4 + k];
      out[v * 2] += w * data[b * 2]; out[v * 2 + 1] += w * data[b * 2 + 1];
    }
  }
  return out;
}

/** Skin joints and weights at a mesh's vertices: the body's influences mixed by the blend, the four strongest kept. */
export function blendSkin(m: CMesh, J: ArrayLike<number>, W: ArrayLike<number>): { J: Float32Array; W: Float32Array } {
  const oj = new Float32Array(m.n * 4), ow = new Float32Array(m.n * 4);
  const acc = new Map<number, number>();
  for (let v = 0; v < m.n; v++) {
    acc.clear();
    for (let k = 0; k < 4; k++) {
      const b = m.vi[v * 4 + k];
      if (b < 0) continue;
      const w = m.vw[v * 4 + k];
      for (let i = 0; i < 4; i++) {
        const wi = W[b * 4 + i];
        if (!wi) continue;
        const j = J[b * 4 + i];
        acc.set(j, (acc.get(j) ?? 0) + w * wi);
      }
    }
    const top = [...acc.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
    const sum = top.reduce((s, e) => s + e[1], 0) || 1;
    top.forEach(([j, w], i) => { oj[v * 4 + i] = j; ow[v * 4 + i] = w / sum; });
  }
  return { J: oj, W: ow };
}
