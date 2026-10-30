// RUNUP-STALL-3 (2026-10-30), knob dunk.preloadSet (default off). AM's 4c95bc64 re-gate (fel-visual-qa-2026-10-30/
// runup-stall-4c95bc64): (1) two "'instanceColor' : undeclared identifier" vertex shader errors when the preload finished;
// (2) 29 long tasks in the intro (up to 1,404 ms). Here: the warm-up compiles each mesh in its real state, the preload
// yields a frame between its steps, and a card with a progress bar stays up while the first run is held.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { NullEngine, Scene, MeshBuilder, StandardMaterial, Matrix } from '@babylonjs/core';
import { WARM_BATCH, drawsInstanced, isInstanceEntry, warmSceneShaders } from '../core/warmShaders';
import { DunkPreloadCard } from '../../../components/games/dunk-preload-card';

const root = join(__dirname, '../../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const dunk = read('lib/babylon/modes/DunkMode.ts');
const between = (s: string, a: string, b: string) => { const i = s.indexOf(a); expect(i, a).toBeGreaterThan(-1); const j = s.indexOf(b, i); expect(j, b).toBeGreaterThan(i); return s.slice(i, j); };

type Fake = { name: string; isDisposed: () => boolean; hasInstances?: boolean; hasThinInstances?: boolean; sourceMesh?: unknown; material: { forceCompilationAsync: (m: Fake, o?: { useInstances?: boolean }) => Promise<void> } | null };
function fakes(calls: { name: string; useInstances?: boolean }[]) {
  const mesh = (name: string, o: Partial<Fake> = {}): Fake => ({ name, isDisposed: () => false, material: { forceCompilationAsync: (m, opt) => { calls.push({ name: m.name, useInstances: opt?.useInstances }); return Promise.resolve(); } }, ...o });
  return mesh;
}

describe('RUNUP-STALL-3 (1): no instanceColor shader errors — each mesh compiles as it draws', () => {
  it('an instanced or thin-instanced mesh compiles with useInstances: true; a plain one with false; an InstancedMesh entry is skipped', async () => {
    const calls: { name: string; useInstances?: boolean }[] = []; const mesh = fakes(calls);
    const meshes = [mesh('crowd_master', { hasInstances: true }), mesh('flags', { hasThinInstances: true }), mesh('body'), mesh('crowd_master_i3', { sourceMesh: {} })];
    const n = await warmSceneShaders({ meshes } as never);
    expect(n).toBe(3);
    expect(calls).toEqual([{ name: 'crowd_master', useInstances: true }, { name: 'flags', useInstances: true }, { name: 'body', useInstances: false }]);
    expect(drawsInstanced(meshes[0] as never)).toBe(true);
    expect(drawsInstanced(meshes[2] as never)).toBe(false);
    expect(isInstanceEntry(meshes[3] as never)).toBe(true);
  });

  it('on a real Babylon scene, an instanced-colour mesh compiles with INSTANCES whenever INSTANCESCOLOR is on (the undeclared-identifier pair)', async () => {
    const engine = new NullEngine(); const scene = new Scene(engine);
    try {
      // a thin-instanced mesh with per-instance colour (the crowd's kind): Babylon turns INSTANCESCOLOR on from the mesh alone
      const box = MeshBuilder.CreateBox('crowd_box', { size: 1 }, scene);
      box.material = new StandardMaterial('crowd_mat', scene);
      const mats = new Float32Array(32); Matrix.Identity().copyToArray(mats, 0); Matrix.Translation(2, 0, 0).copyToArray(mats, 16);
      box.thinInstanceSetBuffer('matrix', mats, 16);
      box.thinInstanceSetBuffer('color', new Float32Array([1, 0, 0, 1, 0, 1, 0, 1]), 4);
      expect(box.isVerticesDataPresent('instanceColor')).toBe(true);
      const plain = MeshBuilder.CreateBox('plain_box', { size: 1 }, scene); plain.material = new StandardMaterial('plain_mat', scene);
      const built: string[] = [];
      const real = engine.createEffect.bind(engine);
      vi.spyOn(engine, 'createEffect').mockImplementation(((...a: unknown[]) => {
        const opts = a[1] as { defines?: string } | string[]; const defines = Array.isArray(opts) ? String(a[4] ?? '') : String(opts?.defines ?? '');
        built.push(defines);
        return (real as (...x: unknown[]) => unknown)(...a);
      }) as never);
      await warmSceneShaders(scene, scene.meshes, { nextFrame: (cb) => cb() });
      const colour = built.filter((d) => d.includes('#define INSTANCESCOLOR'));
      expect(colour.length).toBeGreaterThan(0);   // the crowd box's colour variant was compiled
      for (const d of colour) expect(d).toMatch(/#define INSTANCES\n/);   // FAILS when it is compiled without instances
      expect(built.some((d) => !d.includes('#define INSTANCES'))).toBe(true);   // the plain box: no instance defines
      // the 4c95bc64 call (no options) is the broken variant: INSTANCESCOLOR without INSTANCES — what the warm-up no longer asks for
      built.length = 0; box.material = new StandardMaterial('crowd_mat_old', scene);
      await box.material.forceCompilationAsync(box);
      expect(built.some((d) => d.includes('#define INSTANCESCOLOR') && !/#define INSTANCES\n/.test(d))).toBe(true);
    } finally { scene.dispose(); engine.dispose(); }
  });
});

describe('RUNUP-STALL-3 (2): the shader warm-up is spread over frames', () => {
  it(`at most WARM_BATCH (${WARM_BATCH}) pairs are asked for per frame, and the progress reaches the total`, async () => {
    const calls: { name: string }[] = []; const mesh = fakes(calls);
    const meshes = Array.from({ length: 20 }, (_, i) => mesh(`m${i}`));
    const perFrame: number[] = []; let last = 0; const progress: number[] = [];
    const nextFrame = (cb: () => void) => { perFrame.push(calls.length - last); last = calls.length; cb(); };
    const n = await warmSceneShaders({ meshes } as never, meshes as never, { nextFrame, onBatch: (done, total) => progress.push(done / total) });
    perFrame.push(calls.length - last);
    expect(n).toBe(20);
    expect(Math.max(...perFrame)).toBeLessThanOrEqual(WARM_BATCH);   // FAILS if a frame compiles more than one batch
    expect(perFrame.length).toBe(Math.ceil(20 / WARM_BATCH));
    expect(progress[progress.length - 1]).toBe(1);
  });
  it("a game scene's own frame clock is used when none is given (the preload's call)", async () => {
    const calls: { name: string }[] = []; const mesh = fakes(calls); let frames = 0;
    const scene = { meshes: Array.from({ length: 13 }, (_, i) => mesh(`m${i}`)), onBeforeRenderObservable: { addOnce: (cb: () => void) => { frames++; cb(); } } };
    await warmSceneShaders(scene as never);
    expect(frames).toBe(Math.ceil(13 / WARM_BATCH) - 1);
    expect(dunk).toContain('const pairs = await warmSceneShaders(ctx.scene);');
  });
});

describe('RUNUP-STALL-3 (2): the preload yields between its heavy steps', () => {
  const pre = between(dunk, 'async function preloadContestSet(ctx: ModeContext)', '\n  /** RUNUP-STALL-3: resolves on the scene');
  it('a frame after his body, after the dressing, after the onlookers, before and after the particles', () => {
    const order = ['await bringRival(ctx);', 'await frame();', 'await dunkVenue?.mountDressing();', 'await frame();', 'await Onlookers.settled(ctx.scene);', 'await frame();', 'await prespawnFinalists(ctx);', 'await frame();', 'for (const kind of PRELOAD_BURSTS) EffectsKit.burst(', 'await frame();', 'const pairs = await warmSceneShaders(ctx.scene);'];
    let at = -1;
    for (const s of order) { const i = pre.indexOf(s, at + 1); expect(i, s).toBeGreaterThan(at); at = i; }
    expect(pre).toContain('const frame = (): Promise<void> => nextFrameOf(ctx);');
  });
  it('each hidden finalist waits a frame before it is set up (one body a frame)', () => {
    const fin = between(dunk, 'async function prespawnFinalists(ctx: ModeContext)', '\n  /** The hidden finalist');
    expect(fin.indexOf('await nextFrameOf(ctx);')).toBeLessThan(fin.indexOf('await spawnRivalBody(ctx, rivalById(id));'));
    const nf = between(dunk, 'function nextFrameOf(ctx: ModeContext): Promise<void> {', '\n  }');
    expect(nf).toContain('ctx.scene.onBeforeRenderObservable.addOnce(() => r())');
    expect(nf).toContain('if (ctx.scene.isDisposed) r();');
  });
});

describe('RUNUP-STALL-3 (2): the getting-ready card', () => {
  const pre = between(dunk, 'async function preloadContestSet(ctx: ModeContext)', '\n  /** RUNUP-STALL-3: resolves on the scene');
  it('the preload drives hud.preloadReady from 0 to 1 and clears it when the hold lifts', () => {
    expect(pre).toContain('progress(0);');
    expect(pre).toContain('progress(1);');
    expect(pre).toContain('ctx.setHud({ preloadReady: Math.round(Math.max(0, Math.min(1, f)) * 100) / 100 });');
    expect(pre.indexOf("ctx.setHud({ preloadReady: null });")).toBeGreaterThan(pre.indexOf('finally { preloadHold = false; }'));
    expect(dunk.match(/preloadReady/g)!.length).toBe(2);   // only the preload writes it (knob off: never)
  });
  it('the card says what is happening, shows the bar and the percent, and pulses (not for reduced motion)', () => {
    const h = renderToStaticMarkup(createElement(DunkPreloadCard, { value: 0.42 }));
    expect(h).toMatch(/Getting the contest ready/i);
    expect(h).toContain('42%');
    expect(h).toContain('role="status"');
    expect(h).toContain('data-fel-preload="42"');
    expect(h).toMatch(/animate-pulse[^"]*motion-reduce:animate-none/);
    expect(renderToStaticMarkup(createElement(DunkPreloadCard, { value: 3 }))).toContain('100%');
  });
  it('the dunk host shows it only while hud.preloadReady is a number, in play', () => {
    const host = read('components/games/dunk-babylon.tsx');
    expect(host).toContain("{typeof hud.preloadReady === 'number' && phase === 'playing' && <DunkPreloadCard value={hud.preloadReady} />}");
    const card = read('components/games/dunk-preload-card.tsx');
    expect(card).not.toMatch(/text-\[(9|10|11)px\]|text-xs|#[0-9a-fA-F]{3,6}\b/);   // the TV HUD's floor and palette
  });
});
