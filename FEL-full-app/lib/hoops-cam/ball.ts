// lib/hoops-cam/ball.ts — basketball on the camera (BBS, 2026-10-26): the ball in one frame, in plain JS.
//
// No model and no new package (owner, 2026-10-26: "write ball and hoop detection in plain JS (colour/shape) on top of the
// existing camera feed"). A basketball is an orange-brown disc that MOVES; nearly everything else of that colour in a
// gym (the floor, the rim, a bench) stands still. So a pixel is a ball candidate when it is:
//   BALL-COLOURED   red the strongest channel, then green, then blue; a hue of HUE_MIN–HUE_MAX° (orange to brown);
//                   saturated (chroma ÷ red ≥ SAT_MIN) and not black (red ≥ RED_MIN);
//   MOVING          off the background model (a per-pixel running mean of the colour) by ≥ MOTION_MIN summed over the
//                   three channels. The model learns BG_RATE a frame where the pixel looks like background, BG_RATE_FG
//                   where it does not, so a held ball sinks in only slowly and a still floor is learned at once.
// The candidate mask is closed by CLOSE 3×3 dilations (a ball's dark seams cut it into pieces), the pixels grouped
// (4-connected), and each group is scored as a disc: fill (its pixels ÷ its box ≈ π/4 for a
// disc), aspect (≤ ASPECT_MAX: motion blur stretches a fast ball), size (its radius against what the caller expects).
// The pose's FACE and TORSO are masked when the caller passes them: a moving head is a skin-coloured disc, an orange
// jersey a moving orange block; a ball held against the chest is not wanted anyway (a shot starts once it leaves).
//
// THE PICTURE NEVER LEAVES THE DEVICE. The frame is a downscaled colour copy the page already holds (frame.ts); this
// reads it and keeps only the background model, which is never shown or sent.
//
// Pure.
import type { Circle, Rgb } from './frame';

/** (new) Ball colour: hue range (degrees, red 0 → yellow 60), saturation floor, brightness floor. */
export const HUE_MIN = 4;
export const HUE_MAX = 42;
export const SAT_MIN = 0.6;
export const RED_MIN = 45;
/** (new) Motion: the summed |ΔR|+|ΔG|+|ΔB| off the background that counts as moving. */
export const MOTION_MIN = 42;
/** (new) The background's learning rate per frame, where the pixel looks still / where it is moving. */
export const BG_RATE = 0.06;
export const BG_RATE_FG = 0.02;
/** (new) A group must cover at least this many pixels, and look like a disc: fill and aspect bounds. */
export const MIN_AREA = 5;
export const FILL_MIN = 0.42;
export const ASPECT_MAX = 2.6;
/** Groups beyond this many are not scored (a frame of pure motion: the phone moved). */
const MAX_GROUPS = 400;

export interface BallCand extends Circle {
  /** Pixels in the group. */
  area: number;
  fill: number;
  aspect: number;
  /** 0..1: how disc-like (fill and aspect) — the tracker adds size and position. */
  shape: number;
}

/** The parts of the picture not to look in, from the pose: discs (the face) and convex quads (the torso). */
export interface Mask { discs?: Circle[]; quads?: { x: number; y: number }[][] }

/** Ball colour, by the rules above. */
export function ballColoured(r: number, g: number, b: number): boolean {
  if (r < RED_MIN || r < g || g < b) return false;
  const c = r - b;
  if (c < 18 || c / r < SAT_MIN) return false;
  const hue = (60 * (g - b)) / c;
  return hue >= HUE_MIN && hue <= HUE_MAX;
}

function inQuad(q: { x: number; y: number }[], x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i], b = q[(i + 1) % q.length];
    const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (c === 0) continue;
    const s = c > 0 ? 1 : -1;
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return true;
}

export function masked(m: Mask | null | undefined, x: number, y: number): boolean {
  if (!m) return false;
  for (const d of m.discs ?? []) if ((x - d.x) ** 2 + (y - d.y) ** 2 <= d.r * d.r) return true;
  for (const q of m.quads ?? []) if (q.length >= 3 && inQuad(q, x, y)) return true;
  return false;
}

export class BallDetector {
  private bg: Float32Array | null = null;
  private w = 0;
  private h = 0;
  private mask: Uint8Array = new Uint8Array(0);
  private label: Int32Array = new Int32Array(0);
  private stack: Int32Array = new Int32Array(0);
  private tmp: Uint8Array = new Uint8Array(0);
  /** Frames the background has seen (the first few are learning). */
  frames = 0;

  reset(): void { this.bg = null; this.frames = 0; }

  /**
   * The disc-like moving ball-coloured groups in this frame, best shape first. `win` limits the search to a box (the
   * tracker's gate) when given; the background is learned over the whole frame either way.
   */
  detect(f: Rgb, o: { exclude?: Mask | null; win?: { x0: number; y0: number; x1: number; y1: number } | null; colourOnly?: boolean; close?: number } = {}): BallCand[] {
    const { w, h, data } = f;
    if (!this.bg || w !== this.w || h !== this.h) {
      this.w = w; this.h = h;
      const bg = new Float32Array(w * h * 3);
      for (let i = 0, p = 0; i < w * h; i++, p += 4) { bg[i * 3] = data[p]; bg[i * 3 + 1] = data[p + 1]; bg[i * 3 + 2] = data[p + 2]; }
      this.bg = bg;
      this.mask = new Uint8Array(w * h);
      this.label = new Int32Array(w * h);
      this.stack = new Int32Array(w * h);
      this.frames = 1;
      return [];
    }
    const bg = this.bg, mask = this.mask;
    mask.fill(0);
    const win = o.win ?? null;
    const wx0 = win ? Math.max(0, Math.floor(win.x0)) : 0, wx1 = win ? Math.min(w - 1, Math.ceil(win.x1)) : w - 1;
    const wy0 = win ? Math.max(0, Math.floor(win.y0)) : 0, wy1 = win ? Math.min(h - 1, Math.ceil(win.y1)) : h - 1;
    for (let y = 0; y < h; y++) {
      const inRows = y >= wy0 && y <= wy1;
      for (let x = 0; x < w; x++) {
        const i = y * w + x, p = i * 4, k = i * 3;
        const r = data[p], g = data[p + 1], b = data[p + 2];
        const d = Math.abs(r - bg[k]) + Math.abs(g - bg[k + 1]) + Math.abs(b - bg[k + 2]);
        const moving = d >= MOTION_MIN;
        const rate = moving ? BG_RATE_FG : BG_RATE;
        bg[k] += (r - bg[k]) * rate; bg[k + 1] += (g - bg[k + 1]) * rate; bg[k + 2] += (b - bg[k + 2]) * rate;
        if (!inRows || x < wx0 || x > wx1) continue;
        if ((moving || o.colourOnly) && ballColoured(r, g, b)) mask[i] = 1;
      }
    }
    this.frames++;
    // close the seams: a ball's dark seams cut its disc into pieces a pixel or few wide
    const close = Math.max(0, Math.min(3, o.close ?? 0));
    for (let k = 0; k < close; k++) this.dilate(wx0, wy0, wx1, wy1);
    return this.groups(wx0, wy0, wx1, wy1, o.exclude ?? null, close);
  }

  /** A 3×3 dilation of the mask inside the box (separable: rows, then columns). */
  private dilate(x0: number, y0: number, x1: number, y1: number): void {
    const { w, mask } = this;
    const tmp = this.tmp.length === mask.length ? this.tmp : (this.tmp = new Uint8Array(mask.length));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        tmp[i] = mask[i] | (x > x0 ? mask[i - 1] : 0) | (x < x1 ? mask[i + 1] : 0);
      }
    }
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        mask[i] = tmp[i] | (y > y0 ? tmp[i - w] : 0) | (y < y1 ? tmp[i + w] : 0);
      }
    }
  }

  private groups(x0: number, y0: number, x1: number, y1: number, exclude: Mask | null, grown = 0): BallCand[] {
    const { w, mask, label, stack } = this;
    label.fill(0, y0 * w, (y1 + 1) * w);
    const out: BallCand[] = [];
    let next = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const s = y * w + x;
        if (!mask[s] || label[s]) continue;
        if (++next > MAX_GROUPS) return out.sort((a, b) => b.shape - a.shape);
        let top = 0, area = 0, sx = 0, sy = 0, minx = x, maxx = x, miny = y, maxy = y;
        stack[top++] = s; label[s] = next;
        while (top) {
          const i = stack[--top];
          const px = i % w, py = (i - px) / w;
          area++; sx += px; sy += py;
          if (px < minx) minx = px; if (px > maxx) maxx = px; if (py < miny) miny = py; if (py > maxy) maxy = py;
          if (px > x0 && mask[i - 1] && !label[i - 1]) { label[i - 1] = next; stack[top++] = i - 1; }
          if (px < x1 && mask[i + 1] && !label[i + 1]) { label[i + 1] = next; stack[top++] = i + 1; }
          if (py > y0 && mask[i - w] && !label[i - w]) { label[i - w] = next; stack[top++] = i - w; }
          if (py < y1 && mask[i + w] && !label[i + w]) { label[i + w] = next; stack[top++] = i + w; }
        }
        if (area < MIN_AREA) continue;
        const bw = maxx - minx + 1, bh = maxy - miny + 1;
        const fill = area / (bw * bh);
        const aspect = Math.max(bw, bh) / Math.min(bw, bh);
        if (fill < FILL_MIN || aspect > ASPECT_MAX) continue;
        const cx = sx / area + 0.5, cy = sy / area + 0.5;
        if (masked(exclude, cx, cy)) continue;
        // a blurred ball is a capsule: its radius is its short side's half, not the area's
        const r = Math.max(1, Math.min(Math.sqrt(area / Math.PI), Math.min(bw, bh) / 2 + 0.25) - grown);
        const shape = Math.max(0, 1 - Math.abs(fill - Math.PI / 4) * 1.6) * Math.max(0, 1 - (aspect - 1) / (ASPECT_MAX - 0.6));
        out.push({ x: cx, y: cy, r, area, fill, aspect, shape });
      }
    }
    return out.sort((a, b) => b.shape - a.shape);
  }
}

/** Where not to look, from one frame's pose (normalised landmarks → this frame's pixels): the face and the torso. */
export function poseMask(image: readonly { x: number; y: number; v: number }[] | null | undefined, w: number, h: number): Mask | null {
  if (!image || image.length < 25) return null;
  const P = (i: number) => (image[i] && image[i].v >= 0.5 ? { x: image[i].x * w, y: image[i].y * h } : null);
  const ls = P(11), rs = P(12), lh = P(23), rh = P(24), nose = P(0);
  if (!ls || !rs) return null;
  const sw = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  const discs: Circle[] = nose ? [{ x: nose.x, y: nose.y, r: Math.max(4, sw * 0.55) }] : [];
  const quads: { x: number; y: number }[][] = [];
  if (lh && rh) {
    // the torso shrunk toward its middle (a ball held at its edge or dribbled beside the hip stays outside)
    const c = { x: (ls.x + rs.x + lh.x + rh.x) / 4, y: (ls.y + rs.y + lh.y + rh.y) / 4 };
    const s = (p: { x: number; y: number }) => ({ x: c.x + (p.x - c.x) * 0.85, y: c.y + (p.y - c.y) * 0.9 });
    quads.push([s(ls), s(rs), s(rh), s(lh)]);
  }
  return { discs, quads };
}
