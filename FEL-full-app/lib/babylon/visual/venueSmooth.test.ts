// VENUE-SMOOTH-1 (2026-10-29): 3D Art's market tent v2 in the Venice sets, and its shrub removal list on 'venice-court-meshy'.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SMOOTH_TENT, VENUE_PROP_SETS } from './venuePropSets';
import { creditForPublicPath } from '../../credits/credits';

const PUB = join(__dirname, '..', '..', '..', 'public');
const glbJson = (f: string): { asset: { generator?: string }; extensionsUsed?: string[] } => {
  const b = readFileSync(f); const n = b.readUInt32LE(12); return JSON.parse(b.subarray(20, 20 + n).toString('utf8'));
};

describe('the smooth market tent', () => {
  it('ships its three LODs and CREDITS.md, written without gltf-transform, credited as our own work', () => {
    for (const l of [0, 1, 2]) {
      const f = join(PUB, 'models/props/smooth', `market_tent_v2_lod${l}.glb`);
      expect(existsSync(f)).toBe(true);
      expect(glbJson(f).asset.generator).toBe('FEL box glbw.py (no gltf-transform)');
      expect(creditForPublicPath(`models/props/smooth/market_tent_v2_lod${l}.glb`)?.id).toBe('fel');
    }
    expect(readFileSync(join(PUB, 'models/props/smooth/CREDITS.md'), 'utf8')).toMatch(/market_tent_v2_lod0\.glb.*Our own work, dedicated CC0/);
    expect(existsSync(join(PUB, `models/props/${SMOOTH_TENT.kit}/${SMOOTH_TENT.model}.glb`))).toBe(true);
  });
  it('stands in every Kenney tent of venice-court-meshy (1v1, 3v3), at the same spots and scale', () => {
    const ps = VENUE_PROP_SETS['venice-court-meshy'];
    expect(ps.some((p) => p.kit === 'racing' && p.model === 'tent')).toBe(false);
    const t = ps.filter((p) => p.kit === 'smooth' && p.model === SMOOTH_TENT.model);
    expect(t.map((p) => [p.at[0], p.at[2], p.scale])).toEqual([[33, -21, 2.6], [33, 18, 2.6], [22, -48, 2.6], [33, 40, 2.6], [-22, -48, 2.6]]);
  });
  it('leaves the other venues\' Kenney tents alone', () => {
    const others = Object.entries(VENUE_PROP_SETS).filter(([k]) => k !== 'venice-court-meshy');   // the dunk set's included
    expect(others.some(([, ps]) => ps.some((p) => p.kit === 'racing' && p.model === 'tent'))).toBe(true);
    expect(others.some(([, ps]) => ps.some((p) => p.kit === 'smooth'))).toBe(false);
  });
});

describe('the shrub removal list (03-shrub-REMOVAL-LIST.md) on venice-court-meshy', () => {
  const ps = VENUE_PROP_SETS['venice-court-meshy'];
  it('no bush, no grass clump and no low fence is left: 36 placements gone', () => {
    for (const m of ['plant_bushLarge', 'plant_bush', 'grass_large', 'fence-low']) expect(ps.filter((p) => p.model === m)).toEqual([]);
  });
  it('the palms, lamps, shops, bus and sedan stay', () => {
    for (const m of ['tree_palmDetailedTall', 'tree_palm', 'lightPostModern', 'hoopbus', 'sedan']) expect(ps.some((p) => p.model === m)).toBe(true);
  });
});
