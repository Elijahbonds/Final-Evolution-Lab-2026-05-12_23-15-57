// THE COAST & ISLANDS, phase D (lane/coast-d): the harbour town, the sports spots and their round trip, the side quests —
// held headless on the REAL Adventure host and the REAL Adventure save, no Babylon.
import { describe, expect, it } from 'vitest';
import { AdventureHost } from '@/lib/babylon/adventure/host/AdventureHost';
import { emptyAdventureSave } from '@/lib/babylon/adventure/contracts';
import { loadAdventureSave, storeAdventureSave } from '@/lib/babylon/adventure/save/deviceStore';
import { adventureSavePolicy } from '@/lib/babylon/adventure/save/policy';
import { MODES } from '@/lib/babylon/modes/registry';
import fs from 'node:fs';
import path from 'node:path';
import { buildCoastWorld, coastGroundY, WaterEdge } from './zoneWorld';
import { DOCK_Z, arrivalSpawn, mainlandShoreX, surfaceY, walkable } from './zoneLayout';
import {
  ALL_SPOTS, COAST_SPORTS_ON, COAST_TOWN_ON, COAST_TOWNSFOLK, HOUSES, MARKET, MARKET_KIT_URL, SPORT_SPOTS, STREET, TOWNSFOLK,
  buildingTopAt, returnSpawnFor, spotAtAll, sportSpotById, townSolids,
} from './zoneTown';
import { COAST_RETURN_KEY, coastReturnHref, consumeCoastReturnHref, launchHref, readReturn, spotFromSearch, writeReturn } from './spotReturn';
import { COAST_QUESTS_ON, QUESTS, playedFlag, questFlag, readQuests, withPlayed, withQuestTaken, withQuestsChecked } from './zoneQuests';
import { logFlag, withLog } from './creatureLog';
import { LogKeeper } from './zoneLife';

class MemStore { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem(k: string) { this.m.delete(k); } }

/** Walk the real host's player toward each point (the stick forward, the yaw on the target). */
function walk(route: [number, number][], o: { town?: boolean; sec?: number; spawn?: ReturnType<typeof returnSpawnFor> } = {}) {
  const world = buildCoastWorld({ town: o.town, spawn: o.spawn ?? null });
  const host = new AdventureHost({ world: world.source, save: emptyAdventureSave(0), playerSpawn: world.spawn, band: null });
  const edge = new WaterEdge(world.spawn.pos);
  let target = route[0];
  host.setInputSource(host.playerId, (out) => { const p = host.player.pos; out.camYaw = Math.atan2(target[0] - p.x, target[1] - p.z); out.move.x = 0; out.move.y = 1; });
  const reached: boolean[] = [];
  let insideSolid = 0;
  for (const wp of route) {
    target = wp;
    let ok = false;
    for (let f = 0; f < (o.sec ?? 40) * 30; f++) {
      host.frame(1 / 30); edge.hold(host.player);
      const p = host.player.pos;
      const b = buildingTopAt(p.x, p.z);
      if (o.town !== false && b !== null && p.y < b - 0.05) insideSolid++;
      if (Math.hypot(p.x - wp[0], p.z - wp[1]) < 2) { ok = true; break; }
    }
    reached.push(ok);
  }
  return { host, reached, insideSolid };
}

describe('the harbour town', () => {
  it('ships on: the town, four townsfolk, the sports spots, the quests', () => {
    expect([COAST_TOWN_ON, COAST_TOWNSFOLK, COAST_SPORTS_ON, COAST_QUESTS_ON]).toEqual([1, 4, 1, 1]);
  });

  it('stands on dry land beside the dock, its street walkable, its buildings off the street and off every spot', () => {
    for (let x = STREET.x0; x <= STREET.x1; x += 2) {
      expect(walkable(x, STREET.z)).toBe(true);
      expect(surfaceY(x, STREET.z)).toBeGreaterThan(0.3);
      expect(buildingTopAt(x, STREET.z)).toBeNull();
    }
    for (const s of ALL_SPOTS) expect(buildingTopAt(s.at[0], s.at[1]), s.id).toBeNull();
    for (const h of HOUSES) expect(h.minZ).toBeGreaterThan(STREET.z + STREET.halfWidth);
    expect(MARKET.z + MARKET.wallFront).toBeLessThan(STREET.z - STREET.halfWidth);
    expect(fs.existsSync(path.resolve(__dirname, '../../../public', MARKET_KIT_URL.slice(1)))).toBe(true);
  });

  it('a house is a wall: the ground there is its top, above the sim\'s step', () => {
    for (const s of townSolids()) {
      const cx = (s.minX + s.maxX) / 2, cz = (s.minZ + s.maxZ) / 2;
      expect(coastGroundY(cx, cz) - surfaceY(cx, cz), s.id).toBeGreaterThan(0.45);
      expect(coastGroundY(cx, cz, false)).toBeCloseTo(surfaceY(cx, cz), 9);   // the control: no town, no wall
    }
  });

  it('on the real host: from the dock up the street to the far end, never inside a building; running at a house stops at its wall', () => {
    const r = walk([[STREET.x0 + 2, DOCK_Z], [STREET.x1, DOCK_Z]]);
    expect(r.reached).toEqual([true, true]);
    expect(r.insideSolid).toBe(0);
    r.host.dispose();
    const h = HOUSES[1], into = walk([[STREET.x0 + 2, DOCK_Z], [(h.minX + h.maxX) / 2, DOCK_Z], [(h.minX + h.maxX) / 2, (h.minZ + h.maxZ) / 2]], { sec: 8 });
    expect(into.reached.slice(0, 2)).toEqual([true, true]);
    expect(into.reached[2]).toBe(false);
    expect(into.insideSolid).toBe(0);
    const p = into.host.player.pos;
    expect(p.z).toBeLessThan(h.minZ + 0.2);
    into.host.dispose();
  });

  it('four townsfolk, three with a quest each (all three quests given), each on standable ground', () => {
    expect(TOWNSFOLK).toHaveLength(4);
    expect(TOWNSFOLK.filter((p) => p.questId).map((p) => p.questId).sort()).toEqual(QUESTS.map((q) => q.id).sort());
    for (const p of TOWNSFOLK) { expect(walkable(p.at[0], p.at[1]), p.id).toBe(true); expect(p.name.startsWith('[PLACEHOLDER] ')).toBe(true); }
    for (const q of QUESTS) expect(TOWNSFOLK.find((p) => p.id === q.from)?.questId).toBe(q.id);
  });
});

describe('the sports spots', () => {
  it('each opens a mode that is registered, on a page that exists; every spot on standable ground and apart from the others', () => {
    for (const s of SPORT_SPOTS) {
      expect(MODES[s.modeKey], s.modeKey).toBeTruthy();
      expect(fs.existsSync(path.resolve(__dirname, '../../../app', `${s.route.slice(1)}/page.tsx`)), s.route).toBe(true);
      expect(walkable(s.at[0], s.at[1]), s.id).toBe(true);
      expect(s.label.startsWith('[PLACEHOLDER] ')).toBe(true);
    }
    expect(SPORT_SPOTS.map((s) => s.modeKey)).toEqual(['surf', 'volleyball', 'golf', 'velocitykart']);
    for (const a of ALL_SPOTS) for (const b of ALL_SPOTS) if (a !== b) expect(Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]), `${a.id} ${b.id}`).toBeGreaterThan(a.radius + b.radius);
  });

  it('walking into a spot finds it; the card opens the mode with ?from=coast&spot=, and the mark is left', () => {
    const net = sportSpotById('volley.net')!;
    expect(spotAtAll(net.at[0] + 1, net.at[1])?.id).toBe('volley.net');
    expect(launchHref(net)).toBe('/play/volleyball?from=coast&spot=volley.net');
    const st = new MemStore();
    writeReturn(net, 1000, st);
    expect(readReturn(2000, st)).toEqual({ spot: 'volley.net', route: '/play/volleyball', at: 1000 });
    expect(readReturn(1000 + 4 * 3600 * 1000, st)).toBeNull();   // too old
  });

  it('the end screen goes back to the same spot: by the query, or by the mark for that page; the mark is used once', () => {
    const st = new MemStore();
    expect(coastReturnHref('/play/volleyball', '?from=coast&spot=volley.net', 5, st)).toBe('/play/coast?spot=volley.net');
    expect(coastReturnHref('/play/volleyball', '', 5, st)).toBeNull();
    writeReturn(sportSpotById('golf.tee')!, 5, st);
    expect(coastReturnHref('/play/surf', '', 6, st)).toBeNull();              // another page: not from the coast
    expect(consumeCoastReturnHref('/play/golf', '', 6, st)).toBe('/play/coast?spot=golf.tee');
    expect(st.getItem(COAST_RETURN_KEY)).toBeNull();
    expect(coastReturnHref('/play/volleyball', '?from=coast&spot=nowhere', 5, st)).toBeNull();
  });

  it('back on the coast with ?spot=, you stand beside that spot facing it, on standable ground, and walk on from there', () => {
    expect(spotFromSearch('?spot=surf.break')).toBe('surf.break');
    expect(spotFromSearch('?spot=pier.end')).toBeNull();
    for (const s of SPORT_SPOTS) {
      const sp = returnSpawnFor(s.id)!;
      expect(walkable(sp.pos.x, sp.pos.z), s.id).toBe(true);
      expect(Math.hypot(sp.pos.x - s.at[0], sp.pos.z - s.at[1])).toBeGreaterThan(s.radius);
      expect(Math.hypot(sp.pos.x - s.at[0], sp.pos.z - s.at[1])).toBeLessThan(s.radius + 3);
    }
    const sp = returnSpawnFor('volley.net')!;
    const r = walk([[mainlandShoreX(DOCK_Z) + 20, DOCK_Z]], { spawn: sp });
    expect(r.reached).toEqual([true]);
    r.host.dispose();
    expect(arrivalSpawn().pos.z).toBe(DOCK_Z);   // no ?spot=: the dock, as before
  });
});

describe('the side quests, in the Adventure save', () => {
  it('three quests; taking one, doing its thing, and the check finishing it; nothing moves backwards', () => {
    let s = emptyAdventureSave(0);
    expect(readQuests(s).map((q) => q.state)).toEqual([0, 0, 0]);
    s = withQuestTaken(s, 'q.shell')!;
    expect(s.story.flags[questFlag('q.shell')]).toBe(1);
    expect(withQuestTaken(s, 'q.shell')).toBeNull();
    expect(withQuestsChecked(s)).toBeNull();                       // not met yet
    s = withLog(withLog(s, 'shellhopper', 1)!, 'shellhopper', 2)!;
    const r = withQuestsChecked(s)!;
    expect(r.finished.map((q) => q.id)).toEqual(['q.shell']);
    expect(readQuests(r.save).find((q) => q.id === 'q.shell')!.state).toBe(2);
    expect(withQuestsChecked(r.save)).toBeNull();
  });

  it('a quest whose thing is already done is done the moment you take it', () => {
    const s = withLog(emptyAdventureSave(0), 'reefstone', 1)!;
    expect(withQuestTaken(s, 'q.reefstone')!.story.flags[questFlag('q.reefstone')]).toBe(2);
  });

  it('the beach net: coming back from its game counts as played there; only known spots count, once', () => {
    let s = withQuestTaken(emptyAdventureSave(0), 'q.net')!;
    const known = (id: string) => !!sportSpotById(id);
    expect(withPlayed(s, 'nowhere', known)).toBeNull();
    s = withPlayed(s, 'volley.net', known)!;
    expect(s.story.flags[playedFlag('volley.net')]).toBe(1);
    expect(withPlayed(s, 'volley.net', known)).toBeNull();
    expect(withQuestsChecked(s)!.finished.map((q) => q.id)).toEqual(['q.net']);
  });

  it('round-trips through the REAL device store with the log and the rest of the save', () => {
    const store = new MemStore();
    storeAdventureSave({ ...emptyAdventureSave(1), story: { ...emptyAdventureSave(1).story, flags: { 'ch1.met_guide': true } } }, { now: 2, policy: adventureSavePolicy({ signedIn: false }), storage: store });
    const k = new LogKeeper({ now: () => 3, policy: adventureSavePolicy({ signedIn: false }), storage: store });
    expect(k.update((s) => withQuestTaken(s, 'q.reefstone'))).toBe(true);
    k.note('reefstone', 1);
    expect(k.update((s) => withQuestsChecked(s)?.save ?? null)).toBe(true);
    const back = loadAdventureSave({ now: 4, storage: store }).save;
    expect(back.story.flags['ch1.met_guide']).toBe(true);
    expect(back.story.flags[logFlag('reefstone')]).toBe(1);
    expect(readQuests(back).find((q) => q.id === 'q.reefstone')!.state).toBe(2);
  });
});
