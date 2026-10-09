// THE FIELD-OWNERSHIP TEST (ADVENTURE PLAN, "How a mode hosts it": "A4 adds a test that steps all three systems and
// fails if any wrote a field it does not own"). It plays the scripted 60 s yard run — every system busy: running,
// grinding, homing, a lock fight with strings, a parry and spells, fusion, flight, a mount — with every body wrapped in a
// write tracker. Each write that CHANGES a value is charged to whoever was running: the system whose step it was, or
// the system that subscribed the bus handler that made it (A3's stats system granting a trick's energy inside A1's
// step is A3's write). The owner of each field is contracts.ACTOR_FIELD_OWNERS; the rules a table cannot say are below.
import { describe, expect, it } from 'vitest';
import { ownersOfField, type AdventureActor, type AdventureBus, type FieldOwner } from '../contracts';
import { runSandboxScript } from './sandboxScript';

type Writer = FieldOwner | 'host';
const OWNER_OF_SYSTEM: Record<string, Writer> = {
  'adventure.movement': 'movement', 'adventure.combat': 'combat', 'adventure.magic': 'combat',
  'adventure.partner': 'partner', 'adventure.stats': 'partner',
};

interface Write { writer: Writer; actor: AdventureActor; path: string; was: unknown; now: unknown }

function tracker() {
  let writer: Writer = 'host';
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
        if (!Object.is(was, v)) writes.push({ writer, actor: actor(), path: p, was, now: v });
        return Reflect.set(t, k, v);
      },
    });
    proxies.set(raw, px);
    return px;
  };
  const instrument = (a: AdventureActor): AdventureActor => {
    let self: AdventureActor;
    self = wrap(a, '', () => self);
    return self;
  };
  return {
    instrument, writes,
    get writer() { return writer; },
    set writer(w: Writer) { writer = w; },
  };
}

/** May `w.writer` make this write? The table, plus the rules it cannot say (contracts.ts ACTOR_FIELD_OWNERS). */
function allowed(w: Write): string | null {
  const owners = ownersOfField(w.path);
  if (w.writer === 'host') return 'spawn';   // the spawner and the yard's runtime (respawns, the gate): a spawn's writes
  if (owners.includes(w.writer)) return 'owner';
  // energy: anyone SPENDS (spendPool); only A3 gains (regen, a trick's energy, its pool invariant)
  if (w.path === 'stats.energy.cur') {
    if (typeof w.was === 'number' && typeof w.now === 'number' && w.now < w.was) return 'spend';
    if (w.writer === 'partner') return 'owner';
  }
  // A3's pool invariant: a cur lowered to a max A3 just lowered
  const pool = /^stats\.(hp|stamina|poise)\.cur$/.exec(w.path);
  if (pool && w.writer === 'partner' && typeof w.now === 'number' && typeof w.was === 'number' && w.now < w.was
    && w.now <= (w.actor.stats as unknown as Record<string, { max: number }>)[pool[1]].max + 1e-9) return 'pool-invariant';
  // a fused partner's body is A3's while fused, and at the unfuse (it reappears beside the player)
  if (w.writer === 'partner' && w.actor.kind === 'partner' && /^(pos|vel)(\.|$)/.test(w.path)) return 'fused-partner';
  // A1 clears the two request fields A2 hands it, once applied
  if (w.writer === 'movement' && (w.path === 'impulse' || w.path === 'warp') && w.now === null) return 'consumed';
  return null;
}

describe('field ownership: every system writes only the fields it owns', () => {
  it('through the scripted 60 s yard run', () => {
    const tr = tracker();
    const run = runSandboxScript({
      seed: 11,
      instrument: tr.instrument,
      // before the first step: the systems subscribe their handlers lazily on their first step, under the patched bus
      beforeRun: (sb) => patchHost(sb.host.systems, sb.host.bus, tr),
    });
    const violations = new Map<string, string>();
    const kinds = new Set<string>();
    for (const w of tr.writes) {
      const why = allowed(w);
      if (why) { kinds.add(`${w.writer}:${why}`); continue; }
      const key = `${w.writer} wrote ${w.actor.kind}.${w.path}`;
      if (!violations.has(key)) violations.set(key, `${String(w.was)} → ${String(w.now)}`);
    }
    // the run did exercise everything the ownership has to hold through
    for (const b of ['catch', 'switch', 'homing', 'string', 'parry', 'spell', 'fuse', 'fly', 'unfuse', 'mount', 'dismount'] as const) {
      expect(run.reached[b], `beat ${b}`).toBeDefined();
    }
    expect([...violations.entries()].map(([k, v]) => `${k}: ${v}`)).toEqual([]);
    // and every lane did write (a tracker that charged nothing to anyone would pass the line above)
    for (const k of ['movement:owner', 'combat:owner', 'partner:owner', 'partner:fused-partner', 'combat:spend', 'movement:consumed']) {
      expect(kinds.has(k), k).toBe(true);
    }
  });
});

/** Charge each system's step, and each handler a system subscribed, to that system. */
function patchHost(systems: readonly { id: string; step: (...a: never[]) => void }[], bus: AdventureBus, tr: ReturnType<typeof tracker>): void {
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
  // handlers subscribed from here on are tagged with the system that subscribed them
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
