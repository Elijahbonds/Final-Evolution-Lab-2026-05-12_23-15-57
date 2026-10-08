// The inflate maths (IMPROVE (2026-10-06), CREATOR-PLAN phase 4b), on a synthetic skinned tube: two bones up a cylinder
// of radius R, a UV seam (the first column duplicated as the last), and a blend band where the weights cross.
import { describe, expect, it } from 'vitest';
import {
  dominantOn, emptyTable, groupTransfer, invert3, lowestAlong, segmentRadius, shapeDelta, spanAlong, tableIsNeutral,
  toLocal, weightOn, weldedNormals, type SkinField,
} from './inflate';

const R = 0.1, RINGS = 11, COLS = 16;   // y = 0 … 1 in 0.1 steps; columns 0 … 16, the 16th repeats the 0th (the seam)
function tube(): SkinField & { n: number; idx: number[]; y: (v: number) => number } {
  const P: number[] = [], J: number[] = [], W: number[] = [], idx: number[] = [];
  const C = COLS + 1;
  for (let r = 0; r < RINGS; r++) {
    const y = r / (RINGS - 1);
    // bone 0 below 0.4, bone 1 above 0.6, a linear blend between
    const w1 = Math.min(1, Math.max(0, (y - 0.4) / 0.2));
    for (let c = 0; c < C; c++) {
      const a = (2 * Math.PI * (c % COLS)) / COLS;
      P.push(R * Math.cos(a), y, R * Math.sin(a));
      J.push(0, 1, 0, 0); W.push(1 - w1, w1, 0, 0);
    }
  }
  for (let r = 0; r < RINGS - 1; r++) for (let c = 0; c < COLS; c++) {
    const a = r * C + c, b = a + 1, d = a + C, e = d + 1;
    // wound so the cross product points OUT of the tube
    idx.push(a, d, b, b, d, e);
  }
  const Pf = Float32Array.from(P);
  return { P: Pf, N: weldedNormals(Pf, idx), J, W, n: Pf.length / 3, idx, y: (v) => Pf[v * 3 + 1] };
}
const radial = (f: SkinField, v: number): [number, number, number] => {
  const x = f.P[v * 3], z = f.P[v * 3 + 2], l = Math.hypot(x, z);
  return [x / l, 0, z / l];
};
const dot3 = (a: ArrayLike<number>, i: number, b: readonly number[]) => a[i * 3] * b[0] + a[i * 3 + 1] * b[1] + a[i * 3 + 2] * b[2];
const len3 = (a: ArrayLike<number>, i: number) => Math.hypot(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);

describe('weldedNormals', () => {
  it('unit, outward, and identical on the two vertices of a UV seam', () => {
    const t = tube();
    for (let v = 0; v < t.n; v++) {
      expect(len3(t.N, v)).toBeCloseTo(1, 5);
      // inside the tube's height the normal is radial; at the open rims it leans, but still points out
      expect(dot3(t.N, v, radial(t, v))).toBeGreaterThan(t.y(v) > 0.05 && t.y(v) < 0.95 ? 0.99 : 0.6);
    }
    const C = COLS + 1;
    for (let r = 0; r < RINGS; r++) {
      const a = r * C, b = r * C + COLS;   // the seam pair
      for (let k = 0; k < 3; k++) expect(t.N[a * 3 + k]).toBe(t.N[b * 3 + k]);
    }
  });
});

describe('shapeDelta: bulk', () => {
  it('one offset per vertex (n × 3), along the normal, scaled by the weight on the bone, zero where it has none', () => {
    const t = tube();
    const tab = emptyTable(2);
    tab.girth[0] = 0.03;   // 3 cm out on bone 0
    const d = shapeDelta(t, tab);
    expect(d.length).toBe(t.n * 3);
    for (let v = 0; v < t.n; v++) {
      const w0 = t.W[v * 4];
      expect(len3(d, v)).toBeCloseTo(0.03 * w0, 6);
      if (w0 > 0) expect(dot3(d, v, [t.N[v * 3], t.N[v * 3 + 1], t.N[v * 3 + 2]])).toBeCloseTo(0.03 * w0, 6);   // along N, outward
      if (t.y(v) > 0.65) expect(len3(d, v)).toBe(0);
    }
  });
  it('a negative bulk (thinner) goes inward; the seam never cracks', () => {
    const t = tube();
    const tab = emptyTable(2);
    tab.girth[0] = -0.02; tab.girth[1] = 0.05;
    const d = shapeDelta(t, tab);
    for (let v = 0; v < t.n; v++) {
      const w0 = t.W[v * 4], w1 = t.W[v * 4 + 1];
      expect(dot3(d, v, [t.N[v * 3], t.N[v * 3 + 1], t.N[v * 3 + 2]])).toBeCloseTo(-0.02 * w0 + 0.05 * w1, 6);
    }
    const C = COLS + 1;
    for (let r = 0; r < RINGS; r++) for (let k = 0; k < 3; k++) expect(d[r * C * 3 + k]).toBe(d[(r * C + COLS) * 3 + k]);
  });
  it('the extra four weights count too', () => {
    const t = tube();
    const f: SkinField = { ...t, J: Array(t.n * 4).fill(0), W: Array(t.n * 4).fill(0), J2: t.J, W2: t.W };
    const tab = emptyTable(2);
    tab.girth[1] = 0.01;
    expect(Array.from(shapeDelta(f, tab))).toEqual(Array.from(shapeDelta(t, tab)));
  });
});

describe('shapeDelta: mesh scale about a pivot (hands and feet)', () => {
  it('a vertex fully on the bone goes to pivot + s·(P − pivot); the pivot itself does not move', () => {
    const t = tube();
    const tab = emptyTable(2);
    tab.scale[1] = 0.5; tab.pivot.set([0, 1, 0], 3);   // bone 1 grows 1.5× about the tube's top centre
    const d = shapeDelta(t, tab);
    for (let v = 0; v < t.n; v++) {
      const w1 = t.W[v * 4 + 1];
      for (let k = 0; k < 3; k++) expect(d[v * 3 + k]).toBeCloseTo(w1 * 0.5 * (t.P[v * 3 + k] - [0, 1, 0][k]), 6);
    }
    const top = (RINGS - 1) * (COLS + 1);   // a top-ring vertex: radial grows by half, height stays (it is at the pivot height)
    expect(d[top * 3 + 1]).toBeCloseTo(0, 6);
    expect(len3(d, top)).toBeCloseTo(R * 0.5, 6);
  });
  it('a neutral table moves nothing', () => {
    const t = tube();
    const tab = emptyTable(2);
    expect(tableIsNeutral(tab)).toBe(true);
    expect(shapeDelta(t, tab).every((x) => x === 0)).toBe(true);
    tab.scale[0] = 0.1;
    expect(tableIsNeutral(tab)).toBe(false);
  });
});

describe('the measurements', () => {
  it('segmentRadius is the tube radius; dominantOn picks the bone\'s own vertices', () => {
    const t = tube();
    const dom0 = dominantOn(t, new Set([0]), t.n);
    expect(segmentRadius(t.P, dom0, [0, 0, 0], [0, 1, 0])).toBeCloseTo(R, 5);
    expect(Array.from(dom0).every((x, v) => x === (t.W[v * 4] >= t.W[v * 4 + 1] ? 1 : 0))).toBe(true);
    expect(segmentRadius(t.P, new Float32Array(t.n), [0, 0, 0], [0, 1, 0])).toBe(0);
  });
  it('weightOn sums a joint set; spanAlong and lowestAlong read along `up`', () => {
    const t = tube();
    const w = weightOn(t, new Set([0, 1]), t.n);
    expect(Array.from(w).every((x) => Math.abs(x - 1) < 1e-6)).toBe(true);
    expect(spanAlong(t.P, weightOn(t, new Set([1]), t.n), [0, 1, 0])).toBeCloseTo(0.5, 5);   // y 0.5 … 1 (weight ≥ 0.5)
    expect(lowestAlong(t.P, weightOn(t, new Set([1]), t.n), [0, 1, 0])).toBeCloseTo(0.5, 5);
    expect(lowestAlong(t.P, new Float32Array(t.n), [0, 1, 0])).toBeNull();
  });
});

describe('into the mesh\'s own space, and the eyes', () => {
  it('toLocal undoes the rest skinning\'s linear part (row vectors: local × L = rest)', () => {
    const L = [0, 2, 0, -2, 0, 0, 0, 0, 0.5];   // a quarter turn, scaled (a quantised mesh's dequantisation)
    const linv = new Float32Array(9 * 2);
    linv.set(invert3(L), 0); linv.set(invert3(L), 9);
    const d = Float32Array.from([0.1, 0.2, 0.3]);
    const local = toLocal(d, { J: [0, 0, 0, 0], W: [1, 0, 0, 0] }, linv);
    const back = [0, 1, 2].map((c) => local[0] * L[c] + local[1] * L[3 + c] + local[2] * L[6 + c]);
    back.forEach((x, i) => expect(x).toBeCloseTo(d[i], 6));
  });
  it('invert3 inverts, and a singular matrix is identity rather than NaN', () => {
    const m = [2, 1, 0, 0, 1, 3, 1, 0, 1];
    const i = invert3(m);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const v = m[r * 3] * i[c] + m[r * 3 + 1] * i[3 + c] + m[r * 3 + 2] * i[6 + c];
      expect(v).toBeCloseTo(r === c ? 1 : 0, 6);
    }
    expect(Array.from(invert3([1, 2, 3, 2, 4, 6, 0, 0, 1]))).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
  it('groupTransfer moves each group whole, by the mean offset of the source within reach of its centre', () => {
    // two "eyes" at x = ±1, a face vertex beside each (and one far away that must not count)
    const src = Float32Array.from([-1, 0, 0.05, 1, 0, 0.05, 0, 5, 0]);
    const sd = Float32Array.from([0, 0, 0.02, 0, 0, 0.04, 9, 9, 9]);
    const dst = Float32Array.from([-1.01, 0, 0, -0.99, 0, 0, 0.99, 0, 0, 1.01, 0, 0]);
    const out = Array.from(groupTransfer(src, sd, dst, [0, 0, 1, 1], 0.1)).map((x) => Math.round(x * 1e6) / 1e6);
    expect(out).toEqual([0, 0, 0.02, 0, 0, 0.02, 0, 0, 0.04, 0, 0, 0.04]);
    // nothing in reach: the group stays put
    expect(Array.from(groupTransfer(src, sd, dst, [0, 0, 1, 1], 0.01)).every((x) => x === 0)).toBe(true);
  });
});
