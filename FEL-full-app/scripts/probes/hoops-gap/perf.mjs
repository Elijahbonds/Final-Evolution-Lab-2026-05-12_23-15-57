// hoops-audit phone-profile perf run: perf-lag's run.mjs (round 7), unchanged but for the paths. node perf.mjs <page> <mode> [outJsonl]
// Bundle: node build.mjs <site> prod (entry.mjs needs the perf-lag entry hooks for the split timings; without them the frame
// total, draws and compiles still read). PORT defaults to 3647.
// perf-lag driver. node run.mjs <page> <mode> [outJsonl]
// Phone profile: 390x844 portrait, DPR 3, isMobile+hasTouch, ?tier=mobile, 4x CDP CPU throttle FROM NAVIGATION, seeded Math.random,
// SwiftShader GL, raster cut RASTER x at 'loading'. REAL clock through the load (TTFP is wall time); VIRTUAL clock from 'playing'
// (1/60 s of game time per display frame) so a slow software-GL frame does not turn into a giant game step.
//   env: THROTTLE=4 PORT=3604 RASTER=4 PLAY_S=12 GUARD=0 (1: the perf guard on, as on a phone; else ?perf=off) SEED=7 VT=1
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(new URL('../../../package.json', import.meta.url).pathname);
const { chromium } = require('playwright-core');
const [page, mode, outJsonl] = process.argv.slice(2);
const THROTTLE = Number(process.env.THROTTLE ?? 4);
const PORT = process.env.PORT ?? '3647';
const RASTER = process.env.RASTER ?? '4';
const PLAY_S = Number(process.env.PLAY_S ?? 12);
const GUARD = process.env.GUARD === '1';
const VT = process.env.VT !== '0';
const INIT = `(() => {
  const realNow = performance.now.bind(performance);
  window.__realNow = realNow;
  window.__name = window.__name || function (f) { return f; };
  { let t = ${Number(process.env.SEED ?? 7)} >>> 0; Math.random = () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
  // virtual time, switched on at 'playing' (entry calls __vtStart): performance.now is real until then
  let vt = 0; window.__vtOn = false; window.__vtTicks = 0; window.__VT = ${VT};
  performance.now = () => (window.__vtOn ? vt : realNow());
  window.__vtStart = () => { vt = realNow(); window.__vt0 = vt; window.__vtOn = true; };
  const raf = window.requestAnimationFrame.bind(window); let lastTs = -1;
  window.__rafCalls = 0;
  window.requestAnimationFrame = (cb) => raf((ts) => { window.__rafCalls++; if (ts !== lastTs) { lastTs = ts; if (window.__vtOn) { vt += 1000 / 60; window.__vtTicks++; } } cb(window.__vtOn ? vt : ts); });
  { const hook = (C) => { if (!C) return; const ls = C.prototype.linkProgram;
      C.prototype.linkProgram = function (p) { const t = realNow(); const r = ls.call(this, p);
        const ph = window.__phase || ''; let what = '';
        if (ph === 'playing' || ph === 'ready' || ph === 'countdown') { try { const sh = this.getAttachedShaders(p) || []; for (const x of sh) { if (this.getShaderParameter(x, this.SHADER_TYPE) !== this.FRAGMENT_SHADER) continue; const src = this.getShaderSource(x) || ''; const defs = (src.match(/#define [A-Z_0-9]+/g) || []).map((d) => d.slice(8)).filter((d) => !/^(NUM_BONE_INFLUENCERS|BonesPerMesh|NUM_MORPH|SHADER_NAME)/.test(d)); const nm = (src.match(/SHADER_NAME [^\\n]*/) || [''])[0]; what = (nm + ' ' + defs.slice(0, 60).join(',')).slice(0, 700); } } catch {} }
        (window.__links = window.__links || []).push([ph, t, realNow() - t, what]); return r; }; };
    hook(window.WebGLRenderingContext); hook(window.WebGL2RenderingContext); }
  { const gc = HTMLCanvasElement.prototype.getContext; const seen = new WeakSet(); window.__glCtx = 0;
    HTMLCanvasElement.prototype.getContext = function (k, ...a) { const r = gc.call(this, k, ...a); if (r && /webgl/.test(k) && !seen.has(r)) { seen.add(r); window.__glCtx++; } return r; }; }
  // intervals run on GAME time (performance.now: real in the load, virtual in play): the RenderWatchdog's 1 s canvas readback
  // would otherwise fire every few frames on a software-GL box where a phone pays it once per 30-60 frames
  { const si = window.setInterval.bind(window);
    window.setInterval = (fn, ms, ...a) => { let last = performance.now(); const want = Math.max(1, Number(ms) || 0); return si(() => { const n = performance.now(); if (n - last >= want) { last = n; fn(...a); } }, Math.min(want, 50)); }; }
  const st = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...a) => st(fn, ms === 20000 ? 300000 : ms, ...a);
})()`;
import { execSync as __ex } from 'node:child_process';
const gpuPid = () => { try { const all = __ex(`pgrep -a -f -- '--type=gpu-process'`).toString().trim().split('\n'); const mine = (pid) => { let x = pid; for (let i = 0; i < 6 && x > 1; i++) { if (x === process.pid) return true; x = Number(fs.readFileSync(`/proc/${x}/stat`, 'utf8').split(') ')[1].split(' ')[1]); } return false; }; for (const l of all) { const pid = Number(l.split(' ')[0]); if (mine(pid)) return pid; } } catch {} return 0; };
const cpuS = (pid) => { try { const f = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' '); return (Number(f[11]) + Number(f[12])) / 100; } catch { return NaN; } };
function pct(a, p) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; }
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
let row; const tWall0 = Date.now();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await ctx.addInitScript({ content: INIT });
const p = await ctx.newPage();
const cons = []; p.on('console', (m) => { if (m.type() === 'error' || /FEL-PERF|-LOAD\] first-frame warm/.test(m.text())) cons.push([m.type(), m.text().slice(0, 200)]); });
const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
let crashed = false; const crash = new Promise((_, rej) => p.on('crash', () => { crashed = true; rej(new Error('page crashed')); })); crash.catch(() => {});
const ev = (fn, arg) => Promise.race([p.evaluate(fn, arg), crash, new Promise((_, rej) => setTimeout(() => rej(new Error('evaluate timed out')), 180000))]);
try {
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await p.goto(`http://127.0.0.1:${PORT}/${page}.html?mode=${mode}&tier=mobile${GUARD ? '' : '&perf=off'}&raster=${RASTER}${process.env.QS ?? ''}${process.env.FIRSTPROF ? '&holdStart=1' : ''}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  let st = {}; const tPoll = Date.now(); let base = null; let tPlay = 0;
  for (;;) {
    st = await ev(() => ({ ph: window.__phase || '', err: window.__err || '', g: window.__vtOn ? (performance.now() - window.__vt0) / 1000 : -1 }));
    if (process.env.VERBOSE && (globalThis.__it = (globalThis.__it || 0) + 1) % 20 === 1) console.error(`[${mode} ${((Date.now() - tWall0) / 1000).toFixed(0)}s] phase ${st.ph} game ${st.g.toFixed(2)} frames ${await ev(() => window.__frames.length)}`);
    if (st.err) break;
    if (st.ph === 'playing' && !base) {
      tPlay = Date.now();
      await cdp.send('HeapProfiler.collectGarbage');
      const gp = gpuPid();
      base = { gp, g0: cpuS(gp), hu: (await cdp.send('Runtime.getHeapUsage')).usedSize, frameIdx: await ev(() => window.__frames.length),
        obs: await ev(() => { const s = window.__FEL_DEV__.scene; return { br: s.onBeforeRenderObservable.observers.length, ar: s.onAfterRenderObservable.observers.length, ef: s.getEngine().onEndFrameObservable.observers.length, meshes: s.meshes.length, mats: s.materials.length, tex: s.textures.length }; }) };
    }
    if (process.env.ALLOC && base && !globalThis.__sampling && st.g >= 1) { await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); globalThis.__sampling = await ev(() => window.__vtTicks); }
    if (process.env.FIRSTPROF && !globalThis.__fp && st.ph === 'ready') { globalThis.__fp = 1; await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); await ev(() => { window.__go = 1; }); }
    if (process.env.FIRSTPROF && globalThis.__fp === 1 && base && (await ev(() => !!window.__ffE))) {
      globalThis.__fp = 2;
      const { profile } = await cdp.send('Profiler.stop');
      const byId = new Map(profile.nodes.map((n) => [n.id, n])); const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
      const key = (id) => { const cf = byId.get(id).callFrame; return (cf.functionName || '(anon)') + ' ' + (cf.url || '').split('/').pop() + ':' + (cf.lineNumber + 1); };
      let t = profile.startTime; const ts = profile.timeDeltas.map((d) => (t += d));
      let p0 = -1, b0 = -1, e0 = -1;
      const under = (id, name) => { for (let x = id, n = 0; x !== undefined && n < 6; x = parent.get(x), n++) if (key(x).startsWith(name)) return true; return false; };
      for (let i = 0; i < profile.samples.length; i++) { const s = profile.samples[i]; if (under(s, 'felPlayBegin')) p0 = i; if (under(s, 'felFirstFrameBegin')) b0 = i; if (under(s, 'felFirstFrameEnd') && b0 >= 0 && e0 < 0) e0 = i; }
      const win = (from, to) => { const selfT = new Map(), incl = new Map(); let tot = 0;
        for (let i = Math.max(0, from + 1); i < to; i++) { const dt = (ts[i + 1] ?? ts[i]) - ts[i]; tot += dt; const k = key(profile.samples[i]); selfT.set(k, (selfT.get(k) || 0) + dt); const seen = new Set(); let id = profile.samples[i]; while (id !== undefined) { const kk = key(id); if (!seen.has(kk)) { seen.add(kk); incl.set(kk, (incl.get(kk) || 0) + dt); } id = parent.get(id); } }
        const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 150).map(([k, v]) => [k, +(v / 1000).toFixed(1)]);
        return { ms: tot / 1000, self: top(selfT), incl: top(incl) }; };
      fs.writeFileSync(process.env.FIRSTPROF, JSON.stringify({ found: [p0, b0, e0], gap: p0 >= 0 && b0 >= 0 ? win(p0, b0) : null, first: b0 >= 0 && e0 >= 0 ? win(b0, e0) : null }));
    }
    if (process.env.CPUPROF && base && !globalThis.__profiling && st.g >= 1) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); globalThis.__profiling = await ev(() => window.__vtTicks); }
    if (process.env.DEFPROBE && base && !globalThis.__defp && st.g >= 1) { globalThis.__defp = 1; await ev(() => {
      const s = window.__FEL_DEV__.scene;
      const D = window.__defs = { calls: 0, t0: window.__vtTicks, prep: {}, dirty: {}, stacks: {} };
      const stk = (n) => new Error().stack.split('\n').slice(2, 2 + n).map((x) => x.trim().replace(/^at /, '').replace(/\(.*\/([^/]+):(\d+):\d+\)/, '$1:$2')).join(' < ');
      // the material classes in use: wrap _prepareEffect where it is defined (PBR, Standard, Node...)
      const seen = new Set();
      for (const mat of s.materials) { let q = Object.getPrototypeOf(mat); while (q && !Object.prototype.hasOwnProperty.call(q, '_prepareEffect') && !Object.prototype.hasOwnProperty.call(q, 'isReadyForSubMesh')) q = Object.getPrototypeOf(q); if (!q || seen.has(q)) continue; seen.add(q);
        const key = Object.prototype.hasOwnProperty.call(q, '_prepareEffect') ? '_prepareEffect' : null; if (!key) continue; const o = q[key];
        q[key] = function (mesh, rm, defines) { const r = o.apply(this, arguments); if (r !== null || (defines && defines._isDirty === false && false)) {} const k = (this.getClassName ? this.getClassName() : '?') + ' ' + (this.name || '?').replace(/\d+/g, '#') + ' @ ' + (mesh && mesh.name || '?').replace(/\d+/g, '#'); if (r !== null) { D.prep[k] = (D.prep[k] || 0) + 1; } return r; }; }
      // which defines get marked dirty, and by whom
      let dp = null; for (const m of s.meshes) { for (const sm of m.subMeshes || []) { if (sm.materialDefines) { dp = Object.getPrototypeOf(sm.materialDefines); while (dp && !Object.prototype.hasOwnProperty.call(dp, 'markAsLightDirty')) dp = Object.getPrototypeOf(dp); break; } } if (dp) break; }
      if (dp) for (const fn of ['markAsLightDirty', 'markAsAttributesDirty', 'markAsTexturesDirty', 'markAsMiscDirty', 'markAllAsDirty', 'markAsImageProcessingDirty', 'markAsUnprocessed', 'markAsPrePassDirty', 'markAsFresnelDirty']) {
        if (typeof dp[fn] !== 'function') continue; const o = dp[fn];
        dp[fn] = function () { D.dirty[fn] = (D.dirty[fn] || 0) + 1; if (D.dirty[fn] % 13 === 1) { const k = fn + ' :: ' + stk(6); D.stacks[k] = (D.stacks[k] || 0) + 1; } return o.apply(this, arguments); };
      }
      D.err = dp ? null : 'no defines proto';
    }); }
    if (base && st.g >= PLAY_S) break;
    if (base && Date.now() - tPlay > 900000) break;
    if (!base && Date.now() - tPoll > 600000) break;
    if (st.ph === 'ended') break;
    await p.waitForTimeout(500);
  }
  if (globalThis.__sampling) {
    const f1 = await ev(() => window.__vtTicks); const frames = f1 - globalThis.__sampling;
    const { profile } = await cdp.send('HeapProfiler.stopSampling');
    const self = new Map(), file = new Map(); let total = 0;
    const walk = (n, files) => { const cf = n.callFrame; const url = (cf.url || '').split('/').pop(); const k = (cf.functionName || '(anon)') + ' ' + url + ':' + (cf.lineNumber + 1); const sz = n.selfSize || 0; if (sz) { total += sz; self.set(k, (self.get(k) || 0) + sz); } for (const c of n.children || []) walk(c, files); };
    walk(profile.head, []);
    fs.writeFileSync(process.env.ALLOC, JSON.stringify({ frames, totalKBPerFrame: total / 1024 / Math.max(1, frames), self: [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 300).map(([k, v]) => [k, +(v / 1024 / Math.max(1, frames)).toFixed(2)]) }));
    fs.writeFileSync(process.env.ALLOC + '.raw.json', JSON.stringify({ frames, profile }));
  }
  if (globalThis.__profiling) {
    const f1 = await ev(() => window.__vtTicks); const frames = f1 - globalThis.__profiling;
    const { profile } = await cdp.send('Profiler.stop');
    const byId = new Map(profile.nodes.map((n) => [n.id, n])); const selfT = new Map(); const dt = profile.timeDeltas; let tot = 0;
    for (let i = 0; i < profile.samples.length; i++) { const n = byId.get(profile.samples[i]); const cf = n.callFrame; const k = (cf.functionName || '(anon)') + ' ' + (cf.url || '').split('/').pop() + ':' + (cf.lineNumber + 1); const t = (dt[i] || 0) / 1000; tot += t; selfT.set(k, (selfT.get(k) || 0) + t); }
    // inclusive: walk parents
    const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
    const incl = new Map();
    for (let i = 0; i < profile.samples.length; i++) { const t = (dt[i] || 0) / 1000; const seen = new Set(); let id = profile.samples[i]; while (id !== undefined) { const cf = byId.get(id).callFrame; const k = (cf.functionName || '(anon)') + ' ' + (cf.url || '').split('/').pop() + ':' + (cf.lineNumber + 1); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + t); } id = parent.get(id); } }
    const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 400).map(([k, v]) => [k, +(v / Math.max(1, frames)).toFixed(3)]);
    fs.writeFileSync(process.env.CPUPROF, JSON.stringify({ frames, msPerFrame: tot / Math.max(1, frames), self: top(selfT), incl: top(incl) }));
  }
  if (globalThis.__defp) { const D = await ev(() => ({ ...window.__defs, frames: window.__vtTicks - window.__defs.t0 })); const pf = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([k, v]) => [k, +(v / Math.max(1, D.frames)).toFixed(2)]); fs.writeFileSync(process.env.DEFPROBE, JSON.stringify({ frames: D.frames, err: D.err, prepPerFrame: pf(D.prep), dirtyPerFrame: pf(D.dirty), stacks: Object.entries(D.stacks).sort((a, b) => b[1] - a[1]).slice(0, 40) }, null, 1)); }
  const gpuEnd = base ? cpuS(base.gp) : NaN;
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const d = await ev(() => ({ marks: window.__marks, frames: window.__frames, links: window.__links || [], glCtx: window.__glCtx, hud: window.__hudCalls || 0,
    calib: window.__calib || [], raf: window.__rafCalls, vt: window.__vtTicks,
    obs: (() => { try { const s = window.__FEL_DEV__.scene; return { br: s.onBeforeRenderObservable.observers.length, ar: s.onAfterRenderObservable.observers.length, ef: s.getEngine().onEndFrameObservable.observers.length, meshes: s.meshes.length, mats: s.materials.length, tex: s.textures.length }; } catch { return null; } })(),
    perf: (() => { try { return window.__FEL_PERF__ ? window.__FEL_PERF__.state() : null; } catch { return null; } })(),
    hitch: (() => { try { return window.__FEL_HITCH__ ? window.__FEL_HITCH__.report() : null; } catch { return null; } })(),
    extra: { physMs: window.__physMs ?? null, capsuleInitMs: window.__capsuleInitMs ?? null, capsuleRoots: window.__capsuleRoots ?? null, skinnedRoots: window.__skinnedRoots ?? null, firstFrames: (window.__frames || []).filter((f) => f[0] === 'playing').slice(0, 6).map((f) => [Math.round(f[2] - f[1]), Math.round(f[3]), Math.round(f[4]), Math.round(f[5])]) } }));
  await cdp.send('HeapProfiler.collectGarbage');
  const huEnd = (await cdp.send('Runtime.getHeapUsage')).usedSize;
  const M = {}; for (const [k, t] of d.marks) { if (!(k in M)) M[k] = t; }
  const playF = d.frames.filter((f) => f[0] === 'playing');
  const fPlay = playF[0];
  const first40 = playF.slice(0, 40).map((f) => f[2] - f[1]);
  const steady = playF.slice(Math.min(30, Math.floor(playF.length / 4)));
  const work = steady.map((f) => f[2] - f[1]);
  const gameS = steady.length / 60;   // virtual: one frame per 1/60 s of game time
  // heap drops between consecutive frames = GCs (precise memory info); positive deltas = allocation churn
  let gcs = 0, churn = 0;
  for (let i = 1; i < steady.length; i++) { const dh = steady[i][6] - steady[i - 1][6]; if (dh < -65536) gcs++; else if (dh > 0) churn += dh; }
  const lp = { load: 0, ready: 0, countdown: 0, playing: 0, other: 0 };
  for (const [ph] of d.links) { if (ph in lp) lp[ph]++; else if (ph === 'loading' || ph === '') lp.load++; else lp.other++; }
  const playLinkMs = d.links.filter((l) => l[0] === 'playing').reduce((s, l) => s + l[2], 0);
  const dupFrames = (() => { let n = 0; for (let i = 1; i < playF.length; i++) if (playF[i][9] === playF[i - 1][9]) n++; return n; })();
  row = {
    mode, page, guard: GUARD, ok: !!fPlay, err: st.err || undefined, finalPhase: st.ph,
    ttfpS: fPlay ? fPlay[2] / 1000 : null, readyS: M.ready != null ? M.ready / 1000 : null, loadingS: M.loading != null ? M.loading / 1000 : null,
    firstPlayFrameMs: fPlay ? fPlay[2] - fPlay[1] : null, worstFirst40Ms: first40.length ? Math.max(...first40) : null,
    frames: steady.length, gameS,
    p50: pct(work, 0.5), p95: pct(work, 0.95), p99: pct(work, 0.99), max: work.length ? Math.max(...work) : null,
    updP50: pct(steady.map((f) => f[3]), 0.5), animP50: pct(steady.map((f) => f[4]), 0.5), renP50: pct(steady.map((f) => f[5]), 0.5),
    updP95: pct(steady.map((f) => f[3]), 0.95),
    long50PerMin: work.filter((w) => w > 50).length / Math.max(1e-6, gameS / 60), long100PerMin: work.filter((w) => w > 100).length / Math.max(1e-6, gameS / 60),
    draws: pct(steady.map((f) => f[7]), 0.5), meshes: pct(steady.map((f) => f[8]), 0.5),
    gpuMsPerFrame: base ? (gpuEnd - base.g0) * 1000 / Math.max(1, playF.length) : null,
    compilesInPlay: lp.playing, playLinks: d.links.filter((l) => l[0] === 'playing').map((l) => [Math.round(l[2]), l[3]]), readyLinks: d.links.filter((l) => l[0] === 'ready').map((l) => [Math.round(l[2]), (l[3] || '').slice(0, 200)]), compileMsInPlay: playLinkMs, links: lp,
    heapPlayStartMb: base ? base.hu / 1048576 : null, heapEndMb: huEnd / 1048576, heapGrowthMb: base ? (huEnd - base.hu) / 1048576 : null,
    gcPerMin: gcs / Math.max(1e-6, gameS / 60), churnMbPerS: churn / 1048576 / Math.max(1e-6, gameS),
    obsStart: base?.obs, obsEnd: d.obs, glCtx: d.glCtx, hudCalls: d.hud, dupFrames, calibMs: pct(d.calib, 0.5),
    perf: d.perf ? { level: d.perf.level, cap: d.perf.cap, hw: d.perf.hardwareScalingLevel, reason: d.perf.reason } : null,
    hitch: d.hitch, extra: d.extra, warm: cons.filter((c) => /first-frame warm/.test(c[1])).map((c) => c[1]), perfLog: cons.filter((c) => /FEL-PERF/.test(c[1])).length,
    errors: errs.slice(0, 5), console: cons.filter((c) => c[0] === 'error').slice(0, 6), wallS: (Date.now() - tWall0) / 1000,
    loadavg: fs.readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).join(' '),
  };
  if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify({ frames: d.frames, links: d.links, marks: d.marks }));
} catch (e) {
  row = { mode, page, ok: false, crashed, note: String(e.message).slice(0, 200), errors: errs.slice(0, 5) };
} finally {
  await Promise.race([p.evaluate(() => { try { window.__stop && window.__stop(); } catch {} }), new Promise((r) => setTimeout(r, 10000))]).catch(() => {});
  await Promise.race([b.close(), new Promise((r) => setTimeout(r, 20000))]);
}
if (outJsonl) fs.appendFileSync(outJsonl, JSON.stringify(row) + '\n');
const f = (x, n = 1) => (typeof x === 'number' ? x.toFixed(n) : '-');
console.log(row.ok
  ? `${mode.padEnd(12)} ${page} ttfp ${f(row.ttfpS)}s p50 ${f(row.p50)} p95 ${f(row.p95)} p99 ${f(row.p99)} max ${f(row.max, 0)} upd ${f(row.updP50)} anim ${f(row.animP50)} ren ${f(row.renP50)} long50/min ${f(row.long50PerMin, 0)} compiles ${row.compilesInPlay} heap+ ${f(row.heapGrowthMb, 2)}MB gc/min ${f(row.gcPerMin, 0)} churn ${f(row.churnMbPerS, 2)}MB/s obs ${row.obsStart?.br}->${row.obsEnd?.br} gl ${row.glCtx} calib ${f(row.calibMs, 2)} ${row.frames}f wall ${f(row.wallS, 0)}s errs ${row.errors.length}`
  : `${mode} ${page} FAILED ${row.note || row.err} ${JSON.stringify(row.errors || [])}`);
try { const { execSync } = await import('node:child_process'); for (const k of execSync(`pgrep -P ${process.pid} || true`).toString().trim().split(/\s+/).filter(Boolean)) { try { process.kill(Number(k), 'SIGKILL'); } catch {} } } catch {}
process.exit(0);
