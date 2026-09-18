// Does an optimized map load under Babylon (NullEngine) with the same mesh count as the original?
import { readFileSync } from 'node:fs';
import { NullEngine, Scene, SceneLoader } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
for (const f of process.argv.slice(2)) {
  const scene = new Scene(new NullEngine());
  const b64 = readFileSync(f).toString('base64');
  try {
    const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
    const verts = r.meshes.reduce((n, m) => n + m.getTotalVertices(), 0);
    console.log(`${f.split('/').slice(-2).join('/').padEnd(40)} meshes ${r.meshes.length} verts ${verts} materials ${scene.materials.length}`);
  } catch (e) { console.log(`${f} FAILED: ${(e as Error).message.slice(0, 160)}`); }
  scene.getEngine().dispose();
}
