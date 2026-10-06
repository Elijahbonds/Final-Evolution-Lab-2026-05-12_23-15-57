// A9.7 (visual-foundation, 2026-10-06): one capture of the real venue, reflected by the glossy materials, high tier only.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('./EnvironmentIBL', () => ({ mountEnvironmentIBL: () => () => {} }));   // a float cube map NullEngine cannot build

import { MeshBuilder, NullEngine, PBRMaterial, Scene, Skeleton, StandardMaterial, Vector3 } from '@babylonjs/core';
import { captureVenueReflection, probeCaptures, wantsVenueReflection, GLOSSY_ROUGHNESS } from './VenueReflection';
import { mountLightRig } from './LightRig';
import { tierRigSettings } from './QualityTier';

function pbr(s: Scene, name: string, roughness: number) { const m = new PBRMaterial(name, s); m.roughness = roughness; return m; }

describe('what the probe captures and who reflects it', () => {
  it('the scenery is captured; players, hidden meshes and effect quads are not', () => {
    const on = { isVisible: true, isEnabled: () => true };
    expect(probeCaptures({ ...on, name: 'venue_ground' })).toBe(true);
    expect(probeCaptures({ ...on, name: 'nexus_sky' })).toBe(true);
    expect(probeCaptures({ ...on, name: 'hero_body', skeleton: {} })).toBe(false);
    expect(probeCaptures({ ...on, name: 'hero_contact' })).toBe(false);
    expect(probeCaptures({ ...on, name: '__root__' })).toBe(false);
    expect(probeCaptures({ isVisible: false, isEnabled: () => true, name: 'venue_ground_under' })).toBe(false);
  });
  it('only glossy PBR without a reflection of its own takes the venue', () => {
    const s = new Scene(new NullEngine());
    expect(wantsVenueReflection(pbr(s, 'court', 0.3))).toBe(true);
    expect(wantsVenueReflection(pbr(s, 'court', GLOSSY_ROUGHNESS))).toBe(true);
    expect(wantsVenueReflection(pbr(s, 'cloth', 0.9))).toBe(false);
    const ocean = pbr(s, 'ocean', 0.1); ocean.reflectionTexture = ocean.albedoTexture ?? ({} as never);
    expect(wantsVenueReflection(ocean)).toBe(false);
    expect(wantsVenueReflection(new StandardMaterial('std', s) as never)).toBe(false);
    expect(wantsVenueReflection(null)).toBe(false);
  });
});

describe('the capture on a scene', () => {
  it('captures the scenery once, then points the glossy, unskinned materials at it — and dispose puts them back', () => {
    const s = new Scene(new NullEngine());
    const court = MeshBuilder.CreateGround('venue_ground', { width: 20, height: 20 }, s); court.material = pbr(s, 'court', 0.25);
    const wall = MeshBuilder.CreateBox('wall', { size: 2 }, s); wall.material = pbr(s, 'wall', 0.9);
    const hero = MeshBuilder.CreateBox('hero_body', { size: 1 }, s); hero.skeleton = new Skeleton('sk', 'sk', s); hero.material = pbr(s, 'shoe', 0.2);
    const h = captureVenueReflection(s, new Vector3(1, 0, 2))!;
    expect(h).not.toBeNull();
    expect(h.probe.position.y).toBeCloseTo(1.6);
    expect(h.probe.renderList).toContain(court);
    expect(h.probe.renderList).toContain(wall);
    expect(h.probe.renderList).not.toContain(hero);
    expect(h.probe.refreshRate).toBe(0);   // RENDER_ONCE
    // faces 0..4 rendered: nothing swaps yet (a material must never sample the cube it is drawing into)
    for (let f = 0; f < 5; f++) h.probe.cubeTexture.onAfterRenderObservable.notifyObservers(f);
    expect((court.material as PBRMaterial).reflectionTexture).toBeNull();
    h.probe.cubeTexture.onAfterRenderObservable.notifyObservers(5);
    expect((court.material as PBRMaterial).reflectionTexture).toBe(h.probe.cubeTexture);
    expect((wall.material as PBRMaterial).reflectionTexture).toBeNull();     // rough: keeps the mood gradient
    expect((hero.material as PBRMaterial).reflectionTexture).toBeNull();     // a player: keeps the mood gradient
    expect(h.materials).toEqual([court.material]);
    h.dispose();
    expect((court.material as PBRMaterial).reflectionTexture).toBeNull();
  });
  it('the high tier asks for it; desktop and mobile do not', () => {
    expect(tierRigSettings('high', 'goldenHour').venueProbe).toBe(true);
    expect(tierRigSettings('desktop', 'goldenHour').venueProbe).toBe(false);
    expect(tierRigSettings('mobile', 'goldenHour').venueProbe).toBe(false);
  });
  it('the rig captures through captureVenue on high only, once the scene is ready', async () => {
    const hi = mountLightRig(new Scene(new NullEngine()), 'dojoWarm', 'high');
    expect(hi.captureVenue(new Vector3(2, 0, 3))).toBe(true);
    for (let i = 0; i < 20 && !hi.venueProbe; i++) await new Promise((r) => setTimeout(r, 50));
    expect(hi.venueProbe?.probe.position.x).toBe(2);
    hi.dispose();
    const desk = mountLightRig(new Scene(new NullEngine()), 'dojoWarm', 'desktop');
    expect(desk.captureVenue(Vector3.Zero())).toBe(false);
    expect(desk.venueProbe).toBeNull();
  });
  it('the harness asks for the capture after load()', () => {
    const h = fs.readFileSync(path.resolve(__dirname, '../core/ModeHarness.ts'), 'utf8');
    expect(h).toMatch(/lights\.adoptRest\(\);[^\n]*\n\s+lights\.captureVenue\(/);
  });
});
