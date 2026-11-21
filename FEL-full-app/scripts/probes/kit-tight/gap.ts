// KIT-TIGHT (owner 2026-11-18: "make the clothes appear skin tight and not baggy ... right now it looks poofy"): how far each
// worn garment stands off the skin, by body region, in centimetres — headless (NullEngine), the real kit / mask / fit code.
// Stages: FILE = the garment as the file holds it (skinned at rest, before any runtime fix); DRAWN = after applyKit (the lift) and
// maskBodyNow (the waistband fit, the edge flare), with the Creator shape (girth) applied the way the GPU does.
// Only the garment's OUTWARD surface counts (its normal agrees with the skin's): the inner wall of a shell is not what is seen.
//   npx tsx scripts/probes/kit-tight/gap.ts <male|female|file:<glb>> [girth]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NullEngine, Scene, ArcRotateCamera, Vector3, SceneLoader } from '@babylonjs/core';
import type { AbstractMesh, Mesh, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { applyKit } from '../../../lib/babylon/core/kit';
import { skinnedWorld, maskBodyNow, isBodyMesh, maskSlotOf } from '../../../lib/babylon/core/bodyMask';
import { syncShape } from '../../../lib/babylon/creator/shape/renderShape';
import type { CreatorDoc } from '../../../lib/creator/look/doc';
import { setFeelOverride, setFeelSession, setFeelUser } from '../../../lib/feel-panel/feel';
import { BodySurface } from '../../avatar/kit-fit/surface';

const ROOT = resolve(__dirname, '../../..');
const files: Record<string, string> = { male: 'public/models/candidates/fel-kit-male.glb', female: 'public/models/candidates/fel-kit-female.glb' };
const GIRTH = (v: number) => ({ head: v, neck: v, chest: v, belly: v, upperArms: v, forearms: v, thighs: v, calves: v });

/** World positions and normals with the morph targets applied first (the GPU's order). */
function posed(m: Mesh, override?: Float32Array): { P: Float32Array; N: Float32Array } {
  const base = override ?? m.getVerticesData('position')!, mgr = override ? null : m.morphTargetManager;
  let src: ArrayLike<number> = base;
  if (mgr && mgr.numTargets) {
    const P = Float32Array.from(base);
    for (let t = 0; t < mgr.numTargets; t++) { const tg = mgr.getTarget(t); const tp = tg.getPositions(); if (!(tg.influence > 0) || !tp) continue; for (let i = 0; i < P.length; i++) P[i] += tg.influence * (tp[i] - base[i]); }
    src = P;
  }
  const w = skinnedWorld(m, src)!;   // its normals: the mesh's own, skinned (a cross product here comes out inverted: the loader flips handedness)
  return { P: w.P, N: w.N };
}

/** The body region a skin point belongs to, by its nearest body vertex's heaviest bone. */
function regionOf(bone: string, slot: string): string {
  if (/Arm|Shoulder/.test(bone)) return slot === 'tops' ? 'shoulder / sleeve' : 'other';
  if (/Spine2|Neck/.test(bone)) return 'chest / upper back';
  if (/Spine1|Spine$/.test(bone)) return 'belly / lower back';
  if (/Hips/.test(bone)) return slot === 'tops' ? 'hem over hips' : 'waist / seat';
  if (/UpLeg/.test(bone)) return 'thigh';
  return 'other';
}

export interface GapRow { slot: string; mesh: string; region: string; n: number; median: number; p90: number }

function gaps(body: Mesh, garments: Mesh[], override?: Map<Mesh, Float32Array>): GapRow[] {
  const B = posed(body), bi = body.getIndices()!, ind = Uint32Array.from(bi);
  const surf = new BodySurface(B.P, B.N, ind);
  const mi = body.getVerticesData('matricesIndices')!, mw = body.getVerticesData('matricesWeights')!, bones = body.skeleton!.bones;
  const boneOf = (v: number) => { let best = 0; for (let k = 1; k < 4; k++) if (mw[v * 4 + k] > mw[v * 4 + best]) best = k; return bones[mi[v * 4 + best]]?.name ?? ''; };
  // nearest body vertex for the region (a coarse 3 cm grid)
  const G = 0.03, grid = new Map<string, number[]>();
  for (let v = 0; v < B.P.length / 3; v++) { const k = `${Math.floor(B.P[v * 3] / G)},${Math.floor(B.P[v * 3 + 1] / G)},${Math.floor(B.P[v * 3 + 2] / G)}`; (grid.get(k) ?? grid.set(k, []).get(k)!).push(v); }
  const nearestV = (x: number, y: number, z: number) => { let best = -1, bd = 1e9; const gx = Math.floor(x / G), gy = Math.floor(y / G), gz = Math.floor(z / G); for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) for (const v of grid.get(`${gx + i},${gy + j},${gz + k}`) ?? []) { const d = (B.P[v * 3] - x) ** 2 + (B.P[v * 3 + 1] - y) ** 2 + (B.P[v * 3 + 2] - z) ** 2; if (d < bd) { bd = d; best = v; } } return best; };
  const rows: GapRow[] = [];
  for (const g of garments) {
    const slot = maskSlotOf(g.name)!; if (slot !== 'tops' && slot !== 'shorts') continue;
    if (override && !override.has(g)) continue;
    const P = posed(g, override?.get(g)), by: Record<string, number[]> = {};
    for (let v = 0; v < P.P.length / 3; v++) {
      const x = P.P[v * 3], y = P.P[v * 3 + 1], z = P.P[v * 3 + 2];
      const h = surf.closest(x, y, z, 0.2); if (!h) continue;
      if (P.N[v * 3] * h.n[0] + P.N[v * 3 + 1] * h.n[1] + P.N[v * 3 + 2] * h.n[2] < 0.2) continue;   // inner wall / folded-back face
      const nv = nearestV(x, y, z); if (nv < 0) continue;
      (by[regionOf(boneOf(nv), slot)] ??= []).push(h.signed);
    }
    for (const [region, a] of Object.entries(by)) { if (region === 'other' || a.length < 8) continue; a.sort((p, q) => p - q); rows.push({ slot, mesh: g.name.replace(/_c$/, ''), region, n: a.length, median: +(a[Math.floor(a.length / 2)] * 100).toFixed(1), p90: +(a[Math.floor(a.length * 0.9)] * 100).toFixed(1) }); }
  }
  return rows;
}

export async function measureGaps(key: string, girth = 0): Promise<{ file: GapRow[]; drawn: GapRow[] }> {
  const engine = new NullEngine(), scene = new Scene(engine);
  scene.activeCamera = new ArcRotateCamera('c', -Math.PI / 2, 1.2, 3.2, new Vector3(0, 1, 0), scene);
  scene.metadata = { felTier: 'desktop', felModeId: 'onevone' };
  const path = key.startsWith('file:') ? key.slice(5) : resolve(ROOT, files[key]);
  const c = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync(path).toString('base64')}`, scene, undefined, '.glb');
  const inst = c.instantiateModelsToScene((x) => `${x}_c`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop();
  const root = inst.rootNodes[0] as TransformNode, sk = inst.skeletons[0], meshes = root.getChildMeshes();
  scene.render();
  const body = meshes.find((m) => isBodyMesh(m.name.replace(/_c$/, '')) || /^Body/.test(m.name)) as Mesh;
  // FILE: each garment's positions as loaded, before any runtime fix (the kit may unweld a garment with no UVs: one vertex a corner)
  const snap = new Map<string, { P: Float32Array; ind: Uint32Array }>();
  for (const m of meshes) { const P = (m as Mesh).getVerticesData?.('position'), ind = (m as Mesh).getIndices?.(); if (P && ind) snap.set(m.name, { P: Float32Array.from(P), ind: Uint32Array.from(ind) }); }
  applyKit(meshes, null, 'onevone', {});
  const shown = () => root.getChildMeshes().filter((m) => maskSlotOf(m.name) && m.isEnabled() && m.isVisible && (m as Mesh).skeleton && m.getTotalVertices() > 0) as Mesh[];
  const fileOver = new Map<Mesh, Float32Array>();
  for (const m of shown()) {
    const s0 = snap.get(m.name); if (!s0) continue; const n = m.getTotalVertices();
    if (n * 3 === s0.P.length) fileOver.set(m, s0.P);
    else if (n === s0.ind.length) { const P = new Float32Array(n * 3); for (let i = 0; i < n; i++) P.set(s0.P.subarray(s0.ind[i] * 3, s0.ind[i] * 3 + 3), i * 3); fileOver.set(m, P); }
  }
  const fileRows = gaps(body, shown(), fileOver);
  const doc = girth ? ({ v: 1, parts: [], paint: [], colours: {}, shape: { face: {}, body: {}, girth: GIRTH(girth) }, flags: { suit: false } } as unknown as CreatorDoc) : null;
  if (doc) syncShape({ root, skeleton: sk, meshes: root.getChildMeshes() }, doc);
  scene.render();
  maskBodyNow(body, root.getChildMeshes() as AbstractMesh[]);
  if (doc) syncShape({ root, skeleton: sk, meshes: root.getChildMeshes() }, doc);
  scene.render();
  const drawn = gaps(body, shown());
  if (process.env.DEBUG) for (const m of shown()) console.error('DEBUG', m.name, JSON.stringify({ tight: m.metadata?.felFitTight, waist: m.metadata?.felWaistFit, flare: m.metadata?.felEdgeFlare }));
  root.dispose(); c.dispose(); scene.dispose(); engine.dispose();
  return { file: fileRows, drawn };
}

async function main(): Promise<void> {
  const [key = 'male', girth = '0'] = process.argv.slice(2);
  if (process.env.KNOBS) { setFeelUser(true); setFeelSession(null); for (const [k, v] of Object.entries(JSON.parse(process.env.KNOBS) as Record<string, number>)) setFeelOverride(k, v); }
  console.warn = () => undefined; console.info = () => undefined;
  const log = console.log; console.log = (...a: unknown[]) => { if (!/^(BJS|\[FEL-)/.test(String(a[0]))) log(...a); };
  const r = await measureGaps(key, Number(girth));
  const drawnBy = new Map(r.drawn.map((d) => [`${d.mesh}|${d.region}`, d]));
  log(`${key} girth ${girth}: gap cm, outward surface (median / p90), FILE -> DRAWN`);
  for (const f of r.file) { const d = drawnBy.get(`${f.mesh}|${f.region}`); log(`  ${f.mesh.padEnd(26)} ${f.region.padEnd(20)} ${String(f.median).padStart(5)} / ${String(f.p90).padStart(5)}  ->  ${d ? `${String(d.median).padStart(5)} / ${String(d.p90).padStart(5)}` : '   —'}`); }
  if (process.env.JSON) log(JSON.stringify(r));
}
if (require.main === module) void main();
