// RENDER PARTS — a CreatorDoc's parts on a body (IMPROVE (2026-10-06), docs/CREATOR-PLAN.md phase 2).
//
// Called by the Creator hook (core/creatorLook.applyCreatorLayers), so parts show in every mode that applies the
// player's identity, in the Closet preview and in the Athlete Creator's.
//
// TWO-TONE (phase 4c, 2026-10-06): a part with a second colour is its shape cut crisply along a split or a band
// (twoTone.ts), the second colour riding in the same vertex colours: still one mesh per (bone, finish), no new material.
//
// BENDABLE (phase 4c): a cape strip, hair strand or tail segment with `swing` above 0 is skinned to a short bone chain of
// its own that follows the body with a cheap fixed-step spring (swing.ts): one skeleton per body, one skinned mesh per
// finish for all of them (the same part materials), rebuilt only when a bendable part changes.
//
// DRAW CALLS. Parts are merged: every part on the same bone with the same material is baked into ONE mesh parented to
// that bone's node, so it rides the animation with no per-frame work and costs one draw. A part's COLOUR rides in the
// mesh's vertex colours, so the material is the FINISH alone (matte, gloss, metal, glow): ten spikes in five colours on
// the head are one draw, a mirrored pair of pads is two (two bones), and a body never owns more than four part
// materials, cached per body by their input (the finish). Measured on the kit body (renderParts.test.ts): a 64-part
// build in four colours over seven bones went from +49 draws / +13 materials (keyed by colour + finish) to +18 / +4.
//
// INSTANT EDITS. `syncParts` is a diff, not a rebuild: a group whose parts did not change keeps its mesh; a changed
// group re-bakes its own vertices into its existing mesh; an emptied group and an unused material are disposed. A
// slider drag on one part re-bakes one group.
//
// COSMETIC ONLY. Never pickable, never colliding, no physics, no shadow casting, not added to `spawn.meshes` (which modes
// read for hit tests and material passes), tagged `metadata.felCreatorPart`. Nothing here reads or writes a gameplay
// number. Everything is disposed when the body's root is, and on `clearParts`.

import { Color3, Mesh, PBRMaterial, VertexData } from '@babylonjs/core';
import type { Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { boneNode } from '../../anim/boneLookup';
import { isSwingShape, type CreatorPart, type Finish, type PartBone } from '../../../creator/look/doc';
import { PART_BUDGET, renderList } from '../../../creator/look/parts';
import { append, bake, emptyGeo, pack, type Geo } from './geometry';
import { nodeMatrix } from './placement';
import { rigFrames } from './rigFrames';
import { shapeGeo, swingGeo } from './shapes';
import { cutToned, tonedGeo, type ToneSpec } from './twoTone';
import { buildSwingRig, disposeSwingRig, type SwingRig } from './swing';

export interface PartsSummary {
  /** parts the doc asked for (entries) */
  asked: number;
  /** rendered copies (mirrors count), after the budget */
  drawn: number;
  /** merged meshes = draw calls the parts add */
  meshes: number;
  /** materials the parts own on this body */
  materials: number;
  /** copies that could not be placed (a rig without that bone) */
  skipped: number;
}

interface Group { mesh: Mesh; sig: string; mat: Finish }
interface BodyParts { groups: Map<string, Group>; mats: Map<Finish, PBRMaterial>; hooked: boolean; swing: { sig: string; rig: SwingRig } | null }

const bodies = new WeakMap<TransformNode, BodyParts>();
const HEX = /^#[0-9A-F]{6}$/i;

/** One material per finish per body; the colour is the vertices' (white albedo × vertex colour). */
function partMaterial(scene: Scene, name: string, finish: Finish): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = Color3.White();
  switch (finish) {
    case 'gloss': m.metallic = 0; m.roughness = 0.2; break;
    case 'metal': m.metallic = 0.9; m.roughness = 0.32; break;
    // glow: unlit, so the colour shows at full strength whatever the light (a lit "emissive" would need a uniform per colour)
    case 'glow': m.metallic = 0; m.roughness = 1; m.unlit = true; break;
    default: m.metallic = 0; m.roughness = 0.85; break;
  }
  m.metadata = { felCreatorPart: true };
  return m;
}

/** '#RRGGBB' → linear-free 0..1 RGB, the same reading albedoColor gives a hex everywhere else in the identity pipe. */
function rgb(hex: string): [number, number, number] {
  const c = Color3.FromHexString(HEX.test(hex) ? hex.toUpperCase() : '#FFFFFF');
  return [c.r, c.g, c.b];
}

/** A part's two-tone spec, defaults filled in (doc.ts: split along y at the middle; a band 0.2 wide). */
export function toneSpec(p: Pick<CreatorPart, 'tone' | 'toneAxis' | 'toneAt' | 'toneWidth'>): ToneSpec {
  return { kind: p.tone ?? 'split', axis: p.toneAxis ?? 'y', at: p.toneAt ?? 0.5, width: p.toneWidth ?? 0.2 };
}
/** What of a part's two-tone changes its bake (empty for a one-colour part, so a phase 2 group's signature is unchanged). */
/** A bendable part's own geometry cut for its two-tone (the cape strip's denser swing version is not the cached shape). */
const tonedGeoOf = (g: Geo, p: CreatorPart) => (g === shapeGeo(p.shape) ? tonedGeo(p.shape, toneSpec(p)) : cutToned(g, toneSpec(p), p.shape));
const toneSig = (p: CreatorPart): unknown[] => (p.colour2 ? [p.colour2, p.tone, p.toneAxis, p.toneAt, p.toneWidth] : []);

function release(root: TransformNode, s: BodyParts): void {
  if (s.swing) { disposeSwingRig(s.swing.rig); s.swing = null; }
  for (const g of s.groups.values()) g.mesh.dispose(false, false);
  for (const m of s.mats.values()) m.dispose(false, true);
  s.groups.clear(); s.mats.clear();
  bodies.delete(root);
}

/** Dispose every part mesh and part material on this body. */
export function clearParts(root: TransformNode): void {
  const s = bodies.get(root);
  if (s) release(root, s);
  stamp(root, null);
}

/**
 * Make the body wear exactly `parts` (within PART_BUDGET, mirrors counted) plus `worn` (store items that render as parts,
 * e.g. the Nexus Visor; outside the player's budget). Idempotent; only changed groups are rebuilt.
 */
export function syncParts(spawn: { root: TransformNode; skeleton: Skeleton }, parts: readonly CreatorPart[], worn: readonly CreatorPart[] = []): PartsSummary {
  const { root, skeleton } = spawn;
  const summary: PartsSummary = { asked: parts.length, drawn: 0, meshes: 0, materials: 0, skipped: 0 };
  if (root.isDisposed()) return summary;
  const scene = root.getScene();
  const list = [...renderList(worn, worn.length * 2), ...renderList(parts, PART_BUDGET)];
  let s = bodies.get(root);
  if (!list.length && !s) { stamp(root, summary); return summary; }
  if (!s) { s = { groups: new Map(), mats: new Map(), hooked: false, swing: null }; bodies.set(root, s); }
  if (!s.hooked) { s.hooked = true; root.onDisposeObservable.addOnce(() => { const b = bodies.get(root); if (b) release(root, b); }); }

  const frames = list.length ? rigFrames(skeleton, root) : null;
  // group by (bone, material): the bake inputs are the group's signature
  const want = new Map<string, { bone: PartBone; mat: Finish; items: { part: CreatorPart; mirrored: boolean }[] }>();
  // phase 4c: bendable parts (a swing shape with swing > 0) go to the body's swing rig instead (parts/swing.ts)
  const swingList: { part: CreatorPart; mirrored: boolean }[] = [];
  for (const it of list) {
    const bone = it.mirrored ? null : it.part.bone;
    const placed = frames ? nodeMatrix(it.part, frames, it.mirrored) : null;
    const b = placed?.bone ?? bone;
    if (!placed || !b || !boneNode(skeleton, b)) { summary.skipped++; continue; }
    if (isSwingShape(it.part.shape) && (it.part.swing ?? 0) > 0) { swingList.push(it); summary.drawn++; continue; }
    const mat = it.part.finish;
    const key = `${b}|${mat}`;
    let g = want.get(key);
    if (!g) { g = { bone: b, mat, items: [] }; want.set(key, g); }
    g.items.push(it);
    summary.drawn++;
  }

  for (const [key, g] of s.groups) {
    if (!want.has(key) && !key.startsWith('swing|')) { g.mesh.dispose(false, false); s.groups.delete(key); }
  }
  syncSwingParts(s, root, skeleton, frames, swingList, scene);
  for (const [key, w] of want) {
    const sig = JSON.stringify(w.items.map(({ part, mirrored }) => [part.shape, part.bone, part.pos, part.rot, part.scale, part.colour, mirrored, ...toneSig(part)]));
    const have = s.groups.get(key);
    if (have && have.sig === sig) continue;
    let mat = s.mats.get(w.mat);
    if (!mat) { mat = partMaterial(scene, `cpartmat_${root.uniqueId}_${w.mat}`, w.mat); s.mats.set(w.mat, mat); }
    const geo = emptyGeo();
    const colours: number[] = [];
    for (const { part, mirrored } of w.items) {
      const placed = nodeMatrix(part, frames!, mirrored)!;
      // phase 4c: a two-tone part is its shape cut along the split / band (twoTone.ts, cached by its inputs), each
      // vertex carrying the colour of its side
      const toned = part.colour2 ? tonedGeo(part.shape, toneSpec(part)) : null;
      const g = bake(toned ? toned.geo : shapeGeo(part.shape), placed.m);
      append(geo, g);
      const [r, gr, b] = rgb(part.colour);
      const [r2, g2, b2] = part.colour2 ? rgb(part.colour2) : [r, gr, b];
      for (let i = 0; i < g.positions.length / 3; i++) {
        if (toned?.second[i]) colours.push(r2, g2, b2, 1); else colours.push(r, gr, b, 1);
      }
    }
    const packed = pack(geo);
    const vd = new VertexData();
    vd.positions = packed.positions; vd.normals = packed.normals; vd.indices = packed.indices; vd.colors = Float32Array.from(colours);
    let mesh = have?.mesh;
    if (!mesh) {
      mesh = new Mesh(`cpart_${root.uniqueId}_${key}`, scene);
      mesh.parent = boneNode(skeleton, w.bone);
      mesh.isPickable = false;
      mesh.checkCollisions = false;
      mesh.receiveShadows = false;
      mesh.doNotSerialize = true;
      mesh.metadata = { felCreatorPart: true };
      mesh.hasVertexAlpha = false;
    }
    vd.applyToMesh(mesh, false);
    mesh.material = mat;
    s.groups.set(key, { mesh, sig, mat: w.mat });
  }
  // materials no group uses any more
  const used = new Set([...s.groups.values()].map((g) => g.mat));
  for (const [k, m] of s.mats) if (!used.has(k)) { m.dispose(false, true); s.mats.delete(k); }

  summary.meshes = s.groups.size;
  summary.materials = s.mats.size;
  stamp(root, summary);
  return summary;
}

/** Phase 4c: the body's bendable parts — rebuilt (skeleton and meshes, one per finish) only when one of them changed. */
function syncSwingParts(s: BodyParts, root: TransformNode, skeleton: Skeleton, frames: ReturnType<typeof rigFrames>, list: { part: CreatorPart; mirrored: boolean }[], scene: Scene): void {
  const sig = list.length ? JSON.stringify(list.map(({ part, mirrored }) => [part, mirrored])) : '';
  if (s.swing?.sig === sig || (!s.swing && !sig)) return;
  if (s.swing) { disposeSwingRig(s.swing.rig); s.swing = null; root.metadata = { ...(root.metadata ?? {}), felSwingRig: null }; }
  for (const [key, g] of s.groups) if (key.startsWith('swing|')) { g.mesh.dispose(false, false); s.groups.delete(key); }
  if (!list.length || !frames) return;
  const items = list.map(({ part, mirrored }) => {
    const placed = nodeMatrix(part, frames, mirrored)!;
    const toned = part.colour2 ? tonedGeoOf(swingGeo(part.shape), part) : null;
    const geo = toned ? toned.geo : swingGeo(part.shape);
    const [r, g, b] = rgb(part.colour), [r2, g2, b2] = part.colour2 ? rgb(part.colour2) : [r, g, b];
    const colours: number[] = [];
    for (let i = 0; i < geo.positions.length / 3; i++) { if (toned?.second[i]) colours.push(r2, g2, b2, 1); else colours.push(r, g, b, 1); }
    // the chain's frame is the placement at scale 1 (the swing's angles are true angles); its scale goes in the vertices
    const unit = nodeMatrix({ ...part, scale: [1, 1, 1] }, frames, mirrored)!;
    return { part, mirrored, m: unit.m, node: boneNode(skeleton, placed.bone)!, restNode: frames.restInv.get(placed.bone)!.clone().invert(), geo, colours };
  });
  const mat = (f: Finish) => {
    let m = s.mats.get(f);
    if (!m) { m = partMaterial(scene, `cpartmat_${root.uniqueId}_${f}`, f); s.mats.set(f, m); }
    return m;
  };
  const { rig, meshes } = buildSwingRig(root, items, mat, `cswing_${root.uniqueId}`);
  for (const [f, mesh] of meshes) s.groups.set(`swing|${f}`, { mesh, sig, mat: f });
  s.swing = { sig, rig };
  root.metadata = { ...(root.metadata ?? {}), felSwingRig: rig };   // probes and tests
}

/** What the parts made on this body (probes and tests). */
export function partsOn(root: TransformNode): { meshes: Mesh[]; materials: PBRMaterial[] } {
  const s = bodies.get(root);
  return { meshes: s ? [...s.groups.values()].map((g) => g.mesh) : [], materials: s ? [...s.mats.values()] : [] };
}

function stamp(root: TransformNode, v: PartsSummary | null): void {
  root.metadata = { ...(root.metadata ?? {}), felParts: v };
}
