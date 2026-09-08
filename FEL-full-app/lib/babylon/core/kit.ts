// kit — the fitted garment library on a forged body (ship pass 3, rung 3).
//
// A body built by scripts/avatar/mpfb/dress-kit.py carries EVERY garment the
// Closet sells for a slot, each as its own skinned mesh named
// `Kit_<slot>_<itemId>` with its material named `<jersey|shorts|shoes>.<itemId>`,
// so the tint slots (playerIdentity.tintSlot) keep matching by prefix. Like the
// hair styles: show the equipped one per slot, hide the rest. A body without
// kit meshes (the forge hero, roster athletes) is a harmless no-op.
import { SceneLoader, VertexBuffer } from '@babylonjs/core';
import type { AbstractMesh, AssetContainer, Mesh, Scene, Skeleton } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { sportKitDefault } from './sportKitDefaults';
import { fixGarment, syncGarmentVisibility } from './garmentFixes';

export type KitSlot = 'tops' | 'shorts' | 'shoes';
export const KIT_SLOTS: readonly KitSlot[] = ['tops', 'shorts', 'shoes'];
export type Wardrobe = Partial<Record<KitSlot, string | null>>;

// A garment mesh is `Kit_<slot>_<itemId>`; the identity layer's per-mesh clones append `_c<n>` (PACK THE FIVE #1/#4,
// 2026-09-04: with the suffix unparsed every slot fell back to its FIRST garment — top_bonds and shoes_evo showed,
// tinted in the starters' colours, while top_lab and shoes_flight stayed hidden). The suffix is optional here.
const KIT_RE = /^Kit_(tops|shorts|shoes)_([A-Za-z0-9_-]+)/;
const CLONE_SUFFIX = /_(?:c|pk)\d+(?![A-Za-z0-9])/;   // `Kit_tops_top_lab_c31` → `Kit_tops_top_lab`; kit-pack instances carry `_pk<n>`

/** Parse a kit mesh name; null for anything else. */
export function kitOf(meshName: string): { slot: KitSlot; itemId: string } | null {
  const m = KIT_RE.exec(meshName.replace(CLONE_SUFFIX, '')); return m ? { slot: m[1] as KitSlot, itemId: m[2] } : null;
}

/** The mode the harness stamped on the scene these meshes live in (ModeHarness: `scene.metadata.felModeId`). */
function sceneModeId(meshes: AbstractMesh[]): string | undefined {
  for (const m of meshes) {
    const scene = typeof m.getScene === 'function' ? m.getScene() : null;
    if (scene) return (scene.metadata as { felModeId?: string } | undefined)?.felModeId;
  }
  return undefined;
}

/**
 * Show the equipped garment per slot and hide the others. Owner decision 2026-09-05 ("Per-sport defaults"): a Closet
 * pick always wins; a slot the Closet left empty (or every slot when no Closet answered — guests, the dev harness,
 * rivals on the kit body) takes the SPORT's default (sportKitDefaults.ts, by the scene's mode); an item the body does
 * not carry falls to the sport default too, then to the slot's first garment so nobody plays naked. The shown garment
 * gets its runtime read fixes (garmentFixes.ts). Returns kit meshes found (0 = no kit).
 */
export function applyKit(meshes: AbstractMesh[], wardrobe: Wardrobe | null | undefined, modeId: string | null = null): number {
  const bySlot = new Map<KitSlot, AbstractMesh[]>();
  for (const m of meshes) { const k = kitOf(m.name); if (!k) continue; (bySlot.get(k.slot) ?? bySlot.set(k.slot, []).get(k.slot)!).push(m); }
  if (!bySlot.size) return 0;
  const sport = sportKitDefault(modeId ?? sceneModeId(meshes));
  let found = 0;
  for (const [slot, list] of bySlot) {
    const byId = (id: string | null | undefined) => (id ? list.find((m) => kitOf(m.name)!.itemId === id) : undefined);
    const want = wardrobe?.[slot] ?? sport[slot] ?? null;
    const show = byId(wardrobe?.[slot]) ?? byId(sport[slot]) ?? list[0];
    for (const m of list) { m.isVisible = m === show; found++; syncGarmentVisibility(m); }
    fixGarment(show, slot, kitOf(show.name)!.itemId);
    // a garment the body does not carry but a kit PACK does (owner 2026-09-05: Meshy garments skinned to the rig):
    // fetch it, bind it to this body's skeleton, and swap it in when it lands
    if (want && !byId(want) && KIT_PACKS[want]) void attachKitPack(list[0], slot, want, list);
  }
  return found;
}

/**
 * Kit PACKS — garments skinned to the FEL rig outside the body file (scripts/meshy/fit-garment.py → public/models/kits).
 * Each holds ONE mesh `Kit_<slot>_<itemId>` on a 22-bone armature with the hero's bone names. At attach time the mesh
 * takes the body's own Skeleton (so the body's animation drives it) after its joint indices are remapped by bone name —
 * the exporter's bone order is not guaranteed to match the body's.
 */
export const KIT_PACKS: Record<string, string> = {
  top_baseball: '/models/kits/top_baseball.glb',
  top_football: '/models/kits/top_football.glb',
};
const packContainers = new WeakMap<Scene, Map<string, Promise<AssetContainer | null>>>();
const attached = new WeakMap<AbstractMesh, Set<string>>();   // per body kit mesh: pack items already attached
const templates = new WeakMap<Scene, Map<string, { mesh: Mesh; skeleton: Skeleton }>>();

function loadPack(scene: Scene, itemId: string): Promise<AssetContainer | null> {
  let map = packContainers.get(scene);
  if (!map) {
    map = new Map(); packContainers.set(scene, map);
    const m = map;   // OOM-HYGIENE: a pack container is outside the scene's arrays — release it with the scene
    scene.onDisposeObservable.addOnce(() => { for (const q of m.values()) void q.then((c) => { try { c?.dispose(); } catch { /* lost context */ } }, () => undefined); m.clear(); packContainers.delete(scene); templates.delete(scene); });
  }
  let p = map.get(itemId);
  if (!p) {
    p = SceneLoader.LoadAssetContainerAsync('', KIT_PACKS[itemId], scene).catch((e: unknown) => { console.warn(`[FEL-KIT] pack ${itemId} did not load: ${String((e as Error)?.message ?? e).slice(0, 120)}`); return null; });
    map.set(itemId, p);
  }
  return p;
}

/** Rewrite a skinned mesh's joint indices from its own skeleton's bone order to `target`'s, by bone name. */
export function remapJoints(mesh: Mesh, from: Skeleton, target: Skeleton): boolean {
  const index = new Map(target.bones.map((b, i) => [b.name, i] as const));
  const map = from.bones.map((b) => index.get(b.name) ?? -1);
  if (map.some((i) => i < 0)) return false;
  if (map.every((i, k) => i === k)) return true;   // same order already
  for (const kind of [VertexBuffer.MatricesIndicesKind, VertexBuffer.MatricesIndicesExtraKind]) {
    const data = mesh.getVerticesData(kind);
    if (!data) continue;
    const out = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = map[data[i]] ?? 0;
    mesh.setVerticesData(kind, out, false);
  }
  return true;
}

async function attachKitPack(sibling: AbstractMesh, slot: KitSlot, itemId: string, list: AbstractMesh[]): Promise<void> {
  const done = attached.get(sibling) ?? new Set<string>();
  if (done.has(itemId)) return;
  done.add(itemId); attached.set(sibling, done);
  const scene = sibling.getScene();
  const c = await loadPack(scene, itemId);
  if (!c || sibling.isDisposed() || !sibling.skeleton) return;
  // One TEMPLATE per pack per scene (the first body pays the container instantiate); every later body takes a mesh clone
  // that shares the template's geometry plus a 22-bone skeleton clone — football pools a dozen defenders and paid a full
  // instantiate for each (measured 44–50 fps, 2026-09-05).
  let tpl = templates.get(scene)?.get(itemId);
  if (!tpl) {
    const inst = c.instantiateModelsToScene((n) => `${n}_pk`, false, { doNotInstantiate: true });
    const prefix = `Kit_${slot}_${itemId}`;
    const m0 = inst.rootNodes.flatMap((r) => [r, ...r.getChildMeshes()]).find((n) => n.name.startsWith(prefix) && ((n as Mesh).getTotalVertices?.() ?? 0) > 0) as Mesh | undefined;
    const s0 = inst.skeletons[0] ?? m0?.skeleton ?? null;
    if (!m0 || !s0) { console.warn(`[FEL-KIT] pack ${itemId}: instantiate produced no skinned mesh`); return; }
    m0.setEnabled(false); m0.isVisible = false; m0.parent = null;
    for (const r of inst.rootNodes) if (r !== m0 && r.getChildMeshes().length === 0) r.dispose();
    tpl = { mesh: m0, skeleton: s0 };
    let map = templates.get(scene); if (!map) { map = new Map(); templates.set(scene, map); }
    map.set(itemId, tpl);
  }
  const mesh = tpl.mesh.clone(`Kit_${slot}_${itemId}_pk${sibling.uniqueId}`, null, true) as Mesh;
  mesh.setEnabled(true);
  const packSkeleton = tpl.skeleton.clone(`${tpl.skeleton.name}_pk${sibling.uniqueId}`);
  // The pack mesh's vertices live in the PACK's bind space (Blender's export of the same rig); a straight skeleton swap
  // deformed it into a blob (measured 2026-09-05). So the pack keeps its own Skeleton and inverse binds, and each of its
  // bones reads the BODY's matching transform node — the body's animation drives it through the pack's own binds.
  const heroBones = new Map(sibling.skeleton.bones.map((b) => [b.name, b] as const));
  let linked = 0;
  for (const b of packSkeleton.bones) {
    const hb = heroBones.get(b.name); const tn = hb?.getTransformNode();
    if (tn) { b.linkTransformNode(tn); linked++; }
  }
  if (linked !== packSkeleton.bones.length) { console.warn(`[FEL-KIT] pack ${itemId}: ${linked}/${packSkeleton.bones.length} bones matched the body — skipped`); mesh.dispose(); return; }
  mesh.skeleton = packSkeleton;
  mesh.parent = sibling.parent;
  mesh.position.copyFrom(sibling.position); mesh.rotationQuaternion = sibling.rotationQuaternion?.clone() ?? null; mesh.rotation.copyFrom(sibling.rotation); mesh.scaling.copyFrom(sibling.scaling);
  mesh.isPickable = false;
  mesh.onDisposeObservable.add(() => packSkeleton.dispose());
  // swap in: the fallback the slot showed goes invisible, the pack garment takes the slot's fixes
  for (const m of list) { m.isVisible = false; syncGarmentVisibility(m); }
  list.push(mesh); mesh.isVisible = true;
  // pack garments are fitted with ease in Blender (fit-garment.py) — the runtime inflate is a 15k-vertex CPU rewrite per spawn,
  // and football spawns defenders all game (measured 44–50 fps with it, 2026-09-05); shoes still take their fold
  if (slot === 'shoes') fixGarment(mesh, slot, itemId);
  console.info(`[FEL-KIT] pack ${itemId} attached to ${sibling.parent?.name ?? 'body'}`);
}
