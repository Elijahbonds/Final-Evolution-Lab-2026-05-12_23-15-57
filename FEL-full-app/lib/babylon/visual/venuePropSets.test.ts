// venuePropSets — every prop stands outside its play area and every model it names ships.
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { VENUE_PROP_SETS } from './venuePropSets';

// Play areas (x half-width, z range) the props must clear — from the modes' own venues.
//
// BOARD VENUES (2026-09-12): two of these were wrong, and the 'surf-break' one had caused a real defect.
// It claimed the play area ran to z 200, which swallowed the BEACH (the shore is at z 123…153) — so the only
// way to satisfy this guard was to put the palms, tents, shop and bus at NEGATIVE z, standing on open water
// behind the breaking wave. The guard was enforcing the bug. A surf lap never passes z ≈ 110 (the lip travels
// to z +90 and the rider sits on the face ahead of it), so that is where the play area ends and the sand
// begins. Measured with scripts/probes/_ground-audit.mts, which found a 48 m tent group floating on the sea.
//
// The board play areas are in the set's AUTHORED frame. Snow venues now bring their own corridor width
// (20 / 24 / 34 m) and mountVenueProps shifts the set outward by the difference (lateralShift), so the
// authored 17 m is the width these positions have to clear — not the widest venue's.
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
  // the authored piste half-width, over the RIDDEN run: the rider spawns at z 4 and descends to the finish
  // past the last gate (z 238). The start-gate fence stands at z −12, behind the start and on the snow.
  'slope':        { hx: 17, z: [0, 280] },
  'bigair-run':   { hx: 8, z: [-160, 20] },      // ARENA-10PHASE P9: the run line from the strides (z 0) over the kicker (z −12) to the landing (z −130)
  // the surfable water: the widest break clamps the rider at 77 m, and the lap never reaches the sand
  'surf-break':   { hx: 78, z: [-60, 110] },
  'beach-court':  { hx: 7.5, z: [-12, 12] },     // ARENA-10PHASE P5: the 18×9 court plus its 3 m free zone
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
