// ROAD SURFACE (w3-atmos, wave 3) - Part B for Velocity Kart: "road material: an asphalt normal map, painted kerbs with relief,
// wet track gloss in rain". The road was a painted tarmac texture on a PBR slab with roughness 0.92 (and an environment
// intensity of 0.35, so nothing it did could ever shine). Three changes, all of them the surface and none of them the course:
//
//   ASPHALT    the shared floor-grain detail map (visual/groundTextures: aggregate relief in the normal, a rougher dark speck and a
//              smoother pale one) over the road's own paint. The road's UV is one road-width a tile across and along, so the
//              grain is tiled by the road's width, not the slab's chord.
//   KERBS      the apex blocks get rumble ribs: a normal map of a few raised ribs across each block, so the red and white catch the
//              light in stripes instead of lying flat.
//   WET GLOSS  the road is flagged for the weather's wet pass (WeatherFx lerps roughness and albedo on a ground it knows) with a
//              wet environment and specular level: a soaked road reflects the sky and the lamps, a dry one is as it was.
//
// Pure maths for the rib profile (`ribSlope`) and the wet response (`wetGloss`) so the numbers are held without a GPU.

import { DynamicTexture, Texture } from '@babylonjs/core';
import type { Mesh, PBRMaterial, Scene } from '@babylonjs/core';
import { applyFloorDetailToMesh } from '../visual/groundTextures';

/** How the road looks wet, as the material levels a soaked road is lerped to (WeatherFx reads them off `metadata.felWetGloss`). */
export interface WetGloss { env: number; spec: number }
/** The tarmac's dry levels (VelocityKartMode.buildRoad) and what a soaked one lerps to. */
export const ROAD_DRY = { env: 0.35, spec: 0.22 } as const;
export const ROAD_WET: WetGloss = { env: 1.0, spec: 1.0 };

/** Pure: a material level at wetness `wet01` (0 dry .. 1 soaked) between the dry value and the wet one. */
export function wetGloss(dry: number, wet: number, wet01: number): number {
  const w = Math.max(0, Math.min(1, Number.isFinite(wet01) ? wet01 : 0));
  return dry + (wet - dry) * w;
}

/** Mark a ground material so the weather's wet pass also lifts its reflections (WeatherFx.collect reads this). */
export function markWetGloss(mat: PBRMaterial, wet: WetGloss = ROAD_WET): void {
  (mat.metadata ??= {}).felWetGloss = { env: wet.env, spec: wet.spec, dryEnv: mat.environmentIntensity, drySpec: mat.specularIntensity };
}

/**
 * Layer the asphalt grain over the road (a PBR slab whose UV spans one road width a tile). The grain's relief and roughness
 * swing come from groundTextures' own levels, so the road is graded the way every other floor is, held modes excepted.
 */
export function asphaltRoad(scene: Scene, road: Mesh, halfWidth: number): boolean {
  const w = Math.max(4, halfWidth * 2);
  return applyFloorDetailToMesh(scene, road, { kind: 'asphalt', blend: 0.5 }, [w, w]);
}

// ── kerb ribs ──────────────────────────────────────────────────────────────────────────────────────────────────

export const RIBS = 6;
/** Pure: the slope (d height / dv, 0..1 across the block) of a rib profile with `ribs` raised ribs - a half-cosine bump each. */
export function ribSlope(v: number, ribs = RIBS): number {
  const t = ((v % 1) + 1) % 1 * ribs;
  return Math.sin(t * Math.PI * 2) * Math.PI * ribs * 0.5;   // h = (1 - cos(2*pi*t)) / 2  =>  dh/dv = pi * ribs * sin(2*pi*t)
}

/** Encode `ribSlope` as a tangent-space normal map row: x flat, y leaning with the slope, z up. Pure, for a test. */
export function ribNormal(v: number, strength = 0.07, ribs = RIBS): [number, number, number] {
  const sy = -ribSlope(v, ribs) * strength;
  const len = Math.hypot(0, sy, 1);
  return [0.5, 0.5 + (sy / len) * 0.5, 0.5 + (1 / len) * 0.5];
}

const ribCache = new WeakMap<Scene, DynamicTexture>();

/** The rumble-rib normal map (32 x 128, ribs across the block's length), made once per scene. */
export function kerbRibTexture(scene: Scene): DynamicTexture {
  const hit = ribCache.get(scene); if (hit) return hit;
  const W = 32, H = 128;
  const tex = new DynamicTexture('kart_kerb_ribs', { width: W, height: H }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const img = ctx.getImageData?.(0, 0, W, H);   // a headless canvas hands back no pixels: keep the flat map rather than dying
  if (img?.data && img.data.length >= W * H * 4) {
    for (let y = 0; y < H; y++) {
      const [r, g, b] = ribNormal(y / H);
      for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; img.data[o] = Math.round(r * 255); img.data[o + 1] = Math.round(g * 255); img.data[o + 2] = Math.round(b * 255); img.data[o + 3] = 255; }
    }
    ctx.putImageData(img, 0, 0);
  }
  tex.update(false);
  tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.wrapV = Texture.WRAP_ADDRESSMODE;
  ribCache.set(scene, tex);
  return tex;
}

/** Give a kerb material its ribs. False (the kerb stays flat) where a canvas cannot be made (a headless scene). */
export function ribKerb(scene: Scene, mat: PBRMaterial): boolean {
  try {
    mat.bumpTexture = kerbRibTexture(scene);
    mat.bumpTexture.level = 0.9;
    mat.roughness = Math.min(mat.roughness ?? 0.7, 0.62);
    return true;
  } catch (e) {
    console.warn('[FEL-ROAD] kerb ribs skipped:', (e as Error).message);
    return false;
  }
}
