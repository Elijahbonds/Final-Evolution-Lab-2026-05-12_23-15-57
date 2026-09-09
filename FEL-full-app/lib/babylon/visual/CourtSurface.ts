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

import { Color3, DynamicTexture, Mesh, MeshBuilder, PBRMaterial, Texture, Vector2 } from '@babylonjs/core';
import type { Scene, TransformNode } from '@babylonjs/core';
import { applyFloorDetailToMesh } from './groundTextures';

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
  // DUNK-VISUAL-POLISH: a mapped venue HIDES venue_ground (NexusVenue) and the Venice courts paint their surface with
  // mountStreetCourt instead — painting the ocean onto the hidden plane costs a second 2048² court texture that nothing
  // can ever see. Measured 2026-09-09: three-point mounts twice, so it carried FOUR of them and lost the WebGL context
  // ("Graphics were reset by the device") on the first load of the mode. If the ground is not rendering, neither is this.
  if (!ground.isVisible || ground.visibility === 0) {
    console.info('[FEL-COURT] ocean court skipped — venue_ground is hidden (the venue paints its own surface)');
    return false;
  }
  // Pass 5 phase 8: the mobile tier paints the court at half resolution — measured 21 MB at 2048² on three-point and dunk duel,
  // the largest single texture on the phone tier after the hero variant landed.
  const size = (scene.metadata as { felTier?: string } | undefined)?.felTier === 'mobile' ? TEX / 2 : TEX;
  const tex = new DynamicTexture('court_ocean_tex', { width: size, height: size }, scene, true);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  paintOcean(g, size, size, style);
  tex.update();

  const mat = new PBRMaterial('court_ocean_mat', scene);
  mat.albedoTexture = tex;
  // water is glossy: a low roughness gives the ocean a real reflection lobe
  // from the IBL — what separates "ocean" from "blue floor" (PBR since 2026-09-03)
  mat.metallic = 0; mat.roughness = 0.22;
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

// ─────────────────────────────────────────────────────────────────────────────
// DUNK-VISUAL-POLISH — the STREET COURT paint.
//
// The Venice court's playing surface was the baked photogrammetry scan
// (venice-blue-court.glb, Mesh_0): a 1024² texture stretched over 26 m of court
// — 39 texels a metre — lit at environmentIntensity 0.02 by the map's
// `matteFloor` rule. Measured on 3083e17 it renders as a near-black slick with
// the scan's own smears reading as oil on water, which is what the owner saw
// ("the floor looks wrong/ugly").
//
// This paints the court instead: a 2048² sealed-blacktop albedo laid on a clean
// planar ground over the scan, with real markings placed from METRES (not from
// texture insets — the lesson volleyball and three-point both paid for), plus a
// tiling asphalt grain as a detail map so the surface still has aggregate when
// the camera is on the floor. No image assets.
//
// The paint is z- and x-symmetric (a full court: two keys, two arcs), so it can
// never be mounted the wrong way round.

const COURT_LINE = '#F4F8FB';
const courtTexCache = new WeakMap<Scene, Map<string, DynamicTexture>>();


/** Per-pixel aggregate over the whole canvas in one pass. `amount` scales the spread in 8-bit levels.
 *  A headless canvas hands back no pixels — the paint is simply left ungrained rather than dying. */
function grain(g: CanvasRenderingContext2D, S: number, rnd: () => number, amount: number): void {
  const img = g.getImageData?.(0, 0, S, S);
  const d = img?.data;
  if (!d) return;
  const spread = 46 * amount;
  for (let i = 0; i < d.length; i += 4) {
    // one draw of the rng per pixel, biased so half the grain is dark aggregate and half is the light stone in it
    const n = (rnd() - 0.5) * spread;
    d[i] = Math.max(0, Math.min(255, d[i] + n * 0.8));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 1.15));
  }
  g.putImageData(img as ImageData, 0, 0);
}

/** Deterministic street-court albedo. `wM`/`lM` are the real court metres the texture covers. */
export function paintStreetCourt(
  g: CanvasRenderingContext2D, S: number, wM: number, lM: number,
  palette: { base: string; base2: string; key: string; seam: string } = {
    // The key has to READ from the dunk camera at 14 m under a golden-hour grade that lifts everything warm: at #16506E
    // against this base it measured as the same teal (shot 2026-09-09). A painted key is a different colour, not a shade.
    base: '#2C6B88', base2: '#37809C', key: '#0D3448', seam: '#1B4A61',
  },
): void {
  const rnd = makeRng(0x5eed17);
  const pxW = S / wM, pxL = S / lM;             // pixels per metre on each axis
  const px = (pxW + pxL) / 2;                   // for widths that must read the same both ways
  const X = (m: number) => S / 2 + m * pxW;     // court metres → texture pixels
  const Z = (m: number) => S / 2 + m * pxL;

  // ── 1. sealed blacktop base, with the coat laid in overlapping passes
  g.fillStyle = palette.base;
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 34; i++) {                       // sealcoat blotches: the surface is never one value
    const x = rnd() * S, y = rnd() * S, r = S * (0.06 + rnd() * 0.18);
    const grd = g.createRadialGradient(x, y, 1, x, y, r);
    const lighter = rnd() < 0.55;
    grd.addColorStop(0, lighter ? 'rgba(120,180,205,0.10)' : 'rgba(8,32,48,0.12)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 16; i++) {                       // squeegee sweeps — how a court is actually coated
    const y = rnd() * S;
    g.strokeStyle = `rgba(${rnd() < 0.5 ? '150,200,220' : '10,38,54'}, ${0.04 + rnd() * 0.05})`;
    g.lineWidth = 30 + rnd() * 90;
    g.beginPath(); g.moveTo(-40, y);
    for (let x = -40; x <= S + 40; x += 60) g.lineTo(x, y + Math.sin(x * 0.004 + i) * (18 + rnd() * 22));
    g.stroke();
  }
  // ── 2. aggregate — the grain that stops the court reading as a flat fill.
  //      ONE pass over the pixel buffer, not 26 000 fillRects: at 2048² the per-call `fillStyle = 'rgba(…)'` string parse
  //      cost ~3.9 s of main thread (measured on the dunk's own HUD, 2026-09-09) and three-point lost the WebGL context
  //      outright on the frame it painted. A buffer pass is the same grain in ~40 ms.
  grain(g, S, rnd, 0.55);
  // ── 3. hairline cracks + the two expansion seams a poured slab always has
  for (let i = 0; i < 14; i++) {
    let x = rnd() * S, y = rnd() * S;
    let a = rnd() * Math.PI * 2;
    g.strokeStyle = `rgba(11,36,50,${0.16 + rnd() * 0.2})`;
    g.lineWidth = 1 + rnd();
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 9; k++) { a += (rnd() - 0.5) * 1.1; x += Math.cos(a) * (14 + rnd() * 46); y += Math.sin(a) * (14 + rnd() * 46); g.lineTo(x, y); }
    g.stroke();
  }
  g.strokeStyle = `${palette.seam}88`; g.lineWidth = Math.max(1.5, px * 0.02);
  for (const zm of [-lM / 6, lM / 6]) { g.beginPath(); g.moveTo(0, Z(zm)); g.lineTo(S, Z(zm)); g.stroke(); }

  // ── 4. the KEYS, painted before the lines so the lines sit on top
  const KEY_W = 4.9, KEY_D = 5.8, RIM_FROM_BASE = 1.575, HALF_L = lM / 2, HALF_W = wM / 2;
  const inset = 0.15;
  g.fillStyle = palette.key;
  for (const s of [-1, 1]) {
    const zBase = s * (HALF_L - inset);
    g.fillRect(X(-KEY_W / 2), Math.min(Z(zBase), Z(zBase - s * KEY_D)), KEY_W * pxW, KEY_D * pxL);
  }
  // a wash of the base back over the keys so they read as worn paint, not a decal
  g.globalAlpha = 0.16;
  for (let i = 0; i < 240; i++) { const x = rnd() * S, y = rnd() * S; g.fillStyle = rnd() < 0.5 ? palette.base : palette.base2; g.fillRect(x, y, 6 + rnd() * 22, 5 + rnd() * 18); }
  g.globalAlpha = 1;

  // ── 5. the markings, from the rulebook's metres
  const stroke = (w: number, alpha = 0.95) => { g.strokeStyle = COURT_LINE; g.lineWidth = Math.max(1.5, w * px); g.globalAlpha = alpha; g.lineCap = 'butt'; };
  const LINE_M = 0.05;
  stroke(LINE_M);
  g.strokeRect(X(-HALF_W + inset), Z(-HALF_L + inset), (wM - inset * 2) * pxW, (lM - inset * 2) * pxL);   // boundary
  g.beginPath(); g.moveTo(X(-HALF_W + inset), Z(0)); g.lineTo(X(HALF_W - inset), Z(0)); g.stroke();       // halfway
  g.beginPath(); g.ellipse(X(0), Z(0), 1.8 * pxW, 1.8 * pxL, 0, 0, Math.PI * 2); g.stroke();              // centre circle

  for (const s of [-1, 1]) {
    const zBase = s * (HALF_L - inset);
    const zRim = zBase - s * RIM_FROM_BASE;
    const zFt = zBase - s * KEY_D;
    // key box
    g.beginPath();
    g.moveTo(X(-KEY_W / 2), Z(zBase)); g.lineTo(X(-KEY_W / 2), Z(zFt));
    g.lineTo(X(KEY_W / 2), Z(zFt)); g.lineTo(X(KEY_W / 2), Z(zBase));
    g.stroke();
    // free-throw circle: solid toward the rim, dashed away from it
    g.beginPath(); g.ellipse(X(0), Z(zFt), 1.8 * pxW, 1.8 * pxL, 0, 0, Math.PI * 2); g.stroke();
    // restricted area under the rim
    g.beginPath(); g.ellipse(X(0), Z(zRim), 1.25 * pxW, 1.25 * pxL, 0, 0, Math.PI * 2); g.stroke();
    // three-point line: 6.75 m arc off the rim, closed with the corner straights
    const R = 6.75, CORNER_X = HALF_W - 0.9;
    const th = Math.acos(Math.min(1, CORNER_X / R));          // where the arc meets the corner line
    const dz = Math.sin(th) * R;
    g.beginPath();
    g.moveTo(X(-CORNER_X), Z(zBase));
    g.lineTo(X(-CORNER_X), Z(zRim - s * dz));
    g.stroke();
    g.beginPath();
    g.moveTo(X(CORNER_X), Z(zBase));
    g.lineTo(X(CORNER_X), Z(zRim - s * dz));
    g.stroke();
    g.beginPath();
    const a0 = s > 0 ? Math.PI + th : th, a1 = s > 0 ? -th : Math.PI - th;
    g.ellipse(X(0), Z(zRim), R * pxW, R * pxL, 0, a0, a1, s > 0);
    g.stroke();
    // the backboard mark on the baseline
    g.beginPath(); g.moveTo(X(-0.9), Z(zBase)); g.lineTo(X(0.9), Z(zBase)); g.stroke();
  }
  g.globalAlpha = 1;

  // ── 6. wear — the paint is not new: the same buffer pass, lighter, over the lines and the key edges
  grain(g, S, rnd, 0.3);
  // ── 7. sun bleach across the length so the far baseline reads lighter
  const bleach = g.createLinearGradient(0, 0, 0, S);
  bleach.addColorStop(0, 'rgba(255,226,178,0.10)');
  bleach.addColorStop(0.5, 'rgba(255,226,178,0.02)');
  bleach.addColorStop(1, 'rgba(255,226,178,0.09)');
  g.fillStyle = bleach; g.fillRect(0, 0, S, S);
}

/**
 * Lay the painted court over whatever surface the venue already has, as a clean planar ground with its own UVs.
 * `x` / `z` are the WORLD extents of the playing surface in metres. Returns the mesh so the caller can park it
 * under the venue root and let it die with the venue.
 */
export function mountStreetCourt(
  scene: Scene, holder: TransformNode, x: readonly [number, number], z: readonly [number, number], y = 0.02,
): Mesh {
  const wM = Math.abs(x[1] - x[0]), lM = Math.abs(z[1] - z[0]);
  const mobile = (scene.metadata as { felTier?: string } | undefined)?.felTier === 'mobile';
  const S = mobile ? 1024 : 2048;
  // Cached per scene, per court size. A 2048² court is ~21 MB with its mipmaps and every basketball venue in this app
  // mounts TWICE on a page load (measured 2026-09-09: three-point logged its build twice and lost the WebGL context —
  // "Graphics were reset by the device" — on the first one). The paint is deterministic, so the second mount takes the
  // first one's texture. It lives and dies with the scene, like every other cached ground texture here.
  const key = `${S}:${wM.toFixed(2)}x${lM.toFixed(2)}`;
  let byKey = courtTexCache.get(scene);
  if (!byKey) { byKey = new Map(); courtTexCache.set(scene, byKey); }
  let tex = byKey.get(key);
  let paintMs = 0;
  if (!tex) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    tex = new DynamicTexture('court_street_tex', { width: S, height: S }, scene, true);
    paintStreetCourt(tex.getContext() as unknown as CanvasRenderingContext2D, S, wM, lM);
    tex.update(false);
    paintMs = Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - t0);
    tex.wrapU = Texture.CLAMP_ADDRESSMODE; tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    tex.anisotropicFilteringLevel = 8;
    byKey.set(key, tex);
  }

  const mesh = MeshBuilder.CreateGround('vb_court_paint', { width: wM, height: lM }, scene);
  mesh.position.set((x[0] + x[1]) / 2, y, (z[0] + z[1]) / 2);
  mesh.parent = holder;
  mesh.isPickable = false;
  mesh.receiveShadows = true;

  const mat = new PBRMaterial('court_street_mat', scene);
  mat.albedoTexture = tex;
  mat.albedoColor = Color3.White();
  mat.metallic = 0;
  // A sealed outdoor court has a sheen — it is not chalk. 0.66 keeps a soft
  // sun lobe without the mirror that made the scan read as water (M12.2).
  mat.roughness = 0.66;
  mat.environmentIntensity = 0.45;
  mat.specularIntensity = 0.35;
  mesh.material = mat;
  // aggregate at close range: the albedo carries the markings, the grain carries the asphalt
  applyFloorDetailToMesh(scene, mesh, { kind: 'asphalt', blend: 0.28 }, [wM, lM]);
  mesh.onDisposeObservable.add(() => mat.dispose());   // the texture is the scene's (courtTexCache), not this mesh's
  console.info(`[FEL-COURT] street court ${wM.toFixed(1)}×${lM.toFixed(1)} m at y ${y} — ${S}² ${paintMs ? `painted in ${paintMs} ms` : '(cached)'}`);
  return mesh;
}
