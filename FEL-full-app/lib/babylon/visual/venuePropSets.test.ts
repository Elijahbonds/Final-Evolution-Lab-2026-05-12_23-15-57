// venuePropSets — every prop stands outside its play area and every model it names ships.
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { VENUE_PROP_SETS } from './venuePropSets';

// play areas (x half-width, z range) the props must clear — from the modes' own venues
const PLAY: Record<string, { hx: number; z: [number, number] }> = {
  'venice-court': { hx: 8, z: [-14, 14] },       // 16×28 court
  'venice-court-meshy': { hx: 8, z: [-14, 14] }, // the same court with the owner's Meshy hoopbus and sedan behind the hoop
  'canopy-court': { hx: 8, z: [-14, 14] },       // court locations (docs/SPEC-COURT-LOCATIONS.md): the same court
  'night-rooftop': { hx: 8, z: [-14, 14] },
  'dojo':         { hx: 7, z: [-7, 7] },         // 14×14 mat
  'links':        { hx: 12, z: [-42, 42] },      // fairway strip inside the 60×90 green
  'ballpark':     { hx: 28, z: [-40, 40] },      // diamond + outfield
  'stadium':      { hx: 22, z: [-30, 12] },      // penalty box side of the pitch, goal line z 10.4
  'gridiron':     { hx: 22, z: [-2, 42] },       // x ±20 over z 0..40
  'skatepark':    { hx: 34, z: [-34, 34] },
  'slope':        { hx: 17, z: [-30, 260] },     // piste half-width
  'surf-break':   { hx: 45, z: [-20, 200] },
  'gym':          { hx: 10, z: [-12, 12] },
};

describe('venuePropSets', () => {
  it('names only models that ship under public/models/props', () => {
    const missing: string[] = [];
    for (const set of Object.values(VENUE_PROP_SETS)) for (const p of set) {
      const f = `public/models/props/${p.kit}/${p.model}.glb`;
      if (!existsSync(f)) missing.push(f);
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it('keeps every prop outside its venue play area', () => {
    const inside: string[] = [];
    for (const [venue, set] of Object.entries(VENUE_PROP_SETS)) {
      const area = PLAY[venue]; expect(area, `play area for ${venue}`).toBeTruthy();
      for (const p of set) {
        const [x, , z] = p.at;
        if (Math.abs(x) < area.hx && z > area.z[0] && z < area.z[1]) inside.push(`${venue}: ${p.model} at ${x},${z}`);
      }
    }
    expect(inside).toEqual([]);
  });

  it('covers every venue a mode mounts props for', () => {
    for (const k of ['venice-court', 'dojo', 'links', 'ballpark', 'stadium', 'gridiron', 'skatepark', 'slope', 'surf-break', 'gym']) {
      expect(VENUE_PROP_SETS[k]?.length, k).toBeGreaterThan(0);
    }
  });
});
