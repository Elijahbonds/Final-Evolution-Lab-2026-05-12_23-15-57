// The part library: every shape builds, is low poly, is about 10 cm, and faces out (IMPROVE (2026-10-06), CREATOR-PLAN
// phase 2). Pure geometry, no engine.
import { describe, expect, it } from 'vitest';
import { Matrix, Quaternion, Vector3, VertexData } from '@babylonjs/core';
import { PART_SHAPES } from '../../../creator/look/doc';
import { BUILT_SHAPES, MAX_SHAPE_VERTS, shapeGeo } from './shapes';
import { bake, earClip, extrude, type Geo } from './geometry';

/** Triangles whose own facing (as Babylon computes it) disagrees with the normals the shape gives its vertices. */
function backwards(g: Geo): number {
  let bad = 0;
  for (let t = 0; t < g.indices.length; t += 3) {
    const ids = [g.indices[t], g.indices[t + 1], g.indices[t + 2]];
    const pos = ids.flatMap((i) => [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]]);
    const n: number[] = [];
    VertexData.ComputeNormals(pos, [0, 1, 2], n);
    if (!Number.isFinite(n[0]) || Math.hypot(n[0], n[1], n[2]) < 0.5) continue;   // a degenerate sliver at a pole
    let d = 0;
    for (const i of ids) d += n[0] * g.normals[i * 3] + n[1] * g.normals[i * 3 + 1] + n[2] * g.normals[i * 3 + 2];
    if (d < 0) bad++;
  }
  return bad;
}
function extent(g: Geo): number[] {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < g.positions.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], g.positions[i + k]); mx[k] = Math.max(mx[k], g.positions[i + k]); }
  return mx.map((v, k) => v - mn[k]);
}

describe('every part shape', () => {
  it('has a builder (PART_SHAPES is the allow-list, nothing is left unbuilt)', () => {
    expect([...BUILT_SHAPES]).toEqual([...PART_SHAPES]);
    expect(PART_SHAPES.length).toBeGreaterThanOrEqual(19);
  });

  for (const shape of PART_SHAPES) {
    it(`${shape}: builds, low poly, ~10 cm, valid indices, faces out`, () => {
      const g = shapeGeo(shape);
      const verts = g.positions.length / 3;
      expect(verts).toBeGreaterThan(3);
      expect(verts, 'phone vertex budget').toBeLessThanOrEqual(MAX_SHAPE_VERTS);
      expect(g.normals.length).toBe(g.positions.length);
      expect(g.indices.length % 3).toBe(0);
      expect(g.indices.every((i) => i >= 0 && i < verts)).toBe(true);
      expect(g.positions.every(Number.isFinite) && g.normals.every(Number.isFinite)).toBe(true);
      const e = extent(g);
      expect(Math.max(...e), 'about 10 cm at scale 1').toBeGreaterThanOrEqual(0.06);
      expect(Math.max(...e)).toBeLessThanOrEqual(0.21);
      expect(backwards(g), 'triangles wound against their normals').toBe(0);
    });
  }

  it('is built once and shared', () => { expect(shapeGeo('spike')).toBe(shapeGeo('spike')); });

  it('64 of the heaviest shape stay inside a phone budget (< 26k vertices for a whole body of parts)', () => {
    const heaviest = Math.max(...PART_SHAPES.map((s) => shapeGeo(s).positions.length / 3));
    expect(heaviest * 64).toBeLessThan(26_000);
  });
});

describe('baking a placement', () => {
  it('a mirror (reflecting) placement flips the winding so the faces still face out', () => {
    const g = shapeGeo('wing');
    const mirrored = bake(g, Matrix.Scaling(-1, 1, 1));
    expect(backwards(mirrored)).toBe(0);
    // control: reflecting the points without flipping the winding is exactly what the check catches
    const naive: Geo = { ...mirrored, indices: g.indices.slice() };
    expect(backwards(naive)).toBeGreaterThan(0);
  });

  it('a squash keeps normals perpendicular to the surface (inverse transpose)', () => {
    const g = shapeGeo('sphere');
    const m = Matrix.Compose(new Vector3(3, 0.5, 1), Quaternion.RotationYawPitchRoll(0.3, 0.2, 0.1), new Vector3(0.1, 0.2, 0.3));
    const b = bake(g, m);
    // every edge of every triangle is perpendicular to the face normal (flat-ish triangles on a fine sphere: loose bound)
    let worst = 0;
    for (let t = 0; t < b.indices.length; t += 3) {
      const [i, j] = [b.indices[t] * 3, b.indices[t + 1] * 3];
      const ex = b.positions[j] - b.positions[i], ey = b.positions[j + 1] - b.positions[i + 1], ez = b.positions[j + 2] - b.positions[i + 2];
      const l = Math.hypot(ex, ey, ez); if (l < 1e-6) continue;
      const nx = b.normals[i] + b.normals[j], ny = b.normals[i + 1] + b.normals[j + 1], nz = b.normals[i + 2] + b.normals[j + 2];
      const ln = Math.hypot(nx, ny, nz); if (ln < 1e-6) continue;
      worst = Math.max(worst, Math.abs((ex * nx + ey * ny + ez * nz) / (l * ln)));
    }
    expect(worst).toBeLessThan(0.35);
    // control: transforming the normals by the matrix itself (not its inverse transpose) is visibly wrong under a squash
    const plain = bake(g, Matrix.Identity());
    const wrongN = plain.normals.slice();
    for (let i = 0; i < wrongN.length; i += 3) {
      const v = Vector3.TransformNormal(new Vector3(wrongN[i], wrongN[i + 1], wrongN[i + 2]), m).normalize();
      wrongN[i] = v.x; wrongN[i + 1] = v.y; wrongN[i + 2] = v.z;
    }
    const dot = (a: number[], c: number[]) => { let s = 0; for (let i = 0; i < a.length; i += 3) s += Math.abs(a[i] * c[i] + a[i + 1] * c[i + 1] + a[i + 2] * c[i + 2]); return s / (a.length / 3); };
    expect(dot(wrongN, b.normals)).toBeLessThan(0.99);
  });

  it('ear clipping handles a concave outline (the wing) without dropping area', () => {
    const outline: [number, number][] = [[0, 0], [2, 0], [2, 2], [1, 1], [0, 2]];
    const tris = earClip(outline);
    expect(tris).toHaveLength(3);
    const area = tris.reduce((s, [a, b, c]) => s + Math.abs((outline[b][0] - outline[a][0]) * (outline[c][1] - outline[a][1]) - (outline[b][1] - outline[a][1]) * (outline[c][0] - outline[a][0])) / 2, 0);
    expect(area).toBeCloseTo(3);
    expect(backwards(extrude(outline, 0.1))).toBe(0);
  });
});
