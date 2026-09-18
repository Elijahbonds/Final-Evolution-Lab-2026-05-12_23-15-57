// SHARED-PLACE-FLOOR — the PLACE rules every venue floor, stand and spawn is held to.
import { describe, expect, it } from 'vitest';
import { FLOOR_LUMA, lumaHex, placeVerdict, readableFloorHex, separatedHex, PLACE_BAR } from './placeRules';
import { VENUE_SPECS } from '../nexus/venueSpecs';
import { SKATE_VENUES, SNOW_VENUES, SURF_VENUES } from '../nexus/boardVenues';

describe('floor value', () => {
  it('pulls the melted Venice floor (#b8a48c, luma 0.66) down into the readable band and keeps its hue', () => {
    const out = readableFloorHex('#b8a48c');
    expect(lumaHex(out)).toBeLessThanOrEqual(FLOOR_LUMA.max + 0.005);
    expect(lumaHex(out)).toBeGreaterThan(FLOOR_LUMA.max - 0.03);
    // hue kept: the channel order stays r > g > b
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(out.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(g); expect(g).toBeGreaterThan(b);
  });
  it('lifts a black hole and leaves an in-band floor exactly as authored', () => {
    expect(lumaHex(readableFloorHex('#101010'))).toBeGreaterThanOrEqual(FLOOR_LUMA.min - 0.005);
    expect(readableFloorHex('#4c4a52')).toBe('#4c4a52');
  });
  it('every skate venue floor ends up in band, and its ramps a real value step off it', () => {
    for (const v of SKATE_VENUES) {
      const floor = readableFloorHex(v.palette.ground);
      const l = lumaHex(floor);
      expect(l, v.id).toBeGreaterThanOrEqual(FLOOR_LUMA.min - 0.005);
      expect(l, v.id).toBeLessThanOrEqual(FLOOR_LUMA.max + 0.005);
      expect(Math.abs(lumaHex(separatedHex(v.palette.structure, floor, 0.13)) - l), v.id).toBeGreaterThanOrEqual(0.12);
    }
    // snow and surf are not run through the floor band (snow IS bright); this test is about the ride floors that melted
    expect(SNOW_VENUES.length + SURF_VENUES.length).toBeGreaterThan(0);
  });
});

describe('the PLACE checklist', () => {
  const good = { floorGap: 0, midProps: 20, spawnFacing: 1, flatShare: 0.2 };
  it('passes a readable place', () => expect(placeVerdict(good)).toEqual({ pass: true, fails: [] }));
  it('fails each of the four ways a place goes wrong, by name', () => {
    expect(placeVerdict({ ...good, floorGap: null }).fails).toEqual(['no floor under the spawn']);
    expect(placeVerdict({ ...good, floorGap: 0.4 }).fails[0]).toMatch(/float/);
    expect(placeVerdict({ ...good, floorGap: -0.3 }).fails[0]).toMatch(/sunk/);
    expect(placeVerdict({ ...good, midProps: PLACE_BAR.midProps - 1 }).fails[0]).toMatch(/mid props/);
    expect(placeVerdict({ ...good, spawnFacing: -0.5 }).fails[0]).toMatch(/faces away/);
    expect(placeVerdict({ ...good, flatShare: 0.9 }).fails[0]).toMatch(/flat floor/);   // the melted field / grey void
  });
});

describe('every venue stand faces its play', () => {
  it('a crowdTier at position p with rotationY θ looks down its local +z toward the origin', () => {
    // the stand builder faces +z; penalty's stand behind the goal carried rotation 0 at z +24 and showed the pitch its back
    const wrong: string[] = [];
    for (const [id, spec] of Object.entries(VENUE_SPECS)) for (const p of spec.props) {
      if (p.kind !== 'crowdTier') continue;
      const th = p.rotationY ?? 0;
      const fx = Math.sin(th), fz = Math.cos(th);
      const tx = -p.position[0], tz = -p.position[2];
      if (fx * tx + fz * tz <= 0) wrong.push(`${id} @ ${p.position.join(',')}`);
    }
    expect(wrong).toEqual([]);
  });
});
