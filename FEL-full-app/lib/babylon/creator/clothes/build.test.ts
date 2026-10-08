// The builder's pure helpers (IMPROVE (2026-10-06), CREATOR-PLAN phase 4e): the convex hull and the ray to it (a tube's
// rings), distances to an open edge (the trim, the hide margin), smoothing that never moves a hem, the open edges of a
// clipped surface, the cache key (colours out, two-tone in), the tones a kind can show, the swatch block, the base raster.
import { describe, expect, it } from 'vitest';
import { clothGeometryKey, convexHull, distanceTo, effectiveTone, openEdges, rayToHull, smoothPinned, swatchUV, SWATCH } from './build';
import { rasterClothBase } from './baseRaster';
import { resolveCloth } from '../../../creator/look/clothes';
import type { CreatorCloth } from '../../../creator/look/doc';

describe('the tube\'s cross-section', () => {
  it('convex hull: the outer points, counter-clockwise; inner points (the gap between two legs) are bridged', () => {
    // two "legs" (squares) side by side with a gap: the hull spans both
    const pts = [-0.15, -0.05, -0.05, -0.05, -0.05, 0.05, -0.15, 0.05, 0.05, -0.05, 0.15, -0.05, 0.15, 0.05, 0.05, 0.05, 0, 0];
    const h = convexHull(pts);
    expect(h.length / 2).toBe(4);
    let area = 0;
    for (let i = 0; i < h.length / 2; i++) { const j = (i + 1) % (h.length / 2); area += h[i * 2] * h[j * 2 + 1] - h[j * 2] * h[i * 2 + 1]; }
    expect(area / 2).toBeCloseTo(0.3 * 0.1, 6);   // counter-clockwise: positive
    // straight forward from the middle (between the legs) the hull is at the front edge, not in the gap
    expect(rayToHull(h, 0, 0, 0, 1)).toBeCloseTo(0.05, 6);
    expect(rayToHull(h, 0, 0, 1, 0)).toBeCloseTo(0.15, 6);
    expect(rayToHull(h, 0, 0, Math.SQRT1_2, Math.SQRT1_2)).toBeCloseTo(0.05 * Math.SQRT2, 6);
  });
});

describe('distances and open edges', () => {
  it('distanceTo is the nearest point, capped', () => {
    const pts = Float32Array.from([0, 0, 0, 1, 0, 0]);
    const d = distanceTo(pts, [0.02, 0, 0, 0.5, 0, 0, 0.99, 0.01, 0], 0.06);
    expect(d[0]).toBeCloseTo(0.02, 6);
    expect(d[1]).toBeCloseTo(0.06, 6);
    expect(d[2]).toBeCloseTo(Math.hypot(0.01, 0.01), 6);
  });
  it('a square of two triangles has four open edges; a seam twin welds (not an edge)', () => {
    // the square's two triangles share the diagonal through a SEAM: vertex 4 duplicates vertex 0, vertex 5 vertex 2
    const P = Float32Array.from([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0.0001, 1, 1, 0]);
    const e = openEdges(P, [0, 1, 2, 4, 5, 3]);
    expect([...e.onEdge].every((x) => x === 1)).toBe(true);
    // 4 border edges: each pushes one end and its middle, plus each edge vertex once
    expect(e.points.length / 3).toBe(4 * 2 + 4);
    const d = distanceTo(e.points, [0.5, 0.5, 0], 1);
    expect(d[0]).toBeCloseTo(0.5, 5);   // the middle is 0.5 from the border — the diagonal is not an edge
  });
});

describe('smoothPinned', () => {
  it('smooths the inside and never moves a pinned (open-edge) vertex', () => {
    // a fan: centre 0 raised, ring 1..6 pinned
    const P: number[] = [0, 0, 1];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; P.push(Math.cos(a), Math.sin(a), 0); }
    const tris: number[] = [];
    for (let i = 0; i < 6; i++) tris.push(0, 1 + i, 1 + ((i + 1) % 6));
    const pos = Float32Array.from(P);
    const weld = Int32Array.from([0, 1, 2, 3, 4, 5, 6]);
    const pinned = Uint8Array.from([0, 1, 1, 1, 1, 1, 1]);
    smoothPinned(pos, weld, 7, tris, pinned, 3);
    expect(pos[2]).toBeLessThan(1);
    expect(pos[2]).toBeGreaterThan(0);
    for (let v = 1; v < 7; v++) { expect(pos[v * 3]).toBeCloseTo(P[v * 3], 9); expect(pos[v * 3 + 2]).toBe(0); }
  });
});

describe('the cache key and the tones', () => {
  const c = (o: Partial<CreatorCloth>): CreatorCloth => ({ id: 'c1', kind: 'top', style: 'tee', colour: '#111111', ...o } as CreatorCloth);
  it('a colour change keeps the key; turning two-tone on, a cut or a reorder changes it', () => {
    expect(clothGeometryKey([c({})])).toBe(clothGeometryKey([c({ colour: '#FF0000' })]));
    expect(clothGeometryKey([c({ colour2: '#000000' })])).toBe(clothGeometryKey([c({ colour2: '#FFFFFF' })]));
    expect(clothGeometryKey([c({})])).not.toBe(clothGeometryKey([c({ colour2: '#000000' })]));
    expect(clothGeometryKey([c({})])).not.toBe(clothGeometryKey([c({ sleeve: 'long' })]));
    const a = c({ id: 'a' }), b = c({ id: 'b', style: 'jacket' });
    expect(clothGeometryKey([a, b])).not.toBe(clothGeometryKey([b, a]));
  });
  it('a tone that does not apply to a kind falls back to the trim', () => {
    expect(effectiveTone(resolveCloth({ id: 'a', kind: 'bottom', style: 'pants', colour: '#111111', colour2: '#FFFFFF', tone: 'sleeves' }))).toBe('trim');
    expect(effectiveTone(resolveCloth({ id: 'a', kind: 'top', style: 'tee', colour: '#111111', colour2: '#FFFFFF', tone: 'sole' }))).toBe('trim');
    expect(effectiveTone(resolveCloth({ id: 'a', kind: 'feet', style: 'shoes', colour: '#111111', colour2: '#FFFFFF' }))).toBe('sole');
    expect(effectiveTone(resolveCloth({ id: 'a', kind: 'top', style: 'tee', colour: '#111111', colour2: '#FFFFFF', tone: 'yoke' }))).toBe('yoke');
  });
});

describe('the swatches and the base raster', () => {
  it('every piece and colour has its own swatch inside the reserved block', () => {
    const seen = new Set<string>();
    for (let p = 0; p < 6; p++) for (const t of [0, 1] as const) {
      const [u, v] = swatchUV(p, t);
      expect(u).toBeGreaterThan(SWATCH.u0); expect(u).toBeLessThan(1);
      expect(v).toBeGreaterThan(SWATCH.v0); expect(v).toBeLessThan(SWATCH.v0 + SWATCH.size);
      seen.add(`${u},${v}`);
    }
    expect(seen.size).toBe(12);
  });
  it('rasterises each triangle in its colour (outer last wins), pads islands, fills the swatches; gamma bytes', () => {
    // two overlapping triangles in UV: piece 0 (red) then piece 1 (blue) over its corner
    const uv = [0.1, 0.1, 0.5, 0.1, 0.1, 0.5, 0.2, 0.2, 0.6, 0.2, 0.2, 0.6];
    const ind = [0, 1, 2, 3, 4, 5];
    const colour = [0, 0, 0, 2, 2, 2];
    const palette: [number, number, number][] = [[1, 0, 0], [1, 0, 0], [0, 0, 1], [0, 0, 1]];
    const size = 64;
    const buf = rasterClothBase(uv, ind, colour, palette, size, 2);
    const px = (u: number, v: number) => { const i = (Math.floor(v * size) * size + Math.floor(u * size)) * 4; return [buf[i], buf[i + 1], buf[i + 2]]; };
    expect(px(0.15, 0.15)).toEqual([255, 0, 0]);
    expect(px(0.25, 0.25)).toEqual([0, 0, 255]);
    expect(px(0.098, 0.15)).toEqual([255, 0, 0]);    // padded just outside the island
    const [su, sv] = swatchUV(1, 0);
    expect(px(su, sv)).toEqual([0, 0, 255]);
    // a mid grey is stored as its gamma byte (what the shader's linear multiply reads back as 0.5)
    const grey = rasterClothBase(uv, ind, [0, 0, 0, 0, 0, 0], [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5]], size, 1);
    const g = Math.round(255 * Math.pow(0.5, 1 / 2.2));
    expect(grey[(Math.floor(0.15 * size) * size + Math.floor(0.15 * size)) * 4]).toBe(g);
  });
});
