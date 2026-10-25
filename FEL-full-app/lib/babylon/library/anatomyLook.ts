// The muscle view on the athlete's own body (LIBRARY-ANATOMY, 2026-10-25) — the Babylon half of lib/library/anatomy.ts.
//
// The library stage spawns the player's body (CharacterLibrary.spawn, the account's body and look). For the muscle view
// this module, on that same body:
//   · hides everything but the skin (garments, hair, eyes) and puts back the skin the body mask hid under the garments
//     (bodyMask keeps the full index list in metadata.felBodyIndices0);
//   · swaps the skin's material for a plain lit one that shows vertex colours, and writes the colours: the slate body,
//     the exercise's secondary muscles light, its primary muscles strong (anatomy.ts anatomyColors);
//   · gives every one of those back on restore(), so switching to the demo shows the athlete as they dressed.
// The chart and the per-muscle weights are measured once per body geometry (cached; the kit bodies share theirs) — on
// the kit body that is 14,517 vertices, ~90 ms on a desktop core the first time and a lookup after.
import type { AbstractMesh, Material, Mesh, Scene, TransformNode } from '@babylonjs/core';
import { StandardMaterial, Color3, VertexBuffer } from '@babylonjs/core';
import { bodyMeshOf } from '../creator/shape/renderShape';
import { geometryKey, restJoints, restSkin } from '../creator/paint/surfaceMap';
import { buildBodyChart, classify, type BodyChart, type Classified } from '../creator/paint/bodyChart';
import { anatomyColors, muscleWeights } from '@/lib/library/anatomy';

interface Measured { chart: BodyChart; cls: Classified; weights: Map<string, Float32Array> }
const measured = new Map<string, Measured | null>();

/** The body's chart and classification (cached by geometry). null when the body has no skin weights to read. */
export function measureBody(body: Mesh): Measured | null {
  const key = geometryKey(body);
  if (measured.has(key)) return measured.get(key) ?? null;
  const skin = body.skeleton ? restSkin(body) : null;
  const chart = skin && body.skeleton ? buildBodyChart(restJoints(body.skeleton), skin) : null;
  const m = skin && chart ? { chart, cls: classify(chart, skin), weights: new Map<string, Float32Array>() } : null;
  measured.set(key, m);
  return m;
}

/** One muscle's per-vertex weights on a measured body (cached). */
export function weightsOf(m: Measured, key: string): Float32Array {
  let w = m.weights.get(key);
  if (!w) { w = muscleWeights(key, m.cls, m.chart.extent); m.weights.set(key, w); }
  return w;
}

export interface AnatomyHandle {
  body: Mesh;
  /** recolour for another exercise */
  show(map: { primary: readonly string[]; secondary: readonly string[] }): void;
  /** put the athlete back as they were */
  restore(): void;
}

/** Turn a spawned body into the muscle view. null when its body cannot be measured (no skinned body mesh). */
export function applyAnatomy(scene: Scene, spawned: { root: TransformNode; meshes: AbstractMesh[] }, map: { primary: readonly string[]; secondary: readonly string[] }): AnatomyHandle | null {
  const all = [...new Set([...spawned.meshes, ...spawned.root.getChildMeshes(false)])];
  const body = bodyMeshOf(all);
  if (!body) return null;
  const m = measureBody(body);
  if (!m) return null;

  // what we change, to give back
  const hidden: AbstractMesh[] = [];
  for (const mesh of all) if (mesh !== body && mesh.isEnabled() && mesh.getTotalVertices() > 0) { mesh.setEnabled(false); hidden.push(mesh); }
  const material: Material | null = body.material;
  const indices = body.getIndices();
  const full = (body.metadata as { felBodyIndices0?: ArrayLike<number> } | null | undefined)?.felBodyIndices0;
  if (full && indices && full.length !== indices.length) body.setIndices(Array.from(full));
  const hadColors = body.isVerticesDataPresent(VertexBuffer.ColorKind) ? body.getVerticesData(VertexBuffer.ColorKind) : null;
  const usedColors = body.useVertexColors;

  const mat = new StandardMaterial('felAnatomy', scene);
  mat.diffuseColor = Color3.White();
  mat.specularColor = new Color3(0.08, 0.08, 0.08);
  mat.emissiveColor = new Color3(0.16, 0.16, 0.17);   // a floor: the back of the body never goes black on a dark stage
  mat.backFaceCulling = true;
  body.material = mat;
  body.useVertexColors = true;
  body.hasVertexAlpha = false;

  const n = body.getTotalVertices();
  const show = (mp: { primary: readonly string[]; secondary: readonly string[] }) => {
    body.setVerticesData(VertexBuffer.ColorKind, anatomyColors(n, mp, (k) => weightsOf(m, k)), true, 4);
  };
  show(map);

  return {
    body,
    show,
    restore() {
      if (body.isDisposed()) { mat.dispose(); return; }
      body.material = material;
      if (indices && full && full.length !== indices.length) body.setIndices(Array.from(indices));
      if (hadColors) body.setVerticesData(VertexBuffer.ColorKind, hadColors, true, 4);
      else body.removeVerticesData(VertexBuffer.ColorKind);
      body.useVertexColors = usedColors;
      for (const mesh of hidden) if (!mesh.isDisposed()) mesh.setEnabled(true);
      mat.dispose();
    },
  };
}

/** Tests and probes: forget every measured body. */
export function clearAnatomyCache(): void { measured.clear(); }
