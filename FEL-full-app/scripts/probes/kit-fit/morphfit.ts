import { readFileSync } from 'node:fs';
import { NullEngine, Scene, ArcRotateCamera, Vector3, SceneLoader } from '@babylonjs/core';
import type { Mesh, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { applyKit } from '../../../lib/babylon/core/kit';
import { maskBodyNow, isBodyMesh } from '../../../lib/babylon/core/bodyMask';
import { syncShape } from '../../../lib/babylon/creator/shape/renderShape';
(async () => {
  console.warn = () => undefined; console.info = () => undefined;
  const scene = new Scene(new NullEngine()); scene.activeCamera = new ArcRotateCamera('c', 0, 1, 3, new Vector3(0, 1, 0), scene); scene.metadata = { felTier: 'desktop', felModeId: 'onevone' };
  const c = await SceneLoader.LoadAssetContainerAsync('', 'data:model/gltf-binary;base64,' + readFileSync('public/models/candidates/fel-kit-male.glb').toString('base64'), scene, undefined, '.glb');
  const inst = c.instantiateModelsToScene((x) => x + '_c', false, { doNotInstantiate: true }); const root = inst.rootNodes[0] as TransformNode, sk = inst.skeletons[0], meshes = root.getChildMeshes();
  applyKit(meshes, null, 'onevone');
  const G = (v: number) => ({ head: v, neck: v, chest: v, belly: v, upperArms: v, forearms: v, thighs: v, calves: v });
  const doc = { v: 1, parts: [], paint: [], colours: {}, shape: { face: {}, body: {}, girth: G(1.6) }, flags: { suit: false } } as never;
  syncShape({ root, skeleton: sk, meshes }, doc);   // the Creator applies with the identity, before the first frame
  scene.render(); scene.render();
  const body = meshes.find((m) => /^Body/.test(m.name)) as Mesh; maskBodyNow(body, meshes);   // the waistband fit lands after the first frame
  const sh = meshes.find((m) => /^Kit_shorts_shorts_court/.test(m.name)) as Mesh & { __felWaist0?: Float32Array };
  const pos = sh.getVerticesData('position')!, w0 = sh.__felWaist0!, tgt = sh.morphTargetManager!.getTarget(sh.morphTargetManager!.numTargets - 1);
  const T = tgt.getPositions()!; let moved = 0, kept = 0, lost = 0;
  for (let v = 0; v < pos.length / 3; v++) { const d = Math.hypot(pos[v * 3] - w0[v * 3], pos[v * 3 + 1] - w0[v * 3 + 1], pos[v * 3 + 2] - w0[v * 3 + 2]); if (d < 1e-4) continue; moved++;
    // the GPU draws T at influence 1: does T carry the fit (T - pos is the bulk only) or the pre-fit base (T - w0 is the bulk)?
    const a = Math.hypot(T[v * 3] - pos[v * 3], T[v * 3 + 1] - pos[v * 3 + 1], T[v * 3 + 2] - pos[v * 3 + 2]), b = Math.hypot(T[v * 3] - w0[v * 3], T[v * 3 + 1] - w0[v * 3 + 1], T[v * 3 + 2] - w0[v * 3 + 2]);
    if (b < a) lost++; else kept++; }
  console.log('waistband-fitted vertices', moved, 'the shape morph keeps the fit on', kept, 'and UNDOES it on', lost, 'influence', tgt.influence, 'name', tgt.name);
  syncShape({ root, skeleton: sk, meshes }, doc);
  const T2 = sh.morphTargetManager!.getTarget(sh.morphTargetManager!.numTargets - 1).getPositions()!; let same = 0; for (let i = 0; i < T.length; i++) if (Math.abs(T[i] - T2[i]) < 1e-7) same++; console.log('after a re-apply, target unchanged on', (same / T.length * 100).toFixed(0) + '% of values');
})();
