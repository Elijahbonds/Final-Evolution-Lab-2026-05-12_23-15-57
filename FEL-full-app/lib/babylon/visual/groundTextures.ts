// groundTextures — procedural, seeded, tiling ground albedos (Pass 7 details, phase 2: "ground textures for every venue
// floor and surround"). No files, no downloads: a 512² DynamicTexture per kind, cached per scene, wrapped and tiled by the
// caller (uScale/vScale = metres / TILE_M). Kinds read at play distance: grass (blade speckle, two greens), sand (fine grain,
// damp streaks), concrete (slab seams, aggregate), asphalt (dark grain, faint patch lines).
import { Color3, DynamicTexture, PBRMaterial, Texture } from '@babylonjs/core';
import type { AbstractMesh, Scene, TransformNode } from '@babylonjs/core';

export type GroundKind = 'grass' | 'sand' | 'concrete' | 'asphalt';
/** metres one tile of the texture covers */
export const TILE_M: Record<GroundKind, number> = { grass: 3, sand: 4, concrete: 6, asphalt: 6 };

const cache = new WeakMap<Scene, Map<GroundKind, DynamicTexture>>();

function rng(seed: number): () => number { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function mix(a: string, b: string, t: number): string {
  const ca = Color3.FromHexString(a), cb = Color3.FromHexString(b);
  return Color3.Lerp(ca, cb, t).toHexString();
}

export function groundTexture(scene: Scene, kind: GroundKind, size = 512): DynamicTexture {
  let map = cache.get(scene); if (!map) { map = new Map(); cache.set(scene, map); }
  const hit = map.get(kind); if (hit) return hit;
  const tex = new DynamicTexture(`fel_ground_${kind}`, size, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const r = rng({ grass: 11, sand: 23, concrete: 37, asphalt: 41 }[kind]);
  const base = { grass: '#3F5B2E', sand: '#CDB48C', concrete: '#B9B0A2', asphalt: '#4A4744' }[kind];
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  if (kind === 'grass') {
    for (let i = 0; i < 9000; i++) { const x = r() * size, y = r() * size; ctx.fillStyle = mix('#33502A', '#5B7A3A', r()); ctx.fillRect(x, y, 1 + r() * 2, 2 + r() * 5); }
    for (let i = 0; i < 40; i++) { const x = r() * size, y = r() * size, rad = 20 + r() * 60; const g = ctx.createRadialGradient(x, y, 2, x, y, rad); g.addColorStop(0, 'rgba(120,140,70,0.18)'); g.addColorStop(1, 'rgba(120,140,70,0)'); ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  } else if (kind === 'sand') {
    for (let i = 0; i < 14000; i++) { const x = r() * size, y = r() * size; ctx.fillStyle = mix('#B99E76', '#E2CFA8', r()); ctx.fillRect(x, y, 1, 1); }
    for (let i = 0; i < 18; i++) { ctx.strokeStyle = 'rgba(150,125,90,0.14)'; ctx.lineWidth = 6 + r() * 14; ctx.beginPath(); const y = r() * size; ctx.moveTo(0, y); ctx.bezierCurveTo(size * 0.3, y + (r() - 0.5) * 60, size * 0.7, y + (r() - 0.5) * 60, size, y + (r() - 0.5) * 30); ctx.stroke(); }
  } else if (kind === 'concrete') {
    for (let i = 0; i < 12000; i++) { const x = r() * size, y = r() * size; ctx.fillStyle = mix('#A79E90', '#CBC3B6', r()); ctx.fillRect(x, y, 1 + r() * 2, 1 + r() * 2); }
    ctx.strokeStyle = 'rgba(70,64,58,0.45)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, size); ctx.moveTo(0, 0); ctx.lineTo(size, 0); ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size); ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2); ctx.stroke();
    for (let i = 0; i < 30; i++) { const x = r() * size, y = r() * size, rad = 10 + r() * 40; const g = ctx.createRadialGradient(x, y, 1, x, y, rad); g.addColorStop(0, 'rgba(60,55,50,0.14)'); g.addColorStop(1, 'rgba(60,55,50,0)'); ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  } else {
    for (let i = 0; i < 16000; i++) { const x = r() * size, y = r() * size; ctx.fillStyle = mix('#3B3936', '#5A5652', r()); ctx.fillRect(x, y, 1, 1); }
    for (let i = 0; i < 6; i++) { ctx.strokeStyle = 'rgba(30,28,26,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); const x = r() * size, y = r() * size; ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 200, y + (r() - 0.5) * 200); ctx.stroke(); }
  }
  tex.update(false);
  tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.wrapV = Texture.WRAP_ADDRESSMODE; tex.anisotropicFilteringLevel = 8;
  map.set(kind, tex);
  return tex;
}

/** A fresh copy of a ground texture for one mesh (uScale/vScale live on the texture, so each tiled surface needs its own).
 *  DynamicTexture.clone() hands back an EMPTY canvas — the flats went white (measured 2026-09-05); drawing the cached
 *  canvas into a new one keeps the paint. */
export function groundTextureFor(scene: Scene, kind: GroundKind, uScale: number, vScale: number): DynamicTexture {
  const src = groundTexture(scene, kind);
  const size = src.getSize().width;
  const tex = new DynamicTexture(`fel_ground_${kind}_i`, size, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.drawImage((src.getContext() as CanvasRenderingContext2D).canvas as unknown as CanvasImageSource, 0, 0);
  tex.update(false);
  tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.wrapV = Texture.WRAP_ADDRESSMODE; tex.anisotropicFilteringLevel = 8;
  tex.uScale = Math.max(1, uScale); tex.vScale = Math.max(1, vScale);
  return tex;
}

/** A half-court / centre logo decal: a ring with the FEL wordmark, painted once per scene. */
export function courtLogoTexture(scene: Scene, size = 512): DynamicTexture {
  const tex = new DynamicTexture('fel_court_logo', size, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(245,240,230,0.9)'; ctx.lineWidth = size * 0.035; ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(245,240,230,0.92)'; ctx.font = `bold ${Math.round(size * 0.28)}px Helvetica, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('FEL', size / 2, size / 2 + size * 0.01);
  ctx.font = `${Math.round(size * 0.07)}px Helvetica, Arial, sans-serif`; ctx.fillText('VENICE BEACH', size / 2, size / 2 + size * 0.2);
  tex.update(false); tex.hasAlpha = true;
  return tex;
}

/** Painted signage (Pass 7 phase 4): lines of text on a coloured board, ratio w:h, for entrance signs, plates and flags. */
export function signTexture(scene: Scene, lines: string[], opts: { bg?: string; fg?: string; accent?: string; w?: number; h?: number; stripes?: boolean } = {}): DynamicTexture {
  const w = opts.w ?? 1024, h = opts.h ?? 256;
  const tex = new DynamicTexture(`fel_sign_${lines[0]?.slice(0, 12) ?? 'sign'}`, { width: w, height: h }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = opts.bg ?? '#1E2A44'; ctx.fillRect(0, 0, w, h);
  if (opts.stripes) { ctx.fillStyle = opts.accent ?? '#F2B84B'; for (let x = 0; x < w; x += 80) ctx.fillRect(x, 0, 40, h * 0.12); }
  ctx.strokeStyle = opts.accent ?? '#F2B84B'; ctx.lineWidth = h * 0.05; ctx.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1);
  ctx.fillStyle = opts.fg ?? '#F7F3EA'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const n = lines.length; lines.forEach((line, i) => {
    const size = Math.round(i === 0 ? h * (n > 1 ? 0.42 : 0.5) : h * 0.2);
    ctx.font = `${i === 0 ? 'bold ' : ''}${size}px Helvetica, Arial, sans-serif`;
    ctx.fillText(line, w / 2, n > 1 ? (i === 0 ? h * 0.42 : h * 0.76) : h / 2);
  });
  tex.update(false);
  tex.vScale = -1;   // the canvas paints top-down, a plane's v runs bottom-up: without this every sign read upside down
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

// ── Pass 7 phase 2 spread: a tiled grain over every procedural venue floor ───────────────────────────────────────────
// The fenced builder paints each floor's albedo (markings, organic water/snow/sand, studio rings). Instead of repainting,
// a PBR detail map multiplies a tiled grain over it: the red channel carries luminance (128 = no change), green/blue a
// flat normal, alpha a neutral roughness. Markings stay crisp; a flat green pitch stops reading as a vector fill.

export type FloorDetail = { kind: GroundKind; blend: number };

/** Which grain a builder floor kind takes (albedo multiply only). Court, mat, stage, snow and water keep their paint. */
export function floorDetailFor(floorKind: string): FloorDetail | null {
  switch (floorKind) {
    case 'pitch': case 'diamond': case 'green': return { kind: 'grass', blend: 0.55 };
    case 'sand': return { kind: 'sand', blend: 0.45 };
    case 'street': return { kind: 'asphalt', blend: 0.6 };
    case 'hardcourt': return { kind: 'concrete', blend: 0.22 };
    default: return null;
  }
}

/** metres one DETAIL tile covers — grass wider than its albedo tile so the mottle reads as patches, not a grid */
export const DETAIL_TILE_M: Record<GroundKind, number> = { grass: 9, sand: 4, concrete: 6, asphalt: 6 };

const detailCache = new WeakMap<Scene, Map<GroundKind, DynamicTexture>>();

/** Neutral-luminance grain of one kind for a PBR detail map (cached per scene; tile with uScale/vScale on a copy). */
export function groundDetailTexture(scene: Scene, kind: GroundKind, size = 512): DynamicTexture {
  let map = detailCache.get(scene); if (!map) { map = new Map(); detailCache.set(scene, map); }
  const hit = map.get(kind); if (hit) return hit;
  const src = groundTexture(scene, kind, size);
  const tex = new DynamicTexture(`fel_ground_detail_${kind}`, size, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.drawImage((src.getContext() as CanvasRenderingContext2D).canvas as unknown as CanvasImageSource, 0, 0);
  if (kind === 'grass') {
    // blades are one or two pixels and mipmap away at play distance; a low-frequency mottle (mown bands, damp patches)
    // is what reads from the camera
    const r = rng(77);
    for (let i = 0; i < 70; i++) {
      const x = r() * size, y = r() * size, rad = 30 + r() * 110;
      const g = ctx.createRadialGradient(x, y, 1, x, y, rad);
      const dark = r() < 0.5;
      g.addColorStop(0, dark ? 'rgba(0,0,0,0.13)' : 'rgba(255,255,255,0.11)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // (mower stripes were tried: one stripe per 3 m tile read as a checkerboard across the fairway — measured 2026-09-06)
  }
  // headless (NullEngine) canvases hand back no pixels — keep the untouched grain rather than dying (skate headless suite, 2026-09-06)
  const img = ctx.getImageData?.(0, 0, size, size); const d = img?.data;
  if (!d) { tex.update(false); tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.wrapV = Texture.WRAP_ADDRESSMODE; map.set(kind, tex); return tex; }
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const mean = sum / (d.length / 4) || 128;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = Math.max(0, Math.min(255, Math.round(128 + (l - mean) * 1.6)));   // luminance around neutral, contrast up
    d[i + 1] = 128; d[i + 2] = 128; d[i + 3] = 128;                          // flat normal, neutral roughness
  }
  ctx.putImageData(img, 0, 0);
  tex.update(false);
  tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.wrapV = Texture.WRAP_ADDRESSMODE; tex.anisotropicFilteringLevel = 8;
  map.set(kind, tex);
  return tex;
}

/** Layer the grain over a built venue floor (`venue_ground` under `root`, PBR material). No-op for kinds without a grain. */
export function applyFloorDetail(scene: Scene, root: TransformNode, floorKind: string, size: [number, number]): boolean {
  const detail = floorDetailFor(floorKind); if (!detail) return false;
  const ground = root.getChildMeshes(false).find((m) => m.name === 'venue_ground');
  return ground ? applyFloorDetailToMesh(scene, ground, detail, size) : false;
}

/** Layer a grain over one floor mesh (a mode's own slab, e.g. the skatepark). Needs a PBR material; the tile follows `size`. */
export function applyFloorDetailToMesh(scene: Scene, ground: AbstractMesh, detail: FloorDetail, size: [number, number]): boolean {
  const mat = ground.material as PBRMaterial | null;
  if (!mat || !(mat instanceof PBRMaterial)) return false;
  try { return applyDetail(scene, ground, mat, detail, size); } catch (e) { console.warn('[FEL-GROUND] floor grain skipped:', (e as Error).message); return false; }
}

function applyDetail(scene: Scene, ground: AbstractMesh, mat: PBRMaterial, detail: FloorDetail, size: [number, number]): boolean {
  const src = groundDetailTexture(scene, detail.kind);
  const tex = new DynamicTexture(`fel_ground_detail_${detail.kind}_i`, src.getSize().width, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.drawImage((src.getContext() as CanvasRenderingContext2D).canvas as unknown as CanvasImageSource, 0, 0);
  tex.update(false);
  tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.wrapV = Texture.WRAP_ADDRESSMODE; tex.anisotropicFilteringLevel = 8;
  tex.uScale = Math.max(1, size[0] / DETAIL_TILE_M[detail.kind]); tex.vScale = Math.max(1, size[1] / DETAIL_TILE_M[detail.kind]);
  mat.detailMap.isEnabled = true;
  mat.detailMap.texture = tex;
  mat.detailMap.diffuseBlendLevel = detail.blend;
  mat.detailMap.bumpLevel = 0;
  mat.detailMap.roughnessBlendLevel = 0;
  ground.onDisposeObservable.add(() => tex.dispose());
  return true;
}
