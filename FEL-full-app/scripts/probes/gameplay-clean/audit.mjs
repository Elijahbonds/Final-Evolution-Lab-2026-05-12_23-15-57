// gameplay-clean audit driver (lane/gameplay-clean, 2026-10-28). Owner: "Gameplay needs to be really clean. All tools need
// to be accessible, easy to use." One headless run per mode of the REAL /play page (./entry.tsx, built by ./build.mjs and
// served statically), on a sideways phone (844x390, touch; DPR 1 so a drawn photograph is affordable on software GL), with scripted keyboard play for PLAY_S seconds of game
// time, recording what the player would see:
//
//   motion   animation pops (a bone's angular speed ≥ 600°/s and ≥ 3.5× its neighbourhood — the motion probe's rule), root
//            jumps, T-pose / rest-pose frames on the hero, foot skate (a planted foot's slide while the hero moves)
//   camera   cuts (a one-frame jump of the eye > 0.6 m or the target > 0.8 m — the dunk probe's rule), and whether the hero
//            can be seen: three rays (head, chest, hips) from the eye to the hero, blocked by a visible mesh that is not
//            the hero's own (hidden = 2 of 3 blocked), every 4th frame
//   HUD      on-screen words (DOM + Babylon GUI), text under 12 px, overlapping text, low contrast, small tap targets — on
//            the READY card, in play (three moments) and on the pause
//   perf     CPU frame time (the GPU's draws skipped, FAST=1: the dunk lane's validated fast mode) — the whole run, and a
//            phone-tier window (4× CDP CPU throttle) at the end; draw calls per frame (counted, even when skipped) against
//            the mobile budget (PerfMonitor MOBILE_BUDGET 600); wall time to READY and to the first playing frame
//   input    press → the hero's first visible change (a clip change or a joint ≥ 5 cm off its extrapolated path), per tap
//   flow     the phase timeline; the longest stretch of play where nothing moved and nothing on screen changed (stuck)
//   controls a pause reachable on each device (START / ESC; a touch button), the controls panel on READY and on pause, a way
//            out, the feel panel's tab, the touch deck answering a tap
//   errors   page errors and console errors
//
// The clock is virtual from TAP TO START (every rendered frame is 1/60 s of game time; timers and intervals run on it), so
// the motion numbers are a function of frames, not of this machine's load. The load is timed on the wall clock.
//
//   node audit.mjs <outDir> <mode,mode,...>     env: PORT=3661 PLAY_S=45 FAST=1 SHOTS=1 RM=0 (1: prefers-reduced-motion)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const require = createRequire(new URL('../../../package.json', import.meta.url).pathname);
const { chromium } = require('playwright-core');

const [OUT, MODES_ARG] = process.argv.slice(2);
if (!OUT || !MODES_ARG) { console.error('usage: node audit.mjs <outDir> <mode,...>'); process.exit(2); }
const MODES = MODES_ARG.split(',').filter(Boolean);
const PORT = process.env.PORT ?? '3661';
const PLAY_S = Number(process.env.PLAY_S ?? 30);
const PAUSE_AT = Number(process.env.PAUSE_AT ?? 14);
const PERF_S = Number(process.env.PERF_S ?? 3);
const FAST = process.env.FAST !== '0';
const SHOTS = process.env.SHOTS !== '0';
const RM = process.env.RM === '1';
const TAG = process.env.TAG ?? (RM ? 'rm' : 'base');
const QS = process.env.QS ?? '';
const BOOT_S = Number(process.env.BOOT_S ?? 170);
const MODE_WALL_S = Number(process.env.MODE_WALL_S ?? 300);   // the play loop's wall budget: past it, what was recorded is analysed (partial)
fs.mkdirSync(OUT, { recursive: true });

// ── the page's clock, input and recorder (installed before any module runs) ───────────────────────────────────────────
const INIT = `(() => {
  const realNow = performance.now.bind(performance); window.__realNow = realNow;
  { let t = 7 >>> 0; Math.random = () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
  window.__name = window.__name || function (f) { return f; };
  let vt = 0; window.__vtOn = false; window.__freeze = false; window.__vtFrames = 0;
  performance.now = () => (window.__vtOn ? vt : realNow());
  window.__vtStart = () => { vt = realNow(); window.__vt0 = vt; window.__vtOn = true; };
  window.__gameS = () => (window.__vtOn ? (vt - window.__vt0) / 1000 : -1);
  const nST = window.setTimeout.bind(window), nCT = window.clearTimeout.bind(window), nSI = window.setInterval.bind(window), nCI = window.clearInterval.bind(window);
  const timers = new Map(); let tid = 1e7;
  window.setTimeout = (fn, ms, ...a) => {
    if (!window.__vtOn || typeof fn !== 'function') return nST(fn, ms, ...a);
    const id = tid++; timers.set(id, { at: vt + Math.max(0, Number(ms) || 0), fn, a }); return id;
  };
  window.clearTimeout = (id) => { if (timers.has(id)) timers.delete(id); else nCT(id); };
  // intervals run on game time once it is on (performance.now is real until then): the watchdog's 1 s sample would
  // otherwise fire every few frames on a slow software-GL box (the perf-lag rig's rule)
  window.setInterval = (fn, ms, ...a) => { let last = performance.now(); const want = Math.max(1, Number(ms) || 0);
    return nSI(() => { const n = performance.now(); if (n - last >= want) { last = n; fn(...a); } }, Math.min(want, 50)); };
  const runDue = () => { for (const [id, t] of [...timers]) if (t.at <= vt + 1e-6) { timers.delete(id); nST(() => t.fn(...t.a), 0); } };
  const raf = window.requestAnimationFrame.bind(window); let lastTs = -1;
  window.requestAnimationFrame = (cb) => raf((ts) => {
    if (ts !== lastTs) { lastTs = ts; if (window.__vtOn && !window.__freeze) { vt += 1000 / 60; window.__vtFrames++; try { window.__onVtFrame && window.__onVtFrame(); } catch (e) { window.__scriptErr = String(e); } runDue(); } }
    cb(window.__vtOn ? vt : ts);
  });
  window.__errs = []; window.addEventListener('error', (e) => window.__errs.push('error: ' + (e.message || '').slice(0, 200)));
})()`;

// ── the recorder: binds to __FEL_DEV__ (scene, hero), counts draws, times frames, samples the hero's visibility ─────────
function installRecorder(cfg) {
  const W = window, dev = W.__FEL_DEV__, scene = dev.scene, engine = scene.getEngine();
  const R = W.__rec = { frames: [], clips: [], clipIx: new Map(), occNames: [], occIx: new Map(), presses: [], bus: [], keys: new Set(), heroOk: false, skel: false, frameNo: 0 };
  const ix = (map, arr, s) => { let i = map.get(s); if (i === undefined) { i = arr.length; arr.push(s); map.set(s, i); } return i; };
  // DRAWS: counted always; skipped while FAST unless a photograph needs the pixels
  let draws = 0; W.__fast = cfg.fast; W.__drawOn = !cfg.fast; W.__drawnFrames = 0;
  const de = engine.drawElementsType.bind(engine), da = engine.drawArraysType.bind(engine);
  engine.drawElementsType = (...a) => { draws++; if (W.__drawOn) de(...a); };
  engine.drawArraysType = (...a) => { draws++; if (W.__drawOn) da(...a); };
  // the render watchdog photographs the canvas; under FAST it would see the clear colour and "rescue" a healthy game
  const T = W.__BABYLON_TOOLS;
  if (T && cfg.fast) { const orig = T.CreateScreenshot; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, 64, 64); const gray = c.toDataURL();
    T.CreateScreenshot = (eng, cam, size, cb, ...rest) => (W.__drawOn ? orig(eng, cam, size, cb, ...rest) : (cb && setTimeout(() => cb(gray), 0))); }
  let fb = 0;
  engine.onBeginFrameObservable.add(() => { fb = W.__realNow(); draws = 0; });
  const clean = (n) => n.replace(/^mixamorig:?/, '').replace(/_c\d+$/, '').replace(/^.*[:|]/, '');
  const JN = ['Hips', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase', 'LeftHand', 'RightHand', 'Head', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'Spine2'];
  const QN = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];
  let heroRef = null, jn = null, qn = null, rest = null, heroMeshes = null, bindAt = -99;
  const bind = (hero) => {
    heroRef = hero; jn = qn = rest = null; heroMeshes = new Set();
    if (!hero) return;
    try { for (const m of hero.getChildMeshes(false)) heroMeshes.add(m); if (hero.getClassName && /Mesh/.test(hero.getClassName())) heroMeshes.add(hero); } catch {}
    const sk = scene.skeletons.find((s) => s.bones.some((b) => { const t = b.getTransformNode && b.getTransformNode(); return t && (t === hero || t.isDescendantOf(hero)); }));
    if (!sk) return;
    const byName = new Map(); const restQ = new Map();
    for (const b of sk.bones) { const t = b.getTransformNode && b.getTransformNode(); if (!t) continue; const n = clean(t.name); byName.set(n, t);
      try { const q = new t.rotationQuaternion.constructor(); b.getRestPose().decompose(undefined, q, undefined); restQ.set(n, q); } catch {} }
    jn = JN.map((n) => byName.get(n) || null); qn = QN.map((n) => byName.get(n) || null); rest = QN.map((n) => restQ.get(n) || null);
    R.skel = true;
  };
  const r4 = (x) => Math.round(x * 1e4) / 1e4, r3 = (x) => Math.round(x * 1e3) / 1e3;
  const camPose = () => { const c = scene.activeCamera; if (!c) return [0, 0, 0, 0, 0, 0];
    const e = c.globalPosition || c.position; let t = null;
    try { t = c.getTarget ? c.getTarget() : null; } catch {}
    if (!t) { try { const r = c.getForwardRay(10); t = r.origin.add(r.direction.scale(10)); } catch { t = e; } }
    return [r3(e.x), r3(e.y), r3(e.z), r3(t.x), r3(t.y), r3(t.z)]; };
  // the hero's visibility: rays from the eye to head, chest and hips; a visible, non-hero mesh in between, bigger than a ball
  const Ray = scene.activeCamera ? scene.activeCamera.getForwardRay(1).constructor : null;
  const occlusion = (pts) => {
    const c = scene.activeCamera; if (!c || !Ray) return [-1, -1];
    const e = c.globalPosition || c.position; let blocked = 0, who = -1;
    for (const p of pts) {
      if (!p) continue;
      const d = p.subtract(e); const len = d.length(); if (len < 0.3) continue;
      const ray = new Ray(e.clone(), d.scale(1 / len), len - 0.25);
      // the props and the world only: a skinned body (a rival, a horde fighter, their kit) in front of the hero is play, not a blocked view
      const hit = scene.pickWithRay(ray, (m) => m.isEnabled() && m.isVisible && (m.visibility === undefined || m.visibility > 0.25) && !heroMeshes.has(m) && !m.skeleton
        && m.getTotalVertices && m.getTotalVertices() > 0 && !(m.material && m.material.alpha !== undefined && m.material.alpha < 0.3)
        && (m.getBoundingInfo().boundingSphere.radiusWorld > 0.3) && !/sky|ground|floor|court$|water|ocean|backdrop|dome|fog/i.test(m.name), false);
      if (hit && hit.hit) { blocked++; if (who < 0) who = ix(R.occIx, R.occNames, hit.pickedMesh ? hit.pickedMesh.name.slice(0, 40) : '?'); }
    }
    return [blocked, who];
  };
  try { dev.input.on((e) => { if (R.bus.length < 4000) R.bus.push([W.__gameS(), e.t, e.btn || e.side || e.dir || '', e.pressed === undefined ? (e.value ?? e.x ?? '') : e.pressed, e.src || '']); }); } catch {}
  const projIn = (p) => { try { const c = scene.activeCamera; const eng = scene.getEngine(); const w = eng.getRenderWidth(), hh = eng.getRenderHeight();
    const V = p.constructor; const M = scene.getTransformMatrix(); const s = V.Project(p, M.constructor.Identity(), M, c.viewport.toGlobal(w, hh));
    return s.z > 0 && s.z < 1 && s.x >= 0 && s.x <= w && s.y >= 0 && s.y <= hh ? 1 : 0; } catch { return -1; } };
  scene.onAfterRenderObservable.add(() => {
    if (W.__drawOn) W.__drawnFrames++;
    if (!W.__vtOn) return;
    const fe = W.__realNow() - fb; const r0 = W.__realNow();
    const h = dev.hero ? dev.hero() : null;
    if (h !== heroRef && R.frameNo - bindAt > 30) { bindAt = R.frameNo; bind(h); }
    const ss = W.__sessionStore ? W.__sessionStore.view() : null;
    const f = { t: r3(W.__gameS()), ph: ss ? ss.phase : null, d: draws, ms: r3(fe), k: [...R.keys].join('') };
    R.frameNo++;
    if (heroRef && jn) {
      try {
        const rp = heroRef.getAbsolutePosition(); f.r = [r3(rp.x), r3(rp.y), r3(rp.z)];
        f.j = jn.map((n) => { if (!n) return null; const p = n.getAbsolutePosition(); return [r3(p.x), r3(p.y), r3(p.z)]; });
        let restN = 0, restOk = 0;
        f.q = qn.map((n, i) => { if (!n || !n.rotationQuaternion) return null; const q = n.rotationQuaternion;
          const rq = rest[i]; if (rq) { restN++; const dot = Math.abs(q.x * rq.x + q.y * rq.y + q.z * rq.z + q.w * rq.w); if (dot > 0.99966) restOk++; }   // within 3°
          return [r4(q.x), r4(q.y), r4(q.z), r4(q.w)]; });
        f.rest = restN ? r3(restOk / restN) : null;
        if (R.frameNo % 4 === 0) {
          const pts = [jn[7] ? jn[7].getAbsolutePosition() : null, jn[12] ? jn[12].getAbsolutePosition() : null, jn[0] ? jn[0].getAbsolutePosition() : null];
          const [b, who] = occlusion(pts); f.oc = b; f.ow = who; f.inf = pts[1] ? projIn(pts[1]) : -1;
        }
      } catch (e) { f.err = String(e).slice(0, 80); }
      try { const a = dev.anim && dev.anim(); if (a && a.playing) { const top = a.playing.filter((p) => p.weight > 0.3).map((p) => p.clip).sort().join('+'); f.c = ix(R.clipIx, R.clips, top); } } catch {}
    }
    f.cam = camPose();
    if (R.frameNo % 30 === 0) { const txt = (document.body.innerText || '').replace(/\s+/g, ' '); let hsh = 0; for (let i = 0; i < txt.length; i++) hsh = (hsh * 31 + txt.charCodeAt(i)) | 0; f.dom = hsh; }
    f.rm = Math.round((W.__realNow() - r0) * 100) / 100;
    R.frames.push(f);
  });
}

// ── the scripted player (keyboard, in the page, on game time) ─────────────────────────────────────────────────────────
function installScript(cfg) {
  const W = window; const R = W.__rec;
  const kd = (k) => { if (R.keys.has(k)) return; R.keys.add(k); W.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); };
  const ku = (k) => { if (!R.keys.has(k)) return; R.keys.delete(k); W.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true })); };
  // the timeline (game seconds from the first playing frame): idle, forward, run right, a circle, left, PAUSE at
  // cfg.pauseAt (held until the driver has photographed it), then mixed play with the run held in bursts; a face-button tap
  // every 1.3 s (A, A, B, A, X, A, Y …), none in the second either side of the pause
  const P = cfg.pauseAt;
  const S = W.__S = { t0: null, tapUntil: new Map(), nextTap: 2, tapI: 0, pauseState: 'pending', resumeAt: null, done: false };
  const CYCLE = ['j', 'j', 'k', 'j', 'l', 'j', 'i'];
  const tap = (k, t) => { kd(k); S.tapUntil.set(k, t + 0.1); R.presses.push([t, k, R.frameNo]); };
  const hold = (want) => { for (const k of ['w', 'a', 's', 'd', ' ']) (want.includes(k) ? kd : ku)(k); };
  W.__onVtFrame = () => {
    const ss = W.__sessionStore ? W.__sessionStore.view() : null; const ph = ss ? ss.phase : null;
    if (S.t0 === null) { if (ph === 'playing') S.t0 = W.__gameS(); else return; }
    const t = W.__gameS() - S.t0; S.t = t;
    for (const [k, until] of [...S.tapUntil]) if (t >= until) { ku(k); S.tapUntil.delete(k); }
    if (S.done) { hold([]); return; }
    if (S.pauseState === 'pending' && t >= P) { hold([]); tap('escape', t); S.pauseState = 'pressed'; S.pressedAt = t; return; }
    if (S.pauseState === 'pressed') { hold([]); if (ph === 'paused') { S.pauseState = 'paused'; S.pausedAfter = t - S.pressedAt; } else if (t - S.pressedAt > 1.5) S.pauseState = 'failed'; return; }
    if (S.pauseState === 'paused') { hold([]); if (W.__pauseAck || t - S.pressedAt > 12) { tap('j', t); S.pauseState = 'resuming'; S.resumeAt = t; } return; }
    if (S.pauseState === 'resuming') { if (ph === 'playing') { S.pauseState = 'resumed'; S.resumedAfter = t - S.resumeAt; } else if (t - S.resumeAt > 2) { S.pauseState = 'stuck-paused'; } }
    if (t < 1.5) { hold([]); return; }
    let want = '';
    if (t < 5) want = 'w';
    else if (t < 8) want = 'd ';
    else if (t < 11) want = ['w', 'd', 's', 'a'][Math.floor((t - 8) / 0.75) % 4];
    else if (t < P - 0.5) want = 'a';
    else if (t < P + 1.5) want = '';
    else { const k = Math.floor((t - P) / 2.5) % 4; want = ['w', 'wd', 'wa', 's'][k]; if ((t - P) % 5 < 1.2) want += ' '; }
    hold(want);
    if (t >= S.nextTap && !(t > P - 1 && t < P + 2)) { tap(CYCLE[S.tapI++ % CYCLE.length], t); S.nextTap = t + 1.3; }
    if (t >= cfg.playS) { S.done = true; hold([]); }
  };
}

// ── the screen, as a player reads it ──────────────────────────────────────────────────────────────────────────────────
function auditScreen(where) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const parse = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (top, bot) => [0, 1, 2].map((i) => top[i] * top[3] + bot[i] * (1 - top[3]));
  const effOpacity = (el) => { let o = 1; for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); o *= Number(cs.opacity); if (cs.visibility === 'hidden' || cs.display === 'none') return 0; } return o; };
  const zoomOf = (el) => { let z = 1; for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const v = Number(getComputedStyle(e).zoom); if (v && isFinite(v)) z *= v; } return z; };
  const texts = []; const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const s = n.textContent.replace(/\s+/g, ' ').trim(); if (!s) continue;
    const el = n.parentElement; if (!el || el.closest('[aria-hidden="true"] svg, script, style, noscript')) continue;
    if (el.closest('[data-testid="feel-tab"], [data-testid="feel-sheet"]')) continue;   // the owner's dev panel: the rig opens it; a player never sees it
    const range = document.createRange(); range.selectNodeContents(n); const r = range.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
    const op = effOpacity(el); if (op < 0.05) continue;
    const cs = getComputedStyle(el);
    const px = parseFloat(cs.fontSize) * zoomOf(el);
    // contrast: the text over the nearest painted background (composited over a mid-grey scene where it is see-through)
    let fg = parse(cs.color) || [255, 255, 255, 1]; fg = [fg[0], fg[1], fg[2], fg[3] * op];
    let bg = [119, 119, 119]; let backed = false; const layers = [];
    for (let e = el; e && e !== document.body; e = e.parentElement) { const b = parse(getComputedStyle(e).backgroundColor); if (b && b[3] > 0.02) { layers.push(b); if (b[3] >= 0.5) backed = true; if (b[3] >= 0.98) break; } }
    for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
    const fgc = over(fg, bg); const L1 = lum(fgc), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const shadow = cs.textShadow && cs.textShadow !== 'none';
    const bold = Number(cs.fontWeight) >= 700; const large = px >= 24 || (bold && px >= 18.66);
    texts.push({ s: s.slice(0, 60), words: s.split(' ').filter((w) => /[A-Za-z0-9]/.test(w)).length, px: Math.round(px * 10) / 10, ratio: Math.round(ratio * 100) / 100, need: large ? 3 : 4.5, backed, shadow, el, r: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } });
  }
  const small = texts.filter((t) => t.px < 12);
  const lowC = texts.filter((t) => t.ratio < t.need && !(t.shadow && !t.backed));
  const unbacked = texts.filter((t) => !t.backed && !t.shadow);
  const overlaps = [];
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j]; if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const ix = Math.max(0, Math.min(a.r.x + a.r.w, b.r.x + b.r.w) - Math.max(a.r.x, b.r.x)), iy = Math.max(0, Math.min(a.r.y + a.r.h, b.r.y + b.r.h) - Math.max(a.r.y, b.r.y));
    const area = ix * iy, minA = Math.min(a.r.w * a.r.h, b.r.w * b.r.h);
    if (minA > 0 && area / minA > 0.25) overlaps.push(`${a.s.slice(0, 24)} ✕ ${b.s.slice(0, 24)}`);
  }
  // Babylon GUI text drawn on the canvas
  let gui = { words: 0, small: 0, n: 0, ex: [] };
  try {
    const dev = window.__FEL_DEV__; const scene = dev && dev.scene; const canvas = scene && scene.getEngine().getRenderingCanvas();
    const visible = (c) => { for (let x = c; x; x = x.parent) if (!x.isVisible || x.alpha === 0) return false; return true; };
    for (const t of scene ? scene.textures : []) {
      if (!t.getClassName || t.getClassName() !== 'AdvancedDynamicTexture' || !t.getDescendants) continue;
      const sz = t.getSize(); const k = canvas && sz.height ? canvas.clientHeight / sz.height : 1;
      for (const c of t.getDescendants(false)) {
        if (c.getClassName() !== 'TextBlock' || !c.text || !String(c.text).trim() || !visible(c)) continue;
        const words = String(c.text).split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length; const px = (c.fontSizeInPixels || 0) * k;
        gui.n++; gui.words += words; if (px > 0 && px < 12) { gui.small++; if (gui.ex.length < 4) gui.ex.push(`${String(c.text).slice(0, 30)} @${px.toFixed(1)}px`); }
      }
    }
  } catch {}
  const q = (sel) => [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && effOpacity(e) > 0.05; });
  const targets = q('button, a[href], [role="button"], input, select').filter((e) => !e.closest('[data-testid="feel-tab"]')).map((e) => { const r = e.getBoundingClientRect(); return { s: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) }; });
  const label = (re) => q('button, a[href], [role="button"]').some((e) => re.test((e.getAttribute('aria-label') || '') + ' ' + (e.textContent || '')));
  const ss = window.__sessionStore ? window.__sessionStore.view() : null;
  return {
    where, phase: ss ? ss.phase : null, words: texts.reduce((s, t) => s + t.words, 0), textNodes: texts.length,
    small: small.length, smallEx: [...new Set(small.map((t) => `${t.s.slice(0, 28)} @${t.px}px`))].slice(0, 6),
    smallest: texts.length ? Math.min(...texts.map((t) => t.px)) : null,
    lowContrast: lowC.length, lowEx: lowC.slice(0, 5).map((t) => `${t.s.slice(0, 28)} ${t.ratio}:1`),
    unbacked: unbacked.length, overlaps: overlaps.length, overlapEx: overlaps.slice(0, 5),
    gui, tapSmall: targets.filter((t) => Math.min(t.w, t.h) < 44).length, tapTiny: targets.filter((t) => Math.min(t.w, t.h) < 24).length,
    tapEx: targets.filter((t) => Math.min(t.w, t.h) < 44).slice(0, 6).map((t) => `${t.s || '?'} ${t.w}x${t.h}`),
    controlsPanel: q('[data-controls-panel]').map((e) => e.getAttribute('data-controls-panel')),
    controlsRows: document.querySelectorAll('[data-controls-panel] [data-controls-rows] > span').length,
    pausedHeadline: /PAUSED — TAP TO RESUME/.test(document.body.innerText),
    pauseButton: label(/\bpause\b/i), leaveButton: label(/leave the game|^\s*home\b|quit|exit/i),
    feelTab: q('[data-testid="feel-tab"]').length > 0, touchDeck: q('[data-touch-deck]').length > 0,
    fullscreen: label(/full screen/i), tapToStart: /TAP TO START/.test(document.body.innerText),
    text: [...new Set(texts.map((t) => t.s))].slice(0, 40).join(' | ').slice(0, 900),
  };
}

// ── analysis ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
const med = (a) => pct(a, 0.5);
const r2 = (x) => (x === null || x === undefined || !isFinite(x) ? null : Math.round(x * 100) / 100);
const qang = (a, b) => { if (!a || !b) return null; const d = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])); return 2 * Math.acos(d) * 180 / Math.PI; };
const dist = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : null);
const QN = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];
const RIDE = new Set(['skateboard', 'snowboard_slalom', 'surf', 'velocitykart', 'aeroaces', 'bigair']);

function analyze(mode, rec, S) {
  const F = rec.frames; const play = F.filter((f) => f.ph === 'playing');
  const dt = 1 / 60; const out = { frames: F.length, playFrames: play.length };
  // pops
  const pops = []; const nB = QN.length;
  const speeds = F.map((f, i) => (i && f.q && F[i - 1].q ? f.q.map((q, b) => { const a = qang(q, F[i - 1].q[b]); return a === null ? null : a / dt; }) : null));
  for (let b = 0; b < nB; b++) {
    for (let i = 6; i < F.length - 6; i++) {
      const w = speeds[i]?.[b]; if (w === null || w === undefined || w < 600) continue;
      if (F[i].ph !== 'playing' || F[i - 1].ph !== 'playing') continue;
      const nb = []; for (let k = i - 6; k <= i + 6; k++) if (k !== i && speeds[k]?.[b] != null) nb.push(speeds[k][b]);
      const m = med(nb) ?? 0; if (w >= 3.5 * Math.max(m, 60)) pops.push({ t: F[i].t, i, bone: QN[b], degS: Math.round(w), clip: rec.clips[F[i].c] ?? '' });
    }
  }
  // one EVENT is every bone that pops within 3 frames of another (a snap into a pose moves many bones at once); the
  // control (karate, raw): RightUpLeg 70° then 63° in two frames, then held — the same pair at 3.35, 4.27, 5.40, 9.67 s
  const byFrame = [...pops].sort((a, b) => a.i - b.i); const events = [];
  for (const p0 of byFrame) { const last = events[events.length - 1]; if (last && p0.i - last.end <= 3) { last.end = p0.i; last.bones.add(p0.bone); last.peak = Math.max(last.peak, p0.degS); } else events.push({ t: p0.t, end: p0.i, bones: new Set([p0.bone]), peak: p0.degS }); }
  out.popEvents = events.length; out.popEventsPerMin = r2(events.length / Math.max(1e-6, play.length / 3600));
  out.popEventEx = events.sort((a, b) => b.peak - a.peak).slice(0, 4).map((e) => `${e.t}s ${e.peak}°/s ${[...e.bones].slice(0, 4).join('+')}`);
  out.pops = pops.length; out.popsPerMin = r2(pops.length / Math.max(1e-6, play.length / 3600)); out.popEx = pops.sort((a, b) => b.degS - a.degS).slice(0, 5);
  // root jumps (teleports) during play
  const jumps = []; for (let i = 1; i < F.length; i++) { if (F[i].ph !== 'playing' || F[i - 1].ph !== 'playing') continue; const d = dist(F[i].r, F[i - 1].r); if (d !== null && d > 0.35) jumps.push({ t: F[i].t, m: r2(d) }); }
  out.rootJumps = jumps.length; out.rootJumpEx = jumps.slice(0, 4);
  // T-pose (arms out level) and rest-pose frames
  let tpose = 0, restF = 0;
  for (const f of play) {
    if (f.rest !== null && f.rest !== undefined && f.rest >= 0.9) restF++;
    const j = f.j; if (!j || !j[8] || !j[9] || !j[10] || !j[11] || !j[5] || !j[6]) continue;
    const lvl = (a, b) => { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const l = Math.hypot(...d); return l > 0 ? Math.abs(d[1]) / l : 1; };
    const span = dist(j[5], j[6]), shoulders = dist(j[8], j[9]);
    if (lvl(j[8], j[10]) < 0.26 && lvl(j[9], j[11]) < 0.26 && lvl(j[10], j[5]) < 0.3 && lvl(j[11], j[6]) < 0.3 && span > shoulders * 3.4) tpose++;
  }
  out.tposeFrames = tpose; out.restPoseFrames = restF; out.skeleton = rec.skel;
  // foot skate: a planted foot (within 4 cm of its own floor, slow vertically) sliding while the hero moves
  if (!RIDE.has(mode)) {
    const slides = [];
    for (const fi of [3, 4]) {
      const ys = play.map((f) => f.j?.[fi]?.[1]).filter((y) => y != null);
      for (let i = 1; i < play.length; i++) {
        const a = play[i - 1], b = play[i]; const pa = a.j?.[fi], pb = b.j?.[fi]; if (!pa || !pb || !a.r || !b.r) continue;
        const lo = pct(ys.slice(Math.max(0, i - 60), i + 60), 0.05); if (lo === null) continue;
        const planted = pb[1] < lo + 0.04 && Math.abs(pb[1] - pa[1]) / dt < 0.3;
        const rootV = Math.hypot(b.r[0] - a.r[0], b.r[2] - a.r[2]) / dt;
        if (planted && rootV > 0.5 && rootV < 15) slides.push(Math.hypot(pb[0] - pa[0], pb[2] - pa[2]) / dt);
      }
    }
    out.skateFrames = slides.length; out.skateMed = r2(med(slides)); out.skateP90 = r2(pct(slides, 0.9));
    out.skateShare = r2(slides.length ? slides.filter((v) => v > 0.25).length / slides.length : null);
  } else out.skate = 'n/a (ride)';
  // camera cuts
  const cuts = []; for (let i = 1; i < F.length; i++) { const a = F[i - 1].cam, b = F[i].cam; if (!a || !b || F[i].ph !== 'playing' || F[i - 1].ph !== 'playing') continue;
    // relative to the hero's own step: a chase camera behind a plane or a kart moves metres a frame and is not cutting
    const hr = F[i].r && F[i - 1].r ? [F[i].r[0] - F[i - 1].r[0], F[i].r[1] - F[i - 1].r[1], F[i].r[2] - F[i - 1].r[2]] : [0, 0, 0];
    const de = Math.hypot(b[0] - a[0] - hr[0], b[1] - a[1] - hr[1], b[2] - a[2] - hr[2]), dtg = Math.hypot(b[3] - a[3] - hr[0], b[4] - a[4] - hr[1], b[5] - a[5] - hr[2]);
    if (de > 0.6 || dtg > 0.8) cuts.push({ t: F[i].t, eye: r2(de), tgt: r2(dtg) }); }
  // the intro (a crane, a reveal) may cut on purpose: the cuts more than 3 s after play (re)started are the ones a player feels as a snap
  const starts = []; for (let i = 1; i < F.length; i++) if (F[i].ph === 'playing' && F[i - 1].ph !== 'playing') starts.push(F[i].t);
  const inPlay = cuts.filter((c) => !starts.some((s0) => c.t >= s0 && c.t < s0 + 3));
  out.camCutsAfterIntro = inPlay.length; out.camCutAfterEx = inPlay.slice(0, 5);
  out.camCuts = cuts.length; out.camCutsPerMin = r2(cuts.length / Math.max(1e-6, play.length / 3600)); out.camCutEx = cuts.slice(0, 5);
  // occlusion
  const occ = play.filter((f) => f.oc !== undefined && f.oc >= 0);
  const hidden = occ.filter((f) => f.oc >= 2), part = occ.filter((f) => f.oc === 1);
  const who = {}; for (const f of occ) if (f.oc >= 1 && f.ow >= 0) who[rec.occNames[f.ow]] = (who[rec.occNames[f.ow]] || 0) + 1;
  out.occSamples = occ.length; out.heroHiddenPct = r2(occ.length ? 100 * hidden.length / occ.length : null); out.heroPartPct = r2(occ.length ? 100 * part.length / occ.length : null);
  const fr = occ.filter((f) => f.inf !== undefined && f.inf >= 0);
  out.heroInFramePct = r2(fr.length ? 100 * fr.filter((f) => f.inf === 1).length / fr.length : null);
  out.recMs = r2(med(F.map((f) => f.rm).filter((x) => x != null)));
  out.occluders = Object.entries(who).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => `${n}×${c}`);
  // perf
  const ms = play.map((f) => f.ms).filter((x) => x > 0);
  const win = play.filter((f) => f.thr); const wms = win.map((f) => f.ms).filter((x) => x > 0);
  const dr = play.map((f) => f.d);
  out.cpuMsMax = r2(ms.length ? Math.max(...ms) : null);
  { const st = play.slice(0, 180).map((f) => f.ms).filter((x) => x > 0); out.startMaxMs = r2(st.length ? Math.max(...st) : null); }   // the first 3 s of play: a spawn or a load at START is a hitch the player feels
  out.cpuMsP50 = r2(pct(ms, 0.5)); out.cpuMsP95 = r2(pct(ms, 0.95));
  out.phoneCpuMsP50 = r2(pct(wms, 0.5)); out.phoneCpuMsP95 = r2(pct(wms, 0.95)); out.phoneFrames = wms.length;
  out.drawsMean = r2(dr.reduce((s, x) => s + x, 0) / Math.max(1, dr.length)); out.drawsP95 = pct(dr, 0.95); out.drawsMax = dr.length ? Math.max(...dr) : null; out.drawBudget = 600;
  // input response: each tap → the first frame the hero visibly changes (clip set, or a joint ≥ 5 cm off its path)
  const lat = []; let noResp = 0;
  for (const [t, k, fno] of rec.presses) {
    if (!/^[jklis]$/.test(k)) continue;
    const i0 = F.findIndex((f) => f.t >= t - 1e-6); if (i0 < 3 || !F[i0].j) continue;
    if (F[i0].ph !== 'playing') continue;
    const base = F[i0]; let hit = null;
    for (let i = i0 + 1; i < Math.min(F.length, i0 + 46); i++) {
      const f = F[i]; if (!f.j) break;
      if (f.c !== undefined && base.c !== undefined && f.c !== base.c) { hit = i - i0; break; }
      // joints in the hero's own frame, against a straight-line extrapolation of the 3 frames before the press
      let dev = 0;
      for (const ji of [5, 6, 1, 2, 7]) {
        const p = f.j[ji], p0 = base.j[ji], pm = F[i0 - 3].j?.[ji]; if (!p || !p0 || !pm || !f.r || !base.r || !F[i0 - 3].r) continue;
        const rel = (x, r) => [x[0] - r[0], x[1] - r[1], x[2] - r[2]];
        const a = rel(p, f.r), b = rel(p0, base.r), c = rel(pm, F[i0 - 3].r); const n = i - i0;
        const ex = [b[0] + (b[0] - c[0]) / 3 * n, b[1] + (b[1] - c[1]) / 3 * n, b[2] + (b[2] - c[2]) / 3 * n];
        dev = Math.max(dev, Math.hypot(a[0] - ex[0], a[1] - ex[1], a[2] - ex[2]));
      }
      if (dev > 0.05 && i - i0 <= 45) { hit = i - i0; break; }
    }
    if (hit === null) noResp++; else lat.push(hit * 1000 / 60);
  }
  out.pressCount = lat.length + noResp; out.pressAnswered = lat.length; out.respMsMed = r2(med(lat)); out.respMsP90 = r2(pct(lat, 0.9));
  // stuck: the longest stretch of play where the hero, the camera and the screen's words all stood still
  let run = 0, best = 0, bestAt = null; let lastDom = null;
  for (let i = 1; i < F.length; i++) {
    const f = F[i], g = F[i - 1]; if (f.ph !== 'playing') { run = 0; continue; }
    const still = (dist(f.r, g.r) ?? 0) < 0.002 && (dist(f.cam?.slice(0, 3), g.cam?.slice(0, 3)) ?? 0) < 0.002 && (f.c === g.c);
    if (f.dom !== undefined) { if (lastDom !== null && f.dom !== lastDom) run = 0; lastDom = f.dom; }
    if (still) { run++; if (run > best) { best = run; bestAt = f.t; } } else run = 0;
  }
  out.longestStillS = r2(best / 60); out.longestStillAt = bestAt;
  // phases
  const tl = []; for (const f of F) if (!tl.length || tl[tl.length - 1][1] !== f.ph) tl.push([f.t, f.ph]);
  out.phases = tl.slice(0, 20); out.ended = F.some((f) => f.ph === 'ended');
  out.pause = { state: S?.pauseState, after: r2(S?.pausedAfter), resumedAfter: r2(S?.resumedAfter) };
  out.clipsSeen = rec.clips.length;
  return out;
}

// ── re-analysis of saved recordings (REANALYZE=1: <outDir> holds <mode>-<tag>-raw.json.gz; the JSON rows are updated) ──
if (process.env.REANALYZE === '1') {
  for (const mode of MODES) {
    const raw = path.join(OUT, `${mode}-${TAG}-raw.json.gz`), js = path.join(OUT, `${mode}-${TAG}.json`);
    if (!fs.existsSync(raw) || !fs.existsSync(js)) { console.log(`${mode}: no recording`); continue; }
    const { rec, S } = JSON.parse(zlib.gunzipSync(fs.readFileSync(raw)).toString());
    const row = JSON.parse(fs.readFileSync(js, 'utf8'));
    fs.writeFileSync(js, JSON.stringify(Object.assign(row, analyze(mode, rec, S)), null, 1));
    console.log(`${mode}: re-analysed`);
  }
  process.exit(0);
}

// ── the run ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const mode of MODES) {
  const tWall0 = Date.now(); const row = { mode, tag: TAG, at: new Date().toISOString() };
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: Number(process.env.DPR ?? 1), isMobile: true, hasTouch: true, reducedMotion: RM ? 'reduce' : 'no-preference' });
  await ctx.addInitScript({ content: INIT });
  const p = await ctx.newPage();
  const errs = []; const warnsN = { n: 0 };
  p.on('pageerror', (e) => errs.push('pageerror: ' + String(e.message).split('\n')[0].slice(0, 180)));
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error') errs.push(t.slice(0, 180)); else if (m.type() === 'warning') warnsN.n++; });
  let crashed = false; p.on('crash', () => { crashed = true; });
  const bad = []; p.on('response', (r) => { if (r.status() >= 400 && bad.length < 20) bad.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 90)}`); });
  const ev = (fn, arg) => Promise.race([p.evaluate(fn, arg), sleep(120000).then(() => { throw new Error('evaluate timeout'); })]);
  const shot = async (name) => {
    if (!SHOTS) return null;
    await ev(() => { window.__freeze = true; window.__drawOn = true; window.__drawnFrames = 0; });
    const t0 = Date.now(); while (Date.now() - t0 < 60000) { if ((await ev(() => window.__drawnFrames)) >= 2) break; await sleep(150); }
    const f = path.join(OUT, `${mode}-${TAG}-${name}.jpg`);
    try { await p.screenshot({ path: f, type: 'jpeg', quality: 62, scale: 'css', timeout: 90000 }); }
    catch (e) { (row.shotErr = row.shotErr || []).push(`${name}: ${String(e.message).split('\n')[0].slice(0, 80)}`); return null; }
    return f;
  };
  const unshot = () => ev((fast) => { window.__drawOn = !fast; window.__freeze = false; }, FAST);
  try {
    const cdp = await ctx.newCDPSession(p);
    await p.goto(`http://127.0.0.1:${PORT}/index.html?mode=${mode}&perf=off${QS}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    // READY: the TAP TO START card (or a mode with no splash: playing / its own card)
    let st = {}; const tB = Date.now();
    for (;;) {
      st = await ev(() => ({ ph: window.__sessionStore?.view().phase ?? null, dev: !!window.__FEL_DEV__, tap: /TAP TO START/.test(document.body.innerText), err: (document.body.innerText || '').match(/Something went wrong|couldn.t load|error/i)?.[0] ?? null }));
      if (st.ph === 'ready' || st.ph === 'playing' || st.ph === 'error' || crashed) break;
      if (Date.now() - tB > BOOT_S * 1000) break;
      await sleep(400);
    }
    row.readyS = r2((Date.now() - tWall0) / 1000); row.bootPhase = st.ph;
    if (st.ph !== 'ready' && st.ph !== 'playing') { row.bootFail = st.ph ?? 'no phase'; throw new Error(`boot: phase ${st.ph}`); }
    await ev(installRecorder, { fast: FAST });
    if (st.ph === 'ready') {
      if (SHOTS) { await shot('1ready'); }
      row.ready = await ev(auditScreen, 'ready');
      if (SHOTS) await unshot();
    }
    await ev(installScript, { playS: PLAY_S, pauseAt: PAUSE_AT });
    await ev(() => window.__vtStart());
    const tTap = Date.now();
    if (st.ph === 'ready') {
      const btn = p.locator('button', { hasText: 'TAP TO START' }).first();
      if (await btn.count()) await btn.click({ timeout: 10000 }).catch(() => {}); else await ev(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' })));
    }
    // play to the end of the script
    let shots = [6, 12, 21].filter((x) => x < PLAY_S); let thr = false, first = null, pauseShot = false, touchDone = false;
    const tPlay = Date.now();
    for (;;) {
      const s = await ev(() => ({ t: window.__S?.t ?? -1, ph: window.__sessionStore?.view().phase, ps: window.__S?.pauseState, done: window.__S?.done, g: window.__gameS(), n: window.__rec.frames.length }));
      if (first === null && s.ph === 'playing') { first = Date.now(); row.firstPlayS = r2((first - tWall0) / 1000); row.tapToPlayS = r2((first - tTap) / 1000); }
      if (s.ps === 'paused' && !pauseShot) {
        pauseShot = true; if (SHOTS) await shot('3pause');
        row.pauseScreen = await ev(auditScreen, 'pause'); if (SHOTS) await unshot();
        await ev(() => { window.__pauseAck = true; });
      }
      if (shots.length && s.t >= shots[0] && s.ph === 'playing') {
        const at = shots.shift(); if (SHOTS) await shot(`2play${at}`);
        (row.play = row.play || []).push(await ev(auditScreen, `play@${at}`)); if (SHOTS) await unshot();
      }
      if (!touchDone && s.t >= PAUSE_AT + 4 && s.ph === 'playing') {
        touchDone = true;
        const at = await ev(() => { const deck = document.querySelector('[data-touch-deck]'); if (!deck) return null; const els = [...deck.querySelectorAll('div')].filter((e) => { const r = e.getBoundingClientRect(); return r.width >= 50 && r.width <= 80 && Math.abs(r.width - r.height) < 4 && getComputedStyle(e).borderStyle !== 'dashed'; });
          if (!els.length) return null; els.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom); const r = els[0].getBoundingClientRect(); window.__busMark = window.__rec.bus.length; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
        if (at) { await p.touchscreen.tap(at.x, at.y); await sleep(600); row.touchTap = await ev(() => window.__rec.bus.slice(window.__busMark).filter((e) => e[4] !== 'key' && e[4] !== 'space').map((e) => `${e[1]}:${e[2]}`).slice(0, 4)); }
        else row.touchTap = 'no deck';
      }
      if (!thr && s.t >= PLAY_S - PERF_S) { thr = true; await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); await ev(() => { window.__thr = true; }); }
      if (s.done || crashed) break;
      if (Date.now() - tPlay > MODE_WALL_S * 1000) { row.partial = `wall budget: game ${r2(s.t)} s, phase ${s.ph}`; break; }
      if (first === null && Date.now() - tPlay > 90000) { row.noPlay = `no playing phase 90 s after TAP TO START (phase ${s.ph})`; break; }
      if (process.env.PROGRESS && (globalThis.__pg = (globalThis.__pg || 0) + 1) % 40 === 0) console.error(`[${mode}] wall ${((Date.now() - tPlay) / 1000).toFixed(0)}s game ${r2(s.g)} script ${r2(s.t)} phase ${s.ph} frames ${s.n}`);
      if (s.ph === 'ended' && s.t > 3) { row.endedAt = s.t; }
      await sleep(250);
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {});
    const rec = await ev(() => { const R = window.__rec; const thrFrom = R.frames.findIndex((f) => f.t >= (window.__thrT ?? 1e9)); return { frames: R.frames, clips: R.clips, occNames: R.occNames, presses: R.presses, bus: R.bus.slice(0, 50), skel: R.skel }; });
    // frames the throttle covered: the last PERF_S seconds of the script
    const S = await ev(() => ({ ...window.__S, tapUntil: undefined }));
    const tEnd = rec.frames.length ? rec.frames[rec.frames.length - 1].t : 0;
    for (const f of rec.frames) if (f.t >= tEnd - PERF_S + 0.5) f.thr = true;
    Object.assign(row, analyze(mode, rec, S));
    row.wallS = r2((Date.now() - tWall0) / 1000);
    fs.writeFileSync(path.join(OUT, `${mode}-${TAG}-raw.json.gz`), zlib.gzipSync(JSON.stringify({ rec, S })));
  } catch (e) { row.fail = String(e.message || e).slice(0, 200); }
  row.errors = [...new Set(errs)].slice(0, 12); row.badUrls = [...new Set(bad)]; row.errorCount = errs.length; row.warnCount = warnsN.n; row.crashed = crashed;
  try { row.scriptErr = await p.evaluate(() => window.__scriptErr ?? null); row.api = await p.evaluate(() => [...new Set(window.__api)].slice(0, 20)); } catch {}
  fs.writeFileSync(path.join(OUT, `${mode}-${TAG}.json`), JSON.stringify(row, null, 1));
  console.log(`${mode.padEnd(17)} ready ${row.readyS}s play ${row.firstPlayS}s frames ${row.frames} pops ${row.pops} cuts ${row.camCuts} hidden ${row.heroHiddenPct}% cpu ${row.cpuMsP50}/${row.cpuMsP95} phone ${row.phoneCpuMsP50}/${row.phoneCpuMsP95} draws ${row.drawsMean}/${row.drawsMax} resp ${row.respMsMed}ms pause ${row.pause?.state} err ${row.errorCount}${row.fail ? ' FAIL ' + row.fail : ''} (${row.wallS}s)`);
  await ctx.close();
}
await b.close();
