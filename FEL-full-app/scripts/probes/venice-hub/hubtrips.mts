// VENICE HUB ROUND TRIPS WITHOUT A BUILD (lane/venice-v2, 2026-11-18): the shared box had no disk for a production build, so this
// is the hub's half of roundtrip.mts on the esbuild rig (./hub-entry.ts): TRIPS times, tear the hub down and mount a fresh one on
// a fresh canvas (W.__remount: what the page does when you leave for a game and come back), wait for its life and court life to
// land, force a GC (CDP), and read the JS heap, the window / document listeners, the canvases and the hub scene's counts (its
// seam). A leak climbs trip over trip: the verdict compares the last three trips with trips 2-4 and fails on more than GROW_MB or
// on any listener growth. The games' own pages are not in this one (roundtrip.mts covers them on a build).
//
//   OUT=<dir> /home/user/wt/gate-run.sh 1800 npx tsx scripts/probes/venice-hub/hubtrips.mts     (TRIPS=10 GROW_MB=8)
import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExe } from '../_chromium.mts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../../..');
const OUT = process.env.OUT ?? '/tmp/venice-hubtrips';
const PORT = Number(process.env.PORT ?? 3745);
const TRIPS = Number(process.env.TRIPS ?? 10), GROW_MB = Number(process.env.GROW_MB ?? 8);
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

const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc'] });
const rows: Record<string, number | string | null>[] = [];
let verdict = 'not run';
try {
  // a desktop page: the life (gulls + watchers) and the court life (bodies) are both mounted, the most a trip can leave behind
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });   // under 1024 px wide the hub picks the phone tier
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const logs: string[] = [];
  page.on('console', (m) => { const t = m.text(); if (/\[VENICE\] (life|court life):/.test(t)) logs.push(t); });
  await page.goto(`http://127.0.0.1:${PORT}/hub.html`);
  for (let trip = 1; trip <= TRIPS; trip++) {
    if (trip > 1) await page.evaluate(`window.__remount()`);
    await page.waitForFunction(`window.__phase === 'playing' && !!window.__VENICE__`, null, { timeout: 300000 });
    const n0 = logs.filter((l) => /court life:/.test(l)).length;
    await page.waitForFunction(`true`);
    const t0 = Date.now();
    while (logs.filter((l) => /court life:/.test(l)).length < trip && Date.now() - t0 < 240000) await page.waitForTimeout(1000);
    await page.waitForTimeout(3000);
    await cdp.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(500); await cdp.send('HeapProfiler.collectGarbage');
    const heap = await cdp.send('Runtime.getHeapUsage') as { usedSize: number };
    const win = await cdp.send('Runtime.evaluate', { expression: 'window', objectGroup: 'rt' }) as { result: { objectId: string } };
    const doc = await cdp.send('Runtime.evaluate', { expression: 'document', objectGroup: 'rt' }) as { result: { objectId: string } };
    const lw = await cdp.send('DOMDebugger.getEventListeners', { objectId: win.result.objectId }) as { listeners: unknown[] };
    const ld = await cdp.send('DOMDebugger.getEventListeners', { objectId: doc.result.objectId }) as { listeners: unknown[] };
    await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'rt' });
    const c = await page.evaluate(`(() => { const v = window.__VENICE__; return v && v.counts ? v.counts() : null; })()`) as Record<string, number | string> | null;
    const row = { trip, heapMb: Math.round((heap.usedSize / 1048576) * 10) / 10, windowListeners: lw.listeners.length, documentListeners: ld.listeners.length,
      canvases: await page.evaluate(`document.querySelectorAll('canvas').length`) as number, meshes: (c?.meshes as number) ?? null, materials: (c?.materials as number) ?? null,
      textures: (c?.textures as number) ?? null, observersBefore: (c?.observersBefore as number) ?? null, bed: (c?.bed as string) ?? null, courtLifeLogs: logs.filter((l) => /court life:/.test(l)).length - n0 };
    rows.push(row);
    console.log(`trip ${trip}: ${JSON.stringify(row)}`);
  }
  const heap = rows.map((r) => r.heapMb as number), avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const grow = avg(heap.slice(-3)) - avg(heap.slice(1, 4));
  const lis = (rows.at(-1)!.windowListeners as number) - (rows[1].windowListeners as number) + (rows.at(-1)!.documentListeners as number) - (rows[1].documentListeners as number);
  // each trip is a NEW scene, so its counts are a sanity check, not the leak signal (heap, listeners and canvases are): the life and
  // the court life land asynchronously, and the first run (2026-11-18) read 233-237 meshes, 151-155 materials, 108-109 textures and
  // 20-23 observers over trips 2-10 with no trend. Within 4 of trip 2 is steady; a leak that kept old scenes alive would show in
  // the heap. (FLAG: the first version demanded exact equality.)
  const flat = ['meshes', 'materials', 'textures', 'observersBefore'].every((k) => rows.slice(1).every((r) => Math.abs((r[k] as number) - (rows[1][k] as number)) <= 4));
  verdict = grow <= GROW_MB && lis <= 0 && flat ? 'pass' : 'fail';
  console.log(`hub trips: heap trips 2-4 ${avg(heap.slice(1, 4)).toFixed(1)} MB -> last 3 ${avg(heap.slice(-3)).toFixed(1)} MB (${grow >= 0 ? '+' : ''}${grow.toFixed(1)}); listeners ${lis >= 0 ? '+' : ''}${lis}; scene counts ${flat ? 'flat' : 'MOVED'}; ${verdict}`);
  await ctx.close();
} finally { await browser.close(); stopServer(); }
fs.writeFileSync(path.join(OUT, 'hubtrips.json'), JSON.stringify({ rows, verdict }, null, 1));
fs.rmSync(SITE, { recursive: true, force: true });
process.exit(verdict === 'pass' ? 0 : 1);
