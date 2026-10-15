// SUN SHAFTS (w3-atmos, wave 3) - Babylon's VolumetricLightScatteringPostProcess for the goldenHour sun, on the tv ('high') tier,
// for the modes where the sun is in the frame often enough to be worth what the pass costs.
//
// THE COST. The pass is a radial blur of a second render of the scene's occluders (everything drawn black, the sun disc drawn
// bright) at half resolution: one more full pass over the scene's draws and a blur on every frame, whether or not the sun is in
// the picture - and it may never be switched on or off mid-play (a post toggled at runtime compiles a shader on the frame it
// changes; ImpactFrame.ts). So it is mounted once at load, for a mode, or not at all. That makes the question "is the sun in the
// frame often enough?" the whole design, and it is a MEASURED answer, not a guess:
//
//   MEASUREMENT (w3-atmos, 2026-10-14; the rig, 1080p desktop tier, 40 samples across the first ~8 s of each mode, the camera's
//   own play framing, the rig's sun projected 2000 m out through the live view-projection): the sun was in the frame in NONE of
//   them. The rig's moods put the sun 50-60 degrees up (goldenHour's direction is (-0.6, -1, -0.35)); a play camera's frame is a
//   46 degree field looking out at a horizon, so the sun is 2 to 30 half-screens above the top edge, or behind the camera. The
//   dunk's venue sun is lower (24 degrees) and still two half-screens out. SUN_SHAFT_MEASURED below is that table.
//
// So the allowlist (SUN_SHAFT_MODES) is empty and nothing mounts by default. What is built is the mount itself and the gate, so a
// mode or a camera that DOES look at the sun (a replay that cranes to it, a finish line flown into the sun) earns it by adding its
// measured share to the table - and `?lookon=sunshafts` (with `?tier=high` on a desktop) puts it on any goldenHour mode for one
// load, so the owner can see what it is before deciding. A real GPU and the owner's eye are the judge of the look (the proof sheet
// points the camera at the sun).
//
// Not a gameplay thing; GLSL only (Babylon's own shaders); presentation only.

import { Color3, DynamicTexture, MeshBuilder, StandardMaterial, Texture, VolumetricLightScatteringPostProcess } from '@babylonjs/core';
import type { Camera, DirectionalLight, Mesh, Observer, Scene } from '@babylonjs/core';
import { MOODS, type VenueMood } from './moods';
import type { QualityTier } from './QualityTier';
import { motionPolicy } from '../../a11y/reducedMotion';
import { lookFeatureOff, lookFeatureOn } from './graphicsSetting';
import { sceneModeId } from './lookPolicy';

/**
 * Share of sampled frames with the sun inside the picture, per ModeDefinition.modeId (the measurement above): `samples` frames
 * (every 12th over ~8 s; racing: with the throttle held down the first straight). Only goldenHour-moded modes could use it;
 * aeroaces covers Red Rock Canyon (the goldenHour circuit) and Ember Caldera, velocitykart the Boardwalk Loop.
 */
export const SUN_SHAFT_MEASURED: Readonly<Record<string, { share: number; samples: number }>> = {
  dunk: { share: 0, samples: 40 }, dunkduel: { share: 0, samples: 40 }, onevone: { share: 0, samples: 40 }, threevthree: { share: 0, samples: 40 },
  threepoint: { share: 0, samples: 40 }, carnival: { share: 0, samples: 40 }, skateboard: { share: 0, samples: 40 }, surf: { share: 0, samples: 40 },
  volleyball: { share: 0, samples: 40 }, tennis: { share: 0, samples: 40 }, aeroaces: { share: 0, samples: 80 }, velocitykart: { share: 0, samples: 40 },
};
/** A mode earns the pass when the sun is in frame at least this often. */
export const SUN_SHAFT_MIN_SHARE = 0.25;
/** The modes the pass mounts for: the measured table's winners (none yet), by ModeDefinition.modeId. */
export const SUN_SHAFT_MODES: ReadonlySet<string> = new Set(Object.entries(SUN_SHAFT_MEASURED).filter(([, m]) => m.share >= SUN_SHAFT_MIN_SHARE).map(([k]) => k));

export interface SunShaftGate { tier: QualityTier; mood: VenueMood; modeId: string | null; reducedMotion: boolean; off?: boolean; on?: boolean }

/** Pure: does this mount get sun shafts? The tv ('high') tier, the goldenHour sun, a mode that earned it (or `on`, the override), not reduced motion, not switched off. */
export function sunShaftsWanted(g: SunShaftGate, earned: ReadonlySet<string> = SUN_SHAFT_MODES): boolean {
  if (g.off || g.reducedMotion) return false;
  if (g.tier !== 'high' || g.mood !== 'goldenHour') return false;
  return !!g.on || (!!g.modeId && earned.has(g.modeId));
}

/**
 * Pure: is the sun in the frame? `viewProj` is the camera's view * projection (row-major, Babylon's m[]), `eye` the camera and
 * `toward` the unit direction TOWARD the sun. `margin` 1 = the frame itself, 1.2 = a fifth of a screen past its edge.
 */
export function sunInFrame(viewProj: ArrayLike<number>, eye: { x: number; y: number; z: number }, toward: { x: number; y: number; z: number }, margin = 1): boolean {
  const m = viewProj, d = 2000;
  const x = eye.x + toward.x * d, y = eye.y + toward.y * d, z = eye.z + toward.z * d;
  const cx = x * m[0] + y * m[4] + z * m[8] + m[12], cy = x * m[1] + y * m[5] + z * m[9] + m[13], w = x * m[3] + y * m[7] + z * m[11] + m[15];
  if (!(w > 0)) return false;
  return Math.abs(cx / w) <= margin && Math.abs(cy / w) <= margin;
}

/** Pure: the unit direction toward a directional light that travels along `dir`. */
export function towardLight(dir: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const l = Math.hypot(dir.x, dir.y, dir.z) || 1;
  return { x: -dir.x / l, y: -dir.y / l, z: -dir.z / l };
}

/** The pass's settings, one table. exposure is the strength of the shafts; the rest are Babylon's own knobs (decay: how far a ray carries). */
export const SHAFT_LOOK = { ratio: 0.5, samples: 56, exposure: 0.17, decay: 0.965, weight: 0.52, density: 0.92, sunDistance: 150, sunSize: 60 } as const;

export interface SunShaftsHandle { readonly post: VolumetricLightScatteringPostProcess; dispose(): void }

/**
 * Mount the pass (once, in the light rig's captureVenue, after load()). Null when it is not wanted, or the GPU cannot run it.
 * The sun disc sits INSIDE the sky dome (the dome is drawn black in the occluder pass and would hide a sun beyond it).
 */
export function mountSunShafts(scene: Scene, tier: QualityTier, mood: VenueMood, camera?: Camera | null): SunShaftsHandle | null {
  const gate: SunShaftGate = { tier, mood, modeId: sceneModeId(scene), reducedMotion: !motionPolicy().flash, off: lookFeatureOff('sunshafts'), on: lookFeatureOn('sunshafts') };
  if (!sunShaftsWanted(gate)) return null;
  const cam = camera ?? scene.activeCamera ?? scene.cameras[0];
  const sun = scene.getLightByName('fel_sun') as DirectionalLight | null;
  if (!cam || !sun) return null;
  const toward = towardLight(sun.direction);
  let mesh: Mesh | null = null, mat: StandardMaterial | null = null, tex: DynamicTexture | null = null, post: VolumetricLightScatteringPostProcess;
  try {
    mesh = MeshBuilder.CreatePlane('sky_sun_shaft_disc', { size: 1 }, scene);   // 'sky*': the shadow rig never lists it
    mesh.billboardMode = 7;   // BILLBOARDMODE_ALL
    mesh.scaling.setAll(SHAFT_LOOK.sunSize);
    mesh.isPickable = false; mesh.receiveShadows = false; mesh.applyFog = false;
    mat = new StandardMaterial('sky_sun_shaft_disc_m', scene);
    mat.disableLighting = true; mat.emissiveColor = Color3.FromHexString(MOODS[mood].sun); mat.diffuseColor = Color3.Black(); mat.specularColor = Color3.Black();
    // a soft round sun, not the bare plane's hard yellow square (measured on the rig): the shape is the texture's alpha
    tex = new DynamicTexture('sky_sun_shaft_disc_t', { width: 128, height: 128 }, scene, true);
    const g = tex.getContext() as unknown as CanvasRenderingContext2D;
    const gr = g.createRadialGradient(64, 64, 2, 64, 64, 62);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); tex.update(); tex.hasAlpha = true;
    mat.opacityTexture = tex; mat.disableDepthWrite = true;
    mesh.material = mat;
    post = new VolumetricLightScatteringPostProcess('fel_sun_shafts', SHAFT_LOOK.ratio, cam, mesh, SHAFT_LOOK.samples, Texture.BILINEAR_SAMPLINGMODE, scene.getEngine(), false);
  } catch (e) {
    console.warn('[FEL-SHAFTS] sun shafts unavailable, continuing without them:', e);
    mesh?.dispose(); mat?.dispose(); tex?.dispose();
    return null;
  }
  post.exposure = SHAFT_LOOK.exposure; post.decay = SHAFT_LOOK.decay; post.weight = SHAFT_LOOK.weight; post.density = SHAFT_LOOK.density;
  const obs: Observer<Scene> = scene.onBeforeRenderObservable.add(() => {
    if (!mesh) return;
    const e = cam.globalPosition;
    mesh.position.set(e.x + toward.x * SHAFT_LOOK.sunDistance, e.y + toward.y * SHAFT_LOOK.sunDistance, e.z + toward.z * SHAFT_LOOK.sunDistance);
  });
  console.info(`[FEL-SHAFTS] sun shafts mounted (${gate.on ? 'override' : 'measured'}; the sun ${Math.round(Math.asin(Math.max(-1, Math.min(1, toward.y))) * 180 / Math.PI)} degrees up)`);
  return {
    post,
    dispose() { scene.onBeforeRenderObservable.remove(obs); try { post.dispose(cam); } catch { /* the camera went first */ } mesh?.dispose(); mat?.dispose(); tex?.dispose(); mesh = null; },
  };
}
