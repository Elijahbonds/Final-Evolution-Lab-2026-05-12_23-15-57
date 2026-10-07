// CODE-BUILT HAIR ON A BODY (2026-10-07, the hair expansion). The Babylon half of build.ts. Called by playerIdentity.
// applyIdentity on every apply (after the face morphs, so the head it measures is the face the player made), so the hair
// shows in every mode that spawns the player, in the Studio and in photo mode.
//
// AT MOST TWO DRAWS AND ONE MATERIAL PER CHARACTER.
//   static  ONE mesh for the style, the beard and the accessories: skinned to the BODY'S OWN skeleton (Head, Neck, Spine2
//           by height — build.bindAt) in the body's own vertex space, like the code-built clothes (clothes/renderClothes),
//           so it moves with the body in every animation for nothing per frame; the 4b shape morph shapes it (creatorLook
//           hands it to syncShape with the cloth mesh).
//   sway    ONE mesh for everything that hangs (locs, braids, tails, puffs, a durag's tail, long hair's lower panels): the
//           creator's own swing rig (parts/swing.ts — a fixed-step spring per chain, at most six chains, no per-frame
//           allocation, a phone's 30 Hz single step), riding the Head or the Neck. Absent on a style with nothing hanging.
//   One PBR material per SCENE, shared by every body: every colour is a vertex colour (the hair, the second colour, the
//   beard, the accessories, a covering's fabric and trim, the skin of a shaved side), so a colour pick rewrites one buffer
//   and never rebuilds.
//
// WHAT IT REPLACES. The kit's baked Hair_* nodes (forge.mts: six of them) are hidden whenever this module has a head to fit:
// every catalog style is built here. A body it cannot fit (the owner's scan, a roster GLB, the procedural fallback) is left
// exactly as before — applyHairStyle's node — so nothing goes bald for lack of a head field.
//
// CACHED BY INPUTS. The geometry is keyed by the head (its field's key: the kit and the face morphs), the tier and the hair's
// shape inputs (build.hairGeometryKey — never the colours), in a small LRU shared by every body.
//
// Cosmetic only: never pickable, never a collider, nothing it does moves a bone.

import { BoundingInfo, Color3, Matrix, Mesh, PBRMaterial, Vector3, VertexBuffer, VertexData } from '@babylonjs/core';
import type { AbstractMesh, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import type { CreatorPart } from '../../../creator/look/doc';
import type { ResolvedHair } from '../../../creator/look/hair';
import { isCovering } from '../../../creator/look/hair';
import { boneNode, findBone } from '../../anim/boneLookup';
import { absRest, isPaintBody } from '../paint/surfaceMap';
import { bodyMeshOf } from '../shape/renderShape';
import { clothFieldOf } from '../clothes/bodyField';
import { rigFrames } from '../parts/rigFrames';
import { buildSwingRig, disposeSwingRig, type SwingRig } from '../parts/swing';
import { headFieldOf, type HeadField } from './headField';
import { buildHair, hairGeometryKey, type HairGeo } from './build';
import { K } from './geo';
import type { HairTier } from './headKit';

/** Built geometries kept (each ~0.1–1 MB). */
export const HAIR_CACHE_MAX = 8;
const cache = new Map<string, HairGeo>();

/** The per-character budget (renderHair.test pins every style to it). TUNED (2026-10-07): a phone 3–4 years old draws two
 *  characters' hair in a mode; the desktop tier roughly twice the detail. */
export const HAIR_BUDGET = {
  desktop: { tris: 24_000, draws: 2, materials: 1 },
  mobile: { tris: 12_000, draws: 2, materials: 1 },
  crowd: { tris: 5_000, draws: 2, materials: 1 },
} as const;

interface HairState {
  mesh: Mesh | null;
  sway: { rig: SwingRig; mesh: Mesh; order: Int32Array } | null;
  geoKey: string;
  colourKey: string;
  geo: HairGeo | null;
  hooked: boolean;
}
const states = new WeakMap<TransformNode, HairState>();
const materials = new WeakMap<Scene, PBRMaterial>();

export const isHairMesh = (m: { metadata?: unknown } | null | undefined): boolean => !!(m?.metadata as { felHair?: boolean } | null | undefined)?.felHair;

/** The static hair mesh on a body (null when it wears none), for the shape morph and probes. */
export function hairMeshOf(root: TransformNode): Mesh | null {
  const m = states.get(root)?.mesh ?? null;
  return m && !m.isDisposed() ? m : null;
}
/** Both hair meshes (static, sway) on a body. */
export function hairMeshesOf(root: TransformNode): Mesh[] {
  const st = states.get(root);
  return [st?.mesh, st?.sway?.mesh].filter((m): m is Mesh => !!m && !m.isDisposed());
}
/** The swing rig the hair hangs on (probes and tests). */
export const hairSwingRigOf = (root: TransformNode): SwingRig | null => states.get(root)?.sway?.rig ?? null;

export function hairTierOf(root: TransformNode): HairTier {
  const own = (root.metadata as { felHairTier?: string } | null | undefined)?.felHairTier;
  if (own === 'crowd' || own === 'mobile' || own === 'desktop') return own;
  return (root.getScene()?.metadata as { felTier?: string } | undefined)?.felTier === 'mobile' ? 'mobile' : 'desktop';
}

export function hairGeometry(H: HeadField, hair: ResolvedHair, o: { tier: HairTier; cover: 'none' | 'compress'; sway: boolean; winding: 1 | -1 }): { key: string; geo: HairGeo } {
  const key = `${H.key}|${hairGeometryKey(hair, o)}|${o.winding}`;
  let geo = cache.get(key);
  if (geo) { cache.delete(key); cache.set(key, geo); return { key, geo }; }
  geo = buildHair(H, hair, { tier: o.tier, cover: o.cover, sway: o.sway, winding: o.winding });
  cache.set(key, geo);
  while (cache.size > HAIR_CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return { key, geo };
}
export const hairCacheStats = (): { entries: number } => ({ entries: cache.size });
export function resetHairCaches(): void { cache.clear(); }

// ── colour ───────────────────────────────────────────────────────────────────────────────────────────────────────────

type RGB = [number, number, number];
const rgb = (hex: string): RGB => { const c = Color3.FromHexString(/^#[0-9A-F]{6}$/i.test(hex) ? hex : '#FFFFFF'); return [c.r, c.g, c.b]; };
const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sm = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** The colour inputs, as a key (a change here rewrites the colour buffers only). */
export const hairColourKey = (h: ResolvedHair): string => JSON.stringify([h.colour, h.colour2, h.tone, h.accColour, h.beardColour, h.skin, h.style]);

/**
 * Every vertex's colour (RGBA, 0..1): its kind's colour — the hair (with the second colour where the tone puts it), the
 * beard, the accessories, a covering's fabric and trim, the skin — blended to the skin by its density (a fade's shaved
 * sides, stubble) and darkened by its shade (an under-layer, a coil's depth). Pure.
 */
export function hairColours(geo: HairGeo, H: HeadField, h: ResolvedHair): Float32Array {
  const n = geo.verts, out = new Float32Array(n * 4);
  const hair = rgb(h.colour), skin = rgb(h.skin), beard = rgb(h.beardColour), acc = rgb(h.accColour);
  // 'Streaks' always shows its streaks: a lighter hair colour when the player has not picked a second one
  const second: RGB | null = h.colour2 ? rgb(h.colour2) : h.style === 'Streaks' ? mixRGB(hair, [1, 1, 1], 0.5) : null;
  const tone = h.colour2 ? h.tone : 'streaks';
  const fabric = hair, trim: RGB = h.colour2 ? rgb(h.colour2) : mixRGB(hair, [0, 0, 0], 0.35);
  const L = H.L;
  for (let v = 0; v < n; v++) {
    const k = geo.kind[v];
    let c: RGB;
    if (k === K.hair) {
      c = hair;
      if (second) {
        const y = geo.hf[v * 3 + 1];
        let t = 0;
        if (tone === 'tips') t = geo.along[v] > 0 ? sm(0.55, 0.78, geo.along[v]) : sm(L.top - 0.05, L.top - 0.015, y) * 0.9;
        else if (tone === 'streaks') t = geo.streak[v] ? 1 : Math.sin(Math.atan2(geo.hf[v * 3], geo.hf[v * 3 + 2]) * 9) > 0.72 ? 0.9 : 0;
        else if (tone === 'top') t = sm(L.ear.top + 0.03, L.ear.top + 0.05, y);
        else t = 1 - sm(L.ear.top - 0.012, L.ear.top + 0.01, y);
        c = mixRGB(hair, second, t);
      }
      c = mixRGB(skin, c, geo.dens[v]);
    } else if (k === K.beard) c = mixRGB(skin, beard, geo.dens[v]);
    else if (k === K.acc) c = acc;
    else if (k === K.fabric) c = fabric;
    else if (k === K.trim) c = trim;
    else c = mixRGB(skin, hair, geo.dens[v] * 0.25);
    const s = geo.shade[v];
    out[v * 4] = c[0] * s; out[v * 4 + 1] = c[1] * s; out[v * 4 + 2] = c[2] * s; out[v * 4 + 3] = 1;
  }
  return out;
}

// ── the meshes ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** The scene's one hair material (white albedo × vertex colour; two-sided, like the cloth: a curtain's inside is hair). */
export function hairMaterial(scene: Scene): PBRMaterial {
  let m = materials.get(scene);
  if (m && m.getScene() === scene && scene.materials.includes(m)) return m;
  m = new PBRMaterial('felHair', scene);
  m.albedoColor = Color3.White();
  m.metallic = 0; m.roughness = 0.72;
  m.backFaceCulling = false; m.twoSidedLighting = true;
  m.metadata = { felHair: true };
  materials.set(scene, m);
  scene.onDisposeObservable.addOnce(() => materials.delete(scene));
  return m;
}

export interface HairSummary {
  style: string;
  beard: string | null;
  /** the static mesh and the sway mesh (null when the style has none) */
  mesh: Mesh | null;
  sway: Mesh | null;
  verts: number; tris: number; chains: number;
  draws: number;
  rebuilt: boolean;
}

function release(st: HairState): void {
  try { st.mesh?.dispose(false, false); } catch { /* gone with the scene */ }
  if (st.sway) { disposeSwingRig(st.sway.rig); try { st.sway.mesh.dispose(false, false); } catch { /* gone */ } }
  st.mesh = null; st.sway = null; st.geo = null; st.geoKey = ''; st.colourKey = '';
}

/** Forget the hair on a body (its meshes go; the baked Hair_* nodes are left as they are). */
export function clearHair(root: TransformNode): void {
  const st = states.get(root);
  if (st) release(st);
}

/** Can this body wear code-built hair? A kit body (the paint body's name) that carries the forge's Hair_* nodes. */
export function canWearBuiltHair(meshes: readonly AbstractMesh[]): boolean {
  const body = bodyMeshOf(meshes);
  return !!body && isPaintBody(body.name) && meshes.some((m) => /^Hair_/.test(m.name));
}

const chainPart = (swing: number, sy: number, bone: 'Head' | 'Neck'): CreatorPart => ({
  id: 'hair', shape: 'strand', bone, pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, sy, 1], colour: '#FFFFFF', finish: 'matte', mirror: false, swing,
});

/** Build the sway mesh: every chain's vertices in its own shape space (y down the chain), on the creator's swing rig. */
function buildSway(root: TransformNode, skeleton: Skeleton, geo: HairGeo, colours: Float32Array, mat: PBRMaterial, name: string): HairState['sway'] {
  if (!geo.chains.length) return null;
  const frames = rigFrames(skeleton, root);
  if (!frames) return null;
  const items: Parameters<typeof buildSwingRig>[1] = [];
  const order: number[] = [];
  geo.chains.forEach((ch, ci) => {
    const node = boneNode(skeleton, ch.attach), bone = findBone(skeleton, ch.attach);
    const restInv = frames.restInv.get(ch.attach);
    if (!node || !bone || !restInv) return;
    const restNode = restInv.clone().invert();
    const toRoot = absRest(bone).clone().invert().multiply(restNode);
    // the chain's frame (skeleton space): +y up the chain (the strand shape hangs along −y), origin at its root
    const d = new Vector3(ch.dir[0], ch.dir[1], ch.dir[2]).normalize();
    const yAx = d.scale(-1);
    let xAx = Vector3.Cross(yAx, Math.abs(yAx.y) < 0.9 ? Vector3.Up() : Vector3.Right()).normalize();
    const zAx = Vector3.Cross(xAx, yAx).normalize();
    xAx = Vector3.Cross(yAx, zAx).normalize();
    const F = Matrix.FromValues(xAx.x, xAx.y, xAx.z, 0, yAx.x, yAx.y, yAx.z, 0, zAx.x, zAx.y, zAx.z, 0, ch.root[0], ch.root[1], ch.root[2], 1);
    const m = F.multiply(toRoot).multiply(restInv);
    const sy = Math.max(0.05, ch.length / 0.1);
    // this chain's vertices and triangles
    const map = new Map<number, number>();
    const positions: number[] = [], normals: number[] = [], indices: number[] = [], cols: number[] = [], own: number[] = [];
    for (let v = 0; v < geo.verts; v++) {
      if (geo.chain[v] !== ci) continue;
      map.set(v, positions.length / 3);
      own.push(v);
      const px = geo.P[v * 3] - ch.root[0], py = geo.P[v * 3 + 1] - ch.root[1], pz = geo.P[v * 3 + 2] - ch.root[2];
      positions.push(px * xAx.x + py * xAx.y + pz * xAx.z, (px * yAx.x + py * yAx.y + pz * yAx.z) / sy, px * zAx.x + py * zAx.y + pz * zAx.z);
      const nx = geo.N[v * 3], ny = geo.N[v * 3 + 1], nz = geo.N[v * 3 + 2];
      // the rig divides a normal by the part's scale: hand it the scaled-space normal so it comes out right
      normals.push(nx * xAx.x + ny * xAx.y + nz * xAx.z, (nx * yAx.x + ny * yAx.y + nz * yAx.z) * sy, nx * zAx.x + ny * zAx.y + nz * zAx.z);
      cols.push(colours[v * 4], colours[v * 4 + 1], colours[v * 4 + 2], 1);
    }
    for (let t = 0; t + 2 < geo.ind.length; t += 3) {
      const a = map.get(geo.ind[t]), b = map.get(geo.ind[t + 1]), c = map.get(geo.ind[t + 2]);
      if (a != null && b != null && c != null) indices.push(a, b, c);
    }
    if (!indices.length) return;
    order.push(...own);
    items.push({ part: chainPart(ch.swing, sy, ch.attach), mirrored: false, m, node, restNode, geo: { positions, normals, indices }, colours: cols });
  });
  if (!items.length) return null;
  const { rig, meshes } = buildSwingRig(root, items, () => mat, name);
  const mesh = meshes.get('matte') ?? [...meshes.values()][0];
  if (!mesh) { disposeSwingRig(rig); return null; }
  mesh.metadata = { ...(mesh.metadata ?? {}), felHair: true, felHairSway: true, felCreatorPart: false };
  return { rig, mesh, order: Int32Array.from(order) };
}

/**
 * Make the body wear this hair (or none, with null). Idempotent: the same hair changes nothing; a colour change rewrites the
 * colour buffers; any other change swaps the meshes (from the cache when this hair was built before). Returns null for a
 * body it cannot fit (left as it was).
 */
export function syncHair(
  spawn: { root: TransformNode; skeleton?: Skeleton | null; meshes?: readonly AbstractMesh[] },
  hair: ResolvedHair | null,
  opts: { cover?: 'none' | 'compress' | 'hide' } = {},
): HairSummary | null {
  const { root } = spawn;
  if (root.isDisposed()) return null;
  const meshes = (spawn.meshes ?? root.getChildMeshes()).filter((m) => !m.isDisposed());
  let st = states.get(root);
  if (!hair || !canWearBuiltHair(meshes)) { if (st) release(st); return null; }
  const body = bodyMeshOf(meshes)!;
  const F = clothFieldOf(body);
  const H = F && body.skeleton ? headFieldOf(body) : null;
  if (!F || !H || !body.skeleton) { if (st) release(st); return null; }
  if (!st) { st = { mesh: null, sway: null, geoKey: '', colourKey: '', geo: null, hooked: false }; states.set(root, st); }
  if (!st.hooked) { st.hooked = true; const s = st; root.onDisposeObservable.addOnce(() => { release(s); states.delete(root); }); }
  // the baked nodes go: every style is built here
  for (const m of meshes) if (/^Hair_/.test(m.name)) m.isVisible = false;
  // under a raised hood or a helmet the hair is off (a covering too); the beard stays
  const cover = opts.cover ?? 'none';
  const eff: ResolvedHair = cover === 'hide' ? { ...hair, style: 'Bald', acc: [] } : hair;
  const summary = (rebuilt: boolean): HairSummary => {
    const s = st!;
    root.metadata = { ...(root.metadata ?? {}), felHair: { style: eff.style, beard: eff.beard, verts: s.geo?.verts ?? 0, tris: s.geo?.tris ?? 0, chains: s.geo?.chains.length ?? 0 } };
    return {
      style: eff.style, beard: eff.beard, mesh: s.mesh, sway: s.sway?.mesh ?? null, verts: s.geo?.verts ?? 0, tris: s.geo?.tris ?? 0,
      chains: s.geo?.chains.length ?? 0, draws: (s.mesh ? 1 : 0) + (s.sway ? 1 : 0), rebuilt,
    };
  };
  if (eff.style === 'Bald' && !eff.beard) { release(st); return summary(false); }
  const tier = hairTierOf(root);
  const { key, geo } = hairGeometry(H, eff, { tier, cover: cover === 'compress' ? 'compress' : 'none', sway: true, winding: F.winding });
  const colourKey = hairColourKey(eff);
  const scene = root.getScene();
  const mat = hairMaterial(scene);
  let rebuilt = false;
  if (st.geoKey !== key || !st.mesh || st.mesh.isDisposed()) {
    release(st);
    const colours = hairColours(geo, H, eff);
    // the static mesh: every vertex not on a chain
    const map = new Int32Array(geo.verts).fill(-1);
    let nv = 0;
    for (let v = 0; v < geo.verts; v++) if (geo.chain[v] < 0) map[v] = nv++;
    const s = H.local.scale, o = H.local.offset;
    const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), J = new Float32Array(nv * 4), W = new Float32Array(nv * 4), col = new Float32Array(nv * 4);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < geo.verts; v++) {
      const i = map[v]; if (i < 0) continue;
      for (let k = 0; k < 3; k++) {
        const p = (geo.P[v * 3 + k] - o[k]) / s;
        pos[i * 3 + k] = p; nrm[i * 3 + k] = geo.N[v * 3 + k];
        if (p < lo[k]) lo[k] = p; if (p > hi[k]) hi[k] = p;
      }
      uv[i * 2] = geo.UV[v * 2]; uv[i * 2 + 1] = geo.UV[v * 2 + 1];
      for (let k = 0; k < 4; k++) { J[i * 4 + k] = geo.J[v * 4 + k]; W[i * 4 + k] = geo.W[v * 4 + k]; col[i * 4 + k] = colours[v * 4 + k]; }
    }
    const ind: number[] = [];
    for (let t = 0; t + 2 < geo.ind.length; t += 3) {
      const a = map[geo.ind[t]], b = map[geo.ind[t + 1]], c = map[geo.ind[t + 2]];
      if (a >= 0 && b >= 0 && c >= 0) ind.push(a, b, c);
    }
    if (nv && ind.length) {
      const mesh = new Mesh(`HairBuilt_${root.name}`, scene);
      const vd = new VertexData();
      vd.positions = pos; vd.normals = nrm; vd.uvs = uv; vd.indices = ind; vd.matricesIndices = J; vd.matricesWeights = W;
      vd.applyToMesh(mesh, false);
      mesh.setVerticesData(VertexBuffer.ColorKind, col, true, 4);
      mesh.useVertexColors = true; mesh.hasVertexAlpha = false;
      mesh.skeleton = body.skeleton; mesh.numBoneInfluencers = 3;
      mesh.sideOrientation = body.sideOrientation;
      mesh.parent = body.parent;
      mesh.position.copyFrom(body.position);
      mesh.rotationQuaternion = body.rotationQuaternion?.clone() ?? null;
      mesh.rotation.copyFrom(body.rotation);
      mesh.scaling.copyFrom(body.scaling);
      mesh.isPickable = false; mesh.checkCollisions = false; mesh.doNotSerialize = true;
      mesh.receiveShadows = body.receiveShadows;
      mesh.material = mat;
      mesh.metadata = { felHair: true, felNoShapeCache: true };
      // culled on its bind box: the body's, grown to the hair (an afro stands above the head)
      const bi = body.getBoundingInfo();
      const mn = Vector3.Minimize(bi.minimum, new Vector3(lo[0], lo[1], lo[2])), mx = Vector3.Maximize(bi.maximum, new Vector3(hi[0], hi[1], hi[2]));
      mesh.setBoundingInfo(new BoundingInfo(mn, mx, mesh.computeWorldMatrix(true)));
      st.mesh = mesh;
    }
    st.sway = buildSway(root, body.skeleton, geo, colours, mat, `HairSway_${root.uniqueId}`);
    st.geo = geo; st.geoKey = key; st.colourKey = colourKey;
    rebuilt = true;
  } else if (st.colourKey !== colourKey) {
    const colours = hairColours(geo, H, eff);
    if (st.mesh) {
      const out = new Float32Array(st.mesh.getTotalVertices() * 4);
      let i = 0;
      for (let v = 0; v < geo.verts; v++) if (geo.chain[v] < 0) { out.set(colours.subarray(v * 4, v * 4 + 4), i * 4); i++; }
      st.mesh.updateVerticesData(VertexBuffer.ColorKind, out);
    }
    if (st.sway) {
      const out = new Float32Array(st.sway.order.length * 4);
      st.sway.order.forEach((v, i) => out.set(colours.subarray(v * 4, v * 4 + 4), i * 4));
      st.sway.mesh.updateVerticesData(VertexBuffer.ColorKind, out);
    }
    st.colourKey = colourKey;
  }
  void isCovering;
  return summary(rebuilt);
}
