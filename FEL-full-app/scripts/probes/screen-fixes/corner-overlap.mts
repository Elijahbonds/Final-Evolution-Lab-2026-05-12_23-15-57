// SCREEN-FIXES-2 (2026-11-11): does the start card's corner chip ("MOTION: AUTO · FULL", boot-splash.tsx [data-splash-corner])
// sit on the card's own words? Reported on skateboard: drawn over the venue line at the top ("VENICE SKATEPARK"). This loads
// every game's real start screen on the every-screen rig (a production build, `next start`, the throwaway database, signed
// in as the rig's adult "solo"), on a 390 x 844 phone, and measures the area where the chip's box meets any line of text in
// the card's column (text runs, by Range rects), while loading and on READY. A JPG of the top of each card.
//
//   (in the tree whose build you want, ES_* set as scripts/probes/screen-fixes/ab.sh sets them)
//   /home/user/wt/gate-run.sh 900 env -u DATABASE_URL -u DIRECT_URL npx tsx scripts/probes/screen-fixes/corner-overlap.mts <outDir> <label> [routes,comma]
//
// Writes <outDir>/<label>/corner.json and corner-<route>.jpg. Exit 0 always: the numbers are the result.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';
import { ORIGIN, dbUp, people, serve, storageState } from '../../every-screen/rig.mts';

const [outDir, label = 'now', routesArg] = process.argv.slice(2);
if (!outDir) { console.error('usage: corner-overlap.mts <outDir> <label> [routes]'); process.exit(2); }
const OUT = path.resolve(outDir, label);
fs.mkdirSync(OUT, { recursive: true });

const GAMES = ['skateboard', 'snowboard', 'big-air', 'surf', 'dunk', 'onevone', 'threevthree', 'threepoint', 'dunkduel', 'karate', 'karate-vs',
  'duel', 'showdown', 'mixedcombat', 'velocity-kart', 'aero-aces', 'football', 'soccer', 'tennis', 'tiebreak', 'volleyball', 'golf',
  'baseball', 'derby', 'carnival', 'dance', 'music', 'brain-brawl', 'sprint', 'freerun', 'who-scene-it', 'acting', 'adventure'];
const ROUTES = routesArg ? routesArg.split(',') : GAMES.map((g) => `/play/${g}`);

type Hit = { text: string; area: number; rect: string };
async function measure(page: Page): Promise<{ corner: string | null; chip: string; hits: Hit[] }> {
  return page.evaluate(() => {
    const corner = document.querySelector('[data-splash-corner]');
    const col = document.querySelector('[data-splash-column]');
    if (!corner || !col) return { corner: null, chip: '', hits: [] };
    const c = corner.getBoundingClientRect();
    const rc = (r: DOMRect) => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
    const hits: { text: string; area: number; rect: string }[] = [];
    const walk = document.createTreeWalker(col, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const t = (n.textContent ?? '').trim();
      if (!t) continue;
      const el = n.parentElement!;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      const range = document.createRange(); range.selectNodeContents(n);
      let area = 0; let at: DOMRect | null = null;
      for (const r of Array.from(range.getClientRects())) {
        const w = Math.min(r.right, c.right) - Math.max(r.left, c.left), h = Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top);
        if (w > 0.5 && h > 0.5) { area += w * h; at ??= r; }
      }
      if (area > 0) hits.push({ text: t.slice(0, 40), area: Math.round(area), rect: rc(at!) });
    }
    return { corner: rc(c), chip: (corner.textContent ?? '').trim().slice(0, 40), hits };
  });
}

dbUp();
const stop = await serve(path.join(OUT, 'server.log'));
const p = await people();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const out: Record<string, unknown> = {};
try {
  for (const route of ROUTES) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, storageState: storageState(p, 'solo') });
    const page = await ctx.newPage();
    const name = route.replace(/^\//, '').replace(/\//g, '_');
    try {
      await page.goto(ORIGIN + route, { waitUntil: 'load', timeout: 60000 });
      const seen = await page.waitForSelector('[data-splash-corner]', { timeout: 45000 }).then(() => true).catch(() => false);
      if (!seen) { out[route] = { splash: false }; console.log(`${route.padEnd(22)} no start card`); continue; }
      await page.waitForTimeout(1500);
      const loading = await measure(page);
      const ready = await page.waitForSelector('[data-splash-slot="ready"]', { timeout: 60000 }).then(() => true).catch(() => false);
      await page.waitForTimeout(ready ? 1500 : 0);
      const atReady = ready ? await measure(page) : null;
      await page.screenshot({ path: path.join(OUT, `corner-${name}.jpg`), type: 'jpeg', quality: 70, clip: { x: 0, y: 0, width: 390, height: 240 } });
      const worst = Math.max(0, ...loading.hits.map((h) => h.area), ...(atReady?.hits ?? []).map((h) => h.area));
      out[route] = { splash: true, ready, chip: loading.chip, cornerLoading: loading.corner, cornerReady: atReady?.corner ?? null, loading: loading.hits, atReady: atReady?.hits ?? null, worstPx2: worst };
      const firstHit = [...(atReady?.hits ?? []), ...loading.hits][0];
      console.log(`${route.padEnd(22)} ${worst ? `OVERLAP ${worst} px²` : 'clear'}${firstHit ? ` — "${firstHit.text}" at ${firstHit.rect}` : ''} (chip ${loading.corner}${ready ? '' : '; READY not reached'})`);
    } catch (e) {
      out[route] = { error: String(e).slice(0, 160) };
      console.log(`${route.padEnd(22)} error ${String(e).slice(0, 100)}`);
    } finally { await ctx.close(); }
  }
} finally {
  await browser.close();
  stop();
}
fs.writeFileSync(path.join(OUT, 'corner.json'), JSON.stringify(out, null, 1));
console.log('[corner] wrote', path.join(OUT, 'corner.json'));
