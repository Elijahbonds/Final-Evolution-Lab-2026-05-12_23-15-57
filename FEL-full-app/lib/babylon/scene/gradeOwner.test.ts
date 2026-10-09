// ONE OWNER FOR THE GRADE (visual-foundation A9.3, 2026-10-06). The audit read this bug off the code; this file measures
// it on a real (Null) scene first, then pins the fix: the light rig owns scene.imageProcessingConfiguration, a spec
// venue stands down, and the harness's resting grade is the rig's, taken after load().
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./EnvironmentIBL', () => ({ mountEnvironmentIBL: () => () => {} }));   // a float cube map NullEngine cannot build

import fs from 'node:fs';
import path from 'node:path';
import { Color3, NullEngine, Scene } from '@babylonjs/core';
import { mountLightRig } from './LightRig';
import { applyVenueGrade } from '../nexus/NexusWebScene';
import { MOODS } from './moods';

const VENUE = { exposure: 1.15, contrast: 1.35, vignette: 0.35 };   // venueSpecs dusk(): what every spec venue wrote
const FOG = Color3.FromHexString('#8a5a68');
const scene = () => new Scene(new NullEngine());
afterEach(() => vi.unstubAllGlobals());

describe('the bug, measured (?look=legacy reproduces the pre-pass harness)', () => {
  it('a spec venue built after the rig overwrote the MOOD grade: the pipeline reads the same configuration', () => {
    vi.stubGlobal('window', { location: { search: '?look=legacy' } });
    const s = scene();
    const rig = mountLightRig(s, 'dojoWarm', 'desktop');
    expect(rig.pipeline.imageProcessing.contrast).toBeCloseTo(MOODS.dojoWarm.contrast);
    expect(applyVenueGrade(s, VENUE, FOG)).toBe(true);
    // the venue's numbers, not the mood's, are what the pipeline now renders with
    expect(rig.pipeline.imageProcessing.exposure).toBeCloseTo(1.15);
    expect(rig.pipeline.imageProcessing.contrast).toBeCloseTo(1.35);
    expect(rig.pipeline.imageProcessing.vignetteWeight).toBeCloseTo(1.4);
  });
});

describe('the fix', () => {
  it('the rig marks the scene and a venue no longer writes the grade', () => {
    const s = scene();
    const rig = mountLightRig(s, 'dojoWarm', 'desktop');
    expect(applyVenueGrade(s, VENUE, FOG)).toBe(false);
    expect(rig.pipeline.imageProcessing.exposure).toBeCloseTo(MOODS.dojoWarm.exposure);
    expect(rig.pipeline.imageProcessing.contrast).toBeCloseTo(MOODS.dojoWarm.contrast);
    expect(rig.pipeline.imageProcessing.vignetteWeight).toBeCloseTo(MOODS.dojoWarm.vignetteWeight);
  });
  it('a scene with no rig (a standalone venue page) still gets the venue grade', () => {
    const s = scene();
    expect(applyVenueGrade(s, VENUE, FOG)).toBe(true);
    expect(s.imageProcessingConfiguration.contrast).toBeCloseTo(1.35);
  });
  it('disposing the rig hands the grade back', () => {
    const s = scene();
    mountLightRig(s, 'dojoWarm', 'desktop').dispose();
    expect(applyVenueGrade(s, VENUE, FOG)).toBe(true);
  });
  it('a load-time grade is adopted as the rest, and the flash beat decays back to it — not to the raw mood', () => {
    vi.stubGlobal('window', { location: { search: '' }, matchMedia: () => ({ matches: false }), localStorage: { getItem: () => null } });
    const s = scene();
    const rig = mountLightRig(s, 'nightGame', 'mobile');
    rig.pipeline.imageProcessing.exposure *= 0.97;   // what WeatherFx's dusk writes during load()
    rig.adoptRest();
    const rest = rig.rest.exposure;
    expect(rest).toBeCloseTo(MOODS.nightGame.exposure * 0.97);
    rig.flashBeat();
    expect(rig.pipeline.imageProcessing.exposure).toBeGreaterThan(rest * 1.3);
    for (let i = 0; i < 200; i++) s.onBeforeRenderObservable.notifyObservers(s);
    expect(rig.pipeline.imageProcessing.exposure).toBeCloseTo(rest, 3);
  });
  it('the harness composes over the rig\'s rest (a live reference) and adopts it after load()', () => {
    const h = fs.readFileSync(path.resolve(__dirname, '../core/ModeHarness.ts'), 'utf8');
    expect(h).toContain('const restGrade: Grade = lights.rest;');
    expect(h).toMatch(/liftBlackMaterials\(scene\);\s+\/\/[^\n]*\n\s+lights\.adoptRest\(\);/);
  });
});

describe('per-mood colour grading (ColorCurves)', () => {
  it('every tier mounts the mood\'s curves on the pipeline', () => {
    for (const tier of ['mobile', 'desktop', 'high'] as const) {
      const rig = mountLightRig(scene(), 'dojoWarm', tier);
      const ip = rig.pipeline.imageProcessing;
      expect(ip.colorCurvesEnabled, tier).toBe(true);
      expect(ip.colorCurves?.highlightsHue).toBe(MOODS.dojoWarm.curves.highlightsHue);
      expect(ip.colorCurves?.shadowsDensity).toBe(MOODS.dojoWarm.curves.shadowsDensity);
    }
  });
  it('every mood has a gentle grade: densities and saturations inside ±35, hues in 0..360', () => {
    for (const [k, m] of Object.entries(MOODS)) {
      const c = m.curves;
      for (const v of [c.globalSat, c.highlightsDensity, c.highlightsSat, c.shadowsDensity, c.shadowsSat]) expect(Math.abs(v), k).toBeLessThanOrEqual(35);
      for (const h of [c.highlightsHue, c.shadowsHue]) expect(h >= 0 && h < 360, k).toBe(true);
    }
  });
  it('?look=legacy mounts no curves', () => {
    vi.stubGlobal('window', { location: { search: '?look=legacy' } });
    expect(mountLightRig(scene(), 'dojoWarm', 'desktop').pipeline.imageProcessing.colorCurvesEnabled).toBe(false);
  });
});
