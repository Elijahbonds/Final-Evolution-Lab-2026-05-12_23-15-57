// COAST & ISLANDS: one prop model through the zone's real loader (zoneView loadMasters) on a NullEngine, no browser: the masters'
// vertex counts, bounds, materials and state. Run from FEL-full-app:  npx tsx scripts/probes/coast-islands/props-headless.ts
import { NullEngine, Scene, Matrix } from '@babylonjs/core';
import fs from 'node:fs';
import { loadMasters } from '../../../lib/adventure/coast/zoneView';
import { PROP_MODELS } from '../../../lib/adventure/coast/zoneLayout';
const engine = new NullEngine(); const scene = new Scene(engine);
const m = PROP_MODELS[0];
const b64 = fs.readFileSync(`public/models/props/nature/${m.file}`).toString('base64');
void (async () => { const masters = await loadMasters(scene, m, 'data:;base64,' + b64);
for (const x of masters) {
  x.refreshBoundingInfo();
  const bb = x.getBoundingInfo().boundingBox;
  console.log(x.name, 'verts', x.getTotalVertices(), 'enabled', x.isEnabled(), 'parent', x.parent?.name, 'mat', x.material?.name, 'disposedMat', x.material?.isFrozen, 'min', bb.minimum.asArray().map((v) => v.toFixed(2)), 'max', bb.maximum.asArray().map((v) => v.toFixed(2)), 'pos', x.position.asArray(), 'scale', x.scaling.asArray(), 'visible', x.isVisible, 'vis', x.visibility, 'disposed', x.isDisposed());
}
console.log('scene meshes', scene.meshes.map((x) => x.name));
})();
