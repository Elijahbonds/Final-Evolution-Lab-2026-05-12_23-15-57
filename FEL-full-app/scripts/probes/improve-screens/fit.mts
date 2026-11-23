// IMPROVE-SCREENS phase 1 (docs/IMPROVE-10-PHASE-AUDIT.md §2.3): does the game fit the screen? Read-only.
//
// Per mode, screen and side of the knob `ui.stageFitsHeader` (1 / 0, one build: the admin rig account, `?playtest=1` and a
// feel override in localStorage, the panel's own path, so FEEL_PANEL_ENABLED=1 must be in the server's env), it reads:
//   - the header's height and rows, the stage host's and the largest canvas's top / bottom, and how far the bottom runs
//     past the screen (+ = below the screen, the finding);
//   - whether the page scrolls (document height over the screen), the layout shift (CLS) so far, and the attribute's
//     state (the control that the knob really took effect on this load);
//   - with --play: taps TAP TO START, waits for live play, and reads every touch-deck button's box (the move stick on the
//     screen or not) and takes a JPG.
//
//   ES_* (the every-screen rig's port, database, build folder) as in rig.mts. Run inside the gate lock:
//   FEEL_PANEL_ENABLED=1 /home/user/wt/gate-run.sh 2400 npx tsx scripts/probes/improve-screens/fit.mts <outDir> \
//       [--only=onevone,dunk] [--screens=upright,small,sideways,desktop] [--runs=3] [--play] [--sides=1,0] [--try]
// The 3D is drawn by SwiftShader; nothing here reads a frame time, only boxes, so the CPU is not throttled.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';
import { ORIGIN, dbUp, people as makePeople, serve, storageState, type People } from '../../every-screen/rig.mts';

const MODES: Record<string, string> = {
  onevone: '/play/onevone', threevthree: '/play/threevthree', dunk: '/play/dunk', threepoint: '/play/threepoint',
  tennis: '/play/tennis', venice: '/play/venice', try: '/try',
};
interface Screen { id: string; w: number; h: number; touch: boolean; dpr: number }
const SCREENS: Record<string, Screen> = {
  upright: { id: 'upright', w: 390, h: 844, touch: true, dpr: 3 },
  small: { id: 'small', w: 375, h: 667, touch: true, dpr: 2 },
  sideways: { id: 'sideways', w: 844, h: 390, touch: true, dpr: 3 },
  desktop: { id: 'desktop', w: 1440, h: 900, touch: false, dpr: 1 },
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const INIT = (side: number) => `(() => {
  try { localStorage.setItem('fel.feel.overrides.v1', ${JSON.stringify(JSON.stringify({ 'ui.stageFitsHeader': side }))}); } catch {}
  window.__fit = { cls: 0, shifts: [] };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__fit.cls += e.value; if (window.__fit.shifts.length < 12) window.__fit.shifts.push([Math.round(e.startTime), Math.round(e.value * 1000) / 1000]); } }).observe({ type: 'layout-shift', buffered: true }); } catch {}
})();`;

const READ = `(() => {
  const H = innerHeight, W = innerWidth;
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width), left: Math.round(r.left) }; };
  const header = [...document.querySelectorAll('header')].find((h) => h.getBoundingClientRect().height > 0) || null;
  const host = document.querySelector('[class*="100dvh-3.25rem"]') || document.querySelector('[class*="aspect-[16/10]"]');
  let canvas = null; for (const c of document.querySelectorAll('canvas')) { const r = c.getBoundingClientRect(); if (!canvas || r.width * r.height > canvas.w * canvas.h) canvas = { el: c, w: r.width, h: r.height }; }
  const hb = box(header), sb = box(host), cb = box(canvas && canvas.el);
  // header rows: distinct tops of its direct row's children
  let rows = null; if (header) { const row = header.querySelector('div'); if (row) rows = new Set([...row.children].map((c) => Math.round(c.getBoundingClientRect().top / 8))).size; }
  const deck = document.querySelector('[data-touch-deck]');
  const buttons = deck ? [...deck.querySelectorAll('button, [role="button"], .touch-none')].map((b) => box(b)).filter((b) => b && b.w > 0) : [];
  return {
    W, H, fitAttr: !!document.querySelector('[data-fel-fit]'), chromeVar: (document.querySelector('[data-fel-fit]') || document.body).style.getPropertyValue('--fel-chrome-h') || null,
    console: !!document.querySelector('[data-fel-console]'), header: hb, headerRows: rows, host: sb, canvas: cb,
    hostBelow: sb ? sb.bottom - H : null, canvasBelow: cb ? cb.bottom - H : null,
    pageScroll: Math.max(0, document.documentElement.scrollHeight - H),
    deck: deck ? { buttons: buttons.length, lowest: buttons.reduce((a, b) => Math.max(a, b.bottom), 0), offScreen: buttons.filter((b) => b.bottom > H || b.top < 0).length } : null,
    cls: Math.round(window.__fit.cls * 1000) / 1000, shifts: window.__fit.shifts,
  };
})()`;

async function one(browser: Browser, p: People, mode: string, sc: Screen, side: number, play: boolean, out: string, tag: string) {
  const anon = mode === 'try';
  const ctx = await browser.newContext({
    viewport: { width: sc.w, height: sc.h }, deviceScaleFactor: sc.dpr, isMobile: sc.touch, hasTouch: sc.touch,
    storageState: storageState(p, anon ? 'anon' : 'admin'),
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.addInitScript(INIT(side));
  const t0 = Date.now();
  await page.goto(ORIGIN + MODES[mode] + (anon ? '' : '?playtest=1'), { waitUntil: 'load', timeout: 90000 }).catch((e) => errors.push('goto ' + String(e).slice(0, 120)));
  if (anon) {
    // the guest dunk: answer the birth date (an adult), as firstvisit.mts does
    await page.waitForSelector('[data-testid="guest-age-step"] select', { timeout: 30000 }).catch(() => {});
    await page.waitForFunction(`![...document.querySelectorAll('[data-testid="guest-age-step"] button')].some((b) => b.disabled)`, undefined, { timeout: 30000 }).catch(() => {});
    await page.selectOption('select', '1995').catch(() => {});
    await page.fill('input[aria-label="Month"]', '6').catch(() => {});
    await page.fill('input[aria-label="Day"]', '15').catch(() => {});
    await page.locator('button').filter({ hasText: /^\s*continue\s*$/i }).first().click().catch(() => {});
    await sleep(1500);
    await page.locator('a,button').filter({ hasText: /play without saving|just play/i }).first().click({ timeout: 3000 }).catch(() => {});
  }
  await page.waitForSelector('canvas', { timeout: 90000 }).catch(() => {});
  // the knob's own control: side 0 must lose the attribute once the panel opens (portrait); give it time to
  if (side === 0 && sc.h > sc.w) await page.waitForFunction(`!document.querySelector('[data-fel-fit]')`, undefined, { timeout: 20000 }).catch(() => {});
  await sleep(2500);
  const res: Record<string, unknown> = { mode, screen: sc.id, side, tag, rest: await page.evaluate(READ).catch((e) => ({ err: String(e).slice(0, 120) })) };
  await page.screenshot({ path: join(out, `${tag}-${mode}-${sc.id}-k${side}-rest.jpg`), type: 'jpeg', quality: 60 }).catch(() => {});
  if (play) {
    const ready = await page.waitForSelector('[data-splash-phase="ready"]', { timeout: 150000 }).then(() => true).catch(() => false);
    res.readyMs = ready ? Date.now() - t0 : null;
    if (ready) {
      const b = await page.locator('[data-splash-phase="ready"] button, [data-splash-phase="ready"] [role="button"]').filter({ hasText: /tap to start|^start$/i }).first().boundingBox().catch(() => null);
      if (b) { if (sc.touch) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); else await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
      await page.waitForFunction(`!document.querySelector('[data-splash-phase]')`, undefined, { timeout: 60000 }).catch(() => {});
      await sleep(3000);
      res.play = await page.evaluate(READ).catch(() => null);
      await page.screenshot({ path: join(out, `${tag}-${mode}-${sc.id}-k${side}-play.jpg`), type: 'jpeg', quality: 60 }).catch(() => {});
    }
  }
  res.errors = errors;
  await ctx.close();
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2];
  if (!out) { console.error('usage: fit.mts <outDir> [--only=..] [--screens=..] [--runs=3] [--play] [--sides=1,0]'); process.exit(2); }
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
  const modes = (arg('only') ?? 'onevone,threevthree,dunk,threepoint,tennis,venice').split(',');
  const screens = (arg('screens') ?? 'upright,small,sideways,desktop').split(',').map((s) => SCREENS[s]);
  const runs = Number(arg('runs') ?? 3);
  const sides = (arg('sides') ?? '1,0').split(',').map(Number);
  const play = process.argv.includes('--play');
  const tag = arg('tag') ?? 'fit';
  mkdirSync(out, { recursive: true });
  dbUp();
  const stop = await serve(join(out, 'server.log'));
  try {
    const p = await makePeople();
    const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const all: unknown[] = [];
    for (let run = 1; run <= runs; run++) for (const sc of screens) for (const mode of modes) for (const side of sides) {
      let r: Record<string, unknown>;
      try { r = await one(browser, p, mode, sc, side, play, out, `${tag}${run}`); } catch (e) { r = { mode, screen: sc.id, side, crash: String(e).slice(0, 200) }; }
      r.run = run; all.push(r);
      const s = r.rest as Record<string, unknown> | undefined; const pl = r.play as Record<string, unknown> | undefined;
      console.log(`${run} ${sc.id} ${mode} k${side}: fit ${s?.fitAttr} header ${(s?.header as { h?: number } | null)?.h ?? '-'} rows ${s?.headerRows ?? '-'} canvas below ${s?.canvasBelow ?? '-'} host below ${s?.hostBelow ?? '-'} scroll ${s?.pageScroll ?? '-'} cls ${s?.cls ?? '-'}${pl ? ` | play canvas below ${pl.canvasBelow} deck off ${(pl.deck as { offScreen?: number } | null)?.offScreen ?? '-'} lowest ${(pl.deck as { lowest?: number } | null)?.lowest ?? '-'} cls ${pl.cls}` : ''} err ${(r.errors as string[] | undefined)?.length ?? '?'}`);
      writeFileSync(join(out, `${tag}-all.json`), JSON.stringify(all, null, 1));
    }
    await browser.close();
  } finally { stop(); }
}
