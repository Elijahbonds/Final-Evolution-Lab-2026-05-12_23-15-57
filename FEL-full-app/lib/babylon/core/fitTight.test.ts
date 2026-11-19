// lane/kit-tight (owner 2026-11-18: "make the clothes appear to be skin tight and not baggy ... right now it looks poofy"):
// kit.fitTightness pulls the worn kit tee / tank and short toward the skin; 0 is today exactly. fitTight.ts.
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NullEngine, Scene, ArcRotateCamera, Vector3, SceneLoader } from '@babylonjs/core';
import type { AssetContainer, Mesh, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { applyKit } from './kit';
import { maskBodyNow, skinnedWorld } from './bodyMask';
import { FIT_FLOOR, FIT_TIGHTNESS, LAYER_GAP, SkinSurface, fitsTight, openEdgeWeights, tightPull, underTopPull } from './fitTight';
import { FEEL_KNOB_BY_ID } from '../../feel-panel/knobs';
import { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';

let scene: Scene; let kit: AssetContainer;
beforeAll(async () => {
  scene = new Scene(new NullEngine());
  scene.activeCamera = new ArcRotateCamera('c', 0, 1, 3, new Vector3(0, 1, 0), scene);
  scene.metadata = { felTier: 'desktop', felModeId: 'onevone' };
  kit = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync('public/models/candidates/fel-kit-male.glb').toString('base64')}`, scene, undefined, '.glb');
}, 120_000);
afterEach(() => resetFeelForTests());

let n = 0;
/** Spawn the male kit, fit it, and return the worn tank's and short's mean gap to the skin (world, outward vertices), and the positions. */
function wornGaps(t: number | null): { top: number; shorts: number; pos: Float32Array } {
  if (t !== null) { setFeelUser(true); setFeelSession(null); setFeelOverride('kit.fitTightness', t); }
  const inst = kit.instantiateModelsToScene((x) => `${x}_t${++n}`, false, { doNotInstantiate: true });
  const root = inst.rootNodes[0] as TransformNode, meshes = root.getChildMeshes();
  applyKit(meshes, null, 'onevone');
  scene.render(); scene.render();
  const body = meshes.find((m) => /^Body/.test(m.name)) as Mesh;
  maskBodyNow(body, meshes);
  const bs = skinnedWorld(body)!, skin = new SkinSurface(bs.P, bs.N, (body.metadata as { felBodyIndices0: number[] }).felBodyIndices0);
  const mean = (re: RegExp) => {
    const g = meshes.find((m) => re.test(m.name) && m.isVisible) as Mesh, P = skinnedWorld(g)!.P;
    let s = 0, k = 0; for (let v = 0; v < P.length / 3; v++) { const h = skin.closest(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], 0.12); if (h && h.signed > 0) { s += h.signed; k++; } }
    return s / k;
  };
  const top = mean(/^Kit_tops_/), shorts = mean(/^Kit_shorts_/);
  const pos = Float32Array.from((meshes.find((m) => /^Kit_tops_/.test(m.name) && m.isVisible) as Mesh).getVerticesData('position')!);
  root.dispose();
  return { top, shorts, pos };
}

describe('the clothes fit (kit.fitTightness)', () => {
  it('ships at 0 = today, and its row restores it', () => {
    expect(FIT_TIGHTNESS).toBe(0);
    const k = FEEL_KNOB_BY_ID.get('kit.fitTightness')!;
    expect([k.def, k.min, k.max]).toEqual([0, 0, 1]);
  });
  it('at 0 nothing moves: the worn top is vertex for vertex what it was with no knob set', () => {
    const a = wornGaps(null), b = wornGaps(0);
    expect([...b.pos]).toEqual([...a.pos]);
  }, 60_000);
  it('at 1 the tank and the short sit much closer to the body (male kit, idle)', () => {
    const before = wornGaps(0), after = wornGaps(1);
    expect(after.top).toBeLessThan(before.top * 0.7);
    expect(after.shorts).toBeLessThan(before.shorts * 0.8);
  }, 60_000);
  it('only the kit body\'s own tops and shorts are pulled (never a pack\'s shell or a shoe)', () => {
    const m = (name: string) => ({ name }) as unknown as Mesh;
    expect(fitsTight(m('Kit_tops_top_lab_c3'), 'tops')).toBe(true);
    expect(fitsTight(m('Kit_shorts_shorts_court_c3'), 'shorts')).toBe(true);
    expect(fitsTight(m('Kit_tops_top_football_pk12'), 'tops')).toBe(false);
    expect(fitsTight(m('Kit_shoes_shoes_evo_c3'), 'shoes')).toBe(false);
  });
  it('tightPull: t of the excess over the floor, faded to nothing at an open edge, never pushing a vertex already close', () => {
    // a flat skin at z = 0 (normal +z), three cloth points 3 cm, 3 cm (at an edge) and 0.5 cm above it
    const skin = new SkinSurface([-1, -1, 0, 1, -1, 0, 0, 1, 0], [0, 0, 1, 0, 0, 1, 0, 0, 1], [0, 1, 2]);
    const r = tightPull([0, 0, 0.03, 0.1, 0, 0.03, 0, 0.1, 0.005], [0, 1, 0], skin, 0.5);
    expect(r.delta[2]).toBeCloseTo(-0.5 * (0.03 - FIT_FLOOR), 6);
    expect(r.delta[5]).toBe(0);
    expect(r.delta[8]).toBe(0);
  });
  it('openEdgeWeights: a split seam is not an opening; the rim of an open strip is', () => {
    // two quads sharing an edge, the shared edge's vertices duplicated (a seam): the outer rim is open, the seam is not
    const P = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, /* seam copies */ 1, 0, 0, 1, 1, 0, 2, 0, 0, 2, 1, 0];
    const ind = [0, 1, 2, 0, 2, 3, 4, 6, 7, 4, 7, 5];
    const r = openEdgeWeights(P, ind, 0.5);
    expect(r.edgeVerts).toBe(6);   // every corner lies on the open rim; the two seam pairs weld into one each
  });
  it('underTopPull: a short point the top covers is held at least the gap under it; one below the hem, or already under, stays', () => {
    // a flat top at z = 0 facing +z; short points 2 mm OUTSIDE it, 10 mm under it, and one below the top's hem (y < -0.5)
    const top = new SkinSurface([-1, -1, 0, 1, -1, 0, 0, 1, 0], [0, 0, 1, 0, 0, 1, 0, 0, 1], [0, 1, 2]);
    const r = underTopPull([0, 0, 0.002, 0.1, 0, -0.01, 0, -0.9, 0.002], top, -0.5, LAYER_GAP);
    expect(r.delta[2]).toBeCloseTo(-(0.002 + LAYER_GAP), 6);
    expect(r.delta[5]).toBe(0);
    expect(r.delta[8]).toBe(0);
    expect(r.moved).toBe(1);
  });
});
