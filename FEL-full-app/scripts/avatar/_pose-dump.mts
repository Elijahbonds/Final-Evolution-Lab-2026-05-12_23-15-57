// Dump world positions of key bones at a clip's first frame (NullEngine).
// npx tsx scripts/avatar/_pose-dump.mts <glb> <clip>
import { readFileSync } from 'node:fs';
import { FreeCamera, NullEngine, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
const [glb = 'public/models/fel-hero.glb', clip = 'guard', fracStr = '0'] = process.argv.slice(2);
const frac = Number(fracStr);
const scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync(glb).toString('base64'), scene, undefined, '.glb');
for (const g of r.animationGroups) g.stop();
const g = r.animationGroups.find((x) => x.name === clip);
if (!g) { console.log('no clip', clip); process.exit(1); }
g.start(false, 1, g.from, g.to, false); g.goToFrame(g.from + (g.to - g.from) * frac); scene.render();
const sk = r.skeletons[0];
const out: Record<string, number[]> = {};
for (const n of ['Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightHand']) {
  const b = sk.bones.find((x) => x.name === n); const t = b?.getTransformNode(); if (!t) continue;
  t.computeWorldMatrix(true); const p = t.getAbsolutePosition();
  out[n] = [p.x, p.y, p.z].map((v) => Math.round(v * 100) / 100);
}
console.log(JSON.stringify({ clip, frac, ...out }));
scene.dispose();
