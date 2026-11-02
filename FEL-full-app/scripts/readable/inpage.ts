// The page side of the readability rig (lane/readable, 2026-11-02; docs/READABLE.md). Bundled into the rig page and
// exposed as `window.__readable`. It only COLLECTS what the browser knows — every visible run of text, its rendered size,
// colour, the boxes of its glyphs, what clips it and what sits on top of it. The pixels behind each glyph are read by the
// driver (scripts/readable/audit.mts) from two screenshots, and every judgment is lib/readable/rules.ts's.
import { clipOverrun, isKeyInfo, textCollides, wordCount, type Rect } from '@/lib/readable/rules';

export interface Run {
  id: number;
  text: string;
  words: number;
  tag: string;
  /** The rendered px: the computed font size times every CSS zoom on the way up. */
  px: number;
  weight: number;
  /** The computed colour with the opacity of every ancestor folded in; null when the glyphs have no solid colour. */
  fg: { r: number; g: number; b: number; a: number } | null;
  /** The glyphs' boxes, viewport coordinates, one per line. */
  rects: Rect[];
  box: Rect;
  fixed: boolean;
  ariaHidden: boolean;
  disabled: boolean;
  placeholder: boolean;
  key: boolean;
  hud: boolean;
  /** Something behind the run is a picture: an <img>, <video>, <canvas> or a url() background. */
  overMedia: boolean;
  /** How it is cut off, if it is: the clipping box's overrun in px, or an ellipsis / line clamp hiding the rest. */
  clip: null | { how: 'overflow' | 'ellipsis' | 'line-clamp' | 'viewport'; px: number; by: string };
  path: string;
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE', 'TEMPLATE', 'OPTION']);
let nextId = 1;
const ids = new WeakMap<Element, number>();
const idOf = (el: Element) => { let i = ids.get(el); if (!i) { i = nextId++; ids.set(el, i); } return i; };

function parse(c: string): { r: number; g: number; b: number; a: number } | null {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}

function zoomOf(el: Element): number {
  let z = 1;
  for (let p: Element | null = el; p; p = p.parentElement) {
    const v = parseFloat(getComputedStyle(p).getPropertyValue('zoom') || '1');
    if (Number.isFinite(v) && v > 0) z *= v;
  }
  return z;
}

function opacityOf(el: Element): number {
  let o = 1;
  for (let p: Element | null = el; p; p = p.parentElement) o *= Number(getComputedStyle(p).opacity);
  return o;
}

function shown(el: Element): boolean {
  const s = getComputedStyle(el);
  if (s.visibility === 'hidden' || s.display === 'none' || s.getPropertyValue('content-visibility') === 'hidden') return false;
  const r = el.getBoundingClientRect();
  // the sr-only pattern: a 1 px clipped box is for screen readers
  if (s.position === 'absolute' && r.width <= 1 && r.height <= 1) return false;
  if (s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)') return false;
  return opacityOf(el) > 0.02;
}

function inFixed(el: Element): boolean {
  for (let p: Element | null = el; p; p = p.parentElement) {
    const pos = getComputedStyle(p).position;
    if (pos === 'fixed' || pos === 'sticky') return true;
  }
  return false;
}

function pathOf(el: Element): string {
  const parts: string[] = [];
  for (let p: Element | null = el; p && p !== document.body && parts.length < 4; p = p.parentElement) {
    const hook = Array.from(p.attributes).find((a) => a.name.startsWith('data-') && !a.name.startsWith('data-readable') && !a.name.startsWith('data-state'));
    parts.unshift(`${p.tagName.toLowerCase()}${hook ? `[${hook.name}${hook.value && hook.value.length < 20 ? `=${hook.value}` : ''}]` : ''}`);
  }
  return parts.join('>');
}

const rectOf = (r: DOMRect | Rect): Rect => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
const unionOf = (rs: Rect[]): Rect => rs.reduce((u, r) => ({ left: Math.min(u.left, r.left), top: Math.min(u.top, r.top), right: Math.max(u.right, r.right), bottom: Math.max(u.bottom, r.bottom) }));

function textRects(el: Element): Rect[] {
  const out: Rect[] = [];
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType !== Node.TEXT_NODE || !n.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of Array.from(range.getClientRects())) if (r.width > 0.5 && r.height > 0.5) out.push(rectOf(r));
  }
  return out;
}

/** What hides part of the run: an overflow-hidden / clip box it runs past, an ellipsis, a line clamp. */
function clipOf(el: Element, box: Rect): Run['clip'] {
  for (let p: Element | null = el, depth = 0; p && p !== document.documentElement && depth < 12; p = p.parentElement, depth++) {
    const s = getComputedStyle(p);
    if (s.textOverflow === 'ellipsis' && (p as HTMLElement).scrollWidth > (p as HTMLElement).clientWidth + 1) {
      return { how: 'ellipsis', px: (p as HTMLElement).scrollWidth - (p as HTMLElement).clientWidth, by: pathOf(p) };
    }
    const clamp = s.getPropertyValue('-webkit-line-clamp');
    if (clamp && clamp !== 'none' && (p as HTMLElement).scrollHeight > (p as HTMLElement).clientHeight + 2) {
      return { how: 'line-clamp', px: (p as HTMLElement).scrollHeight - (p as HTMLElement).clientHeight, by: pathOf(p) };
    }
    const ox = s.overflowX, oy = s.overflowY;
    const clips = (v: string) => v === 'hidden' || v === 'clip';
    if (clips(ox) || clips(oy)) {
      const r = p.getBoundingClientRect();
      const he = p as HTMLElement;
      // clientWidth / clientLeft are in the element's own (unzoomed) px; the rects are zoomed (a console-view HUD)
      const kx = he.offsetWidth ? r.width / he.offsetWidth : 1, ky = he.offsetHeight ? r.height / he.offsetHeight : 1;
      const inner: Rect = {
        left: clips(ox) ? r.left + he.clientLeft * kx : -1e9, right: clips(ox) ? r.left + (he.clientLeft + he.clientWidth) * kx : 1e9,
        top: clips(oy) ? r.top + he.clientTop * ky : -1e9, bottom: clips(oy) ? r.top + (he.clientTop + he.clientHeight) * ky : 1e9,
      };
      const over = clipOverrun(box, inner);
      if (over > 1.5) return { how: 'overflow', px: Math.round(over * 10) / 10, by: pathOf(p) };
    }
    // a scroll container lets the reader reach the rest: nothing past it is lost
    if (/(auto|scroll)/.test(ox) || /(auto|scroll)/.test(oy)) break;
  }
  const vw = document.documentElement.clientWidth;
  const hScroll = document.documentElement.scrollWidth > vw + 1;
  if (!hScroll && !inFixed(el) && (box.right > vw + 1.5 || box.left < -1.5)) return { how: 'viewport', px: Math.round(Math.max(box.right - vw, -box.left)), by: 'viewport' };
  return null;
}

function mediaBehind(el: Element, box: Rect): boolean {
  const x = (box.left + box.right) / 2, y = (box.top + box.bottom) / 2;
  if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
  for (const e of document.elementsFromPoint(x, y)) {
    if (e === el || el.contains(e)) continue;
    if (/^(IMG|VIDEO|CANVAS|PICTURE)$/.test(e.tagName)) return true;
    if (/url\(/.test(getComputedStyle(e).backgroundImage)) return true;
  }
  for (let p: Element | null = el; p; p = p.parentElement) if (/url\(/.test(getComputedStyle(p).backgroundImage)) return true;
  return false;
}

/** Every visible run of text on the page (each element with text of its own), plus each empty field's placeholder. */
export function collect(): Run[] {
  const out: Run[] = [];
  const seen = new Set<Element>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || seen.has(el) || !n.textContent?.trim()) continue;
    seen.add(el);
    if (SKIP.has(el.tagName) || el.closest('[data-readable-ignore]')) continue;
    if (!shown(el)) continue;
    const rects = textRects(el);
    if (!rects.length) continue;
    const text = Array.from(el.childNodes).filter((c) => c.nodeType === Node.TEXT_NODE).map((c) => c.textContent).join(' ').replace(/\s+/g, ' ').trim();
    const s = getComputedStyle(el);
    const svg = el instanceof SVGElement;
    const clipText = s.backgroundClip === 'text' || s.getPropertyValue('-webkit-background-clip') === 'text';
    const fill = parse(s.getPropertyValue('-webkit-text-fill-color') || s.color);
    let fg = svg || clipText ? null : fill;
    if (fg) fg = { ...fg, a: fg.a * opacityOf(el) };
    if (fg && fg.a <= 0.01) fg = null;
    const box = unionOf(rects);
    const control = el.closest('button, a, input, select, textarea, [role="button"], [role="tab"], label');
    out.push({
      id: idOf(el), text: text.slice(0, 160), words: wordCount(text), tag: el.tagName.toLowerCase(),
      px: Math.round(parseFloat(s.fontSize) * zoomOf(el) * 100) / 100, weight: Number(s.fontWeight) || 400, fg,
      rects, box, fixed: inFixed(el), ariaHidden: !!el.closest('[aria-hidden="true"]'),
      disabled: !!(control && ((control as HTMLButtonElement).disabled || control.getAttribute('aria-disabled') === 'true')) || !!el.closest('fieldset[disabled]'),
      placeholder: false,
      key: isKeyInfo(text, { tag: el.tagName, role: el.closest('[role="alert"],[role="status"]')?.getAttribute('role') ?? null, inControl: !!control }),
      hud: !!el.closest('[data-readable-hud],[data-hud-frame]'),
      overMedia: mediaBehind(el, box), clip: clipOf(el, box), path: pathOf(el),
    });
  }
  // placeholders that are the only text in an empty field
  for (const f of Array.from(document.querySelectorAll('input[placeholder], textarea[placeholder]')) as (HTMLInputElement | HTMLTextAreaElement)[]) {
    if (f.value || !f.placeholder.trim() || !shown(f)) continue;
    const r = f.getBoundingClientRect();
    const ps = getComputedStyle(f, '::placeholder');
    const fs = getComputedStyle(f);
    const fg0 = parse(ps.color);
    const pad = parseFloat(fs.paddingLeft) || 0;
    const px = parseFloat(fs.fontSize) * zoomOf(f);
    const box: Rect = { left: r.left + pad, top: r.top + (r.height - px * 1.2) / 2, right: Math.min(r.right - 4, r.left + pad + f.placeholder.length * px * 0.55), bottom: r.top + (r.height + px * 1.2) / 2 };
    out.push({
      id: idOf(f), text: f.placeholder.slice(0, 160), words: wordCount(f.placeholder), tag: 'placeholder', px: Math.round(px * 100) / 100,
      weight: Number(fs.fontWeight) || 400, fg: fg0 ? { ...fg0, a: fg0.a * opacityOf(f) } : null, rects: [box], box, fixed: inFixed(f),
      ariaHidden: false, disabled: f.disabled, placeholder: true, key: false, hud: !!f.closest('[data-readable-hud]'), overMedia: false, clip: null, path: pathOf(f),
    });
  }
  return out;
}

export interface Cover { id: number; text: string; by: string; side: 'top' | 'bottom' | 'any' }

/** The fixed and sticky boxes that paint over the page (the tab bar, the status rail, a HUD, a toast). */
function fixedLayers(): { el: Element; r: Rect; side: 'top' | 'bottom' | 'any' }[] {
  const out: { el: Element; r: Rect; side: 'top' | 'bottom' | 'any' }[] = [];
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    const s = getComputedStyle(el);
    if (s.position !== 'fixed' && s.position !== 'sticky') continue;
    if (!shown(el) || s.pointerEvents === 'none' && !el.textContent?.trim()) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    // nested fixed layers: the outermost one is the layer
    if (el.parentElement && inFixed(el.parentElement)) continue;
    const side = r.top <= 2 ? 'top' : r.bottom >= innerHeight - 2 ? 'bottom' : 'any';
    out.push({ el, r: rectOf(r), side });
  }
  return out;
}

/**
 * Text the reader cannot get out from under a fixed layer. Called at the top of the page and at the bottom: a run under a
 * top bar at scroll 0, or under a bottom bar at the end of the page, can never be scrolled clear. A page that does not
 * scroll counts any layer.
 */
export function covered(where: 'top' | 'bottom'): Cover[] {
  const layers = fixedLayers();
  const scrolls = document.documentElement.scrollHeight > innerHeight + 2;
  const out: Cover[] = [];
  for (const run of collect()) {
    if (run.fixed) continue;
    for (const L of layers) {
      if (scrolls && L.side !== where && L.side !== 'any') continue;
      for (const r of run.rects) {
        const x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2;
        if (x < L.r.left || x > L.r.right || y < L.r.top || y > L.r.bottom) continue;
        if (y < 0 || y > innerHeight) continue;
        const hit = document.elementFromPoint(x, y);
        if (hit && (L.el === hit || L.el.contains(hit))) { out.push({ id: run.id, text: run.text.slice(0, 60), by: pathOf(L.el), side: L.side }); break; }
      }
    }
  }
  return out;
}

export interface Collision { a: string; b: string }

/** Two different runs drawn on top of each other (in the viewport now). */
export function collisions(): Collision[] {
  const runs = collect().filter((r) => r.box.bottom > 0 && r.box.top < innerHeight);
  const out: Collision[] = [];
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const A = runs[i], B = runs[j];
      let hit = false;
      for (const ra of A.rects) { for (const rb of B.rects) if (textCollides({ rect: ra, text: A.text }, { rect: rb, text: B.text })) { hit = true; break; } if (hit) break; }
      if (hit) out.push({ a: A.text.slice(0, 50), b: B.text.slice(0, 50) });
    }
  }
  return out;
}

/** Page-level reflow: does the page scroll sideways (WCAG 1.4.10)? */
export function hScroll(): number {
  return Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Make every glyph transparent (scrims, panels and text shadows stay), so the next screenshot is what is BEHIND the text. */
export function hideText(on: boolean): void {
  let st = document.getElementById('readable-hide');
  if (!on) { st?.remove(); return; }
  if (!st) { st = document.createElement('style'); st.id = 'readable-hide'; document.head.appendChild(st); }
  st.textContent = `*, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; caret-color: transparent !important; text-decoration-color: transparent !important; }
    ::placeholder { color: transparent !important; } svg text, svg tspan { fill: transparent !important; stroke: transparent !important; }`;
}

declare global { interface Window { __readable: { collect: typeof collect; covered: typeof covered; collisions: typeof collisions; hScroll: typeof hScroll; hideText: typeof hideText } } }
window.__readable = { collect, covered, collisions, hScroll, hideText };
