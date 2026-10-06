// CODE-BUILT CLOTHES ON A BODY (IMPROVE (2026-10-06), CREATOR-PLAN phase 4e). The Babylon half of build.ts: one merged,
// skinned mesh per body for ALL of its pieces, one material, the kit garments it replaces hidden, the skin under it not
// drawn. Called by the Creator hook (core/creatorLook.applyCreatorLayers) on every identity apply, so the clothes show in
// every mode that applies the player's identity, in the Studio and in photo mode.
//
// ONE DRAW. Every piece (two tops, a bottom, gloves, footwear, a skirt or a coat's tube) is in one mesh with one PBR
// material; each piece's colours are vertex colours (no texture until paint reaches it), so a colour drag rewrites one
// buffer and never rebuilds. The mesh is the body's own skin: its vertex buffer holds the body's own (quantised) vertex
// space, its skeleton IS the body's skeleton, so it skins with the body in every animation and needs nothing per frame.
// The anime ink and the shadow map pick it up like any skinned mesh (they watch new meshes). With paint on it, it is one
// texture more (renderPaint; the body's own surface map at the garment size, since its UVs are the body's).
//
// WHAT IT REPLACES. A built top / bottom / footwear covers the kit slot (core/kit.ts applyKit is told which slots, from the
// doc, before it shows anything — playerIdentity — so a sport's uniform and a kit pack that lands late stay hidden there);
// this file hides them again too, for a caller that applies the layers on their own. A slot with no built piece keeps
// today's behaviour (the Closet pick, else the sport's default). The hair goes when a hood is up.
//
// THE SKIN UNDER IT. build.ts says which body vertices are deep inside a piece; the body mask (core/bodyMask.ts) drops the
// body triangles whose three corners are all hidden, together with the skin it already hides under kit garments.
//
// CACHED BY INPUTS. The geometry is keyed by the body's geometry, the tier and the pieces without their colours
// (build.clothGeometryKey), in a small LRU shared by every body; a re-apply with the same doc changes nothing. Tier-aware:
// a phone smooths less and builds coarser tubes. The 4b shape morph shapes it like any worn garment (creatorLook passes it
// to syncShape: one more morph target on this mesh, none on the body), and it is disposed with the body's root.
//
// Cosmetic only: never pickable, never a collider, nothing it does moves a bone.

import { BoundingInfo, Color3, Mesh, PBRMaterial, VertexBuffer, VertexData } from '@babylonjs/core';
import type { AbstractMesh, Skeleton, TransformNode } from '@babylonjs/core';
import { CLOTH_KIT_SLOT, type CreatorCloth, type CreatorDoc } from '../../../creator/look/doc';
import { kitOf } from '../../core/kit';
import { isBodyMesh, scheduleBodyMask } from '../../core/bodyMask';
import { GARMENT_Z_OFFSET, syncGarmentVisibility } from '../../core/garmentFixes';
import { fullIndices } from '../paint/surfaceMap';
import { bodyMeshOf } from '../shape/renderShape';
import { clothFieldOf, type ClothBodyField } from './bodyField';
import { buildClothes, clothGeometryKey, type ClothGeo, type ClothTier } from './build';
import { rasterClothBase, type RGB } from './baseRaster';

/** Built geometries kept (each a whole outfit, ~0.5–1.5 MB). */
export const CLOTH_CACHE_MAX = 6;
const cache = new Map<string, ClothGeo>();

interface ClothState {
  mesh: Mesh | null;
  mat: PBRMaterial | null;
  geoKey: string;
  colourKey: string;
  geo: ClothGeo | null;
  hooked: boolean;
}
const states = new WeakMap<TransformNode, ClothState>();

/** A mesh this module made. */
export const isClothMesh = (m: { metadata?: unknown } | null | undefined): boolean => !!(m?.metadata as { felCloth?: boolean } | null | undefined)?.felCloth;

/** The cloth mesh on a body (null when it wears no built clothes). */
export function clothMeshOf(root: TransformNode): Mesh | null {
  const m = states.get(root)?.mesh ?? null;
  return m && !m.isDisposed() ? m : null;
}

const tierOf = (root: TransformNode): ClothTier => ((root.getScene()?.metadata as { felTier?: string } | undefined)?.felTier === 'mobile' ? 'mobile' : 'desktop');

/** The geometry for these pieces on this body (built once per inputs; the LRU keeps the last few). */
export function clothGeometry(field: ClothBodyField, clothes: readonly CreatorCloth[], tier: ClothTier): { key: string; geo: ClothGeo } {
  const key = `${field.key}|${tier}|${clothGeometryKey(clothes)}`;
  let geo = cache.get(key);
  if (geo) { cache.delete(key); cache.set(key, geo); return { key, geo }; }
  geo = buildClothes(field, clothes, tier);
  cache.set(key, geo);
  while (cache.size > CLOTH_CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return { key, geo };
}
export const clothCacheStats = (): { entries: number; bytes: number } => {
  let bytes = 0;
  for (const g of cache.values()) bytes += g.P.byteLength + g.N.byteLength + g.UV.byteLength + g.J.byteLength + g.W.byteLength + g.colour.byteLength + g.ind.byteLength + g.bodyHide.byteLength + g.from.byteLength + g.off.byteLength;
  return { entries: cache.size, bytes };
};
export function resetClothCaches(): void { cache.clear(); }

/** The palette: per piece, its colour and its second colour (the first again when it has none). '#RRGGBB' → 0..1, the
 *  same reading a material's albedo colour gives a hex everywhere else in the identity pipe. */
export function clothPalette(clothes: readonly CreatorCloth[]): RGB[] {
  const out: RGB[] = [];
  const rgb = (hex: string): RGB => { const c = Color3.FromHexString(/^#[0-9A-F]{6}$/i.test(hex) ? hex : '#FFFFFF'); return [c.r, c.g, c.b]; };
  for (const c of clothes) { out.push(rgb(c.colour)); out.push(rgb(c.colour2 ?? c.colour)); }
  return out;
}

function colourBuffer(geo: ClothGeo, palette: readonly RGB[]): Float32Array {
  const n = geo.colour.length, out = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const c = palette[geo.colour[v]] ?? [1, 1, 1];
    out[v * 4] = c[0]; out[v * 4 + 1] = c[1]; out[v * 4 + 2] = c[2]; out[v * 4 + 3] = 1;
  }
  return out;
}

export interface ClothSummary {
  mesh: Mesh | null;
  /** pieces drawn, vertices, triangles */
  pieces: number; verts: number; tris: number;
  /** body vertices hidden under the clothes */
  hidden: number;
  /** kit slots replaced */
  covered: string[];
  rebuilt: boolean;
}

function release(st: ClothState): void {
  try { st.mesh?.dispose(false, false); } catch { /* gone with the scene */ }
  try { st.mat?.dispose(false, true); } catch { /* gone with the scene */ }
  st.mesh = null; st.mat = null; st.geo = null; st.geoKey = ''; st.colourKey = '';
}

/** Put the body's hide set where the body mask reads it, and re-mask when it changed. */
function setBodyHide(body: Mesh, meshes: readonly AbstractMesh[], hide: Uint8Array | null): void {
  const md = (body.metadata ?? {}) as { felClothHide?: Uint8Array };
  if ((md.felClothHide ?? null) === hide) return;
  const next = { ...md } as Record<string, unknown>;
  if (hide) next.felClothHide = hide; else delete next.felClothHide;
  body.metadata = next;
  if (isBodyMesh(body.name)) { scheduleBodyMask([...meshes]); return; }
  // a body the mask does not know (no kit names): drop the hidden triangles straight from its full index list
  const full = fullIndices(body);
  if (!full) return;
  const keep: number[] = [];
  for (let t = 0; t + 2 < full.length; t += 3) if (!(hide && hide[full[t]] && hide[full[t + 1]] && hide[full[t + 2]])) keep.push(full[t], full[t + 1], full[t + 2]);
  if (!(body.metadata as { felBodyIndices0?: unknown }).felBodyIndices0) { body.metadata = { ...body.metadata, felBodyIndices0: Array.from(full) }; body.makeGeometryUnique(); }
  body.setIndices(keep, null, false);
}

/**
 * Make the body wear the doc's built clothes (or none). Idempotent: the same doc changes nothing; a colour change rewrites
 * the colour buffer; any other change swaps the mesh for a new one (from the cache when the pieces were built before).
 */
export function syncClothes(
  spawn: { root: TransformNode; skeleton?: Skeleton | null; meshes?: readonly AbstractMesh[] },
  doc: CreatorDoc | null,
): ClothSummary | null {
  const { root } = spawn;
  if (root.isDisposed()) return null;
  const clothes = doc?.clothes ?? [];
  let st = states.get(root);
  const meshes = (spawn.meshes ?? root.getChildMeshes()).filter((m) => !m.isDisposed());
  const body = bodyMeshOf(meshes);
  const field = clothes.length && body ? clothFieldOf(body) : null;
  if (!field || !body?.skeleton) {
    if (st?.mesh) release(st);
    if (body && (body.metadata as { felClothHide?: unknown } | null)?.felClothHide) setBodyHide(body, meshes, null);
    if (st) root.metadata = { ...(root.metadata ?? {}), felClothes: null };
    return null;
  }
  if (!st) { st = { mesh: null, mat: null, geoKey: '', colourKey: '', geo: null, hooked: false }; states.set(root, st); }
  if (!st.hooked) {
    st.hooked = true;
    const s = st;
    root.onDisposeObservable.addOnce(() => { release(s); states.delete(root); });
  }
  const scene = root.getScene();
  const { key, geo } = clothGeometry(field, clothes, tierOf(root));
  const palette = clothPalette(clothes);
  const colourKey = JSON.stringify(palette);
  let rebuilt = false;
  if (st.geoKey !== key || !st.mesh || st.mesh.isDisposed()) {
    try { st.mesh?.dispose(false, false); } catch { /* gone */ }
    if (!st.mat) {
      const m = new PBRMaterial(`cloth_${root.name}`, scene);
      m.albedoColor = Color3.White();
      m.metallic = 0; m.roughness = 0.82;
      m.backFaceCulling = false; m.twoSidedLighting = true;   // the inside of a sleeve or a hood is the cloth's other side
      m.zOffset = GARMENT_Z_OFFSET;                            // the kit garments' bias: the skin near a hem never wins
      m.metadata = { felCreatorCloth: true };
      st.mat = m;
    }
    const mesh = new Mesh(`Cloth_${root.name}`, scene);
    const vd = new VertexData();
    const s = field.local.scale, o = field.local.offset;
    const pos = new Float32Array(geo.P.length);
    for (let i = 0; i < geo.P.length; i += 3) { pos[i] = (geo.P[i] - o[0]) / s; pos[i + 1] = (geo.P[i + 1] - o[1]) / s; pos[i + 2] = (geo.P[i + 2] - o[2]) / s; }
    vd.positions = pos; vd.normals = geo.N; vd.uvs = geo.UV; vd.indices = geo.ind;
    vd.matricesIndices = geo.J; vd.matricesWeights = geo.W;
    vd.applyToMesh(mesh, false);
    mesh.setVerticesData(VertexBuffer.ColorKind, colourBuffer(geo, palette), true, 4);
    mesh.useVertexColors = true; mesh.hasVertexAlpha = false;
    mesh.skeleton = body.skeleton; mesh.numBoneInfluencers = 4;
    mesh.parent = body.parent;
    mesh.position.copyFrom(body.position);
    mesh.rotationQuaternion = body.rotationQuaternion?.clone() ?? null;
    mesh.rotation.copyFrom(body.rotation);
    mesh.scaling.copyFrom(body.scaling);
    mesh.isPickable = false; mesh.checkCollisions = false;
    mesh.receiveShadows = body.receiveShadows;
    mesh.material = st.mat;
    mesh.metadata = { felCloth: true, felNoShapeCache: true, felClothBase: { key: `${key}|${colourKey}`, read: (size: number) => rasterClothBase(geo.UV, geo.ind, geo.colour, palette, size, clothes.length) } };
    // a skinned mesh is culled on its bind box: the body's box is the character's (bodyMask.shareBodyBounds' rule)
    const bi = body.getBoundingInfo();
    mesh.setBoundingInfo(new BoundingInfo(bi.minimum.clone(), bi.maximum.clone(), mesh.computeWorldMatrix(true)));
    st.mesh = mesh; st.geo = geo; st.geoKey = key; st.colourKey = colourKey;
    rebuilt = true;
  } else if (st.colourKey !== colourKey) {
    st.mesh.updateVerticesData(VertexBuffer.ColorKind, colourBuffer(geo, palette));
    st.mesh.metadata = { ...st.mesh.metadata, felClothBase: { key: `${key}|${colourKey}`, read: (size: number) => rasterClothBase(geo.UV, geo.ind, geo.colour, palette, size, clothes.length) } };
    st.colourKey = colourKey;
  }
  // the kit garments it replaces (applyKit already hid them; a caller that skips applyKit gets the same), and the hair
  // under a raised hood
  const covered = new Set(clothes.map((c) => CLOTH_KIT_SLOT[c.kind]).filter(Boolean) as string[]);
  for (const m of meshes) {
    const k = kitOf(m.name);
    if (k && covered.has(k.slot) && m.isVisible) { m.isVisible = false; syncGarmentVisibility(m); }
    if (geo.hoodUp && /^Hair_/.test(m.name)) m.isVisible = false;
  }
  setBodyHide(body, meshes, geo.bodyHide);
  let hidden = 0;
  for (let v = 0; v < geo.bodyHide.length; v++) hidden += geo.bodyHide[v];
  const summary: ClothSummary = { mesh: st.mesh, pieces: clothes.length, verts: geo.P.length / 3, tris: geo.ind.length / 3, hidden, covered: [...covered], rebuilt };
  root.metadata = { ...(root.metadata ?? {}), felClothes: { pieces: summary.pieces, verts: summary.verts, tris: summary.tris, hidden, covered: summary.covered } };
  return summary;
}
