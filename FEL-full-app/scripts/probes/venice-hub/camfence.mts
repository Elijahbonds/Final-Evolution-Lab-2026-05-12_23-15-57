// VENICE CAMERA AT A FENCE (lane/venice-v2, phase 3, 2026-11-18): the hub on the phone profile (./hub-entry.ts, esbuild, the real
// mode), arriving beside Court 1. The player walks in to the court's west fence, turns, and walks back east: for the first seconds
// the camera trails behind them — where it wants to be is past the fence. Recorded every animation frame for TRAIL_SEC:
//   through     frames the camera stands outside the fence while the player is inside it (the camera went through the fence)
//   jitter      the camera-to-player distance's reversals bigger than 0.1 m (a pull-in that pumps in and out)
//   maxStep     the biggest one-frame change of that distance (m)
// Run with venue.veniceCamCollide off and on (FEEL), REPS times each, and a shot at the pull-in.
//
//   OUT=<dir> /home/user/wt/gate-run.sh 1200 npx tsx scripts/probes/venice-hub/camfence.mts      (REPS=3 TRAIL_SEC=6)
import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExe } from '../_chromium.mts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../../..');
const OUT = process.env.OUT ?? '/tmp/venice-camfence';
const PORT = Number(process.env.PORT ?? 3743);
const REPS = Number(process.env.REPS ?? 3), TRAIL_SEC = Number(process.env.TRAIL_SEC ?? 6);
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
const url = (feel: Record<string, number>) => `http://127.0.0.1:${PORT}/hub.html?spot=court.ones&feel=${encodeURIComponent(JSON.stringify(feel))}`;
for (let i = 0; i < 40; i++) { try { if ((await fetch(url({}))).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 250)); }

// Court 1: centre (-64, -100); the fence's west run at x = -64 - 10.5 = -74.5, from z -116.5 to -83.5
const FENCE_X = -74.5, CZ = -100, HALF_L = 16.5;
type Seam = { state(): { x: number; z: number; walking: boolean }; walkToPoint(x: number, z: number): void; stop(): void };
const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const rows: Record<string, unknown>[] = [];
try {
  for (let rep = 1; rep <= REPS; rep++) for (const side of ['off', 'on'] as const) {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })).newPage();
    try {
      await page.goto(url({ 'venue.veniceCamCollide': side === 'on' ? 1 : 0, 'venue.veniceLife': 0, 'venue.veniceCourtLife': 0 }));
      await page.waitForFunction(() => !!(window as unknown as { __VENICE__?: unknown }).__VENICE__ && (window as unknown as { __phase?: string }).__phase === 'playing', null, { timeout: 180000 });
      // the blockers land with the deferred scenery
      await page.waitForFunction(() => { const d = (window as unknown as { __FEL_DEV__?: { scene: { getMeshByName(n: string): unknown; meshes: unknown[] } } }).__FEL_DEV__; return !!d && d.scene.meshes.length > 150; }, null, { timeout: 120000 }).catch(() => {});
      await page.waitForTimeout(4000);
      // walk in to the west fence (inside it), then turn and walk east, recording the camera
      await page.evaluate(([x, z]) => (window as unknown as { __VENICE__: Seam }).__VENICE__.walkToPoint(x, z), [FENCE_X + 1.6, CZ]);
      await page.waitForFunction((fx) => (window as unknown as { __VENICE__: Seam }).__VENICE__.state().x < fx + 2.2, FENCE_X, { timeout: 30000 });
      await page.waitForTimeout(1500);
      const rec = await page.evaluate(async ([sec, fx, cz, hl]) => {
        const w = window as unknown as { __VENICE__: Seam; __FEL_DEV__: { scene: { activeCamera: { position: { x: number; y: number; z: number } } } } };
        w.__VENICE__.walkToPoint(-40, cz);
        const d: number[] = [];
        let through = 0, frames = 0;
        const t0 = performance.now();
        await new Promise<void>((done) => {
          const tick = () => {
            const c = w.__FEL_DEV__.scene.activeCamera.position, p = w.__VENICE__.state();
            frames++;
            d.push(Math.hypot(c.x - p.x, c.z - p.z));
            if (c.x < fx - 0.05 && p.x > fx && Math.abs(c.z - cz) < hl) through++;
            if (performance.now() - t0 < sec * 1000) requestAnimationFrame(tick); else done();
          };
          requestAnimationFrame(tick);
        });
        // reversals of the distance bigger than 0.1 m, and the biggest one-frame step
        let rev = 0, maxStep = 0, ext = d[0], dir = 0;
        for (let i = 1; i < d.length; i++) {
          maxStep = Math.max(maxStep, Math.abs(d[i] - d[i - 1]));
          const nd = Math.sign(d[i] - ext);
          if (nd !== 0 && Math.abs(d[i] - ext) >= 0.1) { if (dir !== 0 && nd !== dir) rev++; dir = nd; ext = d[i]; }
          else if ((dir > 0 && d[i] > ext) || (dir < 0 && d[i] < ext)) ext = d[i];
        }
        return { frames, through, jitter: rev, maxStep: Math.round(maxStep * 100) / 100, minDist: Math.round(Math.min(...d) * 100) / 100, maxDist: Math.round(Math.max(...d) * 100) / 100 };
      }, [TRAIL_SEC, FENCE_X, CZ, HALF_L] as const);
      if (rep === 1) {
        // the picture: the same walk again, shot 0.8 s after the turn (the camera at its pull-in)
        await page.evaluate(([x, z]) => (window as unknown as { __VENICE__: Seam }).__VENICE__.walkToPoint(x, z), [FENCE_X + 1.6, CZ]);
        await page.waitForFunction((fx) => (window as unknown as { __VENICE__: Seam }).__VENICE__.state().x < fx + 2.2, FENCE_X, { timeout: 30000 });
        await page.waitForTimeout(1500);
        await page.evaluate((cz) => (window as unknown as { __VENICE__: Seam }).__VENICE__.walkToPoint(-40, cz), CZ);
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(OUT, `venice-v2-camera-fence-${side}-phone.jpg`), type: 'jpeg', quality: 85 });
      }
      rows.push({ rep, side, ...rec });
      console.log(`rep ${rep} camCollide ${side}: ${JSON.stringify(rec)}`);
    } catch (e) {
      rows.push({ rep, side, error: String((e as Error).message).slice(0, 200) });
      console.log(`rep ${rep} camCollide ${side} FAILED: ${String((e as Error).message).slice(0, 200)}`);
    }
    await page.context().close();
  }
} finally { await browser.close(); stopServer(); }
fs.writeFileSync(path.join(OUT, 'camfence.json'), JSON.stringify(rows, null, 1));
fs.rmSync(SITE, { recursive: true, force: true });
