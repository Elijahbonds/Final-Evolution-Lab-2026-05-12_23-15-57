// improve-hoops phase 3 (lane/improve-hoops, 2026-11-22): where a hoops load's time goes, on the phone tier.
//
//   node loadprof.mjs <outDir> <tag> <mode,mode,...>
//   env: PORT=3881 HOST=127.0.0.1 (the site, scripts/probes/gameplay-clean/serve.mjs: one port, a site per host name, so a before
//        build and an after build are measured in one gate hold) QS='&playtest=1&feel=hoops.loadDeferExtras:0' (a knob A/B: the
//        rig's entry puts the overrides where the feel panel keeps them) PROFILE=1 (a CDP CPU profile of the whole load: top self
//        and total time by function; build the site with --nominify for readable names) TIER=phone|desktop PLAY_MS=4000
//
// The rig page is scripts/probes/gameplay-clean/entry.tsx: the real /play/<route> loader (GameShell, the host, the boot splash)
// with Next's server pieces stubbed. Phone tier as in docs/IMPROVE-10-PHASE-AUDIT.md §1: 390 × 844, touch, DPR 3, CPU slowed 4×.
//
// Per mode it writes <tag>-<mode>.json: the time to READY (the boot splash's phase, from navigation), the harness's and the
// mode's [FEL-LOAD] marks (lib/babylon/core/loadMarks.ts), the pre-warm's own line, the GLB fetches (start, duration, bytes),
// the long tasks inside the load (their sum: the main thread busy), then the start tap and the worst frame in the first
// PLAY_MS of play. SwiftShader draws on the CPU: absolute seconds are an upper bound on a phone; read them against the control.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(new URL('../../../package.json', import.meta.url).pathname);
const { chromium } = require('playwright-core');

const [OUT, TAG, MODES_ARG] = process.argv.slice(2);
if (!OUT || !TAG || !MODES_ARG) { console.error('usage: node loadprof.mjs <outDir> <tag> <mode,...>'); process.exit(2); }
const PORT = process.env.PORT ?? '3881', HOST = process.env.HOST ?? '127.0.0.1', QS = process.env.QS ?? '';
const PROFILE = process.env.PROFILE === '1', TIER = process.env.TIER ?? 'phone', PLAY_MS = Number(process.env.PLAY_MS ?? 4000);
const phone = TIER === 'phone';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const INIT = `(() => {
  const w = window; w.__lp = { long: [], frames: null };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__lp.long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch {}
  w.__lpRaf = (ms) => new Promise((res) => { const out = []; let last = performance.now(); const t0 = last;
    const f = (t) => { out.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else res(out); }; requestAnimationFrame(f); });
})();`;

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
for (const mode of MODES_ARG.split(',').filter(Boolean)) {
  const row = { mode, tag: TAG, tier: TIER, qs: QS, host: HOST };
  const ctx = await b.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript({ content: INIT });
  const p = await ctx.newPage();
  const log = []; const errors = [];
  p.on('console', (m) => { const t = m.text(); if (/FEL-LOAD|FEL-PERF|pre-warm|FEL-CHAR|load failed|timed out/.test(t) && log.length < 120) log.push(t.slice(0, 220)); });
  p.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  const cdp = await ctx.newCDPSession(p);
  if (phone) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  if (PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start'); }
  try {
    const t0 = Date.now();
    await p.goto(`http://${HOST}:${PORT}/index.html?mode=${mode}${QS}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    let ph = null;
    for (;;) { ph = await p.evaluate(() => window.__sessionStore?.view().phase ?? null).catch(() => null); if (ph === 'ready' || ph === 'error') break; if (Date.now() - t0 > 240000) throw new Error('no READY in 240 s'); await sleep(250); }
    row.phase = ph;
    row.readyWallS = Math.round((Date.now() - t0) / 100) / 10;
    const at = await p.evaluate(() => ({
      now: performance.now(),
      marks: (window.__felLoadMarks ?? []).map((m) => [m.stage, Math.round(m.dt), Math.round(m.at)]),
      user: performance.getEntriesByType('mark').filter((m) => /^fel-/.test(m.name)).map((m) => [m.name, Math.round(m.startTime), String(m.detail ?? '').replace(/^.*\//, '')]),
      glb: performance.getEntriesByType('resource').filter((r) => /\.(glb|gltf|env|ktx2?|wasm|basis|hdr)(\?|$)/.test(r.name)).map((r) => [r.name.replace(/^.*\//, '').slice(0, 60), Math.round(r.startTime), Math.round(r.duration), r.encodedBodySize]),
      js: performance.getEntriesByType('resource').filter((r) => /\.js(\?|$)/.test(r.name)).reduce((a, r) => ({ n: a.n + 1, bytes: a.bytes + r.encodedBodySize, lastEnd: Math.max(a.lastEnd, Math.round(r.responseEnd)) }), { n: 0, bytes: 0, lastEnd: 0 }),
      long: window.__lp.long,
    }));
    row.readyAtMs = Math.round(at.now);
    row.marks = at.marks; row.userMarks = at.user; row.glb = at.glb; row.js = at.js;
    row.longSumMs = at.long.filter((l) => l[0] < at.now).reduce((s, l) => s + l[1], 0);
    row.longMax = at.long.reduce((m, l) => Math.max(m, l[1]), 0);
    const prewarmStart = at.marks.find((m) => m[0] === 'postload');
    row.prewarmStartMs = prewarmStart ? prewarmStart[2] : null;
    if (PROFILE) {
      const { profile } = await cdp.send('Profiler.stop');
      const byId = new Map(profile.nodes.map((n) => [n.id, n])); const counts = new Map();
      profile.samples.forEach((id, i) => counts.set(id, (counts.get(id) || 0) + (profile.timeDeltas[i] || 0)));
      const key = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.replace(/^.*\//, '')}:${n.callFrame.lineNumber}`;
      const self = new Map(); for (const [id, us] of counts) { const k = key(byId.get(id)); self.set(k, (self.get(k) || 0) + us); }
      const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
      const total = new Map();
      for (const [id, us] of counts) { const seen = new Set(); for (let x = id; x !== undefined; x = parent.get(x)) { const k = key(byId.get(x)); if (seen.has(k)) continue; seen.add(k); total.set(k, (total.get(k) || 0) + us); } }
      const top = (m, n) => [...m].sort((a, c) => c[1] - a[1]).slice(0, n).map(([k, us]) => `${Math.round(us / 1000)} ms ${k}`);
      row.selfTop = top(self, 40); row.totalTop = top(total, 120);
      fs.writeFileSync(path.join(OUT, `${TAG}-${mode}.cpuprofile`), JSON.stringify(profile));
    }
    if (ph === 'ready') {
      await sleep(800);
      const btn = p.locator('button', { hasText: /tap to start/i }).first();
      const bb = await btn.boundingBox().catch(() => null);
      if (bb) { if (phone) await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); else await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
      row.startVia = bb ? 'button' : 'none';
      const tS = Date.now();
      for (;;) { const v = await p.evaluate(() => window.__sessionStore?.view().phase ?? null).catch(() => null); if (v === 'playing') break; if (Date.now() - tS > 60000) break; await sleep(100); }
      row.liveAfterTapS = Math.round((Date.now() - tS) / 100) / 10;
      const fr = await p.evaluate((ms) => window.__lpRaf(ms), PLAY_MS);
      row.play = { frames: fr.length, worstMs: Math.round(Math.max(...fr)), over100: fr.filter((f) => f > 100).length };
      await p.screenshot({ path: path.join(OUT, `${TAG}-${mode}-play.jpg`), type: 'jpeg', quality: 60, timeout: 30000 }).catch(() => {});
    }
  } catch (e) { row.fail = String(e.message || e).slice(0, 200); }
  row.log = log; row.errors = errors;
  fs.writeFileSync(path.join(OUT, `${TAG}-${mode}.json`), JSON.stringify(row, null, 1));
  console.log(`${TAG} ${mode} ${row.fail ?? `ready ${row.readyAtMs} ms, pre-warm from ${row.prewarmStartMs}, long ${row.longSumMs} ms, worst play frame ${row.play?.worstMs}`} | ${(row.marks ?? []).map((m) => `${m[0]} ${m[1]}`).join(' · ')}`);
  await ctx.close();
}
await b.close();
