// lib/hoops-cam/rim.ts — basketball on the camera (BBS, 2026-10-26): where the rim is in the picture.
//
// THE USER MARKS IT ONCE (the brief): two taps on the self-view, the rim's left end and its right end. The ring seen
// from the side is an ellipse as wide as the ring from any side; its height depends on how far below or above it the
// phone stands, which two taps cannot say, so the box takes RIM_ASPECT of its width (re-tapping corrects it at any time).
//
// A SUGGESTION FIRST (beta, plain JS): `findRim` looks for the ring the way it is painted — a thin, wide, still
// red-orange band (an orange ring and its tube, seen from the side, under a white board) — and offers it as the
// starting box. It is only a suggestion: a faded, blue or chain-net ring is not found, and the user's taps always win.
//
// Coordinates: a Rim is NORMALISED (x and the half-width as shares of the frame's width, y and the half-height as shares
// of its height), so it holds across grab sizes; `rimPx` turns it into a frame's pixels.
//
// Pure.
import type { Rgb } from './frame';

export interface Rim { x: number; y: number; hw: number; hh: number }
export interface RimPx { x: number; y: number; hw: number; hh: number }

/** (new) The ring box's height as a share of its half-width, when only its width was tapped. */
export const RIM_ASPECT = 0.3;
/** (new) The narrowest and widest ring the taps or the finder accept (share of the frame's width). */
export const RIM_MIN_W = 0.012;
export const RIM_MAX_W = 0.35;

export const rimPx = (r: Rim, w: number, h: number): RimPx => ({ x: r.x * w, y: r.y * h, hw: r.hw * w, hh: r.hh * h });

/** Two taps (normalised, either order) → the rim box; null when the taps cannot be a ring. */
export function rimFromTaps(a: { x: number; y: number }, b: { x: number; y: number }, aspect = 16 / 9): Rim | null {
  const l = a.x <= b.x ? a : b, r = a.x <= b.x ? b : a;
  const width = r.x - l.x;
  if (width < RIM_MIN_W || width > RIM_MAX_W) return null;
  // a ring is level: two taps far apart in height are a mis-tap
  if (Math.abs(r.y - l.y) * (1 / aspect) > width * 0.6) return null;
  const hw = width / 2;
  return { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2, hw, hh: hw * aspect * RIM_ASPECT };
}

/** The ring's paint: a strong red-orange (redder and more saturated than a ball or a hardwood floor). */
export function rimColoured(r: number, g: number, b: number): boolean {
  if (r < 90 || r - g < 70 || g < b) return false;
  const c = r - b;
  const hue = (60 * (g - b)) / c;
  return c / r > 0.6 && hue <= 24;
}

export interface RimGuess extends Rim { score: number }

/** The best thin, wide, ring-coloured band in a frame (beta suggestion), or null. */
export function findRim(f: Rgb): RimGuess | null {
  const { w, h, data } = f;
  const m = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) if (rimColoured(data[p], data[p + 1], data[p + 2])) m[i] = 1;
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let best: RimGuess | null = null;
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || seen[s]) continue;
    let top = 0, area = 0, minx = w, maxx = 0, miny = h, maxy = 0;
    stack[top++] = s; seen[s] = 1;
    while (top) {
      const i = stack[--top], x = i % w, y = (i - x) / w;
      area++;
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
      // 8-connected: the ring's tube is a pixel or two thick and breaks on a diagonal
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (m[j] && !seen[j]) { seen[j] = 1; stack[top++] = j; }
      }
    }
    const bw = maxx - minx + 1, bh = maxy - miny + 1;
    if (bw / w < RIM_MIN_W || bw / w > RIM_MAX_W || area < 6) continue;
    const aspect = bw / bh;
    if (aspect < 1.8) continue;                         // a ball or a blob, not a ring seen from the side
    const fill = area / (bw * bh);
    if (fill > 0.85) continue;                          // a solid bar (a sign, a stripe), not an outline
    // a board above it: bright, low-saturation pixels in a band over the ring
    let bright = 0, n = 0;
    for (let y = Math.max(0, miny - Math.round(bw * 0.8)); y < miny; y++) {
      for (let x = minx; x <= maxx; x++) {
        const p = (y * w + x) * 4, r = data[p], g = data[p + 1], b = data[p + 2];
        n++;
        if (r > 150 && g > 150 && b > 150 && Math.max(r, g, b) - Math.min(r, g, b) < 40) bright++;
      }
    }
    const board = n ? bright / n : 0;
    const score = Math.min(1, aspect / 5) * 0.5 + board * 0.5;
    if (!best || score > best.score) {
      const hw = bw / 2 / w;
      best = { x: (minx + maxx + 1) / 2 / w, y: (miny + maxy + 1) / 2 / h, hw, hh: Math.max(bh / 2 / h, hw * (w / h) * 0.12), score };
    }
  }
  return best && best.score >= 0.3 ? best : null;
}
