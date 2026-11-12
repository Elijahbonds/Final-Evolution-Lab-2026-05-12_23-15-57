// PAD-ONLY, /play → a mode (A11-02), and the couch view's text sizes (A11-05), on the rig.
//
// The real Play tab (scripts/a11y/entry.tsx, the page module with the server stubbed) on a 1920 × 1080 "TV". A virtual
// standard-mapping gamepad stands in for navigator.getGamepads; the script only ever changes that pad's buttons — no
// mouse, no touch, no key press. It walks the shelf with the d-pad, opens a closed family with A, picks a mode with A, and
// records where focus went at every press. The page's click on the mode's link is caught (a file:// page cannot route),
// and its href is the proof.
//
// The couch view: before the first pad press the page is the laptop layout; the pad turns the couch view on (auto), and
// every visible text run on the page is measured as drawn (font size × the zoom it sits under).
//
//   CHROMIUM_EXE=… npx tsx scripts/a11y/pad-run.mts <outDir>
// Exit 0 = a mode was reached with the pad alone and the couch view's text holds the floor.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from '../probes/_chromium.mts';
import { buildRig } from './rig.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(process.argv[2] ?? join(ROOT, '.a11y-pad'));
mkdirSync(OUT, { recursive: true });
const { html } = await buildRig(join(OUT, '.build'));

/** The 10-foot floor the TV HUD holds (components/games/tv-hud/tokens.ts TV_MIN_READ_PX). */
const FLOOR = 24;

const PAD = `(() => {
  const pad = { id: 'Rig Pad (STANDARD GAMEPAD Vendor: 0000 Product: 0000)', index: 0, mapping: 'standard', connected: true, timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0] };
  window.__pad = pad;
  navigator.getGamepads = () => [pad, null, null, null];
  window.__NAV = null;
  document.addEventListener('click', (e) => { const a = e.target && e.target.closest && e.target.closest('a[href]'); if (a) { e.preventDefault(); window.__NAV = a.getAttribute('href'); } }, true);
})();`;

const BTN = { a: 0, b: 1, up: 12, down: 13, left: 14, right: 15 } as const;
async function press(page: Page, b: keyof typeof BTN) {
  await page.evaluate(`(() => { const x = window.__pad.buttons[${BTN[b]}]; x.pressed = true; x.value = 1; window.__pad.timestamp++; })()`);
  await page.waitForTimeout(90);
  await page.evaluate(`(() => { const x = window.__pad.buttons[${BTN[b]}]; x.pressed = false; x.value = 0; window.__pad.timestamp++; })()`);
  await page.waitForTimeout(140);
}
const focused = (page: Page) => page.evaluate(`(() => { const a = document.activeElement; if (!a || a === document.body) return null;
  return { tag: a.tagName.toLowerCase(), text: (a.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 50), href: a.getAttribute('href'), expanded: a.getAttribute('aria-expanded') }; })()`) as Promise<{ tag: string; text: string; href: string | null; expanded: string | null } | null>;

const MEASURE = `(() => {
  const zoomOf = (el) => { let z = 1; for (let p = el; p; p = p.parentElement) z *= parseFloat(getComputedStyle(p).zoom || '1') || 1; return z; };
  const runs = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const el = n.parentElement; if (!el || seen.has(el) || !n.textContent.trim()) continue; seen.add(el);
    if (el.closest('[aria-hidden="true"], [inert]')) continue;
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    if (r.width < 1 || r.height < 1 || s.visibility === 'hidden') continue;
    if (!el.closest('main, header')) continue;
    runs.push({ text: n.textContent.trim().slice(0, 40), px: Math.round(parseFloat(s.fontSize) * zoomOf(el) * 10) / 10 });
  }
  runs.sort((a, b) => a.px - b.px);
  return { couch: document.documentElement.hasAttribute('data-fel-couch'), zoom: getComputedStyle(document.documentElement).getPropertyValue('--fel-couch-zoom'),
    scrollWidth: document.documentElement.scrollWidth, min: runs[0] || null, under: runs.filter((r) => r.px < ${FLOOR}), count: runs.length };
})()`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await page.addInitScript(PAD);
await page.goto(`file://${html}#play`);
await page.waitForFunction('document.body.dataset.a11yReady', null, { timeout: 30000 });

const report: Record<string, unknown> = {};
const fails: string[] = [];
const steps: unknown[] = [];

const laptop = await page.evaluate(MEASURE) as { couch: boolean; min: { px: number } | null; under: unknown[] };
await page.screenshot({ path: join(OUT, 'tv-1080-before-pad.png') });
report.beforePad = { couch: laptop.couch, minPx: laptop.min?.px, under24: laptop.under.length };
if (laptop.couch) fails.push('couch view was on before any pad press (auto must wait for a pad)');

// 1. the first press lands on the first control in the page's column
await press(page, 'down');
steps.push({ press: 'down', focus: await focused(page) });
await page.screenshot({ path: join(OUT, 'pad-1-first-focus.png') });

// 2. d-pad down until the COMBAT family (closed) has focus
let guard = 0;
while (!/^combat/i.test((await focused(page))?.text ?? '') && guard++ < 25) {
  await press(page, 'down');
  steps.push({ press: 'down', focus: await focused(page) });
}
const onCombat = await focused(page);
if (!/^combat/i.test(onCombat?.text ?? '')) fails.push(`never reached the COMBAT family (at ${JSON.stringify(onCombat)})`);
await page.screenshot({ path: join(OUT, 'pad-2-combat-focused.png') });

// 3. A opens it in place
await press(page, 'a');
const opened = await focused(page);
steps.push({ press: 'a', focus: opened });
if (opened?.expanded !== 'true') fails.push('A did not open the family');
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, 'pad-3-combat-open.png') });

// 4. down into its first mode, A picks it
await press(page, 'down');
const mode = await focused(page);
steps.push({ press: 'down', focus: mode });
await page.screenshot({ path: join(OUT, 'pad-4-mode-focused.png') });
await press(page, 'a');
const nav = await page.evaluate('window.__NAV') as string | null;
steps.push({ press: 'a', navigatedTo: nav });
if (!nav || !/^\/play\/[a-z-]+$/.test(nav)) fails.push(`A on a mode did not open it (navigated to ${nav})`);
report.reached = nav;
report.presses = steps.length;
report.steps = steps;

// the couch view, on now that a pad is driving
const couch = await page.evaluate(MEASURE) as { couch: boolean; zoom: string; scrollWidth: number; min: { text: string; px: number } | null; under: { text: string; px: number }[]; count: number };
await page.evaluate('window.scrollTo(0, 0)');
await page.screenshot({ path: join(OUT, 'tv-1080-couch.png') });
await page.screenshot({ path: join(OUT, 'tv-1080-couch-full.png'), fullPage: true });
report.couch = couch;
if (!couch.couch) fails.push('the couch view did not turn on with a pad on a 1080p screen');
if (couch.scrollWidth > 1920) fails.push(`the couch view scrolls sideways (${couch.scrollWidth})`);
if (couch.under.length) fails.push(`${couch.under.length} text runs under ${FLOOR} px in the couch view (min ${JSON.stringify(couch.min)})`);
report.errors = errors;
report.fails = fails;
await browser.close();
writeFileSync(join(OUT, 'pad-run.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ reached: nav, presses: steps.length, couch: couch.couch, zoom: couch.zoom, minPx: couch.min, under24: couch.under.length, errors: errors.length }, null, 0));
if (fails.length) { console.error('FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS: a mode reached from /play with the pad alone');
