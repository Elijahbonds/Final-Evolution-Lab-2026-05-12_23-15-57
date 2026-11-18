// VENICE V1 phone rig (lane/venice-v1, 2026-11-17). Bundles ./hub-entry.ts with esbuild (production; never next dev / build),
// serves it with the hoops-gap static server on this lane's port (3741), and as a PHONE (390×844, DPR 3, touch: the mobile tier),
// with the page's JS throttled 4× over CDP from navigation (a 3–4-year-old phone against this box, _perf-sweep's rule), REAL
// clock (a load is wall time):
//   * playable: navigation → the first frame drawn while 'playing' (the hub starts itself at 'ready': no START screen);
//   * the cost: a 6 s walk with the stick held, the worst frame's draw calls, active meshes, and texture MB (every texture's
//     size × 4 bytes × 1.33 for mips), for the shipped court (one painted texture) and, as the control, perf.veniceSharedCourt 0;
//   * shots (JPG): arriving beside Court 3 (the two-choice walk-up card up) and the cold start at the court gate, looking over the courts.
// Run under the shared browser gate:  /home/user/wt/gate-run.sh 900 npx tsx scripts/probes/venice-hub/hub-rig.mts   (OUT=<dir>)
// SwiftShader rasterises on the CPU and overstates a phone's load: the number is the rig's, the owner's phone is the judge.
import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExe } from '../_chromium.mts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../../..');
const OUT = process.env.OUT ?? '/tmp/venice-v1';
const PORT = Number(process.env.PORT ?? 3741);
const SITE = path.join(OUT, 'site');
fs.mkdirSync(SITE, { recursive: true });
const esbuild = createRequire(path.join(APP, 'package.json'))('esbuild');
await esbuild.build({
  absWorkingDir: APP, entryPoints: [path.join(HERE, 'hub-entry.ts')], bundle: true, minify: true, format: 'iife', platform: 'browser', target: 'es2020',
  tsconfig: path.join(APP, 'tsconfig.json'), define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: 'window.process=window.process||{env:{NODE_ENV:"production"}};' },
  loader: { '.glb': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.wasm': 'dataurl' }, logLevel: 'error', outfile: path.join(SITE, 'hub.js'),
});
fs.writeFileSync(path.join(SITE, 'hub.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;overflow:hidden;background:#000}canvas{width:100%;height:100%;display:block}#card{display:none;position:fixed;left:16px;right:16px;top:16px;padding:12px;border-radius:16px;background:rgba(0,0,0,.75);color:#fff;font:600 16px system-ui}#card .btn{margin-top:8px;padding:12px;border-radius:12px;background:#facc15;color:#000;text-align:center;font-weight:800}</style></head><body><canvas id="c"></canvas><div id="card"></div><script src="hub.js"></script></body></html>`);
console.log('bundle', (fs.statSync(path.join(SITE, 'hub.js')).size / 1e6).toFixed(1), 'MB');

const server = spawn(process.execPath, [path.join(APP, 'scripts/probes/hoops-gap/serve.mjs'), SITE, String(PORT)], { stdio: 'ignore' });
const stop = () => { try { server.kill(); } catch { /* gone */ } };
process.on('exit', stop);
const base = `http://127.0.0.1:${PORT}/hub.html`;
for (let i = 0; i < 40; i++) { try { if ((await fetch(base)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 250)); }

// draws: the engine's counter read at the start of a frame, before the scene renders, holds the LAST frame's draws (the harness's
// instrumentation resets it once per frame). Reading it between frames from the probe gave a running total (1v1 read 1,327).
const STATS = `(async () => { const d = window.__FEL_DEV__; const s = d.scene; const e = s.getEngine(); window.__SI = window.__SI || d.instrument();
  const draws = await new Promise((r) => requestAnimationFrame(() => r(e._drawCalls.current)));
  let tex = 0; for (const t of s.textures) { const z = t.getSize(); tex += z.width * z.height * 4 * (t.noMipmap ? 1 : 1.33); }
  return { draws, active: s.getActiveMeshes().length, textureMb: Math.round(tex / 1e6), textures: s.textures.length, meshes: s.meshes.length }; })()`;
const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const result: Record<string, unknown> = {};
try {
  const runs: Array<[string, string, boolean]> = [
    ['onevone-yardstick', 'mode=onevone', false], ['shared', '', true], ['control-unshared', `feel=${encodeURIComponent(JSON.stringify({ 'perf.veniceSharedCourt': 0 }))}`, false], ['walkup', 'spot=court.flight', true],
  ];
  const pick = (process.env.RUNS ?? '').split(',').filter(Boolean);
  for (const [name, query, shot] of runs) {
    if (pick.length && !pick.includes(name)) continue;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const logs: string[] = [];
    const missing = new Set<string>();
    page.on('response', (r) => { if (r.status() === 404) missing.add(new URL(r.url()).pathname); });
    page.on('console', (m) => { if (logs.length < 400) logs.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE ?? 4) });
    await page.goto(`${base}${query ? `?${query}` : ''}`);
    try {
      await page.waitForFunction(() => { const w = window as unknown as { __ttfp?: number; __err?: string }; return !!w.__ttfp || !!w.__err; }, null, { timeout: Number(process.env.WAIT_MS ?? 240000) });
    } catch {
      const st = await page.evaluate(() => { const w = window as unknown as Record<string, unknown>; return { phase: w.__phase, err: w.__err, readyAt: w.__readyAt }; });
      console.log('TIMEOUT', name, JSON.stringify(st), '\n', errors.join('\n'), '\n', logs.filter((l) => !/^debug/.test(l)).slice(-60).join('\n'));
      throw new Error(`no playable frame: ${JSON.stringify(st)}`);
    }
    const t = await page.evaluate(() => { const w = window as unknown as { __ttfp?: number; __readyAt?: number; __err?: string }; return { ttfpSec: (w.__ttfp ?? 0) / 1000, readySec: (w.__readyAt ?? 0) / 1000, err: w.__err ?? null }; });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    // let the dressing land, then 6 s: walk forward with the stick, then stand. The instrumentation goes in first: it is what resets
    // the engine's draw counter each frame.
    await page.evaluate('window.__SI = window.__SI || window.__FEL_DEV__.instrument()');
    await page.waitForTimeout(4000);
    let worst = { draws: 0, active: 0, textureMb: 0, textures: 0, meshes: 0 };
    if (name !== 'walkup') await page.evaluate(() => (window as unknown as { __bus: { emit(e: unknown): void } }).__bus.emit({ t: 'stick', side: 'L', x: 0, y: 1 }));
    for (let k = 0; k < 30; k++) {
      await page.waitForTimeout(200);
      const s = await page.evaluate(STATS) as typeof worst;
      worst = { draws: Math.max(worst.draws, s.draws), active: Math.max(worst.active, s.active), textureMb: Math.max(worst.textureMb, s.textureMb), textures: Math.max(worst.textures, s.textures), meshes: Math.max(worst.meshes, s.meshes) };
    }
    await page.evaluate(() => (window as unknown as { __bus: { emit(e: unknown): void } }).__bus.emit({ t: 'stick', side: 'L', x: 0, y: 0 }));
    const spot = await page.evaluate(() => (window as unknown as { __spot?: string | null }).__spot ?? null);
    const cardButtons = await page.evaluate(() => [...document.querySelectorAll('#card .btn')].map((el) => el.textContent?.trim() ?? ''));
    // one frame's draws by mesh, and the passes outside the meshes (shadow maps, other render targets, post-processes)
    const split = name === 'onevone-yardstick' ? null : await page.evaluate(`(async () => { const s = window.__FEL_DEV__.scene, e = s.getEngine(); const per = new Map();
      const undo = []; for (const m of s.meshes) { const o = m.render; undo.push([m, o]); m.render = function (...a) { const d0 = e._drawCalls.current; const r = o.apply(this, a); per.set(this.name, (per.get(this.name) || 0) + (e._drawCalls.current - d0)); return r; }; }
      let f0 = 0, f1 = 0; await new Promise((r) => requestAnimationFrame(() => { f0 = e._drawCalls.current; requestAnimationFrame(() => { f1 = e._drawCalls.current; r(); }); }));
      for (const [m, o] of undo) m.render = o;
      const top = [...per.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
      const gens = s.lights.map((l) => l.getShadowGenerator && l.getShadowGenerator()).filter(Boolean).length;
      return { meshDraws: [...per.values()].reduce((a, b) => a + b, 0), top, shadowGens: gens, customRTs: s.customRenderTargets.length, post: s.postProcesses.length, effectLayers: (s.effectLayers || []).length, frameCounter: [f0, f1] }; })()`);
    result[name] = { ...t, worst, spot, cardButtons, split, errors: errors.slice(0, 5), missing: [...missing] };
    if (shot) {
      if (name === 'shared') { await page.reload(); await page.waitForFunction(() => !!(window as unknown as { __ttfp?: number }).__ttfp, null, { timeout: 240000 }); await page.waitForTimeout(5000); }
      const file = path.join(OUT, `venice-v1-${name === 'walkup' ? 'walkup' : 'courts'}-phone.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 85 });
      console.log('wrote', file);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  stop();
}
fs.writeFileSync(path.join(OUT, 'hub-rig.json'), JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
fs.rmSync(SITE, { recursive: true, force: true });
