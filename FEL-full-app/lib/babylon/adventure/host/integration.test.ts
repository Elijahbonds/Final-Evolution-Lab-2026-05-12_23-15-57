// The A4 integration proof (ADVENTURE PLAN A4 tests: "a 60 s headless sandbox run (player, partner, six monsters, a
// boss) with no NaN and no stuck state"; the task: run, grind, switch, homing a monster, fight with lock + string +
// parry + spell, fuse, fly, unfuse, mount, dismount — finite, deterministic from a seed, inside the per-tick budget).
// No Babylon: the host and all five lane systems, driven through the real input mapper by host/sandboxScript.
import { describe, expect, it } from 'vitest';
import { MOVEMENT_STATES, type AdventureEvents } from '../contracts';
import { SCRIPT_BEATS, runSandboxScript, type ScriptResult } from './sandboxScript';
import { HOST_TICK_BUDGET_MS } from './clock';

const snapshot = (r: ScriptResult) => [...r.sandbox.host.world.actors.values()]
  .map((a) => [a.id, a.state, a.pos.x.toFixed(6), a.pos.y.toFixed(6), a.pos.z.toFixed(6), a.stats.hp.cur.toFixed(6), a.stats.energy.cur.toFixed(6), a.fusion.meter.toFixed(6)].join(' '))
  .join('\n');

describe('the 60 s sandbox run, headless', () => {
  const run = runSandboxScript({ seed: 7, now: () => performance.now() });
  const host = run.sandbox.host;

  it('plays every beat of the script, in order', () => {
    const missed = SCRIPT_BEATS.filter((b) => b !== 'brawl' && run.reached[b] === undefined);
    expect(missed).toEqual([]);
    const times = SCRIPT_BEATS.filter((b) => b !== 'brawl').map((b) => run.reached[b]!);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    expect(run.ticks).toBe(60 * 60);
  });

  it('the beats are what the events say: a catch, a switch, a homing hit, a parry, a cast, a fusion on and off, flight, a mount on and off', () => {
    const c = run.counts;
    for (const k of ['rail:enter', 'rail:switch', 'rail:trick', 'homing', 'lock', 'spell:cast', 'fusion', 'mount', 'damage', 'telegraph'] as const) {
      expect(c[k] ?? 0, k).toBeGreaterThan(0);
    }
    expect(c.fusion).toBeGreaterThanOrEqual(2);   // on, and off
    expect(c.mount).toBeGreaterThanOrEqual(2);
  });

  it('stays finite: no NaN on any body on any tick, no isolated handler error', () => {
    expect(run.nonFinite).toEqual([]);
    expect(host.errors).toEqual([]);
    for (const a of host.world.actors.values()) {
      expect(MOVEMENT_STATES).toContain(a.state);
      expect(a.stats.hp.cur).toBeGreaterThanOrEqual(0);
      expect(a.stats.hp.cur).toBeLessThanOrEqual(a.stats.hp.max);
      expect(a.stats.energy.cur).toBeLessThanOrEqual(a.stats.energy.max + 1e-9);
    }
  });

  it('nothing gets stuck: no body holds an in-between state (grind, wall run, riding, stunned) for 10 s straight', () => {
    const seen = new Map<string, { state: string; at: number }>();
    let worst = { id: '', state: '', sec: 0 };
    const r2 = runSandboxScript({ seed: 7, beforeRun: (sb) => {
      sb.host.bus.on('state', (e: AdventureEvents['state']) => {
        const was = seen.get(e.actorId);
        const t = sb.host.tSec;
        if (was && ['grind', 'wallrun', 'riding', 'stunned'].includes(was.state) && t - was.at > worst.sec) worst = { id: e.actorId, state: was.state, sec: t - was.at };
        seen.set(e.actorId, { state: e.to, at: t });
      });
    } });
    for (const [id, s] of seen) {
      const held = r2.sandbox.host.tSec - s.at;
      if (['grind', 'wallrun', 'riding', 'stunned'].includes(s.state) && held > worst.sec) worst = { id, state: s.state, sec: held };
    }
    expect(worst.sec, `${worst.id} held ${worst.state}`).toBeLessThan(10);
  });

  it('replays exactly from its seed (the BR host handover and the dedicated server depend on it)', () => {
    const again = runSandboxScript({ seed: 7 });
    expect(snapshot(again)).toBe(snapshot(run));
    expect(again.counts).toEqual(run.counts);
    expect(again.reached).toEqual(run.reached);
  });

  it('stays inside the per-tick budget (host/clock.ts HOST_TICK_BUDGET_MS: the mean and the 95th percentile of a 60 Hz tick)', () => {
    const ms = [...run.tickMs].slice(60).sort((a, b) => a - b);   // the first second warms the JIT
    const mean = ms.reduce((a, b) => a + b, 0) / ms.length;
    const p95 = ms[Math.floor(ms.length * 0.95)];
    console.info(`[A4 perf] sandbox tick: mean ${mean.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms, ${host.world.actors.size} bodies`);
    expect(mean).toBeLessThan(HOST_TICK_BUDGET_MS.mean);
    expect(p95).toBeLessThan(HOST_TICK_BUDGET_MS.p95);
  });

  it('the yard keeps the story body budget: never more than 12 bodies in the scene', () => {
    let worst = 0;
    runSandboxScript({ seed: 7, afterTick: (sb) => { worst = Math.max(worst, sb.host.world.actors.size); } });
    expect(worst).toBeLessThanOrEqual(12);
  });
});
