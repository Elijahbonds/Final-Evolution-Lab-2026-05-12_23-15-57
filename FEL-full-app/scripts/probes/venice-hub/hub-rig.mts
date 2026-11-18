// VENICE V1 phone rig (lane/venice-v1, 2026-11-17). Bundles ./hub-entry.ts with esbuild (production; never next dev / build),
// serves it with the hoops-gap static server on this lane's port (3741), and as a PHONE (390×844, DPR 3, touch: the mobile tier),
// with the page's JS throttled 4× over CDP from navigation (a 3–4-year-old phone against this box, _perf-sweep's rule), REAL
// clock (a load is wall time):
//   * playable: navigation → the first frame drawn while 'playing' (the hub starts itself at 'ready': no START screen);
//   * the cost: a 6 s walk with the stick held, the worst frame's draw calls, active meshes, and texture MB (every texture's
//     size × 4 bytes × 1.33 for mips), for the shipped court (one painted texture) and, as the control, perf.veniceSharedCourt 0;
//   * shots (JPG): arriving beside Court 1 (the walk-up card up) and the cold start at the court gate, looking over the courts.
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
  const am = s.getActiveMeshes(); const sk = new Set(); for (let i = 0; i < am.length; i++) { const m = am.data[i]; if (m.skeleton && !m.bakedVertexAnimationManager) sk.add(m.skeleton.uniqueId); }
  return { draws, active: am.length, textureMb: Math.round(tex / 1e6), textures: s.textures.length, meshes: s.meshes.length, skinned: sk.size }; })()`;
// a stalled page (no animation frame: the 1v1 yardstick once held the rig 11 min on a rAF that never came) must not hang the rig
const RUN_MS = Number(process.env.RUN_MS ?? 420000);
const within = <T,>(p: Promise<T>, ms: number, what: string): Promise<T> => Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error(`${what}: no answer in ${ms} ms`)), ms))]);
const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const result: Record<string, unknown> = {};
try {
  const feelQ = (o: Record<string, number>) => `feel=${encodeURIComponent(JSON.stringify(o))}`;
  const QUIET = { 'venue.veniceLife': 0, 'venue.veniceSound': 0 };
  const runs: Array<[string, string, boolean]> = [
    // improvement pass phase 3: the load before (V1: everything during the load) and after (the paint and far scenery once you can move)
    // (both on V1's look, so only the deferral differs: venue.veniceLookV2 0)
    // (phases 6 and 7 off in phases 3 and 5's runs, so each compares one change)
    ['v1-load', feelQ({ 'venue.deferScenery': 0, 'venue.veniceLookV2': 0, ...QUIET }), false], ['deferred', feelQ({ 'venue.veniceLookV2': 0, ...QUIET }), false],
    // improvement pass phase 5: the look before (V1) and after, on the phone; their shots
    ['look-v1', feelQ({ 'venue.veniceLookV2': 0, ...QUIET }), true], ['look-v2', feelQ(QUIET), true],
    // improvement pass phase 6: life off / on (everything else as shipped), and on a desktop (the watchers: desktop and up only)
    // (beside Court 2, looking across it at the run's watchers and west toward the gulls)
    ['life-off', `spot=court.run&${feelQ({ 'venue.veniceLife': 0 })}`, false], ['life', 'spot=court.run', true], ['desktop-life', 'spot=court.run', true],
    // V2 phase 1: a phone's watchers off (gulls only) / on, at the run (the worst view: all of them in front of the camera)
    ['watch-gulls', `spot=court.run&${feelQ({ 'venue.venicePhoneWatchers': 0 })}`, false], ['watch-phone', 'spot=court.run', true],
    // V2 phase 2: court life off / on, arriving beside Court 4 (the phone's shooter, in front of the camera) and on a desktop
    ['life-courtoff', `spot=court.arc&${feelQ({ 'venue.veniceCourtLife': 0 })}`, false], ['life-court', 'spot=court.arc', true], ['desktop-court', 'spot=court.arc', true],
    // the cold start with everything on (the row's worst view in the pass: 45 / 58 / 73)
    ['life-gate', '', true],
    // the gate's controls: court life off (the watchers alone), and court life and phone watchers off (the pass's gulls only)
    ['life-gate-nocourt', feelQ({ 'venue.veniceCourtLife': 0 }), false], ['life-gate-gulls', feelQ({ 'venue.veniceCourtLife': 0, 'venue.venicePhoneWatchers': 0 }), false],
    // the same-session yardstick (1v1's load on the same rig), last in each round so a stall there cannot hold the hub's runs
    ['onevone-yardstick', 'mode=onevone', false],
    ['shared', '', true], ['control-unshared', `feel=${encodeURIComponent(JSON.stringify({ 'perf.veniceSharedCourt': 0 }))}`, false], ['walkup', 'spot=court.ones', true],
    // the final picture set: each court's walk-up (arriving beside it, the card up)
    ['walkup-run', 'spot=court.run', true], ['walkup-flight', 'spot=court.flight', true], ['walkup-arc', 'spot=court.arc', true],
  ];
  const pick = (process.env.RUNS ?? '').split(',').filter(Boolean);
  const reps = Math.max(1, Number(process.env.REPS ?? 1));
  const order: Array<[string, string, boolean, number]> = [];
  // (a desktop run is a picture, not a timing: once)
  for (let r = 1; r <= reps; r++) for (const [n, q, sh] of runs) if ((!pick.length || pick.includes(n)) && !(r > 1 && n.startsWith('desktop-'))) order.push([n, q, sh && r === 1, r]);
  for (const [name0, query, shot, rep] of order) {
    const name = reps > 1 ? `${name0}#${rep}` : name0;
    console.log(`run ${name}`);
    const desk = name0.startsWith('desktop-');
    const ctx = await browser.newContext(desk ? { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 } : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    // a run that stalls (a page that stops answering) is closed after RUN_MS and recorded as failed; the next run goes on
    const watchdog = setTimeout(() => { console.log(`run ${name}: watchdog after ${RUN_MS / 1000} s`); void ctx.close().catch(() => {}); }, RUN_MS);
    try {
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      const logs: string[] = [];
      const missing = new Set<string>();
      page.on('response', (r) => { if (r.status() === 404) missing.add(new URL(r.url()).pathname); });
      page.on('console', (m) => { if (logs.length < 400) logs.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
    // the deferred scenery's landing (and phase 6's life after it) as page flags the rig can wait on
    await page.addInitScript(() => { const o = console.info.bind(console); console.info = (...a: unknown[]) => { const t = String(a[0] ?? ''); if (/deferred scenery landed/.test(t)) (window as unknown as { __landed?: boolean }).__landed = true; if (/\[VENICE\] life:/.test(t)) (window as unknown as { __life?: boolean }).__life = true; if (/\[VENICE\] court life:/.test(t)) (window as unknown as { __court?: boolean }).__court = true; o(...a); }; });
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: desk ? 1 : Number(process.env.THROTTLE ?? 4) });
      await page.goto(`${base}${query ? `?${query}` : ''}`, { waitUntil: 'commit', timeout: 180000 });
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
      // V2: a life run is measured once the life is in the scene (it lands after the deferred scenery), else a stand-still at landing
      if (/^(life|watch|desktop-)/.test(name)) {
        const landed = await page.waitForFunction(() => (window as unknown as { __life?: boolean }).__life === true, null, { timeout: 150000 }).then(() => true).catch(() => false);
        if (!landed) console.log(`run ${name}: life never landed (measured without it)`);
        if (!/courtoff|nocourt|gulls|^watch|desktop-life/.test(name)) await page.waitForFunction(() => (window as unknown as { __court?: boolean }).__court === true, null, { timeout: 120000 }).catch(() => console.log(`run ${name}: court life never landed`));
        await page.waitForTimeout(3000);   // the crowd's bake + its first frames
      }
      let worst = { draws: 0, active: 0, textureMb: 0, textures: 0, meshes: 0, skinned: 0 };
      if (!name.startsWith('walkup')) await page.evaluate(() => (window as unknown as { __bus: { emit(e: unknown): void } }).__bus.emit({ t: 'stick', side: 'L', x: 0, y: 1 }));
      for (let k = 0; k < 30; k++) {
        await page.waitForTimeout(200);
        // a desktop run is a picture: a stalled stats read on the shared box skips the numbers, not the shot
        let s: typeof worst;
        try { s = await within(page.evaluate(STATS), 15000, 'stats') as typeof worst; } catch (e) { if (desk) { console.log(`run ${name}: stats skipped (${(e as Error).message})`); break; } throw e; }
        worst = { draws: Math.max(worst.draws, s.draws), active: Math.max(worst.active, s.active), textureMb: Math.max(worst.textureMb, s.textureMb), textures: Math.max(worst.textures, s.textures), meshes: Math.max(worst.meshes, s.meshes), skinned: Math.max(worst.skinned, s.skinned) };
      }
      await page.evaluate(() => (window as unknown as { __bus: { emit(e: unknown): void } }).__bus.emit({ t: 'stick', side: 'L', x: 0, y: 0 }));
      const spot = await page.evaluate(() => (window as unknown as { __spot?: string | null }).__spot ?? null);
      // one frame's draws by mesh, and the passes outside the meshes (shadow maps, other render targets, post-processes)
      const split = name.startsWith('onevone') ? null : await page.evaluate(`(async () => { const s = window.__FEL_DEV__.scene, e = s.getEngine(); const per = new Map();
        const undo = []; for (const m of s.meshes) { const o = m.render; undo.push([m, o]); m.render = function (...a) { const d0 = e._drawCalls.current; const r = o.apply(this, a); per.set(this.name, (per.get(this.name) || 0) + (e._drawCalls.current - d0)); return r; }; }
        let f0 = 0, f1 = 0; await new Promise((r) => requestAnimationFrame(() => { f0 = e._drawCalls.current; requestAnimationFrame(() => { f1 = e._drawCalls.current; r(); }); }));
        for (const [m, o] of undo) m.render = o;
        const top = [...per.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
        const gens = s.lights.map((l) => l.getShadowGenerator && l.getShadowGenerator()).filter(Boolean).length;
        return { meshDraws: [...per.values()].reduce((a, b) => a + b, 0), top, shadowGens: gens, customRTs: s.customRenderTargets.length, post: s.postProcesses.length, effectLayers: (s.effectLayers || []).length, frameCounter: [f0, f1] }; })()`);
      result[name] = { ...t, worst, spot, split, errors: errors.slice(0, 5), missing: [...missing], notes: logs.filter((l) => /crowd|venice|life/i.test(l)).slice(-12) };
      // phase 3's "full": when the deferred paint and far scenery landed (ms after the playable frame's run went on), if it did
      if (query.includes('deferScenery%22%3A0')) (result[name] as Record<string, unknown>).fullSec = t.ttfpSec;
      else {
        try { await page.waitForFunction(() => (window as unknown as { __landed?: boolean }).__landed === true, null, { timeout: 120000 }); } catch { /* not landed in 2 min */ }
        const m = logs.map((l) => /deferred scenery landed in (\d+) ms/.exec(l)).find(Boolean);
        (result[name] as Record<string, unknown>).landedMs = m ? Number(m[1]) : null;
      }
      if (shot) {
        if (name.startsWith('shared') || name.startsWith('look-') || /^(life|watch)/.test(name) || desk) { await page.reload(); await page.waitForFunction(() => !!(window as unknown as { __ttfp?: number }).__ttfp, null, { timeout: 240000 }); if (/^(life|watch)/.test(name) || desk) await page.waitForFunction(() => (window as unknown as { __life?: boolean }).__life === true, null, { timeout: 150000 }).catch(() => {}); await page.waitForTimeout(4000); }
        const tag = name.startsWith('walkup') ? name0 : /^(look-|life|watch)/.test(name) || desk ? name.split('#')[0] : 'courts';
        const file = path.join(OUT, `venice-v1-${tag}${desk ? '' : '-phone'}.jpg`);
        await page.screenshot({ path: file, type: 'jpeg', quality: 85 });
        console.log('wrote', file);
      }
    } catch (e) { clearTimeout(watchdog); result[name] = { error: String((e as Error).message ?? e).slice(0, 300) }; console.log(`run ${name} FAILED: ${(result[name] as { error: string }).error}`); }
    clearTimeout(watchdog);
    await ctx.close().catch(() => {});
    fs.writeFileSync(path.join(OUT, 'hub-rig.json'), JSON.stringify(result, null, 1));   // after every run: a killed rig keeps what it measured
  }
} finally {
  await browser.close();
  stop();
}
fs.writeFileSync(path.join(OUT, 'hub-rig.json'), JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
fs.rmSync(SITE, { recursive: true, force: true });
