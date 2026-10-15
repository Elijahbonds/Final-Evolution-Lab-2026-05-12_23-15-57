// _perf-sweep — what does each mode cost a 3–4-year-old phone? (perf-guard, owner request 2026-10-06)
//
// Owner: "Make sure it's not gonna lag or overheat people's phone." This loads registered modes through the real
// ModeHarness (/dev/mode/<id>) as a phone — 390×844 portrait and/or 844×390 landscape, isMobile + hasTouch at DPR 3,
// so the harness picks the MOBILE tier the way a phone does — throttles the page's JS 4× over CDP (about a 2021
// mid-range Android against this box's cores), plays a few seconds with a fake pad, and records per mode:
//   JS per frame (p50/p95, REAL clock; split into harness+mode update, animation+layers, and render submission),
//   draw calls, active meshes, active vertices, skinned bodies, particles (live), texture MB, render-target passes
//   (shadow maps, post passes), the backing resolution and a fill proxy (backing pixels × full-screen passes).
// GPU time cannot be measured under SwiftShader (it rasterises on the CPU in another process): draw calls, vertices and
// fill are the GPU proxies, and the JS split is the CPU cost.
// VIRTUAL TIME: each animation frame is 1/60 s of GAME time however slow the software GL is, so every mode plays the same
// seconds on any box. The JS timings read the real clock (saved before the override).
//
//   PORT=3230 CHROMIUM_EXE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//   MODES=dunk,onevone PROFILES=portrait,landscape SECONDS=6 OUT=<dir> npx tsx scripts/probes/_perf-sweep.mts
//
// PHONE-PERF (2026-10-14) — what the phone pass learned running this, folded back in:
//   * ONE 1/60 s STEP PER DISPLAY FRAME. The clock stepped once per rAF CALLBACK, so with two rAF users registered (the
//     harness and anything else) game time ran 2x fast: a 6 s run played 3 s of frames. Every callback in a frame shares
//     the real timestamp; the step keys on it.
//   * INTERVALS ON GAME TIME. RenderWatchdog samples the frame every 1 s (a canvas readback + PNG encode). On the wall clock
//     of a software-GL box (~1 game frame per real second) that was nearly every frame — 30 % of a 3v3 profile — where a
//     phone pays it once per 30–150 frames. setInterval now fires on the virtual clock (VINTERVAL=0: the wall clock).
//   * SEED=<n>: Math.random is mulberry32(n) and Date.now a constant, so a before and an after draw the same venues,
//     questions and casts (who_scene_it's texture list moved 224 → 342 MB between unseeded runs on the draw alone).
//   * Per frame also: shadow-map draws (the draw counter around every shadow map's render) and other render-target draws;
//     the JS heap (peak in play, retained after a forced GC, and the allocation churn per game second); a fixed workload
//     timed outside the frame every 10th frame (calibMs: the box's speed now — a shared box's load moves frame times 3x).
//   * PAGE=<url>: a static page (the esbuild bundle of lib/babylon + registry) instead of /dev/mode/<id>; it must publish
//     window.__phase and window.__bus. RASTER=<k>: cut the backing k× after load (same viewport, tier, camera and culling,
//     so the same draws, meshes and CPU work); SwiftShader rasterises on this box's CPU and a 780×1688 frame takes seconds.
import { chromium, type Browser } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const PORT = process.env.PORT ?? '3230';
const OUT = process.env.OUT ?? '/tmp/perf-sweep';
const SECONDS = Number(process.env.SECONDS ?? 6);
const THROTTLE = Number(process.env.THROTTLE ?? 4);
const PROFILES = (process.env.PROFILES ?? 'portrait').split(',').filter(Boolean);
const MODES = (process.env.MODES ?? 'dunk').split(',').filter(Boolean);
const TAG = process.env.TAG ?? 'before';
const PAGE = process.env.PAGE ?? '';
const RASTER = Number(process.env.RASTER ?? 1);
/** `?perf=off` measures the harness as it was before the guard (the guard installs nothing); '' measures it on. */
const QUERY = process.env.QUERY ?? (TAG === 'before' ? '?perf=off' : '');
fs.mkdirSync(OUT, { recursive: true });

const VIEW: Record<string, { width: number; height: number }> = {
  portrait: { width: 390, height: 844 },
  landscape: { width: 844, height: 390 },
};

// REALTIME=1 keeps the page's own clock: the governor then sees this box's real frame times and steps (the "after"
// behaviour run); the default virtual clock makes every mode play the same game seconds (the content measurement).
const REALTIME = !!process.env.REALTIME;
const SEED = process.env.SEED;
const INIT = `(() => {
  const realNow = performance.now.bind(performance);
  window.__realNow = realNow;
  if (!${REALTIME}) {
    let vt = realNow(); const raf = window.requestAnimationFrame.bind(window);
    performance.now = () => vt;
    let lastTs = -1;   // one step per display frame: every callback in a frame shares the real timestamp
    window.requestAnimationFrame = (cb) => raf((ts) => { if (ts !== lastTs) { lastTs = ts; vt += 1000 / 60; } cb(vt); });
    if (${process.env.VINTERVAL !== '0'}) {
      const si = window.setInterval.bind(window);
      window.setInterval = (fn, ms, ...a) => { let last = performance.now(); const want = Math.max(1, Number(ms) || 0); return si(() => { const n = performance.now(); if (n - last >= want) { last = n; fn(...a); } }, Math.min(want, 50)); };
    }
  }
  if (${SEED !== undefined}) {
    let t = ${Number(SEED ?? 0)} >>> 0;
    Math.random = () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
    const D = 1.7e12; Date.now = () => D;
  }
  window.__name = window.__name || function (f) { return f; };
  // the harness's 20 s load watchdog (LOAD_WATCHDOG_MS) is a phone-on-a-network guard; a dev build on software GL on a
  // shared box can take longer than that to parse a venue, so the probe gives a load 5 minutes instead
  const st = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...a) => st(fn, ms === 20000 ? 300000 : ms, ...a);
})()`;

/** Installed once the mode is playing: a fake pad that keeps the hero busy, and the per-frame recorder. */
const INSTRUMENT = `(() => {
  const dev = window.__FEL_DEV__; const scene = dev.scene; const engine = scene.getEngine(); const now = window.__realNow;
  const pad = { index: 0, id: 'fake-pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
  const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: pad }); window.dispatchEvent(ev);
  const si = dev.instrument();
  const R = window.__REC = { frames: [], t0: performance.now(), gov: [], calib: [] };
  // every render target's draws, split: the shadow maps vs the rest (a mirror, a crowd snapshot, a depth pass)
  const hooked = new WeakSet(); let sd = 0, od = 0;
  const hook = (rt, isShadow) => {
    if (!rt || hooked.has(rt)) return; hooked.add(rt); let d0 = 0;
    rt.onBeforeRenderObservable.add(() => { d0 = engine._drawCalls.current; });
    rt.onAfterRenderObservable.add(() => { const d = engine._drawCalls.current - d0; if (isShadow) sd += d; else od += d; });
  };
  const scan = () => {
    for (const l of scene.lights) { const sg = l.getShadowGenerator && l.getShadowGenerator(); if (sg && sg.getShadowMap) hook(sg.getShadowMap(), true); }
    for (const rt of scene.customRenderTargets) hook(rt, false);
  };
  const heap = () => (performance.memory ? performance.memory.usedJSHeapSize : 0);
  let h0 = heap(); R.churn = 0; R.peak = h0;
  // the guard's own readout (window.__FEL_PERF__, published in dev): its level, cap and scale every 2 s
  setInterval(() => { const g = window.__FEL_PERF__; if (g) { const s = g.state(); R.gov.push({ t: Math.round((performance.now() - R.t0) / 100) / 10, cap: s.cap, level: s.level, scale: s.renderScale, fps: Math.round(s.fps), js: Math.round(s.workP50 * 10) / 10, thermal: s.thermal, reason: s.reason }); } }, 2000);
  let tb = 0, ta = 0, taa = 0;
  engine.onBeginFrameObservable.add(() => { tb = now(); sd = 0; od = 0; scan(); });
  scene.onBeforeAnimationsObservable.add(() => { ta = now(); });
  scene.onAfterAnimationsObservable.add(() => { taa = now(); });
  engine.onEndFrameObservable.add(() => {
    const te = now();
    // the pad: a slow circle on the left stick, A tapped every ~1.5 s of game time
    const g = (performance.now() - R.t0) / 1000;
    pad.axes[0] = Math.sin(g * 0.7) * 0.8; pad.axes[1] = -0.6 + Math.cos(g * 0.5) * 0.3;
    const a = (g % 1.5) < 0.12; pad.buttons[0].pressed = a; pad.buttons[0].value = a ? 1 : 0; pad.timestamp = performance.now();
    const h = heap(); if (h > h0) R.churn += h - h0; h0 = h; if (h > R.peak) R.peak = h;
    if (R.frames.length % 10 === 5) { const c0 = now(); let x = 0; for (let i = 0; i < 200000; i++) x += Math.sqrt(i) * 1.0001; R.calib.push(now() - c0 + (x < 0 ? 1 : 0)); }
    if (!ta) return;
    let parts = 0;
    for (const ps of scene.particleSystems) parts += ps.getActiveCount ? ps.getActiveCount() : 0;
    const act = scene.getActiveMeshes();
    let verts = 0; for (let i = 0; i < act.length; i++) verts += act.data[i].getTotalVertices();
    R.frames.push({
      work: te - tb, update: ta - tb, anim: taa - ta, render: te - taa,
      draws: si.drawCallsCounter.current, shadowDraws: sd, rtDraws: od, meshes: act.length, verts, parts, psys: scene.particleSystems.length,
    });
    ta = 0;
  });
  return 'ok';
})()`;

const SNAPSHOT = `(() => {
  const scene = window.__FEL_DEV__.scene; const engine = scene.getEngine();
  const cache = engine._internalTexturesCache || [];
  const RT = new Set([5, 6, 12, 14]);
  let texB = 0, rtB = 0;
  for (const t of cache) {
    const b = t.width * t.height * 4 * (t.generateMipMaps ? 1.33 : 1) * (t.isCube ? 6 : 1) * (t.is3D ? Math.max(1, t.depth) : 1);
    if (RT.has(t.source)) rtB += b; else texB += b;
  }
  const shadows = [];
  for (const l of scene.lights) {
    const sg = l.getShadowGenerator && l.getShadowGenerator();
    if (!sg) continue;
    const map = sg.getShadowMap && sg.getShadowMap();
    const size = map ? map.getSize().width : 0;
    shadows.push({ size, cascades: sg.numCascades || 1, casters: map && map.renderList ? map.renderList.length : 0, blur: !!sg.useBlurExponentialShadowMap, refresh: map ? map.refreshRate : 1 });
  }
  const cam = scene.activeCamera;
  const pps = cam && cam._postProcesses ? cam._postProcesses.filter(Boolean).length : 0;
  const bodies = scene.skeletons.filter((sk) => scene.meshes.some((m) => m.skeleton === sk && m.isEnabled() && m.isVisible)).length;
  const w = engine.getRenderWidth(), h = engine.getRenderHeight();
  return {
    tier: scene.metadata && scene.metadata.felTier, backing: w + 'x' + h, backingPx: w * h, hwScale: engine.getHardwareScalingLevel(),
    texMb: texB / 1048576, rtMb: rtB / 1048576, shadows, postPasses: pps, customRT: scene.customRenderTargets.length,
    bodies, skeletons: scene.skeletons.length, meshesTotal: scene.meshes.length, materials: scene.materials.length,
    animGroups: scene.animationGroups.filter((g) => g.isPlaying).length,
    beforeRenderObs: scene.onBeforeRenderObservable.observers.length, afterAnimObs: scene.onAfterAnimationsObservable.observers.length,
    gov: window.__FEL_PERF__ ? window.__FEL_PERF__.state() : null,
  };
})()`;

function pct(a: number[], p: number): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
}

interface Row { mode: string; profile: string; ok: boolean; note?: string; [k: string]: unknown }

async function run(b: Browser, mode: string, profile: string): Promise<Row> {
  const ctx = await b.newContext({ viewport: VIEW[profile], deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript({ content: INIT });
  const p = await Promise.race([ctx.newPage(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('newPage timed out')), 120000))]);
  const errs: string[] = [];
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
  const cons: string[] = [];
  p.on('console', (m) => { if (m.type() === 'error' || /FEL-MODE|load failed|WATCHDOG/.test(m.text())) cons.push(m.text().slice(0, 160)); });
  // a renderer the OOM killer took (a shared box) must not hang the sweep: every evaluate races the crash and a timeout
  let crashed = false;
  const crash = new Promise<never>((_, rej) => p.on('crash', () => { crashed = true; rej(new Error('page crashed')); }));
  crash.catch(() => {});
  const ev = <T,>(fn: string | (() => T)): Promise<T> => Promise.race([
    p.evaluate(fn as never) as Promise<T>, crash,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('evaluate timed out')), 120000)),
  ]);
  const t0 = Date.now();
  try {
    const url = PAGE ? `${PAGE}?mode=${mode}${QUERY ? '&' + QUERY.replace(/^\?/, '') : ''}` : `http://127.0.0.1:${PORT}/dev/mode/${mode}${QUERY}`;
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 240000 });
    let state = '';
    for (let i = 0; i < 180; i++) {
      state = await ev(() => (window as any).__phase ?? (/DEV · \S+ · (\w+)/.exec(document.body.innerText) ?? [])[1] ?? '');
      if (process.env.VERBOSE && i % 10 === 0) console.log(`  [${mode}/${profile}] t+${((Date.now() - t0) / 1000).toFixed(0)}s phase "${state}"`);
      if (state === 'playing') break;
      if (state === 'error') break;
      if (state === 'ready' || (PAGE && state && state !== 'loading' && i % 4 === 3)) {
        const bus = await ev(() => { const b = (window as any).__bus; if (!b) return false; b.emit({ t: 'button', btn: 'START', pressed: true }); b.emit({ t: 'button', btn: 'START', pressed: false }); return true; });
        const s = p.locator('text=/^START$/').first();
        if (!bus && await s.count()) await s.click({ timeout: 5000 }).catch(() => {});
      }
      await p.waitForTimeout(1000);
    }
    if (state !== 'playing') {
      const why = await ev(() => (/DEV · \S+ · \w+ · ([^\n]*)/.exec(document.body.innerText) ?? [])[1] ?? '').catch(() => '');
      return { mode, profile, ok: false, note: `never played (${state || 'no phase'}) ${why} ${errs[0] ?? ''} ${cons.slice(0, 2).join(' | ')}` };
    }
    const loadS = (Date.now() - t0) / 1000;
    if (RASTER !== 1) await ev(`(() => { const e = window.__FEL_DEV__.scene.getEngine(); e.setHardwareScalingLevel(e.getHardwareScalingLevel() * ${RASTER}); })()`);
    await ev(INSTRUMENT);
    const cdp = await Promise.race([ctx.newCDPSession(p), crash]);
    const send = (rate: number) => Promise.race([cdp.send('Emulation.setCPUThrottlingRate', { rate }), crash,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('cdp timed out')), 60000))]);
    await send(THROTTLE);
    // play SECONDS of game time (virtual clock), never more than 6 real minutes
    const tPlay = Date.now();
    for (let k = 0; ; k++) {
      const g = await ev(() => (performance.now() - (window as any).__REC.t0) / 1000);
      if (process.env.VERBOSE && k % 20 === 0) console.log(`  [${mode}/${profile}] game ${g.toFixed(1)}s after ${((Date.now() - tPlay) / 1000).toFixed(0)}s`);
      if (g >= SECONDS || Date.now() - tPlay > Number(process.env.PLAY_CAP_S ?? 360) * 1000) break;
      await p.waitForTimeout(500);
    }
    const snap = await ev(SNAPSHOT) as Record<string, unknown>;
    await send(1);
    const fr = (await ev(() => (window as any).__REC.frames)) as Array<Record<string, number>>;
    const govLog = (await ev(() => (window as any).__REC.gov)) as unknown[];
    const heapRec = (await ev(() => { const R = (window as any).__REC; return { churn: R.churn, peak: R.peak, calib: R.calib, t0: R.t0, now: performance.now() }; })) as { churn: number; peak: number; calib: number[]; t0: number; now: number };
    await cdp.send('HeapProfiler.collectGarbage');
    const heapUse = await cdp.send('Runtime.getHeapUsage') as { usedSize: number };
    const f = fr.slice(Math.min(30, Math.floor(fr.length / 4)));   // the first frames carry the throttle switch
    const col = (k: string) => f.map((x) => x[k]);
    const shadows = (snap.shadows as Array<{ size: number; cascades: number; casters: number; blur: boolean }>) ?? [];
    const shadowPx = shadows.reduce((s, x) => s + x.size * x.size * x.cascades * (x.blur ? 3 : 1), 0);
    const postPasses = Number(snap.postPasses ?? 0);
    const finalPhase = await ev(() => (/DEV · \S+ · (\w+)/.exec(document.body.innerText) ?? [])[1] ?? '');
    return {
      mode, profile, ok: true, loadS, frames: f.length, realS: (Date.now() - tPlay) / 1000, finalPhase,
      workP50: pct(col('work'), 0.5), workP95: pct(col('work'), 0.95),
      updP50: pct(col('update'), 0.5), animP50: pct(col('anim'), 0.5), renP50: pct(col('render'), 0.5),
      draws: pct(col('draws'), 0.5), drawsMax: Math.max(...col('draws')),
      meshes: pct(col('meshes'), 0.5), meshesMax: Math.max(...col('meshes')),
      vertsK: pct(col('verts'), 0.5) / 1000, vertsMaxK: Math.max(...col('verts')) / 1000,
      parts: pct(col('parts'), 0.5), partsMax: Math.max(...col('parts')), psysMax: Math.max(...col('psys')),
      shadowDraws: pct(col('shadowDraws'), 0.5), shadowDrawsMax: Math.max(...col('shadowDraws')), rtDraws: pct(col('rtDraws'), 0.5),
      heapPeakMb: heapRec.peak / 1048576, heapAfterGcMb: heapUse.usedSize / 1048576,
      churnMbPerS: heapRec.churn / 1048576 / Math.max(0.1, (heapRec.now - heapRec.t0) / 1000), calibMs: pct(heapRec.calib, 0.5),
      fillMpx: (Number(snap.backingPx) * (1 + postPasses) + shadowPx) / 1e6,
      ...snap, govLog, errors: errs.length, err0: errs[0],
    };
  } catch (e) {
    return { mode, profile, ok: false, crashed, note: String((e as Error).message).slice(0, 140) };
  } finally {
    await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 30000))]);
  }
}

const b = await chromium.launch({
  executablePath: chromiumExe(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'],
});
const rows: Row[] = [];
const jsonl = `${OUT}/sweep-${TAG}.jsonl`;
for (const mode of MODES) {
  for (const profile of PROFILES) {
    let r = await run(b, mode, profile);
    for (let k = 0; k < Number(process.env.RETRIES ?? 3) && !r.ok && /crash/i.test(String(r.note)); k++) {
      console.log(`${mode} ${profile}: renderer crashed (OOM on a shared box?) — retry ${k + 1}`);
      r = await run(b, mode, profile);
    }
    rows.push(r);
    fs.appendFileSync(jsonl, JSON.stringify(r) + '\n');
    const n = (k: string, d = 1) => (typeof r[k] === 'number' ? (r[k] as number).toFixed(d) : '-');
    console.log(r.ok
      ? `${mode.padEnd(17)} ${profile.padEnd(9)} work p50 ${n('workP50')} p95 ${n('workP95')} ms · draws ${n('draws', 0)} (shadow ${n('shadowDraws', 0)}) · meshes ${n('meshes', 0)} · verts ${n('vertsK', 0)}k · bodies ${r.bodies} · parts ${n('partsMax', 0)} · tex ${n('texMb', 0)} MB · heap ${n('heapAfterGcMb', 0)} MB · calib ${n('calibMs')} ms · ${r.backing}`
      : `${mode.padEnd(17)} ${profile.padEnd(9)} FAILED ${r.note}`);
  }
}
await b.close();
console.log(`wrote ${jsonl}`);

// ── the phone budget table (scripts/mobile-budget-tests.ts gates it) ────────────────────────────────────────────────
// WRITE_TABLE=1: fold this run (every profile; the worse of the two per metric) into lib/babylon/config/mobileBudget.json,
// budget = measured × headroom. CHECK=1: compare this run against the table's budgets and exit 1 on any mode over.
const TABLE = 'lib/babylon/config/mobileBudget.json';
const METRICS = ['drawCalls', 'activeMeshes', 'skinnedBodies', 'textureMb', 'particles'] as const;
type Nums = Record<(typeof METRICS)[number], number>;
const worst: Record<string, Nums> = {};
for (const r of rows) {
  if (!r.ok) continue;
  const m: Nums = {
    drawCalls: Math.round(Number(r.drawsMax)), activeMeshes: Math.round(Number(r.meshesMax)),
    skinnedBodies: Number(r.bodies), textureMb: Math.round(Number(r.texMb)), particles: Math.round(Number(r.partsMax)),
  };
  const w = worst[r.mode];
  worst[r.mode] = w ? (Object.fromEntries(METRICS.map((k) => [k, Math.max(w[k], m[k])])) as Nums) : m;
}
if (process.env.WRITE_TABLE || process.env.CHECK) {
  const HEADROOM = 1.2;   // TUNED: 20% over what the mode measured before it fails
  const t = fs.existsSync(TABLE) ? JSON.parse(fs.readFileSync(TABLE, 'utf8')) : {
    measuredAt: null, probe: 'scripts/probes/_perf-sweep.mts',
    profile: '390x844 portrait + 844x390 landscape, DPR 3, isMobile/hasTouch (mobile tier), SwiftShader, 4x CPU throttle, virtual time, a fake pad playing; worst of the two profiles',
    headroom: HEADROOM,
    // PerfMonitor's MOBILE_BUDGET for draws / meshes / texture; bodies and particles are perf-guard's (TUNED)
    ceiling: { drawCalls: 600, activeMeshes: 400, skinnedBodies: 10, textureMb: 256, particles: 1500 },
    modes: {}, knownOver: {},
  };
  if (process.env.CHECK) {
    const over: string[] = [];
    for (const [mode, m] of Object.entries(worst)) {
      const row = t.modes[mode];
      if (!row) { console.log(`CHECK ${mode}: no budget row`); continue; }
      for (const k of METRICS) if (m[k] > row.budget[k]) over.push(`${mode}.${k} ${m[k]} > budget ${row.budget[k]}`);
    }
    for (const o of over) console.error(`CHECK ✗ ${o}`);
    console.log(over.length ? `CHECK: ${over.length} over budget` : `CHECK: ${Object.keys(worst).length} modes inside their budgets`);
    if (over.length) process.exitCode = 1;
  } else {
    for (const [mode, m] of Object.entries(worst)) {
      // the same rule scripts/mobile-budget-tests.ts holds the table to (budgetFor there)
      const budget = Object.fromEntries(METRICS.map((k) => [k, m[k] > t.ceiling[k] ? m[k] : Math.min(t.ceiling[k], Math.ceil(m[k] * t.headroom))])) as Nums;
      t.modes[mode] = { measured: m, budget };
      const over = METRICS.filter((k) => m[k] > t.ceiling[k]);
      if (over.length) t.knownOver[mode] = over; else delete t.knownOver[mode];
    }
    t.measuredAt = new Date().toISOString().slice(0, 10);
    t.modes = Object.fromEntries(Object.entries(t.modes).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(TABLE, JSON.stringify(t, null, 2) + '\n');
    console.log(`wrote ${TABLE} (${Object.keys(worst).length} modes this run)`);
  }
}
