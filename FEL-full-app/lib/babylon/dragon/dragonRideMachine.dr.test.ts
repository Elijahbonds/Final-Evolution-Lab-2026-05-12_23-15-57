// DR-1 … DR-14: the Glide / Surf / Dunk Drop state machine (DRAGON-RIDE-COMBO §0 verified rules, §9 tests, §10 picks).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DragonRideMachine, DUNK_DROP_FORM_COST, GLIDE_COOLDOWN_SEC, HITSTOP_CAP_MS, inputFrom, pressEdges, RIDE_BINDINGS, SURF_CHANNEL_SEC,
  SURF_COOLDOWN_SEC, SURF_STRIKE_MULT, type RideDevice, type RideEnv, type RideInput, type RideMode, type RideState, type RideVenue,
} from './dragonRideMachine';

const ENV: RideEnv = { partnerFlightCapable: true, partnerDistM: 1, stamina: 50, bond: 100, form: 100, finalFormActive: false };
const STEP = 1 / 60;
function run(m: DragonRideMachine, inp: RideInput, sec: number, env: Partial<RideEnv> = {}) { const n = Math.round(sec / STEP); for (let i = 0; i < n; i++) m.step(inp, { ...ENV, ...env }, STEP); }
function tap(m: DragonRideMachine, inp: RideInput, env: Partial<RideEnv> = {}) { m.step(inp, { ...ENV, ...env }, STEP); }
function toSurf(mode: RideMode = 'story', venue: RideVenue = 'open') {
  const m = new DragonRideMachine(mode, venue);
  tap(m, { mount: true }); run(m, {}, 0.45); run(m, { evolve: true }, 0.55); run(m, {}, SURF_CHANNEL_SEC[mode] + 0.05);
  expect(m.state).toBe('surf');
  return m;
}
const drops = (m: DragonRideMachine) => m.events.filter((e) => e.kind === 'dropResult');

describe('DR-1 Glide', () => {
  it('enters only with a flight-capable partner and stamina > 5; exits at stamina 0 with a 3 s cooldown', () => {
    for (const env of [{ partnerFlightCapable: false }, { stamina: 5 }, { partnerDistM: 9 }]) {
      const m = new DragonRideMachine('story'); tap(m, { mount: true }, env); run(m, {}, 1, env); expect(m.state).toBe('ground');
    }
    const m = new DragonRideMachine('story'); tap(m, { mount: true }); expect(m.state).toBe('mounting'); run(m, {}, 0.45); expect(m.state).toBe('glide');
    tap(m, {}, { stamina: 0 }); expect(m.state).toBe('ground'); expect(m.snapshot.cd.glide).toBeCloseTo(GLIDE_COOLDOWN_SEC, 6);
    tap(m, { mount: true }); expect(m.state).toBe('ground');
    run(m, {}, GLIDE_COOLDOWN_SEC); tap(m, { mount: true }); expect(m.state).toBe('mounting');
  });
});

describe('DR-2 Glide strikes', () => {
  it('has no strike except the single dive attack', () => {
    const m = new DragonRideMachine('story'); tap(m, { mount: true }); run(m, {}, 0.45);
    expect(m.strikesAllowed()).toEqual(['diveAttack']);
    tap(m, { strike: true }); run(m, {}, 0.6); tap(m, { strike: true }); run(m, {}, 0.6);
    const strikes = m.events.filter((e) => e.kind === 'strike');
    expect(strikes).toEqual([{ kind: 'strike', mult: 1, what: 'diveAttack' }]);
    expect(m.strikesAllowed()).toEqual([]);
  });
});

describe('DR-3 / DR-4 Surf gate and strike', () => {
  it('blocked when Bond < 50 (story) / match Bond < 100 (royale) or the partner is beyond 6 m', () => {
    const cases: [RideMode, Partial<RideEnv>][] = [['story', { bond: 49 }], ['royale', { bond: 99 }], ['story', { partnerDistM: 6.01 }], ['royale', { partnerDistM: 7 }]];
    for (const [mode, env] of cases) { const m = new DragonRideMachine(mode); run(m, { evolve: true }, 0.6, env); run(m, {}, 1.2, env); expect(m.state).not.toBe('surf'); }
    const ok = new DragonRideMachine('story'); run(ok, { evolve: true }, 0.55, { bond: 50, partnerDistM: 6 }); run(ok, {}, 1.05); expect(ok.state).toBe('surf');
  });
  it('applies exactly +15% strike in Surf, and only there', () => {
    const m = toSurf(); expect(m.strikeMult()).toBe(SURF_STRIKE_MULT); expect(SURF_STRIKE_MULT).toBe(1.15);
    tap(m, { strike: true }); expect(m.events.at(-1)).toEqual({ kind: 'strike', mult: 1.15, what: 'surf' });
    tap(m, { dismount: true }); expect(m.strikeMult()).toBe(1);
  });
});

describe('DR-5 X7-A', () => {
  it('entering Final Form during Surf ends Surf; Surf and Dunk Drop cannot start in Final Form', () => {
    const m = toSurf(); tap(m, { finalForm: true }); expect(m.state).toBe('ground');
    const ff = new DragonRideMachine('story'); run(ff, { evolve: true }, 0.6, { finalFormActive: true }); run(ff, {}, 1.2); expect(ff.state).not.toBe('surf');
    const s = toSurf(); tap(s, { ultimate: true }, { finalFormActive: true }); expect(s.state).not.toBe('dropDive');
  });
  it('P4: Final Form pressed mid-Dunk Drop is ignored until it resolves', () => {
    const m = toSurf(); tap(m, { ultimate: true }); expect(m.state).toBe('dropDive');
    tap(m, { finalForm: true, run: true }); expect(m.state).toBe('dropDive');
  });
});

describe('DR-6 Dunk Drop availability', () => {
  it('only from Surf; never in hoops, Dunk mode or a judged contest', () => {
    const g = new DragonRideMachine('story'); tap(g, { mount: true }); run(g, {}, 0.45); tap(g, { ultimate: true }); expect(g.state).toBe('glide');
    for (const v of ['hoops', 'dunkMode', 'judgedContest'] as RideVenue[]) { const m = toSurf('story', v); tap(m, { ultimate: true }); expect(m.state).toBe('surf'); }
    const ok = toSurf(); tap(ok, { ultimate: true }); expect(ok.state).toBe('dropDive');
    const poor = toSurf(); tap(poor, { ultimate: true }, { form: DUNK_DROP_FORM_COST - 1 }); expect(poor.state).toBe('surf');
  });
});

describe('DR-7 / DR-8 the dunk inside Dunk Drop', () => {
  it('hold-run → tap-jump → A slams; the prompts are the dunk cues, never a QTE', () => {
    const m = toSurf(); tap(m, { ultimate: true });
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) { m.prompts().forEach((p) => seen.add(p)); tap(m, { run: true }); }
    tap(m, { run: true, jump: true }); expect(m.state).toBe('dropAir'); m.prompts().forEach((p) => seen.add(p));
    tap(m, { slam: true });
    expect(drops(m).at(-1)).toMatchObject({ result: 'slam' });
    for (const p of seen) expect(p).not.toMatch(/QTE|PRESS NOW|[↑↓←→]/i);
  });
  it('a jump tap without run held does not launch', () => {
    const m = toSurf(); tap(m, { ultimate: true }); tap(m, { jump: true }); expect(m.state).toBe('dropDive');
  });
  it('no jump tap → pull-up, 0 damage, Form spent; jump but no slam → a miss, never a slam', () => {
    const a = toSurf(); tap(a, { ultimate: true }); run(a, { run: true }, 1.0);
    expect(drops(a).at(-1)).toEqual({ kind: 'dropResult', result: 'pullUp', damage: 0 });
    expect(a.snapshot.formSpent).toBe(DUNK_DROP_FORM_COST);
    const b = toSurf(); tap(b, { ultimate: true }); tap(b, { run: true, jump: true }); run(b, {}, 1.0);
    expect(drops(b).at(-1)).toEqual({ kind: 'dropResult', result: 'miss', damage: 0 });
    expect(drops(b).some((e) => e.kind === 'dropResult' && e.result === 'slam')).toBe(false);
  });
});

describe('DR-9 hit-stop', () => {
  it('every hit-stop the ride asks for is ≤ 120 ms (core/gameFeel.ts:47)', () => {
    const src = readFileSync(path.resolve(__dirname, '../core/gameFeel.ts'), 'utf8');
    expect(src).toMatch(/Math\.min\(ms, 120\)/);
    const m = toSurf(); tap(m, { ultimate: true }); tap(m, { run: true, jump: true }); tap(m, { slam: true });
    const g = new DragonRideMachine('story'); tap(g, { mount: true }); run(g, {}, 0.45); tap(g, { strike: true }); run(g, {}, 0.6);
    const stops = [...m.events, ...g.events].filter((e) => e.kind === 'hitStop');
    expect(stops.length).toBeGreaterThanOrEqual(2);
    for (const e of stops) expect(e.kind === 'hitStop' && e.ms).toBeLessThanOrEqual(HITSTOP_CAP_MS);
  });
});

describe('DR-10 cooldowns', () => {
  it('Glide 3 s; Surf 8 s story / 25 s royale; Dunk Drop has its own', () => {
    expect(GLIDE_COOLDOWN_SEC).toBe(3); expect(SURF_COOLDOWN_SEC).toEqual({ story: 8, royale: 25 });
    for (const mode of ['story', 'royale'] as RideMode[]) {
      const m = toSurf(mode); tap(m, { dismount: true }); expect(m.snapshot.cd.surf).toBeCloseTo(SURF_COOLDOWN_SEC[mode], 6);
      run(m, { evolve: true }, 0.6); run(m, {}, 1.2); expect(m.state).not.toBe('surf');
    }
    const d = toSurf(); tap(d, { ultimate: true }); run(d, { run: true }, 1.0); expect(d.snapshot.cd.drop).toBeGreaterThan(0);
  });
});

describe('DR-11 royale', () => {
  it('the Surf channel is 0.8 s and interruptible; story is 1.0 s and invulnerable', () => {
    expect(SURF_CHANNEL_SEC).toEqual({ story: 1.0, royale: 0.8 });
    const r = new DragonRideMachine('royale'); run(r, { evolve: true }, 0.55); expect(r.state).toBe('surfChannel'); tap(r, { interrupt: true }); expect(r.state).toBe('ground');
    const s = new DragonRideMachine('story'); run(s, { evolve: true }, 0.55); expect(s.snapshot.invulnerable).toBe(true); tap(s, { interrupt: true }); expect(s.state).toBe('surfChannel');
  });
  it('DR-D5: the Dunk Drop dive is interruptible in royale, with its tell visible while it can be', () => {
    const m = toSurf('royale'); tap(m, { ultimate: true }); expect(m.snapshot.tellVisible).toBe(true);
    tap(m, { interrupt: true, run: true }); expect(drops(m).at(-1)).toMatchObject({ result: 'interrupted', damage: 0 }); expect(m.snapshot.tellVisible).toBe(false);
  });
});

describe('DR-12 determinism', () => {
  it('the same input log gives the same state hash on two peers; a different log does not', () => {
    const log: [RideInput, Partial<RideEnv>][] = [];
    for (let i = 0; i < 600; i++) {
      const k = i % 97;
      log.push([{ mount: k === 1, evolve: k > 40 && k < 75, run: k > 80, jump: k === 88, slam: k === 92, ultimate: k === 79, strike: k === 20 }, { stamina: 50 - (i % 13), form: 100 }]);
    }
    const play = (l: typeof log) => { const m = new DragonRideMachine('royale'); for (const [inp, env] of l) m.step(inp, { ...ENV, ...env }, STEP); return m.stateHash(); };
    expect(play(log)).toBe(play(log));
    const other = log.map(([i, e], n) => [n === 300 ? { ...i, strike: !i.strike } : i, e] as [RideInput, Partial<RideEnv>]);
    expect(play(other)).not.toBe(play(log));
  });
});

describe('DR-13 bindings', () => {
  const reach = (device: RideDevice) => {
    const m = new DragonRideMachine('story'), seen = new Set<RideState>([m.state]);
    let prev: RideInput = {};
    const hold = (keys: string[], sec: number) => { const n = Math.max(1, Math.round(sec / STEP)); for (let i = 0; i < n; i++) { const cur = inputFrom(device, new Set(keys)); m.step(pressEdges(prev, cur), ENV, STEP); prev = cur; seen.add(m.state); } };
    const b = RIDE_BINDINGS[device];
    hold([...b.mount], STEP); hold([], 0.5);                              // mounting → glide
    hold([...b.strike], STEP); hold([], 0.6);                             // dive attack
    hold([...b.evolve], 0.55); hold([], 1.1);                             // surf channel → surf
    hold([...b.ultimate], STEP); hold([...b.run], 0.1);                   // dunk drop dive
    hold([...b.run, ...b.jump], STEP); hold([], STEP);                    // air
    hold([...b.slam], STEP);                                              // slam
    return seen;
  };
  for (const device of ['pad', 'keyboard', 'touch'] as RideDevice[]) {
    it(`${device} reaches every state`, () => {
      const seen = reach(device);
      for (const s of ['ground', 'mounting', 'glide', 'diveAttack', 'surfChannel', 'surf', 'dropDive', 'dropAir'] as RideState[]) expect(seen.has(s), s).toBe(true);
    });
  }
  it('the pad A that jumped is not also the slam (press edges)', () => {
    const m = toSurf(); tap(m, { ultimate: true });
    let prev: RideInput = {};
    for (const keys of [['RT'], ['RT', 'A'], ['RT', 'A'], ['RT', 'A']]) { const cur = inputFrom('pad', new Set(keys)); m.step(pressEdges(prev, cur), ENV, STEP); prev = cur; }
    expect(m.state).toBe('dropAir');
  });
});

describe('DR-14 / DR-D6 Check C', () => {
  it('scripts/onevone-depth-tests.ts is byte-identical to ce122bb7 (Check C word for word)', () => {
    const buf = readFileSync(path.resolve(__dirname, '../../../scripts/onevone-depth-tests.ts'));
    expect(createHash('sha256').update(buf).digest('hex')).toBe('d1477126398cdd9bf4d27bacbf127cc8831b2f4bf49e46a0e63d533b210b5992');
  });
});

describe('v2 (PM 5:50 PM PT): Dunk Drop is Surf-only; no jump = pull-up, 0 damage, Form spent', () => {
  it('DR-v2-1 Surf-only gate: the ultimate does nothing from ground, mounting or Glide, and is refused in hoops, Dunk mode and contest', () => {
    const g = new DragonRideMachine('story'); tap(g, { ultimate: true }); expect(g.state).toBe('ground');
    tap(g, { mount: true }); expect(g.state).toBe('mounting'); tap(g, { ultimate: true }); expect(g.state).toBe('mounting');
    run(g, {}, 0.45); expect(g.state).toBe('glide'); tap(g, { ultimate: true }); expect(g.state).toBe('glide');
    expect(g.snapshot.formSpent).toBe(0); expect(g.events.some((e) => e.kind === 'formSpent')).toBe(false);
    for (const venue of ['hoops', 'dunkMode', 'judgedContest'] as RideVenue[]) {
      const m = toSurf('story', venue);
      expect(m.canDunkDrop({ ...ENV })).toBe(false);
      tap(m, { ultimate: true }); expect(m.state).toBe('surf'); expect(m.snapshot.formSpent).toBe(0);
      expect(m.events.at(-1)).toEqual({ kind: 'refused', why: 'venue' });
    }
    const ok = toSurf('story', 'open'); expect(ok.canDunkDrop({ ...ENV })).toBe(true); tap(ok, { ultimate: true }); expect(ok.state).toBe('dropDive');
  });

  it('DR-v2-2 no jump tap: holding run through the dive pulls up for 0 damage and Form is still spent; no slam, no hit-stop', () => {
    for (const mode of ['story', 'royale'] as RideMode[]) {
      const m = toSurf(mode); tap(m, { ultimate: true }); expect(m.snapshot.formSpent).toBe(DUNK_DROP_FORM_COST);
      run(m, { run: true, slam: true }, 1.0);   // run held, A mashed, but never a jump tap
      expect(drops(m)).toEqual([{ kind: 'dropResult', result: 'pullUp', damage: 0 }]);
      expect(m.snapshot.formSpent).toBe(DUNK_DROP_FORM_COST);
      expect(m.events.filter((e) => e.kind === 'hitStop')).toEqual([]);
      expect(m.snapshot.dropJumped).toBe(false);
      expect(m.state).not.toBe('dropAir');
    }
  });
});
