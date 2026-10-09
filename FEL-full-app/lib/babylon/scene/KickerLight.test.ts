// A9.6 (visual-foundation, 2026-10-06): the players-only kicker, and the ink decision.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./EnvironmentIBL', () => ({ mountEnvironmentIBL: () => () => {} }));   // a float cube map NullEngine cannot build

import { MeshBuilder, NullEngine, Scene, Skeleton, TargetCamera, Vector3 } from '@babylonjs/core';
import { KICKER, kickerDirection, mountKickerLight } from './KickerLight';
import { mountLightRig } from './LightRig';
import { MOODS } from './moods';
import { INK_MIN, INK_STYLE_BY_MODE, INK_WIDTH, autoInk, inkStyleFor, inkWidthAt } from '../visual/AnimeInk';
import { MODES } from '../modes/registry';

afterEach(() => vi.unstubAllGlobals());
/** Babylon announces a new mesh on the NEXT macrotask (Scene.addMesh → TimingTools.SetImmediate), then the skeleton check
 *  runs on the next frame — so flush the macrotask queue before stepping frames. */
const tick = async (s: Scene, n = 2) => {
  await new Promise((r) => setTimeout(r, 5));
  for (let i = 0; i < n; i++) s.onBeforeRenderObservable.notifyObservers(s);
};
function player(s: Scene, name = 'hero_body') {
  const m = MeshBuilder.CreateBox(name, { size: 1 }, s);
  m.skeleton = new Skeleton(`${name}_sk`, `${name}_sk`, s);
  return m;
}

describe('kickerDirection', () => {
  it('sits behind the subject, to one side and above — so it travels back toward the camera, down and across', () => {
    const d = kickerDirection({ x: 0, y: -0.3, z: 1 });   // a camera looking down +z (and a little down)
    expect(d.z).toBeLessThan(0);                          // toward the camera
    expect(d.y).toBeLessThan(0);                          // from above
    expect(d.x).toBeGreaterThan(0);                       // from the camera's left, across to the right
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 6);
  });
  it('follows the camera round: looking the other way flips it; a straight-down camera still gets a finite light', () => {
    const a = kickerDirection({ x: 0, y: 0, z: 1 }), b = kickerDirection({ x: 0, y: 0, z: -1 });
    expect(b.z).toBeCloseTo(-a.z, 6);
    expect(b.x).toBeCloseTo(-a.x, 6);
    const down = kickerDirection({ x: 0, y: -1, z: 0 });
    expect(Number.isFinite(down.x + down.y + down.z)).toBe(true);
  });
});

describe('the kicker lights the players and nothing else', () => {
  it('every mood has one', () => {
    for (const m of Object.keys(MOODS)) expect(KICKER[m as keyof typeof KICKER], m).toBeDefined();
  });
  it('stays OFF until a player exists (an empty include list would light the whole venue)', async () => {
    const s = new Scene(new NullEngine());
    MeshBuilder.CreateGround('venue_ground', { width: 10, height: 10 }, s);
    const k = mountKickerLight(s, 'nightGame');
    await tick(s);
    expect(k.light.isEnabled()).toBe(false);
    k.dispose();
  });
  it('includes skinned bodies only, re-aims from the camera, casts no shadow', async () => {
    const s = new Scene(new NullEngine());
    const cam = new TargetCamera('cam', new Vector3(0, 2, -8), s);
    cam.setTarget(Vector3.Zero());
    const ground = MeshBuilder.CreateGround('venue_ground', { width: 10, height: 10 }, s);
    const k = mountKickerLight(s, 'nightGame');
    const hero = player(s);
    await tick(s, 3);   // the skeleton check runs a frame after the add, the include list on the next
    expect(k.light.isEnabled()).toBe(true);
    expect(k.light.includedOnlyMeshes.length).toBe(1);
    expect(k.light.includedOnlyMeshes[0]).toBe(hero);
    expect(k.light.canAffectMesh(ground)).toBe(false);
    expect(k.light.direction.z).toBeLessThan(0);   // the camera looks down +z: the kicker comes back toward it
    expect(k.light.getShadowGenerator()).toBeNull();
    hero.dispose(); await tick(s);
    expect(k.light.includedOnlyMeshes.length).toBe(0);
    expect(k.light.isEnabled()).toBe(false);
  });
  it('the rig mounts it per mood (colour and strength), and a player stays inside four lights', async () => {
    const s = new Scene(new NullEngine());
    const rig = mountLightRig(s, 'dojoWarm', 'desktop');
    expect(rig.kicker?.light.intensity).toBe(KICKER.dojoWarm.intensity);
    const hero = player(s);
    await tick(s, 3);
    hero.computeWorldMatrix(true);
    (hero as unknown as { _resyncLightSources(): void })._resyncLightSources();
    const lights = hero.lightSources.map((l) => l.name).sort();
    expect(lights).toEqual(['fel_hemi', 'fel_kicker', 'fel_sun']);   // PBR's maxSimultaneousLights is 4
    rig.dispose();
  });
  it('?look=legacy mounts no kicker', () => {
    vi.stubGlobal('window', { location: { search: '?look=legacy' } });
    expect(mountLightRig(new Scene(new NullEngine()), 'dojoWarm', 'desktop').kicker).toBeNull();
  });
});

describe('the ink decision', () => {
  it('the photoreal sports draw a distance-true contour; the party and combat modes keep the anime line', () => {
    for (const id of ['dunk', 'onevone', 'golf', 'football', 'skateboard', 'baseball', 'soccer']) expect(inkStyleFor(id, ''), id).toBe('distance');
    for (const id of ['karate', 'karate-vs', 'showdown', 'duel', 'mixedcombat', 'dance', 'carnival', 'brainbrawl', 'velocitykart', 'aeroaces']) expect(inkStyleFor(id, ''), id).toBe('anime');
  });
  it('every mode the table names is a registered modeId (a typo would silently fall back to anime)', () => {
    const ids = new Set(Object.values(MODES).map((d) => d.modeId));
    for (const id of Object.keys(INK_STYLE_BY_MODE)) expect(ids.has(id), id).toBe(true);
  });
  it('?ink= tries any style for one load; ?look=legacy is anime everywhere', () => {
    expect(inkStyleFor('dunk', '?ink=off')).toBe('off');
    expect(inkStyleFor('karate', '?ink=distance')).toBe('distance');
    expect(inkStyleFor('dunk', '?look=legacy&ink=off')).toBe('anime');
    expect(inkStyleFor('dunk', '?ink=thick')).toBe('distance');
  });
  it('the distance width is about a pixel at any range and never thicker than the anime line', () => {
    expect(inkWidthAt('anime', 3)).toBe(INK_WIDTH);
    expect(inkWidthAt('distance', 3)).toBeLessThan(INK_WIDTH / 4);     // the close-up that drew ~7 px of black
    expect(inkWidthAt('distance', 0.1)).toBe(INK_MIN);
    expect(inkWidthAt('distance', 200)).toBe(INK_WIDTH);
    expect(inkWidthAt('off', 3)).toBe(0);
  });
  it('autoInk re-widths a sports body from the camera each frame', async () => {
    const s = new Scene(new NullEngine());
    const cam = new TargetCamera('cam', new Vector3(0, 0, -3), s);
    s.activeCamera = cam;
    cam.computeWorldMatrix(true);
    const un = autoInk(s, 'distance');
    const hero = player(s);
    await tick(s, 2);
    expect(hero.renderOutline).toBe(true);
    expect(hero.outlineWidth).toBeCloseTo(inkWidthAt('distance', 3), 4);
    cam.position.set(0, 0, -12); cam.computeWorldMatrix(true);
    await tick(s, 1);
    expect(hero.outlineWidth).toBeCloseTo(inkWidthAt('distance', 12), 4);
    un();
  });
  it("'off' draws no line", async () => {
    const s = new Scene(new NullEngine());
    autoInk(s, 'off');
    const hero = player(s);
    await tick(s, 2);
    expect(hero.renderOutline).toBe(false);
  });
});
