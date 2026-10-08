// CREATOR-PLAN phase 4d: the pick maths — a ray against triangles, the region a tap selects, the hit's atom.
import { describe, expect, it } from 'vitest';
import { ATOM_REGION, atomAt, lerpAt, rayTriangles, regionsOf, tapRegion } from './pickMath';
import { ATOMS, REGION_ATOMS } from '../paint/bodyChart';
import { PAINT_REGIONS } from '../../../creator/look/doc';

// two unit squares facing the ray, one at z = 1 and one at z = 2
const POS = [0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 0, 2, 1, 0, 2, 1, 1, 2, 0, 1, 2];
const IDX = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];

describe('a ray against triangles', () => {
  it('the nearest hit, its triangle and barycentrics', () => {
    const h = rayTriangles([0.25, 0.25, -5], [0, 0, 1], POS, IDX)!;
    expect(h.dist).toBeCloseTo(6, 9);
    expect(h.tri).toBe(0);
    const p = lerpAt(POS, 3, IDX, h);
    expect(p[0]).toBeCloseTo(0.25, 9); expect(p[1]).toBeCloseTo(0.25, 9); expect(p[2]).toBeCloseTo(1, 9);
  });
  it('hits from behind too (both faces), misses outside, respects the max distance', () => {
    expect(rayTriangles([0.5, 0.5, 5], [0, 0, -1], POS, IDX)!.dist).toBeCloseTo(3, 9);
    expect(rayTriangles([3, 3, -5], [0, 0, 1], POS, IDX)).toBeNull();
    expect(rayTriangles([0.5, 0.5, -5], [0, 0, 1], POS, IDX, 5)).toBeNull();
    expect(rayTriangles([0.5, 0.5, 1.5], [0, 0, 1], POS, IDX)!.tri).toBeGreaterThanOrEqual(2);   // starts past the first
  });
  it('the strongest atom at a hit (interpolated), none on a weightless spot', () => {
    const n = ATOMS.length;
    const W = new Float32Array(8 * n);
    for (const v of [0, 1, 2, 3]) W[v * n + ATOMS.indexOf('torsoFront')] = 1;
    W[2 * n + ATOMS.indexOf('torsoFront')] = 0; W[2 * n + ATOMS.indexOf('neck')] = 1;
    const near0 = rayTriangles([0.1, 0.05, -1], [0, 0, 1], POS, IDX)!;
    expect(atomAt(W, IDX, near0)).toBe('torsoFront');
    const near2 = rayTriangles([0.95, 0.9, -1], [0, 0, 1], POS, IDX)!;
    expect(atomAt(W, IDX, near2)).toBe('neck');
    expect(atomAt(new Float32Array(8 * n), IDX, near0)).toBeNull();
  });
});

describe('the region a tap selects', () => {
  it('every atom has a finest region that holds it, and regionsOf ends at `all`', () => {
    for (const a of ATOMS) {
      expect(REGION_ATOMS[ATOM_REGION[a]]).toContain(a);
      const list = regionsOf(a);
      expect(list[0]).toBe(ATOM_REGION[a]);
      expect(list[list.length - 1]).toBe('all');
      for (const r of list) expect(PAINT_REGIONS).toContain(r);
    }
  });
  it('tapping again widens: forearm → arm → body → all → forearm', () => {
    let r = tapRegion('forearmL', null);
    expect(r).toBe('forearmLeft');
    r = tapRegion('forearmL', r); expect(r).toBe('armLeft');
    r = tapRegion('forearmL', r); expect(r).toBe('body');
    r = tapRegion('forearmL', r); expect(r).toBe('all');
    r = tapRegion('forearmL', r); expect(r).toBe('forearmLeft');
    expect(tapRegion('face', 'torsoFront')).toBe('face');   // a tap somewhere else starts at its own finest region
    expect(tapRegion('scalp', null)).toBe('head');
  });
});
