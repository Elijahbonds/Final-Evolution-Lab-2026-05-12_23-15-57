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
/** `?perf=off` measures the harness as it was before the guard (the guard installs nothing); '' measures it on. */
const QUERY = process.env.QUERY ?? (TAG === 'before' ? '?perf=off' : '');
fs.mkdirSync(OUT, { recursive: true });

const VIEW: Record<string, { width: number; height: number }> = {
  portrait: { width: 390, height: 844 },
  landscape: { width: 844, height: 390 },
};

const INIT = `(() => {
  const realNow = performance.now.bind(performance);
  window.__realNow = realNow;
  let vt = realNow(); const raf = window.requestAnimationFrame.bind(window);
  performance.now = () => vt;
  window.requestAnimationFrame = (cb) => raf(() => { vt += 1000 / 60; cb(vt); });
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
  const R = window.__REC = { frames: [], t0: performance.now() };
  let tb = 0, ta = 0, taa = 0;
  engine.onBeginFrameObservable.add(() => { tb = now(); });
  scene.onBeforeAnimationsObservable.add(() => { ta = now(); });
  scene.onAfterAnimationsObservable.add(() => { taa = now(); });
  engine.onEndFrameObservable.add(() => {
    const te = now();
    // the pad: a slow circle on the left stick, A tapped every ~1.5 s of game time
    const g = (performance.now() - R.t0) / 1000;
    pad.axes[0] = Math.sin(g * 0.7) * 0.8; pad.axes[1] = -0.6 + Math.cos(g * 0.5) * 0.3;
    const a = (g % 1.5) < 0.12; pad.buttons[0].pressed = a; pad.buttons[0].value = a ? 1 : 0; pad.timestamp = performance.now();
    if (!ta) return;
    let parts = 0;
    for (const ps of scene.particleSystems) parts += ps.getActiveCount ? ps.getActiveCount() : 0;
    const act = scene.getActiveMeshes();
    let verts = 0; for (let i = 0; i < act.length; i++) verts += act.data[i].getTotalVertices();
    R.frames.push({
      work: te - tb, update: ta - tb, anim: taa - ta, render: te - taa,
      draws: si.drawCallsCounter.current, meshes: act.length, verts, parts, psys: scene.particleSystems.length,
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
  const p = await ctx.newPage();
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
    await p.goto(`http://127.0.0.1:${PORT}/dev/mode/${mode}${QUERY}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    let state = '';
    for (let i = 0; i < 180; i++) {
      state = await ev(() => (/DEV · \S+ · (\w+)/.exec(document.body.innerText) ?? [])[1] ?? '');
      if (process.env.VERBOSE && i % 10 === 0) console.log(`  [${mode}/${profile}] t+${((Date.now() - t0) / 1000).toFixed(0)}s phase "${state}"`);
      if (state === 'playing') break;
      if (state === 'error') break;
      if (state === 'ready') {
        const s = p.locator('text=/^START$/').first();
        if (await s.count()) await s.click({ timeout: 5000 }).catch(() => {});
      }
      await p.waitForTimeout(1000);
    }
    if (state !== 'playing') {
      const why = await ev(() => (/DEV · \S+ · \w+ · ([^\n]*)/.exec(document.body.innerText) ?? [])[1] ?? '').catch(() => '');
      return { mode, profile, ok: false, note: `never played (${state || 'no phase'}) ${why} ${errs[0] ?? ''} ${cons.slice(0, 2).join(' | ')}` };
    }
    const loadS = (Date.now() - t0) / 1000;
    await ev(INSTRUMENT);
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    // play SECONDS of game time (virtual clock), never more than 6 real minutes
    const tPlay = Date.now();
    for (let k = 0; ; k++) {
      const g = await ev(() => (performance.now() - (window as any).__REC.t0) / 1000);
      if (process.env.VERBOSE && k % 20 === 0) console.log(`  [${mode}/${profile}] game ${g.toFixed(1)}s after ${((Date.now() - tPlay) / 1000).toFixed(0)}s`);
      if (g >= SECONDS || Date.now() - tPlay > 360000) break;
      await p.waitForTimeout(500);
    }
    const snap = await ev(SNAPSHOT) as Record<string, unknown>;
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const fr = (await ev(() => (window as any).__REC.frames)) as Array<Record<string, number>>;
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
      fillMpx: (Number(snap.backingPx) * (1 + postPasses) + shadowPx) / 1e6,
      ...snap, errors: errs.length, err0: errs[0],
    };
  } catch (e) {
    return { mode, profile, ok: false, crashed, note: String((e as Error).message).slice(0, 140) };
  } finally {
    await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 30000))]);
  }
}

const b = await chromium.launch({
  executablePath: chromiumExe(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
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
      ? `${mode.padEnd(17)} ${profile.padEnd(9)} work p50 ${n('workP50')} p95 ${n('workP95')} ms · draws ${n('draws', 0)} · meshes ${n('meshes', 0)} · verts ${n('vertsK', 0)}k · bodies ${r.bodies} · parts ${n('partsMax', 0)} · tex ${n('texMb', 0)} MB · ${r.backing}`
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
      const budget = Object.fromEntries(METRICS.map((k) => [k, Math.ceil(m[k] * t.headroom)])) as Nums;
      t.modes[mode] = { measured: m, budget };
      const over = METRICS.filter((k) => budget[k] > t.ceiling[k]);
      if (over.length) t.knownOver[mode] = over; else delete t.knownOver[mode];
    }
    t.measuredAt = new Date().toISOString().slice(0, 10);
    t.modes = Object.fromEntries(Object.entries(t.modes).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(TABLE, JSON.stringify(t, null, 2) + '\n');
    console.log(`wrote ${TABLE} (${Object.keys(worst).length} modes this run)`);
  }
}
