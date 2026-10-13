// vis-foundation-2 (A9.5 second half) — the fixtures light the place: which meshes, how strong, how many, and the Babylon
// shader bug the clustered path needed patching around.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Color3, MeshBuilder, NullEngine, PBRMaterial, Scene, ShaderStore } from '@babylonjs/core';
import {
  FIXTURE_CAP, FIXTURE_MOOD_GAIN, ROLE_E, findFixtures, fixtureLightsWanted, fixtureRole, lightColor, mountFixtureLights, patchClusteredSheen, planFixtureLights,
  type FixtureIn,
} from './FixtureLights';
import { WAVE2_HELD_MODES, wave2Look } from './lookPolicy';

const W = { r: 1, g: 0.9, b: 0.7 };
const f = (role: FixtureIn['role'], x: number, y: number, z: number, color = W): FixtureIn => ({ role, pos: { x, y, z }, color });

describe('fixtureRole', () => {
  it('names the light sources the builders make — and nothing that only glows', () => {
    expect(fixtureRole('flood_19_30')).toBe('flood');
    expect(fixtureRole('lhead', 'lampHead')).toBe('lamp');
    expect(fixtureRole('harbor_lighthouse_lamp')).toBe('lamp');
    expect(fixtureRole('lantern_8_-8')).toBe('bulb');
    expect(fixtureRole('bb_bulb_12')).toBe('bulb');
    expect(fixtureRole('loc_rooftop_bulb_3_1_2')).toBe('bulb');
    expect(fixtureRole('some_prop', 'lampHead')).toBe('lamp');   // by its material
    for (const n of ['juice_rim', 'aero_neon_strip', 'led_wall', 'gate_strip', 'banner', 'venue_ground']) expect(fixtureRole(n), n).toBeNull();
  });
  it('the builders still use these names (a rename would quietly put the lights out)', () => {
    const src = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
    expect(src('nexus/NexusWebScene.ts')).toContain("MeshBuilder.CreateSphere('lhead'");
    expect(src('visual/VenueKit.ts')).toContain('CreatePlane(`flood_${x}_${z}`');
    expect(src('visual/VenueKit.ts')).toContain('CreateSphere(`lantern_${x}_${z}`');
  });
});

describe('planFixtureLights', () => {
  it('sizes each light by what it lands on the ground: E × d² (a high flood and a low lamp land what their role says)', () => {
    const [lamp] = planFixtureLights([f('lamp', 0, 5.35, 0)], null, { cap: 8, mood: 'nightGame' });
    expect(lamp.kind).toBe('point');
    expect(lamp.intensity / (lamp.pos.y * lamp.pos.y)).toBeCloseTo(ROLE_E.lamp, 6);
    const [flood] = planFixtureLights([f('flood', 30, 20, 0)], { x: 0, y: 0, z: 0 }, { cap: 8, mood: 'nightGame' });
    expect(flood.kind).toBe('spot');
    const throwM = Math.hypot(30 * 0.7, 20, 0);   // aimed 70 % of the way to the play area, on the ground
    expect(flood.intensity / (throwM * throwM)).toBeCloseTo(ROLE_E.flood, 6);
    expect(flood.dir!.y).toBeLessThan(0); expect(flood.dir!.x).toBeLessThan(0);   // down, toward the play area
    expect(Math.hypot(flood.dir!.x, flood.dir!.y, flood.dir!.z)).toBeCloseTo(1, 6);
    expect(flood.range).toBeGreaterThan(throwM);
  });
  it('the night gets the full light; a sunny day barely any', () => {
    const night = planFixtureLights([f('lamp', 0, 5, 0)], null, { cap: 8, mood: 'nightGame' })[0].intensity;
    const day = planFixtureLights([f('lamp', 0, 5, 0)], null, { cap: 8, mood: 'daylight' })[0].intensity;
    expect(day / night).toBeCloseTo(FIXTURE_MOOD_GAIN.daylight / FIXTURE_MOOD_GAIN.nightGame, 6);
  });
  it('a string of bulbs is one light; floods come first, then lamps nearest the play, then bulbs; capped', () => {
    const fx = [f('bulb', 0, 3, 0), f('bulb', 1, 3, 0), f('bulb', 2, 3, 0), f('bulb', 20, 3, 0), f('lamp', 40, 5, 0), f('lamp', 10, 5, 0), f('flood', 60, 20, 0)];
    const plan = planFixtureLights(fx, { x: 0, y: 0, z: 0 }, { cap: 8, mood: 'dusk' });
    expect(plan.map((p) => p.role)).toEqual(['flood', 'lamp', 'lamp', 'bulb', 'bulb']);
    expect(plan[1].pos.x).toBe(10);   // the nearer lamp first
    expect(plan[3].pos.x).toBeCloseTo(1, 6);   // the three bulbs merged at their middle
    expect(planFixtureLights(fx, { x: 0, y: 0, z: 0 }, { cap: 2, mood: 'dusk' })).toHaveLength(2);
    expect(FIXTURE_CAP.high).toBeGreaterThan(FIXTURE_CAP.desktop);
  });
  it('light colour keeps the hue, not the emissive gain', () => {
    const c = lightColor({ r: 1.4, g: 1.26, b: 0.98 });
    expect(c.r).toBe(1); expect(c.g).toBeCloseTo(0.9, 9); expect(c.b).toBeCloseTo(0.7, 9);
    expect(lightColor({ r: 0, g: 0, b: 0 })).toEqual({ r: 1, g: 1, b: 1 });
  });
});

describe('patchClusteredSheen (Babylon 9.23: the clustered PBR loop reads the caller\'s normalW)', () => {
  it('renames the out-of-scope normal in the sheen term, once, and leaves a fixed include alone', () => {
    const store: Record<string, string> = { pbrClusteredLightingFunctions: 'a;info.sheen=computeSheenLighting(preInfo,normalW,sheenOut.sheenColor);b' };
    expect(patchClusteredSheen(store)).toBe(true);
    expect(store.pbrClusteredLightingFunctions).toBe('a;info.sheen=computeSheenLighting(preInfo,N,sheenOut.sheenColor);b');
    expect(patchClusteredSheen(store)).toBe(false);
    expect(patchClusteredSheen({})).toBe(false);
  });
  it('the installed Babylon still has the faulty text, or has been fixed — either way, after the patch it is gone', () => {
    patchClusteredSheen();
    expect(ShaderStore.IncludesShadersStore.pbrClusteredLightingFunctions ?? '').not.toContain('computeSheenLighting(preInfo,normalW,');
  });
});

describe('mountFixtureLights on a scene', () => {
  const lamp = (s: Scene, e = 1.4) => {
    const m = MeshBuilder.CreateSphere('lhead', { diameter: 0.5 }, s); m.position.set(3, 5.1, -2);
    const mat = new PBRMaterial('lampHead', s); mat.emissiveColor = new Color3(e, e * 0.9, e * 0.6); m.material = mat; return m;
  };
  it('finds the lit fixtures where the builders put them (a lamp that is off is not one)', () => {
    const s = new Scene(new NullEngine());
    lamp(s); lamp(s, 0.05);
    const fx = findFixtures(s);
    expect(fx).toHaveLength(1);
    expect(fx[0].role).toBe('lamp');
    expect(fx[0].pos.x).toBeCloseTo(3, 5); expect(fx[0].pos.y).toBeCloseTo(5.1, 5); expect(fx[0].pos.z).toBeCloseTo(-2, 5);
  });
  it('mobile, a held (hoops) mode, or an engine that cannot cluster: nothing mounted and no light left behind', () => {
    const s = new Scene(new NullEngine());
    lamp(s);
    expect(mountFixtureLights(s, 'mobile', 'nightGame', null)).toBeNull();
    (s.metadata ??= {}).felModeId = 'onevone';   // a held hoops mode (vis-hoops-court's) — dunk is lifted
    expect(mountFixtureLights(s, 'high', 'nightGame', null)).toBeNull();
    s.metadata.felModeId = 'volleyball';
    const before = s.lights.length;
    expect(mountFixtureLights(s, 'desktop', 'nightGame', null)).toBeNull();   // NullEngine has no texelFetch: unsupported
    expect(s.lights.length).toBe(before);
  });
  it('wanted on desktop and high for a mode the look reaches; never on mobile, a held mode, or ?lookoff=fixtures', () => {
    expect(fixtureLightsWanted('desktop', 'volleyball')).toBe(true);
    expect(fixtureLightsWanted('high', null)).toBe(true);
    expect(fixtureLightsWanted('mobile', 'volleyball')).toBe(false);
    expect(fixtureLightsWanted('high', 'onevone')).toBe(false);   // a mode still held (vis-hoops-court's)
    expect(fixtureLightsWanted('high', 'dunk')).toBe(true);       // vis-hoops-dunk lifted its hold
    expect(fixtureLightsWanted('high', 'volleyball', true)).toBe(false);
  });
  it('the court hoops modes stay held until their lane lifts them; dunk, dunkduel and threepoint (vis-hoops-dunk) and everything else take the look', () => {
    for (const m of ['onevone', 'threevthree', 'carnival']) expect(wave2Look(m), m).toBe(false);
    for (const m of ['dunk', 'dunkduel', 'threepoint', 'football', 'volleyball', 'karate', 'dance', 'golf', null]) expect(wave2Look(m), String(m)).toBe(true);
    expect(WAVE2_HELD_MODES.size).toBeGreaterThanOrEqual(3);
  });
});
