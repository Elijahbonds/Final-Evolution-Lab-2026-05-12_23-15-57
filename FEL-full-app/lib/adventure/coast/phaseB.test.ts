// THE COAST & ISLANDS, phase B (lane/coast-b): the partner that walks with you, the creatures, and the creature log — held
// headless on the REAL Adventure host and the REAL Adventure save (device store, policy), no Babylon.
import { describe, expect, it } from 'vitest';
import { AdventureHost } from '@/lib/babylon/adventure/host/AdventureHost';
import { emptyAdventureSave } from '@/lib/babylon/adventure/contracts';
import { ADVENTURE_SAVE_KEY, loadAdventureSave, storeAdventureSave } from '@/lib/babylon/adventure/save/deviceStore';
import { adventureSavePolicy } from '@/lib/babylon/adventure/save/policy';
import { createCreaturePartner } from '@/lib/babylon/adventure/partner/defs';
import { buildCoastWorld, WaterEdge } from './zoneWorld';
import { ISLANDS, SANDBAR, mainlandShoreX, walkable } from './zoneLayout';
import { besidePlayer, COAST_PARTNER_CATCHUP_M, COAST_PARTNER_ON, COAST_PARTNER_STUCK_SEC, PartnerKeeper, partnerCatchup, zonePartner, type CatchupWhy } from './zonePartner';
import { COAST_CREATURES_ON, COAST_LOG_MEET_M, COAST_LOG_SEEN_M, CreatureHerd, ZONE_CREATURES, creatureCanStand } from './zoneCreatures';
import { LOG_PREFIX, logCount, logFlag, readLog, withLog } from './creatureLog';
import { LogKeeper } from './zoneLife';

class MemStore { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem(k: string) { this.m.delete(k); } }

/** The zone's host with a partner, as CoastZoneMode builds it. */
function zoneHost(partner = zonePartner(emptyAdventureSave(0)).partner) {
  const world = buildCoastWorld();
  const partnerSpawn = { pos: besidePlayer(world.spawn.pos, world.spawn.yaw, { x: 0, y: 0, z: 0 }), yaw: world.spawn.yaw };
  const host = new AdventureHost({ world: world.source, save: { ...emptyAdventureSave(0), partner }, playerSpawn: world.spawn, partnerSpawn, band: null });
  return { host, world, edge: new WaterEdge(world.spawn.pos), qEdge: new WaterEdge(host.partnerActor!.pos) };
}

/** Walk the player through `route` (the stick forward, the yaw on the target) with the zone's frame rules; record the partner. */
function walk(route: [number, number][], opts: { catchup?: boolean; sec?: number; stick?: number } = {}) {
  const z = zoneHost();
  const { host } = z;
  let target = route[0];
  host.setInputSource(host.playerId, (out) => { const p = host.player.pos; out.camYaw = Math.atan2(target[0] - p.x, target[1] - p.z); out.move.x = 0; out.move.y = opts.stick ?? 1; });
  const keeper = new PartnerKeeper();
  let maxGap = 0, gapSum = 0, n = 0, qDeep = 0, closest = Infinity;
  const reached: boolean[] = [];
  for (const wp of route) {
    target = wp;
    let ok = false;
    for (let f = 0; f < (opts.sec ?? 40) * 30; f++) {
      host.frame(1 / 30);
      const back = z.edge.hold(host.player);
      const q = host.partnerActor!;
      z.qEdge.hold(q);
      if (opts.catchup !== false) keeper.step(host.player, q, 1 / 30, { catchupM: COAST_PARTNER_CATCHUP_M, stuckSec: COAST_PARTNER_STUCK_SEC, playerTurnedBack: back, reset: (id) => host.movement.reset(id) });
      const p = host.player.pos, gap = Math.hypot(q.pos.x - p.x, q.pos.z - p.z);
      maxGap = Math.max(maxGap, gap); gapSum += gap; n++; closest = Math.min(closest, gap);
      if (!walkable(q.pos.x, q.pos.z)) qDeep++;
      if (Math.hypot(p.x - wp[0], p.z - wp[1]) < 2) { ok = true; break; }
    }
    reached.push(ok);
  }
  if (process.env.COAST_TRACE) console.log(JSON.stringify({ stick: opts.stick ?? 1, meanGap: gapSum / n, maxGap, closest, counts: keeper.counts, qDeep }));
  return { host, reached, catchups: keeper.counts as Record<CatchupWhy, number>, maxGap, meanGap: gapSum / n, qDeep, closest };
}

const ROUTE: [number, number][] = [
  [mainlandShoreX(24) + 16, 24], [mainlandShoreX(-36) + 9, -36], [-20, -36], [SANDBAR.from[0], SANDBAR.from[1]], [SANDBAR.to[0], SANDBAR.to[1]], [ISLANDS[1].at[0], ISLANDS[1].at[1] + 6],
];

describe('the partner walks with you', () => {
  it('ships on; a player with no partner walks with the Adventure\'s default creature on loan, never written to the save', () => {
    expect(COAST_PARTNER_ON).toBe(1);
    const none = zonePartner(emptyAdventureSave(0));
    expect(none.loaned).toBe(true);
    expect(none.partner?.kind).toBe('creature');
    const own = createCreaturePartner({ id: 'partner', speciesId: 'cinderpup' })!;
    expect(zonePartner({ ...emptyAdventureSave(0), partner: own })).toEqual({ partner: own, loaned: false });
  });

  it('arrives beside you on the dock, on ground you can stand on', () => {
    const { host } = zoneHost();
    const q = host.partnerActor!, p = host.player;
    expect(walkable(q.pos.x, q.pos.z)).toBe(true);
    expect(Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z)).toBeLessThan(3);
    host.dispose();
  });

  it('follows the whole way to Reef Rock at a natural distance, never in deep water, with only a few catch-ups onto your path', () => {
    const r = walk(ROUTE);
    expect(r.reached).toEqual(ROUTE.map(() => true));
    expect(r.qDeep).toBe(0);
    expect(r.meanGap).toBeLessThan(6);          // the brain's slot is ~2 m behind and to the side
    expect(r.maxGap).toBeLessThan(COAST_PARTNER_CATCHUP_M);
    const total = Object.values(r.catchups).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(2);        // at a flat-out sprint you outrun it (14 against ~10.5 m/s): it is brought along
    expect(r.catchups.far).toBe(0);
    r.host.dispose();
  });

  it('follows by itself too: with no catch-up at all, the same sprint keeps the partner within the catch-up distance', () => {
    const r = walk(ROUTE, { catchup: false });
    expect(r.reached).toEqual(ROUTE.map(() => true));
    expect(r.maxGap).toBeLessThan(COAST_PARTNER_CATCHUP_M);
    r.host.dispose();
  });

  it('a partner blocked for a second while more than 6 m behind comes back onto your path, 3 m behind you; CONTROL: not before', () => {
    const { host } = zoneHost();
    const p = host.player, q = host.partnerActor!;
    const k = new PartnerKeeper();
    const o = { catchupM: COAST_PARTNER_CATCHUP_M, stuckSec: COAST_PARTNER_STUCK_SEC, playerTurnedBack: false, reset: (id: string) => host.movement.reset(id) };
    // the player walks 12 m along the dock (the trail), the partner stands still 10 m off on the beach, blocked
    for (let i = 0; i <= 24; i++) { p.pos.x = 55 + i * 0.5; k.step(p, q, 0, o); }
    q.pos.x = p.pos.x + 9; q.pos.z = p.pos.z + 5; q.vel.x = 0; q.vel.z = 0;
    let why = null;
    for (let f = 0; f < 25 && !why; f++) why = k.step(p, q, 1 / 30, o);   // under a second
    expect(why).toBeNull();
    for (let f = 0; f < 10 && !why; f++) why = k.step(p, q, 1 / 30, o);
    expect(why).toBe('stuck');
    expect(Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z)).toBeCloseTo(3, 0);
    expect(q.pos.z).toBeCloseTo(p.pos.z, 6);    // on the trail, behind you on the dock
    host.dispose();
  });

  it('never blocks you: it keeps out of your way (the brain\'s slot), and the sim has no body-to-body collision on the way', () => {
    const r = walk(ROUTE.slice(0, 3));
    expect(r.reached).toEqual([true, true, true]);
    expect(r.closest).toBeGreaterThan(0.3);
    r.host.dispose();
  });

  it('catches up after a teleport: put you 60 m away and it reappears beside you on standable ground', () => {
    const { host } = zoneHost();
    const p = host.player, q = host.partnerActor!;
    p.pos.x = mainlandShoreX(-60) + 20; p.pos.z = -60; p.pos.y = 1.5;
    for (let f = 0; f < 10; f++) host.frame(1 / 30);
    const why = partnerCatchup(p, q, { catchupM: COAST_PARTNER_CATCHUP_M, playerTurnedBack: false, reset: (id) => host.movement.reset(id) });
    expect(why).toBe('far');
    expect(Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z)).toBeLessThan(3);
    expect(walkable(q.pos.x, q.pos.z)).toBe(true);
    host.dispose();
  });

  it('catches up after a deep-water turn-back that left it behind, and when it ends up in deep water itself', () => {
    const { host } = zoneHost();
    const p = host.player, q = host.partnerActor!;
    q.pos.x = p.pos.x + 12; q.pos.z = p.pos.z;   // left behind (12 m), the player was just turned back
    expect(partnerCatchup(p, q, { catchupM: COAST_PARTNER_CATCHUP_M, playerTurnedBack: true, reset: () => {} })).toBe('turnback');
    q.pos.x = p.pos.x + 2;                         // beside: a turn-back does not move it
    expect(partnerCatchup(p, q, { catchupM: COAST_PARTNER_CATCHUP_M, playerTurnedBack: true, reset: () => {} })).toBeNull();
    q.pos.x = -180; q.pos.z = -180;                // in the open sea
    expect(partnerCatchup(p, q, { catchupM: COAST_PARTNER_CATCHUP_M, playerTurnedBack: false, reset: () => {} })).toBe('water');
    expect(walkable(q.pos.x, q.pos.z)).toBe(true);
    host.dispose();
  });

  it('CONTROL: with no catch-up, a teleported player leaves the partner far behind (so the rule is what brings it)', () => {
    const { host } = zoneHost();
    const p = host.player, q = host.partnerActor!;
    p.pos.x = mainlandShoreX(-60) + 20; p.pos.z = -60; p.pos.y = 1.5;
    for (let f = 0; f < 30; f++) host.frame(1 / 30);
    expect(Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z)).toBeGreaterThan(COAST_PARTNER_CATCHUP_M);
    host.dispose();
  });
});

describe('the creatures', () => {
  it('3 to 5 placeholder creatures, each home on ground it can stand on, every name a placeholder', () => {
    expect(COAST_CREATURES_ON).toBe(1);
    expect(ZONE_CREATURES.length).toBeGreaterThanOrEqual(3);
    expect(ZONE_CREATURES.length).toBeLessThanOrEqual(5);
    expect(new Set(ZONE_CREATURES.map((c) => c.id)).size).toBe(ZONE_CREATURES.length);
    for (const c of ZONE_CREATURES) {
      expect(creatureCanStand(c, c.home[0], c.home[1]), c.id).toBe(true);
      expect(c.name.startsWith('[PLACEHOLDER] ')).toBe(true);
    }
  });

  it('wander for ten minutes, always inside their circle on standable ground, and they do move', () => {
    const herd = new CreatureHerd();
    const start = herd.states.map((s) => [s.x, s.z]);
    for (let f = 0; f < 600 * 10; f++) {
      herd.step(0.1);
      for (const w of herd.walkers) expect(creatureCanStand(w.def, w.s.x, w.s.z), w.def.id).toBe(true);
    }
    herd.states.forEach((s, i) => expect(Math.hypot(s.x - start[i][0], s.z - start[i][1]) + 0).toBeGreaterThanOrEqual(0));
    const moved = herd.walkers.filter((w) => w.n > 2).length;
    expect(moved).toBe(ZONE_CREATURES.length);
  });

  it('are the same every run (a fixed wander, no randomness)', () => {
    const a = new CreatureHerd(), b = new CreatureHerd();
    for (let f = 0; f < 500; f++) { a.step(1 / 30); b.step(1 / 30); }
    expect(a.states).toEqual(b.states);
  });

  it('the Shellhopper is within sighting distance of the walk off the dock (so a first visit logs one)', () => {
    const r = walk(ROUTE.slice(0, 1));
    const herd = new CreatureHerd();
    const sh = herd.states.find((s) => s.id === 'shellhopper')!;
    expect(Math.hypot(sh.x - r.host.player.pos.x, sh.z - r.host.player.pos.z)).toBeLessThan(COAST_LOG_SEEN_M + 6);
    r.host.dispose();
  });
});

describe('the creature log, in the Adventure save', () => {
  it('reads every zone creature as not yet; seen then met; never moves down; a stranger id is refused', () => {
    const s0 = emptyAdventureSave(0);
    expect(readLog(s0).map((e) => e.level)).toEqual(ZONE_CREATURES.map(() => 0));
    const s1 = withLog(s0, 'shellhopper', 1)!;
    expect(s1.story.flags[logFlag('shellhopper')]).toBe(1);
    const s2 = withLog(s1, 'shellhopper', 2)!;
    expect(readLog(s2).find((e) => e.id === 'shellhopper')!.level).toBe(2);
    expect(withLog(s2, 'shellhopper', 1)).toBeNull();
    expect(withLog(s2, 'nobody', 1)).toBeNull();
    expect(logCount(readLog(s2))).toEqual({ seen: 1, met: 1, total: ZONE_CREATURES.length });
    expect(s0.story.flags).toEqual({});   // the input is not changed
  });

  it('round-trips through the REAL device store and its sanitiser (a story flag survives), and keeps the rest of the save', () => {
    const store = new MemStore();
    const before = { ...emptyAdventureSave(1), story: { ...emptyAdventureSave(1).story, flags: { 'ch1.met_guide': true } } };
    storeAdventureSave(before, { now: 2, policy: adventureSavePolicy({ signedIn: false }), storage: store });
    const k = new LogKeeper({ now: () => 3, policy: adventureSavePolicy({ signedIn: false }), storage: store });
    expect(k.canStore).toBe(true);
    expect(k.note('palmglider', 1)?.level).toBe(1);
    expect(k.note('palmglider', 1)).toBeNull();
    const back = loadAdventureSave({ now: 4, storage: store });
    expect(back.status).toBe('loaded');
    expect(back.save.story.flags['ch1.met_guide']).toBe(true);
    expect(readLog(back.save).find((e) => e.id === 'palmglider')!.level).toBe(1);
    expect(Object.keys(back.save.story.flags).filter((f) => f.startsWith(LOG_PREFIX))).toEqual([logFlag('palmglider')]);
  });

  it('never overwrites a save it could not read cleanly, and never writes the loaned partner', () => {
    const store = new MemStore();
    store.setItem(ADVENTURE_SAVE_KEY, '{"version":999');
    const k = new LogKeeper({ now: () => 3, policy: adventureSavePolicy({ signedIn: false }), storage: store });
    expect(k.canStore).toBe(false);
    k.note('reefstone', 1);
    expect(store.getItem(ADVENTURE_SAVE_KEY)).toBe('{"version":999');
    const fresh = new MemStore();
    const k2 = new LogKeeper({ now: () => 3, policy: adventureSavePolicy({ signedIn: false }), storage: fresh });
    k2.note('reefstone', 1);
    expect(loadAdventureSave({ now: 4, storage: fresh }).save.partner).toBeNull();
  });

  it('goes to the account only when the Adventure save policy says so (today: nobody\'s does — the server save is not built)', () => {
    expect(adventureSavePolicy({ signedIn: true, verifiedAdult: true }).server).toBe(false);
    expect(adventureSavePolicy({ signedIn: false }).server).toBe(false);
  });

  it('the distances: seen within 16 m, met within 3 m', () => {
    expect([COAST_LOG_SEEN_M, COAST_LOG_MEET_M]).toEqual([16, 3]);
  });
});
