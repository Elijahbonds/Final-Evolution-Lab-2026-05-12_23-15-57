// bodyMerge — one body, a few meshes (lane/hoops-perf, owner 2026-11-12: "join each body into one mesh").
//
// WHY. After hoops-p08 the phone's ACTIVE MESHES were still over their rows in 3v3 (109 vs 98) and 3-Point (101 vs 93), and the
// bodies were most of it: a court body is nine or ten skinned parts (the skin, the hair, the top, the shorts, the shoe and its
// sock, the sole, two eyes), each its own mesh, so six players were ~55 of 3v3's meshes. Every active mesh costs the frustum
// pass, the active list, the world-matrix and bounding work, and its own state changes. A part is not a draw saved here (each
// part keeps its own sub-mesh, so the draws are what they were); it is a MESH saved.
//
// WHAT. Per spawned body (CharacterLibrary.spawn, every mode), the parts that can share one mesh are drawn by ONE mesh with one
// sub-mesh per part (its own material, through a MultiMaterial), on the same skeleton. Parts can share a mesh only when nothing
// the renderer decides PER MESH differs between them: the shadow maps they are in, the lights that reach them, the vertex
// attributes they carry, the morph targets they have (by name), the skeleton, the culling, the render group, the side
// orientation, the visibility and so on (`groupKeyOf`). On the phone a court body comes out as 3–4 meshes (the skin with its
// face morphs alone; the casting clothes and hair; the eyes and the sole; the sock).
//
// IT MUST LOOK IDENTICAL — HOW THAT IS HELD, NOT HOPED:
//   * The parts are NOT disposed or changed. They stay where they are, wear what they wear and keep every observer, list and
//     reference any mode holds; while merged they are only taken out of the camera's pass (layerMask 0 — nothing in this app
//     uses layerMask) and out of the render-target lists they were in (the shadow maps, the floor mirror), and the merged mesh
//     is put in their place. Unmerged, all of it is put back exactly.
//   * SAME SHADER, MEASURED: a merged mesh is swapped in only once each of its sub-meshes has compiled to the SAME effect object
//     its part draws with (Babylon caches effects by their defines, so the same object is the same shader with the same
//     defines: lights, shadows, bones, morphs, attributes). Anything else and the parts keep drawing.
//   * SAME ORDER: Babylon sorts opaque and alpha-tested sub-meshes by their MESH's material id (RenderingGroup.PainterSortCompare);
//     a merged mesh's material is the MultiMaterial, which would move its parts in the draw order — and the ink hull's depth
//     makes draw order visible on a body (bodyMask.ts). `bodyAwarePainterCompare` sorts a merged sub-mesh by its PART's
//     material and id, and every other sub-mesh exactly as PainterSortCompare does.
//   * SAME INK: the outline renderer reads `renderOutline` / `outlineWidth` / `outlineColor` off the mesh per sub-mesh draw;
//     the merged mesh sets them from that sub-mesh's part just before each draw (the distance ink sets each part's own width).
//   * SAME CULLING: each sub-mesh carries its part's bounding box, so it is culled exactly when the part would have been.
//   * ANY CHANGE UNMERGES. Every frame, before the active meshes are picked, each merged body is checked against what it was
//     built from (per part: material, visibility, enabled, geometry and index buffers, morph manager and influences, skeleton,
//     bounds, parent and world, shadow and light lists, observers, …). A kit swap, a tint, the body mask re-fitting, a creator
//     shape, a fade — anything — puts the parts back THAT frame, and the body is merged again once it has held still for
//     BODY_MERGE_SETTLE_FRAMES. A part with a pending onBeforeRender (garmentFixes' late fold) is never hidden.
//
// `perf.bodyMergeOn` (1 on, every tier; 0 = nothing is merged and nothing is installed, as before).
import { BoundingInfo, Matrix, Mesh, MorphTarget, MorphTargetManager, MultiMaterial, SubMesh, Vector3, VertexBuffer } from '@babylonjs/core';
import type { AbstractMesh, Material, Node, Nullable, Observer, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { feel } from '@/lib/feel-panel/feel';

/** perf.bodyMergeOn: 1 = a body's parts are drawn by as few meshes as the renderer allows (new); 0 = one mesh per part, as before. */
export const BODY_MERGE_ON = 1;
/** Frames a body must hold still (nothing structural changing) before it is merged — or merged again after a change. */
export const BODY_MERGE_SETTLE_FRAMES = 12;
/** Frames a built merge may wait for its shaders before it is given up (the parts keep drawing; rebuilt on the next change). */
export const BODY_MERGE_READY_FRAMES = 240;
/** A merged mesh's name starts `__` so the light rig's caster classifier, which skips `__` names, never sees it. */
export const MERGED_PREFIX = '__felBody_';
/** Babylon's default layer mask (nothing in this app sets another). */
const DEFAULT_LAYER_MASK = 0x0fffffff;

// ── the pure part: which parts can share one mesh ─────────────────────────────────────────────────────────────────────
/** What the renderer decides per MESH about a part — two parts with equal facts can be drawn by one mesh. */
export interface PartFacts {
  /** Every field must be equal for two parts to share a mesh; the strings and numbers below are joined into the key. */
  skeleton: number; kinds: string; morph: string; casters: string; lights: string; layers: string;
  receiveShadows: boolean; renderingGroupId: number; alphaIndex: number; layerMask: number; sideOrientation: number;
  overrideSide: number; hasVertexAlpha: boolean; useVertexColors: boolean; numBoneInfluencers: number; bonesOnGpu: boolean;
  culling: number; alwaysActive: boolean; applyFog: boolean; infiniteDistance: boolean; billboard: number; visibility: number;
  /** the index buffer's width (a shader define: VERTEX_PULLING_INDEX_BUFFER_32BITS) */
  idx32: boolean;
}
/** The grouping key: parts with the same key can share one mesh. Pure. */
export function groupKeyOf(f: PartFacts): string {
  return [f.skeleton, f.kinds, f.morph, f.casters, f.lights, f.layers, f.receiveShadows ? 1 : 0, f.renderingGroupId, f.alphaIndex, f.layerMask,
    f.sideOrientation, f.overrideSide, f.hasVertexAlpha ? 1 : 0, f.useVertexColors ? 1 : 0, f.numBoneInfluencers, f.bonesOnGpu ? 1 : 0, f.culling,
    f.alwaysActive ? 1 : 0, f.applyFog ? 1 : 0, f.infiniteDistance ? 1 : 0, f.billboard, f.visibility, f.idx32 ? 32 : 16].join('|');
}
/** Pure: how many meshes a body's parts become — one per group of equal keys (a group of one is the part itself). */
export function meshesAfterMerge(keys: readonly string[], on = BODY_MERGE_ON): number {
  return on >= 0.5 ? new Set(keys).size : keys.length;
}

// ── the runtime ───────────────────────────────────────────────────────────────────────────────────────────────────────
type AnyMesh = Mesh & { _felMergeHidden?: boolean };
interface PartRec { mesh: AnyMesh; sig: Float64Array; layerMask: number }
interface Group {
  parts: PartRec[];
  merged: Mesh;
  multi: MultiMaterial;
  morph: MorphTargetManager | null;
  /** The render-target lists (shadow maps and others) the parts were in when swapped, to put back. */
  shadowGens: ShadowGenLike[];
  rttLists: AbstractMesh[][];
  swapped: boolean;
  waited: number;
}
interface ShadowGenLike { addShadowCaster(m: AbstractMesh, d?: boolean): unknown; removeShadowCaster(m: AbstractMesh, d?: boolean): unknown; getShadowMap(): { renderList: Nullable<AbstractMesh[]> } | null }
interface Body {
  root: TransformNode; skeleton: Skeleton;
  candidates: AnyMesh[] | null;   // the root's child meshes (null: re-read)
  groups: Group[];
  /** Pre-merge stability: the last frame's signature of every candidate and how many frames it has held. */
  lastSig: Float64Array; stable: number;
  /** A merge was built (or found nothing to build, or gave up) for the state that has held since: wait for a change. */
  built: boolean;
  /** For the probes: the last signature field that changed (part name : field) and what the last build found. */
  lastChange: string; lastBuild: string;
  /** Groups a change took apart, kept built (hidden, out of every list): when the body settles back into the same state — a part
   *  hidden and shown again, a fade and back — the merged mesh is taken up again instead of being rebuilt (no new vertex arrays). */
  parked: Group[];
  disposed: boolean;
}
interface SceneReg {
  bodies: Body[];
  obs: Nullable<Observer<Scene>>;
  /** scene.meshes.length at the last frame (a change re-reads the bodies' parts). */
  meshCount: number;
  added: Nullable<Observer<AbstractMesh>>;
  sortInstalled: boolean;
  forced: 'auto' | 'off';
  /** For the probes: merged meshes built, groups dissolved by a change (and the last part:field that did it), given up. */
  builds: number; reused: number; dissolves: number; gaveUp: number; lastDissolve: string;
}
const regs = new WeakMap<Scene, SceneReg>();
const hidden = new WeakSet<AbstractMesh>();

// object identity → a small number (allocation only the first time an object is seen)
const ids = new WeakMap<object, number>();
let nextId = 1;
function idOf(o: unknown): number {
  if (o === null || o === undefined || (typeof o !== 'object' && typeof o !== 'function')) return 0;
  let n = ids.get(o as object);
  if (n === undefined) { n = nextId++; ids.set(o as object, n); }
  return n;
}

const KINDS = [VertexBuffer.PositionKind, VertexBuffer.NormalKind, VertexBuffer.TangentKind, VertexBuffer.UVKind, VertexBuffer.UV2Kind,
  VertexBuffer.UV3Kind, VertexBuffer.UV4Kind, VertexBuffer.ColorKind, VertexBuffer.MatricesIndicesKind, VertexBuffer.MatricesWeightsKind,
  VertexBuffer.MatricesIndicesExtraKind, VertexBuffer.MatricesWeightsExtraKind];

/** Fields of a part's signature (structural: any change unmerges). */
const SIG = 40;

const gensScratch: ShadowGenLike[] = [];
/** The scene's shadow generators (one array reused frame to frame: read it before the next call). */
function shadowGensOf(scene: Scene): ShadowGenLike[] {
  gensScratch.length = 0;
  for (let i = 0; i < scene.lights.length; i++) {
    const g = scene.lights[i].getShadowGenerator() as unknown as ShadowGenLike | null;
    if (g && gensScratch.indexOf(g) < 0) gensScratch.push(g);
  }
  return gensScratch;
}
/** Render-target lists that hold meshes explicitly (the floor mirror, custom passes) — not the shadow maps. */
function rttListsOf(scene: Scene, gens: readonly ShadowGenLike[]): AbstractMesh[][] {
  const out: AbstractMesh[][] = [];
  const shadowLists = new Set<unknown>(); for (const g of gens) { const l = g.getShadowMap()?.renderList; if (l) shadowLists.add(l); }
  for (const t of scene.textures) {
    const l = (t as { renderList?: Nullable<AbstractMesh[]> }).renderList;
    if (l && Array.isArray(l) && !shadowLists.has(l) && out.indexOf(l) < 0) out.push(l);
  }
  return out;
}
function effectLayersOf(scene: Scene): Array<{ _includedOnlyMeshes?: number[]; _excludedMeshes?: number[]; _meshes?: unknown; addIncludedOnlyMesh?(m: AbstractMesh): void; removeIncludedOnlyMesh?(m: AbstractMesh): void; addExcludedMesh?(m: AbstractMesh): void; removeExcludedMesh?(m: AbstractMesh): void; getClassName(): string }> {
  return ((scene as unknown as { effectLayers?: unknown[] }).effectLayers ?? []) as never;
}

function hasObs(o: unknown): boolean { const x = o as { hasObservers?(): boolean } | null | undefined; return !!x && typeof x.hasObservers === 'function' && x.hasObservers(); }
type DrawHooks = { _internalMeshDataInfo?: { _onBeforeRenderObservable?: unknown; _onBeforeBindObservable?: unknown; _onAfterRenderObservable?: unknown; _onBetweenPassObservable?: unknown; _onBeforeDrawObservable?: unknown } };
/** Does anything hang on this mesh's own draw (it would not fire while the part is hidden)? garmentFixes' late fold rides one. */
function hasDrawHooks(m: AbstractMesh): boolean {
  const d = (m as unknown as DrawHooks)._internalMeshDataInfo;
  return !!d && (hasObs(d._onBeforeRenderObservable) || hasObs(d._onBeforeBindObservable) || hasObs(d._onAfterRenderObservable) || hasObs(d._onBetweenPassObservable) || hasObs(d._onBeforeDrawObservable));
}

/**
 * Can a part on skeleton `s` be drawn by the body's skeleton — and with what change to its vertices? The kit bodies carry one glTF
 * skin PER PART (thirteen on the male kit, all with the same joints), and each skin's inverse bind matrices put that part in its
 * own space: measured on fel-kit-male, IBM_part = X_part × IBM_first for every bone alike (a uniform scale and an offset — the
 * exporter's normalised mesh space). So v × IBM_part × bone = (v × X_part) × IBM_first × bone: the part skins exactly the same on
 * the body's skeleton once its vertices are moved by X_part. Returns X (identity for the body's own skeleton), or null when the
 * bones read other nodes, or X is not one matrix for every bone (then the part keeps its own mesh). Cached per pair.
 */
const twins = new WeakMap<Skeleton, WeakMap<Skeleton, Matrix | null>>();
const IDENTITY = Matrix.Identity();
function twinOffset(s: Skeleton, body: Skeleton): Matrix | null {
  if (s === body) return IDENTITY;
  let m = twins.get(body); if (!m) { m = new WeakMap(); twins.set(body, m); }
  const hit = m.get(s); if (hit !== undefined) return hit;
  let x: Matrix | null = null;
  let ok = s.bones.length === body.bones.length && s.bones.length > 0 && s.useTextureToStoreBoneMatrices === body.useTextureToStoreBoneMatrices && !s.needInitialSkinMatrix && !body.needInitialSkinMatrix;
  const inv = new Matrix();
  for (let i = 0; ok && i < s.bones.length; i++) {
    const a = s.bones[i], b = body.bones[i];
    const tn = a.getTransformNode();
    if (!tn || tn !== b.getTransformNode() || a.name !== b.name) { ok = false; break; }
    b.getAbsoluteInverseBindMatrix().invertToRef(inv);
    const xi = a.getAbsoluteInverseBindMatrix().multiply(inv);
    if (!x) { x = xi; continue; }
    let scale = 1; for (let k = 0; k < 16; k++) scale = Math.max(scale, Math.abs(x.m[k]));
    for (let k = 0; k < 16; k++) if (Math.abs(xi.m[k] - x.m[k]) > 1e-5 * scale) { ok = false; break; }
  }
  const out = ok && x ? (x.isIdentity() ? IDENTITY : x) : null;
  m.set(s, out);
  return out;
}
function sameSkinning(s: Skeleton, body: Skeleton): boolean { return twinOffset(s, body) !== null; }
/** For the probes: why two skeletons are not twins. */
function twinWhy(s: Skeleton, body: Skeleton): string {
  if (sameSkinning(s, body)) return 'same';
  if (s.bones.length !== body.bones.length) return `bones ${s.bones.length}/${body.bones.length}`;
  if (s.useTextureToStoreBoneMatrices !== body.useTextureToStoreBoneMatrices) return `texture ${s.useTextureToStoreBoneMatrices}/${body.useTextureToStoreBoneMatrices}`;
  if (s.needInitialSkinMatrix || body.needInitialSkinMatrix) return 'needInitialSkinMatrix';
  for (let i = 0; i < s.bones.length; i++) {
    const a = s.bones[i], b = body.bones[i];
    if (a.name !== b.name) return `bone ${i} ${a.name}/${b.name}`;
    if (a.getTransformNode() !== b.getTransformNode()) return `bone ${a.name} node ${a.getTransformNode()?.name}/${b.getTransformNode()?.name}`;
  }
  return 'its bind space is not one matrix away';
}
function isCandidate(m: AbstractMesh, skeleton: Skeleton): m is AnyMesh {
  return m instanceof Mesh && m.getClassName() === 'Mesh' && !m.name.startsWith(MERGED_PREFIX) && !!m.skeleton && sameSkinning(m.skeleton, skeleton)
    && !(m.metadata as { felMergedBody?: boolean } | null)?.felMergedBody;
}

/** Can this part be hidden behind a merged mesh right now? (Its state is also in its signature; this is the yes/no.) */
function eligible(m: AnyMesh): boolean {
  if (m.isDisposed() || !m.isEnabled() || !m.isVisible || m.visibility <= 0 || !m.geometry) return false;
  if (m.getTotalVertices() <= 0 || m.getTotalIndices() <= 0 || m.subMeshes?.length !== 1) return false;
  if (!m.material || m.material instanceof MultiMaterial) return false;
  if (m.hasThinInstances || m.instances.length > 0 || m.hasLODLevels) return false;
  // a pending per-mesh hook (garmentFixes' late fold rides the part's first draw) fires only if the part draws
  if (hasDrawHooks(m)) return false;
  const mtm = m.morphTargetManager;
  if (mtm) for (let i = 0; i < mtm.numTargets; i++) if (!mtm.getTarget(i).hasPositions) return false;
  return true;
}

/** Write a part's structural signature into `out` at `o`. No allocation (after the first sight of each object). */
function writeSig(m: AnyMesh, gens: readonly ShadowGenLike[], out: Float64Array, o: number, expectLayerMask: number): void {
  const g = m.geometry;
  let vb = 0;
  if (g) for (let k = 0; k < KINDS.length; k++) { const b = g.getVertexBuffer(KINDS[k]); vb = (Math.imul(vb, 31) + idOf(b) + (b ? idOf(b.getData()) * 7 : 0)) | 0; }
  const mtm = m.morphTargetManager;
  let infl = 0, targets = -1;
  if (mtm) {
    targets = mtm.numTargets;
    for (let i = 0; i < mtm.numTargets; i++) {
      const t = mtm.getTarget(i);
      infl = infl * 1.618 + t.influence + i;
      // a target's data is replaced, not edited, when a shape moves (renderShape: setPositions): its arrays' identities
      targets = (Math.imul(targets, 31) + idOf(t) + idOf(t.getPositions()) * 3 + idOf(t.getNormals()) * 5 + idOf(t.getTangents()) * 7 + idOf(t.getUVs()) * 11) | 0;
    }
  }
  let cast = 0;
  for (let i = 0; i < gens.length; i++) { const l = gens[i].getShadowMap()?.renderList; if (l && l.indexOf(m) >= 0) cast |= 1 << i; }
  let lights = 0; const ls = m.lightSources; for (let i = 0; i < ls.length; i++) lights = (Math.imul(lights, 31) + idOf(ls[i])) | 0;
  const sm = m.subMeshes?.[0];
  out[o] = m.uniqueId; out[o + 1] = m.material ? m.material.uniqueId : -1; out[o + 2] = m.isVisible ? 1 : 0; out[o + 3] = m.isEnabled() ? 1 : 0;
  out[o + 4] = m.visibility; out[o + 5] = idOf(g); out[o + 6] = g ? idOf(g.getIndexBuffer()) : 0; out[o + 7] = m.getTotalIndices(); out[o + 8] = m.getTotalVertices();
  out[o + 9] = vb; out[o + 10] = idOf(mtm); out[o + 11] = targets; out[o + 12] = infl; out[o + 13] = idOf(m.skeleton);
  out[o + 14] = m.numBoneInfluencers; out[o + 15] = idOf(m.getBoundingInfo()); out[o + 16] = idOf(m.parent); out[o + 17] = m.receiveShadows ? 1 : 0;
  out[o + 18] = m.renderingGroupId; out[o + 19] = m.alphaIndex; out[o + 20] = m.hasVertexAlpha ? 1 : 0; out[o + 21] = m.useVertexColors ? 1 : 0;
  out[o + 22] = expectLayerMask < 0 ? m.layerMask : (m.layerMask === expectLayerMask ? 1 : -1); out[o + 23] = m.sideOrientation ?? -1;
  out[o + 24] = m.overrideMaterialSideOrientation ?? -1;
  out[o + 25] = hasDrawHooks(m) ? 1 : 0;
  out[o + 26] = m.subMeshes ? m.subMeshes.length : 0; out[o + 27] = sm ? sm.indexStart : -1; out[o + 28] = sm ? sm.indexCount : -1;
  out[o + 29] = sm ? sm.verticesStart : -1; out[o + 30] = sm ? sm.verticesCount : -1; out[o + 31] = cast; out[o + 32] = lights;
  out[o + 33] = m.cullingStrategy; out[o + 34] = m.alwaysSelectAsActiveMesh ? 1 : 0; out[o + 35] = m.applyFog ? 1 : 0;
  out[o + 36] = m.infiniteDistance ? 1 : 0; out[o + 37] = m.billboardMode; out[o + 38] = m.computeBonesUsingShaders ? 1 : 0;
  // the bounds' extent (refreshBoundingInfo rebuilds the same BoundingInfo object in place)
  const bi = m.getBoundingInfo(), a = bi.minimum, z = bi.maximum;
  out[o + 39] = a.x + a.y * 3.1 + a.z * 7.3 + z.x * 11.7 + z.y * 13.9 + z.z * 17.3;
}

/** World matrices equal (16 values within 1e-6)? */
function sameWorld(a: AbstractMesh, b: AbstractMesh): boolean {
  const x = a.getWorldMatrix().m, y = b.getWorldMatrix().m;
  for (let i = 0; i < 16; i++) if (Math.abs(x[i] - y[i]) > 1e-6) return false;
  return true;
}

function factsOf(m: AnyMesh, gens: readonly ShadowGenLike[], scene: Scene, body: Skeleton): PartFacts {
  const kinds = KINDS.filter((k) => m.isVerticesDataPresent(k)).map((k) => `${k}:${m.getVertexBuffer(k)?.getSize() ?? 0}`).join(',');
  const mtm = m.morphTargetManager;
  const morph = mtm ? Array.from({ length: mtm.numTargets }, (_, i) => { const t = mtm.getTarget(i); return `${t.name}/${t.hasNormals ? 'n' : ''}${t.hasTangents ? 't' : ''}${t.hasUVs ? 'u' : ''}${t.hasUV2s ? 'v' : ''}${t.hasColors ? 'c' : ''}`; }).join(',')
    + `#${mtm.useTextureToStoreTargets ? 1 : 0}${mtm.enablePositionMorphing ? 1 : 0}${mtm.enableNormalMorphing ? 1 : 0}${mtm.enableTangentMorphing ? 1 : 0}${mtm.enableUVMorphing ? 1 : 0}${mtm.enableUV2Morphing ? 1 : 0}${mtm.enableColorMorphing ? 1 : 0}`
    : '';
  const casters = gens.map((g) => (g.getShadowMap()?.renderList?.indexOf(m) ?? -1) >= 0 ? 1 : 0).join('');
  const lights = m.lightSources.map((l) => l.uniqueId).join(',');
  const layers = effectLayersOf(scene).map((L) => `${(L._includedOnlyMeshes ?? []).indexOf(m.uniqueId) >= 0 ? 'i' : ''}${(L._excludedMeshes ?? []).indexOf(m.uniqueId) >= 0 ? 'x' : ''}${L.getClassName() === 'HighlightLayer' && (L._meshes as Record<number, unknown> | undefined)?.[m.uniqueId] ? 'h' + m.uniqueId : ''}`).join(',')
    + '/' + rttListsOf(scene, gens).map((l) => (l.indexOf(m) >= 0 ? 1 : 0)).join('');
  return {
    skeleton: sameSkinning(m.skeleton!, body) ? body.uniqueId : m.skeleton!.uniqueId, kinds, morph, casters, lights, layers,
    receiveShadows: m.receiveShadows, renderingGroupId: m.renderingGroupId, alphaIndex: m.alphaIndex, layerMask: m.layerMask,
    sideOrientation: m.sideOrientation ?? -1, overrideSide: m.overrideMaterialSideOrientation ?? -1, hasVertexAlpha: m.hasVertexAlpha,
    useVertexColors: m.useVertexColors, numBoneInfluencers: m.numBoneInfluencers, bonesOnGpu: m.computeBonesUsingShaders,
    culling: m.cullingStrategy, alwaysActive: m.alwaysSelectAsActiveMesh, applyFog: m.applyFog, infiniteDistance: m.infiniteDistance,
    billboard: m.billboardMode, visibility: m.visibility, idx32: !!m.geometry?.getIndexBuffer()?.is32Bits,
  };
}

// ── building one merged mesh ──────────────────────────────────────────────────────────────────────────────────────────
type FArr = Float32Array | number[];
/** How a vertex attribute moves with a part's bind-space change (twinOffset): points, directions, or not at all. */
function moveOf(kind: string): 'point' | 'dir' | null {
  return kind === VertexBuffer.PositionKind ? 'point' : kind === VertexBuffer.NormalKind || kind === VertexBuffer.TangentKind ? 'dir' : null;
}
const _v = new Vector3(), _w = new Vector3();
/** Copy `n` vertices of `size` floats from `d` into `out` at `at`, moved by `x` (positions as points; normals and tangents as
 *  directions, re-normalised: the shader normalises them after skinning, so a uniform scale changes nothing). */
function copyMoved(out: Float32Array, at: number, d: FArr, n: number, size: number, x: Matrix | null, move: 'point' | 'dir' | null): void {
  if (!x || x === IDENTITY || !move) { for (let i = 0; i < n * size; i++) out[at + i] = d[i]; return; }
  for (let v = 0; v < n; v++) {
    const o = v * size;
    _v.set(d[o], d[o + 1], d[o + 2]);
    if (move === 'point') Vector3.TransformCoordinatesToRef(_v, x, _w);
    else { Vector3.TransformNormalToRef(_v, x, _w); const l = _w.length(), l0 = _v.length(); if (l > 0) _w.scaleInPlace(l0 / l); }
    out[at + o] = _w.x; out[at + o + 1] = _w.y; out[at + o + 2] = _w.z;
    for (let k = 3; k < size; k++) out[at + o + k] = d[o + k];   // a tangent's handedness
  }
}
function concatKind(parts: readonly AnyMesh[], xs: readonly (Matrix | null)[], kind: string, size: number, total: number): Float32Array {
  const out = new Float32Array(total * size);
  let at = 0;
  parts.forEach((p, i) => {
    const d = p.getVerticesData(kind, false) as FArr | null;
    const n = p.getTotalVertices();
    if (d) copyMoved(out, at, d, n, size, xs[i], moveOf(kind));
    at += n * size;
  });
  return out;
}
function concatTarget(parts: readonly AnyMesh[], xs: readonly (Matrix | null)[], ti: number, get: (t: MorphTarget) => Nullable<FArr>, size: number, total: number, move: 'point' | 'dir' | null): Float32Array | null {
  const out = new Float32Array(total * size);
  let at = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const d = get(p.morphTargetManager!.getTarget(ti));
    if (!d) return null;
    const n = p.getTotalVertices();
    copyMoved(out, at, d, n, size, xs[i], move);
    at += n * size;
  }
  return out;
}

let mergeSeq = 0;
function buildGroup(scene: Scene, parts: AnyMesh[], skeleton: Skeleton): Group | null {
  const first = parts[0];
  const engine = scene.getEngine();
  let total = 0, totalIdx = 0;
  for (const p of parts) { total += p.getTotalVertices(); totalIdx += p.subMeshes[0].indexCount; }
  // the parts' index width (the key holds it equal): a shader define, so the merged mesh keeps it — and 32 bits past 65,535 vertices
  const uint = !!first.geometry?.getIndexBuffer()?.is32Bits || total > 65535;
  if (uint && !engine.getCaps().uintIndices) return null;
  if (!first.geometry?.getIndexBuffer()?.is32Bits && total > 65535) return null;   // a 16-bit group too big for 16 bits: would change the define
  const xs = parts.map((p) => twinOffset(p.skeleton!, skeleton));
  const merged = new Mesh(`${MERGED_PREFIX}${++mergeSeq}_${first.name}`, scene) as AnyMesh;
  merged.metadata = { felMergedBody: true };
  merged.layerMask = 0;   // hidden until its shaders match its parts'
  merged.isPickable = false;
  // the vertex data, part after part
  for (const k of KINDS) {
    if (!first.isVerticesDataPresent(k)) continue;
    const size = first.getVertexBuffer(k)!.getSize();
    merged.setVerticesData(k, concatKind(parts, xs, k, size, total), false, size);
  }
  // the indices: each part's own sub-mesh range, offset by where its vertices now start
  const idx = uint ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);
  const ranges: Array<{ vs: number; vc: number; is: number; ic: number }> = [];
  let vBase = 0, iAt = 0;
  for (const p of parts) {
    const sm = p.subMeshes[0];
    const src = p.getIndices(false) ?? [];
    for (let i = 0; i < sm.indexCount; i++) idx[iAt + i] = src[sm.indexStart + i] + vBase;
    ranges.push({ vs: vBase + sm.verticesStart, vc: sm.verticesCount, is: iAt, ic: sm.indexCount });
    vBase += p.getTotalVertices(); iAt += sm.indexCount;
  }
  merged.setIndices(idx, total, false);
  // per-mesh state, from the first part (every part shares it: the group key)
  merged.parent = first.parent;
  merged.position.copyFrom(first.position);
  if (first.rotationQuaternion) merged.rotationQuaternion = first.rotationQuaternion.clone(); else merged.rotation.copyFrom(first.rotation);
  merged.scaling.copyFrom(first.scaling);
  merged.skeleton = skeleton; merged.numBoneInfluencers = first.numBoneInfluencers; merged.computeBonesUsingShaders = first.computeBonesUsingShaders;
  merged.receiveShadows = first.receiveShadows; merged.renderingGroupId = first.renderingGroupId; merged.alphaIndex = first.alphaIndex;
  merged.sideOrientation = first.sideOrientation; merged.overrideMaterialSideOrientation = first.overrideMaterialSideOrientation;
  merged.hasVertexAlpha = first.hasVertexAlpha; merged.useVertexColors = first.useVertexColors; merged.cullingStrategy = first.cullingStrategy;
  merged.alwaysSelectAsActiveMesh = first.alwaysSelectAsActiveMesh; merged.applyFog = first.applyFog; merged.infiniteDistance = first.infiniteDistance;
  merged.billboardMode = first.billboardMode; merged.visibility = first.visibility;
  // the morph targets: same names in the same order on every part (the key), positions (and the rest) concatenated
  let morph: MorphTargetManager | null = null;
  const fm = first.morphTargetManager;
  if (fm) {
    morph = new MorphTargetManager(scene);
    morph.useTextureToStoreTargets = fm.useTextureToStoreTargets;
    morph.enablePositionMorphing = fm.enablePositionMorphing; morph.enableNormalMorphing = fm.enableNormalMorphing;
    morph.enableTangentMorphing = fm.enableTangentMorphing; morph.enableUVMorphing = fm.enableUVMorphing;
    morph.enableUV2Morphing = fm.enableUV2Morphing; morph.enableColorMorphing = fm.enableColorMorphing;
    for (let ti = 0; ti < fm.numTargets; ti++) {
      const ft = fm.getTarget(ti);
      const t = new MorphTarget(ft.name, ft.influence, scene);
      t.setPositions(concatTarget(parts, xs, ti, (x) => x.getPositions(), 3, total, 'point'));
      if (ft.hasNormals) t.setNormals(concatTarget(parts, xs, ti, (x) => x.getNormals(), 3, total, 'dir'));
      if (ft.hasTangents) t.setTangents(concatTarget(parts, xs, ti, (x) => x.getTangents(), 3, total, 'dir'));
      if (ft.hasUVs) t.setUVs(concatTarget(parts, xs, ti, (x) => x.getUVs(), 2, total, null));
      if (ft.hasUV2s) t.setUV2s(concatTarget(parts, xs, ti, (x) => x.getUV2s(), 2, total, null));
      if (ft.hasColors) t.setColors(concatTarget(parts, xs, ti, (x) => x.getColors(), 4, total, null));
      morph.addTarget(t);
    }
    merged.morphTargetManager = morph;
  }
  // the sub-meshes: one per part, its own material, its own bounds (culled exactly when the part would be)
  const multi = new MultiMaterial(`${merged.name}_mm`, scene);
  merged.releaseSubMeshes();
  const union = { min: new Vector3(Infinity, Infinity, Infinity), max: new Vector3(-Infinity, -Infinity, -Infinity) };
  parts.forEach((p, i) => {
    let mi = multi.subMaterials.indexOf(p.material);
    if (mi < 0) { multi.subMaterials.push(p.material); mi = multi.subMaterials.length - 1; }
    const r = ranges[i];
    const sm = new SubMesh(mi, r.vs, r.vc, r.is, r.ic, merged, merged, false, true);
    const bi = p.getBoundingInfo();
    sm.setBoundingInfo(new BoundingInfo(bi.minimum.clone(), bi.maximum.clone()));
    (sm as SubMesh & { _felPart?: AbstractMesh })._felPart = p;
    union.min.minimizeInPlace(bi.minimum); union.max.maximizeInPlace(bi.maximum);
  });
  multi.subMaterials = multi.subMaterials.slice();   // the setter re-syncs the material's sub-mesh bookkeeping
  merged.material = multi;
  merged.setBoundingInfo(new BoundingInfo(union.min, union.max));
  merged.computeWorldMatrix(true);
  // THE INK, PER PART: the outline renderer reads these off the mesh for each sub-mesh draw
  const prevRender = merged.render;
  merged.render = function (this: Mesh, subMesh: SubMesh, enableAlphaMode: boolean, effectiveMeshReplacement?: AbstractMesh) {
    const p = (subMesh as SubMesh & { _felPart?: AbstractMesh })._felPart as (Mesh | undefined);
    if (p) {
      this.renderOutline = p.renderOutline; this.outlineWidth = p.outlineWidth; this.outlineColor = p.outlineColor;
      this.renderOverlay = p.renderOverlay; this.overlayColor = p.overlayColor; this.overlayAlpha = p.overlayAlpha;
    }
    return prevRender.call(this, subMesh, enableAlphaMode, effectiveMeshReplacement);
  } as Mesh['render'];
  // what the parts are reached by, the merged mesh is reached by too: lights' include / exclude lists and the effect layers
  // (the shadow maps and other render targets are swapped at swap time)
  for (const l of scene.lights) {
    if (l.includedOnlyMeshes.length && l.includedOnlyMeshes.indexOf(first) >= 0 && l.includedOnlyMeshes.indexOf(merged) < 0) l.includedOnlyMeshes.push(merged);
    if (l.excludedMeshes.length && l.excludedMeshes.indexOf(first) >= 0 && l.excludedMeshes.indexOf(merged) < 0) l.excludedMeshes.push(merged);
  }
  for (const L of effectLayersOf(scene)) {
    if ((L._includedOnlyMeshes ?? []).indexOf(first.uniqueId) >= 0) L.addIncludedOnlyMesh?.(merged);
    if ((L._excludedMeshes ?? []).indexOf(first.uniqueId) >= 0) L.addExcludedMesh?.(merged);
  }
  return { parts: parts.map((mesh) => ({ mesh, sig: new Float64Array(SIG), layerMask: mesh.layerMask })), merged, multi, morph, shadowGens: [], rttLists: [], swapped: false, waited: 0 };
}

/** The camera pass's effect of a sub-mesh (its draw wrapper for the main render pass, not whatever pass ran last). */
function mainEffect(sm: SubMesh, pass: number): unknown {
  return (sm as SubMesh & { _getDrawWrapper(id?: number): { effect: unknown } | undefined })._getDrawWrapper(pass)?.effect ?? null;
}
/** The same shader: the same Effect, or one compiled from the same key (vertex + fragment + every define — Babylon's own effect
 *  cache key; an effect released from the cache and compiled again is a second object with the same program). */
function sameProgram(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const ka = (a as { _key?: string })._key, kb = (b as { _key?: string })._key;
  if (typeof ka !== 'string' || typeof kb !== 'string' || !ka.length) return false;
  if (ka === kb) return true;
  // the same defines in another order (a material's define object grows a light when one is added later): the preprocessor makes
  // the same program of them. The shader names (before '@') must match exactly.
  const ia = ka.indexOf('@'), ib = kb.indexOf('@');
  if (ia < 0 || ia !== ib || ka.slice(0, ia) !== kb.slice(0, ib)) return false;
  const la = ka.slice(ia + 1).split('\n').sort(), lb = kb.slice(ib + 1).split('\n').sort();
  if (la.length !== lb.length) return false;
  for (let i = 0; i < la.length; i++) if (la[i] !== lb[i]) return false;
  return true;
}
/** Run `fn` with the engine on the camera's pass (isReady compiles for the current pass). */
function onMainPass<T>(scene: Scene, fn: (pass: number) => T): T {
  const engine = scene.getEngine() as unknown as { currentRenderPassId: number };
  const pass = (scene.activeCamera as unknown as { renderPassId?: number } | null)?.renderPassId ?? 0;
  const was = engine.currentRenderPassId;
  engine.currentRenderPassId = pass;
  try { return fn(pass); } finally { engine.currentRenderPassId = was; }
}
/** Every sub-mesh compiled to the same effect its part draws with, and the same lights in the same order? */
function shadersMatch(g: Group): boolean {
  return onMainPass(g.merged.getScene(), (pass) => g.merged.isReady(true) && shadersMatchOn(g, pass));
}
function shadersMatchOn(g: Group, pass: number): boolean {
  const m = g.merged;
  const ls = m.lightSources, pl = g.parts[0].mesh.lightSources;
  if (ls.length !== pl.length) return false;
  for (let i = 0; i < ls.length; i++) if (ls[i] !== pl[i]) return false;
  for (let i = 0; i < m.subMeshes.length; i++) {
    const e = mainEffect(m.subMeshes[i], pass);
    let pe = mainEffect(g.parts[i].mesh.subMeshes[0], pass);
    if (!pe) { g.parts[i].mesh.isReady(true); pe = mainEffect(g.parts[i].mesh.subMeshes[0], pass); }   // a part never drawn yet (off screen since it spawned)
    if (!e || !pe || !sameProgram(e, pe)) return false;
  }
  return true;
}

/** For the probes: why a built group is not swapped in yet. */
function whyWaiting(g: Group): string { return onMainPass(g.merged.getScene(), (pass) => whyWaitingOn(g, pass)); }
function whyWaitingOn(g: Group, pass: number): string {
  const m = g.merged;
  if (!m.isReady(true)) return 'not ready';
  const ls = m.lightSources.map((l) => l.name).join(','), pl = g.parts[0].mesh.lightSources.map((l) => l.name).join(',');
  if (ls !== pl) return `lights ${ls} vs ${pl}`;
  const bad: string[] = [];
  for (let i = 0; i < m.subMeshes.length; i++) {
    const e = mainEffect(m.subMeshes[i], pass), pe = mainEffect(g.parts[i].mesh.subMeshes[0], pass);
    if (!e || !pe || !sameProgram(e, pe)) {
      const d1 = (m.subMeshes[i].materialDefines as unknown as { toString(): string } | null)?.toString() ?? '', d2 = (g.parts[i].mesh.subMeshes[0].materialDefines as unknown as { toString(): string } | null)?.toString() ?? '';
      const a = new Set(d1.split('\n')), b2 = new Set(d2.split('\n'));
      const ka = String((e as { _key?: string } | null)?._key ?? ''), kb = String((pe as { _key?: string } | null)?._key ?? '');
      let at = 0; while (at < ka.length && ka[at] === kb[at]) at++;
      bad.push(`${g.parts[i].mesh.name}: ${!e ? 'no effect' : !pe ? 'part has none' : `merged+[${[...a].filter((x) => !b2.has(x)).join(' ')}] part+[${[...b2].filter((x) => !a.has(x)).join(' ')}] keys differ at ${at}: …${ka.slice(Math.max(0, at - 30), at + 50)} | …${kb.slice(Math.max(0, at - 30), at + 50)}`}`);
    }
  }
  return bad.join('; ') || 'match';
}

function swapIn(scene: Scene, g: Group): void {
  const m = g.merged;
  const gens = shadowGensOf(scene);
  g.shadowGens = [];
  for (const gen of gens) {
    const list = gen.getShadowMap()?.renderList;
    if (!list || list.indexOf(g.parts[0].mesh) < 0) continue;
    for (const p of g.parts) gen.removeShadowCaster(p.mesh, false);
    gen.addShadowCaster(m, false);
    g.shadowGens.push(gen);
  }
  g.rttLists = [];
  for (const list of rttListsOf(scene, gens)) {
    let had = false;
    for (const p of g.parts) { const i = list.indexOf(p.mesh); if (i >= 0) { list.splice(i, 1); had = true; } }
    if (had) { if (list.indexOf(m) < 0) list.push(m); g.rttLists.push(list); }
  }
  for (const p of g.parts) { p.layerMask = p.mesh.layerMask; p.mesh.layerMask = 0; hidden.add(p.mesh); }
  m.layerMask = g.parts[0].layerMask;
  g.swapped = true;
  installSort(scene);
}

function swapOut(scene: Scene, g: Group): void {
  if (!g.swapped) return;
  const m = g.merged;
  for (const p of g.parts) { if (!p.mesh.isDisposed()) p.mesh.layerMask = p.layerMask; hidden.delete(p.mesh); }
  m.layerMask = 0;
  for (const gen of g.shadowGens) {
    for (const p of g.parts) if (!p.mesh.isDisposed()) gen.addShadowCaster(p.mesh, false);
    gen.removeShadowCaster(m, false);
  }
  for (const list of g.rttLists) {
    const i = list.indexOf(m); if (i >= 0) list.splice(i, 1);
    for (const p of g.parts) if (!p.mesh.isDisposed() && list.indexOf(p.mesh) < 0) list.push(p.mesh);
  }
  g.shadowGens = []; g.rttLists = [];
  g.swapped = false;
  void scene;
}

function disposeGroup(scene: Scene, g: Group): void {
  swapOut(scene, g);
  for (const l of scene.lights) {
    const i = l.includedOnlyMeshes.indexOf(g.merged); if (i >= 0) l.includedOnlyMeshes.splice(i, 1);
    const j = l.excludedMeshes.indexOf(g.merged); if (j >= 0) l.excludedMeshes.splice(j, 1);
  }
  if (!g.merged.isDisposed()) g.merged.dispose(false, false);
  g.multi.dispose(false, false, false);
  g.morph?.dispose();
}

// ── the sort that keeps a merged part where its own mesh drew ─────────────────────────────────────────────────────────
type SortSub = SubMesh & { _felPart?: AbstractMesh };
function sortMat(s: SortSub): Nullable<Material> { const p = s._felPart; return p ? p.material : s.getMesh().material; }
function sortUid(s: SortSub): number { const p = s._felPart; return p ? p.uniqueId : s.getMesh().uniqueId; }
/** Babylon's PainterSortCompare (material id, else mesh id), with a merged sub-mesh read as its PART. Identical for every other
 *  sub-mesh, so the draw order of everything not merged is unchanged. */
export function bodyAwarePainterCompare(a: SubMesh, b: SubMesh): number {
  const ma = sortMat(a as SortSub), mb = sortMat(b as SortSub);
  if (ma && mb) {
    const d = ma.uniqueId - mb.uniqueId;
    if (d !== 0) return d;
    // a tie (two meshes on one material — the sole is cut from its shoe and shares the shoe's material): Babylon's stable sort keeps
    // the order they were dispatched in, the scene's mesh order, i.e. creation order (uniqueId). A merged part is dispatched with its
    // merged mesh, out of that order, so its tie is broken by its own id; two meshes that are not merged keep the stable order.
    return (a as SortSub)._felPart || (b as SortSub)._felPart ? sortUid(a as SortSub) - sortUid(b as SortSub) : 0;
  }
  return sortUid(a as SortSub) - sortUid(b as SortSub);
}
function installSort(scene: Scene): void {
  const reg = regs.get(scene);
  if (!reg || reg.sortInstalled) return;
  reg.sortInstalled = true;
  // 4 = Babylon's rendering groups (RenderingManager.MAX_RENDERINGGROUPS); transparent keeps its default (null)
  for (let i = 0; i < 4; i++) scene.setRenderingOrder(i, bodyAwarePainterCompare, bodyAwarePainterCompare, null);
}

// ── per frame ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function candidatesOf(b: Body): AnyMesh[] {
  if (!b.candidates) b.candidates = b.root.getChildMeshes(false).filter((m) => isCandidate(m, b.skeleton)) as AnyMesh[];
  return b.candidates;
}

/** Group a settled body's eligible parts and build a merged mesh for every group of two or more. */
function buildBody(scene: Scene, b: Body): void {
  const gens = shadowGensOf(scene);
  const all = candidatesOf(b);
  const parts = all.filter(eligible);
  b.lastBuild = `${all.length} parts, ${parts.length} eligible`;
  if (parts.length < 2) return;
  const anchor = parts.reduce((a, p) => (p.getTotalVertices() > a.getTotalVertices() ? p : a), parts[0]);
  const byKey = new Map<string, AnyMesh[]>();
  for (const p of parts) {
    if (!sameWorld(p, anchor)) { b.lastBuild += ` · ${p.name} elsewhere`; continue; }
    const key = groupKeyOf(factsOf(p, gens, scene, b.skeleton));
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(p);
  }
  b.lastBuild += ` · groups ${[...byKey.values()].map((l) => l.length).join('+')}`;
  if (byKey.size > 1) {   // which facts split them (probes read it)
    const fs = parts.map((p) => factsOf(p, gens, scene, b.skeleton));
    const diff = (Object.keys(fs[0]) as (keyof PartFacts)[]).filter((k) => new Set(fs.map((f) => String(f[k]))).size > 1);
    b.lastBuild += ` · split by ${diff.map((k) => `${k}=[${fs.map((f, i) => `${parts[i].name.replace(/_c\d+$/, '')}:${String(f[k]).slice(0, 40)}`).join(' ')}]`).join(' ')}`;
  }
  const reg = regs.get(scene);
  for (const list of byKey.values()) {
    if (list.length < 2) continue;
    const kept = takeParked(b, list, gens);
    if (kept) { if (reg) reg.reused++; b.groups.push(kept); continue; }
    const g = buildGroup(scene, list, b.skeleton);
    if (!g) continue;
    if (reg) reg.builds++;
    for (const p of g.parts) writeSig(p.mesh, gens, p.sig, 0, -1);
    b.groups.push(g);
  }
  for (const p of b.parked) disposeGroup(scene, p);   // what did not come back is gone for good
  b.parked.length = 0;
}

const scratch = new Float64Array(SIG);
/** Is this group still exactly what it was built from? (Allocation-free.) */
/** For the probes: what the last failed hold saw (set only when a group dissolves). */
let holdFail = '';
function groupHolds(g: Group, gens: readonly ShadowGenLike[]): boolean {
  const first = g.parts[0].mesh;
  if (g.merged.isDisposed()) return false;
  for (let i = 0; i < g.parts.length; i++) {
    const p = g.parts[i];
    if (p.mesh.isDisposed()) { holdFail = `${p.mesh.name}:disposed`; return false; }
    // swapped, a part is hidden (layerMask 0) and out of the shadow maps by our hand: its mask must still be 0, its casting is ours
    writeSig(p.mesh, gens, scratch, 0, g.swapped ? 0 : -1);
    for (let k = 0; k < SIG; k++) {
      if (k === 12 || k === 22 || k === 31) continue;   // influences (below), the layer mask and the shadow maps (here)
      if (scratch[k] !== p.sig[k]) { holdFail = `${p.mesh.name}:${k}`; return false; }
    }
    if (g.swapped ? scratch[22] !== 1 : (scratch[22] !== p.sig[22] || scratch[31] !== p.sig[31])) { holdFail = `${p.mesh.name}:mask/cast`; return false; }
    if (i > 0 && !sameWorld(p.mesh, first)) { holdFail = `${p.mesh.name}:world`; return false; }
    // the morph influences: every part's equal to the first's (they share the merged mesh's)
    const mtm = p.mesh.morphTargetManager, fm = first.morphTargetManager;
    if (mtm && fm && i > 0) for (let t = 0; t < mtm.numTargets; t++) if (mtm.getTarget(t).influence !== fm.getTarget(t).influence) { holdFail = `${p.mesh.name}:influence`; return false; }
  }
  return true;
}
/** Carry what may change without a rebuild: the morph influences. */
function syncGroup(g: Group): void {
  const fm = g.parts[0].mesh.morphTargetManager;
  if (g.morph && fm) for (let t = 0; t < fm.numTargets; t++) { const v = fm.getTarget(t).influence; const mt = g.morph.getTarget(t); if (mt.influence !== v) mt.influence = v; }
}

function unmergeBody(scene: Scene, b: Body, park = false): void {
  for (const p of b.parked) disposeGroup(scene, p);
  b.parked.length = 0;
  for (const g of b.groups) { if (park && !g.merged.isDisposed()) { swapOut(scene, g); g.waited = 0; b.parked.push(g); } else disposeGroup(scene, g); }
  b.groups.length = 0;
}
/** A parked group whose parts are exactly `list` (same order) and read as they did when it was built. */
function takeParked(b: Body, list: readonly AnyMesh[], gens: readonly ShadowGenLike[]): Group | null {
  for (let i = 0; i < b.parked.length; i++) {
    const g = b.parked[i];
    if (g.parts.length !== list.length || g.merged.isDisposed()) continue;
    let same = true;
    for (let k = 0; same && k < list.length; k++) {
      if (g.parts[k].mesh !== list[k]) { same = false; break; }
      writeSig(list[k], gens, scratch, 0, -1);
      for (let f = 0; f < SIG; f++) if (f !== 12 && scratch[f] !== g.parts[k].sig[f]) { same = false; break; }
    }
    if (same) { b.parked.splice(i, 1); return g; }
  }
  return null;
}

function tickBody(scene: Scene, reg: SceneReg, b: Body, gens: readonly ShadowGenLike[]): void {
  if (b.root.isDisposed()) { dropBody(scene, b); return; }
  if (reg.forced !== 'auto') { if (b.groups.length) unmergeBody(scene, b); return; }
  if (b.groups.length) {
    for (let i = 0; i < b.groups.length; i++) {
      if (groupHolds(b.groups[i], gens)) continue;
      reg.dissolves++; reg.lastDissolve = holdFail;
      // something changed: the parts draw again THIS frame, and the body settles before it is merged again (kept built, in case
      // it settles back into the same state)
      unmergeBody(scene, b, true); b.candidates = null; b.built = false; b.stable = 0;
      return;
    }
    let gaveUp = false;
    for (const g of b.groups) {
      syncGroup(g);
      if (g.swapped) continue;
      if (shadersMatch(g)) swapIn(scene, g);
      else if (++g.waited > BODY_MERGE_READY_FRAMES) { gaveUp = true; b.lastBuild += ` · gave up: ${whyWaiting(g)}`; }
    }
    if (gaveUp) { reg.gaveUp++; unmergeBody(scene, b); }   // b.built stays: no rebuild until something changes
    return;
  }
  // settling: every candidate's signature must hold for BODY_MERGE_SETTLE_FRAMES
  const c = candidatesOf(b);
  if (b.lastSig.length !== c.length * SIG) { b.lastSig = new Float64Array(c.length * SIG); b.stable = 0; b.built = false; }
  const prev = b.lastSig;
  let same = true;
  for (let i = 0; i < c.length; i++) {
    writeSig(c[i], gens, scratch, 0, -1);
    const o = i * SIG;
    // (the morph influences may move every frame — a face, a creator slider — and a merged mesh carries them: not a change here)
    for (let k = 0; k < SIG; k++) if (k !== 12 && prev[o + k] !== scratch[k]) { if (same && b.stable > 0) b.lastChange = `${c[i].name}:${k}`; same = false; prev[o + k] = scratch[k]; }
  }
  if (!same) { b.stable = 0; b.built = false; return; }
  if (b.built || ++b.stable < BODY_MERGE_SETTLE_FRAMES) return;
  b.built = true;
  buildBody(scene, b);
}

function dropBody(scene: Scene, b: Body): void {
  if (b.disposed) return;
  b.disposed = true;
  unmergeBody(scene, b);
  for (const p of b.parked) disposeGroup(scene, p);
  b.parked.length = 0;
  const reg = regs.get(scene);
  if (reg) { const i = reg.bodies.indexOf(b); if (i >= 0) reg.bodies.splice(i, 1); }
}

function regFor(scene: Scene): SceneReg {
  let reg = regs.get(scene);
  if (reg) return reg;
  const r: SceneReg = { bodies: [], obs: null, meshCount: -1, added: null, sortInstalled: false, forced: 'auto', builds: 0, reused: 0, dissolves: 0, gaveUp: 0, lastDissolve: '' };
  regs.set(scene, r);
  r.obs = scene.onBeforeActiveMeshesEvaluationObservable.add(() => {
    // meshes added since the last frame (Babylon 9 announces a new mesh only on the next macrotask, so the list is read, not the
    // event; a new mesh is pushed at the end, and a removal moves the mark back): a mesh cloned from a hidden part carries its
    // layerMask 0 (Mesh.clone copies it; nothing in this app sets another mask) and gets the default back before it is first
    // drawn — a sole re-cut from a hidden shoe; and a new mesh under a body re-reads that body's parts. Only the new tail is
    // looked at, and only the body it joined is re-read: effects spawning meshes every frame cost nothing here.
    const len = scene.meshes.length;
    if (r.meshCount < 0 || r.meshCount > len) r.meshCount = 0;
    for (let i = r.meshCount; i < len; i++) {
      const m = scene.meshes[i];
      if (m.layerMask === 0 && !hidden.has(m) && !(m.metadata as { felMergedBody?: boolean } | null)?.felMergedBody) m.layerMask = DEFAULT_LAYER_MASK;
      for (let n: Node | null = m.parent; n; n = n.parent) for (let k = 0; k < r.bodies.length; k++) if (r.bodies[k].root === n) r.bodies[k].candidates = null;
    }
    r.meshCount = len;
    if (!r.bodies.length) return;
    const gens = shadowGensOf(scene);
    for (let i = r.bodies.length - 1; i >= 0; i--) tickBody(scene, r, r.bodies[i], gens);
  });
  // a removal: the tail mark moves back with the list, and a body that held the mesh re-reads its parts
  r.added = scene.onMeshRemovedObservable.add((m) => {
    if (r.meshCount > 0) r.meshCount--;
    for (let k = 0; k < r.bodies.length; k++) { const c = r.bodies[k].candidates; if (c && c.indexOf(m as AnyMesh) >= 0) r.bodies[k].candidates = null; }
  });
  (scene as unknown as { __felBodyMerge?: BodyMergeDebug }).__felBodyMerge = debugHandle(scene, r);
  scene.onDisposeObservable.addOnce(() => {
    scene.onBeforeActiveMeshesEvaluationObservable.remove(r.obs); scene.onMeshRemovedObservable.remove(r.added);
    r.bodies.length = 0; regs.delete(scene);
  });
  return r;
}

/** The probes' handle (scene.__felBodyMerge): the state, and an immediate off / on for a same-frame pixel diff. */
export interface BodyMergeDebug {
  stats(): { bodies: number; groups: number; swapped: number; parts: number; hiddenParts: number; builds: number; reused: number; dissolves: number; gaveUp: number; lastDissolve: string };
  /** Per body: its parts, eligibility, settle count, the last change seen and what the last build found (probes only). */
  detail(): Array<Record<string, unknown>>;
  /** 'off': every merged body shows its parts now (and stays so); 'auto': back to merging. */
  setMode(mode: 'off' | 'auto'): void;
  /** Swap in now every built group whose shaders match (no settle wait). Returns how many are swapped. */
  swapReady(): number;
}
function debugHandle(scene: Scene, r: SceneReg): BodyMergeDebug {
  return {
    stats() {
      let groups = 0, swapped = 0, parts = 0;
      for (const b of r.bodies) for (const g of b.groups) { groups++; if (g.swapped) { swapped++; parts += g.parts.length; } }
      return { bodies: r.bodies.length, groups, swapped, parts, hiddenParts: parts, builds: r.builds, reused: r.reused, dissolves: r.dissolves, gaveUp: r.gaveUp, lastDissolve: r.lastDissolve };
    },
    detail() {
      return r.bodies.map((b) => {
        const c = candidatesOf(b);
        const sk = b.root.getChildMeshes(false).filter((m) => !!m.skeleton && !m.name.startsWith(MERGED_PREFIX));
        return { root: b.root.name, skinned: sk.length, otherSkeleton: sk.filter((m) => m.skeleton !== b.skeleton).map((m) => m.name), candidates: c.length,
          ineligible: c.filter((m) => !eligible(m)).map((m) => `${m.name}${m.isVisible ? '' : '(hidden)'}${hasDrawHooks(m) ? '(hooks)' : ''}`), stable: b.stable, built: b.built,
          lastChange: b.lastChange, lastBuild: b.lastBuild, groups: b.groups.map((g) => `${g.parts.map((p) => p.mesh.name).join('+')}${g.swapped ? ' swapped' : ` waiting ${g.waited}: ${whyWaiting(g)}`}`),
          twins: sk.filter((m) => m.skeleton !== b.skeleton).slice(0, 3).map((m) => `${m.name}:${twinWhy(m.skeleton!, b.skeleton)}`) };
      });
    },
    setMode(mode) {
      r.forced = mode;
      if (mode === 'off') for (const b of r.bodies) for (const g of b.groups) swapOut(scene, g);
      else for (const b of r.bodies) { b.built = false; b.stable = 0; }
    },
    swapReady() {
      let n = 0;
      for (const b of r.bodies) for (const g of b.groups) {
        if (!g.swapped && shadersMatch(g)) swapIn(scene, g);
        if (g.swapped) n++;
      }
      return n;
    },
  };
}

export interface BodyMergeHandle { dispose(): void }
/** Merge this body's parts (when the knob is on), now and after every change. Disposing restores every part. */
export function mountBodyMerge(scene: Scene, root: TransformNode, skeleton: Skeleton, on = feel('perf.bodyMergeOn', BODY_MERGE_ON)): BodyMergeHandle {
  if (on < 0.5 || !scene.onBeforeActiveMeshesEvaluationObservable) return { dispose() { /* off: nothing installed */ } };
  const reg = regFor(scene);
  const b: Body = { root, skeleton, candidates: null, groups: [], lastSig: new Float64Array(0), stable: 0, built: false, lastChange: '', lastBuild: '', parked: [], disposed: false };
  reg.bodies.push(b);
  return { dispose() { dropBody(scene, b); } };
}
