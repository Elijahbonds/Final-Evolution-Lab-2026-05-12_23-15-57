// hoops-perf: which material builds a shader Effect every frame? (the 3v3 heap profile: StandardMaterial.isReadyForSubMesh →
// engine.createEffect → a NEW Effect's shader processing, ~0.5 MB a game second, from the transparent queue)
//   PAGE=http://127.0.0.1:3383/mode.html MODES=threevthree OUT=<dir> npx tsx scripts/probes/hoops-perf/effect-churn.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { chromiumExe } from '../_chromium.mts';
const PAGE = process.env.PAGE ?? 'http://127.0.0.1:3383/mode.html';
const MODES = (process.env.MODES ?? 'threevthree').split(',');
const OUT = process.env.OUT ?? '/tmp/effect-churn';
fs.mkdirSync(OUT, { recursive: true });
const INIT = `(() => { const realNow = performance.now.bind(performance); let vt = realNow(); const raf = window.requestAnimationFrame.bind(window);
  performance.now = () => vt; let lastTs = -1; window.requestAnimationFrame = (cb) => raf((ts) => { if (ts !== lastTs) { lastTs = ts; vt += 1000 / 60; } cb(vt); });
  let t = 7 >>> 0; Math.random = () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  Date.now = () => 1.7e12; window.__name = window.__name || function (f) { return f; }; })()`;
const WATCH = `(() => {
  const scene = window.__FEL_DEV__.scene; const engine = scene.getEngine(); const R = window.__EC = { calls: 0, fresh: 0, by: {}, frames: 0 };
  const seen = new WeakSet(); let cur = null;
  const orig = engine.createEffect.bind(engine);
  engine.createEffect = function (...a) { const fx = orig(...a); R.calls++; const isNew = !seen.has(fx); if (isNew) { seen.add(fx); R.fresh++; }
    const k = (cur ? cur.mat + ' on ' + cur.mesh : '?') + (isNew ? ' NEW' : ' cached'); R.by[k] = (R.by[k] || 0) + 1; return fx; };
  const patched = new Set();
  for (const m of scene.materials) { const P = Object.getPrototypeOf(m); if (patched.has(P) || typeof P.isReadyForSubMesh !== 'function') continue; patched.add(P);
    const o = P.isReadyForSubMesh; P.isReadyForSubMesh = function (mesh, sub, inst) { const prev = cur; cur = { mat: this.name + '(' + this.getClassName() + ')', mesh: mesh.name }; try { return o.call(this, mesh, sub, inst); } finally { cur = prev; } }; }
  scene.onAfterRenderObservable.add(() => { R.frames++; });
  return 'ok'; })()`;
const b = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
for (const mode of MODES) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript({ content: INIT });
  const p = await ctx.newPage();
  try {
    await p.goto(`${PAGE}?mode=${mode}&perf=off`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    let state = '';
    for (let i = 0; i < 400; i++) { state = await p.evaluate(() => (window as any).__phase ?? ''); if (state === 'playing' || state === 'error') break;
      if (state && state !== 'loading' && i % 4 === 3) await p.evaluate(() => { const bus = (window as any).__bus; bus?.emit({ t: 'button', btn: 'START', pressed: true }); bus?.emit({ t: 'button', btn: 'START', pressed: false }); });
      await p.waitForTimeout(1000); }
    if (state !== 'playing') throw new Error('never played ' + state);
    await p.evaluate(`(() => { const e = window.__FEL_DEV__.scene.getEngine(); e.setHardwareScalingLevel(e.getHardwareScalingLevel() * 4); })()`);
    await p.waitForTimeout(4000);
    await p.evaluate(WATCH);
    await p.waitForTimeout(15000);
    const r = await p.evaluate(() => (window as any).__EC);
    const top = Object.entries(r.by as Record<string, number>).sort((x, y) => y[1] - x[1]).slice(0, 25);
    fs.writeFileSync(path.join(OUT, `effect-churn-${mode}.json`), JSON.stringify({ ...r, top }, null, 1));
    console.log(`[effects] ${mode}: ${r.frames} frames, createEffect ${r.calls} calls, ${r.fresh} new`); for (const [k, v] of top.slice(0, 12)) console.log(`   ${v}  ${k}`);
  } catch (e) { console.log(`[effects] ${mode}: FAILED ${(e as Error).message}`); }
  finally { await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 20000))]); }
}
await Promise.race([b.close(), new Promise((r) => setTimeout(r, 15000))]);
process.exit(0);
