// KIT-TIGHT phase 2: the Blender-made garment sets (kitGarmentSet.ts) on a kit body, headless: are they tagged on the spawned
// clone, and how far off the skin do they stand as drawn (applyKit's lift, the mask's flare) at kit.setLiftScale = KNOBS.
//   KNOBS='{"kit.setLiftScale":0.3}' npx tsx scripts/probes/kit-tight/setgap.ts <male|female> [shorts,jerseys]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NullEngine, Scene, ArcRotateCamera, Vector3, SceneLoader } from '@babylonjs/core';
import type { AbstractMesh, Mesh, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { applyKit } from '../../../lib/babylon/core/kit';
import { skinnedWorld, maskBodyNow, isBodyMesh, maskSlotOf } from '../../../lib/babylon/core/bodyMask';
import { KIT_GARMENT_SETS, applyGarmentSet, parseGarmentSet } from '../../../lib/babylon/core/kitGarmentSet';
import { SkinSurface } from '../../../lib/babylon/core/fitTight';
import { setFeelOverride, setFeelSession, setFeelUser } from '../../../lib/feel-panel/feel';
const ROOT = resolve(__dirname, '../../..');
(async () => {
  const sex = (process.argv[2] ?? 'male') as 'male' | 'female', kinds = (process.argv[3] ?? 'shorts,jerseys').split(',') as ('shorts' | 'jerseys')[];
  setFeelUser(true); setFeelSession(null);
  const knobs = { 'kit.onePieceShorts': kinds.includes('shorts') ? 1 : 0, 'kit.newJerseys': kinds.includes('jerseys') ? 1 : 0, ...(process.env.KNOBS ? JSON.parse(process.env.KNOBS) : {}) };
  for (const [k, v] of Object.entries(knobs)) setFeelOverride(k, v as number);
  console.warn = () => undefined; console.info = () => undefined; const log = console.log; console.log = (...a: unknown[]) => { if (!/^(BJS|\[FEL-)/.test(String(a[0]))) log(...a); };
  const scene = new Scene(new NullEngine()); scene.activeCamera = new ArcRotateCamera('c', 0, 1, 3, new Vector3(0, 1, 0), scene); scene.metadata = { felTier: 'desktop', felModeId: 'onevone' };
  const c = await SceneLoader.LoadAssetContainerAsync('', 'data:model/gltf-binary;base64,' + readFileSync(resolve(ROOT, `public/models/candidates/fel-kit-${sex}.glb`)).toString('base64'), scene, undefined, '.glb');
  for (const k of kinds) { const buf = readFileSync(resolve(ROOT, 'public' + KIT_GARMENT_SETS[k][sex])); const set = parseGarmentSet(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)); if (set) log(k, JSON.stringify(applyGarmentSet(c, set))); }
  const inst = c.instantiateModelsToScene((x) => x + '_c', false, { doNotInstantiate: true }); const root = inst.rootNodes[0] as TransformNode, meshes = root.getChildMeshes();
  scene.render(); applyKit(meshes, null, 'onevone'); scene.render();
  const body = meshes.find((m) => isBodyMesh(m.name.replace(/_c$/, ''))) as Mesh; maskBodyNow(body, root.getChildMeshes() as AbstractMesh[]);
  const bs = skinnedWorld(body)!, S = new SkinSurface(bs.P, bs.N, (body.metadata as { felBodyIndices0: number[] }).felBodyIndices0);
  for (const m of root.getChildMeshes()) {
    const slot = maskSlotOf(m.name); if ((slot !== 'tops' && slot !== 'shorts') || !m.isVisible) continue;
    const w = skinnedWorld(m as Mesh)!, g: number[] = [];
    for (let v = 0; v < w.P.length / 3; v++) { const h = S.closest(w.P[v * 3], w.P[v * 3 + 1], w.P[v * 3 + 2], 0.15); if (h && w.N[v * 3] * h.n[0] + w.N[v * 3 + 1] * h.n[1] + w.N[v * 3 + 2] * h.n[2] > 0.2) g.push(h.signed); }
    g.sort((a, b) => a - b);
    log(`${m.name.padEnd(30)} set:${(m.metadata as { felKitGarmentSet?: string } | null)?.felKitGarmentSet ?? '-'}  gap cm median ${(g[g.length >> 1] * 100).toFixed(1)}  p90 ${(g[Math.floor(g.length * 0.9)] * 100).toFixed(1)}  under skin ${(100 * g.filter((x) => x < 0).length / g.length).toFixed(0)} %`);
  }
})();
