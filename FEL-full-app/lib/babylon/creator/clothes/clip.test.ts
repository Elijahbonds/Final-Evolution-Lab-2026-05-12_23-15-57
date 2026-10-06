// Clipping a mesh by a field (IMPROVE (2026-10-06), CREATOR-PLAN phase 4e): the cut lands where the field is zero, on
// the edge, with the winding kept and no crack (a cut point is shared by the triangles either side of its edge); a cut of
// a cut point blends at most four body vertices; splitting gives two halves that meet on the line; the blends carry
// positions, UVs and skin weights from the body.
import { describe, expect, it } from 'vitest';
import { blend2, blend3, blendSkin, bodyCMesh, clipKeep, concatCMesh, filterTris, sampleField, splitBy } from './clip';

// a 2×1 strip of two triangles in the xy plane: (0,0) (1,0) (1,1) / (0,0) (1,1) (0,1)
const P = Float32Array.from([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
const IND = [0, 1, 2, 0, 2, 3];
const xField = (cut: number) => Float32Array.from([0 - cut, 1 - cut, 1 - cut, 0 - cut]);   // f = x − cut
const area = (pos: Float32Array, t: Int32Array) => {
  let s = 0;
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
    s += ((pos[b] - pos[a]) * (pos[c + 1] - pos[a + 1]) - (pos[c] - pos[a]) * (pos[b + 1] - pos[a + 1])) / 2;
  }
  return s;
};

describe('clipKeep', () => {
  it('keeps exactly the part where the field is ≤ 0, cut on the zero, winding kept', () => {
    const m = bodyCMesh(4, IND);
    for (const cut of [0.25, 0.5, 0.9]) {
      const r = clipKeep(m, xField(cut));
      const pos = blend3(r.mesh, P);
      for (let v = 0; v < r.mesh.n; v++) expect(pos[v * 3]).toBeLessThanOrEqual(cut + 1e-6);
      // the kept area is the cut's share of the unit square, and positive (same winding as the input)
      expect(area(pos, r.mesh.tris)).toBeCloseTo(cut, 5);
      // every cut point sits on the line, f = 0 there
      for (let v = 0; v < r.mesh.n; v++) if (r.parent[v] < 0) { expect(pos[v * 3]).toBeCloseTo(cut, 6); expect(r.f[v]).toBe(0); }
    }
  });
  it('shares the cut point on an edge two triangles share (no crack)', () => {
    // a horizontal cut crosses the shared diagonal (0,0)-(1,1): one vertex there, not two
    const f = Float32Array.from([0 - 0.5, 0 - 0.5, 1 - 0.5, 1 - 0.5]);   // f = y − 0.5
    const r = clipKeep(bodyCMesh(4, IND), f);
    const pos = blend3(r.mesh, P);
    const onDiag: number[] = [];
    for (let v = 0; v < r.mesh.n; v++) if (r.parent[v] < 0 && Math.abs(pos[v * 3] - 0.5) < 1e-6 && Math.abs(pos[v * 3 + 1] - 0.5) < 1e-6) onDiag.push(v);
    expect(onDiag).toHaveLength(1);
    expect(area(pos, r.mesh.tris)).toBeCloseTo(0.5, 5);
  });
  it('a wholly inside mesh is unchanged; a wholly outside one is empty; src keeps the body triangle', () => {
    const m = bodyCMesh(4, IND);
    const all = clipKeep(m, Float32Array.from([-1, -1, -1, -1]));
    expect(Array.from(all.mesh.tris)).toEqual(IND);
    expect(Array.from(all.mesh.src)).toEqual([0, 1]);
    expect(clipKeep(m, Float32Array.from([1, 1, 1, 1])).mesh.tris.length).toBe(0);
    const half = clipKeep(m, xField(0.5));
    expect(new Set(half.mesh.src)).toEqual(new Set([0, 1]));
  });
  it('a cut of a cut point blends at most four body vertices, weights summing to 1', () => {
    const first = clipKeep(bodyCMesh(4, IND), xField(0.6)).mesh;
    const second = clipKeep(first, sampleField(first, Float32Array.from([0 - 0.4, 0 - 0.4, 1 - 0.4, 1 - 0.4]))).mesh;   // y ≤ 0.4
    for (let v = 0; v < second.n; v++) {
      let s = 0, used = 0;
      for (let k = 0; k < 4; k++) if (second.vi[v * 4 + k] >= 0) { s += second.vw[v * 4 + k]; used++; }
      expect(s).toBeCloseTo(1, 6);
      expect(used).toBeLessThanOrEqual(4);
    }
    const pos = blend3(second, P);
    expect(area(pos, second.tris)).toBeCloseTo(0.6 * 0.4, 5);
  });
});

describe('splitBy, concat, filter', () => {
  it('the two halves meet on the line and add up to the whole; the line is in both as separate copies', () => {
    const m = bodyCMesh(4, IND);
    const f = xField(0.3);
    const { a, b } = splitBy(m, f);
    const pa = blend3(a, P), pb = blend3(b, P);
    expect(area(pa, a.tris) + area(pb, b.tris)).toBeCloseTo(1, 5);
    const both = concatCMesh([a, b]);
    expect(both.n).toBe(a.n + b.n);
    expect(area(blend3(both, P), both.tris)).toBeCloseTo(1, 5);
  });
  it('filterTris drops triangles and the vertices only they used', () => {
    const m = bodyCMesh(4, IND);
    const one = filterTris(m, (t) => t === 0);
    expect(one.tris.length).toBe(3);
    expect(one.n).toBe(3);
    expect(Array.from(one.src)).toEqual([0]);
  });
});

describe('blends carry the body', () => {
  it('UVs and skin weights interpolate; the four strongest influences kept and normalised', () => {
    const uv = Float32Array.from([0, 0, 1, 0, 1, 1, 0, 1]);
    const J = Float32Array.from([0, 1, 0, 0, 2, 0, 0, 0, 2, 3, 0, 0, 0, 0, 0, 0]);
    const W = Float32Array.from([0.5, 0.5, 0, 0, 1, 0, 0, 0, 0.5, 0.5, 0, 0, 1, 0, 0, 0]);
    const r = clipKeep(bodyCMesh(4, IND), xField(0.5)).mesh;
    const u = blend2(r, uv);
    const pos = blend3(r, P);
    for (let v = 0; v < r.n; v++) { expect(u[v * 2]).toBeCloseTo(pos[v * 3], 6); expect(u[v * 2 + 1]).toBeCloseTo(pos[v * 3 + 1], 6); }
    const sk = blendSkin(r, J, W);
    for (let v = 0; v < r.n; v++) {
      const s = sk.W[v * 4] + sk.W[v * 4 + 1] + sk.W[v * 4 + 2] + sk.W[v * 4 + 3];
      expect(s).toBeCloseTo(1, 6);
      for (let k = 1; k < 4; k++) expect(sk.W[v * 4 + k]).toBeLessThanOrEqual(sk.W[v * 4 + k - 1] + 1e-7);
    }
    // the cut point on edge 0–1 at x = 0.5: half joint 0 (from v0's 0.5 → 0.25 + v1's 2 → 0.5), joint 1 0.25
    const mid = [...Array(r.n).keys()].find((v) => Math.abs(pos[v * 3] - 0.5) < 1e-6 && Math.abs(pos[v * 3 + 1]) < 1e-6)!;
    const got = new Map<number, number>();
    for (let k = 0; k < 4; k++) if (sk.W[mid * 4 + k]) got.set(sk.J[mid * 4 + k], sk.W[mid * 4 + k]);
    expect(got.get(2)).toBeCloseTo(0.5, 6);
    expect(got.get(0)).toBeCloseTo(0.25, 6);
    expect(got.get(1)).toBeCloseTo(0.25, 6);
  });
});
