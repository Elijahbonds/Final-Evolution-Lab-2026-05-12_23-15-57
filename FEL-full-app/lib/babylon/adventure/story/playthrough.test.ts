// CHAPTER 1, HEADLESS (Phase B's proof): a scripted player plays the chapter from a first-run save — the hub, the
// gate, the rail run, the wall run, the homing chain, two camps, the mid-boss, the boss, THE FIRST FUSION, the flight
// home — through the real input path and all five systems, and ends back at the hub with flight unlocked. Deterministic
// from a seed, finite, inside the per-tick budget, the body budget held, and every system writing only its own fields.
import { describe, expect, it } from 'vitest';
import { ownersOfField, type AdventureActor, type AdventureBus, type FieldOwner } from '../contracts';
import { HOST_TICK_BUDGET_MS } from '../host/clock';
import { readAdventureSave } from '../save';
import { worldAt } from '../world/story/storyMap';
import { chapterById } from './data';
import { chapterDoneFlag, FLAG_FLIGHT_UNLOCKED, FLAG_FUSION_UNLOCKED, flightUnlockedIn, fusionUnlockedIn } from './flags';
import { runPlaythrough, type PlaythroughResult } from './playthrough';

const snapshot = (r: PlaythroughResult) => [...r.session.host.world.actors.values()]
  .map((a) => [a.id, a.state, a.pos.x.toFixed(6), a.pos.y.toFixed(6), a.pos.z.toFixed(6), a.stats.hp.cur.toFixed(6)].join(' '))
  .join('\n');

describe('Chapter 1, start to finish, headless', () => {
  let gatesAtBoss: { flight: boolean; fusion: boolean; mountFly: boolean } | null = null;
  const run = runPlaythrough({
    seed: 7, now: () => performance.now(),
    afterTick: (s) => {
      if (!gatesAtBoss && s.runner.beat?.id === 'b13-boss') {
        const f = s.save.story.flags;
        gatesAtBoss = { flight: flightUnlockedIn(f), fusion: fusionUnlockedIn(f), mountFly: s.host.partner!.mountCanFly(s.host.partnerId!) };
      }
    },
  });
  const s = run.session, save = s.save;

  it('plays every beat of the chapter, in order, and finishes', () => {
    const ids = chapterById('ch01')!.beats.map((b) => b.id);
    expect(Object.keys(run.beats)).toEqual(ids);
    for (let i = 1; i < ids.length; i++) expect(run.beats[ids[i]]).toBeGreaterThanOrEqual(run.beats[ids[i - 1]]);
    expect(s.runner.done).toBe(true);
    expect(save.story.flags[chapterDoneFlag('ch01')]).toBe(true);
    expect(run.storySec).toBeLessThan(600);          // finite: the run stops itself, well inside its limit
  });

  it('flight is locked until the boss falls: no flight before it, no fusion granted flight early, both gates shut at the boss', () => {
    expect(gatesAtBoss).toEqual({ flight: false, fusion: false, mountFly: false });
    expect(run.flewBeforeBoss).toBe(false);
    expect(run.flightGrantedEarly).toBe(false);
  });

  it('the boss falls, the party fuses for the first time, flight unlocks, and the party flies home to the hub', () => {
    expect(save.story.clearedBosses).toEqual(['boss.ch1']);
    expect(save.story.flags[FLAG_FUSION_UNLOCKED]).toBe(true);
    expect(save.story.flags[FLAG_FLIGHT_UNLOCKED]).toBe(true);
    expect(worldAt(s.map, s.host.player.pos)).toBe('hub');
    expect(save.story.checkpoint).toEqual({ worldId: 'hub', spawnId: 'hub.landing' });
    expect(save.story.worldsVisited).toEqual(['w1', 'hub']);
    expect(save.player.spells.known).toEqual([`bolt.${save.partner!.element}`]);   // the partner's element, learned in the story
    expect(save.story.flags['ch01.stance']).toBe('lead');                            // the choice the script moved to
  });

  it('the run is the plan\'s: a rail, a wall run, flight; the Adventure level grew; the progress saved at each checkpoint', () => {
    const p = s.progressSave();
    expect(p.player.level).toBeGreaterThan(1);
    expect(run.saves.some((x) => x.reason === 'checkpoint')).toBe(true);
    const last = run.saves.at(-1)!;
    expect(last.reason).toBe('chapter');
    const read = readAdventureSave(JSON.stringify(last.save), 0);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.save.story.flags[FLAG_FLIGHT_UNLOCKED]).toBe(true);
  });

  it('stays finite with no isolated handler error, and keeps the story body budget (≤ 12 bodies)', () => {
    expect(run.nonFinite).toEqual([]);
    expect(s.host.errors).toEqual([]);
    expect(run.maxBodies).toBeLessThanOrEqual(12);
  });

  it('stays inside the per-tick budget (host/clock.ts HOST_TICK_BUDGET_MS)', () => {
    const ms = [...run.tickMs].slice(60).sort((a, b) => a - b);
    const mean = ms.reduce((a, b) => a + b, 0) / ms.length;
    const p95 = ms[Math.floor(ms.length * 0.95)];
    console.info(`[B perf] chapter 1 tick: mean ${mean.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms over ${ms.length} ticks, ≤ ${run.maxBodies} bodies`);
    expect(mean).toBeLessThan(HOST_TICK_BUDGET_MS.mean);
    expect(p95).toBeLessThan(HOST_TICK_BUDGET_MS.p95);
  });

  it('replays exactly from its seed (the same input, the same chapter)', () => {
    const again = runPlaythrough({ seed: 7 });
    expect(snapshot(again)).toBe(snapshot(run));
    expect(again.beats).toEqual(run.beats);
    expect(again.ticks).toBe(run.ticks);
  });

  it('another seed also plays the chapter to the end', () => {
    const other = runPlaythrough({ seed: 23 });
    expect(other.session.runner.done).toBe(true);
    expect(other.session.save.story.flags[FLAG_FLIGHT_UNLOCKED]).toBe(true);
    expect(other.flewBeforeBoss).toBe(false);
  });
});

// ── field ownership through the whole chapter (A4's host/ownership.test rules, with the story's writers) ──

type Writer = FieldOwner | 'host';
const OWNER_OF_SYSTEM: Record<string, Writer> = {
  'adventure.movement': 'movement', 'adventure.combat': 'combat', 'adventure.magic': 'combat',
  'adventure.partner': 'partner', 'adventure.stats': 'partner',
};
interface Write { writer: Writer; actor: AdventureActor; path: string; was: unknown; now: unknown }

function tracker() {
  const state = { writer: 'host' as Writer };
  const writes: Write[] = [];
  const proxies = new WeakMap<object, unknown>();
  const wrap = <T extends object>(raw: T, path: string, actor: () => AdventureActor): T => {
    const hit = proxies.get(raw);
    if (hit) return hit as T;
    const px = new Proxy(raw, {
      get(t, k, r) {
        const v = Reflect.get(t, k, r);
        if (v && typeof v === 'object' && typeof k === 'string' && !Array.isArray(v)) return wrap(v as object, path ? `${path}.${k}` : k, actor);
        return v;
      },
      set(t, k, v) {
        const p = typeof k === 'string' ? (path ? `${path}.${k}` : k) : String(k);
        const was = Reflect.get(t, k);
        if (!Object.is(was, v)) writes.push({ writer: state.writer, actor: actor(), path: p, was, now: v });
        return Reflect.set(t, k, v);
      },
    });
    proxies.set(raw, px);
    return px;
  };
  const instrument = (a: AdventureActor): AdventureActor => { let self: AdventureActor; self = wrap(a, '', () => self); return self; };
  return { instrument, writes, state };
}

function allowed(w: Write): string | null {
  const owners = ownersOfField(w.path);
  if (w.writer === 'host') return 'spawn';   // the spawner and the story runtime (warps, respawns): a spawn's writes
  if (owners.includes(w.writer)) return 'owner';
  if (w.path === 'stats.energy.cur') {
    if (typeof w.was === 'number' && typeof w.now === 'number' && w.now < w.was) return 'spend';
    if (w.writer === 'partner') return 'owner';
  }
  const pool = /^stats\.(hp|stamina|poise)\.cur$/.exec(w.path);
  if (pool && w.writer === 'partner' && typeof w.now === 'number' && typeof w.was === 'number' && w.now < w.was
    && w.now <= (w.actor.stats as unknown as Record<string, { max: number }>)[pool[1]].max + 1e-9) return 'pool-invariant';
  if (w.writer === 'partner' && w.actor.kind === 'partner' && /^(pos|vel)(\.|$)/.test(w.path)) return 'fused-partner';
  if (w.writer === 'movement' && (w.path === 'impulse' || w.path === 'warp') && w.now === null) return 'consumed';
  return null;
}

describe('field ownership through Chapter 1', () => {
  it('every system writes only the fields it owns (the story\'s own writes are the spawner\'s)', () => {
    const tr = tracker();
    const run = runPlaythrough({
      seed: 7, instrument: tr.instrument,
      beforeRun: (sess) => patch(sess.host.systems, sess.host.bus, tr.state),
    });
    expect(run.session.runner.done).toBe(true);
    const violations = new Map<string, string>();
    const kinds = new Set<string>();
    for (const w of tr.writes) {
      const why = allowed(w);
      if (why) { kinds.add(`${w.writer}:${why}`); continue; }
      const key = `${w.writer} wrote ${w.actor.kind}.${w.path}`;
      if (!violations.has(key)) violations.set(key, `${String(w.was)} → ${String(w.now)}`);
    }
    expect([...violations.entries()].map(([k, v]) => `${k}: ${v}`)).toEqual([]);
    for (const k of ['movement:owner', 'combat:owner', 'partner:owner', 'partner:fused-partner', 'combat:spend', 'host:spawn']) expect(kinds.has(k), k).toBe(true);
  });
});

function patch(systems: readonly { id: string; step: (...a: never[]) => void }[], bus: AdventureBus, st: { writer: Writer }): void {
  let stepping: Writer = 'host';
  for (const sys of systems) {
    const owner = OWNER_OF_SYSTEM[sys.id] ?? 'host';
    const step = sys.step.bind(sys) as (...a: unknown[]) => void;
    (sys as { step: (...a: unknown[]) => void }).step = (...a: unknown[]) => {
      const was = st.writer; st.writer = owner; stepping = owner;
      try { step(...a); } finally { st.writer = was; stepping = 'host'; }
    };
  }
  const on = bus.on.bind(bus);
  (bus as { on: AdventureBus['on'] }).on = ((name: never, fn: (p: unknown) => void) => {
    const owner = stepping;
    return on(name, ((p: unknown) => {
      const was = st.writer;
      if (owner !== 'host') st.writer = owner;
      try { fn(p); } finally { st.writer = was; }
    }) as never);
  }) as AdventureBus['on'];
}
