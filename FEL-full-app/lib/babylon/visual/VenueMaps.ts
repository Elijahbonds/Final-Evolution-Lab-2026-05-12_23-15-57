/**
 * VenueMaps — mounts a pipeline-baked Meshy venue map as the environment of a
 * NexusWebScene venue (the court, the walls, the world around the play).
 *
 * The maps in public/models/maps/ are the real environment art. They never
 * rendered in either stack (WebP + Draco — see scripts/map/pipeline.mts);
 * the pipeline emits extension-free GLBs under public/models/maps/baked/ and
 * this module loads THOSE. A venue without a baked map keeps its procedural
 * ground exactly as before — mounting is strictly additive.
 *
 * Placement is data-driven by lib/map-data.ts (scale / mapOffset /
 * mapRotationY / matteFloor), the same config the THREE map-loader used, so
 * alignment tuning carries over.
 *
 * The procedural ground mesh is hidden, not removed: the camera box, court
 * markings logic and any ground-referencing gameplay keep their object.
 */

import { Mesh, PBRMaterial, Scene, SceneLoader, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { MAPS } from '@/lib/map-data';

const mounted = new WeakSet<Scene>();

/**
 * Try to mount the baked venue map under `root`. Returns true when the map
 * is in the scene (caller then hides its procedural ground). Never throws:
 * any failure leaves the venue exactly as it was.
 */
export async function mountVenueMap(scene: Scene, root: TransformNode, mapKey: string): Promise<boolean> {
  const cfg = MAPS[mapKey];
  if (!cfg || cfg.meshDisabled || mounted.has(scene)) return false;   // meshDisabled: the entry describes the venue, the art is elsewhere
  const url = `/models/maps/baked/${mapKey}.glb`;

  try {
    // HEAD-gate: an unbaked map must not cost a console error or a loader
    // exception on every venue load.
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok) return false;

    const res = await SceneLoader.ImportMeshAsync('', '/models/maps/baked/', `${mapKey}.glb`, scene);
    mounted.add(scene);

    const mapRoot = new TransformNode(`nexus_venue_map_${mapKey}`, scene);
    mapRoot.parent = root;
    for (const m of res.meshes) {
      if (!m.parent) m.parent = mapRoot;
      m.isPickable = false;
      if (m instanceof Mesh) m.receiveShadows = true;
      // The matte-blacktop lesson (M12.2): scanned courts read as water under
      // specular. Venue maps are scenery — receive light, never mirror it.
      const mat = m.material;
      if (mat instanceof PBRMaterial) {
        mat.roughness = Math.max(mat.roughness ?? 0.7, cfg.matteFloor ? 0.96 : 0.7);
        mat.metallic = 0;
        mat.environmentIntensity = cfg.matteFloor ? 0.02 : Math.min(mat.environmentIntensity ?? 0.3, 0.3);
        // M12.2(b) emissive lift: re-use the albedo as a low-intensity emissive
        // so a matte court reads as lit paint, never a dark pool.
        if (cfg.matteFloor && mat.albedoTexture && !mat.emissiveTexture) {
          mat.emissiveTexture = mat.albedoTexture;
          mat.emissiveColor.set(1, 1, 1);
          mat.emissiveIntensity = 0.3;
        }
      }
    }
    mapRoot.scaling.setAll(cfg.scale);
    mapRoot.rotation.y = cfg.mapRotationY ?? 0;
    const oy = cfg.mapOffset?.[1] ?? 0;
    // surfaceY is the MEASURED walking-surface height (scripts/map/measure-surface.mts);
    // drop the map by it so the real court lands on the gameplay invariant floorY=0.
    mapRoot.position.set(cfg.mapOffset?.[0] ?? 0, oy - (cfg.surfaceY ?? 0), cfg.mapOffset?.[2] ?? 0);
    return true;
  } catch {
    return false;
  }
}
