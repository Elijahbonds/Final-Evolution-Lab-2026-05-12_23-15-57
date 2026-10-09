// The procedural patterns (IMPROVE (2026-10-06), CREATOR-PLAN phase 3). Pure and deterministic: the same (p, q) gives
// the same answer on every device, in every mode and in the tests (camo's noise is an integer hash, not Math.random).
//
// Each pattern is evaluated per texel in PATTERN SPACE: the body chart's metres (bodyChart.ts), moved to the layer's
// offset, turned by its rotation, divided by its period (6 cm × scale) and its stretch. One unit is one repeat. A
// pattern answers two coverages in 0..1 — INK (the first colour) and ACCENT (the third colour, for the patterns that
// use one) — antialiased over `aa` (one texel, in pattern units). The compositor lays them over the second colour, or
// over the skin when the layer has only one colour.
//
// `weight` (0.05–0.95, the layer's `weight`, 0.5 by default) is each pattern's one shape knob: the stripe's share of the
// repeat, the dot's size, the line's thickness, camo's coverage.

import type { PaintPattern } from '../../../creator/look/doc';

/** A pattern's repeat at scale 1, in metres. */
export const PATTERN_PERIOD = 0.06;

const TWO_PI = Math.PI * 2;
const SQRT3 = Math.sqrt(3);
const frac = (x: number): number => x - Math.floor(x);
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Coverage of a shape at signed distance d (inside positive), antialiased over aa. */
const cover = (d: number, aa: number): number => clamp01(0.5 + d / aa);

/** Coverage of the band [0, w) inside one repeat [0, 1), for a value v in [0, 1). */
function band(v: number, w: number, aa: number): number {
  const d = v < w ? Math.min(v, w - v) : -Math.min(v - w, 1 - v);
  return cover(d, aa);
}

/** A thin line centred on every integer of x: half-width h. */
const line = (x: number, h: number, aa: number): number => cover(h - Math.abs(x - Math.round(x)), aa);

/** Integer hash → [0, 1). Deterministic everywhere (no Math.random, no platform floats in the hash). */
export function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1]. */
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Three octaves of value noise, in [0, 1]. */
export function fbm(x: number, y: number, seed: number): number {
  return (valueNoise(x, y, seed) * 0.57 + valueNoise(x * 2.03, y * 2.03, seed + 1) * 0.29 + valueNoise(x * 4.1, y * 4.1, seed + 2) * 0.14);
}

/** Radial patterns count this many spokes. */
export const SPOKES = 12;
export const RAYS = 16;

/**
 * Sample a pattern at (p, q) (pattern units; q runs up). Writes out[0] = ink, out[1] = accent. Gradient is not here:
 * it runs across its region, not in repeats (composite.ts).
 */
export function samplePattern(kind: PaintPattern, p: number, q: number, weight: number, aa: number, out: Float32Array): void {
  let ink = 0, accent = 0;
  switch (kind) {
    case 'stripes': ink = band(frac(q), weight, aa); break;
    case 'lines': {
      // pinstripes: thin lines, one per repeat
      ink = line(q, 0.02 + 0.1 * weight, aa);
      break;
    }
    case 'chevrons': ink = band(frac(q + Math.abs(frac(p) - 0.5)), weight, aa); break;
    case 'waves': ink = band(frac(q + 0.22 * Math.sin(TWO_PI * p)), weight, aa); break;
    case 'checks': {
      const cx = Math.floor(p), cy = Math.floor(q);
      const odd = ((cx + cy) & 1) === 1;
      const d = Math.min(Math.abs(p - Math.round(p)), Math.abs(q - Math.round(q)));   // distance to the nearest cell edge
      const k = clamp01(d / aa * 2);   // 0 on an edge (half and half), 1 inside a cell
      ink = odd ? 0.5 + 0.5 * k : 0.5 - 0.5 * k;
      break;
    }
    case 'dots': {
      // offset rows, like a printed polka dot
      const row = Math.floor(q);
      const px = p + (row & 1 ? 0.5 : 0);
      const dx = frac(px) - 0.5, dy = frac(q) - 0.5;
      ink = cover(0.08 + 0.36 * weight - Math.hypot(dx, dy), aa);
      break;
    }
    case 'scales': {
      // fish scales: discs of radius 0.5 in rows half a repeat apart, each row offset by half; a lower row lies over the
      // row above it, so a point belongs to the lowest disc that holds it. Ink is the scale's rim.
      const rim = 0.04 + 0.16 * weight;
      const j0 = Math.floor(q / 0.5);
      ink = 0;
      for (let j = j0 - 1; j <= j0 + 2; j++) {
        const cy = j * 0.5;
        const off = j & 1 ? 0.5 : 0;
        const cx = Math.round(p - off) + off;
        const d = Math.hypot(p - cx, q - cy);
        if (d < 0.5) { ink = cover(rim - (0.5 - d), aa); accent = clamp01((0.5 - d) / 0.5) * 0.35; break; }
      }
      break;
    }
    case 'hexes': {
      // honeycomb outlines: distance to the nearest hexagon edge
      ink = cover(0.03 + 0.12 * weight - hexDist(p, q, SQRT3), aa);
      break;
    }
    case 'carbon': {
      // twill weave: 2 × 2 cells of alternating tows, each shaded across its width
      const u = p * 4, v = q * 4;
      const cx = Math.floor(u), cy = Math.floor(v);
      const across = ((cx + cy) & 1) === 0 ? frac(v) : frac(u);
      const sheen = 1 - Math.abs(2 * across - 1);
      ink = clamp01(sheen * (0.4 + weight));
      break;
    }
    case 'camo': {
      const n1 = fbm(p * 1.3, q * 1.3, 11);
      const edge = 0.75 - weight * 0.5;   // more weight, more ink (about half the ground at 0.5)
      ink = clamp01(0.5 + (n1 - edge) / Math.max(aa * 0.5, 0.015));
      const n2 = fbm(p * 1.7 + 17.3, q * 1.7 - 9.1, 23);
      accent = clamp01(0.5 + (n2 - 0.66) / Math.max(aa * 0.5, 0.015));
      break;
    }
    case 'radial': {
      // rays from the layer's centre (its x, y)
      const a = Math.atan2(q, p);
      const v = frac(a / TWO_PI * RAYS);
      // a ray's width in pattern units grows with the radius; antialias in angle at this radius
      const r = Math.max(1e-6, Math.hypot(p, q));
      ink = band(v, weight, Math.min(1, aa / (r * TWO_PI / RAYS)));
      break;
    }
    case 'web': {
      // spokes from the centre and rings of straight threads between them, one ring per repeat
      const r = Math.hypot(p, q);
      const a = Math.atan2(q, p);
      const sector = TWO_PI / SPOKES;
      const k = Math.round(a / sector);
      const dSpoke = r * Math.abs(Math.sin(a - k * sector));
      const mid = (Math.floor(a / sector) + 0.5) * sector;
      const rho = r * Math.cos(a - mid) / Math.cos(sector / 2);   // distance along the sector, in ring units
      const sag = 0.08 * (1 - Math.pow(Math.cos((a - mid) / (sector / 2) * Math.PI / 2), 2));   // threads droop between spokes
      const dRing = Math.abs(rho + sag - Math.round(rho + sag)) * Math.cos(sector / 2);
      const h = 0.015 + 0.06 * weight;
      ink = r < 0.15 ? cover(h - dSpoke, aa) : Math.max(cover(h - dSpoke, aa), cover(h - dRing, aa));
      break;
    }
    case 'gradient': ink = 0; break;
  }
  out[0] = ink; out[1] = accent;
}

/** Distance from (x, y) to the nearest edge of a unit honeycomb (cells 1 across their flats). */
function hexDist(x: number, y: number, s3: number): number {
  // two offset rectangular lattices; the nearer centre owns the point
  const ax = x - Math.round(x), ay = y - Math.round(y / s3) * s3;
  const bx = x - (Math.round(x - 0.5) + 0.5), by = y - (Math.round((y - s3 / 2) / s3) * s3 + s3 / 2);
  const [dx, dy] = ax * ax + ay * ay < bx * bx + by * by ? [ax, ay] : [bx, by];
  // distance to the hexagon's edge (flat-topped hexagon with inradius 0.5)
  const qx = Math.abs(dx), qy = Math.abs(dy);
  const toEdge = Math.max(qx, qx * 0.5 + qy * (s3 / 2));
  return Math.abs(0.5 - toEdge);
}

/** A gradient's position (0..1) to its colour weights: 1–3 stops spread evenly; `weight` moves the middle. */
export function gradientMix(g: number, stops: number, weight: number): { from: number; to: number; k: number } {
  let x = clamp01(g);
  // the middle moves to `weight`: piecewise linear so x = weight lands halfway
  x = x < weight ? (x / weight) * 0.5 : 0.5 + ((x - weight) / (1 - weight)) * 0.5;
  if (stops <= 2) return { from: 0, to: 1, k: x };
  const seg = x < 0.5 ? 0 : 1;
  return { from: seg, to: seg + 1, k: seg ? (x - 0.5) * 2 : x * 2 };
}
