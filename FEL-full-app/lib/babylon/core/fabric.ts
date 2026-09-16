// fabric — what makes a garment read as CLOTH instead of a coloured shape (appearance pass, 2026-09-16).
//
// Owner: "character appearance improvement pass for myself and for all characters, opponents, NPCs — how can I make
// the models look better, clothes, shoes, accessories", on the KIT BODY, for everyone.
//
// THE FAULT, SEEN IN A FRAME. Cropped close on the dunker: the tee is one flat pink shape with no seams, no folds and
// no surface; the shorts are a flat dark block; the shoes are two small red blobs. Reading the code said why —
// `skinShading` gives SKIN a generated pore normal map and gives cloth a sheen and nothing else. Sheen alone, under a
// soft sky and a 6 % ambient floor, produces almost no form at any distance: a matte surface with no normal is a
// silhouette filled in with a colour, which is exactly what was on screen.
//
// So cloth gets its own generated map, as the repo does everything else — authored in code, no texture assets:
//
//   THE WEAVE      warp and weft ribs at right angles, with the amplitude jitter real fabric has. This is what breaks
//                  the light across a jersey and gives a sleeve a top and a side.
//   THE KNIT       a second, coarser octave so it is not a perfect grid — a screen-door pattern reads as a screen
//                  door, and the eye finds regularity faster than it finds detail.
//   THE SCALE      per fabric type. A jersey's weave is coarse and open, a short's is tighter, a shoe's canvas is
//                  coarser still, and the same map at three tilings does all three (the floor detail maps work this
//                  way too, groundTextures.ts).
//
// Bold graphics — numbers, marks — ride on top of this, not instead of it: the owner asked for realistic material AND
// bold graphics, and they are separate layers on purpose.
import { DynamicTexture, PBRMaterial } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';

const WEAVE_TEX_KEY = '__felFabricWeaveNormal';
const WEAVE_SIZE = 256;

/** How a fabric behaves: how tight its weave tiles, how much the normal bites, how matte it is, how it sheens. */
export interface FabricLook {
  /** Tiling across the garment's UVs — bigger is a finer weave. */
  tile: number;
  /** Normal strength. Cloth is a fine surface: this wants to be felt, not seen. */
  level: number;
  roughness: number;
  sheen: number;
}

/**
 * The fabrics, measured by eye at gameplay distance (ten metres) and in a close crop.
 *
 * A basketball jersey is an open mesh knit — coarse tiling, the most visible weave of the three. Shorts are a tighter
 * woven poly. A sneaker upper is canvas or knit over foam: coarser than a short, and glossier, because a shoe is the
 * one garment with a finish on it.
 */
export const FABRICS: Readonly<Record<'jersey' | 'shorts' | 'shoes' | 'sock', FabricLook>> = {
  jersey: { tile: 26, level: 0.55, roughness: 0.88, sheen: 0.35 },
  shorts: { tile: 34, level: 0.45, roughness: 0.86, sheen: 0.30 },
  shoes: { tile: 18, level: 0.70, roughness: 0.52, sheen: 0.18 },
  sock: { tile: 40, level: 0.60, roughness: 0.92, sheen: 0.22 },
};

/**
 * A tileable weave normal map, generated once per scene.
 *
 * Built the same way as the skin's pore map (skinShading.poreNormalMap) and cached the same way, including the reason
 * for the liveness check: a spawn disposed with its textures takes the shared map with it, and handing the dead
 * texture to the next spawn leaves the material never-ready and the body INVISIBLE.
 */
export function fabricNormalMap(scene: Scene, kind: keyof typeof FABRICS = 'jersey'): DynamicTexture {
  const key = `${WEAVE_TEX_KEY}_${kind}`;
  const cached = (scene.metadata ??= {})[key] as DynamicTexture | undefined;
  if (cached && cached.getInternalTexture()) return cached;
  const N = WEAVE_SIZE;
  const tex = new DynamicTexture(`fel_fabric_weave_${kind}`, { width: N, height: N }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const img = ctx.createImageData(N, N);

  // THE HEIGHT FIELD. Warp over weft: two square waves a quarter-period out of phase, so the surface alternates
  // between threads passing over and under — which is what a weave IS, and what makes it catch light directionally
  // rather than as a uniform stipple.
  let seed = 8675309;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const THREADS = 16;                       // threads across the tile: high enough to be a texture, low enough to survive mip-mapping
  const jitterU = new Float32Array(THREADS), jitterV = new Float32Array(THREADS);
  for (let i = 0; i < THREADS; i++) { jitterU[i] = 0.75 + rnd() * 0.5; jitterV[i] = 0.75 + rnd() * 0.5; }
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x / N) * THREADS, v = (y / N) * THREADS;
      const iu = Math.floor(u) % THREADS, iv = Math.floor(v) % THREADS;
      // each thread is a rounded ridge across its cell; the two directions alternate which one is on top
      const fu = u - Math.floor(u), fv = v - Math.floor(v);
      const ridgeU = Math.sin(fu * Math.PI) * jitterU[iu];
      const ridgeV = Math.sin(fv * Math.PI) * jitterV[iv];
      const overUnder = ((iu + iv) & 1) === 0;
      h[y * N + x] = overUnder ? ridgeU * 0.75 + ridgeV * 0.25 : ridgeV * 0.75 + ridgeU * 0.25;
    }
  }
  // …plus a coarse octave so the grid is not perfect. The eye finds regularity faster than it finds detail.
  const CELLS = 8;
  const coarse = new Float32Array(CELLS * CELLS);
  for (let i = 0; i < coarse.length; i++) coarse[i] = rnd();
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const cx = Math.floor((x / N) * CELLS), cy = Math.floor((y / N) * CELLS);
      h[y * N + x] += coarse[cy * CELLS + cx] * 0.22;
    }
  }

  // THE NORMALS, by central difference, wrapped so the tile is seamless.
  const at = (x: number, y: number) => h[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = at(x + 1, y) - at(x - 1, y);
      const dy = at(x, y + 1) - at(x, y - 1);
      const len = Math.hypot(dx, dy, 1);
      const o = (y * N + x) * 4;
      img.data[o] = Math.round((-dx / len * 0.5 + 0.5) * 255);
      img.data[o + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
      img.data[o + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.update(false);
  const look = FABRICS[kind];
  tex.uScale = look.tile; tex.vScale = look.tile; tex.level = look.level;
  (scene.metadata as Record<string, unknown>)[key] = tex;
  return tex;
}

/**
 * Give a cloth material its weave. Safe on any runtime: a canvas-less engine (NullEngine, a worker) gets the roughness
 * and sheen and no map, and never throws into a spawn.
 *
 * One map per FABRIC is shared across every garment of that kind in the scene — four 256² textures for every character
 * on the court, not four per body.
 */
export function applyFabric(mat: PBRMaterial, kind: keyof typeof FABRICS): void {
  const look = FABRICS[kind];
  mat.metallic = 0;
  mat.roughness = look.roughness;
  mat.sheen.isEnabled = true;
  mat.sheen.intensity = look.sheen;
  mat.sheen.roughness = 0.6;
  try {
    const scene = mat.getScene();
    if (!scene) return;
    // ONE TEXTURE PER FABRIC, NEVER A CLONE. Tiling lives on the texture, not the material, so each fabric needs its
    // own — and the obvious way to get one, `weave.clone()`, is a trap this repo has now hit twice: a CLONED
    // DynamicTexture never becomes ready, every material holding one stays never-ready, and a never-ready material
    // does not draw. Measured here the first time round as every character on the court standing there NAKED — the
    // garments were all still present, just not rendering. Four 256² maps is nothing; a clone is a bug.
    mat.bumpTexture = fabricNormalMap(scene, kind);
  } catch { /* canvas-less runtime: the material is still matte cloth, just smooth */ }
}
