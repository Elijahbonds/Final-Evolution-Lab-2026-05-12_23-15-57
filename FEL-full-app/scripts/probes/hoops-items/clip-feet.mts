// hoops-items item 6: where an authored clip puts the FEET (GATE 0: read-only — the clip is built from its keys exactly as the game builds
// it, on the shipped hero rig, NullEngine; nothing is written). Per 60 fps frame: each ankle's height above the root and its planar travel
// relative to the root, so "the planted foot slides" can be told from "the clip swings a foot that is still on the floor".
//   npx tsx scripts/probes/hoops-items/clip-feet.mts [builderName ...]      (default: buildHopStep)
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BJS = await import('@babylonjs/core');
await import('@babylonjs/loaders/glTF/index.js');
const { boneNode } = await import(APP + '/lib/babylon/anim/boneLookup.ts');
const BB = await import(APP + '/lib/babylon/anim/authored/basketball.ts');
const { NullEngine, Scene, FreeCamera, Vector3, Quaternion, SceneLoader } = BJS;
const scene = new Scene(new NullEngine()); scene.metadata = { felModeId: 'onevone' };
new FreeCamera('c', new Vector3(0, 1, -3), scene);
const b64 = fs.readFileSync(path.join(APP, 'public/models/fel-hero.glb')).toString('base64');
const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
for (const g of r.animationGroups) g.stop();
const sk = r.skeletons[0]; const top = r.meshes[0];
const bind = new Map();
for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.Identity()).clone() }); }
const rest = () => { for (const x of scene.animationGroups) x.stop(); for (const [n, t] of bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); } };
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['buildHopStep'];
const feet = ['LeftFoot', 'RightFoot'].map((n) => boneNode(sk, n));
for (const name of names) {
  rest(); const g = BB[name](scene, sk); if (!g) { console.log(name, 'built nothing'); continue; }
  const dur = (g.to - g.from) / 30; let prev = null; const rows = [];
  for (let f = 0; f <= Math.round(dur * 60); f++) {
    rest(); g.start(false, 1, g.from, g.to, false); g.goToFrame(Math.min(g.to, g.from + f / 2)); scene.render();
    top.computeWorldMatrix(true); const root = top.getAbsolutePosition();
    const now = feet.map((n) => { n.computeWorldMatrix(true); const p = n.getAbsolutePosition(); return { y: p.y - root.y, x: p.x - root.x, z: p.z - root.z }; });
    const d = prev ? now.map((p, i) => Math.hypot(p.x - prev[i].x, p.z - prev[i].z) * 100) : [0, 0];
    rows.push(`  f${String(f).padStart(2)} t ${(f / 60).toFixed(3)}  L y ${now[0].y.toFixed(3)} moved ${d[0].toFixed(1)} cm · R y ${now[1].y.toFixed(3)} moved ${d[1].toFixed(1)} cm`);
    prev = now;
  }
  console.log(`${name} (${g.name}) ${dur.toFixed(2)} s — ankle height above the root (m) and planar travel per frame relative to the root:\n${rows.join('\n')}`);
}
