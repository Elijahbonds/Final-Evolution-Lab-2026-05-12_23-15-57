// IblShadows — contact/ambient occlusion shadows driven by the scene's IBL.
//
// This is the piece of the AAA rendering brief that Babylon 6 simply could not
// do: IblShadowsRenderPipeline does not exist before Babylon 8. It complements
// the existing ShadowGenerator rather than replacing it — the DirectionalLight
// still casts the hard key shadow, while this adds the soft grounding occlusion
// under arms, between legs, and where a player meets the floor. That contact
// darkening is most of what separates "model floating on a court" from
// "player standing on a court".
//
// It is OPT-IN (NEXT_PUBLIC_IBL_SHADOWS="true") because it is not cheap: it
// voxelizes the scene and runs an accumulation pass every frame. On the phones
// this game targets that is a real budget decision, not a free win.
//
// Ordering matters and is easy to get wrong: voxelization snapshots the geometry
// that exists AT THE TIME IT RUNS. Mount this after a mode's load() has spawned
// its venue and characters, or the voxel grid is built from an empty scene and
// the shadows silently do nothing.

import { IblShadowsRenderPipeline } from '@babylonjs/core';
import type { Camera, Mesh, Scene } from '@babylonjs/core';

export interface IblShadowsHandle {
  pipeline: IblShadowsRenderPipeline;
  /** Re-voxelize after geometry changes materially (new venue, new characters). */
  refresh(): void;
  dispose(): void;
}

export function iblShadowsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_IBL_SHADOWS === 'true';
}

/**
 * Mount IBL shadows on a populated scene. Returns null when the feature is off
 * or the pipeline cannot be created — never throws, because a shadow technique
 * is not worth taking a game mode down over.
 */
export function mountIblShadows(scene: Scene, camera: Camera): IblShadowsHandle | null {
  if (!iblShadowsEnabled()) return null;
  if (!scene.environmentTexture) {
    // The technique samples the environment to decide where light comes from;
    // with no IBL there is nothing to derive occlusion direction from.
    console.info('[FEL] IBL shadows skipped — scene has no environmentTexture.');
    return null;
  }

  // MEASURED, not assumed: on the WebGPU backend this pipeline renders the whole
  // frame black. Verified in /dev/render-check on Babylon 9.23 — identical scene,
  // WebGL2 renders correctly with the pipeline active, WebGPU goes to pure black
  // (and stays black even after detaching BOTH pipelines from the camera, so it
  // corrupts the render chain rather than just post-processing wrong).
  // A shadow technique is never worth a black screen: refuse to mount instead.
  if (scene.getEngine().constructor.name === 'WebGPUEngine') {
    console.info('[FEL] IBL shadows skipped — not compatible with the WebGPU backend.');
    return null;
  }

  try {
    const pipeline = new IblShadowsRenderPipeline('fel_ibl_shadows', scene, {
      // 2^6 = 64^3 voxel grid. Enough to ground a handful of characters on a
      // court without the voxelization cost of a 128^3 grid.
      resolutionExp: 6,                                          //TUNE(elijah)
      sampleDirections: 4,                                       //TUNE(elijah)
      ssShadowsEnabled: true,     // screen-space pass picks up fine contact detail
      shadowOpacity: 0.65,                                       //TUNE(elijah)
    }, [camera]);

    const registerAll = (): void => {
      // Only real meshes with geometry can be voxelized; the backdrop/sky domes
      // would wrap the whole grid in a shell and occlude everything inside it.
      for (const m of scene.meshes) {
        const mesh = m as Mesh;
        if (!mesh.getTotalVertices?.()) continue;
        if (/sky|horizon|backdrop/i.test(mesh.name)) continue;
        try { pipeline.addShadowCastingMesh(mesh); } catch { /* not voxelizable */ }
      }
    };

    registerAll();
    pipeline.updateSceneBounds();
    pipeline.updateVoxelization();
    pipeline.toggleShadow(true);        // a METHOD, not a boolean property

    return {
      pipeline,
      refresh() {
        registerAll();
        pipeline.updateSceneBounds();
        pipeline.updateVoxelization();
      },
      dispose() { pipeline.dispose(); },
    };
  } catch (err) {
    console.warn('[FEL] IBL shadows unavailable, continuing without them:', err);
    return null;
  }
}
