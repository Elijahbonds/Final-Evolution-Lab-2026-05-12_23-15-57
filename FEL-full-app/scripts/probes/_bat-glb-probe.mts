// BAT-GRIP probe (2026-11-03): where does bat.glb's THIN end (the handle) land once it is loaded the way the game loads
// it (glTF → Babylon, __root__ and all) and dressed by batGlbFit the way dressBatGlb does?
// Run: npx tsx scripts/probes/_bat-glb-probe.mts
import { readFileSync } from 'node:fs';
import { NullEngine, Scene, SceneLoader, TransformNode, Vector3, VertexBuffer, Quaternion, MeshBuilder, FreeCamera } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import * as Bat from '../../lib/babylon/modes/baseballBat';
const { batGlbFit, BAT_GLB_HANDLE, BAT_GLB_BARREL, BAT_LEN } = ((Bat as unknown as { default?: typeof Bat }).default ?? Bat) as typeof Bat;

const scene = new Scene(new NullEngine());
new FreeCamera('c', new Vector3(0, 0, -5), scene);
const data = readFileSync('public/models/meshy/bat.glb');
const c = await SceneLoader.LoadAssetContainerAsync('data:;base64,', data.toString('base64'), scene, null, '.glb');
c.addAllToScene();

/** All vertices in world space under `top`. */
function worldVerts(): Vector3[] {
  const out: Vector3[] = [];
  for (const m of scene.meshes) {
    const pos = m.getVerticesData(VertexBuffer.PositionKind);
    if (!pos) continue;
    m.computeWorldMatrix(true);
    const w = m.getWorldMatrix();
    for (let i = 0; i < pos.length; i += 3) out.push(Vector3.TransformCoordinates(new Vector3(pos[i], pos[i + 1], pos[i + 2]), w));
  }
  return out;
}
/** Thin end vs thick end along an axis: mean radius in the first and last 25 % of the length. */
function ends(vs: Vector3[], axis: Vector3) {
  const a = axis.normalizeToNew();
  const c0 = vs.reduce((s, v) => s.addInPlace(v), new Vector3()).scaleInPlace(1 / vs.length);
  const ts = vs.map((v) => Vector3.Dot(v.subtract(c0), a));
  const lo = Math.min(...ts), hi = Math.max(...ts), L = hi - lo;
  const rad = (from: number, to: number) => {
    const sel = vs.filter((_, i) => ts[i] >= lo + from * L && ts[i] <= lo + to * L);
    const r = sel.map((v) => { const d = v.subtract(c0); return d.subtract(a.scale(Vector3.Dot(d, a))).length(); });
    return r.reduce((s, x) => s + x, 0) / Math.max(1, r.length);
  };
  const near = rad(0.05, 0.30), far = rad(0.70, 0.95);
  const pLo = c0.add(a.scale(lo)), pHi = c0.add(a.scale(hi));
  return { L, rLo: near, rHi: far, thin: near < far ? pLo : pHi, thick: near < far ? pHi : pLo };
}
const fmt = (v: Vector3) => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;

// 1) as loaded (the __root__ node's glTF→Babylon conversion included), along the measured axis and its mirror
const raw = worldVerts();
for (const ax of [new Vector3(0.80, 0.34, 0), new Vector3(-0.80, 0.34, 0)]) {
  const e = ends(raw, ax);
  console.log(`loaded, axis ${fmt(ax)}: length ${e.L.toFixed(3)}  r(low end) ${e.rLo.toFixed(4)}  r(high end) ${e.rHi.toFixed(4)}  thin end ${fmt(e.thin)}  thick end ${fmt(e.thick)}`);
}
const root = scene.transformNodes.find((n) => n.name === '__root__') ?? scene.meshes.find((m) => m.name === '__root__');
console.log('__root__:', root ? `rotQ ${root.rotationQuaternion?.toString()} scaling ${fmt(root.scaling)}` : 'none');

// 2) dressed as dressBatGlb dresses it: the model under a wrapper at the handle end, rotZ / scale / offsetY from batGlbFit
const model = new TransformNode('model', scene);
for (const n of c.rootNodes) n.parent = model;
const outer = new TransformNode('outer', scene);
outer.rotationQuaternion = Quaternion.Identity();
const fit = batGlbFit(BAT_GLB_HANDLE, BAT_GLB_BARREL, BAT_LEN);
model.rotation.set(0, 0, fit.rotZ); model.scaling.setAll(fit.scale); model.position.set(0, fit.offsetY, 0); model.parent = outer;
const e2 = ends(worldVerts(), new Vector3(0, 1, 0));
console.log(`dressed (wrapper at origin, barrel meant along +Y): thin end ${fmt(e2.thin)}  thick end ${fmt(e2.thick)}  r ${e2.rLo.toFixed(4)} / ${e2.rHi.toFixed(4)}`);
console.log(`=> handle ${e2.thin.y < e2.thick.y ? 'AT the wrapper origin (correct)' : 'OUT along +Y — the bat is UPSIDE DOWN'}`);
void MeshBuilder;
