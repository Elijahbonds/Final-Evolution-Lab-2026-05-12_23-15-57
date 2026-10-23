// S1 HITCH-KILLER (ALL-MODES-TO-75 §1, 2026-10-22): the frame-time probe beside PerfGuard, and the counters a hitch-free mode keeps
// at 0 after its intro. The probe reads a synthetic frame series here (TN-1 / CC75-1's device numbers come from a real run with
// window.__FEL_HITCH__ published, never from this file).
import { afterEach, describe, expect, it } from 'vitest';
import { Color3, FreeCamera, MeshBuilder, NullEngine, PBRMaterial, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { FrameTimeProbe, countHitch, frameStats, hitchCounts, markIntroDone, mountHitchProbe, prewarmMeshes, watchCompiles } from './hitchProbe';

let engine: NullEngine | null = null;
afterEach(() => { engine?.dispose(); engine = null; });
function scene(): Scene {
  engine = new NullEngine();
  const s = new Scene(engine);
  new FreeCamera('cam', new Vector3(0, 2, -6), s).setTarget(Vector3.Zero());
  return s;
}

describe('frameStats: the worst frame and the p5 fps of a series', () => {
  it('a steady 60 fps run with one 120 ms hitch: worst 120 ms, p5 still 60 fps (one frame in a thousand is not 5 %)', () => {
    const series = Array.from({ length: 1000 }, () => 1000 / 60);
    series[500] = 120;
    const s = frameStats(series);
    expect(s.frames).toBe(1000);
    expect(s.worstMs).toBe(120);
    expect(s.p5Fps).toBeCloseTo(60, 6);
  });
  it('a run whose slowest tenth sits at 40 ms: p5 25 fps; non-frames (0, negative, NaN, Infinity) are not counted', () => {
    const series = [...Array.from({ length: 90 }, () => 16), ...Array.from({ length: 10 }, () => 40), 0, -3, NaN, Infinity];
    const s = frameStats(series);
    expect(s.frames).toBe(100);
    expect(s.worstMs).toBe(40);
    expect(s.p5Fps).toBeCloseTo(25, 6);
  });
  it('empty: zeros', () => {
    expect(frameStats([])).toEqual({ frames: 0, worstMs: 0, p5Fps: 0 });
  });
});

describe('FrameTimeProbe: the live ring', () => {
  it('keeps the run\'s worst frame after it leaves the p5 window, and the p5 of the window only', () => {
    const p = new FrameTimeProbe(100);
    p.push(250);                                                   // a load hitch early in the run
    for (let i = 0; i < 200; i++) p.push(20);                       // then 50 fps
    const s = p.stats();
    expect(s.frames).toBe(201);
    expect(s.worstMs).toBe(250);
    expect(s.p5Fps).toBeCloseTo(50, 6);
    p.reset();
    expect(p.stats()).toEqual({ frames: 0, worstMs: 0, p5Fps: 0 });
  });
});

describe('the hitch counters', () => {
  it('builds and clones split at the end of the intro', () => {
    const s = scene();
    countHitch(s, 'build'); countHitch(s, 'clone'); countHitch(s, 'clone');
    markIntroDone(s);
    countHitch(s, 'build');
    expect(hitchCounts(s)).toEqual({ builds: 2, clones: 2, compiles: 0, introDone: true, afterIntro: { builds: 1, clones: 0, compiles: 0 } });
  });

  it('a compile is a NEW program: a second mesh in the same kind of material compiles nothing; a new kind does, and is counted after the intro', () => {
    const s = scene();
    const unwatch = watchCompiles(s);
    const a = MeshBuilder.CreateBox('a', {}, s); a.material = new StandardMaterial('am', s);
    s.render(); s.render();
    const first = hitchCounts(s).compiles;
    expect(first).toBeGreaterThan(0);
    markIntroDone(s);
    const b = MeshBuilder.CreateBox('b', {}, s); const bm = new StandardMaterial('bm', s); bm.diffuseColor = Color3.Red(); b.material = bm;
    s.render();
    expect(hitchCounts(s).afterIntro.compiles).toBe(0);          // the same program as a's
    const c = MeshBuilder.CreateBox('c', {}, s); c.material = new PBRMaterial('cm', s);
    s.render(); s.render();
    expect(hitchCounts(s).afterIntro.compiles).toBeGreaterThan(0);   // first use of PBR, in play: a hitch
    unwatch();
    expect(Object.prototype.hasOwnProperty.call(s.getEngine(), 'createEffect')).toBe(false);   // the engine is given back
  });

  it('prewarmMeshes compiles a HIDDEN mesh\'s program before it is ever drawn, so its first showing compiles nothing', async () => {
    const s = scene();
    watchCompiles(s);
    const shown = MeshBuilder.CreateBox('shown', {}, s); shown.material = new StandardMaterial('sm', s);
    const hidden = MeshBuilder.CreateBox('hidden', {}, s); hidden.material = new PBRMaterial('hm', s); hidden.setEnabled(false);
    expect(await prewarmMeshes(s, [shown, hidden])).toBe(true);
    s.render();
    markIntroDone(s);
    hidden.setEnabled(true);
    s.render(); s.render();
    expect(hitchCounts(s).afterIntro.compiles).toBe(0);
  });
});

describe('mountHitchProbe: the harness side', () => {
  it('times only live-play frames, marks the intro over on the first playing frame out of it, and reports both', () => {
    const s = scene();
    const h = mountHitchProbe({ scene: s });
    h.frame(false, false, 500);                                    // loading / ready: not play
    h.frame(true, true, 16);                                       // the broadcast intro: timed, intro not over
    expect(hitchCounts(s).introDone).toBe(false);
    h.frame(true, false, 33);
    expect(hitchCounts(s).introDone).toBe(true);
    const r = h.report();
    expect(r.frames).toBe(2);
    expect(r.worstMs).toBe(33);
    h.dispose();
  });
});
