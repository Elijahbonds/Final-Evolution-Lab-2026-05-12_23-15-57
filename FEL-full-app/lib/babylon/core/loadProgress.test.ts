// FIRST-DUNK-BUDGET (2026-10-17): the load timer fails a load only when the download has STOPPED.
//
// AM's phone run: 4G with a slowed CPU, the dunk still downloading at ~25 MB when the flat 20 s watchdog fired ("Load timed out —
// check your connection and retry"), so a guest who was downloading fine never played. The clock here counts only time spent
// waiting with nothing arriving; the harness looks at it once a second and fires after 20 s of that.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SceneLoader, WebRequest } from '@babylonjs/core';
import { LoadStallClock, installLoadProgress, loadProgressTicks, noteLoadProgress } from './loadProgress';

/** A clock looked at once a second, as the harness does: returns the look (1-based) it first reported a stall on, or null. */
function run(clock: LoadStallClock, t: { now: number }, looks: number, beforeLook: (i: number) => void = () => {}, stepMs = 1000): number | null {
  for (let i = 1; i <= looks; i++) {
    t.now += stepMs;
    beforeLook(i);
    if (clock.stalled()) return i;
  }
  return null;
}

describe('LoadStallClock: 20 s with nothing arriving, not 20 s since the load began', () => {
  it('control: a load that never moves stalls at 20 s of looks (the old watchdog fired here too)', () => {
    const t = { now: 0 }; let ticks = 0;
    const clock = new LoadStallClock(20_000, 2_000, () => ticks, () => t.now);
    expect(run(clock, t, 60)).toBe(20);
  });
  it('a slow download that keeps arriving is never failed — a minute and more past the old 20 s', () => {
    const t = { now: 0 }; let ticks = 0;
    const clock = new LoadStallClock(20_000, 2_000, () => ticks, () => t.now);
    // a byte batch every 3 s for 120 s: the phone on 4G pulling a 2.4 MB hoop at a few hundred KB a second
    expect(run(clock, t, 120, (i) => { if (i % 3 === 0) ticks++; })).toBeNull();
  });
  it('the wait starts over at each arrival, and a download that STOPS still fails 20 s after its last byte', () => {
    const t = { now: 0 }; let ticks = 0;
    const clock = new LoadStallClock(20_000, 2_000, () => ticks, () => t.now);
    // bytes for the first 30 s, then nothing: the stall is the 20 s after the last byte (look 30) — look 50
    expect(run(clock, t, 90, (i) => { if (i <= 30) ticks++; })).toBe(50);
  });
  it('a look that comes late counts at most maxStep: a main thread busy parsing for 15 s is the CPU working, not a stall', () => {
    const t = { now: 0 }; const ticks = 0;
    const clock = new LoadStallClock(20_000, 2_000, () => ticks, () => t.now);
    t.now += 15_000;
    expect(clock.stalled()).toBe(false);   // 2 s counted, not 15
    expect(run(clock, t, 60)).toBe(18);    // 2 + 18 × 1 s = 20 s of real waiting
  });
});

describe('installLoadProgress: what counts as arriving', () => {
  const g = globalThis as Record<string, unknown>;
  afterEach(() => { delete g.window; delete g.XMLHttpRequest; delete g.PerformanceObserver; });

  it('the bytes of a Babylon file request, a finished resource of any kind, and a glTF loader step', () => {
    // a browser enough for the three sources: an XHR that reports progress, Resource Timing, a window
    const listeners: Record<string, Array<() => void>> = {};
    class FakeXhr { addEventListener(type: string, cb: () => void): void { (listeners[type] ??= []).push(cb); } open(): void {} send(): void {} setRequestHeader(): void {} }
    let resourceCb: ((list: { getEntries(): unknown[] }) => void) | null = null;
    class FakeObserver { constructor(cb: (list: { getEntries(): unknown[] }) => void) { resourceCb = cb; } observe(): void {} }
    g.window = {}; g.XMLHttpRequest = FakeXhr; g.PerformanceObserver = FakeObserver;
    installLoadProgress();
    installLoadProgress();   // idempotent: one listener per request, not two

    const start = loadProgressTicks();
    const req = new WebRequest();
    req.open('GET', '/models/meshy/hoop.glb');
    req.send();
    expect(listeners.progress).toHaveLength(1);
    listeners.progress[0]();
    listeners.progress[0]();
    expect(loadProgressTicks()).toBe(start + 2);                 // bytes arriving

    resourceCb!({ getEntries: () => [{ name: '/audio/x.bin' }] });
    expect(loadProgressTicks()).toBe(start + 3);                 // a finished fetch

    const steps = { onMeshLoadedObservable: { cbs: [] as Array<() => void>, add(cb: () => void) { this.cbs.push(cb); } } };
    SceneLoader.OnPluginActivatedObservable.notifyObservers(steps as never);
    steps.onMeshLoadedObservable.cbs.forEach((cb) => cb());
    expect(loadProgressTicks()).toBe(start + 4);                 // a loader step (the CPU half of a load sends no bytes)

    noteLoadProgress();
    expect(loadProgressTicks()).toBe(start + 5);                 // and a mode's own step
  });
});

describe('the harness arms it', () => {
  const src = readFileSync(join(__dirname, 'ModeHarness.ts'), 'utf8');
  const load = src.slice(src.indexOf('const attemptLoad = async'), src.indexOf('await attemptLoad();'));
  it('installs the sources and builds a stall clock over the same 20 s', () => {
    expect(src).toMatch(/const LOAD_WATCHDOG_MS = 20_000;/);
    expect(load).toContain('installLoadProgress();');
    expect(load).toContain('new LoadStallClock(LOAD_WATCHDOG_MS)');
  });
  it('the watchdog looks again while the load moves, and fails it only on a stall — with the same error screen and RETRY', () => {
    expect(load).toMatch(/let watchdog = setTimeout\(function look\(\) \{\s*if \(!stall\.stalled\(\)\) \{ watchdog = setTimeout\(look, LOAD_STALL_LOOK_MS\); return; \}/);
    expect(load).toContain("setPhase('error', 'Load timed out — check your connection and retry.');");
    expect(load).not.toContain('}, LOAD_WATCHDOG_MS);');   // the old flat 20 s from the start of the load (its exact closing line)
  });
});
