// THE CLOTHES' OWN COLOURS AS A TEXTURE (IMPROVE (2026-10-06), CREATOR-PLAN phase 4e) — what paint is drawn over.
//
// Unpainted, a code-built garment's colours are VERTEX colours (no texture at all, crisp at every two-tone cut). Once a
// paint layer reaches it, renderPaint composites the layers into a texture over the garment's own albedo; this file is
// that albedo: every garment triangle filled in the body's UV space (the garment's UVs ARE the body's) with its colour,
// inner pieces first so the outer one wins where two share texels (a tee under a jacket: only what shows matters), padded
// a few texels past every island so mipmaps do not bleed. A tube (skirt, coat) has no body UVs: its vertices sit on a
// SWATCH (build.ts SWATCH), a small block per piece and colour in an empty corner of the layout, filled here. Pure.
//
// The bytes are gamma (sRGB) like every albedo texture: 255 · c^(1/2.2), the same reading renderPaint gives a material's
// tint, so a painted garment's unpainted texels match the vertex colours it showed before.

import { SWATCH } from './build';

export type RGB = [number, number, number];

const gammaByte = (c: number): number => Math.round(255 * Math.pow(Math.min(1, Math.max(0, c)), 1 / 2.2));

/**
 * `uv` (2 per vertex), `ind`, `colour` (a palette index per vertex) → size × size RGBA. Texels no triangle covers stay
 * transparent black until the padding fills the ones near an island.
 */
export function rasterClothBase(uv: ArrayLike<number>, ind: ArrayLike<number>, colour: ArrayLike<number>, palette: readonly RGB[], size: number, pieces: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const bytes = palette.map((c) => [gammaByte(c[0]), gammaByte(c[1]), gammaByte(c[2])]);
  for (let t = 0; t + 2 < ind.length; t += 3) {
    const a = ind[t], b = ind[t + 1], c = ind[t + 2];
    const x0 = uv[a * 2] * size, y0 = uv[a * 2 + 1] * size, x1 = uv[b * 2] * size, y1 = uv[b * 2 + 1] * size, x2 = uv[c * 2] * size, y2 = uv[c * 2 + 1] * size;
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-9) continue;
    const col = bytes[colour[a]] ?? [255, 255, 255];
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(size - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(size - 1, Math.ceil(Math.max(y0, y1, y2)));
    const s = area > 0 ? 1 : -1;
    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const w0 = s * ((x2 - x1) * (py - y1) - (y2 - y1) * (px - x1));
        const w1 = s * ((x0 - x2) * (py - y2) - (y0 - y2) * (px - x2));
        const w2 = s * ((x1 - x0) * (py - y0) - (y1 - y0) * (px - x0));
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const i = (y * size + x) * 4;
        out[i] = col[0]; out[i + 1] = col[1]; out[i + 2] = col[2]; out[i + 3] = 255;
      }
    }
  }
  dilate(out, size, Math.max(2, Math.round(size / 256)));
  // the swatches: one block per piece and colour
  const block = Math.max(2, Math.round(SWATCH.size * size));
  for (let p = 0; p < pieces; p++) for (let tone = 0; tone < 2; tone++) {
    const col = bytes[p * 2 + tone];
    if (!col) continue;
    const bx = Math.round((SWATCH.u0 + (p * 2 + tone) * SWATCH.size) * size), by = Math.round(SWATCH.v0 * size);
    for (let y = by; y < Math.min(size, by + block); y++) for (let x = bx; x < Math.min(size, bx + block); x++) {
      const i = (y * size + x) * 4;
      out[i] = col[0]; out[i + 1] = col[1]; out[i + 2] = col[2]; out[i + 3] = 255;
    }
  }
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  return out;
}

/** Grow filled texels into empty neighbours, `steps` deep. */
function dilate(buf: Uint8Array, size: number, steps: number): void {
  for (let s = 0; s < steps; s++) {
    const filled = new Uint8Array(size * size);
    for (let i = 0; i < size * size; i++) filled[i] = buf[i * 4 + 3];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (filled[i]) continue;
      for (const [dx, dy] of NB) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= size || Y >= size) continue;
        const j = Y * size + X;
        if (!filled[j]) continue;
        buf[i * 4] = buf[j * 4]; buf[i * 4 + 1] = buf[j * 4 + 1]; buf[i * 4 + 2] = buf[j * 4 + 2]; buf[i * 4 + 3] = 255;
        break;
      }
    }
  }
}
const NB: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
