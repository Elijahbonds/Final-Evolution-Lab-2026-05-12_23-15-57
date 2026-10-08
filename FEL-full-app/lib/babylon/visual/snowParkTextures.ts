// snowParkTextures — the Gate Crasher park's surfaces, painted (GATE-CRASHER-POLISH-2, 2026-09-28).
//
// The eye on 46a8dc6a (GC-4): "untextured grey box walls, plain white wedge kickers, smooth grey rock blobs, low-poly cone
// pines against a photographic sky". Every park material was a flat PBR colour — and the kickers could not have carried a
// texture anyway: rampWedge built its prism with no UVs at all. The features keep their gameplay volumes (the solids, the
// grind lines and the ramps the rider's ray rides are unchanged); what the eye sees on them is painted here:
//
//   packed snow   kickers and rollers: shovel-cut ridges, wind mottling, sparkle — with a normal map, so the ridges catch
//                 the low alpine sun instead of reading as a white wedge
//   jib box       painted steel side panels, seams and bolts, a hazard band in the venue's accent; an HDPE slide deck
//   wallride      plywood sheets (grain, seams, screws), a painted chevron band, rubber streaks where boards hit it
//   rail stand    brushed dark steel with the uprights picked out
//   rock          granite with cracks and a snow cap (the fallback look — the mode swaps in the Kenney kit's rocks)
//   pine          needle strokes on drooping branch tiers with snow on each, and bark — the procedural forest's cones
//
// Everything is seeded, so every mount paints the same park; every texture tiles (WRAP) and the meshes carry metre-scale
// UVs (rideWorlds.rampWedge, parkBoxUV), PARK_TILE_M a repeat.
import { Color3, DynamicTexture, PBRMaterial, Texture, Vector4 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';

/** Metres of park surface one texture repeat covers. */
export const PARK_TILE_M = 2;

export interface SnowParkPalette { ground: string; edge: string; accent: string; structure: string }
export interface SnowParkMaterials {
  feature: PBRMaterial; box: PBRMaterial; deck: PBRMaterial; wall: PBRMaterial; rail: PBRMaterial; lip: PBRMaterial;
  rock: PBRMaterial; pineLeaf: PBRMaterial; pineBark: PBRMaterial; pineSnow: PBRMaterial;
  dispose(): void;
}

type G = CanvasRenderingContext2D;
/** A seeded LCG: the same park every mount (Math.random() painted a different one each time). */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
function hashStr(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
function mix(a: string, b: string, t: number): string { return Color3.Lerp(Color3.FromHexString(a), Color3.FromHexString(b), Math.max(0, Math.min(1, t))).toHexString(); }
function rgba(hex: string, a: number): string { const c = Color3.FromHexString(hex); return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`; }

function painted(scene: Scene, name: string, size: number, paint: (g: G, S: number, r: () => number) => void): DynamicTexture {
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, true);
  const g = tex.getContext() as unknown as G;
  paint(g, size, rng(hashStr(name)));
  tex.update();
  tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 8;   // the park is seen at a grazing angle down the run
  return tex;
}

/** A tangent-space normal map from a painted height field (white = high): the relief the low sun reads. */
function normalMap(scene: Scene, name: string, size: number, strength: number, paintHeight: (g: G, S: number, r: () => number) => void): DynamicTexture {
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, true);
  const g = tex.getContext() as unknown as G;
  g.fillStyle = '#808080'; g.fillRect(0, 0, size, size);
  paintHeight(g, size, rng(hashStr(name)));
  const img = g.getImageData(0, 0, size, size);
  const h = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) h[i] = img.data[i * 4] / 255;
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const inv = 1 / Math.hypot(dx, dy, 1);
    const o = (y * size + x) * 4;
    img.data[o] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
    img.data[o + 1] = Math.round((-dy * inv * 0.5 + 0.5) * 255);
    img.data[o + 2] = Math.round((inv * 0.5 + 0.5) * 255);
    img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  tex.update();
  tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

function pbr(scene: Scene, name: string, albedo: DynamicTexture, roughness: number, bump?: DynamicTexture, bumpLevel = 1): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoTexture = albedo;
  m.albedoColor = Color3.White();
  m.metallic = 0; m.roughness = roughness;
  if (bump) { m.bumpTexture = bump; bump.level = bumpLevel; }
  return m;
}

// ── the painters ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Packed snow: the base a shade off the groom, wind mottling, shovel ridges across the ramp, sparkle. */
function paintPackedSnow(P: SnowParkPalette): (g: G, S: number, r: () => number) => void {
  return (g, S, r) => {
    g.fillStyle = mix(P.ground, P.edge, 0.12); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) {   // wind mottling: soft shadow and light patches
      const x = r() * S, y = r() * S, rad = S * (0.05 + r() * 0.12);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const col = r() < 0.55 ? P.edge : '#ffffff';
      gr.addColorStop(0, rgba(col, 0.10)); gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    g.lineWidth = 2;
    for (let y = 0; y < S; y += S / 22) {   // shovel-cut ridges across the ramp (u = across, v = up the slope)
      g.strokeStyle = rgba(P.edge, 0.14 + r() * 0.08);
      g.beginPath();
      for (let x = 0; x <= S; x += 16) g.lineTo(x, y + Math.sin(x * 0.02 + y) * 2.5 + (r() - 0.5) * 1.5);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      for (let x = 0; x <= S; x += 16) g.lineTo(x, y + 2 + Math.sin(x * 0.02 + y) * 2.5);
      g.stroke();
    }
    for (let i = 0; i < 2600; i++) { g.fillStyle = r() < 0.7 ? 'rgba(255,255,255,0.75)' : rgba(P.edge, 0.22); g.fillRect(r() * S, r() * S, 1 + (r() < 0.1 ? 1 : 0), 1); }
  };
}
function heightPackedSnow(g: G, S: number, r: () => number): void {
  for (let y = 0; y < S; y += S / 22) {
    const band = g.createLinearGradient(0, y - 5, 0, y + 7);
    band.addColorStop(0, 'rgba(90,90,90,0)'); band.addColorStop(0.45, 'rgba(210,210,210,0.9)'); band.addColorStop(1, 'rgba(90,90,90,0)');
    g.fillStyle = band; g.fillRect(0, y - 5, S, 12);
  }
  for (let i = 0; i < 260; i++) { const v = Math.round(90 + r() * 120); g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.beginPath(); g.arc(r() * S, r() * S, 2 + r() * 9, 0, Math.PI * 2); g.fill(); }
}

/** Jib-box side panels: painted steel, seams, bolts, a hazard band in the venue accent, board scuffs. Mapped once per face
 *  height (v 0…1 over the side), so the band always shows. */
function paintBoxSide(P: SnowParkPalette): (g: G, S: number, r: () => number) => void {
  return (g, S, r) => {
    const steel = mix(P.edge, '#1c232e', 0.5);
    g.fillStyle = steel; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)'; g.fillRect(r() * S, r() * S, 12 + r() * 40, 1); }   // brushed streaks
    // the hazard band: diagonal accent / white stripes across the middle
    const y0 = S * 0.36, y1 = S * 0.64;
    g.save(); g.beginPath(); g.rect(0, y0, S, y1 - y0); g.clip();
    for (let x = -S; x < S * 2; x += S / 8) {
      g.fillStyle = rgba(P.accent, 0.92); g.beginPath(); g.moveTo(x, y1); g.lineTo(x + S / 16, y1); g.lineTo(x + S / 16 + (y1 - y0), y0); g.lineTo(x + (y1 - y0), y0); g.closePath(); g.fill();
      g.fillStyle = 'rgba(240,244,248,0.9)'; g.beginPath(); g.moveTo(x + S / 16, y1); g.lineTo(x + S / 8, y1); g.lineTo(x + S / 8 + (y1 - y0), y0); g.lineTo(x + S / 16 + (y1 - y0), y0); g.closePath(); g.fill();
    }
    g.restore();
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y0 - 3, S, 3); g.fillRect(0, y1, S, 3);
    for (let x = 0; x <= S; x += S / 2) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x - 2, 0, 4, S); }   // panel seams
    for (const x of [S * 0.06, S * 0.44, S * 0.56, S * 0.94]) for (const y of [S * 0.1, S * 0.9]) {   // bolts
      g.fillStyle = 'rgba(210,218,226,0.8)'; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.arc(x + 1.5, y + 1.5, 5, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 60; i++) { g.strokeStyle = 'rgba(230,236,242,0.18)'; g.lineWidth = 1 + r() * 2; const x = r() * S, y = r() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20 + r() * 60, y + (r() - 0.5) * 6); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(0, 0, S, S * 0.05);   // snow packed along the top edge
  };
}

/** The HDPE slide deck: near-white plastic with long board scratches along it. */
function paintDeck(g: G, S: number, r: () => number): void {
  g.fillStyle = '#e4e9ee'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 220; i++) { g.strokeStyle = `rgba(120,132,146,${0.08 + r() * 0.12})`; g.lineWidth = 1; const y = r() * S, x = r() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 60 + r() * 200, y + (r() - 0.5) * 3); g.stroke(); }
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(30,34,40,0.10)'; g.fillRect(r() * S, r() * S, 30 + r() * 80, 2); }   // wax and base marks
}

/** Wallride plywood: sheets with grain, seams and screws, a painted chevron band, rubber streaks from boards. */
function paintWallride(P: SnowParkPalette): (g: G, S: number, r: () => number) => void {
  return (g, S, r) => {
    g.fillStyle = '#b98c5c'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 3) {   // the grain
      g.strokeStyle = `rgba(${90 + Math.round(r() * 40)},${58 + Math.round(r() * 20)},${30},${0.12 + r() * 0.14})`;
      g.lineWidth = 1 + r() * 1.5; g.beginPath();
      const ph = r() * 6;
      for (let x = 0; x <= S; x += 12) g.lineTo(x, y + Math.sin(x * 0.012 + ph) * 3);
      g.stroke();
    }
    for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(80,50,24,0.35)'; g.beginPath(); g.ellipse(r() * S, r() * S, 6 + r() * 8, 3 + r() * 3, 0, 0, Math.PI * 2); g.fill(); }   // knots
    // the painted band: a run of chevrons in the accent, pointing down the line
    const y0 = S * 0.3, y1 = S * 0.7, mid = (y0 + y1) / 2;
    g.fillStyle = rgba(P.accent, 0.85); g.fillRect(0, y0, S, y1 - y0);
    g.fillStyle = 'rgba(245,247,250,0.9)';
    for (let x = 0; x < S; x += S / 4) { g.beginPath(); g.moveTo(x + S * 0.04, y0 + 10); g.lineTo(x + S * 0.14, mid); g.lineTo(x + S * 0.04, y1 - 10); g.lineTo(x + S * 0.09, y1 - 10); g.lineTo(x + S * 0.19, mid); g.lineTo(x + S * 0.09, y0 + 10); g.closePath(); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,0.5)';
    for (const x of [0, S / 2, S]) g.fillRect(x - 2, 0, 4, S);   // sheet seams
    g.fillRect(0, 0, S, 3); g.fillRect(0, S - 3, S, 3);
    for (const x of [S * 0.03, S * 0.47, S * 0.53, S * 0.97]) for (let y = S * 0.06; y < S; y += S * 0.22) { g.fillStyle = 'rgba(40,40,44,0.8)'; g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
    for (let i = 0; i < 26; i++) { g.strokeStyle = `rgba(20,20,24,${0.12 + r() * 0.18})`; g.lineWidth = 2 + r() * 5; const x = r() * S, y = S * (0.2 + r() * 0.6); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 40, y - 10 - r() * 30, x + 80 + r() * 90, y - r() * 20); g.stroke(); }
  };
}

/** Rail stand: brushed dark steel with the uprights picked out in the accent. */
function paintRailStand(P: SnowParkPalette): (g: G, S: number, r: () => number) => void {
  return (g, S, r) => {
    g.fillStyle = mix(P.edge, '#1c232e', 0.62); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 500; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.1)'; g.fillRect(r() * S, r() * S, 20 + r() * 50, 1); }
    for (const x of [S * 0.08, S * 0.58]) { g.fillStyle = rgba(P.accent, 0.9); g.fillRect(x, 0, S * 0.08, S); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + S * 0.075, 0, 3, S); }
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(0, 0, S, S * 0.05);
  };
}

/** Granite with cracks and a snow cap on the upper rows (the fallback rock; the Kenney kit's rocks replace it on load). */
function paintRock(g: G, S: number, r: () => number): void {
  g.fillStyle = '#6f7680'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1800; i++) { const v = 70 + Math.round(r() * 90); g.fillStyle = `rgba(${v},${v + 4},${v + 10},0.35)`; g.fillRect(r() * S, r() * S, 2 + r() * 6, 2 + r() * 6); }
  for (let i = 0; i < 22; i++) { g.strokeStyle = 'rgba(30,32,38,0.5)'; g.lineWidth = 1 + r() * 2; let x = r() * S, y = r() * S; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 50; y += r() * 30; g.lineTo(x, y); } g.stroke(); }
  const cap = g.createLinearGradient(0, S * 0.62, 0, S * 0.82);   // v runs up the sphere: the top rows are the cap
  cap.addColorStop(0, 'rgba(240,246,252,0)'); cap.addColorStop(1, 'rgba(240,246,252,0.95)');
  g.fillStyle = cap; g.fillRect(0, S * 0.62, S, S * 0.38);
}

/** Needles on drooping branch tiers with snow along the top of each (v runs up the cone). */
function paintNeedles(leaf: string, snow: string): (g: G, S: number, r: () => number) => void {
  return (g, S, r) => {
    g.fillStyle = mix(leaf, '#000000', 0.25); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 5200; i++) {
      const x = r() * S, y = r() * S, len = 6 + r() * 12, a = Math.PI * (0.55 + r() * 0.3);
      g.strokeStyle = rgba(mix(leaf, r() < 0.5 ? '#ffffff' : '#000000', r() * 0.35), 0.55); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len * (r() < 0.5 ? 1 : -1), y + Math.sin(a) * len); g.stroke();
    }
    for (let band = 0; band < 4; band++) {   // the branch tiers: a dark drooping edge, snow resting on top of it
      const y = S * (0.12 + band * 0.24);
      g.fillStyle = 'rgba(0,0,0,0.28)';
      for (let x = 0; x < S; x += S / 10) { g.beginPath(); g.ellipse(x + S / 20, y + 14, S / 18, 9, 0, 0, Math.PI); g.fill(); }
      g.fillStyle = rgba(snow, 0.92);
      for (let x = 0; x < S; x += S / 10) { g.beginPath(); g.ellipse(x + S / 20 + (r() - 0.5) * 8, y, S / 22, 6 + r() * 4, 0, Math.PI, Math.PI * 2); g.fill(); }
      for (let i = 0; i < 140; i++) { g.fillStyle = rgba(snow, 0.6); g.fillRect(r() * S, y - 4 + r() * 10, 2, 2); }
    }
  };
}
function paintBark(g: G, S: number, r: () => number): void {
  g.fillStyle = '#4a3423'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 700; i++) { g.strokeStyle = `rgba(${30 + Math.round(r() * 50)},${20 + Math.round(r() * 30)},${12},${0.3 + r() * 0.4})`; g.lineWidth = 1 + r() * 2; const x = r() * S, y = r() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y + 10 + r() * 30); g.stroke(); }
}
function paintSnowCap(g: G, S: number, r: () => number): void {
  g.fillStyle = '#eef4fb'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.6 ? 'rgba(255,255,255,0.8)' : 'rgba(150,175,205,0.25)'; g.fillRect(r() * S, r() * S, 2, 2); }
}

/** Build the park's materials for a venue palette. One set per mount; `dispose` releases the textures with them. */
export function snowParkMaterials(scene: Scene, id: string, P: SnowParkPalette, pine: { leaf: string; bark: string; snow: string }): SnowParkMaterials {
  const snowAlb = painted(scene, `park_snow_${id}`, 512, paintPackedSnow(P));
  const snowNrm = normalMap(scene, `park_snow_n_${id}`, 256, 3.2, heightPackedSnow);
  const feature = pbr(scene, `snowFeat_${id}`, snowAlb, 0.82, snowNrm, 0.9);
  const box = pbr(scene, `snowBox_${id}`, painted(scene, `park_box_${id}`, 512, paintBoxSide(P)), 0.55);
  box.metallic = 0.35;
  const deck = pbr(scene, `snowDeck_${id}`, painted(scene, `park_deck_${id}`, 256, paintDeck), 0.4);
  const wall = pbr(scene, `snowWall_${id}`, painted(scene, `park_wall_${id}`, 512, paintWallride(P)), 0.78);
  const rail = pbr(scene, `snowRail_${id}`, painted(scene, `park_rail_${id}`, 256, paintRailStand(P)), 0.5);
  rail.metallic = 0.45;
  const lipTex = painted(scene, `park_lip_${id}`, 128, (g, S, r) => { g.fillStyle = P.accent; g.fillRect(0, 0, S, S); for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(r() * S, r() * S, 2, 2); } });
  const lip = pbr(scene, `snowLip_${id}`, lipTex, 0.6);
  const rockNrm = normalMap(scene, `park_rock_n_${id}`, 256, 4, (g, S, r) => { for (let i = 0; i < 600; i++) { const v = Math.round(60 + r() * 160); g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(r() * S, r() * S, 3 + r() * 12, 3 + r() * 12); } });
  const rock = pbr(scene, `rockM_${id}`, painted(scene, `park_rock_${id}`, 512, paintRock), 0.9, rockNrm, 1);
  const pineLeaf = pbr(scene, `pineLeaf_${id}`, painted(scene, `park_needles_${id}`, 512, paintNeedles(pine.leaf, pine.snow)), 0.92);
  const pineBark = pbr(scene, `pineBark_${id}`, painted(scene, `park_bark_${id}`, 256, paintBark), 0.95);
  const pineSnow = pbr(scene, `pineSnow_${id}`, painted(scene, `park_snowcap_${id}`, 128, paintSnowCap), 0.85);
  const all = [feature, box, deck, wall, rail, lip, rock, pineLeaf, pineBark, pineSnow];
  return { feature, box, deck, wall, rail, lip, rock, pineLeaf, pineBark, pineSnow, dispose: () => all.forEach((m) => m.dispose(true, true)) };
}

/**
 * Metre-scale UVs for a park box (CreateBox `faceUV`, faces back, front, right, left, top, bottom): the long faces repeat
 * every PARK_TILE_M along the run; `sideOnce` maps each side face's height to one whole repeat (the jib box's hazard band
 * and the wallride's chevrons always show whatever the feature's height).
 */
export function parkBoxUV(width: number, height: number, depth: number, sideOnce = false): Vector4[] {
  const T = PARK_TILE_M;
  const v = sideOnce ? 1 : height / T;
  return [
    new Vector4(0, 0, width / T, v), new Vector4(0, 0, width / T, v),
    new Vector4(0, 0, depth / T, v), new Vector4(0, 0, depth / T, v),
    new Vector4(0, 0, width / T, depth / T), new Vector4(0, 0, width / T, depth / T),
  ];
}
