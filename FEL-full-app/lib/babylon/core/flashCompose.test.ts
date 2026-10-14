// flashBeat vs the harness repaint (w3-atmos). While a mode reports a speed vignette (or an impact pulse runs) the harness
// writes the pipeline's exposure every frame. The rig used to write its flash there too, so the harness's rest exposure won on
// the very next paint and a flash on a racing mode never reached the screen. The rig now keeps the flash LEVEL and the
// harness composes it (ImpactFrame.stepFrameGrade). This file measures the bug on the old path first, then pins the fix with
// the REAL rig (NullEngine) driven the way the harness drives it.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../scene/EnvironmentIBL', () => ({ mountEnvironmentIBL: () => () => {} }));   // a float cube map NullEngine cannot build

import fs from 'node:fs';
import path from 'node:path';
import { NullEngine, Scene } from '@babylonjs/core';
import { mountLightRig } from '../scene/LightRig';
import {
  FLASH_GAIN, FRAME_GRADE_IDLE, SPEED_VIGNETTE_GAIN, composeFrameGrade, impactGrade, kickImpactFrame, speedVignetteLevel,
  stepFlashLevel, stepFrameGrade, type FrameGradeState, type Grade,
} from './ImpactFrame';

const device = (reduced: boolean) => vi.stubGlobal('window', {
  location: { search: '' }, matchMedia: (q: string) => ({ matches: reduced && /reduce/.test(q) }), localStorage: { getItem: () => null },
});
afterEach(() => vi.unstubAllGlobals());

const BASE: Grade = { vignette: 0.4, exposure: 1.2 };

describe('composeFrameGrade with a flash', () => {
  it('no flash is exactly the old grade (every existing caller)', () => {
    expect(composeFrameGrade(BASE, 0, 0)).toEqual(BASE);
    expect(composeFrameGrade(BASE, 0.6, 0.4, 0)).toEqual(composeFrameGrade(BASE, 0.6, 0.4));
  });
  it('a full flash is the 1.35x the rig used to write, and leaves the vignette alone', () => {
    const g = composeFrameGrade(BASE, 0, 0, 1);
    expect(g.exposure).toBeCloseTo(BASE.exposure * 1.35, 6);
    expect(g.vignette).toBe(BASE.vignette);
  });
  it('a flash rides over the speed vignette: the edges close AND the exposure lifts', () => {
    const g = composeFrameGrade(BASE, 0, 1, 1);
    expect(g.vignette).toBeCloseTo(BASE.vignette * SPEED_VIGNETTE_GAIN, 6);
    expect(g.exposure).toBeCloseTo(BASE.exposure * FLASH_GAIN, 6);
  });
  it('an impact inside a flash dips the flashed frame, it does not cancel it', () => {
    const hit = impactGrade(1, BASE).exposure;
    expect(composeFrameGrade(BASE, 1, 0, 1).exposure).toBeCloseTo(hit * FLASH_GAIN, 6);
    expect(composeFrameGrade(BASE, 1, 0, 1).exposure).toBeGreaterThan(hit);
  });
  it('a lying level (NaN, over 1) cannot break the frame', () => {
    expect(composeFrameGrade(BASE, 0, 0, NaN)).toEqual(BASE);
    expect(composeFrameGrade(BASE, 0, 0, 7).exposure).toBeCloseTo(BASE.exposure * FLASH_GAIN, 6);
  });
});

describe('stepFlashLevel - the old decay at 60 fps, the same length on every screen', () => {
  it('60 fps: the exposure above rest falls by 0.85 a frame, as `+= (base - e) * 0.15` did', () => {
    let l = 1;
    for (let i = 0; i < 4; i++) l = stepFlashLevel(l, 1000 / 60, 1.2);
    expect(l).toBeCloseTo(0.85 ** 4, 6);
  });
  it('144 Hz decays by the same wall-clock time as 60 Hz', () => {
    let a = 1, b = 1;
    for (let i = 0; i < 12; i++) a = stepFlashLevel(a, 1000 / 60, 1.2);
    for (let i = 0; i < 29; i++) b = stepFlashLevel(b, 1000 / 144.9, 1.2);   // 200 ms either way
    expect(b).toBeCloseTo(a, 2);
  });
  it('ends at exactly 0 once it adds under 0.01 exposure (the old cut-off), and never goes NaN', () => {
    let l = 1, n = 0;
    while (l > 0 && n < 500) { l = stepFlashLevel(l, 1000 / 60, 1.2); n++; }
    expect(l).toBe(0);
    expect(n).toBeGreaterThan(10);
    expect(n).toBeLessThan(40);
    expect(stepFlashLevel(NaN, 16, 1.2)).toBe(0);
    expect(stepFlashLevel(0.5, NaN, 1.2)).toBeGreaterThan(0);
  });
});

/** The harness's tick for the grade, against a real rig: what ModeHarness does after def.update and before scene.render. */
function harnessTick(
  scene: Scene, rig: ReturnType<typeof mountLightRig>, st: FrameGradeState, speed01: number,
): FrameGradeState {
  const dt = 1 / 60;
  const r = stepFrameGrade(st, rig.rest, dt, speedVignetteLevel(speed01), rig.flash01);
  if (r.write) { rig.pipeline.imageProcessing.vignetteWeight = r.write.vignette; rig.pipeline.imageProcessing.exposure = r.write.exposure; }
  scene.onBeforeRenderObservable.notifyObservers(scene);   // scene.render()'s before-render
  return r.state;
}

describe('the real rig under a harness that repaints every frame (a racing mode at 100% speed)', () => {
  it('THE BUG: a rig that paints its own flash is repainted away on the very next harness tick', () => {
    device(false);
    const scene = new Scene(new NullEngine());
    const rig = mountLightRig(scene, 'dojoWarm', 'desktop');   // NOT composeFlashInHarness(): the pre-fix wiring
    const rest = rig.rest.exposure;
    rig.flashBeat();
    expect(rig.pipeline.imageProcessing.exposure).toBeCloseTo(rest * 1.35, 5);   // it did set it...
    const st = harnessTick(scene, rig, FRAME_GRADE_IDLE, 1);                    // ...then the harness repainted its own grade
    const r = stepFrameGrade(FRAME_GRADE_IDLE, rig.rest, 1 / 60, 1, 0);          // the old call: no flash level in it
    expect(r.write?.exposure).toBeCloseTo(rest, 6);                              // the old repaint is the rest exposure
    expect(st.painted).toBe(true);
  });

  it('THE FIX: the flash shows through the speed vignette on the frame it fires, and decays back to the rest', () => {
    device(false);
    const scene = new Scene(new NullEngine());
    const rig = mountLightRig(scene, 'dojoWarm', 'desktop');
    rig.composeFlashInHarness();
    const rest = rig.rest.exposure;
    let st = harnessTick(scene, rig, FRAME_GRADE_IDLE, 1);   // a race at full speed, no flash yet
    expect(rig.pipeline.imageProcessing.exposure).toBeCloseTo(rest, 6);
    const vig = rig.pipeline.imageProcessing.vignetteWeight;
    expect(vig).toBeCloseTo(rig.rest.vignette * SPEED_VIGNETTE_GAIN, 6);

    rig.flashBeat();                                          // a momentum tier fires during update()
    st = harnessTick(scene, rig, st, 1);                      // the harness's paint, then the render
    expect(rig.pipeline.imageProcessing.exposure).toBeGreaterThan(rest * 1.3);   // the screen shows the flash
    expect(rig.pipeline.imageProcessing.vignetteWeight).toBeCloseTo(vig, 6);     // and the speed vignette is still on

    const seen: number[] = [];
    for (let i = 0; i < 80; i++) { st = harnessTick(scene, rig, st, 1); seen.push(rig.pipeline.imageProcessing.exposure); }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeLessThanOrEqual(seen[i - 1] + 1e-9);   // monotone decay, no re-fight
    expect(rig.pipeline.imageProcessing.exposure).toBeCloseTo(rest, 6);
    expect(rig.flash01).toBe(0);
  });

  it('an impact pulse running does not eat the flash either (the other repaint)', () => {
    device(false);
    const scene = new Scene(new NullEngine());
    const rig = mountLightRig(scene, 'dojoWarm', 'desktop');
    rig.composeFlashInHarness();
    const rest = rig.rest.exposure;
    rig.flashBeat();
    let st: FrameGradeState = { ...FRAME_GRADE_IDLE, frame: kickImpactFrame(FRAME_GRADE_IDLE.frame, 0.4) };
    st = harnessTick(scene, rig, st, 0);
    expect(rig.pipeline.imageProcessing.exposure).toBeGreaterThan(rest);          // flash outweighs a 0.4 hit's dip
  });

  it('a flash on a mode with NO speed vignette and no impact is painted too (the harness is the only writer)', () => {
    device(false);
    const scene = new Scene(new NullEngine());
    const rig = mountLightRig(scene, 'dojoWarm', 'desktop');
    rig.composeFlashInHarness();
    const rest = rig.rest.exposure;
    rig.flashBeat();
    let st = harnessTick(scene, rig, FRAME_GRADE_IDLE, 0);
    expect(rig.pipeline.imageProcessing.exposure).toBeGreaterThan(rest * 1.3);
    for (let i = 0; i < 80; i++) st = harnessTick(scene, rig, st, 0);
    expect(rig.pipeline.imageProcessing.exposure).toBeCloseTo(rest, 6);   // and the return to rest is written once, then it stops
    expect(st.painted).toBe(false);
  });

  it('an idle frame with no flash, no impact and no speed writes nothing', () => {
    expect(stepFrameGrade(FRAME_GRADE_IDLE, BASE, 1 / 60, 0, 0).write).toBeNull();
  });

  it('reduced motion: no flash level, so no exposure change on any path', () => {
    device(true);
    const scene = new Scene(new NullEngine());
    const rig = mountLightRig(scene, 'dojoWarm', 'desktop');
    rig.composeFlashInHarness();
    const rest = rig.rest.exposure;
    rig.flashBeat();
    expect(rig.flash01).toBe(0);
    const st = harnessTick(scene, rig, FRAME_GRADE_IDLE, 0);
    expect(st).toEqual(FRAME_GRADE_IDLE);
    expect(rig.pipeline.imageProcessing.exposure).toBe(rest);
  });

  it('without a harness the rig still paints and ends its own flash (WeatherFx on a bare scene)', async () => {
    device(false);
    const scene = new Scene(new NullEngine());
    const rig = mountLightRig(scene, 'nightGame', 'mobile');
    const rest = rig.rest.exposure;
    const before = scene.onBeforeRenderObservable.observers.length;
    rig.flashBeat();
    expect(scene.onBeforeRenderObservable.observers.length).toBe(before + 1);
    expect(rig.pipeline.imageProcessing.exposure).toBeGreaterThan(rest * 1.3);
    for (let i = 0; i < 100; i++) scene.onBeforeRenderObservable.notifyObservers(scene);
    expect(rig.pipeline.imageProcessing.exposure).toBeCloseTo(rest, 6);
    await new Promise((r) => setTimeout(r, 0));   // Babylon unregisters an observer removed mid-notify on the next tick
    expect(scene.onBeforeRenderObservable.observers.length).toBe(before);   // the observer removed itself
  });
});

describe('the harness is wired to it', () => {
  const h = fs.readFileSync(path.resolve(__dirname, 'ModeHarness.ts'), 'utf8');
  it('takes over the flash and reads its level into the one grade write', () => {
    expect(h).toContain('lights.composeFlashInHarness();');
    expect(h).toContain('stepFrameGrade(gradeState, restGrade, dt, speedLevel, lights.flash01)');
  });
  it('the impact kick lands in the same state', () => {
    expect(h).toMatch(/gradeState = \{ \.\.\.gradeState, frame: kickImpactFrame\(gradeState\.frame, s\) \}/);
  });
});
