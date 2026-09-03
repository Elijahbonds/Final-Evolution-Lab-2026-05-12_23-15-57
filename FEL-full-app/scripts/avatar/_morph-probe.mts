// Load a forged GLB in a NullEngine and report morph targets + face parts.
// npx tsx scripts/avatar/_morph-probe.mts <path.glb>
import { readFileSync } from 'node:fs';
import { NullEngine, Scene, SceneLoader } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
const path = process.argv[2] ?? 'public/models/fel-hero.glb';
const b64 = readFileSync(path).toString('base64');
const scene = new Scene(new NullEngine());
const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
const out = r.meshes.filter((m) => m.getTotalVertices() > 0).map((m) => ({
  mesh: m.name, material: m.material?.name, verts: m.getTotalVertices(),
  morphs: m.morphTargetManager ? Array.from({ length: m.morphTargetManager.numTargets }, (_, i) => m.morphTargetManager!.getTarget(i).name) : [],
}));
console.log(JSON.stringify({ meshes: out, skeletons: r.skeletons.map((s) => s.bones.length), clips: r.animationGroups.map((g) => g.name) }, null, 1));
scene.dispose();
