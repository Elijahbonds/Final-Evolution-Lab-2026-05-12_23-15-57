// The editor's stage and viewport on a real (Null) Babylon scene: the venue a mode mounts, the Studio's layers on it,
// the fixtures the rig will light, the decals kept alive, one pick proxy per visible object, a gizmo drag that commits a
// snapped transform, and a layer change that re-mounts only that layer.
// (Phone tier and an indoor-safe path: outdoor moods on desktop mount a CascadedShadowGenerator, which NullEngine refuses.)
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../babylon/scene/EnvironmentIBL', () => ({ mountEnvironmentIBL: () => () => {} }));   // a float cube NullEngine cannot build

import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { installOffscreenShim } from '@/tests/helpers/canvasShim';
import { everyKindVenue } from '@/tests/helpers/nexusStudio';
import { mountStage, type Stage } from './stage';
import { StudioViewport, changedLayers } from './viewport';
import { exportVenue } from './exportVenue';
import { mountDecalLayer, mountFixtureLayer, fixtureHeadName } from './runtime';
import { findFixtures } from '../babylon/scene/FixtureLights';
import { decalLife } from '../babylon/visual/GroundDecals';
import type { StudioTransform, StudioVenue } from './doc';

beforeAll(() => installOffscreenShim());
const made: Array<{ dispose(): void }> = [];
afterEach(() => { for (const m of made.splice(0)) { try { m.dispose(); } catch { /* already gone */ } } });

function engine(): NullEngine {
  const e = new NullEngine();
  (e as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 100;
  return e;
}

async function stageFor(v: StudioVenue): Promise<Stage> {
  const s = await mountStage({ canvas: null, engine: engine(), exp: exportVenue(v), tier: 'mobile' });
  made.push({ dispose: () => s.dispose() });
  return s;
}

describe('the stage mounts what the mode mounts', () => {
  it('the mode\'s scene marks, its venue (the spec under the Studio look) and the Studio\'s layers', async () => {
    const v = everyKindVenue();
    const s = await stageFor(v);
    expect(s.scene.metadata.felModeId).toBe('tiebreak');
    expect(s.scene.metadata.felTier).toBe('mobile');
    expect(s.scene.getLightByName('fel_sun')).toBeTruthy();                       // the mode's rig, not the venue's
    expect(s.scene.getLightByName('nexus_sun')).toBeNull();
    expect(s.venue).not.toBeNull();
    expect(s.scene.getMeshByName('venue_ground')).toBeTruthy();
    expect(s.scene.transformNodes.some((n) => n.name.startsWith('prop_net_'))).toBe(true);    // the game's net
    expect(s.scene.transformNodes.some((n) => n.name.startsWith('prop_banner_'))).toBe(true);   // the Studio's banner, through the PlaceLook
    expect(s.scene.transformNodes.some((n) => n.name === 'studio_meshy')).toBe(true);
    expect(s.subject().asArray()).toEqual([0, 0, 10]);                            // the camera mark
  });

  it('the fixtures are found by the rig\'s own finder, with their roles and colours', async () => {
    const v = everyKindVenue();
    const s = await stageFor(v);
    const found = findFixtures(s.scene);
    expect(found.map((f) => f.role).sort()).toEqual(['flood', 'lamp']);
    const flood = v.objects.find((o) => o.type === 'fixture' && o.role === 'flood')!;
    expect(s.scene.getMeshByName(fixtureHeadName('flood', flood.id))).toBeTruthy();
  });

  it('a fixture change re-mounts the fixtures and leaves the venue alone', async () => {
    const v = everyKindVenue();
    const s = await stageFor(v);
    const venueBefore = s.venue;
    const lamp = v.objects.find((o) => o.type === 'fixture' && o.role === 'lamp')!;
    const next: StudioVenue = { ...v, objects: v.objects.map((o) => (o.id === lamp.id ? { ...o, role: 'bulb' } as typeof o : o)) };
    const layers = changedLayers(exportVenue(v), exportVenue(next));
    expect([...layers!]).toEqual(['fixtures']);
    s.realise(exportVenue(next), layers!);
    expect(s.venue).toBe(venueBefore);
    expect(s.scene.getMeshByName(fixtureHeadName('bulb', lamp.id))).toBeTruthy();
    expect(s.scene.getMeshByName(fixtureHeadName('lamp', lamp.id))).toBeNull();
  });
});

describe('changedLayers', () => {
  const v = everyKindVenue();
  const a = exportVenue(v);
  it('a mood, spec or target change is the whole stage', () => {
    expect(changedLayers(a, { ...a, mood: 'dusk' })).toBeNull();
    expect(changedLayers(null, a)).toBeNull();
  });
  it('the sky and kit props are the venue; the weather is its own layer; nothing is nothing', () => {
    expect([...changedLayers(a, { ...a, look: { ...a.look, backdrop: 'beach' } })!]).toEqual(['venue']);
    expect([...changedLayers(a, { ...a, kit: [] })!]).toEqual(['venue']);
    expect([...changedLayers(a, { ...a, weather: 'fog' })!]).toEqual(['weather']);
    expect([...changedLayers(a, { ...a, decals: [] })!]).toEqual(['decals']);
    expect([...changedLayers(a, { ...a, crowd: null })!]).toEqual(['crowd']);
    expect(changedLayers(a, JSON.parse(JSON.stringify(a)))!.size).toBe(0);
  });
});

describe('placed marks stay', () => {
  it('a decal outlives the pool\'s own life because the layer refreshes it (cap stamps per kind, one slot each)', () => {
    const scene = new Scene(engine()); made.push(scene);
    new FreeCamera('c', new Vector3(0, 5, -5), scene);
    const layer = mountDecalLayer(scene, 'mobile', [{ kind: 'scuff', at: [0, 0, 0], yaw: 0, scale: 1 }, { kind: 'foot', at: [1, 0, 1], yaw: 0, scale: 1 }]);
    expect(layer.stamped).toBe(2);
    const live0 = layer.live();
    expect(live0).toBeGreaterThan(0);
    const frames = Math.ceil((decalLife('mobile') * 3) / 0.1);   // three lives at 100 ms a frame
    for (let i = 0; i < frames; i++) scene.render();
    expect(layer.live()).toBe(live0);
    layer.dispose();
  });

  it('every fixture head emits enough to count as a light, even a near-black pick', () => {
    const scene = new Scene(engine()); made.push(scene);
    mountFixtureLayer(scene, null, [{ id: 'a', role: 'lamp', at: [0, 0, 0], yaw: 0, height: 4, color: '#020202', scale: 1 }]);
    expect(findFixtures(scene)).toHaveLength(1);
  });
});

describe('the viewport', () => {
  async function viewport(v: StudioVenue, onTransform: (id: string, t: StudioTransform) => void = () => {}) {
    const vp = new StudioViewport(null, { onSelect: () => {}, onTransform }, engine());
    await vp.load(v, 'mobile');
    made.push(vp);
    return vp;
  }

  it('one pick proxy per visible object, at the object\'s transform', async () => {
    const v = everyKindVenue();
    const vp = await viewport(v);
    const proxies = vp.scene!.meshes.filter((m) => m.name.startsWith('__studio_pick_'));
    expect(proxies).toHaveLength(v.objects.filter((o) => !o.hidden).length);
    const bus = v.objects.find((o) => o.type === 'meshyProp')!;
    const holder = vp.scene!.getTransformNodeByName(`__studio_obj_${bus.id}`)!;
    expect(holder.position.asArray()).toEqual(bus.t.p);
    expect(holder.rotation.y).toBeCloseTo(bus.t.ry, 6);
  });

  it('selecting shows the proxy and attaches the gizmo; a locked object gets no gizmo', async () => {
    const v = everyKindVenue();
    v.objects[0].locked = true;
    const vp = await viewport(v);
    vp.select(v.objects[1].id);
    expect(vp.selection).toBe(v.objects[1].id);
    expect(vp.scene!.getMeshByName(`__studio_pick_${v.objects[1].id}`)!.isVisible).toBe(true);
    expect(vp.scene!.getMeshByName(`__studio_pick_${v.objects[2].id}`)!.isVisible).toBe(false);
    const gm = (vp as unknown as { gizmos: { attachedNode: unknown } }).gizmos;
    expect(gm.attachedNode).toBe(vp.scene!.getTransformNodeByName(`__studio_obj_${v.objects[1].id}`));
    vp.select(v.objects[0].id);
    expect(gm.attachedNode).toBeNull();
  });

  it('a gizmo drag ends in ONE transform, snapped to the grid and to 15°', async () => {
    const v = everyKindVenue();
    const got: Array<[string, StudioTransform]> = [];
    const vp = await viewport(v, (id, t) => got.push([id, t]));
    const o = v.objects.find((x) => x.type === 'meshyProp')!;
    vp.select(o.id);
    const holder = vp.scene!.getTransformNodeByName(`__studio_obj_${o.id}`)!;
    holder.position.set(3.2, 0, -4.4);
    holder.rotation.y = 0.27;   // ≈ 15.5°
    const giz = (vp as unknown as { gizmos: { gizmos: { positionGizmo: { onDragEndObservable: { notifyObservers(e: unknown): void } } } } }).gizmos.gizmos.positionGizmo;
    giz.onDragEndObservable.notifyObservers({});
    expect(got).toHaveLength(1);
    expect(got[0][0]).toBe(o.id);
    expect(got[0][1].p).toEqual([3, 0, -4.5]);
    expect(got[0][1].ry).toBeCloseTo(Math.PI / 12, 6);
  });

  it('an update with a moved object moves its proxy; a deleted one loses it', async () => {
    const v = everyKindVenue();
    const vp = await viewport(v);
    const [first, ...rest] = v.objects;
    const moved = { ...v, objects: [{ ...first, t: { ...first.t, p: [7, 0, 7] as [number, number, number] } }, ...rest.slice(1)] };
    await vp.update(moved);
    expect(vp.scene!.getTransformNodeByName(`__studio_obj_${first.id}`)!.position.asArray()).toEqual([7, 0, 7]);
    expect(vp.scene!.getTransformNodeByName(`__studio_obj_${rest[0].id}`)).toBeNull();
  });

  it('the budget sample leaves the editor\'s own overlays out of the count', async () => {
    const vp = await viewport(everyKindVenue());
    vp.scene!.render();
    const s = vp.sample()!;
    expect(s.tier).toBe('mobile');
    const mine = vp.scene!.getActiveMeshes().data.slice(0, vp.scene!.getActiveMeshes().length).filter((m) => m.name.startsWith('__studio_')).length;
    expect(s.activeMeshes).toBe(vp.scene!.getActiveMeshes().length - mine);
  });

  it('the ground under a point: the y = 0 plane when nothing pickable is hit', async () => {
    const vp = await viewport(everyKindVenue());
    const st = vp.currentStage!;
    st.scene.activeCamera = st.orbit;
    st.orbit.setPosition(new Vector3(0, 20, 20)); st.orbit.setTarget(Vector3.Zero());
    const at = vp.groundAt(st.engine.getRenderWidth() / 2, st.engine.getRenderHeight() / 2);
    expect(at).not.toBeNull();
    expect(at![1]).toBeGreaterThanOrEqual(0);
  });
});
