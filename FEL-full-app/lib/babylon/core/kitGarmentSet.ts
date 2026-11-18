// kitGarmentSet — the Blender-made garments, put into a kit body when it loads (lane/kit-mac-jobs, owner 2026-11-18: "The clothes
// are the biggest eye sore immediately" … "make the clothes appear to be skin tight and not baggy, or more natural").
//
// Two jobs from the owner's art list, built headless from the CC0 MakeHuman garments (docs/SHORTS-BUILD-STEPS.md,
// docs/JERSEY-BUILD-STEPS.md; scripts/avatar/mpfb/onepiece-shorts.py, jersey.py, then fit-outfit.py and kit-fit/graft.ts):
//   · the ONE-PIECE SHORT: one piece of cloth with a real crotch, fitted close to the legs and seat, in place of today's three
//     pieces (a band and two leg tubes that each reach 10 cm into the other leg) — knob `kit.onePieceShorts`;
//   · the NEW JERSEYS: `top_basketball` (the court modes' default top while on) and `top_football` (carried by the body, so the
//     Meshy football pack is no longer fetched) — knob `kit.newJerseys`.
//
// THE FILES. Each is a small "garment set" GLB per body (public/models/kits/sets/), written by graft.ts in the kit body's OWN bind
// space: each mesh's positions and normals are already in the space of the body garment named by its `felKitGarment.target`,
// and its joints are indices into that set's skin, whose joint NAMES map onto the body's bones. No body file changes.
//
// THE SWAP happens once per loaded container (CharacterLibrary.loadContainer), before any spawn is cloned from it, so applyKit,
// the body mask, the paint, the tint and the body merge all see the new garments as if the body file had always carried them:
//   · `replace`: the named items' meshes (e.g. shorts_court and shorts_glitch) take the set's geometry; same mesh, same material;
//   · `add`: a new mesh `Kit_<slot>_<item>` on the target garment's skeleton and parent, wearing a copy of its material renamed
//     `<jersey|shorts>.<item>` (the Closet's tint lands by that prefix).
// With both knobs at 0 nothing is fetched and nothing changes. A set that fails to load leaves the body exactly as it was.
import { Mesh, VertexBuffer, VertexData } from '@babylonjs/core';
import type { AssetContainer, Skeleton } from '@babylonjs/core';
import { feel } from '@/lib/feel-panel/feel';
import { KIT_BODY_MOBILE_URL, KIT_BODY_URL, type BodyType } from './heroBody';
import { NEW_JERSEYS } from './sportKitDefaults';
import { applyInseamShade, joiningShare } from './inseamShade';

/** Knob `kit.onePieceShorts`: 1 = the one-piece short on the kit bodies; 0 = today's three-piece short (default). */
export const ONE_PIECE_SHORTS = 1;   // owner 2026-11-18 pick (3) from the contact sheet (was 0)

export type GarmentSetKind = 'shorts' | 'jerseys';
export const KIT_GARMENT_SETS: Readonly<Record<GarmentSetKind, Readonly<Record<BodyType, string>>>> = {
  shorts: { male: '/models/kits/sets/fel-kit-male.shorts1p.glb', female: '/models/kits/sets/fel-kit-female.shorts1p.glb' },
  jerseys: { male: '/models/kits/sets/fel-kit-male.jerseys.glb', female: '/models/kits/sets/fel-kit-female.jerseys.glb' },
};

/** Which kit body a file is (desktop or phone), or null for any other file. Pure. */
export function kitBodyOf(url: string): BodyType | null {
  for (const sex of ['male', 'female'] as const) if (url === KIT_BODY_URL[sex] || url === KIT_BODY_MOBILE_URL[sex]) return sex;
  return null;
}

/** The knobs as they stand now (feel panel overrides only where the panel is open; else the shipped defaults). */
export function garmentSetKnobs(): Record<GarmentSetKind, boolean> {
  return { shorts: feel('kit.onePieceShorts', ONE_PIECE_SHORTS) >= 1, jerseys: feel('kit.newJerseys', NEW_JERSEYS) >= 1 };
}

/** The set files a body file takes under these knobs (none for a non-kit body, or with both knobs off). Pure. */
export function garmentSetsFor(url: string, knobs: Record<GarmentSetKind, boolean>): string[] {
  const sex = kitBodyOf(url);
  if (!sex) return [];
  return (['shorts', 'jerseys'] as const).filter((k) => knobs[k]).map((k) => KIT_GARMENT_SETS[k][sex]);
}

export interface SetGarment {
  name: string; target: string; mode: 'replace' | 'add'; slot: string; items: string[]; material: string;
  positions: Float32Array; normals: Float32Array; uv: Float32Array | null; uv2: Float32Array | null;
  /** joint indices into `jointNames`, 4 a vertex */
  joints: Float32Array; weights: Float32Array; jointNames: string[]; indices: Uint32Array;
}

const NCOMP: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
/** Parse a garment-set GLB (graft.ts's output). Pure: bytes in, arrays out. Throws on anything that is not one. */
export function parseGarmentSet(buf: ArrayBuffer): SetGarment[] {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
  const jl = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl)));
  const binOff = 20 + jl + 8, binLen = dv.getUint32(20 + jl, true);
  const read = (i: number): Float32Array => {
    const a = json.accessors[i], n = NCOMP[a.type], bv = json.bufferViews[a.bufferView];
    const base = binOff + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0), size = a.componentType === 5126 || a.componentType === 5125 ? 4 : a.componentType === 5123 ? 2 : 1;
    const stride = bv.byteStride ?? n * size, out = new Float32Array(a.count * n);
    if (base + (a.count - 1) * stride + n * size > binOff + binLen) throw new Error('accessor past the end');
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
      const o = base + k * stride + c * size;
      out[k * n + c] = a.componentType === 5126 ? dv.getFloat32(o, true) : a.componentType === 5125 ? dv.getUint32(o, true) : a.componentType === 5123 ? dv.getUint16(o, true) : dv.getUint8(o);
      if (a.normalized && a.componentType === 5121) out[k * n + c] /= 255;
    }
    return out;
  };
  const out: SetGarment[] = [];
  (json.nodes as { mesh?: number; skin?: number }[]).forEach((node) => {
    if (node.mesh == null || node.skin == null) return;
    const mesh = json.meshes[node.mesh], g = mesh.extras?.felKitGarment, p = mesh.primitives[0];
    if (!g || !p) return;
    out.push({
      name: mesh.name, target: g.target, mode: g.mode, slot: g.slot, items: g.items ?? [], material: g.material,
      positions: read(p.attributes.POSITION), normals: read(p.attributes.NORMAL),
      uv: p.attributes.TEXCOORD_0 != null ? read(p.attributes.TEXCOORD_0) : null, uv2: p.attributes.TEXCOORD_1 != null ? read(p.attributes.TEXCOORD_1) : null,
      joints: read(p.attributes.JOINTS_0), weights: read(p.attributes.WEIGHTS_0),
      jointNames: (json.skins[node.skin].joints as number[]).map((j) => json.nodes[j].name as string),
      indices: Uint32Array.from(read(p.indices)),
    });
  });
  return out;
}

/** The matrix slot each bone name skins through on `sk` (the slot joint indices address: Bone._index, else its place). */
function boneSlots(sk: Skeleton): Map<string, number> {
  const m = new Map<string, number>();
  sk.bones.forEach((b, i) => { const k = (b as unknown as { _index?: number })._index; m.set(b.name, k != null && k >= 0 ? k : i); });
  return m;
}
function vertexData(g: SetGarment, sk: Skeleton): VertexData | null {
  const slots = boneSlots(sk);
  const map = g.jointNames.map((n) => slots.get(n) ?? -1);
  if (map.some((i) => i < 0)) return null;
  const vd = new VertexData();
  vd.positions = g.positions; vd.normals = g.normals; vd.indices = g.indices;
  if (g.uv) vd.uvs = g.uv;
  if (g.uv2) vd.uvs2 = g.uv2;
  vd.matricesIndices = g.joints.map((j) => map[j] ?? 0); vd.matricesWeights = g.weights;
  return vd;
}
const KIND_OF = /^Kit_(tops|shorts|shoes)_([A-Za-z0-9_-]+)$/;

/** Put a parsed set into a loaded kit-body container. Returns what changed (names), for the console and the tests. */
export function applyGarmentSet(container: AssetContainer, set: readonly SetGarment[]): { replaced: string[]; added: string[] } {
  const done = { replaced: [] as string[], added: [] as string[] };
  for (const g of set) {
    const target = container.meshes.find((m) => m.name === g.target) as Mesh | undefined;
    if (!target?.skeleton || !(target instanceof Mesh)) continue;
    if (g.mode === 'replace') {
      const seen = new Set<unknown>();
      for (const m of container.meshes) {
        const k = KIND_OF.exec(m.name);
        if (!k || k[1] !== g.slot || !g.items.includes(k[2]) || !(m instanceof Mesh) || !m.skeleton) continue;
        const vd = vertexData(g, m.skeleton); if (!vd) continue;
        const geo = m.geometry;
        if (geo && seen.has(geo)) { m.refreshBoundingInfo(); done.replaced.push(m.name); continue; }
        if (geo) {
          seen.add(geo);
          for (const kind of geo.getVerticesDataKinds()) if (![VertexBuffer.PositionKind, VertexBuffer.NormalKind, VertexBuffer.MatricesIndicesKind, VertexBuffer.MatricesWeightsKind].includes(kind)) geo.removeVerticesData(kind);
        }
        vd.applyToMesh(m, false);
        m.metadata = { ...(m.metadata ?? {}), felKitGarmentSet: g.name };   // kit-tight: its own lift / flare share (fitTight.liftScaleOf)
        for (const user of geo?.meshes ?? [m]) { (user as Mesh).subMeshes = []; (user as Mesh)._createGlobalSubMesh(true); user.refreshBoundingInfo(); }
        done.replaced.push(m.name);
      }
      // kit-tight: the one-piece short's darker inseam panel (inseamShade.ts, kit.inseamShade; 0 = none)
      if (g.slot === 'shorts') {
        const shorts = container.meshes.filter((m) => m instanceof Mesh && done.replaced.includes(m.name)) as Mesh[];
        try { applyInseamShade(shorts, g.uv, g.indices, joiningShare(g.joints, g.weights, g.jointNames, g.positions), container.scene); } catch (e) { console.warn(`[FEL-KIT] inseam shade skipped: ${String((e as Error)?.message ?? e).slice(0, 120)}`); }
      }
    } else if (!container.meshes.some((m) => m.name === g.name)) {
      const scene = container.scene;
      const vd = vertexData(g, target.skeleton); if (!vd) continue;
      const m = new Mesh(g.name, scene);
      scene.removeMesh(m); container.meshes.push(m);
      vd.applyToMesh(m, false);
      if (m.geometry) { scene.removeGeometry(m.geometry); container.geometries.push(m.geometry); }
      m.parent = target.parent;
      m.position.copyFrom(target.position); m.scaling.copyFrom(target.scaling);
      if (target.rotationQuaternion) m.rotationQuaternion = target.rotationQuaternion.clone(); else m.rotation.copyFrom(target.rotation);
      m.skeleton = target.skeleton; m.numBoneInfluencers = target.numBoneInfluencers;
      m.receiveShadows = target.receiveShadows; m.renderingGroupId = target.renderingGroupId; m.layerMask = target.layerMask; m.isPickable = target.isPickable;
      m.isVisible = false;   // applyKit decides
      const mat = target.material?.clone(g.material);
      if (mat) { scene.removeMaterial(mat); container.materials.push(mat); m.material = mat; }
      m.metadata = { felKitGarmentSet: g.name };
      done.added.push(g.name);
    }
  }
  return done;
}

const setCache = new Map<string, Promise<SetGarment[] | null>>();
function fetchSet(url: string): Promise<SetGarment[] | null> {
  let p = setCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`)))).then(parseGarmentSet)
      .catch((e: unknown) => { console.warn(`[FEL-KIT] garment set ${url} did not load: ${String((e as Error)?.message ?? e).slice(0, 120)}`); setCache.delete(url); return null; });
    setCache.set(url, p);
  }
  return p;
}

/** CharacterLibrary.loadContainer's hook: the sets this body takes under the knobs, applied to the container. Never throws. */
export async function loadGarmentSets(container: AssetContainer, url: string, knobs = garmentSetKnobs()): Promise<void> {
  const urls = garmentSetsFor(url, knobs);
  for (const u of urls) {
    const set = await fetchSet(u);
    if (!set) continue;
    try {
      const r = applyGarmentSet(container, set);
      console.info(`[FEL-KIT] garment set ${u.split('/').pop()}: replaced ${r.replaced.join(', ') || '-'}; added ${r.added.join(', ') || '-'}`);
    } catch (e) { console.warn(`[FEL-KIT] garment set ${u} skipped: ${String((e as Error)?.message ?? e).slice(0, 120)}`); }
  }
}
