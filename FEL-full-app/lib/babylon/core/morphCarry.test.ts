// lane/kit-fit, job 3 (the waistband over the tee on a Creator build): the Creator's shape morph no longer undoes the garments'
// fit (morphCarry.ts). On the shipped male kit, girth 1.6: the shape held the pre-fit short on 225 of the 293 vertices the
// waistband fit moved (measured, scripts/probes/kit-fit/morphfit.ts); with the carry it keeps the fit, in either order.
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NullEngine, Scene, ArcRotateCamera, Vector3, SceneLoader } from '@babylonjs/core';
import type { AssetContainer, Mesh, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { applyKit } from './kit';
import { maskBodyNow } from './bodyMask';
import { carryShapeMorph, SHAPE_KEEPS_FIT } from './morphCarry';
import { syncShape } from '../creator/shape/renderShape';
import { FEEL_KNOB_BY_ID } from '../../feel-panel/knobs';
import { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';
import type { CreatorDoc } from '../../creator/look/doc';

let scene: Scene; let kit: AssetContainer;
beforeAll(async () => {
  scene = new Scene(new NullEngine());
  scene.activeCamera = new ArcRotateCamera('c', 0, 1, 3, new Vector3(0, 1, 0), scene);
  scene.metadata = { felTier: 'desktop', felModeId: 'onevone' };
  kit = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync('public/models/candidates/fel-kit-male.glb').toString('base64')}`, scene, undefined, '.glb');
}, 120_000);
afterEach(() => resetFeelForTests());

const G = (v: number) => ({ head: v, neck: v, chest: v, belly: v, upperArms: v, forearms: v, thighs: v, calves: v });
const DOC = { v: 1, parts: [], paint: [], colours: {}, shape: { face: {}, body: {}, girth: G(1.6) }, flags: { suit: false } } as unknown as CreatorDoc;
let n = 0;
/** Spawn, shape first (the Creator applies with the identity), then the fit after the first frames; how many fitted vertices the
 *  shape morph draws with the fit kept vs undone. */
function shapedFit(): { moved: number; kept: number; undone: number } {
  const inst = kit.instantiateModelsToScene((x) => `${x}_m${++n}`, false, { doNotInstantiate: true });
  const root = inst.rootNodes[0] as TransformNode, sk = inst.skeletons[0], meshes = root.getChildMeshes();
  applyKit(meshes, null, 'onevone');
  syncShape({ root, skeleton: sk, meshes }, DOC);
  scene.render(); scene.render();
  maskBodyNow(meshes.find((m) => /^Body/.test(m.name)) as Mesh, meshes);
  const sh = meshes.find((m) => /^Kit_shorts_shorts_court/.test(m.name)) as Mesh & { __felWaist0?: Float32Array };
  const pos = sh.getVerticesData('position')!, w0 = sh.__felWaist0!, T = sh.morphTargetManager!.getTarget(sh.morphTargetManager!.numTargets - 1).getPositions()!;
  let moved = 0, kept = 0, undone = 0;
  for (let v = 0; v < pos.length / 3; v++) {
    if (Math.hypot(pos[v * 3] - w0[v * 3], pos[v * 3 + 1] - w0[v * 3 + 1], pos[v * 3 + 2] - w0[v * 3 + 2]) < 1e-4) continue;
    moved++;
    const toFit = Math.hypot(T[v * 3] - pos[v * 3], T[v * 3 + 1] - pos[v * 3 + 1], T[v * 3 + 2] - pos[v * 3 + 2]), toLoaded = Math.hypot(T[v * 3] - w0[v * 3], T[v * 3 + 1] - w0[v * 3 + 1], T[v * 3 + 2] - w0[v * 3 + 2]);
    if (toFit <= toLoaded) kept++; else undone++;
  }
  root.dispose();
  return { moved, kept, undone };
}

describe('a garment\'s fit survives the Creator\'s shape (kit.shapeKeepsFit)', () => {
  it('ships on, and its knob row restores the old behaviour at 0', () => {
    expect(SHAPE_KEEPS_FIT).toBe(1);
    const k = FEEL_KNOB_BY_ID.get('kit.shapeKeepsFit')!;
    expect([k.def, k.min, k.max, k.step]).toEqual([1, 0, 1, 1]);
  });
  it('on the male kit at girth 1.6 the shape keeps the waistband fit on nearly every fitted vertex', () => {
    const r = shapedFit();
    expect(r.moved).toBeGreaterThan(200);
    expect(r.kept / r.moved).toBeGreaterThan(0.95);
  }, 60_000);
  it('with the knob off the shape draws the pre-fit short, as before (most fitted vertices undone)', () => {
    setFeelUser(true); setFeelSession(null); setFeelOverride('kit.shapeKeepsFit', 0);
    const r = shapedFit();
    expect(r.undone / r.moved).toBeGreaterThan(0.6);
  }, 60_000);
  it('carryShapeMorph moves each target by the vertices\' own move, and only when the layouts match', () => {
    const P = new Float32Array([1, 2, 3]);
    const target = { getPositions: () => P, setPositions: (o: Float32Array) => P.set(o) };
    const mesh = { morphTargetManager: { numTargets: 1, getTarget: () => target } } as unknown as Mesh;
    expect(carryShapeMorph(mesh, [0, 0, 0], [0.5, 0, -1])).toBe(1);
    expect([...P]).toEqual([1.5, 2, 2]);
    expect(carryShapeMorph(mesh, [0, 0], [1, 1])).toBe(0);
  });
});
