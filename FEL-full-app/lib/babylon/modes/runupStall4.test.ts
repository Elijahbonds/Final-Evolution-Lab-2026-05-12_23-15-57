// RUNUP-STALL-4 (2026-10-30), knob dunk.preloadSet (default off): the preload's particle kinds one a frame; each body's
// mask fitting one a frame (bodyMask.scheduleBodyMask, opted in per scene); the venue's dressing jobs one a frame.
// Off, every one of these runs exactly as before.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { scheduleBodyMask, setMaskOnePerFrame, masksOnePerFrame } from '../core/bodyMask';
import { PRELOAD_BURSTS } from './dunkContestDefer';

const root = join(__dirname, '../../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const dunk = read('lib/babylon/modes/DunkMode.ts');
const venue = read('lib/babylon/core/NexusVenue.ts');
const between = (s: string, a: string, b: string) => { const i = s.indexOf(a); expect(i, a).toBeGreaterThan(-1); const j = s.indexOf(b, i); expect(j, b).toBeGreaterThan(i); return s.slice(i, j); };
const pre = between(dunk, 'async function preloadContestSet(ctx: ModeContext)', '\n  /** RUNUP-STALL-3: resolves on the scene');

describe('RUNUP-STALL-4: one particle burst per frame', () => {
  it("the preload's own loop, run, asks for a frame before every kind", async () => {
    const line = pre.split('\n').find((l) => l.includes('for (const kind of PRELOAD_BURSTS)'))!;
    const loop = line.slice(line.indexOf('for ('), line.lastIndexOf('}') + 1);
    let frameNo = 0; const at: { kind: string; frame: number }[] = [];
    const frame = async () => { frameNo++; };
    const EffectsKit = { burst: (_s: unknown, _p: unknown, kind: string) => { at.push({ kind, frame: frameNo }); } };
    const run = new Function('PRELOAD_BURSTS', 'frame', 'EffectsKit', 'Vector3', 'ctx', `return (async () => { ${loop} })();`);
    await run(PRELOAD_BURSTS, frame, EffectsKit, class { constructor(..._a: number[]) {} }, { scene: {} });
    expect(at.map((b) => b.kind)).toEqual([...PRELOAD_BURSTS]);
    expect(new Set(at.map((b) => b.frame)).size).toBe(at.length);   // FAILS if two kinds are created in one frame
    expect(at.map((b) => b.frame)).toEqual(PRELOAD_BURSTS.map((_, i) => i + 1));
  });
});

/** A scene with a hand-driven after-render clock, and bodies whose fitting is counted (a fake body fails to fit fast and
 *  scheduleBodyMask logs "[FEL-KIT] body mask skipped" once per fitting run). */
function rig() {
  let cbs: (() => void)[] = [];
  const scene = { onAfterRenderObservable: { addOnce: (cb: () => void) => { cbs.push(cb); } } };
  const body = (n: number) => ({ name: 'Body', skeleton: {}, getScene: () => scene, isDisposed: () => false, computeWorldMatrix: () => ({ m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }), id: n });
  const render = () => { const run = cbs; cbs = []; for (const cb of run) cb(); };
  return { scene, body, render };
}
function countFits(fn: () => void): number {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try { fn(); return warn.mock.calls.filter((c) => String(c[0]).startsWith('[FEL-KIT] body mask skipped')).length; } finally { warn.mockRestore(); }
}

describe('RUNUP-STALL-4: mask fitting one body per frame (opted-in scenes only)', () => {
  it('off (every scene by default): five bodies due on one frame all fit on that frame, as before', () => {
    const { scene, body, render } = rig();
    expect(masksOnePerFrame(scene as never)).toBe(false);
    for (let i = 0; i < 5; i++) scheduleBodyMask([body(i)] as never);
    expect(countFits(render)).toBe(5);
    expect(countFits(render)).toBe(0);
  });
  it('on: the same five fit one per rendered frame, in order, and the queue empties', () => {
    const { scene, body, render } = rig();
    setMaskOnePerFrame(scene as never, true);
    for (let i = 0; i < 5; i++) scheduleBodyMask([body(i)] as never);
    for (let f = 0; f < 5; f++) expect(countFits(render)).toBe(1);   // FAILS if two fittings share a frame
    expect(countFits(render)).toBe(0);
    setMaskOnePerFrame(scene as never, false);
    expect(masksOnePerFrame(scene as never)).toBe(false);
  });
  it('on: a body disposed while it waits in the queue is not fitted', () => {
    const { scene, body, render } = rig();
    setMaskOnePerFrame(scene as never, true);
    let gone = false; const b2 = { ...body(2), isDisposed: () => gone };
    scheduleBodyMask([body(1)] as never); scheduleBodyMask([b2] as never);
    expect(countFits(render)).toBe(1);
    gone = true;
    expect(countFits(render)).toBe(0);
  });
  it('only the preload opts the dunk scene in', () => {
    expect(dunk.match(/setMaskOnePerFrame\(/g)).toHaveLength(1);
    expect(pre).toContain('setMaskOnePerFrame(ctx.scene, true);');
    expect(dunk).toContain("if (feel('dunk.preloadSet', DUNK_PRELOAD_SET_ON) >= 0.5) void preloadContestSet(ctx);");
  });
});

describe('RUNUP-STALL-4: the dressing jobs one per frame (paceDressing, knob on only)', () => {
  it('off: the jobs start together (Promise.all), exactly as before; on: onePerFrame on the scene clock', () => {
    const mount = between(venue, 'const mountDressing = (): Promise<void> => (dressing ??= ', '\n  if (!options.deferDressing)');
    expect(mount).toContain('(dressingPaced ? pacedJobs() : Promise.all(dressingJobs.map((job) => job())))');
    expect(venue).toContain('let dressingPaced = false;');
    expect(venue).toContain('const pacedJobs = (): Promise<unknown> => onePerFrame(dressingJobs.map((job) => () => Promise.resolve(job())), (cb) => { ctx.scene.onBeforeRenderObservable.addOnce(cb); }, () => disposed);');
    expect(venue).toContain('paceDressing() { dressingPaced = true; },');
    expect(venue.match(/dressingPaced = true/g)).toHaveLength(1);
  });
  it('only the preload paces it, before it mounts the dressing', () => {
    expect(dunk.match(/paceDressing\?\.\(\)/g)).toHaveLength(1);
    expect(pre.indexOf('dunkVenue?.paceDressing?.();')).toBeLessThan(pre.indexOf('await dunkVenue?.mountDressing();'));
  });
});
