// lane/coast-door (2026-11-18): the boat to the coast, the hub's side — where it stands, its card's rule, the way there and back,
// and that the courts' walk-up, returns and solids are as they were.
import { describe, expect, it } from 'vitest';
import { AdventureHost } from '@/lib/babylon/adventure/host/AdventureHost';
import { emptyAdventureSave } from '@/lib/babylon/adventure/contracts';
import { coastEntryHref, veniceReturnHref as coastBackHref } from '@/lib/adventure/coast/door';
import { arrivalSpawn, ZONE_SPOTS } from '@/lib/adventure/coast/zoneLayout';
import { miniMapStatus } from '@/app/play/venice/wayfinding';
import { arrivalFor, BOAT_STOP, BoatWalkup, boatReturnSpawn, boatRoute, boatSpot, inBoatPlace, PIER_SPOT_ID, VENICE_COAST_DOOR } from './coastDoor';
import { hubSolids, inCourtPlace, Walkup, WALKUP_DWELL } from './hubSolids';
import { buildHubWorld, returnSpawnFor, v1Area, v1Spots } from './hubWorld';
import { hubHrefFor, spotFromSearch } from './hubReturn';
import { SPOTS } from './layout';
import { RING } from './courtsDressing';

const inside = (b: { minX: number; maxX: number; minZ: number; maxZ: number }, x: number, z: number, pad = 0.5) =>
  x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad;

describe('the boat to the coast: where it is', () => {
  it('ships on (1); the pier end is the spot, a door to the coast', () => {
    expect(VENICE_COAST_DOOR).toBe(1);
    const s = boatSpot();
    expect(s.id).toBe(PIER_SPOT_ID);
    expect(SPOTS.find((x) => x.id === PIER_SPOT_ID)?.zone).toBe('coast');
    expect(s.at).toEqual([BOAT_STOP.x, BOAT_STOP.z]);
    expect(s.modes).toHaveLength(0);   // a door, not a game: the card takes the boat
  });
  it('its ring is on the walkable sand, clear of every solid, and of every court\'s place', () => {
    const a = v1Area();
    expect(BOAT_STOP.x - RING.r - 1).toBeGreaterThan(a.minX);
    expect(BOAT_STOP.z - RING.r - 1).toBeGreaterThan(a.minZ);
    expect(BOAT_STOP.z + RING.r + 1).toBeLessThan(a.maxZ);
    for (const b of hubSolids(v1Spots(), true)) expect(inside(b, BOAT_STOP.x, BOAT_STOP.z, RING.r + 1)).toBe(false);
    for (const c of v1Spots()) {
      expect(inCourtPlace(c, BOAT_STOP.x, BOAT_STOP.z, 2)).toBe(false);
      expect(inBoatPlace(c.at[0], c.at[1], 2)).toBe(false);
    }
  });
});

describe('the boat\'s card: the courts\' walk-up rule', () => {
  it('comes up after the dwell in the ring, stays a metre past it, and goes beyond', () => {
    const w = new BoatWalkup();
    expect(w.step(WALKUP_DWELL / 2, BOAT_STOP.x, BOAT_STOP.z)).toBeNull();
    expect(w.step(WALKUP_DWELL, BOAT_STOP.x, BOAT_STOP.z)?.id).toBe(PIER_SPOT_ID);
    expect(w.step(0.1, BOAT_STOP.x + RING.r + 1.5, BOAT_STOP.z)?.id).toBe(PIER_SPOT_ID);   // inside the hold
    expect(w.step(0.1, BOAT_STOP.x + RING.r + 3, BOAT_STOP.z)).toBeNull();
    expect(w.step(1, 0, 0)).toBeNull();
  });
  it('the courts\' walk-up never offers the boat, and the boat\'s never a court', () => {
    const courts = new Walkup(v1Spots());
    for (let i = 0; i < 5; i++) expect(courts.step(0.1, BOAT_STOP.x, BOAT_STOP.z)).toBeNull();
    const boat = new BoatWalkup();
    for (const c of v1Spots()) for (let i = 0; i < 5; i++) expect(boat.step(0.1, c.at[0], c.at[1])).toBeNull();
  });
});

describe('there and back', () => {
  it('the card opens the coast from the pier end; the coast\'s way back names it; the hub reads it', () => {
    expect(coastEntryHref(PIER_SPOT_ID)).toBe('/play/coast?from=venice&spot=pier.end');
    expect(coastBackHref('?from=venice&spot=pier.end')).toBe('/play/venice?spot=pier.end');
    expect(coastBackHref('')).toBe('/play/venice?spot=pier.end');   // the coast's boat back is always the pier's
    expect(hubHrefFor(PIER_SPOT_ID)).toBe('/play/venice?spot=pier.end');
    expect(spotFromSearch('?spot=pier.end')).toBe(PIER_SPOT_ID);
  });
  it('the coast lands you on its dock, a short walk from its boat back', () => {
    const a = arrivalSpawn(), boat = ZONE_SPOTS.find((s) => s.id === 'dock.venice')!;
    expect(Math.hypot(a.pos.x - boat.at[0], a.pos.z - boat.at[1])).toBeLessThan(12);
  });
  it('back from the coast: beside the ring, outside it, facing the boat (west), clear of solids', () => {
    const r = boatReturnSpawn();
    const d = Math.hypot(r.pos.x - BOAT_STOP.x, r.pos.z - BOAT_STOP.z);
    expect(d).toBeGreaterThan(RING.r + 1);
    expect(d).toBeLessThan(RING.r + 1 + 4);
    expect(Math.sin(r.yaw)).toBeLessThan(-0.99);   // facing −x
    for (const b of hubSolids(v1Spots(), true)) expect(inside(b, r.pos.x, r.pos.z)).toBe(false);
  });
  it('the hub\'s arrival: the boat for the pier end with the door on, the cold start with it off; courts as before', () => {
    expect(arrivalFor(PIER_SPOT_ID, true)).toEqual(boatReturnSpawn());
    expect(arrivalFor(PIER_SPOT_ID, false)).toBeNull();
    expect(arrivalFor(null, true)).toBeNull();
    for (const c of v1Spots()) { expect(arrivalFor(c.id, true)).toEqual(returnSpawnFor(c.id)); expect(arrivalFor(c.id, false)).toEqual(returnSpawnFor(c.id)); }
  });
  it('the courts\' returns are unchanged (the pier end is not a court)', () => {
    for (const s of v1Spots()) expect(returnSpawnFor(s.id)).not.toBeNull();
    expect(returnSpawnFor(PIER_SPOT_ID)).toBeNull();   // the mode asks coastDoor for the boat's, behind its knob
  });
  it('the mini-map says where you are', () => {
    expect(miniMapStatus(PIER_SPOT_ID)).toMatch(/boat to the coast/);
    expect(miniMapStatus('court.ones')).toMatch(/Court 1/);
  });
});

describe('the walk to the boat on the real host, the solids in', () => {
  /** The hub's world with every solid; the player follows the route from `from`, the stick toward each point (camYaw 0). */
  function walk(from: { x: number; z: number }) {
    const w = buildHubWorld();
    w.pieces.push(...hubSolids(v1Spots(), true));
    const host = new AdventureHost({ world: w.source, save: emptyAdventureSave(0), playerSpawn: { pos: { x: from.x, y: 0, z: from.z }, yaw: 0 }, band: null });
    const path = boatRoute(from);
    let t = path.shift()!;
    host.setInputSource(host.playerId, (out) => {
      const p = host.player.pos, dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.8) { if (path.length) t = path.shift()!; else { out.move.x = 0; out.move.y = 0; return; } }
      out.camYaw = 0; out.move.x = dx / d; out.move.y = dz / d;
    });
    const card = new BoatWalkup();
    let shown = false;
    for (let f = 0; f < 60 * 60 && !shown; f++) {
      host.frame(1 / 60);
      if (f % 6 === 0 && card.step(0.1, host.player.pos.x, host.player.pos.z)) shown = true;
    }
    // the walk ends (the seam lets go 0.8 m short, as VeniceHubMode's does) and the player coasts to a stop: the card must stay
    // up (door r4: the player ran on 5.5 m west past the ring's hold and the card went before the tap)
    for (let f = 0; f < 60 * 60 && path.length; f++) host.frame(1 / 60);
    let held = true;
    for (let f = 0; f < 3 * 60; f++) { host.frame(1 / 60); if (f % 6 === 0 && !card.step(0.1, host.player.pos.x, host.player.pos.z)) held = false; }
    return { shown, held, at: { ...host.player.pos } };
  }
  it('from the court gate (the cold start) the route reaches the ring and the card comes up', () => {
    const s = buildHubWorld().spawn.pos;
    const r = walk({ x: s.x, z: s.z });
    expect(r.shown).toBe(true);
    expect(r.held).toBe(true);
  });
  it('from beside each court (a return) too', () => {
    for (const c of v1Spots()) {
      const b = returnSpawnFor(c.id)!.pos;
      const r = walk({ x: b.x, z: b.z });
      expect(r.shown).toBe(true);
      expect(r.held).toBe(true);
    }
  });
});
