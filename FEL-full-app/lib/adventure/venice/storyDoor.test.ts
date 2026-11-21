// lane/story (2026-11-21): the story gate, the hub's side — where it stands, its card's rule, the walk there on the real host with every
// solid in, the way into the story and back, and that the courts' and the boat's places are untouched.
import { describe, expect, it } from 'vitest';
import { AdventureHost } from '@/lib/babylon/adventure/host/AdventureHost';
import { emptyAdventureSave } from '@/lib/babylon/adventure/contracts';
import { miniMapStatus } from '@/app/play/venice/wayfinding';
import { BOAT_STOP, inBoatPlace } from './coastDoor';
import { hubSolids, inCourtPlace, Walkup, WALKUP_DWELL } from './hubSolids';
import { buildHubWorld, returnSpawnFor, v1Area, v1Spots } from './hubWorld';
import { hubHrefFor, spotFromSearch } from './hubReturn';
import { RING } from './courtsDressing';
import {
  inStoryPlace, STORY_ARCH, STORY_GATE, STORY_ROUTE, STORY_SPOT_ID, storyEntryHref, storyExitFor, storyGateSpot, storyReturnSpawn, storyRoute,
  StoryWalkup, VENICE_STORY_DOOR,
} from './storyDoor';
import { STORY_DOOR_ADVENTURE } from '@/lib/nav/doors';

const inside = (b: { minX: number; maxX: number; minZ: number; maxZ: number }, x: number, z: number, pad = 0.5) =>
  x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad;

describe('the story gate: where it is', () => {
  it('ships on (1); a door, not a game, to the same story the Play tab\'s Story door opens', () => {
    expect(VENICE_STORY_DOOR).toBe(1);
    const s = storyGateSpot();
    expect(s.id).toBe(STORY_SPOT_ID);
    expect(s.at).toEqual([STORY_GATE.x, STORY_GATE.z]);
    expect(s.modes).toHaveLength(0);
    expect(s.label.startsWith('[PLACEHOLDER]')).toBe(true);   // the owner names it
    expect(STORY_ROUTE).toBe(STORY_DOOR_ADVENTURE);
  });
  it('its ring is on the walkable sand inside the rim, clear of every solid, every court\'s place and the boat\'s', () => {
    const a = v1Area();
    expect(STORY_GATE.x + RING.r + 1).toBeLessThan(a.maxX);
    expect(STORY_GATE.x + RING.r + 1).toBeGreaterThan(a.maxX - 1.5);   // reaches the rim: a walk that runs on stops still in its place
    expect(STORY_GATE.z - RING.r - 1).toBeGreaterThan(a.minZ);
    expect(STORY_GATE.z + RING.r + 1).toBeLessThan(a.maxZ);
    expect(STORY_ARCH.x).toBeGreaterThan(STORY_GATE.x);           // the frame stands past the ring, facing the courts
    for (const b of hubSolids(v1Spots(), true)) expect(inside(b, STORY_GATE.x, STORY_GATE.z, RING.r + 1)).toBe(false);
    for (const c of v1Spots()) {
      expect(inCourtPlace(c, STORY_GATE.x, STORY_GATE.z, 2)).toBe(false);
      expect(inStoryPlace(c.at[0], c.at[1], 2)).toBe(false);
    }
    expect(inBoatPlace(STORY_GATE.x, STORY_GATE.z, 2)).toBe(false);
    expect(inStoryPlace(BOAT_STOP.x, BOAT_STOP.z, 2)).toBe(false);
  });
});

describe('the gate\'s card: the courts\' walk-up rule', () => {
  it('comes up after the dwell in the ring, stays a metre past it, and goes beyond', () => {
    const w = new StoryWalkup();
    expect(w.step(WALKUP_DWELL / 2, STORY_GATE.x, STORY_GATE.z)).toBeNull();
    expect(w.step(WALKUP_DWELL, STORY_GATE.x, STORY_GATE.z)?.id).toBe(STORY_SPOT_ID);
    expect(w.step(0.1, STORY_GATE.x - RING.r - 1.5, STORY_GATE.z)?.id).toBe(STORY_SPOT_ID);
    expect(w.step(0.1, STORY_GATE.x - RING.r - 3, STORY_GATE.z)).toBeNull();
  });
  it('the courts\' walk-up never offers the gate, and the gate\'s never a court', () => {
    const courts = new Walkup(v1Spots());
    for (let i = 0; i < 5; i++) expect(courts.step(0.1, STORY_GATE.x, STORY_GATE.z)).toBeNull();
    const gate = new StoryWalkup();
    for (const c of v1Spots()) for (let i = 0; i < 5; i++) expect(gate.step(0.1, c.at[0], c.at[1])).toBeNull();
  });
});

describe('into the story and back', () => {
  it('the card opens the story told it came from Venice; the story\'s way out comes back to the gate', () => {
    expect(storyEntryHref()).toBe('/play/adventure?from=venice');
    expect(storyExitFor('?from=venice')).toEqual({ href: '/play/venice?spot=story.gate', label: 'Back to Venice', venice: true });
    expect(storyExitFor('')).toEqual({ href: '/play', label: 'Back to Play', venice: false });
    expect(storyExitFor(null)).toEqual({ href: '/play', label: 'Back to Play', venice: false });
    expect(storyExitFor('?from=coast')).toMatchObject({ href: '/play' });
    expect(hubHrefFor(STORY_SPOT_ID)).toBe('/play/venice?spot=story.gate');
    // the gate is not a layout spot: the hub reads its raw ?spot= itself (VeniceHubMode rawSpotParam), so the courts' reader is unchanged
    expect(spotFromSearch('?spot=story.gate')).toBeNull();
  });
  it('back from the story: beside the ring, outside it, facing the gate (east), clear of solids', () => {
    const r = storyReturnSpawn();
    const d = Math.hypot(r.pos.x - STORY_GATE.x, r.pos.z - STORY_GATE.z);
    expect(d).toBeGreaterThan(RING.r + 1);
    expect(d).toBeLessThan(RING.r + 1 + 4);
    expect(Math.sin(r.yaw)).toBeGreaterThan(0.99);
    for (const b of hubSolids(v1Spots(), true)) expect(inside(b, r.pos.x, r.pos.z)).toBe(false);
    for (const s of v1Spots()) expect(returnSpawnFor(s.id)).not.toBeNull();   // the courts' returns as before
  });
  it('the mini-map says where you are', () => {
    expect(miniMapStatus(STORY_SPOT_ID)).toMatch(/story gate/);
  });
});

describe('the walk to the gate on the real host, the solids in', () => {
  function walk(from: { x: number; z: number }) {
    const w = buildHubWorld();
    w.pieces.push(...hubSolids(v1Spots(), true));
    const host = new AdventureHost({ world: w.source, save: emptyAdventureSave(0), playerSpawn: { pos: { x: from.x, y: 0, z: from.z }, yaw: 0 }, band: null });
    const path = storyRoute(from);
    let t = path.shift()!;
    host.setInputSource(host.playerId, (out) => {
      const p = host.player.pos, dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.8) { if (path.length) t = path.shift()!; else { out.move.x = 0; out.move.y = 0; return; } }
      out.camYaw = 0; out.move.x = dx / d; out.move.y = dz / d;
    });
    const card = new StoryWalkup();
    let shown = false;
    for (let f = 0; f < 60 * 60 && !shown; f++) {
      host.frame(1 / 60);
      if (f % 6 === 0 && card.step(0.1, host.player.pos.x, host.player.pos.z)) shown = true;
    }
    for (let f = 0; f < 60 * 60 && path.length; f++) host.frame(1 / 60);
    let held = true;
    for (let f = 0; f < 3 * 60; f++) { host.frame(1 / 60); if (f % 6 === 0 && !card.step(0.1, host.player.pos.x, host.player.pos.z)) held = false; }
    return { shown, held };
  }
  it('from the court gate (the cold start) the route reaches the ring and the card comes up and stays', () => {
    const s = buildHubWorld().spawn.pos;
    expect(walk({ x: s.x, z: s.z })).toEqual({ shown: true, held: true });
  });
  it('from beside each court (a return) and from the boat too', () => {
    for (const c of v1Spots()) { const b = returnSpawnFor(c.id)!.pos; expect(walk({ x: b.x, z: b.z }), c.id).toEqual({ shown: true, held: true }); }
    expect(walk({ x: BOAT_STOP.x + 6, z: BOAT_STOP.z })).toEqual({ shown: true, held: true });
  });
});
