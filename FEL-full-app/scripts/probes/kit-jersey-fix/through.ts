// KIT-JERSEY-FIX: how far the one-piece short stands OUTSIDE the new basketball jersey where the jersey covers it (the dark marks
// on the jersey's lower back are the short showing through: hiding the shorts on the rig removes them). Headless, the real kit,
// garment-set, lift, mask and waistband-fit code, idle pose.
//   KNOBS='{…}' npx tsx scripts/probes/kit-jersey-fix/through.ts <male|female>
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NullEngine, Scene, ArcRotateCamera, Vector3, SceneLoader } from '@babylonjs/core';
import type { AbstractMesh, Mesh, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { applyKit } from '../../../lib/babylon/core/kit';
import { skinnedWorld, maskBodyNow, isBodyMesh } from '../../../lib/babylon/core/bodyMask';
import { KIT_GARMENT_SETS, applyGarmentSet, parseGarmentSet } from '../../../lib/babylon/core/kitGarmentSet';
import { SkinSurface } from '../../../lib/babylon/core/fitTight';
import { setFeelOverride, setFeelSession, setFeelUser } from '../../../lib/feel-panel/feel';
const ROOT = resolve(__dirname, '../../..');
export async function through(sex: 'male' | 'female'): Promise<{ covered: number; outside: number; p50: number; p90: number; max: number; outsideAt: number[] }> {
  const scene = new Scene(new NullEngine()); scene.activeCamera = new ArcRotateCamera('c', 0, 1, 3, new Vector3(0, 1, 0), scene); scene.metadata = { felTier: 'desktop', felModeId: 'onevone' };
  const c = await SceneLoader.LoadAssetContainerAsync('', 'data:model/gltf-binary;base64,' + readFileSync(resolve(ROOT, `public/models/candidates/fel-kit-${sex}.glb`)).toString('base64'), scene, undefined, '.glb');
  for (const k of ['shorts', 'jerseys'] as const) { const b = readFileSync(resolve(ROOT, 'public' + KIT_GARMENT_SETS[k][sex])); applyGarmentSet(c, parseGarmentSet(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))); }
  const inst = c.instantiateModelsToScene((x) => x + '_c1', false, { doNotInstantiate: true }); const root = inst.rootNodes[0] as TransformNode;
  scene.render(); applyKit(root.getChildMeshes(), { tops: 'top_basketball', shorts: 'shorts_court' } as never, 'onevone'); scene.render();
  const meshes = root.getChildMeshes() as AbstractMesh[], body = meshes.find((m) => isBodyMesh(m.name.replace(/_c1$/, ''))) as Mesh;
  maskBodyNow(body, meshes);
  const top = meshes.find((m) => /^Kit_tops_top_basketball/.test(m.name) && m.isVisible) as Mesh, sh = meshes.find((m) => /^Kit_shorts_/.test(m.name) && m.isVisible) as Mesh;
  const tw = skinnedWorld(top)!, sw = skinnedWorld(sh)!;
  const jersey = new SkinSurface(tw.P, tw.N, top.getIndices()!);
  let lo = Infinity; for (let i = 1; i < tw.P.length; i += 3) lo = Math.min(lo, tw.P[i]);
  const d: number[] = []; const at: number[] = [];
  for (let v = 0; v < sw.P.length / 3; v++) {
    const y = sw.P[v * 3 + 1]; if (y < lo + 0.005) continue;   // below the jersey's hem: not covered
    const h = jersey.closest(sw.P[v * 3], y, sw.P[v * 3 + 2], 0.06); if (!h) continue;
    d.push(h.signed); if (h.signed > 0) at.push(+(y - lo).toFixed(3));
  }
  d.sort((a, b) => a - b); const q = (f: number) => +(d[Math.floor(d.length * f)] * 1000).toFixed(1);
  root.dispose(); c.dispose(); scene.dispose();
  return { covered: d.length, outside: d.filter((x) => x > 0).length, p50: q(0.5), p90: q(0.9), max: +((d[d.length - 1] ?? 0) * 1000).toFixed(1), outsideAt: at.sort((a, b) => a - b).filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 8)) === 0) };
}
if (require.main === module) void (async () => {
  if (process.env.KNOBS) { setFeelUser(true); setFeelSession(null); for (const [k, v] of Object.entries(JSON.parse(process.env.KNOBS) as Record<string, number>)) setFeelOverride(k, v); }
  console.warn = () => undefined; console.info = () => undefined;
  for (const s of (process.argv[2] ? [process.argv[2]] : ['male', 'female']) as ('male' | 'female')[]) console.log(s, 'short vs jersey (mm; + = the short OUTSIDE the jersey):', JSON.stringify(await through(s)));
})();
