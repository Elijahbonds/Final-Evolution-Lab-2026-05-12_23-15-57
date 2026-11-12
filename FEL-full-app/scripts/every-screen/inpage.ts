// EVERY-SCREEN phase 1: the page side of the scorer (scripts/every-screen/score.mts). Bundled with esbuild and run in the
// real page; exposed as `window.__es`. It only COLLECTS what the browser knows. The pass / fail rules are in
// lib/every-screen/judge.ts, which is unit tested.

const INTERACTIVE = 'a[href],button,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="switch"],[role="checkbox"],[role="radio"],input:not([type="hidden"]),select,textarea,summary';

function shown(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  for (let e: Element | null = el; e && e !== document.documentElement; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
  }
  return true;
}
const words = (t: string) => t.split(/\s+/).filter((x) => /[A-Za-z0-9]/.test(x)).length;
const labelOf = (el: Element) => ((el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.getAttribute('title') || (el as HTMLInputElement).value || '').replace(/\s+/g, ' ').trim()).slice(0, 60);
/** the app's own chrome: the tab bar, the status rail, a header/footer nav. Counted apart from the screen's own content. */
const inChrome = (el: Element) => {
  if (el.closest('nav,[role="navigation"],[data-tabbar-strip],[data-fel-chrome]')) return true;
  // the status rail is a <header> outside <main>; a <header> inside the page's own <main> is the screen's
  const bar = el.closest('header,footer');
  return !!bar && !bar.closest('main');
};

function rgba(c: string): [number, number, number, number] {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return [0, 0, 0, 0];
  const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  return [p[0] || 0, p[1] || 0, p[2] || 0, p.length > 3 ? p[3] : 1];
}
const lum = (r: number, g: number, b: number) => {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

/** tag.class.class of an element and of the nearest ancestor that carries a data- attribute: enough to find it in the source */
function selOf(el: Element): string {
  const one = (e: Element) => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 4).join('.') : '');
  let host: Element | null = el;
  while (host && host !== document.body && !Array.from(host.attributes).some((a) => a.name.startsWith('data-') && !a.name.startsWith('data-es') && a.name !== 'data-state')) host = host.parentElement;
  const tag = host && host !== document.body ? ' in [' + Array.from(host.attributes).filter((a) => a.name.startsWith('data-')).map((a) => a.name).slice(0, 2).join(' ') + ']' : '';
  return (one(el) + tag).slice(0, 140);
}

/** A filled, bright button: what the eye reads as "the thing to press". A gradient counts; a dark panel does not. */
function primaryLook(el: Element): boolean {
  const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
  if (r.height < 36 || r.width < 64) return false;
  if (r.width > 360 && r.height > 90) return false;                       // a card that is a link
  if (el.matches('[role="tab"],[aria-pressed],[aria-selected],[aria-current],[role="switch"],[role="checkbox"],[role="radio"],input,select,textarea')) return false;
  if (cs.backgroundImage.includes('gradient')) {
    // a gradient of near-black stops is a panel, not a call to action
    const stops = [...cs.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((m) => rgba(m[0]));
    return stops.some((s) => s[3] >= 0.6 && lum(s[0], s[1], s[2]) > 0.18);
  }
  const [R, G, B, A] = rgba(cs.backgroundColor);
  return A >= 0.6 && lum(R, G, B) > 0.18;
}

/** The effective tap size: the element's box, or wider when a pseudo-element or padding catches the finger around it. */
function tapSize(el: Element): { w: number; h: number } {
  const r = el.getBoundingClientRect();
  let w = r.width, h = r.height;
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const hits = (x: number, y: number) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t) || t.contains(el) && t.closest(INTERACTIVE) === el); };
  if (cy >= 0 && cy <= innerHeight && cx >= 0 && cx <= innerWidth) {
    if (w < 44 && hits(cx - 21.5, cy) && hits(cx + 21.5, cy)) w = 44;
    if (h < 44 && hits(cx, cy - 21.5) && hits(cx, cy + 21.5)) h = 44;
  }
  return { w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10 };
}

const UNFINISHED: [string, RegExp][] = [
  ['coming soon', /\bcoming soon\b/i],
  ['opens soon', /\bopens? soon\b/i],
  ['not available yet', /\b(not available yet|under construction|work in progress|check back (soon|later))\b/i],
  ['placeholder text', /\[OWNER:|\blorem ipsum\b|\bTODO\b|\bTBD\b|\bplaceholder\b|\{\{[^}]*\}\}/],
  ['raw value shown', /\bundefined\b|\bNaN\b|\[object Object\]/],
];
const EMPTY = /\b(no|nothing|none)\b[^.!?\n]{0,60}\b(yet|here|found|to show)\b|\byou (have|haven't|don't have) (no|any)\b|\bis empty\b|\bnot .{0,24} yet\b/i;
// a measured number: a figure with a unit a camera or a test produced (not a price, a count of weeks, or a set × rep)
const MEASURED = /(?:^|[^\w$])(\d+(?:\.\d+)?)\s?(cm|inches|inch|in\b|"|mph|m\/s|km\/h|°|bpm|ms\b|kg\b|lbs?\b|watts?\b|W\b|s\b(?! ago))/;
const METHOD = /\b(estimate[ds]?|estimated|measured (from|by|with|on)|from (your|the) (camera|video|phone|jump|run|test)|how (we|this is|it is|it's) measured|±|plus or minus|give or take|accurate to|confidence|sure\b|not a (medical|clinical)|based on)\b/i;

export interface Measure {
  title: string; h1: string | null; url: string;
  wordsFold: number; wordsAll: number;
  /** EVERY-SCREEN P6 (owner, 2026-11-11): of wordsFold, the words inside an owner-approved notice ([data-notice], only ever
   *  set by lib/every-screen/notices.ts notice()): medical, privacy and consent wording, kept word for word, not counted */
  noticeFold: number;
  primaryFold: string[]; actionsFold: number; actionsAll: number; actionsMain: number;
  smallTargets: { label: string; w: number; h: number; chrome: boolean; sel?: string }[]; targets: number;
  unfinished: { mark: string; text: string }[];
  emptyNoNext: string[]; spinnersNoWords: number; blank: boolean;
  textSizes: string[]; buttonLooks: number; buttonLookList: string[];
  links: { href: string; label: string; chrome: boolean }[]; nowhere: string[];
  numbers: { text: string; px: number }[]; methodLine: boolean;
  fcp: number | null; cls: number; shifts: string[]; longTasks: number; jsKb: number;
  notFound: boolean; errorScreen: boolean;
}

export function measure(): Measure {
  const vh = innerHeight;
  let wordsFold = 0, wordsAll = 0, noticeFold = 0; const sizes = new Set<string>();
  const texts: { t: string; el: Element; px: number; top: number }[] = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const t = (n.textContent || '').trim(); const el = n.parentElement;
    if (!t || !el || el.closest('script,style,noscript,[data-es-ignore]') || !shown(el)) continue;
    const rg = document.createRange(); rg.selectNodeContents(n); const r = rg.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); const c = words(t);
    if (cs.position === 'absolute' && r.width <= 1 && r.height <= 1) continue;            // sr-only
    wordsAll += c; if (c) sizes.add(cs.fontSize);
    // EVERY-SCREEN P6: "before scrolling" either way: a carousel's cards past the right edge are not on the first screen
    // (the rig counted /login's venue strip, five cards wide, as 166 words on a 390 px phone)
    if (r.top < vh && r.bottom > 0 && r.left < innerWidth && r.right > 0) { wordsFold += c; if (el.closest('[data-notice]')) noticeFold += c; }
    texts.push({ t, el, px: parseFloat(cs.fontSize), top: r.top });
  }

  const primaryFold: string[] = []; let actionsFold = 0, actionsAll = 0, actionsMain = 0, targets = 0;
  const smallTargets: Measure['smallTargets'] = []; const looks = new Map<string, string>();
  const links: Measure['links'] = []; const nowhere: string[] = [];
  for (const el of Array.from(document.querySelectorAll(INTERACTIVE))) {
    if (!shown(el) || el.closest('[data-es-ignore]')) continue;
    if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') continue;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); const chrome = inChrome(el);
    const field = el.matches('input,select,textarea');
    actionsAll++; if (!chrome) actionsMain++;
    const fold = r.top < vh && r.bottom > 0;
    if (fold) actionsFold++;
    if (fold && !chrome && !field && primaryLook(el)) { const l = labelOf(el) || '(no label)'; if (!primaryFold.includes(l)) primaryFold.push(l); }
    // tap targets: a link inside a sentence is exempt (WCAG 2.5.8's inline exception); everything else is a target
    const inline = el.tagName === 'A' && cs.display.startsWith('inline') && !!el.parentElement && words((el.parentElement as HTMLElement).innerText || '') > words((el as HTMLElement).innerText || '') + 2;
    const hiddenInput = field && (r.width < 2 || r.height < 2);
    if (!inline && !hiddenInput) {
      targets++;
      const s = tapSize(el);
      if (s.w < 43.5 || s.h < 43.5) smallTargets.push({ label: labelOf(el) || el.tagName.toLowerCase(), w: s.w, h: s.h, chrome, sel: selOf(el) });
    }
    // button looks: shape, size, weight, case, fill kind (not hue), the premium-ui signature
    const bw = parseFloat(cs.borderTopWidth); const [, , , a] = rgba(cs.backgroundColor);
    const fill = cs.backgroundImage !== 'none' ? 'grad' : a >= 0.6 ? 'solid' : a > 0 ? 'tint' : 'none';
    if (!field && !(fill === 'none' && !bw) && !(r.width > 360 && r.height > 90) && !chrome) {
      const sig = [Math.min(parseFloat(cs.borderTopLeftRadius), 999), cs.fontSize, cs.fontWeight, cs.textTransform, fill, bw ? 'b' : '-', Math.round(r.height / 4) * 4].join('|');
      if (!looks.has(sig)) looks.set(sig, labelOf(el));
    }
    if (el.tagName === 'A') {
      const raw = el.getAttribute('href') || '';
      if (!raw || raw === '#' || /^javascript:/i.test(raw)) nowhere.push(labelOf(el) || raw || '(empty link)');
      else links.push({ href: (el as HTMLAnchorElement).href, label: labelOf(el), chrome });
    }
  }

  const unfinished: Measure['unfinished'] = [];
  const emptyNoNext: string[] = [];
  const numbers: Measure['numbers'] = [];
  for (const { t, el, px } of texts) {
    for (const [mark, re] of UNFINISHED) if (re.test(t) && !unfinished.some((u) => u.mark === mark)) unfinished.push({ mark, text: t.slice(0, 80) });
    if (words(t) <= 16 && EMPTY.test(t)) {
      // an empty state (a short line, not a paragraph that happens to say "not yet"): is there a next step in ITS OWN block?
      // The block is the nearest section / card / list item, else the line's parent. A link somewhere else on the page is
      // not this empty state's next step.
      const box: Element | null = el.closest('section,article,li,[role="listitem"],[data-empty],[class*="card"],[class*="fel-surface"]') || el.parentElement;
      const next = !!box && (box.matches('a[href],button') || !!el.closest('a[href],button') || Array.from(box.querySelectorAll('a[href],button')).some((b) => shown(b) && !inChrome(b) && !(b as HTMLButtonElement).disabled));
      if (!next && emptyNoNext.length < 4) emptyNoNext.push(t.slice(0, 80));
    }
    const m = MEASURED.exec(t);
    if (m && px >= 14 && numbers.length < 6 && !/\$|€|£/.test(t)) numbers.push({ text: t.slice(0, 60), px });
  }
  const bodyText = (document.body as HTMLElement).innerText || '';
  let spinnersNoWords = 0;
  for (const el of Array.from(document.querySelectorAll('[class*="animate-spin"],[role="progressbar"],[aria-busy="true"]'))) {
    if (!shown(el)) continue;
    // its words: its own label, a tight wrapper's text (a button, a "Loading…" row), or text on the same line. A paragraph
    // somewhere else in a tall container does not say what the spinner is waiting for.
    const r = el.getBoundingClientRect();
    const by = (el.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => document.getElementById(id)?.innerText || '').join(' ');
    let said = words((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('aria-valuetext') || '') + ' ' + by + ' ' + (el.getAttribute('title') || '') + ' ' + ((el as HTMLElement).innerText || ''));
    const btn = el.closest('button,a[href],[role="button"],[role="status"],[aria-live]');
    if (btn) said += words((btn as HTMLElement).innerText || '') + words(btn.getAttribute('aria-label') || '');
    for (let p = el.parentElement, i = 0; p && i < 2 && !said; p = p.parentElement, i++) {
      const pr = p.getBoundingClientRect();
      if (pr.height <= Math.max(72, r.height * 3)) said += words((p as HTMLElement).innerText || '');
      // …or, in a taller container, a neighbour on the same line. A PROGRESS BAR may also be captioned just above or
      // below it (a bar with "Loading arena…" under it), but only by a status line: words near a spinner are not its
      // caption just for being near (the planted wordless spinner sits above unrelated text, and must still fail).
      else for (const sib of Array.from(p.children)) {
        if (sib === el || sib.contains(el) || !shown(sib)) continue;
        const sr = sib.getBoundingClientRect(); const t = (sib as HTMLElement).innerText || '';
        const sameLine = sr.bottom > r.top && sr.top < r.bottom;
        const caption = el.matches('[role="progressbar"]') && sr.bottom > r.top - 48 && sr.top < r.bottom + 48 && sr.right > r.left && sr.left < r.right
          && /loading|waiting|connecting|starting|preparing|getting|checking|saving|\u2026|\.\.\.|\d+\s?%/i.test(t);
        if (sameLine || caption) said += words(t);
      }
    }
    if (!said) spinnersNoWords++;
  }
  const w = window as unknown as { __esCls?: number; __esShifts?: string[]; __esLong?: number };
  const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
  const jsBytes = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter((e) => /\.js(\?|$)/.test(e.name)).reduce((a, e) => a + (e.encodedBodySize || e.transferSize || 0), 0);
  const h1 = document.querySelector('h1');
  return {
    title: document.title, h1: h1 ? ((h1 as HTMLElement).innerText || '').trim().slice(0, 80) : null, url: location.pathname + location.search,
    wordsFold, wordsAll, noticeFold, primaryFold, actionsFold, actionsAll, actionsMain, smallTargets: smallTargets.slice(0, 40), targets,
    unfinished, emptyNoNext, spinnersNoWords, blank: wordsAll < 3,
    textSizes: [...sizes].sort((a, b) => parseFloat(a) - parseFloat(b)), buttonLooks: looks.size, buttonLookList: [...looks].map(([s, l]) => `${s} (${l})`).slice(0, 12),
    links, nowhere, numbers, methodLine: METHOD.test(bodyText),
    fcp: fcp == null ? null : Math.round(fcp), cls: Math.round((w.__esCls || 0) * 1000) / 1000, shifts: (w.__esShifts || []).slice(0, 6), longTasks: w.__esLong || 0, jsKb: Math.round(jsBytes / 1024),
    notFound: /\b404\b|page (could not|can't|cannot) be found|not found/i.test(document.title + ' ' + (h1 ? (h1 as HTMLElement).innerText : '')) || !!document.querySelector('[data-testid="fel-not-found"]'),
    errorScreen: /something went wrong|application error|unexpected error/i.test(bodyText.slice(0, 600)),
  };
}

/** The screen's main action: the first bright filled button in the content; else the first content button or link. */
export function mainAction(): { label: string; kind: 'primary' | 'first'; tag: string; href: string | null } | null {
  const RISKY = /delete|erase|remove|sign ?out|log ?out|cancel|buy|pay\b|purchase|checkout|subscribe|unlink|leave|block|report/i;
  const els = Array.from(document.querySelectorAll('a[href],button,[role="button"]')).filter((el) => shown(el) && !inChrome(el) && !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true' && !el.closest('[data-es-ignore]'));
  const inView = els.filter((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; });
  const safe = inView.filter((el) => !RISKY.test(labelOf(el)) && !(el.tagName === 'A' && /^(mailto:|tel:|https?:\/\/(?!127\.0\.0\.1|localhost))/i.test(el.getAttribute('href') || '')));
  const pick = safe.find(primaryLook) || safe[0];
  if (!pick) return null;
  for (const e of Array.from(document.querySelectorAll('[data-es-main]'))) e.removeAttribute('data-es-main');
  pick.setAttribute('data-es-main', '1');
  return { label: labelOf(pick), kind: primaryLook(pick) ? 'primary' : 'first', tag: pick.tagName.toLowerCase(), href: pick.tagName === 'A' ? pick.getAttribute('href') : null };
}

/** Watch one tap: the browser's own event timing (input delay + handlers + the next paint), and whether anything changed. */
export function armTap(): void {
  const w = window as unknown as { __esTap: { dur: number; mutations: number; t0: number; url: string; focus: Element | null; reqs: number } };
  w.__esTap = { dur: 0, mutations: 0, t0: performance.now(), url: location.href, focus: document.activeElement, reqs: performance.getEntriesByType('resource').length };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries() as (PerformanceEntry & { interactionId?: number })[]) if (/^(pointerdown|pointerup|click|touchstart|touchend|mousedown|mouseup)$/.test(e.name)) w.__esTap.dur = Math.max(w.__esTap.dur, e.duration); })
      .observe({ type: 'event', durationThreshold: 16, buffered: false } as PerformanceObserverInit);
  } catch { /* no event timing: the tap is timed from outside */ }
  new MutationObserver((m) => { w.__esTap.mutations += m.length; }).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
}
export function readTap(): { dur: number; mutations: number; urlChanged: boolean; focusChanged: boolean; requests: number } {
  const w = window as unknown as { __esTap: { dur: number; mutations: number; t0: number; url: string; focus: Element | null; reqs: number } };
  return { dur: Math.round(w.__esTap.dur), mutations: w.__esTap.mutations, urlChanged: location.href !== w.__esTap.url, focusChanged: document.activeElement !== w.__esTap.focus, requests: performance.getEntriesByType('resource').length - w.__esTap.reqs };
}

declare global { interface Window { __es: { measure: typeof measure; mainAction: typeof mainAction; armTap: typeof armTap; readTap: typeof readTap } } }
window.__es = { measure, mainAction, armTap, readTap };
