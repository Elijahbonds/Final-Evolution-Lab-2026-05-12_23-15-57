// ARENA PAINT — what an arena's walls and floor are DRAWN with (visual pass, lane/vis-combat, 2026-10-13).
//
// Before this every arena wall was one flat colour on a plane (a beige slab around the dojo, a grey one round the Foundry)
// and the floor carried only what the venue painted (a ring, or nothing). A fighting game's arena is a character: the
// timber-and-plaster of a dojo courtyard, the riveted plate and hazard stripe of a foundry, the lit board of a rooftop
// billboard. All of it is procedural — a 512 px tile per wall style and one overlay per floor — and every painter is a
// pure function over a 2-D context (no Babylon), so a test can hold what each one draws.
//
// A wall tile spans WALL_TILE_M metres across and the whole wall height up, so a segment tiles it by length (arenaBuild
// passes frontUVs). A floor overlay is painted over the arena's bounding rectangle at the arena's own aspect.

import { rng, type Ctx } from './fxPaint';
import type { CombatArena } from './arenas';

export type WallStyle = 'plaster' | 'stone' | 'steel' | 'billboard' | 'rock' | 'ropes';
export type FloorStyle = 'dojo-court' | 'sigil' | 'neon-octagon' | 'foundry-plate' | 'pit-crest' | 'rooftop-pad' | 'shrine-ring';

/** metres of wall one tile covers, across */
export const WALL_TILE_M = 3.1;

/** Which wall a combat arena is built of, and which floor overlay it wears. Pure data: arenas.test-style tests hold it. */
export const WALL_STYLE_OF: Readonly<Record<string, WallStyle>> = {
  gauntlet: 'stone', dojo: 'plaster', cage: 'ropes', foundry: 'steel', pit: 'ropes', rooftop: 'billboard', cliff: 'rock',
};
export const FLOOR_STYLE_OF: Readonly<Record<string, FloorStyle>> = {
  gauntlet: 'sigil', dojo: 'dojo-court', cage: 'neon-octagon', foundry: 'foundry-plate', pit: 'pit-crest', rooftop: 'rooftop-pad', cliff: 'shrine-ring',
};
export const wallStyleOf = (a: CombatArena): WallStyle => WALL_STYLE_OF[a.id] ?? (a.edge === 'ropes' ? 'ropes' : 'plaster');
export const floorStyleOf = (a: CombatArena): FloorStyle | null => FLOOR_STYLE_OF[a.id] ?? null;

// ── colour helpers (a painter needs a few shades of the arena's own colour) ───────────────────────────────────────────

function parse(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
/** `hex` scaled toward black (k<1) or white (k>1), as an rgb() string. */
export function shade(hex: string, k: number, alpha = 1): string {
  const [r, g, b] = parse(hex);
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round(k <= 1 ? v * k : v + (255 - v) * (k - 1))));
  return alpha >= 1 ? `rgb(${f(r)},${f(g)},${f(b)})` : `rgba(${f(r)},${f(g)},${f(b)},${alpha})`;
}
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = parse(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function speckle(ctx: Ctx, size: number, r: () => number, n: number, light: string, dark: string, maxPx = 2): void {
  ctx.globalAlpha = 0.3;   // faint: a tiled wall that reads at 3 m must not shimmer at 10
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = r() < 0.5 ? light : dark;
    ctx.fillRect(r() * size, r() * size, 1 + r() * maxPx, 1 + r() * maxPx);
  }
  ctx.globalAlpha = 1;
}

function grain(ctx: Ctx, x: number, y: number, w: number, h: number, r: () => number, dark: string, lines = 7, vertical = true): void {
  ctx.strokeStyle = dark; ctx.lineWidth = 1;
  for (let i = 0; i < lines; i++) {
    ctx.beginPath();
    if (vertical) { const gx = x + r() * w; ctx.moveTo(gx, y); ctx.lineTo(gx + (r() - 0.5) * 3, y + h); } else { const gy = y + r() * h; ctx.moveTo(x, gy); ctx.lineTo(x + w, gy + (r() - 0.5) * 3); }
    ctx.stroke();
  }
}

// ── walls ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A dojo courtyard wall: plaster panels between dark timber posts, a tie beam on top, a stone plinth below. */
export function paintWallPlaster(ctx: Ctx, size: number, base: string, accent: string): void {
  const r = rng(101), S = size;
  ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, r, 5200, shade(base, 1.12), shade(base, 0.82));
  // damp and dirt: the plaster darkens toward the ground and stains in a few long vertical streaks
  const dirt = ctx.createLinearGradient(0, S * 0.35, 0, S);
  dirt.addColorStop(0, 'rgba(60,44,30,0)'); dirt.addColorStop(1, 'rgba(60,44,30,0.34)');
  ctx.fillStyle = dirt; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 9; i++) { const x = r() * S, w = 6 + r() * 22; const g = ctx.createLinearGradient(0, S * 0.1, 0, S * 0.8); g.addColorStop(0, 'rgba(70,52,36,0)'); g.addColorStop(1, `rgba(70,52,36,${0.05 + r() * 0.08})`); ctx.fillStyle = g; ctx.fillRect(x, S * 0.1, w, S * 0.7); }
  const wood = '#3a2820', woodHi = '#5a4030';
  // the plinth: dressed stone, 13% of the height
  const py = S * 0.86;
  ctx.fillStyle = shade(base, 0.62); ctx.fillRect(0, py, S, S - py);
  ctx.strokeStyle = shade(base, 0.42); ctx.lineWidth = 2;
  for (let k = 0; k < 4; k++) { const x = (k + (r() * 0.3)) * (S / 4); ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x, S); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(0, py + (S - py) / 2); ctx.lineTo(S, py + (S - py) / 2); ctx.stroke();
  speckle(ctx, S, r, 700, shade(base, 0.9), shade(base, 0.4), 3);
  // the tie beam (top 9%) and a lower rail (a third of the way down)
  for (const [y0, h] of [[0, S * 0.09], [S * 0.5, S * 0.035]] as const) {
    ctx.fillStyle = wood; ctx.fillRect(0, y0, S, h);
    grain(ctx, 0, y0, S, h, r, woodHi, 6, false);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, y0 + h, S, 3);   // the shadow it throws on the plaster
  }
  // two timber posts per tile, one on each edge so a tiled wall shows a post every WALL_TILE_M
  for (const x0 of [-S * 0.035, S - S * 0.035]) {
    ctx.fillStyle = wood; ctx.fillRect(x0, 0, S * 0.07, py);
    grain(ctx, x0, 0, S * 0.07, py, r, woodHi, 5, true);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x0 + S * 0.07, 0, 3, py);
  }
  // the panel inset between rail and plinth: a thin lighter frame so the plaster reads as panels, not a sheet
  ctx.strokeStyle = shade(base, 1.18); ctx.lineWidth = 2;
  ctx.strokeRect(S * 0.08, S * 0.55, S * 0.84, py - S * 0.55 - S * 0.03);
  ctx.strokeRect(S * 0.08, S * 0.12, S * 0.84, S * 0.5 - S * 0.12 - S * 0.03);
  // a painted mon on the upper panel — the house's mark, thin ink on plaster, a dot of the accent in the middle
  ctx.strokeStyle = shade(base, 0.6, 0.55); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(S / 2, S * 0.31, S * 0.075, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(S / 2, S * 0.31, S * 0.058, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = rgba(accent, 0.42); ctx.beginPath(); ctx.arc(S / 2, S * 0.31, S * 0.022, 0, Math.PI * 2); ctx.fill();
}

/** A shrine courtyard ring wall: coursed stone blocks with mortar, moss at the foot, a cap course on top. */
export function paintWallStone(ctx: Ctx, size: number, base: string, accent: string): void {
  const r = rng(202), S = size;
  ctx.fillStyle = shade(base, 0.7); ctx.fillRect(0, 0, S, S);
  const rows = 6, rh = S / rows;
  for (let row = 0; row < rows; row++) {
    const y = row * rh, n = 3 + (row % 2), bw = S / n, off = row % 2 ? bw * 0.5 : 0;
    for (let k = -1; k <= n; k++) {
      const x = k * bw + off + (r() - 0.5) * 6, v = 0.86 + r() * 0.3;
      ctx.fillStyle = shade(base, v); ctx.fillRect(x + 2, y + 2, bw - 4, rh - 4);
      const g = ctx.createLinearGradient(0, y, 0, y + rh);      // a lit top edge and a shaded bottom edge on every block
      g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(0.18, 'rgba(255,255,255,0)'); g.addColorStop(0.8, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = g; ctx.fillRect(x + 2, y + 2, bw - 4, rh - 4);
    }
  }
  speckle(ctx, S, r, 4200, shade(base, 1.18), shade(base, 0.55));
  // moss and damp climbing from the foot
  const moss = ctx.createLinearGradient(0, S * 0.62, 0, S);
  moss.addColorStop(0, 'rgba(70,96,52,0)'); moss.addColorStop(1, 'rgba(70,96,52,0.42)');
  ctx.fillStyle = moss; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) { const x = r() * S, y = S * (0.72 + r() * 0.28), rad = 6 + r() * 18; const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, 'rgba(60,88,44,0.35)'); g.addColorStop(1, 'rgba(60,88,44,0)'); ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  // the cap course
  ctx.fillStyle = shade(base, 0.52); ctx.fillRect(0, 0, S, S * 0.06);
  ctx.fillStyle = rgba(accent, 0.5); ctx.fillRect(0, S * 0.06, S, 3);
}

/** A foundry plate wall: riveted steel, rust running from the rivets, a hazard band at the foot. Vents are the emissive. */
export function paintWallSteel(ctx: Ctx, size: number, base: string, accent: string, emissive = false): void {
  const r = rng(303), S = size, plates = 3, pw = S / plates, py = S * 0.9;
  if (emissive) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
    for (let k = 0; k < plates; k++) {   // one furnace vent per plate: a row of hot slots
      for (let s = 0; s < 5; s++) {
        const g = ctx.createLinearGradient(0, S * 0.32, 0, S * 0.62);
        g.addColorStop(0, shade(accent, 1.15)); g.addColorStop(1, shade(accent, 0.8));
        ctx.fillStyle = g; ctx.fillRect(k * pw + pw * 0.2, S * (0.3 + s * 0.06), pw * 0.6, S * 0.03);
      }
    }
    return;
  }
  ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, r, 6000, shade(base, 1.35), shade(base, 0.55));
  for (let k = 0; k < plates; k++) {
    const x = k * pw;
    const g = ctx.createLinearGradient(x, 0, x + pw, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.1)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g; ctx.fillRect(x, 0, pw, py);
    ctx.strokeStyle = shade(base, 0.35); ctx.lineWidth = 4; ctx.strokeRect(x + 2, 2, pw - 4, py - 4);
    ctx.strokeStyle = shade(base, 1.45); ctx.globalAlpha = 0.25; ctx.lineWidth = 1; ctx.strokeRect(x + 6, 6, pw - 12, py - 12); ctx.globalAlpha = 1;
    // rivets on the frame, each with a rust streak below it
    for (let i = 0; i < 6; i++) for (const yy of [S * 0.04, py - S * 0.04]) {
      const rx = x + 10 + (i * (pw - 20)) / 5;
      ctx.fillStyle = shade(base, 0.45); ctx.beginPath(); ctx.arc(rx, yy, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade(base, 1.5); ctx.beginPath(); ctx.arc(rx - 0.8, yy - 0.8, 1.2, 0, Math.PI * 2); ctx.fill();
      if (yy < S * 0.5 && r() < 0.6) { const rg = ctx.createLinearGradient(0, yy, 0, yy + 50 + r() * 110); rg.addColorStop(0, 'rgba(120,60,24,0.5)'); rg.addColorStop(1, 'rgba(120,60,24,0)'); ctx.fillStyle = rg; ctx.fillRect(rx - 1.5, yy, 3, 160); }
    }
    // the vent housing the emissive pass lights: a dark recess with slots
    ctx.fillStyle = 'rgba(8,8,10,0.85)'; ctx.fillRect(x + pw * 0.16, S * 0.27, pw * 0.68, S * 0.38);
    ctx.fillStyle = shade(base, 0.3); for (let s = 0; s < 5; s++) ctx.fillRect(x + pw * 0.2, S * (0.3 + s * 0.06), pw * 0.6, S * 0.03);
  }
  // hazard band: black and accent diagonals along the foot
  ctx.save(); ctx.beginPath(); ctx.rect(0, py, S, S - py); ctx.clip();
  ctx.fillStyle = '#16161a'; ctx.fillRect(0, py, S, S - py);
  ctx.fillStyle = shade(accent, 0.95);
  for (let x = -S; x < S * 2; x += 36) { ctx.beginPath(); ctx.moveTo(x, S); ctx.lineTo(x + 18, S); ctx.lineTo(x + 18 + (S - py), py); ctx.lineTo(x + (S - py), py); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}

/** A rooftop billboard: a dark frame round a lit board. The board is the emissive; the frame is not. */
export function paintWallBillboard(ctx: Ctx, size: number, base: string, accent: string, emissive = false): void {
  const S = size, m = S * 0.07, r = rng(404);
  if (!emissive) {
    ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, r, 2600, shade(base, 1.5), shade(base, 0.5));
    ctx.fillStyle = '#0a0d14'; ctx.fillRect(m, m, S - 2 * m, S - 2 * m);    // the board's black glass
    ctx.strokeStyle = shade(base, 1.6); ctx.lineWidth = 3; ctx.strokeRect(m - 3, m - 3, S - 2 * m + 6, S - 2 * m + 6);
    return;
  }
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
  ctx.save(); ctx.beginPath(); ctx.rect(m, m, S - 2 * m, S - 2 * m); ctx.clip();
  const g = ctx.createLinearGradient(m, m, S - m, S - m);
  g.addColorStop(0, shade(accent, 0.55)); g.addColorStop(0.5, shade(accent, 0.95)); g.addColorStop(1, '#f472b6');
  ctx.fillStyle = g; ctx.fillRect(m, m, S - 2 * m, S - 2 * m);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  for (let y = m; y < S - m; y += 6) ctx.fillRect(m, y, S - 2 * m, 2);        // scanlines
  ctx.fillStyle = shade(accent, 1.55, 0.85);   // the ad's bars: a pale tint of the board, not paper white (white clipped to a flat bright block)
  for (let k = 0; k < 4; k++) ctx.fillRect(m + (S - 2 * m) * (0.1 + k * 0.22), S * 0.44, (S - 2 * m) * 0.12, S * 0.12);  // a bar chart's worth of ad
  ctx.restore();
}

/** A sea cliff face: strata in warm greys, cracks, moss at the base. */
export function paintWallRock(ctx: Ctx, size: number, base: string, accent: string): void {
  const r = rng(505), S = size;
  ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
  for (let y = 0; y < S;) {
    const h = 10 + r() * 36, v = 0.72 + r() * 0.5;
    ctx.fillStyle = shade(base, v); ctx.globalAlpha = 0.55; ctx.fillRect(0, y, S, h); ctx.globalAlpha = 1;
    ctx.strokeStyle = shade(base, 0.45); ctx.globalAlpha = 0.5; ctx.lineWidth = 1 + r() * 2;
    ctx.beginPath(); ctx.moveTo(0, y); for (let x = 0; x <= S; x += 32) ctx.lineTo(x, y + (r() - 0.5) * 8); ctx.stroke(); ctx.globalAlpha = 1;
    y += h;
  }
  speckle(ctx, S, r, 7000, shade(base, 1.3), shade(base, 0.45), 3);
  ctx.strokeStyle = 'rgba(15,12,10,0.55)'; ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) { let x = r() * S, y = r() * S * 0.4; ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 7; k++) { x += (r() - 0.5) * 36; y += 20 + r() * 44; ctx.lineTo(x, y); } ctx.stroke(); }
  const moss = ctx.createLinearGradient(0, S * 0.55, 0, S);
  moss.addColorStop(0, 'rgba(60,110,70,0)'); moss.addColorStop(1, rgba(accent, 0.14));
  ctx.fillStyle = moss; ctx.fillRect(0, 0, S, S);
}

export function paintWall(ctx: Ctx, size: number, style: WallStyle, base: string, accent: string, emissive = false): boolean {
  switch (style) {
    case 'plaster': if (emissive) return false; paintWallPlaster(ctx, size, base, accent); return true;
    case 'stone': if (emissive) return false; paintWallStone(ctx, size, base, accent); return true;
    case 'steel': paintWallSteel(ctx, size, base, accent, emissive); return true;
    case 'billboard': paintWallBillboard(ctx, size, base, accent, emissive); return true;
    case 'rock': if (emissive) return false; paintWallRock(ctx, size, base, accent); return true;
    default: return false;
  }
}
/** Which wall styles carry an emissive texture (the vents, the lit board). */
export const WALL_HAS_EMISSIVE: ReadonlySet<WallStyle> = new Set(['steel', 'billboard']);

// ── floors ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface FloorPaint { accent: string; wall: string; w: number; h: number; disc: boolean }

function octagon(ctx: Ctx, cx: number, cy: number, R: number, rot = Math.PI / 8): void {
  ctx.beginPath();
  for (let k = 0; k <= 8; k++) { const a = rot + (k / 8) * Math.PI * 2; const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R; if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  ctx.closePath();
}

/** Corner brackets of a rectangle: the four L-marks a fighting ring is cornered with. */
function brackets(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, len: number): void {
  ctx.beginPath();
  for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]] as const) {
    ctx.moveTo(x + sx * len, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * len);
  }
  ctx.stroke();
}

/** `emissive` paints only what GLOWS (the neon lines) on black; otherwise the whole overlay (neon lines included, dimmer). */
export function paintFloor(ctx: Ctx, style: FloorStyle, p: FloorPaint, emissive = false): void {
  const { w, h, accent, wall } = p, cx = w / 2, cy = h / 2, m = Math.min(w, h), r = rng(77);
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (style === 'dojo-court') {
    if (emissive) return;
    const ink = 'rgba(48,34,24,0.5)', ink2 = 'rgba(48,34,24,0.28)';
    ctx.strokeStyle = ink; ctx.lineWidth = m * 0.012; ctx.strokeRect(w * 0.035, h * 0.035, w * 0.93, h * 0.93);
    ctx.strokeStyle = ink2; ctx.lineWidth = m * 0.006; ctx.strokeRect(w * 0.06, h * 0.06, w * 0.88, h * 0.88);
    ctx.strokeStyle = rgba(accent, 0.55); ctx.lineWidth = m * 0.014; brackets(ctx, w * 0.035, h * 0.035, w * 0.965, h * 0.965, m * 0.09);
    // the centre mark: a ring and a tomoe of three commas
    ctx.strokeStyle = ink; ctx.lineWidth = m * 0.01; ctx.beginPath(); ctx.arc(cx, cy, m * 0.15, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = ink2; ctx.beginPath(); ctx.arc(cx, cy, m * 0.185, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = ink;   // three small ink commas round the middle (a tomoe), each ringed in the accent
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 - Math.PI / 2, x = cx + Math.cos(a) * m * 0.085, y = cy + Math.sin(a) * m * 0.085;
      ctx.beginPath(); ctx.arc(x, y, m * 0.017, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(accent, 0.5); ctx.lineWidth = m * 0.004; ctx.beginPath(); ctx.arc(x, y, m * 0.027, 0, Math.PI * 2); ctx.stroke();
    }
    // two centre-line ticks (where the fighters spawn), so the floor has a composition
    ctx.strokeStyle = ink2; ctx.lineWidth = m * 0.006;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx - m * 0.05, cy + s * m * 0.3); ctx.lineTo(cx + m * 0.05, cy + s * m * 0.3); ctx.stroke(); }
    return;
  }
  if (style === 'sigil' || style === 'shrine-ring') {
    const green = style === 'shrine-ring';
    if (emissive) return;
    const ink = green ? 'rgba(40,52,44,0.55)' : 'rgba(58,44,34,0.55)', ink2 = green ? 'rgba(40,52,44,0.3)' : 'rgba(58,44,34,0.3)';
    ctx.strokeStyle = ink; ctx.lineWidth = m * 0.012; ctx.beginPath(); ctx.arc(cx, cy, m * 0.46, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = ink2; ctx.lineWidth = m * 0.006; ctx.beginPath(); ctx.arc(cx, cy, m * 0.43, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, m * 0.28, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = rgba(accent, green ? 0.42 : 0.3); ctx.lineWidth = m * 0.008; ctx.beginPath(); ctx.arc(cx, cy, m * 0.13, 0, Math.PI * 2); ctx.stroke();
    // 36 ticks round the rim (every ninth is long) and an eight-point star in the middle
    ctx.strokeStyle = ink; ctx.lineWidth = m * 0.005;
    for (let k = 0; k < 36; k++) { const a = (k / 36) * Math.PI * 2, long = k % 9 === 0, r0 = m * (long ? 0.395 : 0.41), r1 = m * 0.428; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke(); }
    ctx.strokeStyle = rgba(accent, green ? 0.38 : 0.26); ctx.lineWidth = m * 0.006;
    ctx.beginPath(); for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, rr = k % 2 ? m * 0.06 : m * 0.15; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.closePath(); ctx.stroke();
    if (green) { // cracked paving: a few hairlines from the middle
      ctx.strokeStyle = 'rgba(25,32,28,0.5)'; ctx.lineWidth = m * 0.004;
      for (let k = 0; k < 9; k++) { let x = cx, y = cy, a = r() * Math.PI * 2; ctx.beginPath(); ctx.moveTo(x, y); for (let s = 0; s < 6; s++) { a += (r() - 0.5) * 0.8; x += Math.cos(a) * m * 0.06; y += Math.sin(a) * m * 0.06; ctx.lineTo(x, y); } ctx.stroke(); }
    }
    return;
  }
  if (style === 'neon-octagon') {
    const neon = (alpha: number): string => rgba(accent, alpha);
    if (emissive) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); }
    // an outer glow pass then the line, so the line has a halo even where the glow layer is off
    for (const [lw, a] of [[m * 0.034, 0.1], [m * 0.018, 0.22], [m * 0.007, emissive ? 1 : 0.9]] as const) {
      ctx.strokeStyle = neon(a); ctx.lineWidth = lw;
      octagon(ctx, cx, cy, m * 0.455); ctx.stroke();
      octagon(ctx, cx, cy, m * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, m * 0.09, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); for (let k = 0; k < 8; k++) { const a2 = Math.PI / 8 + (k / 8) * Math.PI * 2; ctx.moveTo(cx + Math.cos(a2) * m * 0.3, cy + Math.sin(a2) * m * 0.3); ctx.lineTo(cx + Math.cos(a2) * m * 0.455, cy + Math.sin(a2) * m * 0.455); } ctx.stroke();
    }
    return;
  }
  if (style === 'foundry-plate') {
    if (emissive) return;
    // floor plate seams every ~1/7 and an inner hazard-striped frame
    ctx.strokeStyle = 'rgba(8,8,10,0.45)'; ctx.lineWidth = m * 0.004;
    for (let k = 1; k < 7; k++) { ctx.beginPath(); ctx.moveTo((k * w) / 7, 0); ctx.lineTo((k * w) / 7, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, (k * h) / 7); ctx.lineTo(w, (k * h) / 7); ctx.stroke(); }
    const f = m * 0.045; ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.rect(f, f, w - 2 * f, h - 2 * f); ctx.clip('evenodd');
    ctx.fillStyle = 'rgba(14,14,18,0.8)'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = rgba(accent, 0.8);
    const s = m * 0.05; for (let x = -h; x < w + h; x += s * 2) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + s, h); ctx.lineTo(x + s + h, 0); ctx.lineTo(x + h, 0); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = rgba(accent, 0.4); ctx.lineWidth = m * 0.008; ctx.beginPath(); ctx.arc(cx, cy, m * 0.12, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - m * 0.2, cy); ctx.lineTo(cx + m * 0.2, cy); ctx.moveTo(cx, cy - m * 0.2); ctx.lineTo(cx, cy + m * 0.2); ctx.stroke();
    return;
  }
  if (style === 'pit-crest') {
    const gold = (a: number): string => rgba(accent, a);
    if (emissive) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); }
    ctx.strokeStyle = gold(emissive ? 0.9 : 0.75); ctx.lineWidth = m * 0.012; octagon(ctx, cx, cy, m * 0.46); ctx.stroke();
    if (emissive) return;
    ctx.strokeStyle = gold(0.35); ctx.lineWidth = m * 0.006; octagon(ctx, cx, cy, m * 0.42); ctx.stroke(); octagon(ctx, cx, cy, m * 0.2); ctx.stroke();
    ctx.beginPath(); for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + (k / 8) * Math.PI * 2; ctx.moveTo(cx + Math.cos(a) * m * 0.2, cy + Math.sin(a) * m * 0.2); ctx.lineTo(cx + Math.cos(a) * m * 0.42, cy + Math.sin(a) * m * 0.42); } ctx.stroke();
    // the house crest: bold FEL letters in the middle, on a darkened disc so it reads on any floor
    ctx.fillStyle = 'rgba(10,10,14,0.55)'; octagon(ctx, cx, cy, m * 0.19); ctx.fill();
    ctx.fillStyle = gold(0.85); ctx.font = `800 ${Math.round(m * 0.13)}px "Plus Jakarta Sans", "DM Sans", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('FEL', cx, cy + m * 0.006);
    return;
  }
  if (style === 'rooftop-pad') {
    if (emissive) return;
    // safety edge: yellow dashes along the whole border (the long drop either side), a white centre circle with a crest
    ctx.strokeStyle = 'rgba(255,214,64,0.85)'; ctx.lineWidth = m * 0.022; ctx.setLineDash([m * 0.07, m * 0.05]); ctx.strokeRect(w * 0.04, h * 0.05, w * 0.92, h * 0.9); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(235,240,250,0.55)'; ctx.lineWidth = m * 0.012; ctx.beginPath(); ctx.arc(cx, cy, m * 0.3, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = rgba(accent, 0.55); ctx.lineWidth = m * 0.008; ctx.beginPath(); ctx.arc(cx, cy, m * 0.26, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(235,240,250,0.5)'; ctx.font = `800 ${Math.round(m * 0.15)}px "Plus Jakarta Sans", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('FEL', cx, cy + m * 0.008);
    // chevrons toward each billboard end
    ctx.strokeStyle = rgba(accent, 0.5); ctx.lineWidth = m * 0.012;
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const y = cy + s * h * (0.33 + k * 0.035); ctx.beginPath(); ctx.moveTo(cx - m * 0.08, y); ctx.lineTo(cx, y + s * m * 0.03); ctx.lineTo(cx + m * 0.08, y); ctx.stroke(); }
    return;
  }
  void wall;
}
export const FLOOR_HAS_EMISSIVE: ReadonlySet<FloorStyle> = new Set(['neon-octagon', 'pit-crest']);
