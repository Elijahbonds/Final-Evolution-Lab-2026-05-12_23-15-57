// VenueProps — ship pass 4, phase 2: the CC0 prop dressing for every venue.
//
// One loader, one placement table per venue key (venuePropSets.ts). Spec venues
// call it from NexusVenue.mountVenue after the spec is built; the procedural
// modes (skate, snowboard, surf, gymnastics, mixed combat) call it directly.
// Each unique model loads once per scene and repeats as instances; props are
// scenery only — not pickable, no collisions, outside every playing area.
// Assets: public/models/props/<kit>/<model>.glb (Kenney, CC0; see manifest.json).
import { Color3, Matrix, PBRMaterial, Quaternion, Ray, SceneLoader, TransformNode, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Mesh, Scene } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { VENUE_PROP_SETS, type PropPlacement } from './venuePropSets';

export interface VenuePropsHandle { root: TransformNode; count: number; dispose(): void }

const modelCache = new WeakMap<Scene, Map<string, Promise<Mesh[]>>>();

// Pass 7 phase 7 (materials): the Kenney kits export every material with metallicFactor 1 and roughness 1 and NO metallic
// texture (measured 2026-09-06, _mat-diag: leafsGreen / woodBark / grass / dirt all met=1) — under image lighting a fully
// metallic flat colour reads as a dark gem. Untextured metals become matte dielectrics; the kit's teal greens and orange
// bark take real plant colours (a placement `tint` still multiplies on top).
// ARENA-10PHASE P8: the round pines (tree_pineRoundA/B — the dojo set's) carry `leafsDark` / `woodBarkDark`, which the
// palette missed, so they kept the kit's TEAL (0.17/0.65/0.67) and read as "floating blue geo" over the shrine wall.
const KIT_PALETTE: Record<string, string> = { leafsGreen: '#3F9A55', leafsDark: '#2F7A45', grass: '#4C9E58', woodBark: '#8B5E3C', woodBarkDark: '#6E4A30', dirt: '#8A6A4A' };
const kitFixed = new WeakSet<PBRMaterial>();
function normaliseKitMaterial(mat: PBRMaterial): void {
  if (kitFixed.has(mat)) return; kitFixed.add(mat);
  if (mat.unlit) mat.unlit = false;
  if (!mat.metallicTexture && (mat.metallic ?? 0) > 0.5) { mat.metallic = 0; mat.roughness = 0.9; }
  const hex = KIT_PALETTE[mat.name]; if (hex && !mat.albedoTexture) mat.albedoColor = Color3.FromHexString(hex);
}

async function loadModel(scene: Scene, kit: string, model: string): Promise<Mesh[]> {
  let cache = modelCache.get(scene);
  if (!cache) { cache = new Map(); modelCache.set(scene, cache); const c = cache; scene.onDisposeObservable.addOnce(() => { c.clear(); modelCache.delete(scene); }); }   // OOM-HYGIENE: nothing outlives the scene
  const key = `${kit}/${model}`;
  let p = cache.get(key);
  if (!p) {
    p = SceneLoader.ImportMeshAsync('', `/models/props/${kit}/`, `${model}.glb`, scene).then((r) => {
      const meshes = r.meshes.filter((m): m is Mesh => (m as Mesh).getTotalVertices?.() > 0) as Mesh[];
      for (const m of r.meshes) {
        m.isPickable = false; m.setEnabled(false);   // the source stays hidden; instances show
        // Kenney's nature/racing kits export KHR_materials_unlit; lit PBR keeps them in the IBL like everything else.
        const mat = m.material; if (mat instanceof PBRMaterial) normaliseKitMaterial(mat);
      }
      return meshes;
    });
    cache.set(key, p);
  }
  return p;
}

export interface MountPropsOptions {
  /** ARENA-10PHASE P9 (2026-09-07): drop every placement onto the ground UNDER it. Placement tables are authored at y = 0,
   *  which is the surface only on a flat venue — the snow piste is pitched 0.22 rad and drops 56 m over the run, so the
   *  'slope' set's pines stood at y 0 while the snow fell away beneath them (playtest d3d4a93: "floating low-poly pine",
   *  worse the further down the run). A ray from 400 m up finds the pickable ground at (x, z); no hit = the authored y. */
  snapToGround?: boolean;
  /**
   * BOARD VENUES (2026-09-12): push every placement OUTWARD along x by this many metres, keeping its sign.
   *
   * Placement tables are authored against one world's width. The slope set's pines stand at x ±19…±24 because
   * the piste was 17 m half-wide; now that each snow venue brings its own corridor the glacier's groom is 34 m
   * half-wide, and those same pines would stand in the middle of the run — trees you ride through. Shifting the
   * set out by (venue bound − the width it was authored for) keeps a hand-composed treeline composed instead of
   * re-authoring three sets, and a placement ON the centre line (x 0: the start flag) stays there.
   */
  lateralShift?: number;
  /**
   * SHARED-PLACE-FLOOR (2026-09-14): scale every placement's x AND z by this factor (model scale untouched).
   *
   * The 'skatepark' set was composed around the old fixed 33 m park. Board venues made the park 48–62 m, and the set
   * never moved: its fence lines and barrier run stood 20 m INSIDE Venice's fence, across the riding area, and its
   * tents sat on the slab. A park that grew keeps its composition when the dressing grows with it.
   */
  spread?: number;
}

/** Mount the prop set for `venueKey` under a fresh root. Resolves after every model loaded (failures skip the prop). */
export async function mountVenueProps(scene: Scene, venueKey: string, parent?: TransformNode, opts: MountPropsOptions = {}): Promise<VenuePropsHandle | null> {
  const set = VENUE_PROP_SETS[venueKey];
  if (!set || !set.length) return null;
  const root = new TransformNode(`venue_props_${venueKey}`, scene);
  if (parent) root.parent = parent;
  let count = 0;
  const instances: AbstractMesh[] = [];
  /** Collected per master, then uploaded once as a thin-instance matrix buffer. */
  const thin: Array<{ master: Mesh; matrix: Matrix }> = [];
  const down = new Vector3(0, -1, 0);
  let snapped = 0, missed = 0;
  // the ground was built THIS frame and has not rendered yet: its world matrix is still identity, so a ray would hit a
  // flat, unrotated, origin-centred copy of it at y 0 (measured 2026-09-08: 62 of 71 slope props "snapped" to y 0 over
  // snow at −9…−54). Bring every pickable mesh's world matrix up to date before the first ray.
  if (opts.snapToGround) for (const m of scene.meshes) if (m.isPickable && m.isEnabled() && m.isVisible) m.computeWorldMatrix(true);
  const groundYAt = (x: number, z: number): number | null => {
    const hit = scene.pickWithRay(new Ray(new Vector3(x, 400, z), down, 800), (m) => m.isPickable && m.isEnabled() && m.isVisible && !instances.includes(m));
    return hit?.hit && hit.pickedPoint ? hit.pickedPoint.y : null;
  };
  await Promise.all(set.map(async (p: PropPlacement, i: number) => {
    let meshes: Mesh[];
    try { meshes = await loadModel(scene, p.kit, p.model); } catch { return; }
    const holder = new TransformNode(`prop_${p.model}_${i}`, scene);
    holder.parent = root;
    const shift = opts.lateralShift ?? 0;
    const k = opts.spread ?? 1;
    const px = (p.at[0] === 0 ? 0 : p.at[0] + Math.sign(p.at[0]) * shift) * k;
    const pz = p.at[2] * k;
    holder.position.set(px, p.at[1], pz);
    if (opts.snapToGround) { const gy = groundYAt(px, pz); if (gy !== null) { holder.position.y = gy + p.at[1]; snapped++; } else missed++; }
    holder.rotation.y = p.yaw ?? 0;
    const s = p.scale ?? 1; holder.scaling.set(s, s, s);
    for (const src of meshes) {
      // a tinted placement instances a TINTED MASTER (one hidden clone per source × tint, shared by every placement with that
      // tint — the slope's 60 green pines were 60 clones = 60 draws, measured 2026-09-06); untinted ones instance the source
      const master = p.tint ? tintedMaster(scene, src, p.tint) : src;
      // receiveShadows lives on the SOURCE — an InstancedMesh only reads its source's flag, and setting it on the instance
      // is a no-op that logs a BJS warning per instance (217 per /try boot, measured 2026-09-07)
      master.receiveShadows = true;
      // THIN INSTANCES (2026-09-12). createInstance produced one node — and, measured, one shadow-map
      // draw per cascade — for every copy: 321 casters generating ~1017 draws on 1v1, which is the
      // whole draw budget. A thin instance is a matrix in a buffer on the master, so every copy of a
      // palm is ONE draw in the main pass and one per cascade, shadows included. The master must be
      // enabled for that (it is the mesh being drawn), which is also why registering disabled masters
      // as shadow casters silently deleted 187 scenery shadows earlier today.
      // The matrix is the placement's world transform composed with the part's own transform inside
      // the kit file, expressed relative to the master — which is parented to nothing and left at
      // identity below, so "relative to the master" is world space.
      holder.computeWorldMatrix(true);
      const local = Matrix.Compose(
        src.scaling.clone(),
        src.rotationQuaternion?.clone() ?? Quaternion.FromEulerVector(src.rotation),
        src.position.clone(),
      );
      thin.push({ master, matrix: local.multiply(holder.getWorldMatrix()) });
    }
    count++;
  }));
  if (opts.snapToGround) console.info(`[FEL-PROPS] ${venueKey}: ${snapped} placements dropped onto the ground, ${missed} kept their authored height`);

  // upload one matrix buffer per master: N copies collapse to a single draw each
  const byMaster = new Map<Mesh, Matrix[]>();
  for (const t of thin) { const list = byMaster.get(t.master) ?? []; list.push(t.matrix); byMaster.set(t.master, list); }
  const touched: Mesh[] = [];
  for (const [master, mats] of byMaster) {
    const buf = new Float32Array(mats.length * 16);
    mats.forEach((m, k) => m.copyToArray(buf, k * 16));
    // the master IS the drawn mesh now: parked at identity so its thin matrices read as world space
    master.parent = null;
    master.position.set(0, 0, 0); master.rotation.set(0, 0, 0); master.rotationQuaternion = null; master.scaling.set(1, 1, 1);
    master.isPickable = false;
    master.setEnabled(true);
    master.thinInstanceSetBuffer('matrix', buf, 16, true);
    touched.push(master);
  }
  console.info(`[FEL-PROPS] ${venueKey}: ${thin.length} placements across ${byMaster.size} thin-instanced masters`);
  return {
    root, count,
    dispose() {
      for (const m of touched) { try { m.thinInstanceCount = 0; m.setEnabled(false); } catch { /* disposed */ } }
      for (const m of instances) m.dispose();
      root.dispose();
    },
  };
}

/** For a spec venue: the root is the built scene's root; the venue key comes from the spec's venue name map. */
export function propSetFor(specVenueId: string): string | null {
  const map: Record<string, string> = {
    basketball_dunk: 'venice-court-meshy', basketball_h2h: 'venice-court-meshy', basketball_3v3: 'venice-court-meshy', court_carnival: 'venice-court',
    karate_h2h: 'dojo', karate_endless: 'dojo', golf_loop: 'links', derby: 'ballpark', penalty: 'stadium', football_rush: 'gridiron',
    tennis: 'venice-court', volleyball: 'beach-court', gymnastics: 'gym', dance: 'dojo',   // P5: volleyball had the SURF set (authored for a 90 m water strip — the bus 60 m out over nothing)
  };
  return map[specVenueId] ?? null;
}

/** Clone a kit mesh with a tinted copy of its material: the palette texture stays, multiplied by `hex`. Cached per (material, tint)
 *  PER SCENE (OOM-HYGIENE, 2026-09-07): this was one module-level Map keyed by the base material's uniqueId, and uniqueIds are
 *  global-monotonic, so every scene's tinted materials stayed in the Map after the scene was disposed — a PBRMaterial holds its
 *  scene, so each exited venue with a tinted line was retained whole (meshes, geometry, textures) for the life of the tab. */
const tintCache = new WeakMap<Scene, Map<string, PBRMaterial>>();
const masterCache = new WeakMap<Scene, Map<string, Mesh>>();
/** One hidden tinted clone per (source mesh, tint) per scene; placements instance it so a tinted line stays one draw. */
function tintedMaster(scene: Scene, src: Mesh, hex: string): Mesh {
  let map = masterCache.get(scene); if (!map) { map = new Map(); masterCache.set(scene, map); }
  const key = `${src.uniqueId}|${hex}`;
  let m = map.get(key);
  if (!m || m.isDisposed()) { m = tintedClone(scene, src, `${src.name}_tm_${hex.replace('#', '')}`, hex); m.setEnabled(false); m.isPickable = false; map.set(key, m); }
  return m;
}

function tintedClone(scene: Scene, src: Mesh, name: string, hex: string): Mesh {
  const c = src.clone(name, null, true) as Mesh;
  const base = src.material;
  if (base instanceof PBRMaterial) {
    const key = `${base.uniqueId}|${hex}`;
    let mats = tintCache.get(scene); if (!mats) { mats = new Map(); tintCache.set(scene, mats); }
    let m = mats.get(key);
    if (!m) { m = base.clone(`${base.name}_tint_${hex}`); m.albedoColor = Color3.FromHexString(hex); mats.set(key, m); }
    c.material = m;
  }
  return c;
}
