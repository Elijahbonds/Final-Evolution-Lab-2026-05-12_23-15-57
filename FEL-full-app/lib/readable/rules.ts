// THE READABILITY STANDARD, as numbers (lane/readable, 2026-11-02; docs/READABLE.md says why each one is what it is).
//
// Owner, 2026-11-02: "We need to make sure people can read what they're looking at always."
//
// Pure: no DOM, no React. The rig (scripts/readable/audit.mts) measures a rendered page and judges each run of text with
// these; the source guard (tests/readable/source-floor.test.ts) judges the class names before anything renders. Contrast
// itself is lib/a11y/wcag.ts's (WCAG 1.4.3), not a second copy.
import { contrastRatio, isLargeText, minTextContrast, type Rgba } from '@/lib/a11y/wcag';
import { TYPE_SIZES_PX } from '@/lib/design/type';

export const READABLE = {
  /** Nothing a user must read is smaller: the type scale's own smallest role (TYPE.label, 12 px). */
  minPx: TYPE_SIZES_PX.label.phone,
  /** Body copy (a run longer than TYPE.small's ≤ 12 words) on a phone: the type scale's body, and iOS's default. */
  bodyPx: TYPE_SIZES_PX.body.phone,
  /** A run of more words than this is body copy, not a label or a supporting line. */
  bodyWords: 12,
  /** HUD text the player must read during play, on a 390 px phone (zoom 1). */
  hudPhonePx: 14,
  /** The same text at 1080p (console zoom 2.25): the HUD's own 10-foot floor (tv-hud's TV_MIN_READ_PX; a test holds them equal). */
  hudTvPx: 24,
  /** Read time: 0.3 s a word (≈ 200 wpm, a slow reader's pace) plus 1 s to notice the message arrived. */
  readMsPerWord: 300,
  readMsBase: 1000,
  /** The share of a glyph's ink pixels allowed under the contrast floor before the run fails (anti-aliasing noise). */
  inkPercentile: 0.1,
  /** A clipped edge smaller than this (CSS px) is sub-pixel rounding, not lost text. */
  clipSlackPx: 1.5,
} as const;

/** Words, as a reader counts them: anything between spaces that has a letter or a digit. */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** How long a message must stay up for a reader to finish it: words × 0.3 s + 1 s. */
export function minReadMs(text: string): number {
  const n = wordCount(text);
  return n === 0 ? 0 : n * READABLE.readMsPerWord + READABLE.readMsBase;
}

/** The longer of a timing's own value and the read time of what it shows. Never shortens a timing. */
export function readableMs(text: string, ms: number): number {
  return Math.max(ms, minReadMs(text));
}

export type SizeMiss = 'tiny' | 'body-small' | 'hud-small' | 'hud-tv-small';

/**
 * The size rule for one run of text, at its RENDERED px (the CSS font size times any CSS zoom on the way up).
 *   tiny          under 12 px: anything a user must read
 *   body-small    a run of body copy (more than 12 words) under 16 px on a phone
 *   hud-small     must-read HUD text under 14 px on a phone
 *   hud-tv-small  must-read HUD text under 24 px on a 1080p TV
 */
export function sizeMiss(px: number, ctx: { words: number; phone: boolean; hud?: 'phone' | 'tv' | null }): SizeMiss | null {
  if (!(px > 0)) return null;
  if (px < READABLE.minPx - 0.05) return 'tiny';
  if (ctx.hud === 'phone' && px < READABLE.hudPhonePx - 0.05) return 'hud-small';
  if (ctx.hud === 'tv' && px < READABLE.hudTvPx - 0.05) return 'hud-tv-small';
  if (!ctx.hud && ctx.phone && ctx.words > READABLE.bodyWords && px < READABLE.bodyPx - 0.05) return 'body-small';
  return null;
}

/** The p-th smallest value (0..1) of a list; NaN for an empty list. */
export function percentile(values: readonly number[], p: number): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
}

/** Source-over: a colour with alpha drawn on an opaque one. */
function over(top: Rgba, bottom: Rgba): Rgba {
  const a = Math.max(0, Math.min(1, top.a));
  return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 };
}

export interface InkSample {
  /** The pixel behind the glyph (the page drawn with the text made transparent: scrims and text shadows stay). */
  bg: Rgba;
  /** The glyph's own pixel, when the text has no solid colour (gradient-clipped text, an SVG fill). */
  ink?: Rgba;
}

/**
 * The contrast a reader actually gets, from the pixels: the text's colour (with its opacity) against each pixel behind
 * a glyph stroke, and the run's figure is the low end of that spread (READABLE.inkPercentile), so one stray bright
 * pixel in a photo does not fail a run but a bright region behind a third of the letters does.
 */
export function pixelContrast(fg: Rgba | null, samples: readonly InkSample[]): number {
  const ratios: number[] = [];
  for (const s of samples) {
    const text = fg && fg.a > 0 ? over(fg, s.bg) : s.ink;
    if (!text) continue;
    ratios.push(contrastRatio(text, s.bg));
  }
  return percentile(ratios, READABLE.inkPercentile);
}

export type ContrastMiss = 'contrast' | 'contrast-large';

/** WCAG 1.4.3 on the measured ratio: 4.5:1, or 3:1 for large text (24 px, or 18.66 px bold). */
export function contrastMiss(ratio: number, px: number, weight: number): ContrastMiss | null {
  if (!Number.isFinite(ratio)) return null;
  if (ratio >= minTextContrast(px, weight)) return null;
  return isLargeText(px, weight) ? 'contrast-large' : 'contrast';
}

/**
 * Key information: what a reader loses something by not seeing whole. Numbers (a score, a price, a time, a count), an
 * error or status message, a heading, and a control's own label.
 */
export function isKeyInfo(text: string, ctx: { tag?: string; role?: string | null; inControl?: boolean } = {}): boolean {
  if (/\d/.test(text)) return true;
  if (ctx.role === 'alert' || ctx.role === 'status') return true;
  if (ctx.tag && /^h[1-6]$/i.test(ctx.tag)) return true;
  if (ctx.inControl) return true;
  return /\b(error|failed|invalid|required|expired|price|free|\$)\b/i.test(text);
}

export interface Rect { left: number; top: number; right: number; bottom: number }

/** How far (CSS px) a text box runs past a clipping box, on its worst side; 0 when it fits. */
export function clipOverrun(text: Rect, clip: Rect): number {
  return Math.max(0, clip.left - text.left, text.right - clip.right, clip.top - text.top, text.bottom - clip.bottom);
}

/** The area two rectangles share. */
export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Text on text: two runs whose boxes share more than a quarter of the smaller one, at least 3 px each way. Two copies
 * of the same words stacked on purpose (a glow or a glitch layer) do not count.
 */
export function textCollides(a: { rect: Rect; text: string }, b: { rect: Rect; text: string }): boolean {
  if (a.text.trim() === b.text.trim()) return false;
  const w = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
  const h = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
  if (w < 3 || h < 3) return false;
  const area = (r: Rect) => Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);
  const smaller = Math.min(area(a.rect), area(b.rect));
  return smaller > 0 && (w * h) / smaller > 0.25;
}
