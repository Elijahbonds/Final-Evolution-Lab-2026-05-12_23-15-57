// skinShading — the material pass that makes the forge hero read as a person
// instead of painted plastic. Runs once per GLB spawn, after the identity pipe
// has set colors, so it never fights the Closet.
//
// Ship pass, Phase 2 (owner decision 2026-09-02): PBR + a subsurface
// approximation on `skin`, cloth sheen on `jersey` / `shorts`, and a generated
// pore-noise normal map — the repo ships zero texture assets, so the map is
// authored in code like the rest of the forge.
//
// The material name contract (skin / jersey / shorts / shoes / hair) is the
// only thing this keys on. Procedural (StandardMaterial) spawns are ignored.

import { Color3, DynamicTexture, PBRMaterial } from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';
import type { QualityTier } from '../scene/QualityTier';

const PORE_TEX_KEY = '__felSkinPoreNormal';
const PORE_SIZE = 256;

/** A tileable pore/grain normal map, generated once per scene. Small
 *  high-frequency bumps: the goal is to break specular into skin-like
 *  micro-highlights, not to sculpt features. */
function poreNormalMap(scene: Scene): DynamicTexture {
  const cached = (scene.metadata ??= {})[PORE_TEX_KEY] as DynamicTexture | undefined;
  // A spawn disposed with its textures (the Closet re-spawns on every look
  // change; React's dev double-effect spawns twice) takes the shared map
  // with it. Handing the dead texture to the next spawn leaves the skin
  // material never-ready and the body invisible, so rebuild in that case.
  if (cached && cached.getInternalTexture()) return cached;
  const tex = new DynamicTexture('fel_skin_pore_normal', { width: PORE_SIZE, height: PORE_SIZE }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const img = ctx.createImageData(PORE_SIZE, PORE_SIZE);
  // height field: two octaves of value noise, tileable by construction
  const N = PORE_SIZE;
  const h = new Float32Array(N * N);
  let seed = 1337;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const octave = (cells: number, amp: number) => {
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    const s = N / cells;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const gx = x / s, gy = y / s;
      const x0 = Math.floor(gx) % cells, y0 = Math.floor(gy) % cells;
      const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
      const fx = gx - Math.floor(gx), fy = gy - Math.floor(gy);
      const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      const a = g[y0 * cells + x0], b = g[y0 * cells + x1], c = g[y1 * cells + x0], d = g[y1 * cells + x1];
      h[y * N + x] += amp * ((a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy);
    }
  };
  octave(64, 0.6);
  octave(128, 0.4);
  // normals from the height field (tangent space, +z up), wrapping at the edges
  const H = (x: number, y: number) => h[((y + N) % N) * N + ((x + N) % N)];
  const strength = 2.2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
    const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const len = Math.hypot(dx, dy, 1);
    const i = (y * N + x) * 4;
    img.data[i] = Math.round((-dx / len * 0.5 + 0.5) * 255);
    img.data[i + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
    img.data[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  tex.update(false);
  tex.wrapU = tex.wrapV = 1;   // WRAP
  scene.metadata[PORE_TEX_KEY] = tex;
  return tex;
}

export interface SkinShadingResult { skin: number; cloth: number; other: number }

/**
 * Apply the Phase 2 material set to a spawned GLB hero. Idempotent — a second
 * call re-applies the same values. Returns counts so a probe can prove it ran.
 */
export function applySkinShading(meshes: AbstractMesh[], scene: Scene, tier: QualityTier = 'desktop'): SkinShadingResult {
  const seen = new Set<PBRMaterial>();
  const out: SkinShadingResult = { skin: 0, cloth: 0, other: 0 };
  for (const m of meshes) {
    const mat = m.material;
    if (!(mat instanceof PBRMaterial) || seen.has(mat)) continue;
    seen.add(mat);
    (mat.metadata ??= {}).felShaded = true;   // AnimeInk leaves tuned materials alone
    const name = mat.name.toLowerCase();
    if (name.startsWith('skin')) {
      mat.metallic = 0;
      mat.roughness = 0.58;
      mat.specularIntensity = 0.7;
      // Subsurface approximation: translucency lets the sun bleed through thin
      // parts (ears, fingers, nose) with a warm blood tint. Cheap — no prepass
      // scattering, which is the part that costs a full-screen blur.
      const ss = mat.subSurface;
      ss.isTranslucencyEnabled = true;
      ss.translucencyIntensity = tier === 'mobile' ? 0.35 : 0.55;
      ss.tintColor = new Color3(0.82, 0.36, 0.28);
      ss.minimumThickness = 0.4;
      ss.maximumThickness = 2.0;
      if (tier !== 'mobile') {
        // No 2D canvas (NullEngine, some workers): skin still gets the
        // subsurface and roughness, just no pores. Never throws.
        try {
          const bump = poreNormalMap(scene);
          bump.level = 0.35;
          bump.uScale = 6;
          bump.vScale = 6;
          mat.bumpTexture = bump;
        } catch { /* canvas-less runtime */ }
      }
      out.skin++;
    } else if (name.startsWith('jersey') || name.startsWith('shorts')) {
      // Cloth: matte with a soft sheen at grazing angles (mesh fabric).
      mat.metallic = 0;
      mat.roughness = 0.88;
      mat.sheen.isEnabled = true;
      mat.sheen.intensity = 0.35;
      mat.sheen.roughness = 0.6;
      out.cloth++;
    } else if (name.startsWith('shoes')) {
      // Was near-white albedo at roughness 0.85 — read as a glowing block
      // under the IBL. Darker, glossier: a sneaker, not a lamp.
      mat.roughness = 0.45;
      mat.metallic = 0;
      mat.albedoColor = mat.albedoColor.scale(0.82);
      out.other++;
    } else if (name.startsWith('hair')) {
      mat.roughness = 0.5;
      mat.metallic = 0;
      mat.anisotropy.isEnabled = tier !== 'mobile';
      mat.anisotropy.intensity = 0.6;
      out.other++;
    }
  }
  return out;
}
