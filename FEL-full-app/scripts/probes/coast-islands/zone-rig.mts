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
  const bodies = s.skeletons.length;
  let tex = 0; for (const t of s.textures) { const z = t.getSize(); tex += z.width * z.height * 4 * (t.noMipmap ? 1 : 1.33); }
  const c = window.__coast && window.__coast();
  return { draws, active: s.getActiveMeshes().length, textureMb: Math.round(tex / 1e6), textures: s.textures.length, meshes: s.meshes.length, bodies, coast: c }; })()`;
type Worst = { draws: number; active: number; textureMb: number; textures: number; meshes: number; bodies?: number };

/** Run the player toward (x, z) with the mode's probe driver (CoastZoneMode coastProbeDrive: the move held forward, the yaw on the
 *  target, as the headless test walks the host), sampling every 250 ms. True when it got within 3 m. */
async function walkTo(page: Page, x: number, z: number, maxSec: number, sample: (k: number) => Promise<void>, near = 3): Promise<boolean> {
  const t0 = Date.now();
  let k = 0;
  await page.evaluate(`window.__drive({ x: ${x}, z: ${z} })`);
  try {
    while ((Date.now() - t0) / 1000 < maxSec) {
      const d = await page.evaluate(`(() => { const c = window.__coast(); return Math.hypot(${x} - c.x, ${z} - c.z); })()`) as number;
      if (d < near) return true;
      await page.waitForTimeout(500); if (k % 2 === 0) await sample(k); k++;   // the rig draws a few frames a second: sample lightly
    }
    return false;
  } finally { await page.evaluate('window.__drive(null)'); }
}

const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const result: Record<string, unknown> = {};
try {
  // interleaved: zone, control, zone, control, … then the streaming control once
  const runs: Array<[string, string]> = [];
  // CONTROL=phaseA (phase B's measurement): the zone against itself with the partner and the creatures off (= phase A), same session
  const phaseA = `feel=${encodeURIComponent(JSON.stringify({ 'coast.partnerOn': 0, 'coast.creaturesOn': 0 }))}`;
  // CONTROL=phaseB (phase D's measurement): the zone with the town, the sports spots and the quests off (= phase B), same session
  const phaseB = `feel=${encodeURIComponent(JSON.stringify({ 'coast.townOn': 0, 'coast.sportsOn': 0, 'coast.questsOn': 0 }))}`;
  for (let i = 0; i < N; i++) {
    runs.push([`coast-${i + 1}`, '']);
    if (process.env.CONTROL === 'phaseA') runs.push([`phaseA-control-${i + 1}`, phaseA]);
    else if (process.env.CONTROL === 'phaseB') runs.push([`phaseB-control-${i + 1}`, phaseB]);
    else runs.push([`venice-control-${i + 1}`, 'mode=venice_hub']);
  }
  if (!process.env.CONTROL) runs.push(['coast-nostream', `feel=${encodeURIComponent(JSON.stringify({ 'coast.streamOn': 0 }))}`]);
  // VARIANTS='name={"knob":v};name2={...}': these zone runs instead (a diagnosis: which part of a change does what)
  if (process.env.VARIANTS) {
    runs.length = 0;
    for (const v of process.env.VARIANTS.split(';').filter(Boolean)) { const i = v.indexOf('='); runs.push([`coast-${v.slice(0, i)}`, `feel=${encodeURIComponent(v.slice(i + 1))}`]); }
  }
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
    // a navigation after load is a finding (coast-d d2: the page navigated in the first zone run): note when and why
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) logs.push(`NAV ${f.url()} at ${new Date().toISOString()}`); });
    page.on('crash', () => logs.push(`PAGE CRASH at ${new Date().toISOString()}`));
    page.on('close', () => logs.push(`PAGE CLOSE at ${new Date().toISOString()}`));
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Inspector.enable').catch(() => {});
    cdp.on('Inspector.targetCrashed', () => logs.push(`TARGET CRASHED at ${new Date().toISOString()}`));
    cdp.on('Inspector.detached', (e: { reason: string }) => logs.push(`INSPECTOR DETACHED ${e.reason} at ${new Date().toISOString()}`));
    await cdp.send('Runtime.enable').catch(() => {});
    cdp.on('Runtime.executionContextDestroyed', (e: { executionContextId: number }) => logs.push(`CONTEXT DESTROYED ${e.executionContextId} at ${new Date().toISOString()}`));
    cdp.on('Runtime.executionContextCreated', (e: { context: { id: number; origin: string; auxData?: { isDefault?: boolean } } }) => logs.push(`CONTEXT CREATED ${e.context.id} ${e.context.origin} default=${e.context.auxData?.isDefault} at ${new Date().toISOString()}`));
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
    try {
    const t = await page.evaluate(() => { const w = window as unknown as { __ttfp?: number; __readyAt?: number; __err?: string }; return { moveSec: (w.__ttfp ?? 0) / 1000, readySec: (w.__readyAt ?? 0) / 1000, err: w.__err ?? null }; });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    // returns nothing: the instrument object itself is a graph of the live scene, and handing it back to the rig to serialise
    // failed ("execution context was destroyed") once the town's bodies were loading as play began (coast-d d2, d3)
    await page.evaluate('void (window.__SI = window.__SI || window.__FEL_DEV__.instrument())');
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
    const gaps2: number[] = [];
    const sample = async () => {
      const s = await page.evaluate(STATS) as Worst & { coast?: { piece: string; view: { fineMeshes: number; props: number } } };
      worst = { draws: Math.max(worst.draws, s.draws), active: Math.max(worst.active, s.active), textureMb: Math.max(worst.textureMb, s.textureMb), textures: Math.max(worst.textures, s.textures), meshes: Math.max(worst.meshes, s.meshes), bodies: Math.max(worst.bodies ?? 0, s.bodies ?? 0) };
      if (s.coast) { if (pieces[pieces.length - 1] !== s.coast.piece) pieces.push(s.coast.piece); streamMax = { fine: Math.max(streamMax.fine, s.coast.view.fineMeshes), props: Math.max(streamMax.props, s.coast.view.props) }; if (s.coast.partner) gaps2.push(s.coast.partner.gap); }
    };
    const legs: Record<string, boolean> = {};
    if (isCoast) {
      // the walk: off the dock to the beach, past the Shellhopper (a sighting), down the beach to the bridge, over the bridge onto
      // Palm Key (crosses four pieces)
      legs.beach = await walkTo(page, 92, 24, 120, sample);
      // phase D: up the town's street (the houses on the right, the market on the left), to Pip (a townsperson's card), then
      // back to the beach and down to the volleyball net (a sports spot's card). The control (town off) walks the same legs.
      legs.street = await walkTo(page, 104, 24, 60, sample);
      await page.waitForTimeout(800);
      await shot('town');
      legs.person = await walkTo(page, 112, 21, 40, sample, 1);
      await page.waitForTimeout(800);
      await shot('person');
      legs.backToBeach = await walkTo(page, 92, 18, 60, sample);
      legs.creature = await walkTo(page, 84, 13, 60, sample);
      await page.waitForTimeout(600);
      await shot('sighting');
      legs.volley = await walkTo(page, 88.5, -20, 120, sample, 1.2);
      await page.waitForTimeout(800);
      await shot('sport');
      legs.beachSouth = await walkTo(page, 72, -30, 150, sample);
      // the partner follows behind you, where the chase camera is: stand a moment (it settles into its slot behind and to the
      // right), then swing the camera round to the right with the look stick so both are in the picture
      await page.waitForTimeout(2500);
      await page.evaluate(`window.__bus.emit({ t: 'stick', side: 'R', x: 0.8, y: 0 })`);
      await page.waitForTimeout(900);
      await page.evaluate(`window.__bus.emit({ t: 'stick', side: 'R', x: 0, y: 0 })`);
      await page.waitForTimeout(500);
      await shot('beach');
      // onto the bridge's middle line first (within 1 m): from the volleyball net the walk reaches the beach's south end at another
      // angle, and a 3 m tolerance left it on a line along the bridge's edge, off the deck into the shallows (coast-d d1: both sides)
      legs.bridgeEast = await walkTo(page, 68, -36, 60, sample, 1);
      legs.bridgeMid = await walkTo(page, 20, -36, 150, sample);
      await shot('island');
      legs.palmKey = await walkTo(page, -24, -36, 150, sample);
    } else {
      await page.evaluate(() => (window as unknown as { __bus: { emit(e: unknown): void } }).__bus.emit({ t: 'stick', side: 'L', x: 0, y: -1 }));   // forward (the bus's y is down-positive)
      for (let k = 0; k < 40; k++) { await page.waitForTimeout(250); await sample(); }
      await page.evaluate(() => (window as unknown as { __bus: { emit(e: unknown): void } }).__bus.emit({ t: 'stick', side: 'L', x: 0, y: 0 }));
    }
    const gaps = await page.evaluate(() => (window as unknown as { __gaps: number[] }).__gaps.slice(5));
    gaps.sort((a, b) => a - b);
    const frameMs = { worst: Math.round(gaps[gaps.length - 1] ?? 0), p95: Math.round(gaps[Math.floor(gaps.length * 0.95)] ?? 0), p50: Math.round(gaps[Math.floor(gaps.length * 0.5)] ?? 0), frames: gaps.length };
    const end = await page.evaluate('window.__coast ? window.__coast() : null');
    gaps2.sort((a, b) => a - b);
    const partnerGap = gaps2.length ? { mean: +(gaps2.reduce((a, b) => a + b, 0) / gaps2.length).toFixed(1), p95: +gaps2[Math.floor(gaps2.length * 0.95)].toFixed(1), max: +gaps2[gaps2.length - 1].toFixed(1) } : null;
    const log = await page.evaluate('window.__log ?? null');
    const spotsSeen = await page.evaluate('window.__spotsSeen ?? null');
    result[name] = { ...t, worst, frameMs, legs, pieces, streamMax, partnerGap, log, spotsSeen, end, errors: errors.slice(0, 5), missing: [...missing] };
    console.log(name, JSON.stringify(result[name]));
    } catch (e) {
      // what is there now: a fresh page (a reload) or none (a crash)?
      const after = await page.evaluate('({ href: location.href, phase: window.__phase ?? null, ttfp: window.__ttfp ?? null, t: performance.now() })').catch((x) => String(x).slice(0, 160));
      logs.push(`AFTER ${new Date().toISOString()} ${JSON.stringify(after)}`);
      console.log('RUN FAILED', name, String(e).slice(0, 300), '\n', String((e as Error)?.stack ?? '').split('\n').filter((l) => l.includes('zone-rig')).slice(0, 4).join(' | '), '\n', errors.join('\n'), '\n', logs.filter((l) => !/^debug/.test(l)).slice(-80).join('\n'));
      result[name] = { failed: String(e).slice(0, 300) };
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  stop();
}
fs.writeFileSync(path.join(OUT, 'zone-rig.json'), JSON.stringify(result, null, 1));
fs.rmSync(SITE, { recursive: true, force: true });
