// SCREEN-FIXES (2026-11-10): the shared start screen's layout shift (components/games/boot-splash.tsx), measured on its own.
// DUNK-FLAGSHIP §15 measured 0.205–0.236 on the real dunk host, "the controls card under the title, as the location and
// ball rows load"; this mounts the card alone (splash-entry.tsx) so the number is the card's and nothing else's.
//
//   npx tsx scripts/probes/screen-fixes/splash-cls.mts build <outDir> <label>          bundle the card (no browser)
//   /home/user/wt/gate-run.sh 600 npx tsx scripts/probes/screen-fixes/splash-cls.mts measure <outDir> <label> [modes] [seeds]
//
// SCREEN-FIXES-2 (2026-11-11): [seeds] (comma list) pins which learn card is drawn (splash-entry `?seed=`): each mode is
// run once per seed, and the learn card's own height (its scrollHeight, what it would take unclamped) is reported.
//
// A 390 × 844 phone, CPU slowed 4× (the every-screen scorer's phone). Per mode: the sum of the shifts while loading, at the
// READY swap, and after it, each shift with what moved; and two JPGs (loading, ready). Writes <outDir>/<label>/splash.json.
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const [cmd, outDir, label = 'now', modesArg, seedsArg] = process.argv.slice(2);
if (!cmd || !outDir) { console.error('usage: splash-cls.mts build|measure <outDir> <label> [modes]'); process.exit(2); }
const SITE = path.resolve(outDir, label);

if (cmd === 'build') {
  const { buildRig } = await import('../../a11y/rig.mts');
  fs.mkdirSync(path.join(SITE, 'fonts'), { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, 'app/fonts'))) if (f.endsWith('.woff2')) fs.copyFileSync(path.join(ROOT, 'app/fonts', f), path.join(SITE, 'fonts', f));
  await buildRig(SITE, { entry: path.join(ROOT, 'scripts/probes/screen-fixes/splash-entry.tsx'), fontBase: '/fonts', prodFonts: true, external: ['@mediapipe/tasks-vision'] });
  console.log('[splash] built', SITE);
  process.exit(0);
}

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = createServer((req, res) => {
  const p = path.join(SITE, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
  if (!p.startsWith(SITE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const MODES = (modesArg ?? 'dunkContest,karate,threePoint,skateboard').split(',');
const READY_AT = 3000;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), args: ['--no-sandbox'] });
type Shift = { v: number; t: number; input: boolean; src: string[]; rects: string[] };
const out: Record<string, unknown> = {};
try {
  const SEEDS = seedsArg ? seedsArg.split(',') : [''];
  for (const mode0 of MODES) for (const seed of SEEDS) {
    const mode = seed ? `${mode0}@${seed}` : mode0;
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const errors: string[] = [];
    p.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
    await p.goto(`${BASE}/index.html?mode=${mode0}&readyAt=${READY_AT}${seed ? `&seed=${seed}` : ''}`, { waitUntil: 'load', timeout: 120000 });
    await p.waitForTimeout(1500);
    await p.waitForFunction(() => document.querySelector('[data-learn-idle]'), null, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(300);
    const hLoad = await p.evaluate(() => ({ card: Math.round(document.querySelector('[data-learn-idle]')?.getBoundingClientRect().height ?? 0), cardOwn: document.querySelector('[data-learn-idle]')?.scrollHeight ?? 0, slot: Math.round(document.querySelector('[data-splash-slot]')?.getBoundingClientRect().height ?? 0) }));
    await p.screenshot({ path: path.join(SITE, `splash-${mode}-loading.jpg`), type: 'jpeg', quality: 70 });
    await p.waitForFunction(() => document.querySelector('[data-phase="ready"]'), null, { timeout: 60000 });
    await p.waitForTimeout(4000);
    await p.screenshot({ path: path.join(SITE, `splash-${mode}-ready.jpg`), type: 'jpeg', quality: 70 });
    const hReady = await p.evaluate(() => Math.round(document.querySelector('[data-splash-slot]')?.getBoundingClientRect().height ?? 0));
    const r = await p.evaluate(() => {
      const w = window as unknown as { __CLS: Shift[]; __readyT?: number };
      return { shifts: w.__CLS, tReady: w.__readyT ?? null };
    });
    const shifts = r.shifts.filter((s) => !s.input);
    const sum = (xs: Shift[]) => Math.round(xs.reduce((a, s) => a + s.v, 0) * 1000) / 1000;
    const tr = r.tReady ?? Infinity;
    const loading = shifts.filter((s) => s.t < tr), swap = shifts.filter((s) => s.t >= tr && s.t < tr + 250), after = shifts.filter((s) => s.t >= tr + 250);
    out[mode] = { learnCardPx: hLoad.card, learnCardOwnPx: hLoad.cardOwn, slotLoadingPx: hLoad.slot, slotReadyPx: hReady, cls: sum(shifts), loading: sum(loading), swap: sum(swap), after: sum(after), count: shifts.length, tReady: r.tReady, errors,
      shifts: shifts.map((s) => ({ v: Math.round(s.v * 1000) / 1000, t: s.t, src: s.src.slice(0, 4), rects: s.rects.slice(0, 4) })) };
    console.log(`${mode.padEnd(14)} cls ${sum(shifts)} = loading ${sum(loading)} + READY swap ${sum(swap)} + after ${sum(after)} (${shifts.length} shifts, ready at ${r.tReady} ms; learn card ${hLoad.card} px (own ${hLoad.cardOwn}), slot ${hLoad.slot} -> ${hReady} px)${errors.length ? `  errors: ${errors[0]}` : ''}`);
    for (const s of shifts.filter((x) => x.v >= 0.001)) console.log(`   ${s.t}ms  ${s.v.toFixed(3)}  ${s.src[0] ?? ''}  ${s.rects[0] ?? ''}`);
    await ctx.close();
  }
} finally {
  await b.close();
  server.close();
}
fs.writeFileSync(path.join(SITE, 'splash.json'), JSON.stringify(out, null, 1));
console.log('[splash] wrote', path.join(SITE, 'splash.json'));
