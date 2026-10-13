// vis-hoops-dunk — what the court keeps: the plans (pure) and the stamp into the shared pool (a scene with none takes none).
import { describe, expect, it } from 'vitest';
import { NullEngine, Scene } from '@babylonjs/core';
import { landMarks, plantMarks, shotMarks, stampCourt } from './courtMarks';
import { DECAL_SIZE } from '../visual/GroundDecals';

describe('plans', () => {
  it('a plant is a scuff along the run and a print beside it; faster is a longer scuff', () => {
    const slow = plantMarks({ x: 1, z: 2 }, 0, 0), fast = plantMarks({ x: 1, z: 2 }, 0, 1);
    expect(slow.map((m) => m.kind)).toEqual(['scuff', 'foot']);
    expect(fast[0].scale).toBeGreaterThan(slow[0].scale);
    expect(fast[1].x).not.toBe(fast[0].x);   // the print is beside the scuff, not on it
  });
  it('a landing is a scuff and a print either side of it, bigger for a bigger drop', () => {
    const soft = landMarks({ x: 0, z: 0 }, 1, 0), hard = landMarks({ x: 0, z: 0 }, 1, 1);
    expect(hard.map((m) => m.kind)).toEqual(['scuff', 'foot', 'foot']);
    expect(hard[0].scale).toBeGreaterThan(soft[0].scale);
    const [, a, b] = hard; expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.3);   // two feet, not one
  });
  it('a shot is the two feet set a stride apart, squared to the way he faces', () => {
    const [l, r] = shotMarks({ x: 0, z: 0 }, 0);
    expect(l.kind).toBe('foot'); expect(r.kind).toBe('foot');
    expect(l.yaw).toBe(r.yaw);
    expect(Math.abs(l.x - r.x)).toBeCloseTo(0.34, 5);
  });
  it('a nonsense strength is a plain mark, never NaN', () => {
    for (const m of [...landMarks({ x: 0, z: 0 }, 0, NaN), ...plantMarks({ x: 0, z: 0 }, 0, -4)]) {
      expect(Number.isFinite(m.scale)).toBe(true); expect(Number.isFinite(m.x)).toBe(true);
    }
  });
});

describe('stampCourt', () => {
  it('a scene with no decal pool takes none (and does not throw)', () => {
    const s = new Scene(new NullEngine());
    expect(stampCourt(s, landMarks({ x: 0, z: 0 }, 0, 0.5))).toBe(0);
  });
  it('with a pool it lays every mark, at the given height, with its own scale', () => {
    const s = new Scene(new NullEngine());
    const laid: { kind: string; x: number; z: number; y?: number; scale?: number }[] = [];
    (s.metadata ??= {}).felDecals = { stamp: (kind: string, x: number, z: number, _yaw: number, o: { y?: number; scale?: number } = {}) => { laid.push({ kind, x, z, y: o.y, scale: o.scale }); } };
    expect(stampCourt(s, landMarks({ x: 3, z: -4 }, 0, 1), 0.02)).toBe(3);
    expect(laid.map((l) => l.kind)).toEqual(['scuff', 'foot', 'foot']);
    expect(laid.every((l) => l.y === 0.02)).toBe(true);
    expect(laid[0].x).toBe(3); expect(laid[0].z).toBe(-4);
  });
  it('the marks fit the decal pool\'s own sizes (a scuff is at most a couple of metres)', () => {
    for (const m of landMarks({ x: 0, z: 0 }, 0, 1)) expect(DECAL_SIZE[m.kind][1] * m.scale).toBeLessThan(2.5);
    for (const m of plantMarks({ x: 0, z: 0 }, 0, 1)) expect(DECAL_SIZE[m.kind][1] * m.scale).toBeLessThan(2.5);
  });
});
