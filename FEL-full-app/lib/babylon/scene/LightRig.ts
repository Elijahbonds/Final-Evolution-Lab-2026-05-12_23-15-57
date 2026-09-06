// LightRig (Babylon) — standard lighting per venue mood + black-material rescue.
// Fixes: black skatepark, dark football field, mid-dunk sky collapse.

import {
  CascadedShadowGenerator, Color3, Color4, DefaultRenderingPipeline, DirectionalLight,
  HemisphericLight, ImageProcessingConfiguration, Scene, ShadowGenerator, Vector3,
} from '@babylonjs/core';
import type { AbstractMesh, PBRMaterial, StandardMaterial } from '@babylonjs/core';
import { MOODS, type VenueMood } from './moods';
import { tierRigSettings, type QualityTier } from './QualityTier';
import { mountEnvironmentIBL } from './EnvironmentIBL';

export interface LightRigHandle {
  hemi: HemisphericLight; sun: DirectionalLight;
  shadows: ShadowGenerator;
  /** The mounted post pipeline (ACES, bloom, FXAA, sharpen, vignette). */
  pipeline: DefaultRenderingPipeline;
  tier: QualityTier;
  /** M44: brief exposure pulse for a highlight beat (dunk flush, TD, KO,
   *  goal) — reads as a camera-flash without a hard cut. Self-reverts. */
  flashBeat(): void;
  dispose(): void;
}

/** Names that read as ground/floor — auto-receivers, never auto-casters (M44). */
const RECEIVER_HINTS = /floor|ground|piste|water|court|pitch|green|plate|mound|shore|park_floor|tatami|snow|sky|horizon|swell/i;

export function mountLightRig(scene: Scene, mood: VenueMood, tier: QualityTier = 'desktop'): LightRigHandle {
  const M = MOODS[mood];
  // Ship pass (2026-09-02): desktop 60 fps / mobile 30 fps. The tier decides
  // shadow map size, cascades on outdoor moods, sharpen and bloom weight.
  const T = tierRigSettings(tier, mood);

  scene.clearColor = Color4.FromHexString(M.clearColor + 'ff');
  scene.fogMode = Scene.FOGMODE_NONE;          // fog was blacking out high cameras

  const hemi = new HemisphericLight('fel_hemi', Vector3.Up(), scene);
  hemi.intensity = M.hemiIntensity;
  hemi.diffuse = Color3.FromHexString(M.sky);
  hemi.groundColor = Color3.FromHexString(M.ground);

  // Image-based lighting, built from this same mood palette. Without it every
  // PBRMaterial reflects nothing and metals read as flat plastic — see
  // EnvironmentIBL.ts. Mounted before the lights so materials compiled during
  // venue load already see an environment.
  const disposeEnv = mountEnvironmentIBL(scene, mood);

  const sun = new DirectionalLight('fel_sun', new Vector3(...M.sunDir).normalize(), scene);
  sun.intensity = M.sunIntensity;
  sun.diffuse = Color3.FromHexString(M.sun);
  sun.position = new Vector3(-M.sunDir[0], -M.sunDir[1], -M.sunDir[2]).scale(30);

  let shadows: ShadowGenerator;
  if (T.cascaded) {
    // Desktop, outdoor: three cascades keep the near shadow crisp on a
    // 60-90 m field without a 4k map. Stabilized so the edge does not swim
    // as the follow camera moves; PCF for the soft edge the blur gave us.
    const csm = new CascadedShadowGenerator(T.shadowMapSize, sun);
    csm.numCascades = 3;
    csm.lambda = 0.85;
    csm.shadowMaxZ = 90;
    csm.stabilizeCascades = true;
    csm.cascadeBlendPercentage = 0.1;
    csm.usePercentageCloserFiltering = true;
    csm.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    csm.darkness = 0.35;
    shadows = csm;
  } else {
    shadows = new ShadowGenerator(T.shadowMapSize, sun);
    shadows.useBlurExponentialShadowMap = true;   // M44: soft, cheap shadows
    shadows.blurKernel = tier === 'mobile' ? 12 : 24;   //TUNE(elijah)
    shadows.darkness = 0.35;                        //TUNE(elijah) shadows read, never pitch black
  }

  // M44: auto-classify casters/receivers by mesh name so shadows appear in
  // every mode WITHOUT any mode file calling addShadowCasters (which nothing
  // ever did — so shadows were silently absent everywhere).
  // Pass 7 follow-up (2026-09-06): the engine's real draw counter showed ~8 draws per active mesh — every caster is drawn
  // again into each cascade. Scenery that can never throw a useful shadow stays out of the map: the scanned venue maps and
  // seas (bounding radius > 25 m), the sky and backdrop domes, the boardwalk flats, the gulls, the contact-shadow discs.
  const NEVER_CAST = /^(vb_|bk_|nexus_sky|sky|fel_ground|venue_props_)|_contact$|_gull_|nexus_venue_map/i;
  const classify = (mesh: AbstractMesh): void => {
    if (!mesh.name || mesh.name.startsWith('__')) return;
    if (RECEIVER_HINTS.test(mesh.name)) { mesh.receiveShadows = true; return; }
    if (NEVER_CAST.test(mesh.name)) return;
    try {
      const r = mesh.getBoundingInfo().boundingSphere.radiusWorld;
      if (r > 25) return;                       // a scan, a sea, a dome: receives at most, never casts
      shadows.addShadowCaster(mesh, true);
    } catch { /* non-renderable */ }
  };
  for (const m of scene.meshes as AbstractMesh[]) classify(m);
  const autoObserver = scene.onNewMeshAddedObservable.add((m) => classify(m as AbstractMesh));

  const pipeline = new DefaultRenderingPipeline('fel_pipeline', true, scene, scene.cameras);
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipeline.imageProcessing.exposure = M.exposure;
  pipeline.imageProcessing.contrast = M.contrast;                 // M44 grade
  // M44: bloom on bright surfaces (backboard/floodlights/lanterns)
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = M.bloomThreshold;
  pipeline.bloomWeight = M.bloomWeight;
  pipeline.bloomScale = M.bloomScale * T.bloomScaleMul;
  // M44: free anti-aliasing + a light sharpen pass (edges were raw/jagged)
  pipeline.fxaaEnabled = true;
  pipeline.sharpenEnabled = T.sharpen;               // mobile skips the full-screen pass
  pipeline.sharpen.edgeAmount = 0.25;                             //TUNE(elijah)
  // M44: mood-tinted vignette so the grade reads on the whole frame
  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteColor.set(...M.vignetteColor);
  pipeline.imageProcessing.vignetteWeight = M.vignetteWeight;

  liftBlackMaterials(scene);

  let flashObs: ReturnType<Scene['onBeforeRenderObservable']['add']> | null = null;
  return {
    hemi, sun, shadows, pipeline, tier,
    flashBeat() {
      const base = M.exposure;
      pipeline.imageProcessing.exposure = base * 1.35;            //TUNE(elijah)
      if (flashObs) return;
      flashObs = scene.onBeforeRenderObservable.add(() => {
        const ip = pipeline.imageProcessing;
        ip.exposure += (base - ip.exposure) * 0.15;                //TUNE(elijah)
        if (Math.abs(ip.exposure - base) < 0.01) {
          ip.exposure = base;
          if (flashObs) { scene.onBeforeRenderObservable.remove(flashObs); flashObs = null; }
        }
      });
    },
    dispose() {
      if (autoObserver) scene.onNewMeshAddedObservable.remove(autoObserver);
      if (flashObs) scene.onBeforeRenderObservable.remove(flashObs);
      hemi.dispose(); sun.dispose(); shadows.dispose(); pipeline.dispose();
      disposeEnv();
    },
  };
}

/** Floor materials that would render black. Run once after each model load. */
export function liftBlackMaterials(scene: Scene): number {
  let fixed = 0;
  for (const mesh of scene.meshes as AbstractMesh[]) {
    const m = mesh.material as (PBRMaterial & StandardMaterial) | null;
    if (!m) continue;
    const albedo: Color3 | undefined = (m as PBRMaterial).albedoColor ?? (m as StandardMaterial).diffuseColor;
    const hasTex = !!((m as PBRMaterial).albedoTexture ?? (m as StandardMaterial).diffuseTexture);
    if (albedo && !hasTex && albedo.r < 0.04 && albedo.g < 0.04 && albedo.b < 0.04) {
      albedo.set(0.22, 0.22, 0.25); fixed++;
    }
    // A fully-metallic PBR material with nothing to reflect renders near-black,
    // so this used to clamp metalness down to fake a lit look. Now that the
    // scene carries a real IBL environment (EnvironmentIBL.ts) that reflection
    // exists, and clamping here would quietly cancel it out — leaving every
    // metal in the game a dull 0.25 no matter how good the environment is.
    // Keep the rescue only for scenes that genuinely have no environment.
    const hasEnv = !!(scene.environmentTexture ?? (m as PBRMaterial).reflectionTexture);
    const metallic = (m as PBRMaterial).metallic;
    if (typeof metallic === 'number' && metallic > 0.95 && !hasTex && !hasEnv) {
      (m as PBRMaterial).metallic = 0.25;
      (m as PBRMaterial).roughness = Math.max((m as PBRMaterial).roughness ?? 1, 0.6);
      fixed++;
    }
    // ambient floor: nothing may render below ~6% brightness
    const emissive: Color3 | undefined = (m as PBRMaterial).emissiveColor;
    if (emissive && emissive.r === 0 && emissive.g === 0 && emissive.b === 0 && albedo) {
      emissive.copyFrom(albedo).scaleInPlace(0.06);
    }
  }
  if (fixed) console.warn(`[FEL-LIGHT] liftBlackMaterials fixed ${fixed} materials`);
  return fixed;
}

/** Register a character/venue root's meshes as shadow casters. */
export function addShadowCasters(handle: LightRigHandle, meshes: AbstractMesh[]): void {
  for (const m of meshes) handle.shadows.addShadowCaster(m, true);
}
