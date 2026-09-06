// groundTextures — procedural, seeded, tiling ground albedos (Pass 7 details, phase 2: "ground textures for every venue
// floor and surround"). No files, no downloads: a 512² DynamicTexture per kind, cached per scene, wrapped and tiled by the
// caller (uScale/vScale = metres / TILE_M). Kinds read at play distance: grass (blade speckle, two greens), sand (fine grain,
// damp streaks), concrete (slab seams, aggregate), asphalt (dark grain, faint patch lines).
import { Color3, DynamicTexture, Texture } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';

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
