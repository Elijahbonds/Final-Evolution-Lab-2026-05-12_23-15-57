// hoops-p08 (2026-11-12): the half court's Venice — the cut-out crowd only behind the dunk's rim, a sign that reads the right way from
// both sides, the phone's rail, and the shared grounds. Each rule's knob value "as before" restores the old build (pinned here).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HALF_COURT_CROWD_CARDS, PHONE_RAIL_BODIES, SHARED_GROUND_ON, SIGN_BACK_UVS, SIGN_FRONT_UVS, railSpots } from './veniceBoardwalk';

const SRC = readFileSync('lib/babylon/nexus/veniceBoardwalk.ts', 'utf8');
const VENUE = readFileSync('lib/babylon/core/NexusVenue.ts', 'utf8');

describe('the half court Venice (hoops-p08)', () => {
  it('the crowd cards: the dunk keeps them; 1v1, 3v3 and 3-Point do not load the file (knob 1 = everywhere, as before)', () => {
    expect(HALF_COURT_CROWD_CARDS).toBe(0);
    expect(VENUE).toMatch(/crowdCards: modeId === 'basketball_dunk' \|\| feel\('venue\.halfCourtCrowdCards', HALF_COURT_CROWD_CARDS\) >= 0\.5/);
    expect(SRC).toMatch(/const withCrowd = opts\.crowdCards !== false;/);
    expect(SRC).toMatch(/\.\.\.\(withCrowd \? \['venice_crowd_cards\.glb'\] : \[\]\)/);
  });
  it('a sign is double-sided geometry with its back face\'s u reversed: no mirrored text from either side', () => {
    expect([SIGN_FRONT_UVS.x, SIGN_FRONT_UVS.z]).toEqual([0, 1]);
    expect([SIGN_BACK_UVS.x, SIGN_BACK_UVS.z]).toEqual([1, 0]);
    expect(SRC).toMatch(/sideOrientation: Mesh\.DOUBLESIDE, frontUVs: SIGN_FRONT_UVS, backUVs: SIGN_BACK_UVS/);
    expect(SRC).not.toMatch(/m\.backFaceCulling = false;\s*\n\s*plane\.material = m;/);
  });
  it('the rail: five onlookers as before on every tier; a half-court phone keeps two (the ends); 5 restores all five', () => {
    const spots = Array.from({ length: 9 }, (_, i) => i);
    expect(railSpots(spots, Infinity)).toEqual(spots);          // Onlookers then takes 0, 2, 4, 6, 8 itself
    expect(PHONE_RAIL_BODIES).toBe(2);
    expect(railSpots(spots, 2)).toEqual([0, 8]);
    expect(railSpots(spots, 3)).toEqual([0, 4, 8]);
    expect(railSpots(spots, 5)).toEqual(spots);
    expect(railSpots(spots, 1)).toEqual([4]);
    expect(railSpots(spots, 0)).toEqual([]);
  });
  it('the shared grounds: one texture and one material per look, tiling in the UVs; 0 = a copy per plane, as before', () => {
    expect(SHARED_GROUND_ON).toBe(1);
    expect(SRC).toMatch(/const su = Math\.max\(1, w \/ TILE_M\[kind\]\), sv = Math\.max\(1, d \/ TILE_M\[kind\]\)/);   // the old texture u/v scale
    expect(SRC).toMatch(/const t = groundTexture\(scene, kind\);/);   // the kind's own tile, not a copy
    expect(SRC).toMatch(/m\.albedoTexture = groundTextureFor\(scene, kind, w \/ TILE_M\[kind\], d \/ TILE_M\[kind\]\)/);   // the old path, kept
  });
  it('a phone court drops the backdrop dome its own sky covers (the venue sky, radius 200, is inside the dome, 280, and the ring, 235)', () => {
    expect(VENUE).toMatch(/feel\('perf\.coveredSkyOff', COVERED_SKY_OFF\) >= 0\.5/);
    expect(VENUE).toMatch(/for \(const name of \['bk_dome', 'bk_ring'\]\)/);
    const sky = readFileSync('lib/babylon/nexus/NexusWebScene.ts', 'utf8'), bk = readFileSync('lib/babylon/visual/Backdrops.ts', 'utf8');
    expect(sky).toMatch(/CreateSphere\('nexus_sky', \{ diameter: 400,/);
    expect(bk).toMatch(/CreateSphere\('bk_dome', \{ diameter: 560,/);
    expect(bk).toMatch(/CreateCylinder\('bk_ring', \{\s*diameter: 470,/);
  });
});
