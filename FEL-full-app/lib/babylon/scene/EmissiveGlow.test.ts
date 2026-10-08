// A9.5 (visual-foundation, 2026-10-06): the light fixtures glow, through an include list, on desktop and high only.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./EnvironmentIBL', () => ({ mountEnvironmentIBL: () => () => {} }));   // a float cube map NullEngine cannot build

import fs from 'node:fs';
import path from 'node:path';
import { Color3, MeshBuilder, NullEngine, PBRMaterial, Scene } from '@babylonjs/core';
import { GLOW_INTENSITY, glowCandidate, glowOptions, mountEmissiveGlow } from './EmissiveGlow';
import { mountLightRig } from './LightRig';
import { MOODS } from './moods';

afterEach(() => vi.unstubAllGlobals());
const settle = () => new Promise((r) => setTimeout(r, 5));   // Babylon announces new meshes on the next macrotask
function fixture(s: Scene, name: string, matName: string, emissive: number) {
  const m = MeshBuilder.CreateSphere(name, { diameter: 0.5 }, s);
  const mat = new PBRMaterial(matName, s);
  mat.emissiveColor = new Color3(emissive, emissive, emissive * 0.8);
  m.material = mat;
  return m;
}

describe('glowCandidate (the include rule)', () => {
  it('a named fixture that emits glows', () => {
    expect(glowCandidate('lhead', 'lampHead', 1.2, false)).toBe(true);
    expect(glowCandidate('flood_19_30', 'flood', 0.9, false)).toBe(true);
    expect(glowCandidate('bb_bulb_12', 'bb_bulb_m', 0.8, false)).toBe(true);
    expect(glowCandidate('arena_cage_rim', 'arena_cage_rim_m', 0.3, false)).toBe(true);
    expect(glowCandidate('aero_neon_strip', null, 0.5, false)).toBe(true);
    expect(glowCandidate('some_prop', 'lampHead', 0.6, false)).toBe(true);    // a fixture by its material
    expect(glowCandidate('led_wall', 'screen', 0, true)).toBe(true);          // an emissive texture counts
  });
  it('anything else does not — a bright banner, an unlit lamp, the court, a player', () => {
    expect(glowCandidate('banner', 'bannerMat', 0.35, true)).toBe(false);     // signage: a halo would smear the wordmark
    expect(glowCandidate('lhead', 'lampHead', 0.05, false)).toBe(false);      // a lamp that is off
    expect(glowCandidate('venue_ground', 'court', 0.06, false)).toBe(false);  // liftBlackMaterials' 6 % floor is not light
    expect(glowCandidate('hero_body', 'skin', 0.0, false)).toBe(false);
  });
  it('every mood has an intensity, strongest at night', () => {
    for (const m of Object.keys(MOODS)) expect(GLOW_INTENSITY[m as keyof typeof GLOW_INTENSITY], m).toBeGreaterThan(0);
    expect(GLOW_INTENSITY.nightGame).toBeGreaterThan(GLOW_INTENSITY.daylight);
  });
  it('the fixture names it matches are still the names the builders give (a rename would quietly kill the glow)', () => {
    const src = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
    expect(src('nexus/NexusWebScene.ts')).toContain("MeshBuilder.CreateSphere('lhead'");
    expect(src('nexus/NexusWebScene.ts')).toContain("emissive(scene, 'lampHead'");
    expect(src('visual/VenueKit.ts')).toContain('CreatePlane(`flood_${x}_${z}`');
  });
});

describe('the glow layer on a scene', () => {
  it('stays disabled until a fixture exists, then draws only the fixtures', async () => {
    const s = new Scene(new NullEngine());
    const g = mountEmissiveGlow(s, 'desktop', 'nightGame')!;
    MeshBuilder.CreateGround('venue_ground', { width: 20, height: 20 }, s);
    await settle();
    expect(g.layer.isEnabled).toBe(false);
    const lamp = fixture(s, 'lhead', 'lampHead', 1.4);
    fixture(s, 'banner', 'bannerMat', 0.35);
    await settle();
    expect(g.layer.isEnabled).toBe(true);
    expect(g.meshes).toEqual([lamp]);
    expect(g.layer.intensity).toBe(GLOW_INTENSITY.nightGame);
    lamp.dispose();
    expect(g.meshes.length).toBe(0);
    expect(g.layer.isEnabled).toBe(false);
    g.dispose();
  });
  it('the rig mounts it on desktop and high, never on mobile or under ?look=legacy', () => {
    expect(mountLightRig(new Scene(new NullEngine()), 'dojoWarm', 'desktop').glow).not.toBeNull();
    expect(mountLightRig(new Scene(new NullEngine()), 'dojoWarm', 'high').glow).not.toBeNull();
    expect(mountLightRig(new Scene(new NullEngine()), 'dojoWarm', 'mobile').glow).toBeNull();
    vi.stubGlobal('window', { location: { search: '?look=legacy' } });
    expect(mountLightRig(new Scene(new NullEngine()), 'dojoWarm', 'high').glow).toBeNull();
  });
  it('the high tier renders a bigger, multisampled halo than desktop', () => {
    expect(glowOptions('high').mainTextureRatio).toBeGreaterThan(glowOptions('desktop').mainTextureRatio);
    expect(glowOptions('high').mainTextureSamples).toBe(4);
  });
});
