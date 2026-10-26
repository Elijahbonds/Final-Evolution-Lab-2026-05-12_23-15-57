// PERF-LOAD PRF-04: the load plan holds a planned mode's extras until READY's first frame, then runs them one a frame.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DroppedError, HOOPS_LATER, LoadPlan, planStreams, STREAM_HOLD_FRAMES, streamExtra, streamWhileLoading, _activePlan } from './loadPlan';
import { stripComments } from '@/lib/testing/sourceScan';

const ROOT = path.resolve(__dirname, '../../..');

function rig() {
  let t = 0; const frames: Array<() => void> = []; const log: string[] = [];
  const plan = new LoadPlan({
    now: () => t,
    nextFrame: () => new Promise<void>((r) => frames.push(r)),
    log: (m) => log.push(m),
  });
  const frame = async () => { t += 16; const f = frames.shift(); f?.(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  return { plan, frame, settle, log, setT: (v: number) => { t = v; } };
}

describe('LoadPlan', () => {
  it('holds every job until start(), then runs them in order, one a frame, and records the full time', async () => {
    const { plan, frame, settle, log, setT } = rig();
    const ran: string[] = [];
    const a = plan.defer('props', () => { ran.push('props'); return 1; });
    const b = plan.defer('crowd', async () => { ran.push('crowd'); return 2; });
    await settle();
    expect(ran).toEqual([]);
    expect(plan.state()).toMatchObject({ held: 2, done: 0, startedAt: null, doneAt: null, labels: ['props', 'crowd'] });
    setT(1000);
    plan.start();
    await settle();
    expect(ran).toEqual(['props']);           // one job, then a frame
    expect(await a).toBe(1);
    await frame();
    await settle();
    expect(ran).toEqual(['props', 'crowd']);
    expect(await b).toBe(2);
    expect(plan.state()).toMatchObject({ held: 2, done: 2, failed: 0, startedAt: 1000, doneAt: 1016 });
    expect(log.at(-1)).toMatch(/streamed 2 extras after READY in 16 ms/);
  });

  it('hold(n): nothing new runs for the next n frames (play begins), then the held jobs go on', async () => {
    const { plan, frame, settle } = rig();
    const ran: string[] = [];
    plan.defer('props', () => { ran.push('props'); });
    plan.hold(STREAM_HOLD_FRAMES);
    plan.start();
    for (let i = 0; i < STREAM_HOLD_FRAMES - 1; i++) { await frame(); await settle(); }
    expect(ran).toEqual([]);
    await frame(); await settle();
    expect(ran).toEqual(['props']);
    expect(STREAM_HOLD_FRAMES).toBe(30);
  });

  it('the harness holds the plan as play begins (the countdown, or straight into play)', () => {
    const h = stripComments(fs.readFileSync(path.join(ROOT, 'lib/babylon/core/ModeHarness.ts'), 'utf8'));
    expect(h).toMatch(/streamPhase = \(p\) => \{ if \(p === 'countdown' \|\| p === 'playing'\) plan\.hold\(STREAM_HOLD_FRAMES\); \};/);
    expect(h).toMatch(/phase = p;\s*streamPhase\?\.\(p\);/);
  });

  it('a job deferred after start() runs after the ones already held', async () => {
    const { plan, settle } = rig();
    const ran: string[] = [];
    plan.start();
    await plan.defer('late', () => { ran.push('late'); });
    await settle();
    expect(ran).toEqual(['late']);
  });

  it('a failing job is counted and logged, its promise rejects, and the next job still runs', async () => {
    const { plan, frame, settle, log } = rig();
    const bad = plan.defer('broken', () => { throw new Error('404'); });
    const good = plan.defer('fine', () => 'ok');
    plan.start();
    await expect(bad).rejects.toThrow('404');
    await frame(); await settle();
    expect(await good).toBe('ok');
    expect(plan.state()).toMatchObject({ done: 1, failed: 1 });
    expect(log.some((l) => /stream "broken" failed: 404/.test(l))).toBe(true);
  });

  it('dispose(): nothing held runs; each held promise rejects with a DroppedError', async () => {
    const { plan, settle } = rig();
    const ran: string[] = [];
    const p = plan.defer('props', () => { ran.push('props'); });
    plan.dispose();
    plan.start();
    await expect(p).rejects.toBeInstanceOf(DroppedError);
    await settle();
    expect(ran).toEqual([]);
    await expect(plan.defer('after', () => undefined)).rejects.toBeInstanceOf(DroppedError);
  });
});

describe('streamWhileLoading (shared visual code inside a load)', () => {
  it('outside a planned load: runs now', async () => {
    expect(_activePlan()).toBeNull();
    const job = vi.fn(() => 7);
    expect(await streamWhileLoading('x', job, 0)).toBe(7);
    expect(job).toHaveBeenCalledOnce();
  });

  it('inside a planned load: held until the plan opens; after it opens, runs now', async () => {
    const { plan, settle } = rig();
    const job = vi.fn(() => 'props');
    plan.enterLoad();
    const p = streamWhileLoading('props', job, null);
    plan.exitLoad();
    await settle();
    expect(job).not.toHaveBeenCalled();
    plan.start();
    expect(await p).toBe('props');
    // the plan is open: a call now (or after load) runs at once, as before
    plan.enterLoad();
    const job2 = vi.fn(() => 'now');
    expect(await streamWhileLoading('later', job2, null)).toBe('now');
    plan.exitLoad();
    expect(plan.state().held).toBe(1);
  });

  it('a held job whose mount went first resolves to the caller\'s dropped value (no unhandled rejection)', async () => {
    const { plan } = rig();
    plan.enterLoad();
    const p = streamWhileLoading('props', () => 'never', 'gone');
    plan.exitLoad();
    plan.dispose();
    expect(await p).toBe('gone');
  });

  it('a held job that fails rejects as it would have unplanned', async () => {
    const { plan } = rig();
    plan.enterLoad();
    const p = streamWhileLoading('props', () => { throw new Error('kit 404'); }, null);
    plan.exitLoad();
    plan.start();
    await expect(p).rejects.toThrow('kit 404');
  });
});

describe('which modes plan', () => {
  it('every mode but the hoops family (hoops-round2 adopts it; the dunk streams its own contest set)', () => {
    for (const k of ['karate', 'football', 'velocitykart', 'tennis', 'baseball', 'derby', 'skateboard', 'dance', 'tiebreak']) expect(planStreams(k), k).toBe(true);
    for (const k of ['dunk', 'dunkduel', 'onevone', 'threepoint', 'threevthree', 'carnival']) expect(planStreams(k), k).toBe(false);
    expect([...HOOPS_LATER].sort()).toEqual(['carnival', 'dunk', 'dunkduel', 'onevone', 'threepoint', 'threevthree']);
  });

  it('streamExtra: through ctx.stream when the harness gave one, at once otherwise', async () => {
    const held: string[] = [];
    streamExtra({ stream: (l) => { held.push(l); } }, 'crowd', () => undefined);
    expect(held).toEqual(['crowd']);
    const job = vi.fn();
    streamExtra({}, 'crowd', job);
    await Promise.resolve(); await Promise.resolve();
    expect(job).toHaveBeenCalledOnce();
  });
});

describe('the harness wires it', () => {
  const src = stripComments(fs.readFileSync(path.join(ROOT, 'lib/babylon/core/ModeHarness.ts'), 'utf8'));
  it('load() runs inside the plan, the plan opens after READY\'s first frame, and goes with the mount', () => {
    expect(src).toMatch(/if \(streams\) plan\.enterLoad\(\);\s*try \{ await def\.load\(ctx\); \} finally \{ plan\.exitLoad\(\); \}/);
    expect(src).toMatch(/setPhase\('ready'\);\s*\{ const p = plan; scene\.onAfterRenderObservable\.addOnce\(\(\) => p\.start\(\)\); \}/);
    expect(src).toMatch(/plan\.dispose\(\);\s*def\.dispose\?\.\(\);/);
  });
  it('the CC0 prop sets go through the plan (VenueProps.mountVenueProps)', () => {
    const vp = stripComments(fs.readFileSync(path.join(ROOT, 'lib/babylon/visual/VenueProps.ts'), 'utf8'));
    expect(vp).toMatch(/return streamWhileLoading\(`props \$\{venueKey\}`/);
  });
});
