// The stamp shapes and the text face (IMPROVE (2026-10-06), CREATOR-PLAN phase 3). Pure maths, no canvas, no fonts.
//
// GENERIC SHAPES ONLY. Circles, stars, bolts, flames, wings, tribal curves: shapes anyone draws. Nothing here is, or is
// shaped like, anyone's logo or character mark (CREATOR-PLAN "IP: ship tools and generic shapes only"). What a player
// builds from them is theirs.
//
// Every shape is a SIGNED DISTANCE in its own unit square (x right, y up, the shape inside [-1, 1]; negative inside), so
// the compositor can antialias its edge and draw an outline at any width from the same function. Curved outlines (the
// flame, the wing, the tribal strokes) are polygons smoothed in code at load; nothing is drawn by hand into an image.
//
// TEXT has no font to load: a stroke face of the jersey plate's own characters (A–Z, 0–9, space, hyphen — exactly what
// sanitizeJersey lets through) drawn as thick lines on a 4 × 6 grid, the block lettering a team kit uses. It is the
// same on every device and testable without a browser.

import type { PaintStamp } from '../../../creator/look/doc';

type P2 = [number, number];
const len = (x: number, y: number): number => Math.sqrt(x * x + y * y);
const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);

function sdBox(x: number, y: number, bx: number, by: number): number {
  const dx = Math.abs(x) - bx, dy = Math.abs(y) - by;
  return len(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
}

// Polygon distance (after Inigo Quilez's sdPolygon): exact distance to the outline, signed by the even-odd rule.
function sdPolygon(x: number, y: number, v: Float32Array): number {
  const n = v.length / 2;
  let d = (x - v[0]) * (x - v[0]) + (y - v[1]) * (y - v[1]);
  let s = 1;
  for (let i = 0, j = n - 1; i < n; j = i, i++) {
    const vix = v[i * 2], viy = v[i * 2 + 1], vjx = v[j * 2], vjy = v[j * 2 + 1];
    const ex = vjx - vix, ey = vjy - viy, wx = x - vix, wy = y - viy;
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
    const bx = wx - ex * t, by = wy - ey * t;
    d = Math.min(d, bx * bx + by * by);
    const c1 = y >= viy, c2 = y < vjy, c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}

/** Chaikin corner cutting on a closed polygon: `n` rounds turn a rough outline into a smooth curve. */
function chaikin(pts: P2[], n: number): P2[] {
  let p = pts;
  for (let r = 0; r < n; r++) {
    const q: P2[] = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = q;
  }
  return p;
}

/** A tapered stroke along a curve: the outline of a centreline c(t) with half-width w(t), t in [0, 1]. */
function stroke(c: (t: number) => P2, w: (t: number) => number, steps = 28): P2[] {
  const left: P2[] = [], right: P2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = c(Math.max(0, t - 0.01)), b = c(Math.min(1, t + 0.01));
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const l = len(nx, ny) || 1; nx /= l; ny /= l;
    const p = c(t), h = w(t);
    left.push([p[0] + nx * h, p[1] + ny * h]);
    right.push([p[0] - nx * h, p[1] - ny * h]);
  }
  return [...left, ...right.reverse()];
}

const poly = (pts: P2[]): Float32Array => Float32Array.from(pts.flat());

const POLYS = {
  bolt: poly([[-0.1, 1], [0.55, 1], [0.15, 0.25], [0.6, 0.25], [-0.35, -1], [-0.05, -0.1], [-0.5, -0.1]]),
  chevron: poly([[-0.95, -0.1], [0, 0.85], [0.95, -0.1], [0.95, -0.6], [0, 0.3], [-0.95, -0.6]]),
  arrow: poly([[0, 0.98], [0.7, 0.25], [0.25, 0.25], [0.25, -0.95], [-0.25, -0.95], [-0.25, 0.25], [-0.7, 0.25]]),
  eyeSharp: poly(chaikin([[-0.95, -0.3], [-0.55, 0.22], [0.1, 0.42], [0.95, 0.62], [0.6, -0.05], [-0.1, -0.42]], 1)),
  flame: poly(chaikin([
    [-0.05, -0.95], [0.4, -0.85], [0.65, -0.55], [0.7, -0.15], [0.55, 0.25], [0.62, 0.62], [0.35, 0.35], [0.22, 0.98],
    [0.0, 0.45], [-0.25, 0.75], [-0.3, 0.3], [-0.6, 0.55], [-0.62, 0.1], [-0.7, -0.3], [-0.55, -0.7], [-0.3, -0.9],
  ], 2)),
  wing: poly(chaikin([
    [-0.95, 0.25], [-0.5, 0.6], [0.1, 0.82], [0.95, 0.92], [0.72, 0.55], [0.85, 0.48], [0.52, 0.2], [0.62, 0.1],
    [0.28, -0.15], [0.35, -0.27], [0.0, -0.42], [0.02, -0.55], [-0.35, -0.52], [-0.72, -0.28], [-0.95, -0.1],
  ], 1)),
  tribalCurve: poly(stroke(
    (t) => { const a = Math.PI * (1.12 - 1.24 * t); return [0.82 * Math.cos(a), 0.82 * Math.sin(a) - 0.25]; },
    (t) => 0.26 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.75) + 0.005,
  )),
  tribalSpike: poly(stroke(
    (t) => { const u = 1 - t; return [u * u * -0.55 + 2 * u * t * -0.65 + t * t * 0.75, u * u * -0.95 + 2 * u * t * 0.45 + t * t * 0.95]; },
    (t) => 0.32 * (1 - t) + 0.004,
  )),
  drop: (() => {
    const cx = 0, cy = -0.35, r = 0.6, tip: P2 = [0, 0.98];
    const toTip = Math.atan2(tip[1] - cy, tip[0] - cx), off = Math.acos(r / len(tip[0] - cx, tip[1] - cy));
    const a0 = toTip - off, a1 = toTip + off - 2 * Math.PI;
    const pts: P2[] = [tip];
    for (let i = 0; i <= 40; i++) { const a = a0 + (a1 - a0) * (i / 40); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return poly(pts);
  })(),
  slash: [-0.48, 0, 0.48].map((dx) => poly(stroke(
    (t) => [dx - 0.28 + 0.56 * t, -0.95 + 1.9 * t],
    (t) => 0.13 * Math.sin(Math.PI * t) + 0.004, 12,
  ))),
};

/** The heart (after Inigo Quilez's sdHeart), fitted into the unit square. */
function sdHeart(x: number, y: number): number {
  const k = 1.6;   // the heart's own space is 1.2 wide, 1.1 tall, its point at the origin
  const px = Math.abs(x) / k, py = (y + 0.92) / k;
  if (py + px > 1) return (len(px - 0.25, py - 0.75) - Math.SQRT2 / 4) * k;
  const m = 0.5 * Math.max(px + py, 0);
  return Math.sqrt(Math.min(px * px + (py - 1) * (py - 1), (px - m) * (px - m) + (py - m) * (py - m))) * Math.sign(px - py) * k;
}

function sdStar5(x: number, y: number, r: number, rf: number): number {
  const k1x = 0.809016994375, k1y = -0.587785252292, k2x = -k1x, k2y = k1y;
  let px = Math.abs(x), py = y;
  let d = 2 * Math.max(k1x * px + k1y * py, 0); px -= d * k1x; py -= d * k1y;
  d = 2 * Math.max(k2x * px + k2y * py, 0); px -= d * k2x; py -= d * k2y;
  px = Math.abs(px); py -= r;
  const bax = rf * -k1y - 0, bay = rf * k1x - 1;
  const h = clamp((px * bax + py * bay) / (bax * bax + bay * bay), 0, r);
  return len(px - bax * h, py - bay * h) * Math.sign(py * bax - px * bay);
}

function sdTriangle(x: number, y: number, r: number): number {
  const k = Math.sqrt(3);
  let px = Math.abs(x) - r, py = y + r / k;
  if (px + k * py > 0) { const nx = (px - k * py) / 2, ny = (-k * px - py) / 2; px = nx; py = ny; }
  px -= clamp(px, -2 * r, 0);
  return -len(px, py) * Math.sign(py);
}

function sdHexagon(x: number, y: number, r: number): number {
  const kx = -0.866025404, ky = 0.5, kz = 0.577350269;
  let px = Math.abs(x), py = Math.abs(y);
  const d = 2 * Math.min(kx * px + ky * py, 0); px -= d * kx; py -= d * ky;
  px -= clamp(px, -kz * r, kz * r); py -= r;
  return len(px, py) * Math.sign(py);
}

function sdRhombus(x: number, y: number, bx: number, by: number): number {
  const px = Math.abs(x), py = Math.abs(y);
  const h = clamp(((bx - 2 * px) * bx - (by - 2 * py) * by) / (bx * bx + by * by), -1, 1);
  const d = len(px - 0.5 * bx * (1 - h), py - 0.5 * by * (1 + h));
  return d * Math.sign(px * by + py * bx - bx * by);
}

const EYE_R = 1.2278, EYE_C = 0.7778;   // two discs whose overlap is an almond 1.9 wide, 0.9 tall

/**
 * A stamp's signed distance at (x, y) in its unit square (negative inside). `accent` (when the shape has one: the eye's
 * pupil) is written to out[0] as its own signed distance, else +Infinity.
 */
export function stampDistance(shape: PaintStamp, x: number, y: number, accent?: Float32Array): number {
  if (accent) accent[0] = Infinity;
  switch (shape) {
    case 'circle': return len(x, y) - 0.92;
    case 'ring': return Math.abs(len(x, y) - 0.68) - 0.24;
    case 'square': return sdBox(x, y, 0.76, 0.76) - 0.08;
    case 'diamond': return sdRhombus(x, y, 0.7, 0.96);
    case 'triangle': return sdTriangle(x, y + 0.245, 0.85);
    case 'star': return sdStar5(x, y + 0.08, 0.98, 0.42);
    case 'hexagon': return sdHexagon(x, y, 0.82);
    case 'heart': return sdHeart(x, y);
    case 'plus': return Math.min(sdBox(x, y, 0.92, 0.28), sdBox(x, y, 0.28, 0.92));
    case 'cross': { const u = (x + y) * Math.SQRT1_2, v = (y - x) * Math.SQRT1_2; return Math.min(sdBox(u, v, 0.98, 0.25), sdBox(u, v, 0.25, 0.98)); }
    case 'crescent': return Math.max(len(x, y) - 0.92, -(len(x - 0.4, y - 0.14) - 0.78));
    case 'eye': {
      if (accent) accent[0] = len(x, y) - 0.3;
      return Math.max(len(x, y + EYE_C) - EYE_R, len(x, y - EYE_C) - EYE_R);
    }
    case 'eyeSharp': return sdPolygon(x, y, POLYS.eyeSharp);
    case 'bolt': return sdPolygon(x, y, POLYS.bolt);
    case 'chevron': return sdPolygon(x, y, POLYS.chevron);
    case 'arrow': return sdPolygon(x, y, POLYS.arrow);
    case 'flame': return sdPolygon(x, y, POLYS.flame);
    case 'wing': return sdPolygon(x, y, POLYS.wing);
    case 'tribalCurve': return sdPolygon(x, y, POLYS.tribalCurve);
    case 'tribalSpike': return sdPolygon(x, y, POLYS.tribalSpike);
    case 'drop': return sdPolygon(x, y, POLYS.drop);
    case 'slash': return Math.min(sdPolygon(x, y, POLYS.slash[0]), sdPolygon(x, y, POLYS.slash[1]), sdPolygon(x, y, POLYS.slash[2]));
  }
}

// ── text ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Glyph grid: 4 wide, 6 tall; one advance is the glyph plus a 1.5 gap. */
export const GLYPH_W = 4, GLYPH_H = 6, GLYPH_ADVANCE = 5.5;
/** Half the stroke width, in grid units (a bold block face). */
export const GLYPH_STROKE = 0.62;

const O: P2[] = [[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]];
const PP: P2[] = [[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]];
/** Polylines per character, on the 4 × 6 grid (y up). Exactly the jersey plate's characters. */
const GLYPHS: Record<string, P2[][]> = {
  A: [[[0, 0], [0, 4], [2, 6], [4, 4], [4, 0]], [[0, 2.6], [4, 2.6]]],
  B: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  C: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1]]],
  D: [[[0, 0], [0, 6], [2.5, 6], [4, 4.5], [4, 1.5], [2.5, 0], [0, 0]]],
  E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]],
  F: [[[4, 6], [0, 6], [0, 0]], [[0, 3], [3, 3]]],
  G: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 3], [2, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[1, 6], [3, 6]], [[2, 6], [2, 0]], [[1, 0], [3, 0]]],
  J: [[[4, 6], [4, 1], [3, 0], [1, 0], [0, 1]]],
  K: [[[0, 0], [0, 6]], [[4, 6], [0, 2]], [[1.4, 3.4], [4, 0]]],
  L: [[[0, 6], [0, 0], [4, 0]]],
  M: [[[0, 0], [0, 6], [2, 3], [4, 6], [4, 0]]],
  N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
  O: [O],
  P: [PP],
  Q: [O, [[2.5, 1.5], [4, 0]]],
  R: [PP, [[2, 3], [4, 0]]],
  S: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3], [3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
  T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
  U: [[[0, 6], [0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]],
  V: [[[0, 6], [2, 0], [4, 6]]],
  W: [[[0, 6], [1, 0], [2, 4], [3, 0], [4, 6]]],
  X: [[[0, 0], [4, 6]], [[0, 6], [4, 0]]],
  Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]],
  Z: [[[0, 6], [4, 6], [0, 0], [4, 0]]],
  '0': [O, [[1, 1.5], [3, 4.5]]],
  '1': [[[1, 5], [2, 6], [2, 0]], [[1, 0], [3, 0]]],
  '2': [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [0, 0], [4, 0]]],
  '3': [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1.5, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
  '4': [[[3, 0], [3, 6], [0, 2], [4, 2]]],
  '5': [[[4, 6], [0, 6], [0, 3.5], [3, 3.5], [4, 2.5], [4, 1], [3, 0], [1, 0], [0, 1]]],
  '6': [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2.5], [3, 3.5], [0, 3.5]]],
  '7': [[[0, 6], [4, 6], [1.5, 0]]],
  '8': [[[1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3]]],
  '9': [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 3.5], [1, 2.5], [4, 2.5]]],
  '-': [[[0.5, 3], [3.5, 3]]],
  ' ': [],
};
/** Each glyph's segments as one flat array: x0 y0 x1 y1 … */
const SEGMENTS: Record<string, Float32Array> = Object.fromEntries(Object.entries(GLYPHS).map(([ch, lines]) => {
  const s: number[] = [];
  for (const l of lines) for (let i = 0; i + 1 < l.length; i++) s.push(l[i][0], l[i][1], l[i + 1][0], l[i + 1][1]);
  return [ch, Float32Array.from(s)];
}));
/** The characters the face draws (the jersey plate's set). */
export const TEXT_CHARS = Object.keys(GLYPHS).join('');

/** Width and height of a line of text, in grid units, strokes included. */
export function textBlock(text: string): { w: number; h: number } {
  const n = Math.max(1, text.length);
  return { w: n * GLYPH_ADVANCE - (GLYPH_ADVANCE - GLYPH_W) + 2 * GLYPH_STROKE, h: GLYPH_H + 2 * GLYPH_STROKE };
}

/** Signed distance (grid units, negative inside a stroke) at (x, y) measured from the text block's centre. */
export function textDistance(text: string, x: number, y: number): number {
  const n = text.length;
  if (!n) return Infinity;
  const gx = x + (n * GLYPH_ADVANCE - (GLYPH_ADVANCE - GLYPH_W)) / 2, gy = y + GLYPH_H / 2;
  const i = Math.floor((gx + (GLYPH_ADVANCE - GLYPH_W) / 2) / GLYPH_ADVANCE);
  let best = Infinity;
  // the glyph under the point and its neighbours (a stroke never reaches past the gap, but be exact at the edges)
  for (let k = Math.max(0, i - 1); k <= Math.min(n - 1, i + 1); k++) {
    const seg = SEGMENTS[text[k]];
    if (!seg) continue;
    const lx = gx - k * GLYPH_ADVANCE;
    for (let s = 0; s < seg.length; s += 4) {
      const ax = seg[s], ay = seg[s + 1], ex = seg[s + 2] - ax, ey = seg[s + 3] - ay;
      const wx = lx - ax, wy = gy - ay;
      const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey || 1), 0, 1);
      const d = len(wx - ex * t, wy - ey * t);
      if (d < best) best = d;
    }
  }
  return best - GLYPH_STROKE;
}
