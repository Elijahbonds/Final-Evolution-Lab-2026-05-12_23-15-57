// shaderPrewarm: a phone compiles its shaders during the load; the load watchdog and READY never wait on it past its cap.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FreeCamera, MeshBuilder, NullEngine, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { PREWARM_CAP_MS, PREWARM_FRAMES, prewarmScene, prewarmWanted } from './shaderPrewarm';

/** A clock the test drives: wait() advances it, so a "never ready" scene runs out its cap without real time. */
function fake(readyAfterPolls: number | null) {
  let t = 0, asked = 0;
  const scene = { isDisposed: false, isReady: () => { asked++; return readyAfterPolls !== null && asked >= readyAfterPolls; } };
  return { scene, asked: () => asked, deps: { now: () => t, wait: async (ms: number) => { t += ms; } } };
}

describe('which tiers pre-warm', () => {
  it('the phone does; desktop and high keep their first-use compiles', () => {
    expect(prewarmWanted('mobile')).toBe(true);
    expect(prewarmWanted('desktop')).toBe(false);
    expect(prewarmWanted('high')).toBe(false);
    expect(prewarmWanted('')).toBe(false);
  });
});

describe('prewarmScene', () => {
  it('asks until the scene is ready, then returns at once', async () => {
    const f = fake(4);
    const r = await prewarmScene(f.scene as never, f.deps);
    expect(r).toMatchObject({ ready: true, timedOut: false, polls: 4 });
    expect(r.ms).toBe(3 * 40);
    expect(r.readyMs).toBe(3 * 40);                            // no frames: the first ready is the end
  });

  it('a scene that is ready the first time costs one question', async () => {
    const f = fake(1);
    expect(await prewarmScene(f.scene as never, f.deps)).toMatchObject({ ready: true, polls: 1, ms: 0 });
  });

  it('a compile that never finishes is let go at the cap: the load goes on to READY', async () => {
    const f = fake(null);
    const r = await prewarmScene(f.scene as never, { ...f.deps, capMs: 1000 });
    expect(r.ready).toBe(false);
    expect(r.timedOut).toBe(true);
    expect(r.ms).toBeGreaterThanOrEqual(1000);
    expect(r.ms).toBeLessThan(1000 + 40 + 1);
  });

  it('once ready it draws the warm frames behind the splash, then asks the scene again', async () => {
    const f = fake(1);
    let drawn = 0;
    const r = await prewarmScene(f.scene as never, { ...f.deps, renderFrame: () => { drawn++; } });
    expect(drawn).toBe(PREWARM_FRAMES);
    expect(r).toMatchObject({ ready: true, frames: PREWARM_FRAMES });
    expect(f.asked()).toBe(2);                                  // before the frames and after them
    expect(r.readyMs).toBe(0);                                  // ready at once; the frames took the rest
    expect(r.ms).toBeGreaterThan(r.readyMs);
  });

  it('draws no frame for a scene that is not ready, and none past the cap', async () => {
    const f = fake(null);
    let drawn = 0;
    const r = await prewarmScene(f.scene as never, { ...f.deps, capMs: 200, renderFrame: () => { drawn++; } });
    expect(drawn).toBe(0);
    expect(r).toMatchObject({ ready: false, timedOut: true, frames: 0, readyMs: -1 });
    const g = fake(1);
    drawn = 0;
    const r2 = await prewarmScene(g.scene as never, { ...g.deps, capMs: 50, pollMs: 40, renderFrame: () => { drawn++; } });
    expect(drawn).toBeLessThan(PREWARM_FRAMES);                 // the cap stops the frames too
    expect(r2.ms).toBeLessThan(50 + 40 + 1);
  });

  it('capHit: a scene that turns ready only after the cap draws no warm frames, and says the cap was hit (timedOut alone did not)', async () => {
    // ship-ready (2026-10-17): on the phone rig, skateboard turned ready at 8.56 s against the 8 s cap, drew 0 of 3 frames,
    // and reported timedOut: false, so the harness sent no diag. capHit is what the harness reports now.
    const late = fake(6);                                        // ready at the 6th question (t = 200 ms), the cap at 180 ms
    let drawn = 0;
    const r = await prewarmScene(late.scene as never, { ...late.deps, capMs: 180, renderFrame: () => { drawn++; } });
    expect(drawn).toBe(0);
    expect(r).toMatchObject({ ready: true, timedOut: false, capHit: true, frames: 0 });
    const cutMid = fake(1);                                      // ready at once, the cap lands between the frames
    const r2 = await prewarmScene(cutMid.scene as never, { ...cutMid.deps, capMs: 50, pollMs: 40, renderFrame: () => {} });
    expect(r2.frames).toBeGreaterThan(0);
    expect(r2.frames).toBeLessThan(PREWARM_FRAMES);
    expect(r2).toMatchObject({ ready: true, timedOut: false, capHit: true });
    const inTime = fake(1);                                      // every frame drawn inside the cap: not a cap hit
    expect(await prewarmScene(inTime.scene as never, { ...inTime.deps, renderFrame: () => {} })).toMatchObject({ ready: true, frames: PREWARM_FRAMES, capHit: false });
    const never = fake(null);                                    // never ready: timed out, and so a cap hit
    expect(await prewarmScene(never.scene as never, { ...never.deps, capMs: 200 })).toMatchObject({ timedOut: true, capHit: true });
  });

  it('waits for the engine\'s programs too (the post-process passes the scene does not know about)', async () => {
    const f = fake(1);
    let engineAsks = 0;
    const r = await prewarmScene(f.scene as never, { ...f.deps, renderFrame: () => {}, effectsReady: () => ++engineAsks >= 5 });
    expect(r.ready).toBe(true);
    expect(engineAsks).toBeGreaterThanOrEqual(5);                // the scene was ready at once; the engine's programs were not
    expect(r.polls).toBeGreaterThanOrEqual(4);
    const never = fake(1);
    const capped = await prewarmScene(never.scene as never, { ...never.deps, capMs: 300, renderFrame: () => {}, effectsReady: () => false });
    expect(capped).toMatchObject({ ready: false, timedOut: true });   // a program that never lands is let go at the cap
  });

  it('a frame that throws ends the frames, not the load', async () => {
    const f = fake(1);
    const r = await prewarmScene(f.scene as never, { ...f.deps, renderFrame: () => { throw new Error('lost context'); } });
    expect(r.ready).toBe(true);
    expect(r.frames).toBe(0);
  });

  it('the default cap is well under a minute and over a second (a phone compiles a mode in seconds)', () => {
    expect(PREWARM_CAP_MS).toBeGreaterThan(1000);
    expect(PREWARM_CAP_MS).toBeLessThanOrEqual(10_000);
  });

  it('a disposed scene stops it; a throwing material is not ready, not a crash', async () => {
    const dead = { isDisposed: true, isReady: () => true };
    expect(await prewarmScene(dead as never, { now: () => 0, wait: async () => {} })).toMatchObject({ ready: false, timedOut: false, polls: 0 });
    let n = 0;
    const throws = { isDisposed: false, isReady: () => { if (n++ < 2) throw new Error('boom'); return true; } };
    let t = 0;
    expect((await prewarmScene(throws as never, { now: () => t, wait: async (ms) => { t += ms; } })).ready).toBe(true);
  });

  it('on a real scene: the first question starts the compile of a material nothing has drawn, and the answer turns ready', async () => {
    const scene = new Scene(new NullEngine());
    new FreeCamera('c', new Vector3(0, 2, -8), scene);
    const box = MeshBuilder.CreateBox('b', { size: 1 }, scene);
    const mat = new StandardMaterial('m', scene);
    box.material = mat;
    const r = await prewarmScene(scene, { capMs: 5000 });
    expect(r.ready).toBe(true);
    expect(mat.isReady(box)).toBe(true);              // nothing rendered, and the material is prepared
  });
});

describe('the harness runs it where it cannot trip the watchdog', () => {
  const src = readFileSync(join(__dirname, 'ModeHarness.ts'), 'utf8');
  it('after the load watchdog is cleared, before READY, on the phone tier only', () => {
    const clear = src.indexOf('clearTimeout(watchdog);\n      if (timedOut) return false;');
    const warm = src.indexOf('await prewarmScene(scene');
    const ready = src.indexOf("setPhase('ready');", warm);
    expect(clear).toBeGreaterThan(0);
    expect(warm).toBeGreaterThan(clear);
    expect(ready).toBeGreaterThan(warm);
    expect(src.slice(src.lastIndexOf('if (', warm), warm)).toContain('prewarmWanted(tier)');
    expect(src).toContain('renderFrame: () => { engine.beginFrame(); scene.render(); engine.endFrame(); }, effectsReady: () => engine.areAllEffectsReady()');
  });
  it('reports every cap hit to the diag, the frames the cap cut included (capHit, not timedOut)', () => {
    const warm = src.indexOf('await prewarmScene(scene');
    const ready = src.indexOf("setPhase('ready');", warm);
    const block = src.slice(warm, ready);
    expect(block).toContain("if (warm.capHit) reportDiag('load', `shader pre-warm hit its cap");
    expect(block).not.toContain('if (warm.timedOut)');
  });
  it('the watchdog is still 20 s (it is not raised: the pre-warm runs after it)', () => {
    expect(src).toMatch(/const LOAD_WATCHDOG_MS = 20_000;/);
  });
  it('a load the watchdog ends is reported to the diag before the error screen, like a load that throws', () => {
    // test changed (2026-10-20): FIRST-DUNK-BUDGET (#316) re-armed the watchdog as a stall clock that looks again until nothing
    // has arrived for 20 s (`let watchdog = setTimeout(function look() {`); the anchor follows it. The assertion is unchanged.
    const arm = src.indexOf('let watchdog = setTimeout(function look() {');
    const fire = src.indexOf("setPhase('error', 'Load timed out", arm);
    expect(arm).toBeGreaterThan(0);
    expect(src.slice(arm, fire)).toContain("reportDiag('load', `${def.modeId} load timed out after ${LOAD_WATCHDOG_MS} ms`);");
  });
  it('development still warms every material after READY', () => {
    expect(src).toContain('if (DEV) void perf.warmAll();');
  });
});
