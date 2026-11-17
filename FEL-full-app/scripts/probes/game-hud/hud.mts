// game-hud rig driver (lane/game-hud, 2026-11-12). The every-screen pass left twelve game screens failing only because
// of the in-game HUD and the touch controller. This reads each of them, before and after, on the REAL page a player gets
// (./entry.tsx, built by ./build.mjs with esbuild and served by ../gameplay-clean/serve.mjs): no `next build`, no server,
// no database.
//
// Per mode, two page loads:
//   phone    390 × 844, touch, the scorer's iPhone user agent. READY is read EXACTLY as scripts/every-screen/score.mts
//            reads a screen (the same three in-page bundles; the same squeeze; 150 % text; 640 × 400 for 200 % zoom;
//            critical contrast; tap targets, text sizes and button looks from window.__es.measure()). Then TAP TO START,
//            a few seconds of keyboard play, and the in-play HUD is read upright and then sideways (844 × 390).
//   desktop  1280 × 720, mouse. TAP TO START, a few seconds of play, the in-play HUD read.
// Each in-play read records: every HUD text under 12 px, every HUD line (3+ words) under 14 px (lib/readable/rules.ts's
// sizeMiss, as the scorer judges), critical contrast, text cut off (and with 150 % text), how much of the play area
// (the game canvas) the HUD hides, and how much HUD text sits under the shell's capture menu (the ⋯).
//
// COVERAGE, the rule: on a 2 px grid over the canvas, a cell is hidden when something PAINTED is over it: an element with
// a background (colour or image), a border, an <svg>/<img>, or the boxes of a run of text. Transparent boxes (a layout
// row, a 44 px hit area around a small visual) hide nothing. Split by who drew it: the mode's HUD (inside the host),
// the touch deck (TouchOverlay, or the shell's VirtualController), the shell's chrome (⋯, the corner buttons).
//
//   node build.mjs <siteA>; node build.mjs <siteB>
//   node ../gameplay-clean/serve.mjs 3372 127.0.0.1=<siteA> localhost=<siteB> &
//   /home/user/wt/gate-run.sh 900 npx tsx scripts/probes/game-hud/hud.mts <outDir> <tag> <host> <mode,mode,...>
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright-core';
import sharp from 'sharp';
import { chromiumExe } from '../_chromium.mts';
import * as rulesNs from '../../../lib/readable/rules.ts';
import type { Run } from '../../readable/inpage.ts';

const { sizeMiss } = ((rulesNs as { default?: unknown }).default ?? rulesNs) as typeof rulesNs;
const ROOT = new URL('../../..', import.meta.url).pathname;
const [OUT, TAG, HOST, MODES_ARG] = process.argv.slice(2);
if (!OUT || !TAG || !HOST || !MODES_ARG) { console.error('usage: hud.mts <outDir> <tag> <host> <mode,...>'); process.exit(2); }
const PORT = process.env.PORT ?? '3372';
const PLAY_MS = Number(process.env.PLAY_MS ?? 6000);
const BOOT_MS = Number(process.env.BOOT_MS ?? 240000);
const ONLY = process.env.ONLY ?? 'phone,desktop';
mkdirSync(join(OUT, 'shots'), { recursive: true });

async function bundleInpage(): Promise<string> {
  const one = async (entry: string) => (await build({ entryPoints: [join(ROOT, entry)], bundle: true, format: 'iife', platform: 'browser', write: false, tsconfig: join(ROOT, 'tsconfig.json'), logLevel: 'error' })).outputFiles[0].text;
  return [await one('scripts/every-screen/inpage.ts'), await one('scripts/readable/inpage.ts'), await one('scripts/a11y/inpage.ts')].join('\n;\n');
}

// ── the scorer's squeeze, copied from scripts/every-screen/score.mts (the same rule, so a pass here is a pass there) ─────
const squeeze = async (page: Page, phone: boolean, within?: string) => {
  let runs = await page.evaluate('window.__readable.collect()') as Run[];
  if (within) runs = runs.filter((r) => r.path.includes(within) || true);
  const clipped = runs.filter((r) => r.clip && !r.ariaHidden && (r.key || r.clip.how !== 'line-clamp') && r.clip.how !== 'ellipsis' && (r.clip.how !== 'overflow' || r.clip.px > Math.max(3, 0.2 * r.px)))
    .map((r) => `${r.text.slice(0, 44)} [${r.clip!.how} ${r.clip!.px}px by ${String(r.clip!.by).slice(-60)}]`);
  const hs = await page.evaluate('window.__readable.hScroll()') as number;
  let tiny = 0, hudSmall = 0, bodySmall = 0; const samples: { rule: string; text: string; px: number; path: string }[] = [];
  if (phone) for (const r of runs) {
    if (r.ariaHidden || r.disabled) continue;
    const m = sizeMiss(r.px, { words: r.words, phone: true, hud: r.hud ? 'phone' : null });
    if (m === 'tiny') tiny++; else if (m === 'hud-small') hudSmall++; else if (m === 'body-small') bodySmall++;
    if (m && samples.length < 12) samples.push({ rule: m, text: r.text.slice(0, 40), px: r.px, path: r.path.slice(-110) });
  }
  return { clipped: [...new Set(clipped)].slice(0, 8), hs, tiny, hudSmall, bodySmall, samples };
};

// ── in play: the HUD's text over the canvas, its coverage, and the ⋯ ─────────────────────────────────────────────────
const PLAY_READ = `(() => {
  const canv = [...document.querySelectorAll('canvas')].map((c) => [c, c.getBoundingClientRect()]).sort((a, b) => b[1].width * b[1].height - a[1].width * a[1].height)[0];
  if (!canv) return null;
  const [cv, cr0] = canv;
  const cr = { x: Math.max(0, cr0.x), y: Math.max(0, cr0.y), r: Math.min(innerWidth, cr0.right), b: Math.min(innerHeight, cr0.bottom) };
  const host = cv.parentElement;
  const S = 2, gw = Math.ceil((cr.r - cr.x) / S), gh = Math.ceil((cr.b - cr.y) / S);
  const grids = { hud: new Uint8Array(gw * gh), deck: new Uint8Array(gw * gh), chrome: new Uint8Array(gw * gh), other: new Uint8Array(gw * gh) };
  const paint = (g, r) => {
    const x0 = Math.max(0, Math.floor((r.left - cr.x) / S)), x1 = Math.min(gw, Math.ceil((r.right - cr.x) / S));
    const y0 = Math.max(0, Math.floor((r.top - cr.y) / S)), y1 = Math.min(gh, Math.ceil((r.bottom - cr.y) / S));
    for (let y = y0; y < y1; y++) g.fill(1, y * gw + x0, Math.max(y * gw + x0, y * gw + x1));
  };
  const alpha = (c) => { const m = String(c).match(/rgba?\\(([^)]+)\\)/); if (!m) return 0; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return p.length > 3 ? p[3] : 1; };
  const shownCache = new Map();
  const shown = (el) => {
    if (shownCache.has(el)) return shownCache.get(el);
    let ok = true, o = 1;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') { ok = false; break; } o *= Number(cs.opacity); }
    ok = ok && o > 0.05; shownCache.set(el, ok); return ok;
  };
  const isDeckRoot = (e) => e.matches('[data-touch-deck]') || (getComputedStyle(e).position === 'fixed' && !!e.querySelector('[aria-label="Controls help"],[aria-label="Show controller"]'));
  const classOf = (el) => {
    if (el.closest('[data-capture-ui],[data-fel-corner]')) return 'chrome';
    for (let e = el; e && e !== document.body; e = e.parentElement) if (isDeckRoot(e)) return 'deck';
    if (host && host.contains(el)) return 'hud';
    return 'other';
  };
  const dump = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el === cv || el.contains(cv) || el.closest('[data-fel-fullbleed]') || ['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.right < cr.x || r.left > cr.r || r.bottom < cr.y || r.top > cr.b) continue;
    if (!shown(el)) continue;
    const cs = getComputedStyle(el);
    const painted = alpha(cs.backgroundColor) > 0.03 || (cs.backgroundImage && cs.backgroundImage !== 'none')
      || ['top', 'right', 'bottom', 'left'].some((s) => parseFloat(cs['border' + s[0].toUpperCase() + s.slice(1) + 'Width']) > 0 && alpha(cs['border' + s[0].toUpperCase() + s.slice(1) + 'Color']) > 0.03)
      || ['svg', 'img', 'video'].includes(el.tagName.toLowerCase());
    if (painted && !el.closest('svg')) {
      const cls = classOf(el);
      const big = r.width * r.height > 0.5 * (cr.r - cr.x) * (cr.b - cr.y);
      // a layer the size of the play area (a vignette, the juice overlay, a scrim) is recorded but not counted: it tints the
      // picture, it does not hide a part of it (the dump below lets the rule be re-run offline)
      if (!big) paint(grids[cls], r);
      dump.push({ cls, k: cs.backgroundImage && cs.backgroundImage !== 'none' ? 'grad' : alpha(cs.backgroundColor) > 0.03 ? 'bg' : ['svg', 'img', 'video'].includes(el.tagName.toLowerCase()) ? 'media' : 'border', a: Math.round(alpha(cs.backgroundColor) * 100) / 100, big,
        x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), sel: el.tagName.toLowerCase() + (typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 5).join('.') : '') + [...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => '[' + a.name + ']').join('') });
    }
  }
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const texts = [];
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const t = (n.textContent || '').trim(); if (!t) continue;
    const el = n.parentElement; if (!el || el.closest('[data-fel-fullbleed]') || ['SCRIPT', 'STYLE'].includes(el.tagName) || !shown(el)) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    const cls = classOf(el);
    for (const r of rg.getClientRects()) { if (r.width < 1) continue; paint(grids[cls], r); texts.push({ cls, t: t.slice(0, 40), x: Math.round(r.left), y: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }); }
  }
  const textDump = texts.slice(0, 200);
  const count = (g) => { let n = 0; for (let i = 0; i < g.length; i++) n += g[i]; return n; };
  const all = new Uint8Array(gw * gh); for (const g of Object.values(grids)) for (let i = 0; i < g.length; i++) all[i] |= g[i];
  const tot = gw * gh;
  const pct = (n) => Math.round((n / tot) * 10000) / 100;
  // the ⋯: HUD text under it (px² of overlap), measured on the menu's own button
  const cap = document.querySelector('[data-capture-ui] [data-testid="capture-overflow"]');
  let capOver = 0; const capUnder = [];
  if (cap) { const c = cap.getBoundingClientRect();
    for (const t of texts) { if (t.cls !== 'hud') continue; const w = Math.min(c.right, t.r) - Math.max(c.left, t.x), h = Math.min(c.bottom, t.b) - Math.max(c.top, t.y); if (w > 0 && h > 0) { capOver += w * h; capUnder.push(t.t); } } }
  return { canvas: { w: Math.round(cr.r - cr.x), h: Math.round(cr.b - cr.y) }, cover: { hud: pct(count(grids.hud)), deck: pct(count(grids.deck)), chrome: pct(count(grids.chrome)), other: pct(count(grids.other)), all: pct(count(all)) },
    cap: cap ? (() => { const c = cap.getBoundingClientRect(); return { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.width), h: Math.round(c.height) }; })() : null,
    capOverPx2: Math.round(capOver), capUnder: [...new Set(capUnder)].slice(0, 6), canvasRect: cr, dump, textDump };
})()`;

async function readPlay(page: Page, phone: boolean) {
  // the scripted keys (space, arrows) scroll an upright page: read the screen a player holding the phone sees
  await page.evaluate('window.scrollTo(0, 0)').catch(() => {}); await page.waitForTimeout(600);
  const play = await page.evaluate(PLAY_READ).catch((e) => ({ err: String(e).slice(0, 200) }));
  const sq = await squeeze(page, phone).catch((e) => ({ err: String(e).slice(0, 200) }));
  const a11y = await page.evaluate('window.__a11y.staticScan()').catch(() => ({ violations: [] })) as { violations: { rule: string; severity: string; target?: string; detail?: string }[] };
  await page.evaluate(`document.documentElement.style.fontSize = '150%'`); await page.waitForTimeout(400);
  const f150 = await squeeze(page, false).catch(() => null);
  await page.evaluate(`document.documentElement.style.fontSize = ''`); await page.waitForTimeout(300);
  // every HUD text size, for the small-text count in play (the gameplay-clean rule: under 12 px anywhere on the play screen)
  const sizes = await page.evaluate(`window.__readable.collect().filter((r) => !r.ariaHidden).map((r) => ({ t: r.text.slice(0, 30), px: Math.round(r.px * 10) / 10, w: r.words, hud: r.hud }))`).catch(() => []) as { t: string; px: number; w: number; hud: boolean }[];
  return { play, sq, f150: f150 && { clipped: f150.clipped, hs: f150.hs }, contrast: a11y.violations.filter((v) => v.rule === 'contrast').map((v) => `${v.severity} ${v.target} ${v.detail}`).slice(0, 8), under12: sizes.filter((s) => s.px < 11.95).map((s) => `${s.t} @${s.px}`).slice(0, 12), smallest: sizes.length ? Math.min(...sizes.map((s) => s.px)) : null };
}

/** what clips each cut-off text: the text's box and every ancestor that clips, with its box (a diagnosis) */
const CLIP_DIAG = (clipped: string[]) => `((needles) => { const out = []; const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = tw.nextNode(); n; n = tw.nextNode()) { const t = (n.textContent || '').trim(); if (!t || !needles.some((x) => x.startsWith(t.slice(0, 12)) || t.startsWith(x.slice(0, 12)))) continue;
          const el = n.parentElement; const rg = document.createRange(); rg.selectNodeContents(n); const r = rg.getBoundingClientRect();
          const anc = []; for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); const b = e.getBoundingClientRect();
            if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') anc.push(e.tagName.toLowerCase() + '.' + String(e.className).slice(0, 80) + ' [' + Math.round(b.left) + ',' + Math.round(b.top) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height) + '] ' + cs.overflowX + '/' + cs.overflowY + ' zoom ' + cs.zoom); }
          out.push({ t: t.slice(0, 40), box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], console: !!document.querySelector('[data-fel-console]'), anc }); }
        return out.slice(0, 6); })(${JSON.stringify(clipped.map((c) => c.replace(/ \[.*$/, '')))})`;

const SHOT = async (page: Page, name: string) => { const png = await page.screenshot({ timeout: 120000 }); await sharp(png).jpeg({ quality: 78 }).toFile(join(OUT, 'shots', `${name}.jpg`)); };

async function waitReady(page: Page, touch: boolean): Promise<string | null> {
  const t0 = Date.now();
  let served = false;
  while (Date.now() - t0 < BOOT_MS) {
    const lbl = await page.evaluate(`(() => { for (const b of document.querySelectorAll('button')) { const t = (b.innerText || '').replace(/\\s+/g, ' ').trim(); const r = b.getBoundingClientRect(); if (r.width > 20 && /^(TAP TO START|FACE THE GLITCH|START|GRIND|PLAY|FIRST SERVE|.*START.*)$/i.test(t) && !/RESTART/i.test(t)) return t; } return null; })()`).catch(() => null) as string | null;
    // the tiebreak's FIRST SERVE card starts the boot itself (GAMEPLAY-CLEAN-AUDIT §3 item 7): tap it once, then wait on
    if (lbl && /FIRST SERVE/i.test(lbl) && !served) { served = true; await tapStart(page, lbl, touch); await page.waitForTimeout(1500); continue; }
    if (lbl && !/FIRST SERVE/i.test(lbl)) return lbl;
    await page.waitForTimeout(1000);
  }
  return null;
}
async function tapStart(page: Page, label: string, touch: boolean) {
  const loc = page.locator('button', { hasText: label }).first();
  if (touch) await loc.tap({ timeout: 5000 }).catch(() => loc.click({ timeout: 5000, force: true }).catch(() => {}));
  else await loc.click({ timeout: 5000 }).catch(() => {});
}
async function play(page: Page, ms: number) {
  const end = Date.now() + ms;
  await page.keyboard.down('w').catch(() => {});
  let i = 0;
  while (Date.now() < end) {
    const k = ['ArrowRight', ' ', 'ArrowLeft', 'j'][i++ % 4];
    await page.keyboard.press(k).catch(() => {});
    await page.waitForTimeout(700);
  }
  await page.keyboard.up('w').catch(() => {});
}

/** each step on its own: a slow screenshot on the loaded box (30 s timeouts seen) must not throw away the readings */
const step = async <T,>(errs: string[], name: string, f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch (e) { errs.push(`${name}: ${String(e).slice(0, 140)}`); return null; } };

async function phoneRun(browser: Browser, inpage: string, mode: string, url: string, res: Record<string, unknown>) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 EveryScreenRig' });
  const page = await ctx.newPage();
  const errs: string[] = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    const label = await waitReady(page, true);
    res.readyLabel = label;
    if (!label) { res.noReadyText = (await page.evaluate('document.body.innerText').catch(() => '') as string).slice(0, 400); await step(errs, 'shot', () => SHOT(page, `${mode}-${TAG}-noready`)); return; }
    await page.waitForTimeout(1500);
    await page.evaluate(inpage);
    // READY, upright: the scorer's reading
    res.ready = await step(errs, 'ready', async () => {
      const m = await page.evaluate('window.__es.measure()').catch(() => null) as { smallTargets: unknown[]; textSizes: unknown[]; buttonLooks: number; buttonLookList?: string[] } | null;
      const a11y = await page.evaluate('window.__a11y.staticScan()').catch(() => ({ violations: [] })) as { violations: { rule: string; severity: string; target?: string; detail?: string }[] };
      const phoneSq = await squeeze(page, true);
      await page.evaluate(`document.documentElement.style.fontSize = '150%'`); await page.waitForTimeout(250);
      const f150 = await squeeze(page, false);
      const f150Diag = await page.evaluate(CLIP_DIAG(f150.clipped)).catch((e) => String(e));
      await page.evaluate(`document.documentElement.style.fontSize = ''`);
      await page.setViewportSize({ width: 640, height: 400 }); await page.waitForTimeout(400);
      const z200 = await squeeze(page, false);
      // what clips each cut-off text at 200 %: the text's box and every ancestor that clips, with its box (a diagnosis)
      const z200Diag = await page.evaluate(CLIP_DIAG(z200.clipped)).catch((e) => String(e));
      await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(600);
      return { tiny: phoneSq.tiny + phoneSq.hudSmall, hudSmall: phoneSq.hudSmall, bodySmall: phoneSq.bodySmall, samples: phoneSq.samples, clipped: { phone: phoneSq.clipped, font150: f150.clipped, zoom200: z200.clipped }, z200Diag, f150Diag,
        critical: a11y.violations.filter((v) => v.severity === 'critical').map((v) => `${v.rule} ${v.target} ${v.detail}`), serious: a11y.violations.filter((v) => v.severity === 'serious').length,
        smallTargets: m?.smallTargets, textSizes: m?.textSizes, buttonLooks: m?.buttonLooks, buttonLookList: m?.buttonLookList };
    });
    await step(errs, 'shot', () => SHOT(page, `${mode}-${TAG}-ready-portrait`));
    // the HUD under the READY card is the mode's opening HUD, the same in every run: the coverage to compare before and
    // after, upright and sideways (in play the HUD's content depends on what the scripted player did)
    res.readyCoverPortrait = await page.evaluate(PLAY_READ).catch(() => null);
    await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(1500);
    // the console view arrives with the shell's next render, slow on this box: read once it is there
    await page.waitForSelector('[data-fel-console]', { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(500);
    res.readyCoverPhone = await page.evaluate(PLAY_READ).catch(() => null);
    await step(errs, 'shot', () => SHOT(page, `${mode}-${TAG}-ready-phone`));
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(1500);
    // in play, upright, then sideways
    await tapStart(page, label, true);
    await play(page, PLAY_MS);
    await page.evaluate(inpage).catch(() => {});
    res.playPortrait = await step(errs, 'playPortrait', () => readPlay(page, true));
    await step(errs, 'shot', () => SHOT(page, `${mode}-${TAG}-play-portrait`));
    await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(2500);
    await page.waitForSelector('[data-fel-console]', { timeout: 15000 }).catch(() => {});
    await play(page, 2000);
    res.playPhone = await step(errs, 'playPhone', () => readPlay(page, true));
    await step(errs, 'shot', () => SHOT(page, `${mode}-${TAG}-play-phone`));
  } finally { res.phoneErrors = errs.slice(0, 8); await ctx.close().catch(() => {}); }
}

async function desktopRun(browser: Browser, inpage: string, mode: string, url: string, res: Record<string, unknown>) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs: string[] = [];
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    const label = await waitReady(page, false);
    res.readyLabelDesktop = label;
    if (!label) return;
    await page.waitForTimeout(1000);
    await page.evaluate(inpage);
    await step(errs, 'shot', () => SHOT(page, `${mode}-${TAG}-ready-desktop`));
    res.readyCoverDesktop = await page.evaluate(PLAY_READ).catch(() => null);
    await tapStart(page, label, false);
    await play(page, PLAY_MS);
    res.playDesktop = await step(errs, 'playDesktop', () => readPlay(page, false));
    await step(errs, 'shot', () => SHOT(page, `${mode}-${TAG}-play-desktop`));
  } finally { res.desktopErrors = errs.slice(0, 8); await ctx.close().catch(() => {}); }
}

/** the phone and the desktop page side by side (the hold is shared: half the wall time) */
async function oneMode(browser: Browser, inpage: string, mode: string) {
  const url = `http://${HOST}:${PORT}/index.html?mode=${mode}`;
  const res: Record<string, unknown> = { mode, tag: TAG, when: new Date().toISOString() };
  await Promise.all([
    ONLY.includes('phone') ? phoneRun(browser, inpage, mode, url, res).catch((e) => { res.phoneFail = String(e).slice(0, 200); }) : null,
    ONLY.includes('desktop') ? desktopRun(browser, inpage, mode, url, res).catch((e) => { res.desktopFail = String(e).slice(0, 200); }) : null,
  ]);
  return res;
}

const MODES = MODES_ARG.split(',').filter(Boolean);
const inpage = await bundleInpage();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const T0 = Date.now(), BUDGET_S = Number(process.env.BUDGET_S ?? 99999);
  for (const mode of MODES) {
    if ((Date.now() - T0) / 1000 > BUDGET_S) { console.log(`budget: stop before ${mode}`); break; }
    const file = join(OUT, `${mode}-${TAG}.json`);
    if (existsSync(file) && !process.env.REDO) { console.log(`skip ${mode} (${file})`); continue; }
    const t0 = Date.now();
    const r = await oneMode(browser, inpage, mode).catch((e) => ({ mode, tag: TAG, fail: String(e).slice(0, 300) }));
    writeFileSync(file, JSON.stringify(r, null, 1));
    console.log(`${mode} ${TAG}: ${Math.round((Date.now() - t0) / 1000)} s`);
  }
} finally { await browser.close(); }
