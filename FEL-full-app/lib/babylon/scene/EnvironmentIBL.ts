// EnvironmentIBL — the image-based lighting the renderer never had.
//
// Every PBRMaterial in this app was reflecting *nothing*: scene.environmentTexture
// was never set anywhere in the codebase, so metals resolved to flat plastic-gray
// and roughness did almost no visible work. That is the single largest fidelity
// gap in the renderer, and it is fixable without shipping a single new asset.
//
// Rather than fetch a prefiltered .env off a CDN (a network dependency, and one
// fixed lighting environment for every venue), this builds the cube procedurally
// from the venue's OWN mood palette — the same sky/ground/sun values LightRig
// already lights the scene with. A night football stadium gets a cool blue env,
// a dojo gets a warm amber one, and the reflections finally agree with the
// direct lighting instead of contradicting it.
//
// Output is a linear-space FLOAT cube so the sun lobe can carry real HDR energy
// (>1.0) — that is what makes speculars glint and what gives the existing bloom
// threshold in LightRig something legitimate to bloom on.

import { Constants, RawCubeTexture, Texture, Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import { MOODS, type VenueMood } from './moods';

/** Per-face resolution. 64 is plenty: this is a smooth gradient plus one sun
 *  lobe, and mip generation blurs it further for rough materials anyway.
 *  6 faces * 64 * 64 * 4ch * 4 bytes = 393KB, built once per mode load. */
const FACE_SIZE = 64;

/** Cube face order Babylon expects: +X, -X, +Y, -Y, +Z, -Z. Maps a face index
 *  and its (u,v) in [-1,1] to the world direction that texel represents. */
function faceDirection(face: number, u: number, v: number): Vector3 {
  switch (face) {
    case 0: return new Vector3(1, -v, -u);   // +X
    case 1: return new Vector3(-1, -v, u);   // -X
    case 2: return new Vector3(u, 1, v);     // +Y
    case 3: return new Vector3(u, -1, -v);   // -Y
    case 4: return new Vector3(u, -v, 1);    // +Z
    default: return new Vector3(-u, -v, -1); // -Z
  }
}

function hexToLinear(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const srgb = [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
  // sRGB -> linear. The env texture is consumed as linear data (gammaSpace =
  // false below), so skipping this would wash every reflection out.
  return srgb.map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))) as [number, number, number];
}

const smoothstep = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * Build and install a procedural IBL environment for this venue's mood.
 * Returns a disposer; safe to call once per scene from mountLightRig.
 */
export function mountEnvironmentIBL(scene: Scene, mood: VenueMood): () => void {
  const M = MOODS[mood];
  const sky = hexToLinear(M.sky);
  const ground = hexToLinear(M.ground);
  const sunCol = hexToLinear(M.sun);

  // Horizon sits between sky and ground — a real horizon is the haze where they
  // meet, not a hard seam, and PBR roughness lobes sample across it constantly.
  const horizon: [number, number, number] = [
    (sky[0] + ground[0]) * 0.5, (sky[1] + ground[1]) * 0.5, (sky[2] + ground[2]) * 0.5,
  ];

  // M.sunDir points *from* the sun toward the scene (LightRig feeds it straight
  // to DirectionalLight.direction), so the sun sits along its negation.
  const toSun = new Vector3(...M.sunDir).normalize().scale(-1);

  const faces: Float32Array[] = [];
  for (let face = 0; face < 6; face++) {
    const data = new Float32Array(FACE_SIZE * FACE_SIZE * 4);
    for (let y = 0; y < FACE_SIZE; y++) {
      for (let x = 0; x < FACE_SIZE; x++) {
        // Texel centre in [-1, 1].
        const u = ((x + 0.5) / FACE_SIZE) * 2 - 1;
        const v = ((y + 0.5) / FACE_SIZE) * 2 - 1;
        const dir = faceDirection(face, u, v).normalize();

        // Vertical gradient: ground below, sky above, haze through the horizon.
        const up = dir.y;
        let r: number, g: number, b: number;
        if (up >= 0) {
          const t = smoothstep(up * 1.6);      // most of the gradient near the horizon
          r = horizon[0] + (sky[0] - horizon[0]) * t;
          g = horizon[1] + (sky[1] - horizon[1]) * t;
          b = horizon[2] + (sky[2] - horizon[2]) * t;
        } else {
          const t = smoothstep(-up * 2.0);
          r = horizon[0] + (ground[0] - horizon[0]) * t;
          g = horizon[1] + (ground[1] - horizon[1]) * t;
          b = horizon[2] + (ground[2] - horizon[2]) * t;
        }

        // Sun lobe — a tight core for mirror-like speculars plus a wide falloff
        // that keeps the whole sky side brighter, the way real skylight works.
        const cosAngle = Vector3.Dot(dir, toSun);
        const core = Math.pow(Math.max(0, cosAngle), 512) * M.sunIntensity * 12;
        const glow = Math.pow(Math.max(0, cosAngle), 8) * M.sunIntensity * 0.35;
        const sunAmt = core + glow;
        r += sunCol[0] * sunAmt;
        g += sunCol[1] * sunAmt;
        b += sunCol[2] * sunAmt;

        const i = (y * FACE_SIZE + x) * 4;
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 1;
      }
    }
    faces.push(data);
  }

  const cube = new RawCubeTexture(
    scene, faces, FACE_SIZE,
    Constants.TEXTUREFORMAT_RGBA, Constants.TEXTURETYPE_FLOAT,
    true,      // generateMipMaps — rough materials sample the blurred chain
    false,     // invertY
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  // The data above is already linear light, not sRGB pixels. Leaving this true
  // would double-decode it and crush every reflection dark.
  cube.gammaSpace = false;

  scene.environmentTexture = cube;
  // Reflections should support the mood, not overpower the key light — the
  // DirectionalLight is still doing the dramatic work.
  scene.environmentIntensity = 0.85;                                //TUNE(elijah)

  return () => {
    if (scene.environmentTexture === cube) scene.environmentTexture = null;
    cube.dispose();
  };
}
