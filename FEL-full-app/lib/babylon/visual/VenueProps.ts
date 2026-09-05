// VenueProps — ship pass 4, phase 2: the CC0 prop dressing for every venue.
//
// One loader, one placement table per venue key (venuePropSets.ts). Spec venues
// call it from NexusVenue.mountVenue after the spec is built; the procedural
// modes (skate, snowboard, surf, gymnastics, mixed combat) call it directly.
// Each unique model loads once per scene and repeats as instances; props are
// scenery only — not pickable, no collisions, outside every playing area.
// Assets: public/models/props/<kit>/<model>.glb (Kenney, CC0; see manifest.json).
import { Color3, PBRMaterial, SceneLoader, TransformNode } from '@babylonjs/core';
import type { AbstractMesh, Mesh, Scene } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { VENUE_PROP_SETS, type PropPlacement } from './venuePropSets';

export interface VenuePropsHandle { root: TransformNode; count: number; dispose(): void }

const modelCache = new WeakMap<Scene, Map<string, Promise<Mesh[]>>>();

async function loadModel(scene: Scene, kit: string, model: string): Promise<Mesh[]> {
  let cache = modelCache.get(scene); if (!cache) { cache = new Map(); modelCache.set(scene, cache); }
  const key = `${kit}/${model}`;
  let p = cache.get(key);
  if (!p) {
    p = SceneLoader.ImportMeshAsync('', `/models/props/${kit}/`, `${model}.glb`, scene).then((r) => {
      const meshes = r.meshes.filter((m): m is Mesh => (m as Mesh).getTotalVertices?.() > 0) as Mesh[];
      for (const m of r.meshes) {
        m.isPickable = false; m.setEnabled(false);   // the source stays hidden; instances show
        // Kenney's nature/racing kits export KHR_materials_unlit; lit PBR keeps them in the IBL like everything else.
        const mat = m.material; if (mat instanceof PBRMaterial && mat.unlit) { mat.unlit = false; mat.metallic = 0; mat.roughness = 0.85; }
      }
      return meshes;
    });
    cache.set(key, p);
  }
  return p;
}

/** Mount the prop set for `venueKey` under a fresh root. Resolves after every model loaded (failures skip the prop). */
export async function mountVenueProps(scene: Scene, venueKey: string, parent?: TransformNode): Promise<VenuePropsHandle | null> {
  const set = VENUE_PROP_SETS[venueKey];
  if (!set || !set.length) return null;
  const root = new TransformNode(`venue_props_${venueKey}`, scene);
  if (parent) root.parent = parent;
  let count = 0;
  const instances: AbstractMesh[] = [];
  await Promise.all(set.map(async (p: PropPlacement, i: number) => {
    let meshes: Mesh[];
    try { meshes = await loadModel(scene, p.kit, p.model); } catch { return; }
    const holder = new TransformNode(`prop_${p.model}_${i}`, scene);
    holder.parent = root;
    holder.position.set(p.at[0], p.at[1], p.at[2]);
    holder.rotation.y = p.yaw ?? 0;
    const s = p.scale ?? 1; holder.scaling.set(s, s, s);
    for (const src of meshes) {
      // a tinted placement gets a clone with its own material (instances share the source's); untinted ones instance
      const inst: AbstractMesh = p.tint ? tintedClone(scene, src, `${src.name}_t${i}`, p.tint) : src.createInstance(`${src.name}_i${i}`);
      inst.parent = holder;
      // the source mesh keeps its own transform inside the kit file; the instance repeats it under the holder
      inst.position.copyFrom(src.position); inst.rotationQuaternion = src.rotationQuaternion?.clone() ?? null; inst.rotation.copyFrom(src.rotation); inst.scaling.copyFrom(src.scaling);
      inst.isPickable = false; inst.receiveShadows = true; inst.setEnabled(true);
      instances.push(inst);
    }
    count++;
  }));
  return { root, count, dispose() { for (const m of instances) m.dispose(); root.dispose(); } };
}

/** For a spec venue: the root is the built scene's root; the venue key comes from the spec's venue name map. */
export function propSetFor(specVenueId: string): string | null {
  const map: Record<string, string> = {
    basketball_dunk: 'venice-court', basketball_h2h: 'venice-court', basketball_3v3: 'venice-court', court_carnival: 'venice-court',
    karate_h2h: 'dojo', karate_endless: 'dojo', golf_loop: 'links', derby: 'ballpark', penalty: 'stadium', football_rush: 'gridiron',
    tennis: 'venice-court', volleyball: 'surf-break', gymnastics: 'gym', dance: 'dojo',
  };
  return map[specVenueId] ?? null;
}

/** Clone a kit mesh with a tinted copy of its material: the palette texture stays, multiplied by `hex`. Cached per (material, tint). */
const tintCache = new Map<string, PBRMaterial>();
function tintedClone(scene: Scene, src: Mesh, name: string, hex: string): Mesh {
  const c = src.clone(name, null, true) as Mesh;
  const base = src.material;
  if (base instanceof PBRMaterial) {
    const key = `${base.uniqueId}|${hex}`;
    let m = tintCache.get(key);
    if (!m || m.getScene() !== scene) { m = base.clone(`${base.name}_tint_${hex}`); m.albedoColor = Color3.FromHexString(hex); tintCache.set(key, m); }
    c.material = m;
  }
  return c;
}
