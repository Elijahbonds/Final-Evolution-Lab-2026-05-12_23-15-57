// The shared look foundation on a real (Null) Babylon scene — visual-foundation, 2026-10-06. Each block pins one A9 item
// of docs/VISUAL-PASS-PLAN.md the way every mode inherits it: through mountLightRig.
// (Outdoor moods on desktop/high mount a CascadedShadowGenerator, which NullEngine refuses — so these use indoor moods.)
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./EnvironmentIBL', () => ({ mountEnvironmentIBL: () => () => {} }));   // a float cube map NullEngine cannot build

import { NullEngine, Scene } from '@babylonjs/core';
import { mountLightRig } from './LightRig';

const scene = () => new Scene(new NullEngine());
afterEach(() => vi.unstubAllGlobals());

describe('A9.2 real anti-aliasing', () => {
  it('desktop and high mount MSAA x4 and drop FXAA; mobile keeps FXAA and no MSAA', () => {
    for (const tier of ['desktop', 'high'] as const) {
      const rig = mountLightRig(scene(), 'dojoWarm', tier);
      expect(rig.pipeline.samples, tier).toBe(4);
      expect(rig.pipeline.fxaaEnabled, tier).toBe(false);
    }
    const m = mountLightRig(scene(), 'goldenHour', 'mobile');
    expect(m.pipeline.samples).toBe(1);
    expect(m.pipeline.fxaaEnabled).toBe(true);
  });
  it('?look=legacy puts FXAA-only back on every tier', () => {
    vi.stubGlobal('window', { location: { search: '?look=legacy' } });
    const rig = mountLightRig(scene(), 'dojoWarm', 'high');
    expect(rig.pipeline.samples).toBe(1);
    expect(rig.pipeline.fxaaEnabled).toBe(true);
  });
});
