// KIT-FIT: WHERE a garment tears in a pose (the kit-glitch TEAR rule: an edge past ×2 of its bind length and ×1.5 of the skin
// under it), as rest-pose positions and the bones at each end. Headless, the real kit + mask code (as cpu.ts).
//   npx tsx scripts/probes/kit-fit/tears.ts <male|female|file:<glb>> <clip@frac> [Kit_shorts]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NullEngine, Scene, ArcRotateCamera, Vector3, SceneLoader } from '@babylonjs/core';
import type { Mesh, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { applyKit } from '../../../lib/babylon/core/kit';
import { skinnedWorld, maskBodyNow, isBodyMesh } from '../../../lib/babylon/core/bodyMask';
import { CharacterAnimator } from '../../../lib/babylon/anim/CharacterAnimator';
import { registerAuthoredClips } from '../../../lib/babylon/anim/authored';
import { sanitizeImportedGroups } from '../../../lib/babylon/anim/importSanitizer';

const ROOT = resolve(__dirname, '../../..');
const files: Record<string, string> = { male: 'public/models/candidates/fel-kit-male.glb', female: 'public/models/candidates/fel-kit-female.glb' };
async function main(): Promise<void> {
  const [key, clipAt, want = 'Kit_shorts'] = process.argv.slice(2);
  const [clip, frac] = clipAt.split('@');
  console.warn = () => undefined; console.info = () => undefined; const log = console.log; console.log = (...a: unknown[]) => { if (!/^(BJS|\[FEL-)/.test(String(a[0]))) log(...a); };
  const engine = new NullEngine(); const scene = new Scene(engine);
  scene.activeCamera = new ArcRotateCamera('c', -Math.PI / 2, 1.2, 3.2, new Vector3(0, 1, 0), scene);
  scene.metadata = { felTier: 'desktop', felModeId: 'onevone' };
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60; scene.useConstantAnimationDeltaTime = true;
  const f = key.startsWith('file:') ? key.slice(5) : resolve(ROOT, files[key]);
  const c = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync(f).toString('base64')}`, scene, undefined, '.glb');
  const inst = c.instantiateModelsToScene((x) => `${x}_c`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop(); sanitizeImportedGroups(inst.animationGroups);
  const root = inst.rootNodes[0] as TransformNode, sk = inst.skeletons[0], meshes = root.getChildMeshes();
  const animator = new CharacterAnimator(scene, inst.animationGroups); registerAuthoredClips(animator, scene, sk, null);
  applyKit(meshes, null, 'onevone');
  animator.play('idle_stand', { loop: true, fadeSec: 0, restart: true }); for (let i = 0; i < 3; i++) scene.render();
  const body = meshes.find((m) => isBodyMesh(m.name.replace(/_c$/, '')) || /^Body/.test(m.name)) as Mesh;
  maskBodyNow(body, meshes);
  const g = meshes.find((m) => m.name.startsWith(want) && m.isVisible) as Mesh;
  const rest = skinnedWorld(g)!.P.slice(); const bodyRest = skinnedWorld(body)!.P.slice();
  const grp = animator.play(clip, { loop: true, fadeSec: 0, restart: true })!; for (const o of scene.animationGroups) if (o !== grp && o.isPlaying) o.stop();
  grp.goToFrame(grp.from + (grp.to - grp.from) * Number(frac ?? 0.5)); grp.pause(); for (let i = 0; i < 2; i++) scene.render();
  const gw = skinnedWorld(g)!.P, bw = skinnedWorld(body)!.P, ind = g.getIndices()!;
  const len = (P: ArrayLike<number>, a: number, b: number) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
  const near = (P: ArrayLike<number>, v: number) => { let bd = Infinity, bi = 0; for (let u = 0; u < bodyRest.length / 3; u++) { const d = (bodyRest[u * 3] - P[v * 3]) ** 2 + (bodyRest[u * 3 + 1] - P[v * 3 + 1]) ** 2 + (bodyRest[u * 3 + 2] - P[v * 3 + 2]) ** 2; if (d < bd) { bd = d; bi = u; } } return bi; };
  const rs: number[] = []; for (let t = 0; t < ind.length; t += 3) { const r0 = len(rest, ind[t], ind[t + 1]); if (r0 > 1e-6) rs.push(len(gw, ind[t], ind[t + 1]) / r0); }
  rs.sort((x, y) => x - y); const k = rs[rs.length >> 1] || 1;
  const mi = g.getVerticesData('matricesIndices')!, mw = g.getVerticesData('matricesWeights')!, bones = g.skeleton!.bones;
  const wstr = (v: number) => [0, 1, 2, 3].filter((q) => mw[v * 4 + q] > 0.02).map((q) => `${bones[mi[v * 4 + q]].name.replace('Left', 'L').replace('Right', 'R')}:${mw[v * 4 + q].toFixed(2)}`).join(',');
  let n = 0;
  for (let t = 0; t < ind.length; t += 3) for (const [a, b] of [[ind[t], ind[t + 1]], [ind[t + 1], ind[t + 2]], [ind[t + 2], ind[t]]]) {
    const r0 = len(rest, a, b) * k; if (r0 < 0.003) continue;
    const r = len(gw, a, b) / r0; if (r <= 2) continue;
    const ba = near(rest, a), bb = near(rest, b), s0 = len(bodyRest, ba, bb), s1 = len(bw, ba, bb), rb = s0 > 0.003 ? s1 / s0 : 1;
    if (!(r > 1.5 * rb)) continue;
    n++;
    log(`×${r.toFixed(2)} skin×${rb.toFixed(2)} A(${[0, 1, 2].map((i) => rest[a * 3 + i].toFixed(2)).join(',')}) ${wstr(a)}  B(${[0, 1, 2].map((i) => rest[b * 3 + i].toFixed(2)).join(',')}) ${wstr(b)}`);
  }
  log('torn', n);
}
void main();
