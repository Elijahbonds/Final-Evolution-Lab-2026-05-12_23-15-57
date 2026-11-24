import { describe, expect, it, vi } from 'vitest';
import { mountVenueIBL, VQ, IBL_ENV } from './venueQualityV1';
import type { Scene } from '@babylonjs/core';

// look pass B2 (look-venues, 2026-11-24): venue.iblEnvV1 now reaches the light rig (LightRig.mountLightRig). Off — the default, and
// what every player gets — it must run exactly the procedural environment and nothing else.
describe('venue.iblEnvV1 (the prefiltered sky light)', () => {
  it('ships off: with the panel closed and no ?vq=ibl the knob reads off', () => {
    expect(VQ.ibl()).toBe(false);
  });
  it('off: the procedural cube is mounted once and its own disposer is returned; no prefiltered file is fetched', () => {
    const disposeProc = vi.fn();
    const fallback = vi.fn(() => disposeProc);
    const scene = {} as Scene;
    const dispose = mountVenueIBL(scene, 'goldenHour', fallback);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(dispose).toBe(disposeProc);
    expect(scene.environmentTexture).toBeUndefined();
  });
  it('the light rig mounts the environment through it (the knob is no longer dead)', async () => {
    const src = (await import('node:fs')).readFileSync('lib/babylon/scene/LightRig.ts', 'utf8');
    expect(src).toMatch(/mountVenueIBL\(scene, mood, \(\) => mountEnvironmentIBL\(scene, mood\)\)/);
  });
  it('every mood file it would fetch is a public/env path (none are in the repo yet: the A/B waits on them)', () => {
    for (const e of Object.values(IBL_ENV)) expect(e!.url).toMatch(/^\/env\/[\w-]+\.env$/);
  });
});
