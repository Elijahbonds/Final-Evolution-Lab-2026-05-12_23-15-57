// COAST & ISLANDS phone rig (lane/coast-islands, 2026-11-18). Bundles ./zone-entry.ts with esbuild (production; never next dev / build),
// serves it with the hoops-gap static server on this lane's port (3801), and runs it as a PHONE (390×844, DPR 3, touch), the page's
// JS throttled 4× over CDP from navigation (a 3–4-year-old phone against this box: _perf-sweep's rule), real clock:
//   * time until you can move: navigation → the first frame drawn while 'playing' (the zone starts itself at 'ready');
//   * the worst frame: during a scripted walk (throttle back to 1×, as the Venice rig measures), the worst sample of draw calls,
//     active meshes and texture MB (every texture's size × 4 bytes × 1.33 for mips), and the worst frame time (rAF gaps);
//   * the SAME-SESSION CONTROL: the Venice hub (MODES.venice_hub, the shipped place on the same host), the same number of runs, in
//     the same browser, interleaved with the zone's runs;
//   * the STREAMING CONTROL: the zone with coast.streamOn 0 (every piece in full), once;
//   * shots (JPG): arrival on the dock, the beach, Palm Key from the bridge — from the first zone run's walk.
// Run under the shared browser gate:  /home/user/wt/gate-run.sh 1500 npx tsx scripts/probes/coast-islands/zone-rig.mts   (OUT=<dir> RUNS=3)
// SwiftShader rasterises on the CPU and overstates a phone's load: the numbers are the rig's; the comparison with the control is the
// point; the owner's phone is the judge.
import { chromium, type Page } from 'playwright-core';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExe } from '../_chromium.mts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../../..');
const OUT = process.env.OUT ?? '/tmp/coast-islands';
const PORT = Number(process.env.PORT ?? 3801);
const N = Number(process.env.RUNS ?? 3);
const SITE = path.join(OUT, 'site');
fs.mkdirSync(SITE, { recursive: true });
const esbuild = createRequire(path.join(APP, 'package.json'))('esbuild');
await esbuild.build({
  absWorkingDir: APP, entryPoints: [path.join(HERE, 'zone-entry.ts')], bundle: true, minify: true, format: 'iife', platform: 'browser', target: 'es2020',
  tsconfig: path.join(APP, 'tsconfig.json'), define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: 'window.process=window.process||{env:{NODE_ENV:"production"}};' },
  loader: { '.glb': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.wasm': 'dataurl' }, logLevel: 'error', outfile: path.join(SITE, 'zone.js'),
});
fs.writeFileSync(path.join(SITE, 'zone.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;overflow:hidden;background:#000}canvas{width:100%;height:100%;display:block}#card{display:none;position:fixed;left:16px;right:16px;top:16px;padding:12px;border-radius:16px;background:rgba(0,0,0,.75);color:#fff;font:600 16px system-ui}#card .btn{margin-top:8px;padding:12px;border-radius:12px;background:#facc15;color:#000;text-align:center;font-weight:800}</style></head><body><canvas id="c"></canvas><div id="card"></div><script src="zone.js"></script></body></html>`);
console.log('bundle', (fs.statSync(path.join(SITE, 'zone.js')).size / 1e6).toFixed(1), 'MB');

const server = spawn(process.execPath, [path.join(APP, 'scripts/probes/hoops-gap/serve.mjs'), SITE, String(PORT)], { stdio: 'ignore' });
const stop = () => { try { server.kill(); } catch { /* gone */ } };
process.on('exit', stop);
const base = `http://127.0.0.1:${PORT}/zone.html`;
for (let i = 0; i < 40; i++) { try { if ((await fetch(base)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 250)); }

const STATS = `(async () => { const d = window.__FEL_DEV__; const s = d.scene; const e = s.getEngine(); window.__SI = window.__SI || d.instrument();
  const draws = await new Promise((r) => requestAnimationFrame(() => r(e._drawCalls.current)));
  let tex = 0; for (const t of s.textures) { const z = t.getSize(); tex += z.width * z.height * 4 * (t.noMipmap ? 1 : 1.33); }
  const c = window.__coast && window.__coast();
  return { draws, active: s.getActiveMeshes().length, textureMb: Math.round(tex / 1e6), textures: s.textures.length, meshes: s.meshes.length, coast: c }; })()`;
type Worst = { draws: number; active: number; textureMb: number; textures: number; meshes: number };

/** Steer the player toward (x, z): the stick is read in the camera's yaw at the press (the mapper latches it), so re-aim each second.
 *  The bus's stick y is DOWN-positive (host/inputMap: forward is y −1); x is to the right. */
async function walkTo(page: Page, x: number, z: number, maxSec: number, sample: (k: number) => Promise<void>): Promise<boolean> {
  const t0 = Date.now();
  let k = 0;
  while ((Date.now() - t0) / 1000 < maxSec) {
    const done = await page.evaluate(`(() => { const c = window.__coast(); const cam = window.__FEL_DEV__.scene.activeCamera; const f = cam.getForwardRay().direction;
      const dx = ${x} - c.x, dz = ${z} - c.z, L = Math.hypot(dx, dz); if (L < 3) { window.__bus.emit({ t: 'stick', side: 'L', x: 0, y: 0 }); return true; }
      const fl = Math.hypot(f.x, f.z) || 1, fx = f.x / fl, fz = f.z / fl;   // camera forward on the ground; right = (fz, -fx)
      const ux = dx / L, uz = dz / L; window.__bus.emit({ t: 'stick', side: 'L', x: 0, y: 0 });
      setTimeout(() => window.__bus.emit({ t: 'stick', side: 'L', x: ux * fz - uz * fx, y: -(ux * fx + uz * fz) }), 30); return false; })()`) as boolean;
    if (done) return true;
    for (let i = 0; i < 4; i++) { await page.waitForTimeout(250); await sample(k++); }
  }
  await page.evaluate(() => (window as unknown as { __bus: { emit(e: unknown): void } }).__bus.emit({ t: 'stick', side: 'L', x: 0, y: 0 }));
  return false;
}

const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const result: Record<string, unknown> = {};
try {
  // interleaved: zone, control, zone, control, … then the streaming control once
  const runs: Array<[string, string]> = [];
  for (let i = 0; i < N; i++) { runs.push([`coast-${i + 1}`, '']); runs.push([`venice-control-${i + 1}`, 'mode=venice_hub']); }
  runs.push(['coast-nostream', `feel=${encodeURIComponent(JSON.stringify({ 'coast.streamOn': 0 }))}`]);
  const pick = (process.env.ONLY ?? '').split(',').filter(Boolean);
  for (const [name, query] of runs) {
    if (pick.length && !pick.some((p) => name.startsWith(p))) continue;
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
      result[name] = { timeout: true, st };
      await ctx.close();
      continue;
    }
    const t = await page.evaluate(() => { const w = window as unknown as { __ttfp?: number; __readyAt?: number; __err?: string }; return { moveSec: (w.__ttfp ?? 0) / 1000, readySec: (w.__readyAt ?? 0) / 1000, err: w.__err ?? null }; });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await page.evaluate('window.__SI = window.__SI || window.__FEL_DEV__.instrument()');
    // frame gaps, from here on
    await page.evaluate(`(() => { window.__gaps = []; let last = performance.now(); function tick() { const n = performance.now(); window.__gaps.push(n - last); last = n; requestAnimationFrame(tick); } requestAnimationFrame(tick); })()`);
    await page.waitForTimeout(5000);   // let the dressing land
    const isCoast = !query.includes('venice_hub');
    const first = name === 'coast-1';
    const shot = async (label: string) => { if (!first) return; const file = path.join(OUT, `coast-${label}-phone.jpg`); await page.screenshot({ path: file, type: 'jpeg', quality: 85 }); console.log('wrote', file); };
    await shot('arrival');
    let worst: Worst = { draws: 0, active: 0, textureMb: 0, textures: 0, meshes: 0 };
    const pieces: string[] = [];
    let streamMax = { fine: 0, props: 0 };
    const sample = async () => {
      const s = await page.evaluate(STATS) as Worst & { coast?: { piece: string; view: { fineMeshes: number; props: number } } };
      worst = { draws: Math.max(worst.draws, s.draws), active: Math.max(worst.active, s.active), textureMb: Math.max(worst.textureMb, s.textureMb), textures: Math.max(worst.textures, s.textures), meshes: Math.max(worst.meshes, s.meshes) };
      if (s.coast) { if (pieces[pieces.length - 1] !== s.coast.piece) pieces.push(s.coast.piece); streamMax = { fine: Math.max(streamMax.fine, s.coast.view.fineMeshes), props: Math.max(streamMax.props, s.coast.view.props) }; }
    };
    const legs: Record<string, boolean> = {};
    if (isCoast) {
      // the walk: off the dock to the beach, down the beach to the bridge, over the bridge onto Palm Key (crosses four pieces)
      legs.beach = await walkTo(page, 92, 24, 25, sample);
      legs.beachSouth = await walkTo(page, 72, -30, 25, sample);
      await shot('beach');
      legs.bridgeEast = await walkTo(page, 66, -36, 15, sample);
      legs.bridgeMid = await walkTo(page, 20, -36, 25, sample);
      await shot('island');
      legs.palmKey = await walkTo(page, -24, -36, 20, sample);
    } else {
      await page.evaluate(() => (window as unknown as { __bus: { emit(e: unknown): void } }).__bus.emit({ t: 'stick', side: 'L', x: 0, y: -1 }));   // forward (the bus's y is down-positive)
      for (let k = 0; k < 40; k++) { await page.waitForTimeout(250); await sample(); }
      await page.evaluate(() => (window as unknown as { __bus: { emit(e: unknown): void } }).__bus.emit({ t: 'stick', side: 'L', x: 0, y: 0 }));
    }
    const gaps = await page.evaluate(() => (window as unknown as { __gaps: number[] }).__gaps.slice(5));
    gaps.sort((a, b) => a - b);
    const frameMs = { worst: Math.round(gaps[gaps.length - 1] ?? 0), p95: Math.round(gaps[Math.floor(gaps.length * 0.95)] ?? 0), p50: Math.round(gaps[Math.floor(gaps.length * 0.5)] ?? 0), frames: gaps.length };
    const end = await page.evaluate('window.__coast ? window.__coast() : null');
    result[name] = { ...t, worst, frameMs, legs, pieces, streamMax, end, errors: errors.slice(0, 5), missing: [...missing] };
    console.log(name, JSON.stringify(result[name]));
    await ctx.close();
  }
} finally {
  await browser.close();
  stop();
}
fs.writeFileSync(path.join(OUT, 'zone-rig.json'), JSON.stringify(result, null, 1));
fs.rmSync(SITE, { recursive: true, force: true });
