// hoops-perf (2026-11-12): WHERE THE COURT MODES ALLOCATE — the sampling heap profiler over game seconds of play, by site.
//
//   PAGE=http://127.0.0.1:3383/mode.html MODES=onevone,threevthree OUT=<dir> TAG=before npx tsx scripts/probes/hoops-perf/heap-profile.mts
//   (scripts/probes/hoops-perf/run.sh <site> <cap> heap … wraps it; the site from ./build-heap.mjs: the shipped minified bundle + its map.)
//
// The phone profile of the perf sweep (390×844 DPR 3, mobile tier, virtual clock, Math.random seeded, the fake pad), RASTER 4. After
// START and WARM game seconds, CDP HeapProfiler sampling (every 4 KB, objects later collected by a minor or major GC included —
// that IS the churn) runs for SECONDS game seconds. Each sample's bytes go to (a) its top frame and (b) the first frame in the app's
// own code (lib/, components/) above Babylon's — "who asked for it". The bundle's source map names the file and line.
// Also the perf sweep's own churn number (usedJSHeapSize rises summed per frame) over the same seconds, for the before/after.
// Writes <OUT>/heap-<TAG>-<mode>.json.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { chromiumExe } from '../_chromium.mts';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

const PAGE = process.env.PAGE ?? 'http://127.0.0.1:3383/mode.html';
const MODES = (process.env.MODES ?? 'onevone').split(',').filter(Boolean);
const OUT = process.env.OUT ?? '/tmp/heap-profile';
const TAG = process.env.TAG ?? 'run';
const SECONDS = Number(process.env.SECONDS ?? 6);
const WARM = Number(process.env.WARM ?? 2);
const SEED = Number(process.env.SEED ?? 7);
const RASTER = Number(process.env.RASTER ?? 4);
const THROTTLE = Number(process.env.THROTTLE ?? 1);
const INTERVAL = Number(process.env.INTERVAL ?? 4096);
fs.mkdirSync(OUT, { recursive: true });

const INIT = `(() => {
  const realNow = performance.now.bind(performance);
  let vt = realNow(); const raf = window.requestAnimationFrame.bind(window);
  performance.now = () => vt; let lastTs = -1;
  window.requestAnimationFrame = (cb) => raf((ts) => { if (ts !== lastTs) { lastTs = ts; vt += 1000 / 60; } cb(vt); });
  let t = ${SEED} >>> 0;
  Math.random = () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  const D = 1.7e12; Date.now = () => D;
  window.__name = window.__name || function (f) { return f; };
  const st = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...a) => st(fn, ms === 20000 ? 300000 : ms, ...a);
})()`;

interface CallFrame { functionName: string; url: string; lineNumber: number; columnNumber: number }
interface Node { id: number; callFrame: CallFrame; selfSize: number; children: Node[] }

// the bundle's source map (./build-heap.mjs): a minified position → the file (and name) it came from
let tm: TraceMap | null = null;
async function loadMarks(url: string): Promise<void> { tm = new TraceMap(await (await fetch(url + '.map')).text()); }
const posCache = new Map<string, { mod: string; name: string | null; line: number }>();
function origin(line: number, col: number): { mod: string; name: string | null; line: number } {
  const k = `${line}:${col}`; const hit = posCache.get(k); if (hit) return hit;
  const o = tm ? originalPositionFor(tm, { line: line + 1, column: col }) : null;
  const src = o?.source ?? '?';
  const i = src.search(/(node_modules|lib|components|app|scripts)\//);
  const r = { mod: i >= 0 ? src.slice(i) : src, name: o?.name ?? null, line: o?.line ?? 0 };
  posCache.set(k, r); return r;
}
/** The app's own code (not Babylon's: its source map resolves to dev/core/src/…, or the package path). */
const isApp = (mod: string) => !!mod && !mod.startsWith('node_modules/') && !/dev\/(core|loaders)\/src\/|@babylonjs/.test(mod) && mod !== '?' && mod !== '(native)';
const short = (mod: string) => mod.replace(/^.*dev\/core\/src\//, 'bjs:').replace(/^.*dev\/loaders\/src\//, 'bjsl:').replace(/^node_modules\/@babylonjs\/core\//, 'bjs:').replace(/^node_modules\//, 'nm:').replace(/^app\//, '');

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--enable-precise-memory-info'] });
for (const mode of MODES) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript({ content: INIT });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  const ev = <T,>(fn: string | (() => T)): Promise<T> => Promise.race([p.evaluate(fn as never) as Promise<T>, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('evaluate timed out')), 300000))]);
  const t0 = Date.now();
  try {
    await loadMarks(PAGE.replace(/mode\.html.*$/, 'mode.js'));
    await p.goto(`${PAGE}?mode=${mode}&perf=off${process.env.FEEL ? '&feel=' + encodeURIComponent(process.env.FEEL) : ''}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    let state = '';
    for (let i = 0; i < 600; i++) {
      state = await ev(() => (window as unknown as { __phase?: string }).__phase ?? '');
      if (state === 'playing' || state === 'error') break;
      if (state && state !== 'loading' && i % 4 === 3) await ev(() => { const bus = (window as unknown as { __bus?: { emit(e: unknown): void } }).__bus; bus?.emit({ t: 'button', btn: 'START', pressed: true }); bus?.emit({ t: 'button', btn: 'START', pressed: false }); });
      await p.waitForTimeout(1000);
    }
    if (state !== 'playing') throw new Error(`never played (${state})`);
    await ev(`(() => { const e = window.__FEL_DEV__.scene.getEngine(); e.setHardwareScalingLevel(e.getHardwareScalingLevel() * ${RASTER}); })()`);
    if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    await ev(`(() => { const bus = window.__bus; const t0 = performance.now(); let a = false; window.__FEL_DEV__.scene.onBeforeRenderObservable.add(() => { const g = (performance.now() - t0) / 1000; bus.emit({ t: 'stick', side: 'L', x: Math.sin(g * 0.7) * 0.8, y: -0.6 + Math.cos(g * 0.5) * 0.3 }); const on = (g % 1.5) < 0.12; if (on !== a) { a = on; bus.emit({ t: 'button', btn: 'A', pressed: on }); } }); window.__T0 = t0; })()`);
    const game = () => ev<number>(`(performance.now() - window.__T0) / 1000`);
    while ((await game()) < WARM) await p.waitForTimeout(300);
    // the sweep's churn measure, over the same seconds
    await ev(`(() => { const R = window.__CH = { churn: 0, h0: performance.memory.usedJSHeapSize, t0: performance.now(), frames: 0 }; window.__FEL_DEV__.scene.onAfterRenderObservable.add(() => { const h = performance.memory.usedJSHeapSize; if (h > R.h0) R.churn += h - R.h0; R.h0 = h; R.frames++; }); })()`);
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: INTERVAL, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true } as never);
    const g0 = await game();
    while ((await game()) < g0 + SECONDS) await p.waitForTimeout(300);
    const { profile } = await cdp.send('HeapProfiler.stopSampling') as { profile: { head: Node; samples: Array<{ size: number; nodeId: number }> } };
    const g1 = await game();
    const ch = await ev<{ churn: number; t0: number; frames: number }>(`(() => { const R = window.__CH; return { churn: R.churn, t0: R.t0, frames: R.frames, now: performance.now() }; })()`) as { churn: number; t0: number; frames: number; now?: number };
    const secs = g1 - g0;
    const merge = await ev<unknown>(`(() => { const m = window.__FEL_DEV__.scene.__felBodyMerge; return m ? m.stats() : null; })()`);
    console.log(`[heap] ${TAG} ${mode}: body merge ${JSON.stringify(merge)}`);
    // the raw profile first: the analysis below can always be re-run from it (ANALYZE=<file> skips the browser)
    fs.writeFileSync(path.join(OUT, `heap-${TAG}-${mode}.raw.json`), JSON.stringify({ secs, churn: ch, profile }));
    // per node: its path from the root
    const parent = new Map<number, Node | null>(); const byId = new Map<number, Node>();
    const walk = (n: Node, par: Node | null) => { parent.set(n.id, par); byId.set(n.id, n); for (const c of n.children) walk(c, n); };
    walk(profile.head, null);
    const top = new Map<string, number>(), app = new Map<string, number>(), appChain = new Map<string, number>();
    let total = 0;
    for (const s of profile.samples) {
      const n = byId.get(s.nodeId); if (!n) continue;
      total += s.size;
      const cf = n.callFrame; const og = cf.url ? origin(cf.lineNumber, cf.columnNumber) : { mod: '(native)', name: null, line: 0 };
      const k = `${short(og.mod)} ${og.name ?? cf.functionName ?? '(anon)'}:${og.line}`;
      top.set(k, (top.get(k) ?? 0) + s.size);
      // the first app frame up the stack, and the two above it (who asked)
      let a: Node | null = n; const chain: string[] = [];
      while (a) { const o2 = a.callFrame.url ? origin(a.callFrame.lineNumber, a.callFrame.columnNumber) : null; const m = o2?.mod ?? ''; if (isApp(m)) { chain.push(`${m}:${o2!.line} ${a.callFrame.functionName || '(anon)'}`); if (chain.length >= 3) break; } else if (chain.length) break; a = parent.get(a.id) ?? null; }
      const ak = chain[0] ?? '(no app frame)';
      app.set(ak, (app.get(ak) ?? 0) + s.size);
      const ck = chain.join(' < ') || '(no app frame)';
      appChain.set(ck, (appChain.get(ck) ?? 0) + s.size);
    }
    const mbps = (v: number) => Math.round((v / 1048576 / secs) * 100) / 100;
    const sorted = (m: Map<string, number>, n: number) => [...m].sort((x, y) => y[1] - x[1]).slice(0, n).map(([k, v]) => ({ site: k, mbPerS: mbps(v) }));
    const r = { mode, tag: TAG, gameSeconds: secs, frames: ch.frames, sampledMbPerS: mbps(total), sweepChurnMbPerS: mbps(ch.churn), topFrames: sorted(top, 60), appSites: sorted(app, 60), appChains: sorted(appChain, 40) };
    fs.writeFileSync(path.join(OUT, `heap-${TAG}-${mode}.json`), JSON.stringify(r, null, 1));
    console.log(`[heap] ${TAG} ${mode}: ${secs.toFixed(1)} game s, sampled ${r.sampledMbPerS} MB/s, sweep churn ${r.sweepChurnMbPerS} MB/s (${Math.round((Date.now() - t0) / 1000)} s)`);
    for (const x of r.appSites.slice(0, 15)) console.log(`   ${String(x.mbPerS).padStart(6)}  ${x.site}`);
  } catch (e) {
    console.log(`[heap] ${TAG} ${mode}: FAILED ${(e as Error).message}`);
  } finally {
    await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 30000))]);
  }
}
await Promise.race([b.close(), new Promise((r) => setTimeout(r, 15000))]);
process.exit(0);   // a hung browser close must never keep the shared gate
