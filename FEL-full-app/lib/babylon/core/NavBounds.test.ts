// NavBounds — the baked navmesh keeps a point on the walkable surface: inside stays, outside snaps to the nearest edge.
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { NavBounds, type NavMeshData } from './NavBounds';

const load = (key: string): NavMeshData | null => {
  const f = `public/models/navmesh/${key}.json`;
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as NavMeshData) : null;
};

describe('NavBounds', () => {
  it('a unit square: inside is identity, outside snaps to the nearest edge', () => {
    const nb = new NavBounds({ mapKey: 't', cell: 2, polys: [{ pts: [[-1, -1], [1, -1], [1, 1], [-1, 1]] }], bbox: [-1, -1, 1, 1] });
    expect(nb.contains(0, 0)).toBe(true);
    expect(nb.constrain(0.5, -0.5)).toEqual([0.5, -0.5]);
    expect(nb.contains(2, 0)).toBe(false);
    const [x, z] = nb.constrain(3, 0.25); expect(x).toBeCloseTo(1, 6); expect(z).toBeCloseTo(0.25, 6);
    const c = nb.constrain(-4, -4); expect(c[0]).toBeCloseTo(-1, 6); expect(c[1]).toBeCloseTo(-1, 6);
  });

  it('the baked dojo mesh contains the mat centre and rejects a point beyond the walls', () => {
    const data = load('dojo'); if (!data) return;   // navmesh not baked in this checkout
    const nb = new NavBounds(data);
    expect(nb.contains(0, 0)).toBe(true);
    expect(nb.contains(40, 40)).toBe(false);
    const [x, z] = nb.constrain(40, 40);
    expect(Math.hypot(x, z)).toBeLessThan(12);   // snapped back inside the ±7 m dojo footprint
    expect(nb.contains(x * 0.99, z * 0.99)).toBe(true);
  });

  it('every baked mesh has counter-clockwise polygons', () => {
    for (const key of ['dojo', 'venice-blue-court', 'soccer-stadium', 'baseball-park', 'tennis-court', 'venice-skatepark']) {
      const data = load(key); if (!data) continue;
      for (const p of data.polys) {
        let a = 0; for (let j = 0; j < p.pts.length; j++) { const q = p.pts[j], r = p.pts[(j + 1) % p.pts.length]; a += q[0] * r[1] - r[0] * q[1]; }
        expect(a, `${key} poly`).toBeGreaterThan(0);
      }
    }
  });
});
