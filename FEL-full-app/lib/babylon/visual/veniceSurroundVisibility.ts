/**
 * Venice LOOK — the Venice dunk's sky and light (DunkMode + DunkDuelMode, under Venice only). Scene-only; never edits GLB bytes.
 *
 * DUNK-VENICE-ENV-RENDER (2026-09-28). This pass used to mount /models/maps/venice-court-surround.glb, KEEP its Ocean / trunk /
 * frond nodes, HIDE its clutter and scale its palms to ~10 m tips. Measured at a1a1c5f9 it had NEVER mounted the GLB:
 * `ensureVeniceSurroundMounted` stood down whenever any node named `trunk*` existed, and the venue spec's own stub palms
 * (`prop_palm_*`, hidden once the kit loads) carry exactly that name — so the "surround" was three hidden stub cones scaled
 * ×2.2–2.6 and nothing else. It is also the wrong asset to mount here: the GLB is a toy-scale diorama (its ocean is a 12 m
 * disc at the origin, its nine palms are untextured cones within 3 m of centre court — on the court at native scale), so
 * the only thing the pass ever delivered was the golden clear colour. What it does now:
 *
 *  · THE SKY — the Venice kit's own sunset (`/backdrops/venice-sky-sunset.jpg`, the backdrop `lib/map-data.ts` gives the
 *    venice-blue-court map) laid into the venue's sky dome, horizon on the sea line, sun where the key light comes from.
 *    Only the photo's lower band is used: its top third is the arched red cloud field the owner turned down as a sky on
 *    2026-09-05 ("a red wall — not hell"); above the band the dome fades to a dusk blue instead.
 *  · THE LIGHT — the mode rig's sun (`fel_sun`, the goldenHour mood's) moved to a real golden-hour sun: low (24°) over the
 *    ocean to the north-west, where the photo puts it. The mood's sun stands at 55° in the south-east — a noon sun, behind
 *    the camera, with the painted sunset in front of it.
 *  · THE HAZE — the golden clear colour (unchanged).
 */
import { Color3, Color4, DynamicTexture, Texture, Vector3 } from '@babylonjs/core';
import type { DirectionalLight, Scene, StandardMaterial } from '@babylonjs/core';

/** Golden-hour haze — not void #0b0e16. */
export const VENICE_GOLDEN_HAZE = Color4.FromHexString('#d4a06aff');

/** The key light. Azimuth in degrees WEST of north (the dunk camera looks north, −z); elevation above the horizon. */
export const VENICE_SUN = { azimuthDeg: 55, elevationDeg: 24, intensity: 3.0, color: '#ffb070' } as const;

/** The sky photo and where things sit in it (measured on the 1408 × 704 file). */
export const VENICE_SKY = {
  url: '/backdrops/venice-sky-sunset.jpg',
  photoHorizon: 605 / 704,   // the sea line
  photoTop: 250 / 704,       // first row used — above it, the arched red bands
  photoSunX: 716 / 1408,     // the sun's column
  /** Fraction of the dome's 360° the photo spans (~169°): the dunk camera's 81° view is all photo but its left ~10° (the feather),
   *  with the sun just past its right edge. */
  span: 0.47,
  zenith: '#26295c',
  /** Emissive level: the photo's sun band clips to white under the goldenHour exposure at 1. */
  level: 0.9,
} as const;

/** Unit vector from the scene TOWARD the sun. */
export function veniceSunPosition(): Vector3 {
  const a = (VENICE_SUN.azimuthDeg * Math.PI) / 180, e = (VENICE_SUN.elevationDeg * Math.PI) / 180;
  return new Vector3(-Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

/**
 * Where the photo lands in a W × H dome texture. Babylon's sphere maps u 0 → +x (east), 0.25 → −z (north), 0.5 → −x (west)
 * and v 0 → zenith, 0.5 → the equator — which is the sea line, because the sea planes run out past the dome wall at y 0.
 * The band is drawn aspect-true: its height in degrees is its row count scaled by the same degrees-per-pixel as its width.
 */
export function veniceSkyLayout(W: number, H: number, photoW: number, photoH: number) {
  const bandRows = (VENICE_SKY.photoHorizon - VENICE_SKY.photoTop) * photoH;
  const elevDeg = (VENICE_SKY.span * 360 * bandRows) / photoW;
  const horizonY = H * 0.5;
  const topY = horizonY - (elevDeg / 180) * H;
  const uSun = 0.25 + VENICE_SUN.azimuthDeg / 360;
  const width = VENICE_SKY.span * W;
  const x0 = (uSun - VENICE_SKY.photoSunX * VENICE_SKY.span) * W;
  return { horizonY, topY, x0, width, elevDeg, uSun, bandRows };
}

/** The dome direction a texture column u faces (horizontal, unit). */
export function skyDirectionAtU(u: number): Vector3 {
  const phi = u * Math.PI * 2;
  return new Vector3(Math.cos(phi), 0, -Math.sin(phi));
}

type Ctx2D = CanvasRenderingContext2D;

function paintVeniceSky(g: Ctx2D, W: number, H: number, img: HTMLImageElement): void {
  const L = veniceSkyLayout(W, H, img.width, img.height);
  const srcY = VENICE_SKY.photoTop * img.height;
  const bandH = L.horizonY - L.topY;
  const canvas2d = (w: number, h: number, readback = false): Ctx2D | null => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    return c.getContext('2d', readback ? { willReadFrequently: true } : undefined) as Ctx2D | null;
  };
  // a little out of the red, on the working canvases rather than the whole dome: 'saturation' with a grey keeps each
  // pixel's hue and value and pulls its chroma toward the grey
  const desaturate = (c: Ctx2D, w: number, h: number) => {
    c.globalCompositeOperation = 'saturation'; c.fillStyle = 'rgba(128,128,128,0.18)'; c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
  };
  // 1. the dome under the photo: zenith → the band's VERTICAL PROFILE (each row's mean colour across the whole photo) → the
  //    sea line, one gradient top to bottom, so nothing meets at an edge. A stretched small copy of the band carried its
  //    features round the dome instead — the sun as a white smear and the shore palms as a black blob at the horizon
  //    behind the camera, and a seam where its two ends met. (The mean is taken in JS over a 176 × 24 copy: one drawImage
  //    straight down to a few pixels samples a few source pixels, not their mean.)
  const PW = 176, PH = 24;
  const prof = canvas2d(PW, PH, true);
  if (!prof) return;
  prof.drawImage(img, 0, srcY, img.width, L.bandRows, 0, 0, PW, PH);
  desaturate(prof, PW, PH);
  const px = prof.getImageData(0, 0, PW, PH).data;
  const row = (y: number): string => {
    let r = 0, gg = 0, b = 0;
    for (let x = 0; x < PW; x++) { const i = (y * PW + x) * 4; r += px[i]; gg += px[i + 1]; b += px[i + 2]; }
    return `rgb(${Math.round(r / PW)},${Math.round(gg / PW)},${Math.round(b / PW)})`;
  };
  const grad = g.createLinearGradient(0, 0, 0, L.horizonY);
  grad.addColorStop(0, VENICE_SKY.zenith);
  for (let y = 0; y < PH; y++) grad.addColorStop((L.topY + ((y + 0.5) / PH) * bandH) / L.horizonY, row(y));
  g.fillStyle = grad; g.fillRect(0, 0, W, L.horizonY);
  g.fillStyle = row(PH - 1); g.fillRect(0, L.horizonY, W, H - L.horizonY);   // under the sea line (hidden by the sea)
  // 2. the photo band itself, feathered into that on both sides and along its top
  const band = canvas2d(Math.round(L.width), Math.round(bandH));
  if (!band) return;
  const bw = band.canvas.width, bh = band.canvas.height;
  band.drawImage(img, 0, srcY, img.width, L.bandRows, 0, 0, bw, bh);
  desaturate(band, bw, bh);
  band.globalCompositeOperation = 'destination-out';
  const fx = band.createLinearGradient(0, 0, bw, 0);
  fx.addColorStop(0, 'rgba(0,0,0,1)'); fx.addColorStop(0.15, 'rgba(0,0,0,0)'); fx.addColorStop(0.85, 'rgba(0,0,0,0)'); fx.addColorStop(1, 'rgba(0,0,0,1)');
  band.fillStyle = fx; band.fillRect(0, 0, bw, bh);
  const fy = band.createLinearGradient(0, 0, 0, bh);
  fy.addColorStop(0, 'rgba(0,0,0,1)'); fy.addColorStop(0.35, 'rgba(0,0,0,0)');
  band.fillStyle = fy; band.fillRect(0, 0, bw, bh);
  for (const dx of [-W, 0, W]) g.drawImage(band.canvas, L.x0 + dx, L.topY);   // wraps across the u seam
}

/**
 * Lay the Venice sunset into the venue's sky dome (`nexus_sky`). Returns at once; the photo lands when it has loaded, and the
 * painted beach dome stays if it never does. Waits for the baked beach dome's own async load first — that callback assigns the
 * dome's texture and would otherwise overwrite this one.
 */
export function mountVeniceSunsetSky(scene: Scene): void {
  if (typeof Image === 'undefined' || typeof document === 'undefined') return;
  const sky = scene.getMeshByName('nexus_sky');
  const mat = sky?.material as StandardMaterial | null | undefined;
  if (!sky || !mat || !('emissiveTexture' in mat)) { console.warn('[FEL-VENICE-LOOK] no nexus_sky — sunset sky skipped'); return; }
  if (mat.emissiveTexture?.name === 'venice_sky_tex') return;
  const mobile = (scene.metadata as { felTier?: string } | undefined)?.felTier === 'mobile';
  const W = mobile ? 1024 : 2048, H = W / 2;
  const img = new Image();
  const bakedLoaded = (): Promise<void> => {
    const baked = scene.textures.find((t) => (t as Texture).url?.endsWith('/backdrops/baked/beach.jpg')) as Texture | undefined;
    if (!baked || baked.isReady()) return Promise.resolve();
    return new Promise((res) => { baked.onLoadObservable.addOnce(() => res()); setTimeout(res, 8000); });
  };
  img.onload = () => {
    void bakedLoaded().then(() => {
      if (scene.isDisposed || sky.isDisposed()) return;
      const t0 = performance.now();
      const tex = new DynamicTexture('venice_sky_tex', { width: W, height: H }, scene, false);
      paintVeniceSky(tex.getContext() as unknown as Ctx2D, W, H, img);
      tex.update(false);
      tex.level = VENICE_SKY.level;
      tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.wrapV = Texture.CLAMP_ADDRESSMODE;
      mat.emissiveTexture = tex;
      console.info(`[FEL-VENICE-LOOK] sunset sky ${W}×${H} painted in ${Math.round(performance.now() - t0)} ms (sun u ${veniceSkyLayout(W, H, img.width, img.height).uSun.toFixed(3)})`);
    });
  };
  img.onerror = () => console.warn('[FEL-VENICE-LOOK] sunset sky did not load — the painted dome stays');
  img.src = VENICE_SKY.url;
}

/** Move the mode rig's sun to the golden-hour sun over the ocean. The rig's own shadow generator follows the light. */
export function applyVeniceGoldenLight(scene: Scene): boolean {
  const sun = scene.getLightByName('fel_sun') as DirectionalLight | null;
  if (!sun) return false;
  const toSun = veniceSunPosition();
  sun.direction = toSun.scale(-1);
  sun.position = toSun.scale(40);
  sun.intensity = VENICE_SUN.intensity;
  sun.diffuse = Color3.FromHexString(VENICE_SUN.color);
  console.info(`[FEL-VENICE-LOOK] golden sun ${VENICE_SUN.azimuthDeg}° W of N at ${VENICE_SUN.elevationDeg}° (${VENICE_SUN.intensity})`);
  return true;
}

/** Venice dunk clearColor = golden-hour haze (not #0b0e16). */
export function applyVeniceGoldenHaze(scene: Scene): void {
  scene.clearColor = VENICE_GOLDEN_HAZE.clone();
  console.info('[FEL-VENICE-LOOK] clearColor golden-haze #d4a06a');
}

/** Full LOOK pass for the Venice dunk mount (the sky lands async; nothing here blocks the mode's load). */
export async function applyVeniceDunkLookPass(scene: Scene): Promise<void> {
  mountVeniceSunsetSky(scene);
  applyVeniceGoldenLight(scene);
  applyVeniceGoldenHaze(scene);
}
