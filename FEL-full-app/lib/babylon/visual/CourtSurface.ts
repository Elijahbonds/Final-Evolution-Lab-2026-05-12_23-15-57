// CourtSurface — the DEEP OCEAN COURT. Repaints the Venice court's playing
// surface as deep ocean-blue water: layered swell bands, breaking crests
// with foam, caustic glints, and a subtle depth gradient from the baseline
// to half-court — with the regulation court lines laid over the top so it
// still reads as a basketball court, not a pool.
//
// Requested reference was the Luma-scan look (photogrammetry: rich, uneven,
// real-world color variation rather than flat vector fill). This gets there
// PROCEDURALLY — dozens of overlapping translucent strokes, per-pixel noise,
// and non-uniform value breakup, so the surface has the "captured" density
// of a scan instead of the flatness of a painted texture. Zero image assets,
// which keeps the project's no-external-asset rule intact.
//
// It does NOT rebuild the court. It finds the ground VenueKit already made
// and swaps its material, so it works with every basketball mode as a
// one-line call and can't desync from the venue's geometry.

import { Color3, DynamicTexture, StandardMaterial, Vector2 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';

const TEX = 2048;                       // court lines need the resolution

export type CourtWaterStyle = 'venice' | 'midnight';

const PALETTE: Record<CourtWaterStyle, {
  deep: string; mid: string; shallow: string; crest: string; foam: string; line: string;
}> = {
  // deep ocean blue, sunset-lit — matches the goldenHour mood + M61 backdrop
  venice: {
    deep: '#04263f', mid: '#0a4f79', shallow: '#1583ad',
    crest: '#4fc3d9', foam: '#dff4fb', line: '#f4f9ff',
  },
  // night variant for stadium-lit courts
  midnight: {
    deep: '#02121f', mid: '#062d4a', shallow: '#0b5570',
    crest: '#2a8fae', foam: '#bcdfe9', line: '#eaf4ff',
  },
};

/** Deterministic value noise so the surface is identical every load. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function paintOcean(g: CanvasRenderingContext2D, W: number, H: number, style: CourtWaterStyle): void {
  const P = PALETTE[style];
  const rnd = makeRng(0x0cea7);

  // ── 1. depth gradient — deepest at the baseline (top), shallower downcourt
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, P.deep);
  grad.addColorStop(0.45, P.mid);
  grad.addColorStop(0.8, P.shallow);
  grad.addColorStop(1, P.mid);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // ── 2. long swell bands — the big, slow water shapes
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const y = (i / 26) * H + rnd() * 40;
    const amp = 14 + rnd() * 46;
    const thick = 10 + rnd() * 34;
    g.strokeStyle = `rgba(${21 + rnd() * 40 | 0}, ${131 + rnd() * 60 | 0}, ${173 + rnd() * 50 | 0}, ${0.05 + rnd() * 0.09})`;
    g.lineWidth = thick;
    g.beginPath();
    g.moveTo(-40, y);
    for (let x = -40; x <= W + 40; x += 36) {
      g.lineTo(x, y + Math.sin(x * 0.0055 + i * 1.7) * amp + Math.sin(x * 0.019 + i) * amp * 0.28);
    }
    g.stroke();
  }

  // ── 3. breaking crests + foam — the readable "waves"
  for (let i = 0; i < 13; i++) {
    const y = (i / 13) * H + rnd() * 70;
    const amp = 20 + rnd() * 40;
    // crest highlight
    g.strokeStyle = `rgba(79, 195, 217, ${0.16 + rnd() * 0.2})`;
    g.lineWidth = 4 + rnd() * 7;
    g.beginPath();
    g.moveTo(-40, y);
    for (let x = -40; x <= W + 40; x += 22) {
      g.lineTo(x, y + Math.sin(x * 0.0075 + i * 2.3) * amp);
    }
    g.stroke();
    // foam lace riding just under the crest — short broken strokes, not a line
    g.strokeStyle = `rgba(223, 244, 251, ${0.22 + rnd() * 0.26})`;
    g.lineWidth = 1.6 + rnd() * 2.6;
    for (let x = -20; x < W + 20; x += 12 + rnd() * 26) {
      if (rnd() < 0.42) continue;                       // gaps make it read as foam
      const yy = y + Math.sin(x * 0.0075 + i * 2.3) * amp + 5 + rnd() * 9;
      g.beginPath();
      g.moveTo(x, yy);
      g.quadraticCurveTo(x + 9, yy - 3 - rnd() * 5, x + 16 + rnd() * 20, yy + (rnd() - 0.5) * 5);
      g.stroke();
    }
  }

  // ── 4. caustic glints — the sparkle that sells water under sunlight
  for (let i = 0; i < 900; i++) {
    const x = rnd() * W, y = rnd() * H;
    const r = 0.8 + rnd() * 2.6;
    g.fillStyle = `rgba(190, 236, 248, ${0.05 + rnd() * 0.22})`;
    g.beginPath();
    g.ellipse(x, y, r * (1.6 + rnd()), r * 0.5, rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }

  // ── 5. scan-grade breakup — fine per-pixel variation so the surface has
  //      photogrammetric density instead of vector flatness
  g.globalCompositeOperation = 'overlay';
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * W, y = rnd() * H;
    const v = rnd() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${0.012 + rnd() * 0.03})`;
    g.fillRect(x, y, 2 + rnd() * 5, 2 + rnd() * 5);
  }
  g.globalCompositeOperation = 'source-over';

  // ── 6. regulation court lines, laid over the water
  const line = (fn: () => void, width = 7, alpha = 0.92): void => {
    g.strokeStyle = `rgba(244, 249, 255, ${alpha})`;
    g.lineWidth = width;
    g.lineCap = 'round';
    fn();
  };
  // faint dark under-stroke first so lines read against foam
  g.strokeStyle = 'rgba(2, 20, 34, 0.35)'; g.lineWidth = 12;
  g.strokeRect(W * 0.08, H * 0.05, W * 0.84, H * 0.9);

  line(() => g.strokeRect(W * 0.08, H * 0.05, W * 0.84, H * 0.9));           // boundary
  line(() => {                                                               // 3-pt arc
    g.beginPath();
    g.arc(W / 2, H * 0.18, W * 0.32, 0.12 * Math.PI, 0.88 * Math.PI);
    g.stroke();
  });
  line(() => g.strokeRect(W * 0.37, H * 0.05, W * 0.26, H * 0.22));          // the key
  line(() => {                                                               // ft circle
    g.beginPath();
    g.arc(W / 2, H * 0.27, W * 0.105, 0, Math.PI * 2);
    g.stroke();
  }, 6, 0.85);
  line(() => {                                                               // half court
    g.beginPath();
    g.moveTo(W * 0.08, H * 0.95); g.lineTo(W * 0.92, H * 0.95);
    g.stroke();
  }, 6, 0.7);

  // ── 7. wet sheen over the lines so they sit IN the water, not on top
  g.globalCompositeOperation = 'lighter';
  const sheen = g.createLinearGradient(0, H * 0.15, W, H * 0.85);
  sheen.addColorStop(0, 'rgba(120, 210, 235, 0.0)');
  sheen.addColorStop(0.5, 'rgba(150, 225, 245, 0.10)');
  sheen.addColorStop(1, 'rgba(120, 210, 235, 0.0)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
}

/**
 * Repaint the court that VenueKit already built. Call AFTER
 * `VenueKit.buildCourt(scene, …)`.
 * Returns true when the court ground was found and restyled.
 */
export function applyOceanCourt(scene: Scene, style: CourtWaterStyle = 'venice'): boolean {
  const ground = scene.getMeshByName('venue_ground');
  if (!ground) {
    console.warn('[FEL-COURT] applyOceanCourt: no "venue_ground" mesh — call after VenueKit.buildCourt()');
    return false;
  }
  const tex = new DynamicTexture('court_ocean_tex', { width: TEX, height: TEX }, scene, true);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  paintOcean(g, TEX, TEX, style);
  tex.update();

  const mat = new StandardMaterial('court_ocean_mat', scene);
  mat.diffuseTexture = tex;
  // water is glossy: a real specular lobe is what separates "ocean" from
  // "blue floor", and it plays into M59's rim light + bloom
  mat.specularColor = new Color3(0.55, 0.72, 0.8);
  mat.specularPower = 96;
  mat.emissiveColor = Color3.FromHexString(PALETTE[style].deep).scale(0.22);
  ground.material = mat;
  ground.receiveShadows = true;

  // slow drift on the texture UVs — the surface breathes like real water
  // without touching geometry or costing a frame
  const dt = tex as DynamicTexture & { uOffset: number; vOffset: number; uScale: number; vScale: number };
  dt.uScale = 1; dt.vScale = 1;
  const speed = new Vector2(0.0016, 0.0009);
  scene.onBeforeRenderObservable.add(() => {
    const s = scene.getEngine().getDeltaTime() / 16.67;
    dt.uOffset = (dt.uOffset + speed.x * s * 0.01) % 1;
    dt.vOffset = (dt.vOffset + speed.y * s * 0.01) % 1;
  });
  console.info(`[FEL-COURT] ocean court applied (${style})`);
  return true;
}
