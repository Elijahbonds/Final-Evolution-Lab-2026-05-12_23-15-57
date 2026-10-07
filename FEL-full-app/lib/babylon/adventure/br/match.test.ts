// THE PLAN'S "DONE WHEN" HEADLESS: a full 12-fighter match runs to a single winner — deterministic from its seed,
// finite (the zone collapses), inside the per-tick budget, with the body cap held (12 fighters + ≤ 4 summoned) — and
// every system writes only the actor fields it owns (contracts.ACTOR_FIELD_OWNERS), the BR's own systems included.
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ownersOfField, type AdventureActor, type AdventureBus, type FieldOwner } from '../contracts';
import { BRMatch, type BRMatchOptions } from './match';
import { zoneTotalSec } from './zone';
import { TICK_BUDGET_MS } from './tuning';
import { nextCircleIs, run } from './testkit';

afterEach(() => { vi.restoreAllMocks(); });

function playOut(o: BRMatchOptions) {
  const m = new BRMatch(o);
  const limit = Math.ceil((zoneTotalSec() + 30) * 60);
  let nan = 0;
  const t0 = performance.now();
  for (let i = 0; i < limit && m.phase !== 'over'; i++) {
    m.step();
    if (i % 30 === 0) for (const a of m.world.actors.values()) if (![a.pos.x, a.pos.y, a.pos.z, a.vel.x, a.vel.y, a.vel.z].every(Number.isFinite)) nan++;
  }
  const msPerTick = (performance.now() - t0) / Math.max(1, m.tick);
  return { m, nan, msPerTick };
}

describe('a full headless 12-fighter match', () => {
  it('runs to a single winner, finite, inside the tick budget, with the body cap held and no NaN', () => {
    const spy = vi.spyOn(Math, 'random');
    const { m, nan, msPerTick } = playOut({ seed: 101, humans: 0 });
    expect(m.phase).toBe('over');
    expect(m.fighters).toHaveLength(12);
    const winners = m.fighters.filter((f) => f.place === 1);
    expect(winners).toHaveLength(1);
    expect(m.fighters.filter((f) => f.status !== 'out')).toEqual(winners);
    expect(new Set(m.fighters.map((f) => f.place))).toEqual(new Set(Array.from({ length: 12 }, (_, i) => i + 1)));
    expect(m.overAtSec!).toBeLessThanOrEqual(zoneTotalSec() + 10);
    expect(m.peakBodies).toBeLessThanOrEqual(16);
    expect(m.peakSummons).toBeLessThanOrEqual(4);
    expect(nan).toBe(0);
    expect(m.errors).toEqual([]);
    expect(spy, 'every random number came from the seed').not.toHaveBeenCalled();
    expect(msPerTick, `${msPerTick.toFixed(3)} ms per 60 Hz step`).toBeLessThan(TICK_BUDGET_MS);
    expect(m.result(winners[0].id)!.won).toBe(true);
    // the snapshot is plain data (Phase D carries it over the wire)
    const snap = m.snapshot();
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });

  it('is the same match from the same seed (and another from another)', () => {
    const a = playOut({ seed: 202, humans: 0 }).m, b = playOut({ seed: 202, humans: 0 }).m;
    expect(a.tick).toBe(b.tick);
    expect(JSON.stringify(a.snapshot())).toBe(JSON.stringify(b.snapshot()));
    expect(a.fighters.map((f) => f.place)).toEqual(b.fighters.map((f) => f.place));
    const c = new BRMatch({ seed: 203, humans: 0 });
    run(c, 30);
    const a30 = new BRMatch({ seed: 202, humans: 0 });
    run(a30, 30);
    expect(JSON.stringify(c.snapshot().bodies)).not.toBe(JSON.stringify(a30.snapshot().bodies));
  });

  it('duos run to one team standing, placed by team', () => {
    const { m } = playOut({ seed: 303, humans: 0, mode: 'duo' });
    expect(m.phase).toBe('over');
    const teams = new Map<number, Set<number | null>>();
    for (const f of m.fighters) { const s = teams.get(f.team) ?? new Set(); s.add(f.place); teams.set(f.team, s); }
    expect(teams.size).toBe(6);
    for (const s of teams.values()) expect(s.size, 'a team shares one place').toBe(1);
    expect(new Set([...teams.values()].map((s) => [...s][0]))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });

  it('a human seat takes part: with nobody at the controls it still ends, and the result reads its place', () => {
    const { m } = playOut({ seed: 404, humans: 1 });
    expect(m.phase).toBe('over');
    const r = m.result()!;
    expect(r.place).toBeGreaterThanOrEqual(1);
    expect(r.place).toBeLessThanOrEqual(12);
    expect(r.teams).toBe(12);
    expect(m.hud().alive).toBe(1);
  });
});

// ── field ownership (host/ownership.test.ts's tracker, with the BR's systems) ─────────────────────────────────────

type Writer = FieldOwner | 'host' | 'bot';
const OWNER_OF_SYSTEM: Record<string, Writer> = {
  'adventure.movement': 'movement', 'adventure.combat': 'combat', 'adventure.magic': 'combat', 'adventure.stats': 'partner',
  // the BR's: the bond plays A3's role (fusion, partnerId, energy gain); the zone lands its damage through A2's pipeline
  'br.bond': 'partner', 'br.zone': 'combat', 'br.summons': 'host', 'br.downs': 'host',
};
interface Write { writer: Writer; actor: AdventureActor; path: string; was: unknown; now: unknown }

function tracker() {
  let writer: Writer = 'host';
  const writes: Write[] = [];
  const proxies = new WeakMap<object, unknown>();
  const wrap = <T extends object>(raw: T, p: string, actor: () => AdventureActor): T => {
    const hit = proxies.get(raw);
    if (hit) return hit as T;
    const px = new Proxy(raw, {
      get(t, k, r) {
        const v = Reflect.get(t, k, r);
        if (v && typeof v === 'object' && typeof k === 'string' && !Array.isArray(v)) return wrap(v as object, p ? `${p}.${k}` : k, actor);
        return v;
      },
      set(t, k, v) {
        const q = typeof k === 'string' ? (p ? `${p}.${k}` : k) : String(k);
        const was = Reflect.get(t, k);
        if (!Object.is(was, v)) writes.push({ writer, actor: actor(), path: q, was, now: v });
        return Reflect.set(t, k, v);
      },
    });
    proxies.set(raw, px);
    return px;
  };
  const instrument = (a: AdventureActor): AdventureActor => { let self: AdventureActor; self = wrap(a, '', () => self); return self; };
  return { instrument, writes, get writer() { return writer; }, set writer(w: Writer) { writer = w; } };
}

function allowed(w: Write): string | null {
  if (w.writer === 'bot') return null;           // a bot only writes its MoveInput, never a body
  if (w.writer === 'host') return 'spawn';       // the match: spawns, the drop, removals
  const owners = ownersOfField(w.path);
  if (owners.includes(w.writer as FieldOwner)) return 'owner';
  if (w.path === 'stats.energy.cur') {
    if (typeof w.was === 'number' && typeof w.now === 'number' && w.now < w.was) return 'spend';
    if (w.writer === 'partner') return 'owner';
  }
  const pool = /^stats\.(hp|stamina|poise)\.cur$/.exec(w.path);
  if (pool && w.writer === 'partner' && typeof w.now === 'number' && typeof w.was === 'number' && w.now < w.was
    && w.now <= (w.actor.stats as unknown as Record<string, { max: number }>)[pool[1]].max + 1e-9) return 'pool-invariant';
  if (w.writer === 'movement' && (w.path === 'impulse' || w.path === 'warp') && w.now === null) return 'consumed';
  return null;
}

describe('field ownership in the BR', () => {
  it('through a busy minute of a match — the drop, fights, summons, fusion, the storm — every write is its owner\'s', () => {
    const tr = tracker();
    const m = new BRMatch({ seed: 505, humans: 0, instrument: tr.instrument });
    // charge every system's step, and the handlers each one subscribes, to that system
    patch(m.systems, m.bus, tr);
    for (const b of m.bots.values()) {
      const step = b.step.bind(b);
      b.step = (...a: Parameters<typeof step>) => { const was = tr.writer; tr.writer = 'bot'; try { return step(...a); } finally { tr.writer = was; } };
    }
    const seen = new Set<string>();
    m.bus.on('damage', (e) => seen.add(`damage:${e.source}`));
    m.bus.on('fusion', (e) => { if (e.active) seen.add('fuse'); });
    run(m, 20);
    nextCircleIs(m, { x: 150, z: 150, r: 5, ceilingY: 20 }, 1);   // a storm over most of the map
    for (const f of m.fighters) { const a = m.world.actors.get(f.id); if (a && f.status === 'alive') { a.fusion.meter = 1; } }
    run(m, 40);
    const bad = new Map<string, string>();
    const kinds = new Set<string>();
    for (const w of tr.writes) {
      const why = allowed(w);
      if (why) { kinds.add(`${w.writer}:${why}`); continue; }
      const k = `${w.writer} wrote ${w.actor.kind}.${w.path}`;
      if (!bad.has(k)) bad.set(k, `${String(w.was)} → ${String(w.now)}`);
    }
    expect([...bad.entries()].map(([k, v]) => `${k}: ${v}`)).toEqual([]);
    expect(seen.has('damage:zone')).toBe(true);
    expect(seen.has('damage:strike')).toBe(true);
    for (const k of ['movement:owner', 'combat:owner', 'partner:owner', 'combat:spend']) expect(kinds.has(k), k).toBe(true);
  });
});

function patch(systems: readonly { id: string; step: (...a: never[]) => void }[], bus: AdventureBus, tr: ReturnType<typeof tracker>): void {
  let stepping: Writer = 'host';
  for (const s of systems) {
    const owner = OWNER_OF_SYSTEM[s.id] ?? 'host';
    const step = s.step.bind(s) as (...a: unknown[]) => void;
    (s as { step: (...a: unknown[]) => void }).step = (...a: unknown[]) => {
      const was = tr.writer;
      tr.writer = owner; stepping = owner;
      try { step(...a); } finally { tr.writer = was; stepping = 'host'; }
    };
  }
  const on = bus.on.bind(bus);
  (bus as { on: AdventureBus['on'] }).on = ((name: never, fn: (p: unknown) => void) => {
    const owner = stepping;
    return on(name, ((p: unknown) => {
      const was = tr.writer;
      if (owner !== 'host') tr.writer = owner;
      try { fn(p); } finally { tr.writer = was; }
    }) as never);
  }) as AdventureBus['on'];
}

describe('BR sim purity', () => {
  it('no BR sim file imports Babylon itself, reads a clock, draws the global random or touches the DOM', () => {
    const dir = __dirname;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'view.ts');
    expect(files.length).toBeGreaterThanOrEqual(14);
    for (const f of [...files.map((x) => path.join(dir, x)), path.join(dir, '../world/pieces/brTiles.ts')]) {
      const src = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(/from '@babylonjs/.test(src), path.basename(f)).toBe(false);
      expect(/Date\.now|performance\.now|Math\.random\s*\(|requestAnimationFrame|window\.|document\./.test(src), path.basename(f)).toBe(false);
    }
  });
});

describe('fairness: the normalised fighter', () => {
  it('everyone fights at the BR level whatever their save, and nothing in a match levels anyone up', async () => {
    const { emptyAdventureSave } = await import('../contracts');
    const { BR_LEVEL } = await import('./tuning');
    const save = emptyAdventureSave(0);
    save.player.level = 40; save.player.xp = 60000;   // a veteran's save: the BR does not read it
    const m = new BRMatch({ seed: 606, humans: 1, player: { school: save.player.school, partner: null } });
    run(m, 1);
    const levels = new Set([...m.world.actors.values()].map((a) => a.stats.level));
    expect(levels).toEqual(new Set([BR_LEVEL]));
    const hp = new Set(m.fighters.map((f) => m.world.actors.get(f.id)!.stats.hp.max));
    expect(hp.size).toBe(1);
    // rail tricks and knockouts would pay XP in the story; inside a match they pay none
    for (let i = 0; i < 40; i++) m.bus.emit('rail:trick', { actorId: 'player', trick: 'spin', points: 5000 });
    run(m, 0.5);
    expect(m.player!.stats.level).toBe(BR_LEVEL);
    expect(m.stats.derived('player')!.level).toBe(BR_LEVEL);
  });
});
