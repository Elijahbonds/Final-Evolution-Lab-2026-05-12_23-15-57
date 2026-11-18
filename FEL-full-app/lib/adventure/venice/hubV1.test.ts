// venice-v1 (2026-11-17): the V1 hub's pure parts — the walkable courts district, walking up to a court and coming back.
import { describe, expect, it } from 'vitest';
import { buildHubWorld, courtsRect, returnSpawnFor, v1Area, v1Spots, V1_RIM_H } from './hubWorld';
import {
  clearReturn, FROM_VENICE, hubHrefFor, launchHref, launchOptions, launchRoute, PARTY_MODE_FOR_SPOT, readReturn, RETURN_KEY, RETURN_TTL_MS, spotFromSearch,
  veniceReturnHref, writeReturn, type StoreLike,
} from './hubReturn';
import { veniceDoorOn, VENICE_DOOR_HREF } from './door';
import { districtAt } from './layout';
import { ONLINE_MODES } from '@/server/netd/src/partyRules';

const mem = (): StoreLike & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
};

describe('the V1 world: the courts district, walkable', () => {
  const w = buildHubWorld();
  it('is ground everywhere inside the area, and the courts district is inside it', () => {
    const a = v1Area(), c = courtsRect();
    expect(c.minX).toBeGreaterThan(a.minX); expect(c.maxZ).toBeLessThan(a.maxZ);
    for (const [x, z] of [[c.minX, c.minZ], [c.maxX, c.maxZ], [(a.minX + a.maxX) / 2, (a.minZ + a.maxZ) / 2], [a.minX + 0.5, a.maxZ - 0.5]]) {
      expect(w.source.groundY(x, z), `${x},${z}`).toBe(0);
    }
  });
  it('holds the player in with a rim taller than a step, and nothing past it is ground', () => {
    const a = v1Area();
    expect(w.source.groundY(a.minX - 0.5, 0 + a.minZ + 10)).toBe(V1_RIM_H);
    expect(V1_RIM_H).toBeGreaterThan(0.45);   // A1's step-up
    expect(w.source.groundY(a.minX - 5, a.minZ + 10)).toBeNull();
  });
  it('spawns a cold start at the court gate, in the courts district', () => {
    expect(districtAt(w.spawn.pos.x, w.spawn.pos.z)?.id).toBe('courts');
  });
  it('opens the four courts: Court 1 is Ones, Court 2 is Threes', () => {
    const s = v1Spots();
    expect(s.map((x) => x.id)).toEqual(['court.ones', 'court.run', 'court.flight', 'court.arc']);
    expect(s[0].modes).toContain('hoops1v1'); expect(s[0].route).toBe('/play/onevone');
    expect(s[1].modes).toContain('hoops3v3'); expect(s[1].route).toBe('/play/threevthree');
  });
  it('puts a returning player beside the court they left, on walkable ground, facing it', () => {
    for (const s of v1Spots()) {
      const r = returnSpawnFor(s.id)!;
      expect(w.source.groundY(r.pos.x, r.pos.z)).toBe(0);
      expect(Math.hypot(r.pos.x - s.at[0], r.pos.z - s.at[1])).toBeLessThan(s.radius + 4);
      expect(Math.sin(r.yaw)).toBeLessThan(0);   // the court is to the west (−x) of its sideline spawn
    }
    expect(returnSpawnFor('court.camera')).toBeNull();
    expect(returnSpawnFor('nope')).toBeNull();
  });
});

describe('walking up and coming back', () => {
  const ones = v1Spots()[0];
  it('opens the mode on its own page, with the Venice court location and the spot', () => {
    const href = launchHref(ones);
    const u = new URL(href, 'http://x');
    expect(u.pathname).toBe('/play/onevone');
    expect(u.searchParams.get('from')).toBe(FROM_VENICE);
    expect(u.searchParams.get('spot')).toBe('court.ones');
    expect(u.searchParams.get('location')).toBe('venice');
  });
  it('offers every advertised game on multi-mode courts, each with its own return route', () => {
    const [, , flight, arc] = v1Spots();
    expect(launchOptions(flight).map((o) => [o.mode, o.name, o.route])).toEqual([
      ['dunkContest', 'Flight Night', '/play/dunk'],
      ['dunkduel', 'Prove It', '/play/dunkduel'],
    ]);
    expect(launchOptions(arc).map((o) => [o.mode, o.name, o.route])).toEqual([
      ['threePoint', 'Downtown', '/play/threepoint'],
      ['carnival', 'Game Night', '/play/carnival'],
    ]);
    expect(new URL(launchHref(flight, 'dunkduel'), 'http://x').pathname).toBe('/play/dunkduel');
    expect(launchRoute(arc, 'carnival')).toBe('/play/carnival');
  });
  it('the end screen goes back to the court the game came from: by the query, or by the return mark', () => {
    const st = mem();
    expect(veniceReturnHref('/play/onevone', '?from=venice&spot=court.ones', 0, st)).toBe(hubHrefFor('court.ones'));
    expect(veniceReturnHref('/play/onevone', '', 1000, st)).toBeNull();
    writeReturn(v1Spots()[1], 1000, st);
    expect(veniceReturnHref('/play/threevthree', '?net=ABC&peer=h1&party=1', 2000, st)).toBe('/play/venice?spot=court.run');
    expect(veniceReturnHref('/play/onevone', '', 2000, st)).toBeNull();   // another game: not this trip
    expect(veniceReturnHref('/play/threevthree', '', 1000 + RETURN_TTL_MS + 1, st)).toBeNull();   // stale
    writeReturn({ id: 'court.flight', route: '/play/dunkduel' }, 3000, st);
    expect(veniceReturnHref('/play/dunkduel', '', 3001, st)).toBe('/play/venice?spot=court.flight');
    expect(veniceReturnHref('/play/dunk', '', 3001, st)).toBeNull();
    clearReturn(st);
    expect(st.m.has(RETURN_KEY)).toBe(false);
  });
  it('refuses junk: a made-up spot, broken storage, a mark from the future', () => {
    const st = mem();
    expect(veniceReturnHref('/play/onevone', '?from=venice&spot=../../x', 0, st)).toBeNull();
    st.setItem(RETURN_KEY, '{bad'); expect(readReturn(0, st)).toBeNull();
    st.setItem(RETURN_KEY, JSON.stringify({ spot: 'court.ones', route: '/play/onevone', at: 5000 })); expect(readReturn(10, st)).toBeNull();
    const broken: StoreLike = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
    expect(() => writeReturn(ones, 0, broken)).not.toThrow();
    expect(readReturn(0, broken)).toBeNull();
    expect(spotFromSearch('?spot=court.run')).toBe('court.run');
    expect(spotFromSearch('?spot=x')).toBeNull();
  });
  it('offers the party only on courts whose game has a party seat', () => {
    for (const mode of Object.values(PARTY_MODE_FOR_SPOT)) expect(ONLINE_MODES.map((m) => m.id)).toContain(mode);
    expect(PARTY_MODE_FOR_SPOT['court.ones']).toBe('onevone');
    expect(PARTY_MODE_FOR_SPOT['court.run']).toBe('threevthree');
    expect(PARTY_MODE_FOR_SPOT['court.flight']).toBeUndefined();
  });
});

describe('the Play screen door', () => {
  it('is on unless VENICE_HUB_DOOR is 0, and opens the hub', () => {
    expect(veniceDoorOn({})).toBe(true);
    expect(veniceDoorOn({ VENICE_HUB_DOOR: '1' })).toBe(true);
    expect(veniceDoorOn({ VENICE_HUB_DOOR: '0' })).toBe(false);
    expect(VENICE_DOOR_HREF).toBe('/play/venice');
  });
});

describe('the party: every member comes back to Venice (phase 2)', () => {
  it('names a court in the host activity line and reads it back, and nothing else', async () => {
    const { veniceActivity, spotFromActivity, partyVeniceReturn } = await import('./hubReturn');
    expect(veniceActivity('court.ones')).toBe('At Venice Beach · Court 1');
    expect(veniceActivity('court.run')).toBe('At Venice Beach · Court 2');
    expect(veniceActivity('court.camera')).toBeNull();
    for (const s of ['court.ones', 'court.run', 'court.flight', 'court.arc']) expect(spotFromActivity(veniceActivity(s))).toBe(s);
    for (const junk of [null, '', 'Playing Downtown', 'At Venice Beach · Court 5', 'At Venice Beach · Court 1 extra', 'Court 1']) expect(spotFromActivity(junk)).toBeNull();
    const host = (a: string | null) => ({ host: true, activity: a }), member = (a: string | null) => ({ host: false, activity: a });
    expect(partyVeniceReturn([member(null), host('At Venice Beach · Court 2')])).toBe('court.run');
    // only the HOST's line counts: a member standing at a court does not send the party's game back there
    expect(partyVeniceReturn([member('At Venice Beach · Court 1'), host('Picking a game')])).toBeNull();
    expect(partyVeniceReturn([])).toBeNull();
  });
});
