// hoops-p04b probe: does an authored hoops clip ITSELF spin a bone? Builds the clip on the shipped hero rig (NullEngine, a hoops mode's
// scene metadata, so the smoothing and pole rules are the game's) and samples every watched bone's LOCAL rotation at 60 fps, printing each
// frame over 400 deg/s (the rig's pop floor is 600). A clip that spins here spins in the game whatever the tree does; one that does not
// puts the spike in the runtime (a layer, the plant lock, a crossfade).
// Usage: npx tsx scripts/probes/hoops-gap/clip-flip.mts [builderName ...]   (default: the step-back gather, the rival's, the pull-up)
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BJS = await import('@babylonjs/core');
await import('@babylonjs/loaders/glTF/index.js');
const { boneNode } = await import(APP + '/lib/babylon/anim/boneLookup.ts');
const BB = await import(APP + '/lib/babylon/anim/authored/basketball.ts');
const { NullEngine, Scene, FreeCamera, Vector3, Quaternion, SceneLoader } = BJS;
const WATCH = ['Hips', 'Spine', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot'];
const scene = new Scene(new NullEngine()); scene.metadata = { felModeId: 'onevone' };
new FreeCamera('c', new Vector3(0, 1, -3), scene);
const b64 = fs.readFileSync(path.join(APP, 'public/models/fel-hero.glb')).toString('base64');
const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
for (const g of r.animationGroups) g.stop();
const sk = r.skeletons[0];
const bind = new Map();
for (const b of sk.bones) { const n = b.getTransformNode(); if (n) bind.set(n, { p: n.position.clone(), q: (n.rotationQuaternion ?? Quaternion.Identity()).clone() }); }
const rest = () => { for (const x of scene.animationGroups) x.stop(); for (const [n, t] of bind) { n.position.copyFrom(t.p); n.rotationQuaternion = t.q.clone(); } };
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['buildStepbackGather', 'buildStepbackRival', 'buildPullupGather'];
for (const name of names) {
  rest(); const g = BB[name](scene, sk); if (!g) { console.log(name, 'built nothing'); continue; }
  const dur = (g.to - g.from) / 30; const nodes = WATCH.map((w) => boneNode(sk, w));
  const prev = WATCH.map(() => null); const lines = []; let worst = [0, '', 0];
  for (let f = 0; f <= Math.round(dur * 60); f++) {
    rest(); g.start(false, 1, g.from, g.to, false); g.goToFrame(Math.min(g.to, g.from + f / 2)); scene.render();
    const row = [];
    nodes.forEach((n, j) => {
      if (!n) return; const q = (n.rotationQuaternion ?? Quaternion.Identity()).clone();
      if (prev[j]) { const d = Math.abs(Quaternion.Dot(q, prev[j])); const deg = 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI * 60; if (deg > 400) row.push(`${WATCH[j]} ${deg.toFixed(0)}`); if (deg > worst[0]) worst = [deg, WATCH[j], f]; }
      prev[j] = q;
    });
    if (row.length) lines.push(`  f${f} t=${(f / 60).toFixed(3)} s: ${row.join(', ')}`);
  }
  console.log(`${name} (${g.name}) ${dur.toFixed(2)} s; worst ${worst[1]} ${worst[0].toFixed(0)} deg/s at f${worst[2]}; frames over 400 deg/s:\n${lines.join('\n') || '  none'}`);
}
