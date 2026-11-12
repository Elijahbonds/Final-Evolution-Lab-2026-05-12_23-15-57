// hoops-audit-show (2026-11-12): play each hoops screen the way a first-time player meets it and record how it LOOKS, SOUNDS and RUNS.
// Read-only: it drives the real page (./host-entry.tsx: GameShell + the mode's Babylon host) and changes nothing in the app.
//
//   node scripts/probes/hoops-gap/serve.mjs <site> 3356 &                       (the site from ./build.mts; stop it by its PID)
//   BASE=http://127.0.0.1:3356 MODES=onevone,dunk PROFILE=desktop|phone SECONDS=24 OUT=<dir> \
//     /home/user/wt/gate-run.sh 3000 npx tsx scripts/probes/hoops-audit/show/show.mts
//
// Per mode it writes <OUT>/<mode>-<profile>/run.json and JPG shots:
//   start card (the READY card), tip-off, mid-play every few game seconds, the moments it hears (a make, a replay, a cinematic cut),
//   pause, and the results card (the shell's own onEnd fed a sample result: window.__END — a whole game cannot be played on this box).
// What it measures (all on the GAME clock: 1/60 s per drawn frame, VIRTUAL, so a slow software-GL box plays the same seconds):
//   * camera: position and look direction every frame -> snaps (> 0.5 m or > 10 deg in one frame) outside cinematic cuts, turn rate p99,
//     FOV changes; the hero's feet and head projected -> hero in frame %, and every skinned body in frame % (3v3's six);
//   * GL program links by phase (loading / ready / playing) and when in play they happen (a mid-play shader compile is a hitch on a phone);
//   * sound: every SoundKit cue the game asked for (name, game time), Web Audio nodes made, media elements played, voice banks fetched;
//   * load: wall seconds to the READY card on THIS box (not a phone's), and the bytes the page fetched by kind (models, images, audio, js);
//   * the results card: is the first, focused button "play again", and how big is it.
// Shots are taken at full resolution; between shots the canvas is drawn coarse (RASTER) so the game moves at a usable pace on SwiftShader.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { chromiumExe } from '../../_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3356';
const MODES = (process.env.MODES ?? 'onevone').split(',').filter(Boolean);
const PROFILE = process.env.PROFILE ?? 'desktop';
const SECONDS = Number(process.env.SECONDS ?? 24);
const OUT = process.env.OUT ?? '/tmp/hoops-show';
const RASTER = Number(process.env.RASTER ?? 6);
const SHOT_EVERY = Number(process.env.SHOT_EVERY ?? 6);
const SEED = Number(process.env.SEED ?? 7);
const WALL_CAP_S = Number(process.env.WALL_CAP_S ?? 1500);
const LOCATION = process.env.LOCATION ?? '';   // a court location id (lib/babylon/nexus/courtLocations: venice, blossom, orbit, canopy, rooftop); '' = the default
const VIEW = PROFILE === 'phone'
  ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };

const INIT = `(() => {
  const realNow = performance.now.bind(performance); window.__realNow = realNow;
  let vt = realNow(); const raf = window.requestAnimationFrame.bind(window);
  performance.now = () => vt;
  let lastTs = -1; window.__vframes = 0;
  window.requestAnimationFrame = (cb) => raf((ts) => { if (ts !== lastTs) { lastTs = ts; vt += 1000 / 60; window.__vframes++; } cb(vt); });
  const si = window.setInterval.bind(window);
  window.setInterval = (fn, ms, ...a) => { let last = performance.now(); const want = Math.max(1, Number(ms) || 0); return si(() => { const n = performance.now(); if (n - last >= want) { last = n; fn(...a); } }, Math.min(want, 50)); };
  let t = ${SEED} >>> 0;
  Math.random = () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  const st = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...a) => st(fn, ms === 20000 ? 600000 : ms, ...a);   // the harness's 20 s load watchdog: a phone guard, not this box's
  window.__name = window.__name || function (f) { return f; };
  window.__TAG = 'loading'; window.__LINKS = [];
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue; const o = C.prototype.linkProgram;
    C.prototype.linkProgram = function (p) { const t0 = realNow(); const r = o.call(this, p); window.__LINKS.push([Math.round(performance.now()), Math.round(realNow() - t0), window.__TAG]); return r; };
  }
  window.__AUD = { osc: 0, buf: 0, decode: 0, media: 0, mediaSrc: [] };
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) {
    const p = AC.prototype;
    const co = p.createOscillator; p.createOscillator = function () { window.__AUD.osc++; return co.call(this); };
    const cb = p.createBufferSource; p.createBufferSource = function () { window.__AUD.buf++; return cb.call(this); };
    const dd = p.decodeAudioData; p.decodeAudioData = function (...a) { window.__AUD.decode++; return dd.apply(this, a); };
  }
  const mp = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__AUD.media++; if (window.__AUD.mediaSrc.length < 50) window.__AUD.mediaSrc.push(String(this.currentSrc || this.src).slice(-80)); return mp.call(this); };
  window.__LOG = [];
  const keep = /HOOPS-REPLAY|FEL-FRAME|REPLAY|POSTER|JUDGE|SLAM|MIC|celebrat|FINISH|MAKE|SCORE|SWISH|DUNK|1V1-SHOT|3V3-SHOT|3PT|CARNIVAL|walkIn|intro/i;
  for (const k of ['info', 'warn', 'log']) { const o = console[k]; console[k] = (...a) => { try { const m = String(a[0] ?? ''); if (keep.test(m) && window.__LOG.length < 4000) window.__LOG.push([Math.round(performance.now()), k, m.slice(0, 220)]); } catch (e) {} return o.apply(console, a); }; }
})()`;

// Once the scene exists: the per-frame recorder (camera, framing, draws, cinematic flag) and the scripted player.
const INSTRUMENT = (mode: string) => `(() => {
  const dev = window.__FEL_DEV__; const scene = dev.scene; const engine = scene.getEngine(); const now = window.__realNow;
  const si = dev.instrument(); const bus = dev.input;
  const R = window.__REC = { t0: performance.now(), f: [], bodiesSeen: 0 };
  const proj = (x, y, z) => { const m = scene.getTransformMatrix().m; const w = x * m[3] + y * m[7] + z * m[11] + m[15]; if (w <= 0) return null; return [(x * m[0] + y * m[4] + z * m[8] + m[12]) / w, (x * m[1] + y * m[5] + z * m[9] + m[13]) / w]; };
  const inside = (p) => !!p && Math.abs(p[0]) <= 1 && Math.abs(p[1]) <= 1;
  let tb = 0;
  engine.onBeginFrameObservable.add(() => { tb = now(); });
  // the scripted player: one function of game time, run before each frame
  const down = {}; const btn = (b, on) => { if (!!down[b] === on) return; down[b] = on; bus.emit({ t: 'button', btn: b, pressed: on }); };
  let lastStick = ''; const stick = (x, y) => { const k = x.toFixed(2) + ',' + y.toFixed(2); if (k === lastStick) return; lastStick = k; bus.emit({ t: 'stick', side: 'L', x, y }); };
  let lastTrig = -1; const trig = (v) => { if (v === lastTrig) return; lastTrig = v; bus.emit({ t: 'trigger', side: 'R', value: v }); };
  const MODE = ${JSON.stringify(mode)};
  const play = (g) => {
    if (window.__HOLD) { stick(0, 0); trig(0); for (const b of ['A', 'X', 'Y']) btn(b, false); return; }
    if (MODE === 'onevone' || MODE === 'threevthree') {
      stick(Math.sin(g * 0.9) * 0.55, -0.85);
      const c = g % 4.2; btn('X', c > 2.9 && c < 3.38);   // a jumper: hold, let go
      btn('Y', MODE === 'onevone' && (g % 7) > 6.6 && (g % 7) < 6.75);   // a block jump on their gather, now and then
      btn('A', MODE === 'threevthree' && (g % 5.5) > 1.0 && (g % 5.5) < 1.08);   // a pass
    } else if (MODE === 'threepoint') {
      stick(0, 0); const c = g % 2.4; btn('X', c > 1.2 && c < 1.66);
    } else if (MODE === 'dunk' || MODE === 'dunkduel') {
      const c = g % 16;
      if (c < 5.5) { trig(1); stick(0, -1); btn('A', false); }
      else if (c < 9) { trig(0); stick(0, 0); btn('A', ((c - 5.5) % 0.25) < 0.08); }
      else { trig(0); stick(0, 0); btn('A', false); }
    } else {   // carnival: A through the cards, and on the event
      const c = g % 1.4; btn('A', c < 0.08); stick(Math.sin(g) * 0.5, -0.6);
    }
  };
  scene.onBeforeRenderObservable.add(() => { try { play((performance.now() - R.t0) / 1000); } catch (e) { R.err = String(e && e.message || e); } });
  let bodies = [];
  const scanBodies = () => { const seen = new Set(); bodies = []; for (const m of scene.meshes) { if (!m.skeleton || !m.isEnabled() || !m.isVisible || seen.has(m.skeleton)) continue; if (/__crowd/.test(m.name)) continue; seen.add(m.skeleton); bodies.push(m); } };
  engine.onEndFrameObservable.add(() => {
    const cam = scene.activeCamera; if (!cam) return;
    if (R.f.length % 30 === 0) scanBodies();
    const p = cam.globalPosition; const d = cam.getForwardRay(1).direction;
    const h = dev.hero(); let feet = null, head = null;
    if (h) { const q = h.getAbsolutePosition(); feet = proj(q.x, q.y + 0.05, q.z); head = proj(q.x, q.y + 1.85, q.z); }
    let bin = 0;
    for (const m of bodies) { const c = m.getBoundingInfo().boundingSphere.centerWorld; if (inside(proj(c.x, c.y, c.z))) bin++; }
    const md = scene.metadata || {};
    R.f.push([Math.round((performance.now() - R.t0) / 16.6667), +p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3), +d.x.toFixed(4), +d.y.toFixed(4), +d.z.toFixed(4),
      +(cam.fov || 0).toFixed(4), feet ? +feet[0].toFixed(3) : 9, feet ? +feet[1].toFixed(3) : 9, head ? +head[0].toFixed(3) : 9, head ? +head[1].toFixed(3) : 9,
      bodies.length, bin, md.felCinematic ? 1 : 0, si.drawCallsCounter.current, Math.round((now() - tb) * 10) / 10, window.__TAG === 'playing' ? 1 : 0]);
    if (R.f.length > 60000) R.f.shift();
  });
  return 'ok';
})()`;

const FCOLS = ['frame', 'px', 'py', 'pz', 'dx', 'dy', 'dz', 'fov', 'feetX', 'feetY', 'headX', 'headY', 'bodies', 'bodiesIn', 'cine', 'draws', 'workMs', 'playing'];

async function runMode(b: import('playwright-core').Browser, mode: string) {
  const dir = path.join(OUT, `${mode}-${PROFILE}${LOCATION ? '-' + LOCATION : ''}`); fs.mkdirSync(dir, { recursive: true });
  const ctx = await b.newContext({ ...VIEW });
  await ctx.addInitScript({ content: INIT });
  const p = await ctx.newPage();
  const errs: string[] = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  const bytes: Record<string, number> = {}; const reqs: string[] = [];
  p.on('response', async (r) => {
    try {
      const u = new URL(r.url()); if (/^\/[0-9a-f-]{36}$/.test(u.pathname) || u.protocol === 'blob:') return; const ext = (path.extname(u.pathname).toLowerCase() || '(none)');
      const kind = /\.(glb|gltf|bin)$/.test(ext) && !u.pathname.includes('/audio/') ? 'models' : /\.(png|jpg|jpeg|webp|ktx2|env|hdr)$/.test(ext) ? 'images'
        : u.pathname.includes('/audio/') || /\.(mp3|ogg|wav|m4a)$/.test(ext) ? 'audio' : /\.(js|mjs)$/.test(ext) ? 'js' : /\.(woff2|css|html)$/.test(ext) ? 'page' : 'other';
      const len = Number(r.headers()['content-length'] ?? 0);
      bytes[kind] = (bytes[kind] ?? 0) + len; if (reqs.length < 400) reqs.push(`${kind} ${Math.round(len / 1024)}KB ${u.pathname}`);
    } catch { /* a response we cannot read is not counted */ }
  });
  const ev = <T,>(fn: string | (() => T), cap = 180000): Promise<T> => Promise.race([p.evaluate(fn as never) as Promise<T>, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('evaluate timed out')), cap))]);
  const shots: string[] = [];
  const baseScale = async () => ev<number>(`(() => { const d = window.__FEL_DEV__; return d ? d.scene.getEngine().getHardwareScalingLevel() : 1; })()`);
  let base = 1;
  const setScale = (s: number) => ev(`(() => { const d = window.__FEL_DEV__; if (d) d.scene.getEngine().setHardwareScalingLevel(${s}); return 1; })()`);
  const frames = () => ev<number>(() => (window as unknown as { __vframes: number }).__vframes);
  const waitFrames = async (n: number, capMs = 120000) => { const f0 = await frames(); const t = Date.now(); while ((await frames()) < f0 + n && Date.now() - t < capMs) await p.waitForTimeout(150); };
  const shot = async (name: string, full = true) => {
    const hasDev = await ev<boolean>(() => !!(window as unknown as { __FEL_DEV__?: unknown }).__FEL_DEV__);
    if (full && hasDev) { await setScale(base); await waitFrames(2); }
    const f = path.join(dir, `${String(shots.length).padStart(2, '0')}-${name}.jpg`);
    await p.screenshot({ path: f, type: 'jpeg', quality: 82, timeout: 300000 }); shots.push(path.basename(f));
    if (full && hasDev) await setScale(base * RASTER);
    console.log(`  [${mode}/${PROFILE}] shot ${path.basename(f)}`);
  };
  const t0 = Date.now(); const wall = () => (Date.now() - t0) / 1000;
  const out: Record<string, unknown> = { mode, profile: PROFILE, view: VIEW, seed: SEED, when: new Date().toISOString() };
  try {
    await p.goto(`${BASE}/host/index.html?mode=${mode}&agent=1&perf=off${LOCATION ? '&location=' + LOCATION : ''}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    // the READY card ('TAP TO START' on the shared boot splash)
    await p.waitForFunction(() => /TAP TO START|PRESS START|START/i.test(document.body.innerText) && !!(window as unknown as { __FEL_DEV__?: unknown }).__FEL_DEV__, null, { timeout: 900000, polling: 1000 });
    out.wallToReadyS = wall(); out.vframesToReady = await frames();
    await ev(`window.__TAG = 'ready'`);
    base = await baseScale(); out.baseScale = base;
    await setScale(base * RASTER);
    await waitFrames(30); await shot('start-card');
    out.startCardText = await ev<string>(() => document.body.innerText.slice(0, 1600));
    // START: the card's own button (what a tap does), else the bus
    await ev(`window.__HOLD = 1`);   // the scripted player waits until the game is started (a stick move can wake READY; the card's START then PAUSES)
    await ev(INSTRUMENT(mode));
    const clicked = await p.locator('text=/TAP TO START/i').first().click({ timeout: 8000 }).then(() => true).catch(() => false);
    if (!clicked) await ev(`(() => { const b = window.__FEL_DEV__.input; b.emit({ t: 'button', btn: 'START', pressed: true }); b.emit({ t: 'button', btn: 'START', pressed: false }); })()`);
    out.startBy = clicked ? 'tap' : 'bus';
    await ev(`window.__TAG = 'playing'`);
    await setScale(base * RASTER);
    const PAUSED = /PAUSED — TAP TO RESUME/;
    const resumeIfPaused = async (): Promise<boolean> => {
      const paused = await ev<boolean>(`${PAUSED}.test(document.body.innerText)`);
      if (paused) await ev(`(() => { const b = window.__FEL_DEV__.input; b.emit({ t: 'button', btn: 'START', pressed: true }); b.emit({ t: 'button', btn: 'START', pressed: false }); })()`);
      return paused;
    };
    await waitFrames(20);
    out.pausedAfterStart = await resumeIfPaused();
    await waitFrames(10); await shot('tipoff');
    await ev(`window.__HOLD = 0`);
    let autoResumed = 0;
    // play SECONDS of game time; periodic shots plus the moments
    let nextShot = SHOT_EVERY; const tPlay = Date.now(); let seenLog = 0; const fired: Record<string, number> = {};
    let sfxSeen = 0;
    for (;;) {
      const st = await ev<{ g: number; log: [number, string, string][]; sfx: { t: number; name: string }[]; cine: number }>(`(() => ({ g: (performance.now() - window.__REC.t0) / 1000, log: window.__LOG.slice(${seenLog}), sfx: (window.__SFX || []).slice(${sfxSeen}), cine: (window.__FEL_DEV__.scene.metadata || {}).felCinematic ? 1 : 0 }))()`);
      seenLog += st.log.length; sfxSeen += st.sfx.length;
      const want: string[] = [];
      if (st.sfx.some((s) => s.name === 'score' || s.name === 'swish') && (fired.make ?? 0) < 2) want.push('make');
      if (st.log.some(([, , m]) => /HOOPS-REPLAY|REPLAY/i.test(m)) && (fired.replay ?? 0) < 2) want.push('replay');
      if (st.cine && (fired.cine ?? 0) < 2) want.push('cinematic');
      for (const w of want) { fired[w] = (fired[w] ?? 0) + 1; await waitFrames(w === 'make' ? 12 : 30); await shot(`${w}-${fired[w]}-g${st.g.toFixed(1)}`); }
      if (await resumeIfPaused()) { autoResumed++; await waitFrames(5); continue; }
      if (st.g >= nextShot) { await shot(`play-g${st.g.toFixed(1)}`); nextShot += SHOT_EVERY; }
      if (st.g >= SECONDS || Date.now() - tPlay > WALL_CAP_S * 1000) { out.gameSecondsPlayed = st.g; out.wallPlayS = (Date.now() - tPlay) / 1000; out.autoResumed = autoResumed; break; }
      await p.waitForTimeout(800);
    }
    // the pause (the shell's / host's own: START on the pad), then back
    await ev(`(() => { window.__HOLD = 1; const b = window.__FEL_DEV__.input; b.emit({ t: 'button', btn: 'START', pressed: true }); b.emit({ t: 'button', btn: 'START', pressed: false }); })()`);
    await waitFrames(20); await shot('pause');
    out.pauseText = await ev<string>(() => document.body.innerText.slice(0, 2400));
    await ev(`(() => { const b = window.__FEL_DEV__.input; b.emit({ t: 'button', btn: 'START', pressed: true }); b.emit({ t: 'button', btn: 'START', pressed: false }); })()`);
    await waitFrames(10);
    // what was recorded in play
    out.rec = await ev(`(() => ({ cols: ${JSON.stringify(FCOLS)}, f: window.__REC.f, err: window.__REC.err || null }))()`);
    out.links = await ev(`window.__LINKS`);
    out.audio = await ev(`({ aud: window.__AUD, sfx: window.__SFX || [] })`);
    out.log = await ev(`window.__LOG`);
    out.heapMb = await ev<number>(() => { const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory; return m ? Math.round(m.usedJSHeapSize / 1048576) : -1; });
    out.scene = await ev(`(() => { const s = window.__FEL_DEV__.scene; const e = s.getEngine(); const tex = (e._internalTexturesCache || []); let mb = 0; for (const t of tex) mb += t.width * t.height * 4 * (t.generateMipMaps ? 1.33 : 1) * (t.isCube ? 6 : 1) / 1048576;
      return { tier: s.metadata && s.metadata.felTier, meshes: s.meshes.length, materials: s.materials.length, textures: s.textures.length, texMb: Math.round(mb), skeletons: s.skeletons.length,
        lights: s.lights.length, shadowGens: s.lights.filter((l) => l.getShadowGenerator && l.getShadowGenerator()).length, post: (s.activeCamera && s.activeCamera._postProcesses || []).filter(Boolean).map((pp) => pp.name).slice(0, 20),
        hw: e.getHardwareScalingLevel(), backing: e.getRenderWidth() + 'x' + e.getRenderHeight(), fxaa: !!(s.postProcessRenderPipelineManager && s.postProcessRenderPipelineManager.supportedPipelines.some((pl) => pl.fxaaEnabled)), samples: (s.postProcessRenderPipelineManager && s.postProcessRenderPipelineManager.supportedPipelines.map((pl) => pl.samples)) || [] }; })()`);
    // the results card: the shell's own onEnd with a sample result
    await setScale(base * RASTER);
    const ended = await ev<boolean>(() => { const w = window as unknown as { __END?: (won: boolean) => void }; if (!w.__END) return false; w.__END(true); return true; });
    out.resultsBy = ended ? 'sample onEnd' : 'none';
    if (ended) {
      await waitFrames(300);
      await shot('results', false);
      out.results = await ev(`(() => { const a = document.activeElement; const r = a && a.getBoundingClientRect ? a.getBoundingClientRect() : null;
        const btns = [...document.querySelectorAll('button')].filter((x) => x.offsetParent).map((x) => { const q = x.getBoundingClientRect(); return { t: (x.innerText || x.getAttribute('aria-label') || '').trim().slice(0, 40), w: Math.round(q.width), h: Math.round(q.height), y: Math.round(q.y) }; });
        return { focused: a ? (a.innerText || a.getAttribute('aria-label') || a.tagName).trim().slice(0, 60) : null, focusedBox: r ? [Math.round(r.width), Math.round(r.height)] : null, buttons: btns.slice(0, 30), text: document.body.innerText.slice(0, 2000) }; })()`);
    }
  } catch (e) {
    out.error = String((e as Error).message).slice(0, 300);
    try { await shot('error', false); } catch { /* nothing to photograph */ }
  } finally {
    out.wallTotalS = wall(); out.bytes = bytes; out.requests = reqs; out.errors = errs.slice(0, 30); out.shots = shots;
    fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(out));
    await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 30000))]);
  }
  console.log(`[show] ${mode}/${PROFILE} done in ${wall().toFixed(0)} s${out.error ? ' ERROR ' + out.error : ''}`);
}

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'] });
for (const m of MODES) await runMode(b, m);
await b.close();
