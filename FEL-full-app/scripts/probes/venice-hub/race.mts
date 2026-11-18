// VENICE TEARDOWN RACE (lane/venice-v2, 2026-11-18; Cursor PR #635's finding): two hubs in one page, the second mounted while the
// first is still loading (./hub-entry.ts ?race=<ms>), then the FIRST is torn down — after the second is up ("late"), or while the
// second is still loading ("early"). The second must come through untouched: still playing, its probe seam present and its own,
// its player walking. Before the fix the first's teardown closed every live hub (the second's player, sound and life) and
// removed the page's seam and card.
//
//   OUT=<dir> /home/user/wt/gate-run.sh 1200 npx tsx scripts/probes/venice-hub/race.mts      (REPS=3 RACE_MS=400)
import { chromium, type Page } from 'playwright-core';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExe } from '../_chromium.mts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../../..');
const OUT = process.env.OUT ?? '/tmp/venice-race';
const PORT = Number(process.env.PORT ?? 3744);
const REPS = Number(process.env.REPS ?? 3), RACE_MS = Number(process.env.RACE_MS ?? 400);
const SITE = path.join(OUT, 'site');
fs.mkdirSync(SITE, { recursive: true });
const esbuild = createRequire(path.join(APP, 'package.json'))('esbuild');
await esbuild.build({
  absWorkingDir: APP, entryPoints: [path.join(HERE, 'hub-entry.ts')], bundle: true, minify: true, format: 'iife', platform: 'browser', target: 'es2020',
  tsconfig: path.join(APP, 'tsconfig.json'), define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: 'window.process=window.process||{env:{NODE_ENV:"production"}};' },
  loader: { '.glb': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.wasm': 'dataurl' }, logLevel: 'error', outfile: path.join(SITE, 'hub.js'),
});
fs.writeFileSync(path.join(SITE, 'hub.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;overflow:hidden;background:#000}canvas{width:100%;height:100%;display:block}#card{display:none}</style></head><body><canvas id="c"></canvas><div id="card"></div><script src="hub.js"></script></body></html>');
const server = spawn(process.execPath, [path.join(APP, 'scripts/probes/hoops-gap/serve.mjs'), SITE, String(PORT)], { stdio: 'ignore' });
const stopServer = () => { try { server.kill(); } catch { /* gone */ } };
process.on('exit', stopServer);
for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/hub.html`)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 250)); }

// what the probe reads (strings: tsx's __name helper does not exist in the page)
const READ = `(() => { const w = window, v = w.__VENICE__; const s = v ? v.state() : null; return { phaseB: w.__phaseB ?? null, errB: w.__errB ?? null, seam: !!v, x: s ? s.x : null, z: s ? s.z : null, meshes: v && v.counts ? v.counts().meshes : null }; })()`;
async function checkB(page: Page): Promise<{ ok: boolean; why: string }> {
  await page.waitForFunction(`window.__phaseB === 'playing'`, null, { timeout: 240000 });
  await page.waitForTimeout(3000);
  const a = await page.evaluate(READ) as { phaseB: string; seam: boolean; x: number; z: number; meshes: number; errB: string | null };
  if (!a.seam) return { ok: false, why: 'the second hub lost its probe seam (window.__VENICE__)' };
  await page.evaluate(`window.__VENICE__.walkToPoint(${a.x + 6}, ${a.z})`);
  await page.waitForTimeout(4000);
  const b = await page.evaluate(READ) as typeof a;
  const moved = Math.hypot(b.x - a.x, b.z - a.z);
  if (b.phaseB !== 'playing') return { ok: false, why: `the second hub is ${b.phaseB}` };
  if (moved < 1) return { ok: false, why: `the second hub's player did not walk (${moved.toFixed(2)} m)` };
  if (!b.meshes || b.meshes < 100) return { ok: false, why: `the second hub's scene holds ${b.meshes} meshes` };
  return { ok: true, why: `playing, seam present, walked ${moved.toFixed(1)} m, ${b.meshes} meshes` };
}

const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const rows: Record<string, unknown>[] = [];
let failed = 0;
try {
  for (let rep = 1; rep <= REPS; rep++) for (const order of ['control', 'late', 'early'] as const) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
    let r: { ok: boolean; why: string };
    try {
      if (order === 'control') {
        // the same two hubs, nobody torn down: the second hub's reading with no teardown at all
        await page.goto(`http://127.0.0.1:${PORT}/hub.html?race=${RACE_MS}`);
        await page.waitForFunction(`typeof window.__stopA === 'function'`, null, { timeout: 240000 });
        r = await checkB(page);
      } else {
        await page.goto(`http://127.0.0.1:${PORT}/hub.html?race=${RACE_MS}`);
        if (order === 'late') {
          await page.waitForFunction(`typeof window.__stopA === 'function' && window.__phaseB === 'playing'`, null, { timeout: 240000 });
        } else {
          await page.waitForFunction(`typeof window.__stopA === 'function'`, null, { timeout: 240000 });
          const bUp = await page.evaluate(`window.__phaseB === 'playing'`);
          if (bUp) console.log(`  (rep ${rep} early: the second hub was already up when the first finished loading — this rep is a late one)`);
        }
        await page.evaluate(`window.__stopA()`);   // the first hub's teardown
        r = await checkB(page);
      }
    } catch (e) { r = { ok: false, why: String((e as Error).message).split('\n')[0].slice(0, 200) }; }
    if (errors.length) r = { ok: false, why: `${r.why}; page errors: ${errors.slice(0, 2).join(' | ')}` };
    if (!r.ok) { failed++; await page.screenshot({ path: path.join(OUT, `race-fail-${order}-${rep}.jpg`), type: 'jpeg', quality: 60 }).catch(() => {}); }
    rows.push({ rep, order, ...r });
    console.log(`rep ${rep} ${order}: ${r.ok ? 'OK' : 'FAIL'} — ${r.why}`);
    await ctx.close();
  }
} finally { await browser.close(); stopServer(); }
fs.writeFileSync(path.join(OUT, 'race.json'), JSON.stringify(rows, null, 1));
fs.rmSync(SITE, { recursive: true, force: true });
console.log(`race: ${rows.length - failed} of ${rows.length} kept the second hub`);
process.exit(failed ? 1 : 0);
