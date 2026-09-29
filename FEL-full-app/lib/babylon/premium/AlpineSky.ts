// AlpineSky — Gate Crasher's mountains at the resolution the chase camera looks at them (GATE-CRASHER-POLISH-2, 2026-09-28).
//
// The eye (GC-3): "the backdrop is a low-res photo. Blocky pixels in the mountain face behind the rider in every downhill
// shot. From the side (kicker) it becomes a huge dark blur covering about 60% of the frame." Both measured at 9096d7cf:
//
//   BLOCKY. The harness's alpine dome is backdrops/baked/mountains.jpg, 1024 × 512 and MIRRORED — 512 px for 180° of sky,
//           2.8 px a degree. The chase camera's ~75° frame is 1280 px wide: every texel was drawn six pixels across.
//   DARK.   The dome is a fixed 280 m sphere at the origin and the run is 678 m long and 150 m deep. Half-way down the rider
//           is below the dome's equator and near its wall, so the camera looks level into the bake's padding under the
//           horizon — a dark grey band, magnified into a blur.
//
// So, for this mode only (Backdrops.ts serves every family and is untouched): the dome's texture is recomposed at 4096 × 2048
// (2048 on a touch device) from the SOURCE photograph the bake was made from (backdrops/snowboard.jpg, 1920 px — already
// shipped): the sky, the peaks and the treeline at 11 px a degree, mirrored so the wrap has no seam, snow under the horizon
// instead of the dark band, and the venue mood's wash laid over it exactly as Backdrops does (the night park and the glacier
// keep their skies). The dome then rides the camera (infiniteDistance) at three times its radius, so the horizon stays at
// the horizon from the top of the run to the finish and nothing on the 678 m run falls outside it.
import { Color3, DynamicTexture, Texture } from '@babylonjs/core';
import type { Mesh, Scene, StandardMaterial } from '@babylonjs/core';
import { MOODS, type VenueMood } from '../scene/moods';

/** The photograph the baked dome was made from (public/backdrops/baked/manifest.json: mountains ← snowboard.jpg). */
export const ALPINE_PHOTO = '/backdrops/snowboard.jpg';
/** Rows of the photograph above its treeline's base (the snow park below it is not sky). */
const PHOTO_CROP_ROWS = 610;
/** Where the treeline's base sits on the dome (0 = zenith, 1 = nadir): ~10° under eye level, where the pitched run's far
 *  snow meets the forest from the chase camera. */
export const ALPINE_HORIZON_V = 0.575;
/** The dome's radius × this: 840 m, past the whole run in every direction. */
export const ALPINE_SKY_SCALE = 3;

export interface AlpineSkyHandle { readonly width: number; dispose(): void }

/** Recompose the harness's dome for the alpine run. Null when there is no dome (a venue sky already owns the scene). */
export function upgradeAlpineSky(scene: Scene, opts: { mood: VenueMood; snow: string; hi: boolean }): AlpineSkyHandle | null {
  const dome = scene.getMeshByName('bk_dome') as Mesh | null;
  const mat = dome?.material as StandardMaterial | null | undefined;
  if (!dome || !mat) return null;
  const W = opts.hi ? 4096 : 2048, H = W / 2;
  const tex = new DynamicTexture('bk_dome_alpine', { width: W, height: H }, scene, false, Texture.BILINEAR_SAMPLINGMODE);
  tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  // (uploaded with invertY FALSE, as Backdrops loads the bake: canvas row 0 is the zenith — the default flip hung the forest
  // from the sky, measured on the first after-shot)
  const hy = Math.round(H * ALPINE_HORIZON_V);
  const snow = Color3.FromHexString(opts.snow);
  const snowCss = (a: number, k = 1) => `rgba(${Math.round(snow.r * 255 * k)},${Math.round(snow.g * 255 * k)},${Math.round(snow.b * 255 * k)},${a})`;
  const paintWash = () => {
    const m = MOODS[opts.mood];
    if (m && m.skyWash > 0) { g.globalAlpha = m.skyWash; g.fillStyle = m.sky; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
  };
  /** Snow from the horizon down: never the dark band. */
  const paintSnow = () => {
    const gr = g.createLinearGradient(0, hy - 24, 0, H);
    gr.addColorStop(0, snowCss(0)); gr.addColorStop(0.04, snowCss(1)); gr.addColorStop(1, snowCss(1, 0.9));
    g.fillStyle = gr; g.fillRect(0, hy - 24, W, H - hy + 24);
  };
  // the instant look while the photograph loads (and its fallback): an alpine sky over snow
  {
    const gr = g.createLinearGradient(0, 0, 0, hy);
    gr.addColorStop(0, '#1d5fc4'); gr.addColorStop(0.7, '#5f9be0'); gr.addColorStop(1, '#cfe0f4');
    g.fillStyle = gr; g.fillRect(0, 0, W, hy);
    paintSnow(); paintWash();
  }
  tex.update(false);
  const prev = mat.emissiveTexture;
  mat.emissiveTexture = tex;
  dome.infiniteDistance = true;
  dome.scaling.setAll(ALPINE_SKY_SCALE);
  let gone = false;
  const img = typeof Image !== 'undefined' ? new Image() : null;
  if (img) {
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (gone) return;
      const half = W / 2, k = half / img.naturalWidth, bandH = Math.round(PHOTO_CROP_ROWS * k), top = hy - bandH;
      // the sky above the photograph continues ITS top row's blue up to a deeper zenith
      const probe = document.createElement('canvas'); probe.width = 32; probe.height = 1;
      const pg = probe.getContext('2d');
      let c0 = '#2a6ed9';
      if (pg) {
        pg.drawImage(img, 0, 0, img.naturalWidth, 6, 0, 0, 32, 1);
        const d = pg.getImageData(0, 0, 32, 1).data; let r = 0, gg = 0, b = 0;
        for (let i = 0; i < 32; i++) { r += d[i * 4]; gg += d[i * 4 + 1]; b += d[i * 4 + 2]; }
        c0 = `rgb(${Math.round(r / 32)},${Math.round(gg / 32)},${Math.round(b / 32)})`;
      }
      const zen = g.createLinearGradient(0, 0, 0, top + 2);
      zen.addColorStop(0, '#103f94'); zen.addColorStop(1, c0);
      g.fillStyle = zen; g.fillRect(0, 0, W, top + 2);
      // the peaks and the treeline, twice round, the second copy mirrored so both seams meet themselves
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, img.naturalWidth, PHOTO_CROP_ROWS, 0, top, half, bandH);
      g.save(); g.translate(W, 0); g.scale(-1, 1);
      g.drawImage(img, 0, 0, img.naturalWidth, PHOTO_CROP_ROWS, 0, top, half, bandH);
      g.restore();
      paintSnow(); paintWash();
      tex.update(false);
      console.info(`[FEL-SKY] alpine dome ${W}x${H} from ${ALPINE_PHOTO} (${img.naturalWidth}px source)`);
    };
    img.onerror = () => console.warn(`[FEL-SKY] ${ALPINE_PHOTO} missing — the painted alpine sky stays`);
    img.src = ALPINE_PHOTO;
  }
  return {
    width: W,
    dispose() {
      gone = true;
      try { if (mat.emissiveTexture === tex && prev && !mat.isFrozen) mat.emissiveTexture = prev; } catch { /* the dome went first */ }
      tex.dispose();
    },
  };
}
