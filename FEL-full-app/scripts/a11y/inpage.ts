// The page side of the accessibility audit (A11-01). Bundled into the rig page by scripts/a11y/audit.mts with esbuild and
// exposed as `window.__a11y`. It only COLLECTS what the browser knows — computed colours, rectangles, names, the focus
// state — and judges it with lib/a11y/wcag.ts, whose every rule is unit tested.
import {
  RULE_SEVERITY, backwardFocusJumps, composite, contrastRatio, contrastSeverity, parseColor, targetSizeOk,
  type Box, type Rgba, type Violation,
} from '@/lib/a11y/wcag';

const INTERACTIVE = [
  'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea', 'summary',
  '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="switch"]', '[role="tab"]', '[role="menuitem"]',
  '[role="radio"]', '[role="slider"]', '[role="option"]', '[tabindex]:not([tabindex="-1"])',
].join(',');

const INK: Rgba = { r: 5, g: 5, b: 5, a: 1 };

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  const s = getComputedStyle(el);
  if (s.visibility === 'hidden' || s.display === 'none') return false;
  // the sr-only pattern: a 1 px clipped box is for screen readers, not eyes
  if (s.position === 'absolute' && r.width <= 1 && r.height <= 1) return false;
  for (let p: Element | null = el; p; p = p.parentElement) {
    const ps = getComputedStyle(p);
    if (Number(ps.opacity) === 0) return false;
  }
  return true;
}

const ariaHidden = (el: Element): boolean => !!el.closest('[aria-hidden="true"]');

function textOf(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof Element)) return '';
  if (node.getAttribute('aria-hidden') === 'true') return '';
  if (getComputedStyle(node).display === 'none') return '';
  const label = node.getAttribute('aria-label');
  if (label && label.trim()) return label;
  if (node instanceof HTMLImageElement) return node.alt ?? '';
  if (node.tagName.toLowerCase() === 'svg') return node.querySelector('title')?.textContent ?? '';
  return Array.from(node.childNodes).map(textOf).join(' ');
}

/** A simplified accessible-name computation (accname 1.2 steps 2B–2F, the parts this app's markup uses). */
export function accessibleName(el: Element): { name: string; from: string } {
  const by = el.getAttribute('aria-labelledby');
  if (by) {
    const t = by.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean).map((n) => textOf(n!)).join(' ').trim();
    if (t) return { name: t, from: 'labelledby' };
  }
  const label = el.getAttribute('aria-label')?.trim();
  if (label) return { name: label, from: 'aria-label' };
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    const t = Array.from(el.labels ?? []).map((l) => textOf(l)).join(' ').trim();
    if (t) return { name: t, from: 'label' };
    if (el instanceof HTMLInputElement && ['submit', 'button', 'reset'].includes(el.type) && el.value) return { name: el.value, from: 'value' };
    const title = el.getAttribute('title')?.trim();
    if (title) return { name: title, from: 'title' };
    const ph = el.getAttribute('placeholder')?.trim();
    if (ph) return { name: ph, from: 'placeholder' };
    return { name: '', from: '' };
  }
  const t = textOf(el).replace(/\s+/g, ' ').trim();
  if (t) return { name: t, from: 'content' };
  const title = el.getAttribute('title')?.trim();
  if (title) return { name: title, from: 'title' };
  return { name: '', from: '' };
}

/** A short, stable description: the tag, a data- hook when there is one, the name or the text. */
export function describe(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const hook = Array.from(el.attributes).find((a) => a.name.startsWith('data-') && !a.name.startsWith('data-a11y') && !a.name.startsWith('data-state'));
  const name = accessibleName(el).name || (el.textContent ?? '').trim();
  const href = el.getAttribute('href');
  return `${tag}${hook ? `[${hook.name}${hook.value && hook.value.length < 24 ? `=${hook.value}` : ''}]` : ''}${href ? `(${href})` : ''} "${name.replace(/\s+/g, ' ').slice(0, 48)}"`;
}

/** Background candidates behind an element: every opaque colour the text could sit on (gradient stops each count). */
function backgrounds(el: Element): { colours: Rgba[]; image: boolean } {
  const chain: Element[] = [];
  for (let p: Element | null = el; p; p = p.parentElement) chain.unshift(p);
  let colours: Rgba[] = [INK];
  let image = false;
  for (const p of chain) {
    const s = getComputedStyle(p);
    const bg = parseColor(s.backgroundColor);
    if (bg && bg.a > 0) colours = colours.map((c) => composite(bg, c));
    const img = s.backgroundImage;
    if (img && img !== 'none') {
      if (/url\(/.test(img)) image = true;
      const stops = [...img.matchAll(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g)].map((m) => parseColor(m[0])).filter((c): c is Rgba => !!c);
      if (stops.length) {
        const next: Rgba[] = [];
        for (const c of colours) for (const st of stops) next.push(composite(st, c));
        colours = next.slice(0, 24);
      }
    }
  }
  return { colours, image };
}

function opacityOf(el: Element): number {
  let o = 1;
  for (let p: Element | null = el; p; p = p.parentElement) o *= Number(getComputedStyle(p).opacity) || 0;
  return o;
}

function isDisabled(el: Element): boolean {
  return (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true' || !!el.closest('fieldset[disabled]');
}

function inFixed(el: Element): boolean {
  for (let p: Element | null = el; p; p = p.parentElement) {
    const pos = getComputedStyle(p).position;
    if (pos === 'fixed' || pos === 'sticky') return true;
  }
  return false;
}

function contrastViolations(): Violation[] {
  const out: Violation[] = [];
  const seen = new Set<Element>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent || !n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE'].includes(el.tagName)) continue;
    if (ariaHidden(el) || !visible(el)) continue;
    const control = el.closest('button, a, input, select, textarea, [role="button"]');
    if (control && isDisabled(control)) continue;   // 1.4.3: inactive controls are exempt
    const s = getComputedStyle(el);
    const fg = parseColor(s.color);
    if (!fg) continue;
    const { colours, image } = backgrounds(el);
    if (image) continue;   // text over a photograph is judged by eye, not here
    const alpha = fg.a * opacityOf(el);
    const px = parseFloat(s.fontSize) || 16;
    const weight = Number(s.fontWeight) || 400;
    let worst = Infinity;
    for (const bg of colours) worst = Math.min(worst, contrastRatio(composite({ ...fg, a: alpha }, bg), bg));
    const sev = contrastSeverity(worst, px, weight);
    if (sev) out.push({ rule: 'contrast', severity: sev, target: describe(el), detail: `${worst.toFixed(2)}:1 at ${Math.round(px * 10) / 10}px/${weight}` });
  }
  return out;
}

const INLINE_TAGS = new Set(['A']);

export function staticScan(): { violations: Violation[]; interactive: number; textRuns: number } {
  const out: Violation[] = [];
  const els = Array.from(document.querySelectorAll(INTERACTIVE));
  const shown = els.filter((e) => visible(e));
  for (const el of shown) {
    const hidden = ariaHidden(el);
    const tabbable = (el as HTMLElement).tabIndex >= 0 && !isDisabled(el);
    if (hidden && tabbable) out.push({ rule: 'hidden-focus', severity: RULE_SEVERITY['hidden-focus'], target: describe(el) });
    if (hidden) continue;
    const { name, from } = accessibleName(el);
    const field = el instanceof HTMLInputElement ? !['submit', 'button', 'reset', 'image'].includes(el.type) : el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
    if (field && (!name || from === 'placeholder' || from === 'title')) {
      out.push({ rule: 'label', severity: RULE_SEVERITY.label, target: describe(el), detail: from ? `named by its ${from} only` : 'no label' });
    } else if (!name) {
      out.push({ rule: 'name', severity: RULE_SEVERITY.name, target: describe(el) });
    }
    const ti = el.getAttribute('tabindex');
    if (ti && Number(ti) > 0) out.push({ rule: 'tabindex', severity: RULE_SEVERITY.tabindex, target: describe(el), detail: `tabindex=${ti}` });
  }
  for (const img of Array.from(document.querySelectorAll('img, [role="img"]'))) {
    if (ariaHidden(img) || !visible(img)) continue;
    if (img instanceof HTMLImageElement ? !img.hasAttribute('alt') : !accessibleName(img).name) {
      out.push({ rule: 'image-alt', severity: RULE_SEVERITY['image-alt'], target: describe(img) });
    }
  }
  // 2.5.8: every enabled target on screen; an inline link inside a sentence is exempt
  const targets = shown.filter((e) => !isDisabled(e) && !ariaHidden(e)).filter((e) => {
    if (!INLINE_TAGS.has(e.tagName)) return true;
    const disp = getComputedStyle(e).display;
    if (disp !== 'inline') return true;
    const parentText = (e.parentElement?.textContent ?? '').trim();
    return parentText === (e.textContent ?? '').trim();
  });
  const boxes: Box[] = targets.map((e) => { const r = e.getBoundingClientRect(); return { left: r.left + scrollX, top: r.top + scrollY, width: r.width, height: r.height }; });
  boxes.forEach((b, i) => {
    if (!targetSizeOk(boxes, i)) out.push({ rule: 'target-size', severity: RULE_SEVERITY['target-size'], target: describe(targets[i]), detail: `${Math.round(b.width)}x${Math.round(b.height)}` });
  });
  if (!document.querySelector('main, [role="main"]')) out.push({ rule: 'landmark', severity: RULE_SEVERITY.landmark, target: 'page', detail: 'no <main>' });
  if (!document.querySelector('h1')) out.push({ rule: 'landmark', severity: RULE_SEVERITY.landmark, target: 'page', detail: 'no <h1>' });
  const cv = contrastViolations();
  return { violations: [...out, ...cv], interactive: shown.length, textRuns: cv.length };
}

// ── The tab pass ─────────────────────────────────────────────────────────────────────────────────────────────────────

const STYLE_KEYS = ['outlineStyle', 'outlineWidth', 'outlineColor', 'boxShadow', 'borderTopColor', 'borderBottomColor', 'backgroundColor', 'color', 'textDecorationLine'] as const;
type StyleSnap = Record<(typeof STYLE_KEYS)[number], string>;
const snap = (el: Element): StyleSnap => {
  const s = getComputedStyle(el);
  return Object.fromEntries(STYLE_KEYS.map((k) => [k, s[k]])) as StyleSnap;
};
const resting = new Map<Element, StyleSnap[]>();

/** Before the tab pass: every tabbable element's unfocused look (itself, its parent and its first child). */
export function prepareFocus(): number {
  resting.clear();
  (document.activeElement as HTMLElement | null)?.blur?.();
  for (const el of Array.from(document.querySelectorAll(INTERACTIVE))) {
    resting.set(el, [snap(el), el.parentElement ? snap(el.parentElement) : snap(el), el.firstElementChild ? snap(el.firstElementChild) : snap(el)]);
  }
  return resting.size;
}

export interface FocusStop { target: string; box: Box; fixed: boolean; indicator: boolean; obscured: boolean; body: boolean }

/** After one Tab: where focus is, whether anything about it changed on screen, whether something covers it. */
export function focusStop(): FocusStop {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) {
    return { target: 'body', box: { left: 0, top: 0, width: 0, height: 0 }, fixed: false, indicator: true, obscured: false, body: true };
  }
  const r = el.getBoundingClientRect();
  const before = resting.get(el);
  const nowSnaps = [snap(el), el.parentElement ? snap(el.parentElement) : snap(el), el.firstElementChild ? snap(el.firstElementChild) : snap(el)];
  const indicator = !before || nowSnaps.some((s, i) => STYLE_KEYS.some((k) => {
    if (k === 'outlineWidth' && s.outlineStyle === 'none') return false;
    if (k === 'outlineColor' && s.outlineStyle === 'none') return false;
    return s[k] !== before[i][k];
  }));
  const pts = [[0.5, 0.5], [0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]];
  let seen = false;
  for (const [fx, fy] of pts) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
    const hit = document.elementFromPoint(x, y);
    if (hit && (hit === el || el.contains(hit) || hit.contains(el))) { seen = true; break; }
  }
  return {
    target: describe(el),
    box: { left: r.left + scrollX, top: r.top + scrollY, width: r.width, height: r.height },
    fixed: inFixed(el), indicator, obscured: !seen && !inFixed(el), body: false,
  };
}

/** Judge a whole tab pass. */
export function judgeFocus(stops: readonly FocusStop[]): Violation[] {
  const out: Violation[] = [];
  for (const s of stops) {
    if (s.body) continue;
    if (!s.indicator) out.push({ rule: 'focus-visible', severity: RULE_SEVERITY['focus-visible'], target: s.target });
    if (s.obscured) out.push({ rule: 'focus-obscured', severity: RULE_SEVERITY['focus-obscured'], target: s.target });
  }
  const flow = stops.filter((s) => !s.body && !s.fixed);
  for (const i of backwardFocusJumps(flow.map((s) => s.box))) {
    out.push({ rule: 'focus-order', severity: RULE_SEVERITY['focus-order'], target: flow[i].target, detail: `after ${flow[i - 1].target}` });
  }
  return out;
}

declare global { interface Window { __a11y: { staticScan: typeof staticScan; prepareFocus: typeof prepareFocus; focusStop: typeof focusStop; judgeFocus: typeof judgeFocus } } }
window.__a11y = { staticScan, prepareFocus, focusStop, judgeFocus };
