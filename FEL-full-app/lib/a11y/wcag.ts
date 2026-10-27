// WCAG 2.2 AA — the arithmetic the accessibility audit runs on (A11-01, lane/a11y-design, 2026-10-25).
//
// The audit (scripts/a11y/audit.mts) is a Playwright rig script, not a package: the owner's rule is no new dependency,
// so there is no axe here. What axe would have computed, this file computes, and every rule is a pure function so it is
// tested without a browser. The page side (scripts/a11y/inpage.ts) only collects what the browser knows — the computed
// colours, the rectangles, the names — and hands them to these.
//
// Sources, all public: WCAG 2.2 (w3.org/TR/WCAG22) — 1.4.3 Contrast (Minimum), 1.4.11 Non-text Contrast, 2.4.3 Focus
// Order, 2.4.7 Focus Visible, 2.4.11 Focus Not Obscured (Minimum), 2.5.8 Target Size (Minimum), 4.1.2 Name, Role, Value;
// the relative-luminance and contrast-ratio definitions in its glossary; and the "large scale" text definition (at
// least 18 point, or 14 point bold — 24 CSS px and 18.66 CSS px).

export interface Rgba { r: number; g: number; b: number; a: number }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * A computed CSS colour → RGBA (0..255, alpha 0..1). Understands what Chromium's getComputedStyle returns — `rgb()`,
 * `rgba()`, `color(srgb r g b / a)` (what color-mix() and relative colours compute to) — plus hex and `transparent`.
 * null for anything else (a keyword the page never computes, an oklch the browser did not resolve).
 */
export function parseColor(input: string | null | undefined): Rgba | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([0-9a-f]{3,8})$/.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? Math.round((n(6) / 255) * 1000) / 1000 : 1 };
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (rgb) {
    const alpha = rgb[4] == null ? 1 : rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4]);
    return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: clamp(alpha, 0, 1) };
  }
  const srgb = /^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (srgb) {
    const alpha = srgb[4] == null ? 1 : srgb[4].endsWith('%') ? parseFloat(srgb[4]) / 100 : parseFloat(srgb[4]);
    return { r: clamp(+srgb[1], 0, 1) * 255, g: clamp(+srgb[2], 0, 1) * 255, b: clamp(+srgb[3], 0, 1) * 255, a: clamp(alpha, 0, 1) };
  }
  return null;
}

/** `top` painted over an opaque `bottom` (source-over). The result is opaque. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const a = clamp(top.a, 0, 1);
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  };
}

/** WCAG relative luminance of an sRGB colour (alpha ignored: composite first). */
export function luminance(c: Rgba): number {
  const ch = (v: number) => {
    const s = clamp(v, 0, 255) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

/** WCAG contrast ratio, 1..21, of two opaque colours. */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = luminance(a), lb = luminance(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** "Large scale" text: at least 24 CSS px, or at least 18.66 CSS px (14 pt) and bold (700+). */
export function isLargeText(px: number, weight: number): boolean {
  return px >= 24 || (px >= 18.66 && weight >= 700);
}

/** The 1.4.3 floor for a run of text. */
export function minTextContrast(px: number, weight: number): number {
  return isLargeText(px, weight) ? 3 : 4.5;
}

export type Severity = 'critical' | 'serious' | 'moderate';

/**
 * How bad a text-contrast miss is. Below the AA floor is a miss; the audit calls it CRITICAL when the text is under
 * 3:1 at body size — the point where the WCAG 1.4.3 rationale (low vision without assistive technology) says the text
 * is not readable at all, not merely hard — and SERIOUS between 3:1 and 4.5:1, or for large text under 3:1.
 */
export function contrastSeverity(ratio: number, px: number, weight: number): Severity | null {
  const floor = minTextContrast(px, weight);
  if (ratio >= floor) return null;
  return !isLargeText(px, weight) && ratio < 3 ? 'critical' : 'serious';
}

// ── 2.5.8 Target Size (Minimum) ──────────────────────────────────────────────────────────────────────────────────────

export interface Box { left: number; top: number; width: number; height: number }

/** The 2.5.8 minimum: 24 by 24 CSS px. */
export const TARGET_MIN_PX = 24;

const centre = (b: Box) => ({ x: b.left + b.width / 2, y: b.top + b.height / 2 });

/** Distance from a point to a box (0 inside it). */
export function pointToBox(p: { x: number; y: number }, b: Box): number {
  const dx = Math.max(b.left - p.x, 0, p.x - (b.left + b.width));
  const dy = Math.max(b.top - p.y, 0, p.y - (b.top + b.height));
  return Math.hypot(dx, dy);
}

export const isUndersized = (b: Box): boolean => b.width < TARGET_MIN_PX || b.height < TARGET_MIN_PX;

/**
 * 2.5.8 for the target at `i`: at least 24 × 24, or — the spacing exception — a 24 px circle centred on it intersects
 * no other target and no other undersized target's circle. (The inline-in-a-sentence and essential exceptions are the
 * caller's: it does not pass those targets.)
 */
export function targetSizeOk(targets: readonly Box[], i: number): boolean {
  const t = targets[i];
  if (!t || !isUndersized(t)) return true;
  const c = centre(t);
  const R = TARGET_MIN_PX / 2;
  for (let j = 0; j < targets.length; j++) {
    if (j === i) continue;
    const o = targets[j];
    if (!o.width || !o.height) continue;
    if (pointToBox(c, o) < R) return false;
    if (isUndersized(o)) {
      const oc = centre(o);
      if (Math.hypot(c.x - oc.x, c.y - oc.y) < TARGET_MIN_PX) return false;
    }
  }
  return true;
}

// ── 2.4.3 Focus Order ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Tab steps that jump BACKWARDS against the reading order: the next stop starts above the previous one's top by more
 * than `slack` px while not sitting to its right (a new column). A page that tabs down, then back up to the header, then
 * down again reads in an order a sighted keyboard user cannot follow. Fixed chrome (the bottom tab bar, the top rail)
 * is the caller's to leave out: it is outside the reading order by design.
 */
export function backwardFocusJumps(boxes: readonly Box[], slack = 40): number[] {
  const out: number[] = [];
  for (let i = 1; i < boxes.length; i++) {
    const a = boxes[i - 1], b = boxes[i];
    const above = b.top + b.height < a.top - slack;
    const newColumn = b.left >= a.left + a.width - 1;
    if (above && !newColumn) out.push(i);
  }
  return out;
}

// ── The report ───────────────────────────────────────────────────────────────────────────────────────────────────────

export type RuleId =
  | 'name'            // 4.1.2: an interactive element with no accessible name
  | 'image-alt'       // 1.1.1: an image with no text alternative
  | 'label'           // 1.3.1 / 3.3.2 / 4.1.2: a form field with no label (a placeholder alone counts as none)
  | 'hidden-focus'    // 4.1.2: a focusable element inside aria-hidden
  | 'contrast'        // 1.4.3
  | 'focus-visible'   // 2.4.7: focus moves to an element and nothing on screen changes
  | 'focus-obscured'  // 2.4.11: the focused element is entirely covered by something else (fixed chrome)
  | 'focus-order'     // 2.4.3: a backwards jump in the tab order
  | 'tabindex'        // 2.4.3: a positive tabindex
  | 'target-size'     // 2.5.8
  | 'landmark';       // 1.3.1 / 2.4.1: no <main>, or no <h1>

/** Each rule's severity when it fires (contrast varies by how far below the floor it is: contrastSeverity). */
export const RULE_SEVERITY: Record<Exclude<RuleId, 'contrast'>, Severity> = {
  name: 'critical',
  'image-alt': 'critical',
  label: 'critical',
  'hidden-focus': 'critical',
  'focus-visible': 'critical',
  'focus-obscured': 'serious',
  'focus-order': 'moderate',
  tabindex: 'serious',
  'target-size': 'serious',
  landmark: 'moderate',
};

export interface Violation {
  rule: RuleId;
  severity: Severity;
  /** A short, stable description of the element (tag, name or text, a data- hook) so before/after runs line up. */
  target: string;
  detail?: string;
}

/** Counts by severity and by rule — the numbers the report prints before and after. */
export function tally(vs: readonly Violation[]): { total: number; critical: number; serious: number; moderate: number; byRule: Partial<Record<RuleId, number>> } {
  const byRule: Partial<Record<RuleId, number>> = {};
  let critical = 0, serious = 0, moderate = 0;
  for (const v of vs) {
    byRule[v.rule] = (byRule[v.rule] ?? 0) + 1;
    if (v.severity === 'critical') critical++;
    else if (v.severity === 'serious') serious++;
    else moderate++;
  }
  return { total: vs.length, critical, serious, moderate, byRule };
}

/** One violation per rule and target: the same miss seen at two widths, or twice in one tab pass, counts once. */
export function dedupe(vs: readonly Violation[]): Violation[] {
  const seen = new Map<string, Violation>();
  for (const v of vs) {
    const k = `${v.rule}|${v.target}`;
    const had = seen.get(k);
    if (!had || (had.severity !== 'critical' && v.severity === 'critical')) seen.set(k, v);
  }
  return [...seen.values()];
}
