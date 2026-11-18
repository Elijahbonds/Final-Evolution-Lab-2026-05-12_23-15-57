// VENICE STUCK CHECK (lane/venice-v1, improvement pass phase 8, 2026-11-17): 20 random walks through the courts district on the REAL hub
// (./hub-entry.ts, the mode through runMode; its walk seam window.__VENICE__). Each walk is four legs, the way a player wanders: the
// stick held in a random direction for 2–4 s (walkToPoint 200 m out that way). Hitting a wall, a fence, a bench or the rim and stopping
// is fine (BLOCKED). What fails:
//   STUCK     the player has stopped (under 0.3 m in 1.5 s) AND cannot get moving again: the stick is tried north, east, south and west
//             for 0.8 s each, and none of them moves the player 0.3 m. That is a wedge, a snag, a corner the sim cannot leave.
//   INSIDE    the player is ever inside a solid (seam inSolid: a block taller than a step above their feet).
// The seed is fixed, so before / after runs (FEEL='{"venue.veniceSolids":0}') walk the same legs.
//
//   OUT=<dir> /home/user/wt/gate-run.sh 900 npx tsx scripts/probes/venice-hub/stuck.mts     (WALKS=20 SEED=7 LEGS=4)
import { chromium, type Page } from 'playwright-core';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExe } from '../_chromium.mts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../../..');
const OUT = process.env.OUT ?? '/tmp/venice-stuck';
const PORT = Number(process.env.PORT ?? 3742);
const WALKS = Number(process.env.WALKS ?? 20), SEED = Number(process.env.SEED ?? 7), LEGS = Number(process.env.LEGS ?? 4);
const FEEL = process.env.FEEL ?? '';
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
const stop = () => { try { server.kill(); } catch { /* gone */ } };
process.on('exit', stop);
const base = `http://127.0.0.1:${PORT}/hub.html${FEEL ? `?feel=${encodeURIComponent(FEEL)}` : ''}`;
for (let i = 0; i < 40; i++) { try { if ((await fetch(base)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 250)); }

let t = SEED >>> 0;
const rnd = () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
type V = { x: number; z: number; walking: boolean };
type Seam = { state(): V; walkToPoint(x: number, z: number): void; stop(): void; inSolid?: () => boolean };
const seam = (p: Page) => p.evaluate(() => { const v = (window as unknown as { __VENICE__: Seam }).__VENICE__; return { ...v.state(), inside: v.inSolid ? v.inSolid() : false }; });
const push = (p: Page, from: V, ang: number) => p.evaluate(([x, z]) => (window as unknown as { __VENICE__: Seam }).__VENICE__.walkToPoint(x, z), [from.x + Math.cos(ang) * 200, from.z + Math.sin(ang) * 200]);

const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const walks: Record<string, unknown>[] = [];
let insideEver = 0;
try {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })).newPage();
  await page.goto(base);
  await page.waitForFunction(() => !!(window as unknown as { __VENICE__?: unknown }).__VENICE__ && (window as unknown as { __phase?: string }).__phase === 'playing', null, { timeout: 180000 });
  await page.waitForTimeout(4000);   // the deferred scenery (and the palms' solids) land
  for (let w = 0; w < WALKS; w++) {
    let result = 'free', blocked = 0;
    for (let leg = 0; leg < LEGS && result !== 'stuck'; leg++) {
      const ang = rnd() * Math.PI * 2, dur = 2000 + rnd() * 2000;
      await push(page, await seam(page), ang);
      const hist: Array<{ t: number; x: number; z: number }> = [];
      const t0 = Date.now();
      while (Date.now() - t0 < dur) {
        await page.waitForTimeout(250);
        const s = await seam(page);
        if (s.inside) { insideEver++; result = 'inside'; }
        hist.push({ t: Date.now(), x: s.x, z: s.z });
        const back = hist.find((h) => h.t >= Date.now() - 1500);
        if (back && Date.now() - hist[0].t > 1500 && Math.hypot(s.x - back.x, s.z - back.z) < 0.3) {
          // stopped: can the player get moving again in any direction?
          let freed = false;
          for (const a of [-Math.PI / 2, 0, Math.PI / 2, Math.PI]) {
            const p0 = await seam(page);
            await push(page, p0, a);
            await page.waitForTimeout(800);
            const p1 = await seam(page);
            if (Math.hypot(p1.x - p0.x, p1.z - p0.z) >= 0.3) { freed = true; break; }
          }
          if (!freed) { result = 'stuck'; break; }
          blocked++;
          break;   // next leg
        }
      }
    }
    const end = await seam(page);
    await page.evaluate(() => (window as unknown as { __VENICE__: Seam }).__VENICE__.stop());
    if (result === 'stuck' || result === 'inside') await page.screenshot({ path: path.join(OUT, `stuck-${w}.jpg`), type: 'jpeg', quality: 60 });
    walks.push({ w, end: [Number(end.x.toFixed(1)), Number(end.z.toFixed(1))], result, blocked });
    console.log(`walk ${w}: ${result}${blocked ? ` (stopped by something ${blocked}×, walked off again)` : ''} — ended at (${end.x.toFixed(1)}, ${end.z.toFixed(1)})`);
  }
} finally { await browser.close(); stop(); }
const stuck = walks.filter((w) => w.result === 'stuck').length, blocked = walks.reduce((s, w) => s + (w.blocked as number), 0);
fs.writeFileSync(path.join(OUT, 'stuck.json'), JSON.stringify({ feel: FEEL || null, walks, stuck, inside: insideEver, blocked }, null, 1));
console.log(`stuck-check${FEEL ? ` ${FEEL}` : ''}: ${walks.length} walks, ${stuck} stuck, ${insideEver} samples inside a solid, ${blocked} stops at a wall or prop (each walked off again)`);
fs.rmSync(SITE, { recursive: true, force: true });
process.exit(stuck || insideEver ? 1 : 0);
