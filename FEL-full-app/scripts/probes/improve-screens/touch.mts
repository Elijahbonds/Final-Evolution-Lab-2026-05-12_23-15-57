// IMPROVE-SCREENS phase 6 (docs/IMPROVE-10-PHASE-AUDIT.md §2.8, #10, #11): nothing under a thumb button, every tap at
// least 44 px. Read-only. Phone held upright (390 x 844 touch, DPR 3; --screens adds 375x667 and the sideways phone).
//
// Per page and side of the knob `ui.touchTargets44` (1 / 0; the admin rig account, `?playtest=1` and a feel override, as
// fit.mts — FEEL_PANEL_ENABLED=1 in the server's env; /workout is not under /play, so it has no panel and plays the
// shipped value on both sides: its side is the build's):
//   - every tap target under 44 px, by the every-screen scorer's own collector (scripts/every-screen/inpage.ts measure());
//   - /play/venice: the first-visit hint's box against every touch-deck control (overlap in px²), whether the point at the
//     centre of its "Got it" is "Got it" (not covered), and a real tap there: does the hint go;
//   - /play/dunk in live play (the MIX / MC / CC chips), /play/adventure with the first line of dialogue up (SKIP, the
//     choices), /workout (the two tick boxes): the small targets, and any two targets whose boxes overlap;
//   - a JPG of each.
//   FEEL_PANEL_ENABLED=1 /home/user/wt/gate-run.sh 2400 npx tsx scripts/probes/improve-screens/touch.mts <outDir> \
//       [--only=venice,dunk,adventure,workout] [--runs=3] [--sides=1,0] [--screens=upright,small,sideways]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';
import { ORIGIN, ROOT, dbUp, people as makePeople, serve, storageState, type People } from '../../every-screen/rig.mts';

const PAGES: Record<string, string> = { venice: '/play/venice', dunk: '/play/dunk', adventure: '/play/adventure', workout: '/workout', onevone: '/play/onevone' };
const SCREENS: Record<string, { id: string; w: number; h: number }> = {
  upright: { id: 'upright', w: 390, h: 844 }, small: { id: 'small', w: 375, h: 667 }, sideways: { id: 'sideways', w: 844, h: 390 },
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const INIT = (side: number) => `(() => { try { localStorage.setItem('fel.feel.overrides.v1', ${JSON.stringify(JSON.stringify({ 'ui.touchTargets44': side }))}); } catch {} })();`;

/** every interactive box on screen, and the pairs that overlap (two targets under one thumb) */
const BOXES = `(() => {
  const SEL = 'a[href],button,[role="button"],input:not([type="hidden"]),select,textarea,summary,[data-touch-deck] .touch-none';
  const out = [];
  for (const el of document.querySelectorAll(SEL)) {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    out.push({ el, label: ((el.getAttribute('aria-label') || el.innerText || el.tagName).replace(/\\s+/g, ' ').trim()).slice(0, 30), x: r.left, y: r.top, w: r.width, h: r.height, deck: !!el.closest('[data-touch-deck]') });
  }
  const pairs = [];
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
    const a = out[i], b = out[j]; if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ox > 1 && oy > 1 && pairs.length < 12) pairs.push(a.label + ' x ' + b.label + ' ' + Math.round(ox) + 'x' + Math.round(oy));
  }
  return { n: out.length, overlaps: pairs };
})()`;

const VENICE = `(() => {
  const hint = document.querySelector('[data-testid="venice-hint"]'); if (!hint) return null;
  const got = hint.querySelector('button'); const hr = hint.getBoundingClientRect(); const gr = got.getBoundingClientRect();
  const deck = [...document.querySelectorAll('[data-touch-deck] .pointer-events-auto, [data-touch-deck] button, [data-touch-deck] .touch-none')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
  const ov = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const cx = gr.left + gr.width / 2, cy = gr.top + gr.height / 2; const at = document.elementFromPoint(cx, cy);
  return { hint: { top: Math.round(hr.top), bottom: Math.round(hr.bottom), left: Math.round(hr.left), right: Math.round(hr.right) },
    got: { x: Math.round(cx), y: Math.round(cy), w: Math.round(gr.width), h: Math.round(gr.height) },
    deckTop: deck.length ? Math.round(Math.min(...deck.map((r) => r.top))) : null,
    overlapHint: Math.round(deck.reduce((a, r) => a + ov(hr, r), 0)), overlapGot: Math.round(deck.reduce((a, r) => a + ov(gr, r), 0)),
    gotIsOnTop: !!at && (at === got || got.contains(at)), atLabel: at ? (at.getAttribute('aria-label') || at.textContent || at.tagName).trim().slice(0, 24) : null };
})()`;

async function bundleInpage(): Promise<string> {
  return (await build({ entryPoints: [join(ROOT, 'scripts/every-screen/inpage.ts')], bundle: true, format: 'iife', platform: 'browser', write: false, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error' })).outputFiles[0].text;
}

async function startGame(page: Page) {
  const ready = await page.waitForSelector('[data-splash-phase="ready"]', { timeout: 150000 }).then(() => true).catch(() => false);
  if (!ready) return false;
  const b = await page.locator('[data-splash-phase="ready"] button, [data-splash-phase="ready"] [role="button"]').filter({ hasText: /tap to start|^start$/i }).first().boundingBox().catch(() => null);
  if (b) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForFunction(`!document.querySelector('[data-splash-phase]')`, undefined, { timeout: 60000 }).catch(() => {});
  await sleep(3000);
  return true;
}

async function one(browser: Browser, p: People, id: string, sc: { id: string; w: number; h: number }, side: number, inpage: string, out: string, tag: string) {
  const ctx = await browser.newContext({ viewport: { width: sc.w, height: sc.h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, storageState: storageState(p, 'admin') });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.addInitScript(INIT(side));
  await page.goto(ORIGIN + PAGES[id] + (id === 'workout' ? '' : '?playtest=1'), { waitUntil: 'load', timeout: 90000 }).catch((e) => errors.push('goto ' + String(e).slice(0, 100)));
  const res: Record<string, unknown> = { id, screen: sc.id, side, tag };
  if (id === 'venice') {
    res.hintShown = await page.waitForSelector('[data-testid="venice-hint"]', { timeout: 120000 }).then(() => true).catch(() => false);
    await sleep(1500);
    res.venice = await page.evaluate(VENICE).catch((e) => ({ err: String(e).slice(0, 100) }));
  } else if (id === 'dunk' || id === 'onevone') {
    res.live = await startGame(page);
  } else if (id === 'adventure') {
    const pick = await page.waitForSelector('[data-testid="adventure-partner-picker"], [data-testid="adventure-start"]', { timeout: 60000 }).then((h) => h.getAttribute('data-testid')).catch(() => null);
    if (pick === 'adventure-partner-picker') {
      await page.locator('[data-testid^="partner-species-"]').first().tap().catch(() => {});
      await sleep(300);
      await page.locator('[data-testid="adventure-partner-confirm"]').tap().catch(() => {});
    }
    await page.waitForSelector('[data-testid="adventure-start"]:not([disabled])', { timeout: 120000 }).catch(() => {});
    await page.locator('[data-testid="adventure-start"]').tap().catch(() => {});
    res.dialogue = await page.waitForSelector('[data-testid="adventure-dialogue"]', { timeout: 30000 }).then(() => true).catch(() => false);
    await sleep(800);
  } else {
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await sleep(1000);
  }
  await page.evaluate(inpage).catch(() => {});
  const m = await page.evaluate('window.__es.measure()').catch(() => null) as { smallTargets?: { label: string; w: number; h: number }[] } | null;
  res.small = (m?.smallTargets ?? []).map((s) => `${s.label} ${Math.round(s.w)}x${Math.round(s.h)}`);
  res.boxes = await page.evaluate(BOXES).catch(() => null);
  if (id === 'venice' && res.hintShown) {
    // a real thumb on "Got it": does the hint go (or did DASH take the tap)?
    const v = res.venice as { got?: { x: number; y: number } } | null;
    if (v?.got) { await page.touchscreen.tap(v.got.x, v.got.y); await sleep(600); res.gotItDismissed = !(await page.$('[data-testid="venice-hint"]')); }
  }
  await page.screenshot({ path: join(out, `${tag}-${id}-${sc.id}-k${side}.jpg`), type: 'jpeg', quality: 60 }).catch(() => {});
  res.errors = errors;
  await ctx.close();
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2];
  if (!out) { console.error('usage: touch.mts <outDir> [--only=..] [--runs=3] [--sides=1,0] [--screens=upright]'); process.exit(2); }
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
  const ids = (arg('only') ?? 'venice,dunk,adventure,workout').split(',');
  const runs = Number(arg('runs') ?? 3);
  const sides = (arg('sides') ?? '1,0').split(',').map(Number);
  const screens = (arg('screens') ?? 'upright').split(',').map((s) => SCREENS[s]);
  const tag = arg('tag') ?? 'touch';
  mkdirSync(out, { recursive: true });
  dbUp();
  const stop = await serve(join(out, 'server.log'));
  try {
    const p = await makePeople();
    const inpage = await bundleInpage();
    const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const all: unknown[] = [];
    for (let run = 1; run <= runs; run++) for (const sc of screens) for (const id of ids) for (const side of sides) {
      let r: Record<string, unknown>;
      try { r = await one(browser, p, id, sc, side, inpage, out, `${tag}${run}`); } catch (e) { r = { id, side, crash: String(e).slice(0, 200) }; }
      r.run = run; all.push(r);
      const v = r.venice as Record<string, unknown> | null | undefined; const bx = r.boxes as { overlaps?: string[] } | null;
      console.log(`${run} ${sc.id} ${id} k${side}: small ${(r.small as string[] | undefined)?.length ?? '?'} [${((r.small as string[] | undefined) ?? []).join('; ')}] overlaps [${(bx?.overlaps ?? []).join('; ')}]${v ? ` | hint ${JSON.stringify(v.hint)} deckTop ${v.deckTop} overlapHint ${v.overlapHint} overlapGot ${v.overlapGot} gotOnTop ${v.gotIsOnTop} (${v.atLabel}) dismissed ${r.gotItDismissed}` : ''} err ${(r.errors as string[]).length}`);
      writeFileSync(join(out, `${tag}-all.json`), JSON.stringify(all, null, 1));
    }
    await browser.close();
  } finally { stop(); }
}
