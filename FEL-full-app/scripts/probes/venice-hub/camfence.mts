// VENICE CAMERA AT A FENCE (lane/venice-v2, phase 3, 2026-11-18): the hub on the phone profile (./hub-entry.ts, esbuild, the real
// mode), arriving beside Court 1. The player walks in to the court's west fence, turns, and walks back east: for the first seconds
// the camera trails behind them — where it wants to be is past the fence. Recorded for TRAIL_FRAMES frames (a second scene: the boardwalk row, below):
//   through     frames the camera stands outside the fence while the player is inside it (the camera went through the fence)
//   jitter      the camera-to-player distance's reversals bigger than 0.1 m (a pull-in that pumps in and out)
//   maxStep     the biggest one-frame change of that distance (m)
// Run with venue.veniceCamCollide off and on (FEEL), REPS times each, and a shot at the pull-in.
//
//   OUT=<dir> /home/user/wt/gate-run.sh 1200 npx tsx scripts/probes/venice-hub/camfence.mts      (REPS=3 TRAIL_FRAMES=90 LEVELS=0,1,2)
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
const REPS = Number(process.env.REPS ?? 3);
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

// two places the camera trails into a solid: Court 1's west fence (see-through chain-link; only venue.veniceCamCollide 2 blocks it)
// and the boardwalk row's shopfronts (x -78..-50, z -78.2..-75.4: an opaque building, blocked at level 1). Each: walk in to the
// solid, turn, walk away; for TRAIL_FRAMES frames the camera trails back toward it.
type Scene = { name: string; via: Array<[number, number]>; at: [number, number]; away: [number, number];
  /** the camera is past the solid while the player is not */ through: string };
const SCENES: Scene[] = [
  { name: 'fence', via: [], at: [-72.9, -100], away: [-40, -100], through: 'c.x < -74.55 && p.x > -74.5 && Math.abs(c.z + 100) < 16.5' },
  { name: 'boardwalk', via: [[-46, -100], [-46, -69], [-64, -71]], at: [-64, -74.6], away: [-64, -58], through: 'c.z < -75.4 && p.z > -75.4 && c.x > -78 && c.x < -50' },
];
const TRAIL_FRAMES = Number(process.env.TRAIL_FRAMES ?? 90);
const LEVELS = (process.env.LEVELS ?? '0,1,2').split(',').map(Number);
type Seam = { state(): { x: number; z: number; walking: boolean }; walkToPoint(x: number, z: number): void; stop(): void };
const walk = async (page: import('playwright-core').Page, x: number, z: number) => {
  await page.evaluate(`window.__VENICE__.walkToPoint(${x}, ${z})`);
  await page.waitForFunction(`(() => { const s = window.__VENICE__.state(); return !s.walking || Math.hypot(s.x - (${x}), s.z - (${z})) < 1.2; })()`, null, { timeout: 120000 });
};
const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const rows: Record<string, unknown>[] = [];
try {
  for (let rep = 1; rep <= REPS; rep++) for (const level of LEVELS) {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })).newPage();
    try {
      await page.goto(url({ 'venue.veniceCamCollide': level, 'venue.veniceLife': 0, 'venue.veniceCourtLife': 0 }));
      await page.waitForFunction(`!!window.__VENICE__ && window.__phase === 'playing'`, null, { timeout: 180000 });
      await page.waitForFunction(`!!window.__FEL_DEV__ && window.__FEL_DEV__.scene.meshes.length > 150`, null, { timeout: 120000 }).catch(() => {});
      await page.waitForTimeout(4000);
      for (const sc of SCENES) {
        for (const [x, z] of sc.via) await walk(page, x, z);
        await walk(page, sc.at[0], sc.at[1]);
        await page.waitForTimeout(1500);
        // FRAME-based (the shared box runs the rig at a few frames a second; the director and the movement clamp their step, so N
        // frames are the same game-time walk however slow the box is). A string: tsx's __name helper is not in the page.
        const rec = await page.evaluate(`(async () => {
          const w = window, n = ${TRAIL_FRAMES};
          w.__VENICE__.walkToPoint(${sc.away[0]}, ${sc.away[1]});
          const d = []; let through = 0;
          await new Promise((done) => { let k = 0; const tick = () => {
            const c = w.__FEL_DEV__.scene.activeCamera.position, p = w.__VENICE__.state();
            d.push(Math.hypot(c.x - p.x, c.z - p.z));
            if (${sc.through}) through++;
            if (++k < n) requestAnimationFrame(tick); else done(); }; requestAnimationFrame(tick); });
          let rev = 0, maxStep = 0, ext = d[0], dir = 0;
          for (let i = 1; i < d.length; i++) {
            maxStep = Math.max(maxStep, Math.abs(d[i] - d[i - 1]));
            const nd = Math.sign(d[i] - ext);
            if (nd !== 0 && Math.abs(d[i] - ext) >= 0.1) { if (dir !== 0 && nd !== dir) rev++; dir = nd; ext = d[i]; }
            else if ((dir > 0 && d[i] > ext) || (dir < 0 && d[i] < ext)) ext = d[i];
          }
          return { frames: d.length, through, jitter: rev, maxStep: Math.round(maxStep * 100) / 100, minDist: Math.round(Math.min(...d) * 100) / 100, maxDist: Math.round(Math.max(...d) * 100) / 100 };
        })()`) as Record<string, number>;
        if (rep === 1) {
          await walk(page, sc.at[0], sc.at[1]);
          await page.waitForTimeout(1500);
          await page.evaluate(`window.__VENICE__.walkToPoint(${sc.away[0]}, ${sc.away[1]})`);
          await page.waitForTimeout(800);
          await page.screenshot({ path: path.join(OUT, `venice-v2-camera-${sc.name}-level${level}-phone.jpg`), type: 'jpeg', quality: 85 });
        }
        rows.push({ rep, level, scene: sc.name, ...rec });
        console.log(`rep ${rep} level ${level} ${sc.name}: ${JSON.stringify(rec)}`);
        await page.evaluate(`window.__VENICE__.stop()`);
      }
    } catch (e) {
      rows.push({ rep, level, error: String((e as Error).message).slice(0, 200) });
      console.log(`rep ${rep} level ${level} FAILED: ${String((e as Error).message).split('\n')[0].slice(0, 200)}`);
    }
    await page.context().close();
  }
} finally { await browser.close(); stopServer(); }
fs.writeFileSync(path.join(OUT, 'camfence.json'), JSON.stringify(rows, null, 1));
fs.rmSync(SITE, { recursive: true, force: true });
