import { describe, expect, it } from 'vitest';
import { floorDetailFor, TILE_M } from './groundTextures';

describe('floor grain — which builder floors take a tiled detail map', () => {
  it('fields take grass, the beach court sand, the street asphalt, hardcourt a faint concrete', () => {
    for (const k of ['pitch', 'diamond', 'green']) expect(floorDetailFor(k)?.kind).toBe('grass');
    expect(floorDetailFor('sand')?.kind).toBe('sand');
    expect(floorDetailFor('street')?.kind).toBe('asphalt');
    expect(floorDetailFor('hardcourt')).toEqual({ kind: 'concrete', blend: 0.22 });
  });
  it('painted floors keep their paint: court, mat, stage, snow, water and unknown kinds get no grain', () => {
    for (const k of ['court', 'mat', 'stage', 'snow', 'water', 'nope']) expect(floorDetailFor(k)).toBeNull();
  });
  it('every grain kind has a tile size and blends stay subtle', () => {
    for (const k of ['pitch', 'sand', 'street', 'hardcourt']) {
      const d = floorDetailFor(k)!;
      expect(TILE_M[d.kind]).toBeGreaterThan(0);
      expect(d.blend).toBeGreaterThan(0); expect(d.blend).toBeLessThanOrEqual(0.6);
    }
  });
});
