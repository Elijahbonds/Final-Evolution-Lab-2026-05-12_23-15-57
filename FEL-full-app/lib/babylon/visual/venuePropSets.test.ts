// venuePropSets — every prop stands outside its play area and every model it names ships.
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { VENUE_PROP_SETS, surroundSize, surroundCovers, surroundColor, SURROUND_MARGIN, SURROUND_KIND } from './venuePropSets';

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

  it('keeps the chase camera\'s own corridor clear — nothing between the camera and the player at the snap', () => {
    // SHARED-PLACE-FLOOR: football's runner camera sits at (0, 3.2, −7.5) behind a runner at the origin; a gantry at
    // z −6 and a barrier line at z −4 were the white slab across the bottom of every frame, and the play-area check
    // above could not see it because the camera stands outside the play area by design.
    const CAM: Record<string, { hx: number; z: [number, number] }> = { gridiron: { hx: 6, z: [-10, 0] } };
    const blocking: string[] = [];
    for (const [venue, c] of Object.entries(CAM)) for (const p of VENUE_PROP_SETS[venue]) {
      const [x, , z] = p.at;
      if (Math.abs(x) < c.hx && z > c.z[0] && z < c.z[1]) blocking.push(`${venue}: ${p.model} at ${x},${z}`);
    }
    expect(blocking).toEqual([]);
  });

  it('covers every venue a mode mounts props for', () => {
    for (const k of ['venice-court', 'dojo', 'links', 'ballpark', 'stadium', 'gridiron', 'skatepark', 'slope', 'surf-break', 'gym']) {
      expect(VENUE_PROP_SETS[k]?.length, k).toBeGreaterThan(0);
    }
  });
});

describe('THE SURROUND — every prop stands on something', () => {
  // The ground audit (scripts/probes/_ground-audit.mts) found eighteen props standing over the VOID in
  // tennis, sixteen in derby and a handful in football and penalty: a venue's `ground` is its PLAYING
  // SURFACE (tennis is 16 × 34 m) while its props are authored in a much wider ring, and nothing checked
  // that the world reached them. The surround is derived from the props so it cannot drift; these hold the
  // derivation.
  it('the surround holds every prop in every set', () => {
    for (const [venue, set] of Object.entries(VENUE_PROP_SETS)) {
      const size = surroundSize(set, [16, 16]);
      expect(surroundCovers(set, size), `${venue} leaves a prop off its own ground`).toBe(true);
    }
  });

  it('it never shrinks below the playing surface — a surround smaller than the court is not a surround', () => {
    const [w, d] = surroundSize([], [46, 46]);
    expect(w).toBeGreaterThanOrEqual(46);
    expect(d).toBeGreaterThanOrEqual(46);
  });

  it('it reaches PAST the furthest prop, because a tree on the edge of a plane stands on a cliff', () => {
    const [w] = surroundSize([{ kit: 'k', model: 'm', at: [30, 0, 0] }], [10, 10]);
    expect(w / 2).toBeGreaterThanOrEqual(30 + SURROUND_MARGIN);
    expect(SURROUND_MARGIN).toBeGreaterThan(4);
  });

  it('tennis — the worst case — gets a surround several times its court', () => {
    // its own ground is 16 × 34 and it borrows the basketball court's set (palms at x ±16…±28, tier at z ±28)
    const [w, d] = surroundSize(VENUE_PROP_SETS['venice-court'], [16, 34]);
    expect(w).toBeGreaterThan(16 * 2);
    expect(d).toBeGreaterThan(34);
  });

  it('the surround is made of something, and it is not the court', () => {
    for (const kind of Object.keys(SURROUND_KIND)) {
      expect(surroundColor(kind)).toMatch(/^#[0-9a-f]{6}$/);
    }
    // grass around a pitch, concrete around a hardcourt, sand around a beach — getting this wrong is as
    // visible as the hole it fills
    expect(SURROUND_KIND.pitch.kind).toBe('grass');
    expect(SURROUND_KIND.hardcourt.kind).toBe('concrete');
    expect(SURROUND_KIND.sand.kind).toBe('sand');
    // an unknown ground kind falls back rather than throwing
    expect(surroundColor('no-such-kind')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
