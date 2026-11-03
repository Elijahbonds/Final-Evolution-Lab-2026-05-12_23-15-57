// gameplay-clean phase 2: what does the first frame of play spend its time on? node profile-start.mjs <outDir> <mode,...>
// Boots the rig page (./entry.tsx) like audit.mjs, waits for READY, starts the CDP CPU profiler, presses TAP TO START, and
// stops 4 s of wall time later (or at 90 frames of play). Writes <mode>-<tag>-start.json: the longest frames after START, the
// shader programs linked, and the top self-time and total-time functions of the profile (by url:line, minified names kept).
//   env: PORT=3661 TAG=base FAST=1 (GPU draws skipped, as in the audit)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(new URL('../../../package.json', import.meta.url).pathname);
const { chromium } = require('playwright-core');
const [OUT, MODES_ARG] = process.argv.slice(2);
const PORT = process.env.PORT ?? '3661', TAG = process.env.TAG ?? 'base', FAST = process.env.FAST !== '0';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const INIT = `(() => {
  const realNow = performance.now.bind(performance); window.__realNow = realNow;
  window.__links = []; for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) { if (!C) continue; const lp = C.prototype.linkProgram;
    C.prototype.linkProgram = function (p) { const r = lp.call(this, p); const ph = window.__sessionStore ? window.__sessionStore.view().phase : null; window.__links.push([ph, realNow()]); return r; }; }
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) { if (!C) continue; const gp = C.prototype.getProgramParameter;
    C.prototype.getProgramParameter = function (p, n) { const t = realNow(); const r = gp.call(this, p, n); const ms = realNow() - t; if (ms > 5) (window.__slowParam = window.__slowParam || []).push([window.__sessionStore ? window.__sessionStore.view().phase : null, Math.round(ms)]); return r; }; }
})()`;

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
for (const mode of MODES_ARG.split(',').filter(Boolean)) {
  const row = { mode, tag: TAG };
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript({ content: INIT });
  const p = await ctx.newPage();
  try {
    await p.goto(`http://127.0.0.1:${PORT}/index.html?mode=${mode}&perf=off`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const t0 = Date.now();
    for (;;) { const ph = await p.evaluate(() => window.__sessionStore?.view().phase ?? null); if (ph === 'ready') break; if (Date.now() - t0 > 170000) throw new Error('no READY'); await sleep(400); }
    row.readyS = Math.round((Date.now() - t0) / 100) / 10;
    await p.evaluate((fast) => {
      const dev = window.__FEL_DEV__; const eng = dev.scene.getEngine(); window.__frames = [];
      if (fast) { eng.drawElementsType = () => {}; eng.drawArraysType = () => {}; }
      let fb = 0; eng.onBeginFrameObservable.add(() => { fb = window.__realNow(); });
      eng.onEndFrameObservable.add(() => { const ph = window.__sessionStore.view().phase; if (ph === 'playing' || window.__frames.length) window.__frames.push([ph, Math.round((window.__realNow() - fb) * 10) / 10]); });
    }, FAST);
    await sleep(1500);
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start');
    const linksBefore = await p.evaluate(() => window.__links.length);
    const btn = p.locator('button', { hasText: 'TAP TO START' }).first();
    if (await btn.count()) await btn.click({ timeout: 10000 }).catch(() => {});
    const tS = Date.now();
    while (Date.now() - tS < 25000) { const n = await p.evaluate(() => window.__frames.length); if (n >= 90) break; await sleep(250); }
    const { profile } = await cdp.send('Profiler.stop');
    const fr = await p.evaluate(() => window.__frames);
    row.frames = fr.length; row.topFrames = fr.map((f, i) => [i, f[0], f[1]]).sort((a, c) => c[2] - a[2]).slice(0, 6);
    row.linksAfterStart = (await p.evaluate(() => window.__links.length)) - linksBefore;
    row.slowParam = await p.evaluate(() => (window.__slowParam || []).filter((x) => x[0] === 'playing').slice(0, 20));
    // self and total time per function (url:line:name)
    const byId = new Map(profile.nodes.map((n) => [n.id, n])); const self = new Map();
    const dt = profile.timeDeltas; const counts = new Map();
    profile.samples.forEach((id, i) => counts.set(id, (counts.get(id) || 0) + (dt[i] || 0)));
    const key = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.replace(/^.*\//, '')}:${n.callFrame.lineNumber}`;
    for (const [id, us] of counts) { const n = byId.get(id); const k = key(n); self.set(k, (self.get(k) || 0) + us); }
    const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
    const total = new Map();
    for (const [id, us] of counts) { const seen = new Set(); for (let x = id; x !== undefined; x = parent.get(x)) { const k = key(byId.get(x)); if (seen.has(k)) continue; seen.add(k); total.set(k, (total.get(k) || 0) + us); } }
    const top = (m, n) => [...m].sort((a, c) => c[1] - a[1]).slice(0, n).map(([k, us]) => `${Math.round(us / 1000)} ms ${k}`);
    row.selfTop = top(self, 25); row.totalTop = top(total, 40);
  } catch (e) { row.fail = String(e.message || e).slice(0, 200); }
  fs.writeFileSync(path.join(OUT, `${mode}-${TAG}-start.json`), JSON.stringify(row, null, 1));
  console.log(mode, row.fail ?? `frames ${row.frames} top ${JSON.stringify(row.topFrames?.slice(0, 3))} links ${row.linksAfterStart}`);
  await ctx.close();
}
await b.close();
