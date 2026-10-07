// The BR bot (ADVENTURE PLAN Phase C): no omniscience (line of sight, a field of view, a hearing radius, memory), every
// random number from its own seed (RivalCombatBrain wrapped), and in a real match: it picks loot up, leaves the storm,
// rides a rail and flies on a long rotation, and fights with lock-on, strings, spells and defence.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NO_FUSION, type ActorId, type AdventureActor, type MoveInput } from '../contracts';
import { HostWorld } from '../host/hostWorld';
import { buildRailIndex } from '../rails/railMath';
import { STARTER_SPELLS } from '../magic/spells';
import { BotBrain, stickFor, type BotView } from './botBrain';
import { buildBRMap, brWorldSource } from './map';
import { createZone } from './zone';
import { canHear, canSee, inFov, perceive, type Memory } from './perception';
import { newKit, type Kit } from './kit';
import { lootById } from './loot';
import type { FloorItem } from './lootField';
import { BOT_TIERS, LOUD_M } from './tuning';
import { landedMatch, nextCircleIs, put, run } from './testkit';

const map = buildBRMap();
const SPELLS = new Map(STARTER_SPELLS.map((s) => [s.id, s]));

function fighter(id: string, team: number, x: number, z: number, yaw = 0): AdventureActor {
  return {
    id, kind: 'bot', team, pos: { x, y: 0, z }, vel: { x: 0, y: 0, z: 0 }, facingYaw: yaw, grounded: true,
    state: 'ground', stateSec: 0, radius: 0.4, height: 1.8,
    stats: { hp: { cur: 170, max: 170 }, stamina: { cur: 100, max: 100 }, energy: { cur: 130, max: 130 }, poise: { cur: 50, max: 50 }, special: 0, level: 10, prqBand: 'READY', school: { primary: 'straight', secondary: 'straight', mix: 0 }, element: 'fire' },
    lock: null, stunSec: 0, iframeSec: 0, impulse: null, rail: null, ridingId: null, wantsFlight: false, fusion: { ...NO_FUSION }, partnerId: null,
  };
}

/** A bot's whole window on a still world: the real map, bodies placed by the test, nothing moving. */
function stage() {
  const world = new HostWorld(brWorldSource(map));
  const zone = createZone(1, map.bounds);
  const items: FloorItem[] = [];
  const kits = new Map<ActorId, Kit>();
  const noisy = new Set<ActorId>();
  const clock = { t: 0 };
  const view: BotView = {
    world, zone, rails: buildRailIndex(map.rails), items, chests: [],
    get tSec() { return clock.t; },
    bodies: () => world.actors.values(),
    noisy: (id) => noisy.has(id),
    kitOf: (id) => kits.get(id) ?? null,
    spell: (id) => SPELLS.get(id),
    spellCooldown: () => 0,
    summonReady: () => false,
    teammates: () => [],
    dropTarget: () => null,
    dropping: () => false,
    flightMode: () => null,
  };
  const add = (a: AdventureActor) => { a.pos.y = world.groundY(a.pos.x, a.pos.z) ?? 0; world.add(a); world.reindex(); kits.set(a.id, newKit()); return a; };
  /** Step the brain `sec` seconds against the still world; returns every MoveInput it produced (copies). */
  const think = (brain: BotBrain, self: AdventureActor, sec: number): MoveInput[] => {
    const out: MoveInput[] = [];
    for (let i = 0; i < Math.round(sec * 60); i++) {
      out.push(JSON.parse(JSON.stringify(brain.step(view, self, i, 1 / 60))));
      clock.t += 1 / 60;
    }
    return out;
  };
  return { world, zone, items, kits, noisy, view, add, think, clock };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('perception: a bot knows only what it senses', () => {
  const hard = BOT_TIERS.hard;
  it('the monument hides a fighter behind it; the same fighter in the open, in front, is seen', () => {
    const s = stage();
    const bot = s.add(fighter('bot', 1, -20, -16, Math.PI / 2));    // facing +x, the monument ahead and to the left
    const hid = s.add(fighter('hid', 2, 20, 16));                     // straight through the monument, 51 m away
    expect(canSee(bot, hid, s.world, hard)).toBe(false);
    hid.pos.x = 0; hid.pos.z = -16;                                   // the same fighter in the open, 20 m in front
    expect(canSee(bot, hid, s.world, hard)).toBe(true);
  });

  it('a fighter behind the bot is outside its field of view; it is heard only inside the hearing radius', () => {
    const s = stage();
    // an open field tile: nothing between them but air
    const bot = s.add(fighter('bot', 1, -64, -60, 0));               // facing +z
    const back = s.add(fighter('back', 2, -64, -60 - (hard.hearM + 6)));
    expect(s.world.clear({ x: -64, y: 1.5, z: -60 }, { x: -64, y: 1.5, z: back.pos.z }), 'a clear line').toBe(true);
    expect(inFov(bot, back.pos, hard.fovDeg)).toBe(false);
    expect(canSee(bot, back, s.world, hard)).toBe(false);
    bot.facingYaw = Math.PI;   // turned round, the same fighter is seen
    expect(canSee(bot, back, s.world, hard)).toBe(true);
    bot.facingYaw = 0;
    expect(canHear(bot, back, hard, false)).toBe(false);
    back.pos.z = -60 - (hard.hearM - 2);   // closer: heard, though still unseen
    expect(canHear(bot, back, hard, false)).toBe(true);
  });

  it('a fight is heard from LOUD_M; a quiet fighter at that distance is not', () => {
    const s = stage();
    const bot = s.add(fighter('bot', 1, 0, -60, 0));
    const far = s.add(fighter('far', 2, 0, -60 - (LOUD_M - 2)));
    expect(canHear(bot, far, BOT_TIERS.easy, false)).toBe(false);
    expect(canHear(bot, far, BOT_TIERS.easy, true)).toBe(true);
  });

  it('memory holds the last place and fades after the tier\'s span; a teammate is never "perceived" as a foe', () => {
    const s = stage();
    const bot = s.add(fighter('bot', 1, 0, -60, 0));
    const foe = s.add(fighter('foe', 2, 0, -50));
    const mate = s.add(fighter('mate', 1, 0, -55));
    const mem = new Map<ActorId, Memory>();
    perceive(bot, s.world.actors.values(), s.world, hard, () => false, mem, 0);
    expect([...mem.keys()]).toEqual(['foe']);
    foe.pos.z = -60 - 40;   // gone behind and far
    perceive(bot, s.world.actors.values(), s.world, hard, () => false, mem, 1);
    expect(mem.get('foe')!.z).toBe(-50);   // remembered where it was
    perceive(bot, s.world.actors.values(), s.world, hard, () => false, mem, 1 + hard.memorySec + 0.1);
    expect(mem.has('foe')).toBe(false);
    void mate;
  });
});

describe('the bot brain', () => {
  it('never targets a fighter it cannot sense; one stepping into view becomes its target after the reaction beat', () => {
    const s = stage();
    const bot = s.add(fighter('bot', 1, -20, -16, Math.PI / 2));
    const hid = s.add(fighter('hid', 2, 20, 16));
    const brain = new BotBrain('bot', 'hard', 5, 0);
    s.think(brain, bot, 3);
    expect(brain.everPerceived.has('hid')).toBe(false);
    expect(brain.goal).not.toBe('fight');
    hid.pos.x = -10; hid.pos.z = -16; s.world.reindex();   // in the open, 10 m in front: inside lock range
    const outs = s.think(brain, bot, 1);
    expect(brain.everPerceived.has('hid')).toBe(true);
    expect(brain.goal).toBe('fight');
    expect(brain.targetId).toBe('hid');
    // the first ticks after it saw them it does not swing yet (aware, not psychic)
    const firstSwing = outs.findIndex((o) => o.attackLight || o.attackHeavy || o.lock);
    expect(firstSwing).toBeGreaterThanOrEqual(Math.floor(BOT_TIERS.hard.reactSec * 60));
  });

  it('every random number is its own seed\'s: the global source is never drawn, and one seed replays one bot', () => {
    const spy = vi.spyOn(Math, 'random');
    const play = (seed: number) => {
      const s = stage();
      const bot = s.add(fighter('bot', 1, 0, -60, 0));
      s.add(fighter('foe', 2, 0, -58.5, Math.PI));
      return s.think(new BotBrain('bot', 'normal', seed, 3), bot, 6);
    };
    const a = play(11), b = play(11), c = play(12);
    expect(spy).not.toHaveBeenCalled();
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a.some((o) => o.attackLight || o.attackHeavy)).toBe(true);
  });

  it('hunts a fighter that broke the line where it was last seen, not where it is now', () => {
    const s = stage();
    const bot = s.add(fighter('bot', 1, -20, -16, Math.PI / 2));
    const foe = s.add(fighter('foe', 2, -10, -16));
    const brain = new BotBrain('bot', 'hard', 5, 0);
    s.think(brain, bot, 1);
    expect(brain.goal).toBe('fight');
    foe.pos.x = 20; foe.pos.z = 16; s.world.reindex();   // behind the monument, far past hearing
    const outs = s.think(brain, bot, 0.6);
    expect(brain.goal).toBe('fight');                     // remembered …
    const o = outs.at(-1)!;
    expect(o.move.x).toBeGreaterThan(0.5);                // … and sought at (−10, −16): straight along +x
    expect(Math.abs(o.move.y)).toBeLessThan(0.3);         // not toward the live body (+z as well)
  });

  it('goes for loot it can see that improves its kit, and not for loot behind a wall', () => {
    const s = stage();
    const bot = s.add(fighter('bot', 1, -14, 0, Math.PI / 2));
    s.items.push({ uid: 1, lootId: 'armour.heavy', pos: { x: 14, y: 0.4, z: 0 }, droppedBy: null, holdUntil: 0 });   // behind the monument
    const brain = new BotBrain('bot', 'normal', 5, 0);
    s.think(brain, bot, 0.5);
    expect(brain.goal).not.toBe('loot');
    s.items.push({ uid: 2, lootId: 'armour.light', pos: { x: -14, y: 0.4, z: -10 }, droppedBy: null, holdUntil: 0 });
    const outs = s.think(brain, bot, 0.5);
    expect(brain.goal).toBe('loot');
    expect(brain.lootUid).toBe(2);
    const last = outs.at(-1)!;
    expect(last.move.y).toBeLessThan(-0.5);   // heading −z, toward the item
    // an item that does not improve the kit is no reason to go
    const k = s.kits.get('bot')!;
    k.armour = 'armour.heavy';
    s.items.length = 0;
    s.items.push({ uid: 3, lootId: 'armour.light', pos: { x: -14, y: 0.4, z: -10 }, droppedBy: null, holdUntil: 0 });
    s.think(brain, bot, 0.5);
    expect(brain.goal).not.toBe('loot');
    expect(lootById('armour.light')).toBeTruthy();
  });

  it('in the storm, it heads for the circle', () => {
    const s = stage();
    const z = s.zone;
    z.cur.r = 30; z.cur.x = 0; z.cur.z = 0; z.circles[1] = { x: 0, z: 0, r: 20, ceilingY: 60 };
    const bot = s.add(fighter('bot', 1, 100, 100, 0));
    const brain = new BotBrain('bot', 'easy', 5, 0);
    const outs = s.think(brain, bot, 1);
    expect(brain.goal).toBe('storm');
    const o = outs.at(-1)!;
    // the stick points from (100, 100) toward the middle: −x, −z
    expect(o.move.x).toBeLessThan(-0.3);
    expect(o.move.y).toBeLessThan(-0.3);
  });

  it('stickFor inverts wishDir: a world direction comes back out of the camera-relative stick', () => {
    const out = { x: 0, y: 0 };
    for (const cam of [0, 0.7, -2.1, Math.PI]) {
      stickFor(0.6, -0.8, cam, out);
      const s = Math.sin(cam), c = Math.cos(cam);
      expect(out.y * s + out.x * c).toBeCloseTo(0.6, 6);
      expect(out.y * c - out.x * s).toBeCloseTo(-0.8, 6);
    }
  });
});

describe('bots in a match', () => {
  it('pick loot up (and it changes their kit)', () => {
    const m = landedMatch({ seed: 21, humans: 0, fighters: 2, tiers: ['normal', 'normal'] });
    put(m, 'bot.0', -20, -40, 0);
    put(m, 'bot.1', 120, 120);
    m.loot.state.items.length = 0;
    m.loot.place(lootById('armour.mid')!, { x: -20, y: 0, z: -32 }, null, 0);
    const took: string[] = [];
    m.bus.on('loot', (e) => { if (e.actorId === 'bot.0') took.push(e.lootId); });
    run(m, 8, () => took.length > 0);
    run(m, 0.1);   // the stats re-derive on their next step
    expect(took).toEqual(['armour.mid']);
    expect(m.fighter('bot.0')!.kit.armour).toBe('armour.mid');
    expect(m.stats.derived('bot.0')!.hpMax).toBeGreaterThan(m.stats.derived('bot.1')!.hpMax);
  });

  it('leave the storm for the next circle', () => {
    const m = landedMatch({ seed: 22, humans: 0, fighters: 2, tiers: ['easy', 'easy'] });
    put(m, 'bot.0', -130, -130);
    put(m, 'bot.1', 130, 130);
    nextCircleIs(m, { x: -40, z: -40, r: 25, ceilingY: 80 }, 6);
    const d0 = Math.hypot(-130 + 40, -130 + 40);
    run(m, 20, () => { const a = m.world.actors.get('bot.0')!; return Math.hypot(a.pos.x + 40, a.pos.z + 40) < 25; });
    const a = m.world.actors.get('bot.0')!;
    const d = Math.hypot(a.pos.x + 40, a.pos.z + 40);
    expect(d).toBeLessThan(25);
    expect(d).toBeLessThan(d0);
  });

  it('ride a rail heading their way on a long rotation (and tuck along it)', () => {
    const m = landedMatch({ seed: 3, humans: 0, fighters: 2, tiers: ['normal', 'normal'] });
    put(m, 'bot.0', -70, -101);
    put(m, 'bot.1', 130, 130);
    nextCircleIs(m, { x: 120, z: -80, r: 20, ceilingY: 90 }, 8);
    const rides: string[] = [];
    m.bus.on('rail:enter', (e) => { if (e.actorId === 'bot.0') rides.push(e.segmentId); });
    const x0 = m.world.actors.get('bot.0')!.pos.x;
    run(m, 10);
    expect(rides[0]).toBe('loop.s');
    expect(m.world.actors.get('bot.0')!.pos.x - x0, 'the rail carried it east').toBeGreaterThan(60);
  });

  it('fuse and fly on a long rotation when the meter is full', () => {
    const m = landedMatch({ seed: 3, humans: 0, fighters: 2, tiers: ['normal', 'normal'] });
    put(m, 'bot.0', -120, -60);
    put(m, 'bot.1', 140, -140);
    const a = m.world.actors.get('bot.0')!;
    a.fusion.meter = 1; a.stats.energy.cur = a.stats.energy.max;
    nextCircleIs(m, { x: 110, z: 100, r: 20, ceilingY: 90 }, 8);
    const states: string[] = [];
    m.bus.on('state', (e) => { if (e.actorId === 'bot.0') states.push(e.to); });
    run(m, 9);
    expect(a.fusion.active || states.includes('flight')).toBe(true);
    expect(states).toContain('flight');
    expect(Math.hypot(a.pos.x - 110, a.pos.z - 100)).toBeLessThan(120);
  });

  it('fight with lock-on, strings, spells and defence', () => {
    const m = landedMatch({ seed: 31, humans: 0, fighters: 2, tiers: ['hard', 'hard'] });
    put(m, 'bot.0', -30, -40, 0);
    put(m, 'bot.1', -30, -34, Math.PI);
    for (const id of ['bot.0', 'bot.1']) {
      const k = m.fighter(id)!.kit;
      k.spells.equipped[1] = 'bolt.fire'; k.spells.known.push('bolt.fire');
    }
    const ev: Record<string, number> = {};
    const inc = (k: string) => { ev[k] = (ev[k] ?? 0) + 1; };
    m.bus.on('lock', (e) => { if (e.target) inc(`lock:${e.actorId}`); });
    m.bus.on('spell:cast', () => inc('cast'));
    m.bus.on('damage', (e) => { inc(`${e.source}:${e.outcome}`); if (e.via?.includes('+route:')) inc('route'); });
    run(m, 30, () => m.phase === 'over');
    expect(ev['lock:bot.0'] && ev['lock:bot.1']).toBeTruthy();
    expect(ev['strike:hit']).toBeGreaterThan(5);
    expect((ev['spell:hit'] ?? 0) + (ev['spell:blocked'] ?? 0) + (ev['spell:dodged'] ?? 0) + (ev.cast ?? 0)).toBeGreaterThan(0);
    expect((ev['strike:blocked'] ?? 0) + (ev['strike:parried'] ?? 0) + (ev['strike:dodged'] ?? 0) + (ev['strike:guardBreak'] ?? 0)).toBeGreaterThan(0);
  });
});
