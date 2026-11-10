// RUNUP-STALL-5 (2026-10-30), knob dunk.preloadSet (default off): (1) a paced body's mask fitting waits out the frame the body
// first drew on, then runs in steps, one a frame (maskBodySteps); (2) the turn swap reuses each body's motion layers.
// Off, both run exactly as before.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { scheduleBodyMask, setMaskOnePerFrame, maskBodySteps, maskBodyNow } from '../core/bodyMask';

const root = join(__dirname, '../../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const dunk = read('lib/babylon/modes/DunkMode.ts');
const mask = read('lib/babylon/core/bodyMask.ts');
const between = (s: string, a: string, b: string) => { const i = s.indexOf(a); expect(i, a).toBeGreaterThan(-1); const j = s.indexOf(b, i); expect(j, b).toBeGreaterThan(i); return s.slice(i, j); };

/** A scene with a frame counter (as Babylon's: render() bumps it before the after-render callbacks). */
function rig(withFrames: boolean) {
  let cbs: (() => void)[] = []; let frame = 10;
  const scene: Record<string, unknown> = { onAfterRenderObservable: { addOnce: (cb: () => void) => { cbs.push(cb); } } };
  if (withFrames) scene.getFrameId = () => frame;
  const body = () => ({ name: 'Body', skeleton: {}, getScene: () => scene, isDisposed: () => false, computeWorldMatrix: () => ({ m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }) });
  const render = () => { frame++; const run = cbs; cbs = []; for (const cb of run) cb(); };
  return { scene, body, render };
}
function countFits(fn: () => void): number {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try { fn(); return warn.mock.calls.filter((c) => String(c[0]).startsWith('[FEL-KIT] body mask skipped')).length; } finally { warn.mockRestore(); }
}

describe('RUNUP-STALL-5 (1): the fitting is not in the task of the frame the body first drew on', () => {
  it('paced, on a real frame clock: nothing on the first render after the spawn, the fitting on the next', () => {
    const { scene, body, render } = rig(true);
    setMaskOnePerFrame(scene as never, true);
    scheduleBodyMask([body()] as never);
    expect(countFits(render)).toBe(0);   // FAILS if the mask lands in the body's first-draw task (its world-matrix walk)
    expect(countFits(render)).toBe(1);
    expect(countFits(render)).toBe(0);
  });
  it('not paced (the default): the fitting runs on the first render, as before', () => {
    const { scene, body, render } = rig(true);
    scheduleBodyMask([body()] as never);
    expect(countFits(render)).toBe(1);
    void scene;
  });
});

describe('RUNUP-STALL-5 (1): maskBodySteps, the fitting in three steps', () => {
  const steps = between(mask, 'export function* maskBodySteps(', '\n}\n');
  it('yields after the body skin and after the garment skins; the mask and setIndices come last', () => {
    const y1 = steps.indexOf('yield;   // RUNUP-STALL-5: step 1 done');
    const y2 = steps.indexOf('yield;   // RUNUP-STALL-5: step 2 done');
    expect(steps.indexOf('const bodySkin = skinnedWorld(body);')).toBeLessThan(y1);
    expect(steps.indexOf('fitShortsUnderTop(')).toBeLessThan(y1);
    expect(y1).toBeLessThan(steps.indexOf('for (const m of meshes) {'));
    expect(steps.indexOf('for (const m of meshes) {')).toBeLessThan(y2);
    expect(y2).toBeLessThan(steps.indexOf('trimTubesUnderTops('));
    expect(y2).toBeLessThan(steps.indexOf('computeBodyMask('));
    expect(steps.indexOf('computeBodyMask(')).toBeLessThan(steps.indexOf('body.setIndices('));
    expect(steps.match(/\byield\b/g)).toHaveLength(2);
    expect(steps.match(/if \(body\.isDisposed\(\)\) return null;/g)).toHaveLength(2);   // a body gone while it waited is left alone
  });
  it('maskBodyNow runs the same steps straight through, in one call (the unpaced path is unchanged)', () => {
    const now = between(mask, 'export function maskBodyNow(', '\n}\n');
    expect(now).toContain('const it = maskBodySteps(body, meshes, why);');
    expect(now).toContain('for (;;) { const r = it.next(); if (r.done) return r.value; }');
    // run against a body that is still mid spawn-in: both give up the same way (null), with no step taken
    const b = { metadata: {}, getIndices: () => [0, 1, 2], computeWorldMatrix: () => ({ m: [0.001, 0, 0, 0, 0, 0.001, 0, 0, 0, 0, 0.001, 0, 0, 0, 0, 1] }) };
    expect(maskBodyNow(b as never, [])).toBeNull();
    const it2 = maskBodySteps({ ...b, metadata: {} } as never, []);
    expect(it2.next()).toEqual({ done: true, value: null });
  });
  it('a paced fitting goes on the queue as a stepped job that re-queues itself at the head until its last step', () => {
    expect(mask).toContain('if (maskPaced.has(scene)) { queueMask(scene, steppedFit()); return; }');
    expect(between(mask, 'function steppedJob(', '\n}\n')).toContain('if (!done) maskQueues.get(scene)?.unshift(job);');
    expect(mask).toContain('yield* maskBodySteps(b as Mesh, list);');
  });
});

describe('RUNUP-STALL-5 (2): the swap between turns reuses the motion layers (knob on)', () => {
  const fns = between(dunk, '  const motionCacheOn = (): boolean =>', '\n  function bindBody(');
  const bind = between(dunk, '    const reusedMotion = motionReused(player);', 'motionKeep(player, motion);');
  /** bindBody's motion lines and the helpers, run on stubs: `swaps` binds alternating bodies, as the turns do. */
  const run = (knob: number, warm = false) => {
    let built = 0, resets = 0;
    const MotionLayers = { forBody: () => { built++; return { drag: 1, wrists: 2, reset: () => { resets++; } }; } };
    const bodies = [{ skeleton: { id: 'p' }, root: { getChildMeshes: () => [] } }, { skeleton: { id: 'r' }, root: { getChildMeshes: () => [] } }];
    const strip = (t: string) => t.replace(/: typeof player/g, '').replace(/\): (MotionLayers \| null|MotionLayers|void) \{/g, ') {').replace(/ as never/g, '').replace(/\): boolean =>/g, ') =>').replace(/new WeakMap<object, MotionLayers>\(\)/g, 'new WeakMap()').replace(/m: MotionLayers\)/g, 'm)');
    const src = `const motionByBody = new WeakMap();\n${strip(fns)}\nreturn { motionFor, bindMotion(player) { let motion, limbDrag, wristLayer; ${strip(bind)}motionKeep(player, motion); return motion; } };`;
    const api = new Function('MotionLayers', 'feel', 'DUNK_PRELOAD_SET_ON', 'bindFrame', 'hipsBf', 'arms', src)(MotionLayers, () => knob, 0, () => ({}), {}, {});
    if (warm) api.motionFor(bodies[1]);
    for (let swap = 0; swap < 4; swap++) api.bindMotion(bodies[swap % 2]);
    return { built, resets };
  };
  it('off: every bind builds them, as before', () => { expect(run(0)).toEqual({ built: 4, resets: 0 }); });
  it('on: once per body, a reset on every reuse', () => { expect(run(1)).toEqual({ built: 2, resets: 2 }); });
  it('on, warmed by the preload: his first bind is a reuse too', () => { expect(run(1, true)).toEqual({ built: 2, resets: 3 }); });
  it('the preload builds his and the finalists\' after it pre-spawns them, one body a frame', () => {
    const pre = between(dunk, 'async function preloadContestSet(ctx: ModeContext)', '\n  /** RUNUP-STALL-3: resolves on the scene');
    const warm = 'for (const b of [rival, ...finalistBodies.values()]) { if (!b || ctx.scene.isDisposed) continue; await frame(); motionFor(b); }';
    expect(pre.indexOf('await prespawnFinalists(ctx);')).toBeLessThan(pre.indexOf(warm));
    expect(pre.indexOf(warm)).toBeLessThan(pre.indexOf('for (const kind of PRELOAD_BURSTS)'));
    expect(fns).toContain("feel('dunk.preloadSet', DUNK_PRELOAD_SET_ON) >= 0.5");
    expect(dunk.match(/motionFor\(/g)).toHaveLength(2);   // its definition and the preload: nothing else builds ahead
  });
});
