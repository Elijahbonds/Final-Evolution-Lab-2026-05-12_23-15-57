// PERF-834-LCP (b), PL-3 (unit) + PL-4 (2026-10-29): the flight gate holds every late step while a dunk is in the air and lets it
// through at the slam; dunk 1's preload set holds none of the late assets.
import { describe, expect, it } from 'vitest';
import { DUNK1_PRELOAD, LATE_ASSETS, createFlightGate } from './flightGate';

describe('createFlightGate', () => {
  it('no flight: clear() resolves without waiting', async () => {
    let waits = 0;
    const g = createFlightGate(() => false, () => true, async () => { waits++; });
    await g.clear();
    expect(waits).toBe(0); expect(g.inFlight).toBe(false);
  });
  it('in flight: clear() waits until the slam, then resolves', async () => {
    let flying = true, waits = 0;
    const g = createFlightGate(() => flying, () => true, async () => { waits++; if (waits === 3) flying = false; });
    let done = false;
    const p = g.clear().then(() => { done = true; });
    await p;
    expect(done).toBe(true); expect(waits).toBe(3);
  });
  it('a step that asks during a flight starts only after it: two attempts, nothing starts inside either flight', async () => {
    let flying = false;
    const started: { step: string; inFlight: boolean }[] = [];
    const ticks: (() => void)[] = [];
    const g = createFlightGate(() => flying, () => true, () => new Promise<void>((r) => ticks.push(r)));
    const step = async (name: string) => { await g.clear(); started.push({ step: name, inFlight: flying }); };
    const tick = async () => { for (const t of ticks.splice(0)) t(); await Promise.resolve(); await Promise.resolve(); };
    for (let attempt = 0; attempt < 2; attempt++) {
      flying = true;                                       // takeoff
      const p = [step(`body${attempt}`), step(`bus${attempt}`)];
      await tick(); await tick();
      expect(started.filter((s) => s.step.endsWith(String(attempt)))).toHaveLength(0);
      flying = false;                                      // the slam
      await tick(); await Promise.all(p);
    }
    expect(started.map((s) => s.step)).toEqual(['body0', 'bus0', 'body1', 'bus1']);
    expect(started.every((s) => !s.inFlight)).toBe(true);
  });
  it('a mode that is gone never strands a waiter', async () => {
    const g = createFlightGate(() => true, () => false, async () => { throw new Error('must not wait'); });
    await expect(g.clear()).resolves.toBeUndefined();
  });
});

describe('PL-4: dunk 1 preloads only what dunk 1 needs', () => {
  it('DUNK1_PRELOAD names the court, the ball, the hoop, one player and the pre-warm — and no late asset', () => {
    expect([...DUNK1_PRELOAD]).toEqual(['venue: venice court', 'ball', 'hoop', 'player body', 'shader pre-warm']);
    for (const late of LATE_ASSETS) expect(DUNK1_PRELOAD as readonly string[], late).not.toContain(late);
    for (const bad of [/jinx/, /hoopbus/, /\btent\b/, /audio\/voice\/v1/, /soundtrack|song/]) for (const p of DUNK1_PRELOAD) expect(p).not.toMatch(bad);
  });
});
