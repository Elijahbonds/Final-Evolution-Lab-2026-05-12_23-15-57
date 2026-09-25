// _vclock-page.js — THE VIRTUAL CLOCK, shared by the motion probes (HOOPS MOTION pass, phase 2a, 2026-09-25).
//
// Lifted out of _hoops-motion-page.js section 1 so the dunk probe (_dunk-motion-probe.mts) measures on the same clock the
// hoops probe does: its phase 13 numbers were taken on the wall clock (V:tooling), and the plan's phase 8 (game dunks =
// contest dunks) needs a control taken the same way as base2. Evaluated into a /dev/mode/<mode> page once the mode is
// loaded, before the page-specific half. Plain JS on purpose (the template-literal backtick trap; see the hoops page).
//
// performance.now, requestAnimationFrame, setTimeout and setInterval are replaced so that every rendered frame advances
// game time by exactly one fixed step (VDT, default 1000/60 ms) whatever the wall clock did. Babylon's engine delta, the
// animation clock, the harness dt, the modes' later() timers, the agent bridge's hold queue and every driver read this
// clock, so what a take does is a function of FRAMES, not of machine load. Math.random is reseeded per take and per frame.
// requestAnimationFrame callbacks are queued and run by one native frame after the time advances, and the time never moves past
// a timer that is still due (see the ticker).
//
//   window.__VC_CFG = { dt, seed, hogMs, vtBase, frameSeed, startPaused }   (all optional)   then evaluate this file
//   window.__vc = { C, DT, realNow, now, wallMs, pause, resume, reseed, EPS, mulberry }
(() => {
  if (window.__vc) return 'already';
  const CFG = window.__VC_CFG || {};
  const dev = window.__FEL_DEV__;
  const scene = dev.scene;
  const DT = Number(CFG.dt) > 0 ? Number(CFG.dt) : 1000 / 60;
  const realNow = performance.now.bind(performance);
  const nRaf = window.requestAnimationFrame.bind(window);
  const nST = window.setTimeout.bind(window), nCT = window.clearTimeout.bind(window), nSI = window.setInterval.bind(window);
  const errors = [];
  // AUDIT 2026-09-25 — THE CLOCK WAS NOT REPRODUCIBLE. Two identical runs (same tip, seed, takes, an idle machine) diverged from the
  // FIRST recorded frame of every take (a clip fade one frame apart, joints up to 5 m apart later, take lengths ±50 ms). Cause: vt
  // started at Math.ceil(realNow()) — a different number every run — and was ACCUMULATED (vt += 16.666…), so a timer that is an
  // exact number of frames long (sleep(150) = 9 frames, act(…, 600) = 36) fired on frame k or k+1 by floating-point luck (simulated:
  // 34 % of start points fire sleep(150) a frame late), and every engine dt differed in its last bits. Now: a FIXED base (the same
  // bits every run), vt = base + frames × DT (never accumulated), timers compared with a 1e-6 ms tolerance (an exact multiple of the
  // frame fires on exactly that frame), and Babylon's own clocks (the engine's frame-time monitor, the scene's animation clock) are
  // re-based onto it below so the first frame after the install is one DT, not a jump.
  const VT_BASE = (() => { const b = Number(CFG.vtBase) > 0 ? Number(CFG.vtBase) : 4194304; return realNow() < b - 6e5 ? b : Math.ceil((realNow() + 6e5) / 1e6) * 1e6; })();
  // PHASE 2a — EVERY FRAME'S dt IS THE SAME DOUBLE. vt0 + k·(1000/60) rounds differently for every k at vt ≈ 4e6, so the engine's
  // dt (vt_k − vt_(k−1)) differed in its last bits from frame to frame, and two runs whose first take began at a different frame
  // index (the boot is real time: measured 112 vs 114) integrated the same shot meter to different last bits (0.0563545915368286
  // vs …3604134) — enough to move a threshold. The step is put on the base's own float grid instead (the ulp of its binade; the
  // default base 2^22 ms keeps every vt in [2^22, 2^23), 2.3 h of game time): vt0 + k·DTX is then exact, every dt is exactly
  // DTX, and DTX is within 5e-10 ms of DT, far inside the timers' 1e-6 ms tolerance (an exact multiple of DT still fires on
  // exactly that frame).
  const ULP = Math.pow(2, Math.floor(Math.log2(VT_BASE)) - 52);
  const DTX = Math.round(DT / ULP) * ULP;
  const C = { dt: DT, dtx: DTX, vt: VT_BASE, vt0: VT_BASE, frames: 0, timers: new Map(), seq: 50000000, wall0: realNow(), frozen: false, renderedFrames: 0, paused: false, loops: null };
  const EPS = 1e-6;
  let flushing = false;
  const flush = () => {
    if (flushing) return;
    flushing = true;
    try {
      const due = [];
      C.timers.forEach((x, id) => { if (x.due <= C.vt + EPS) due.push([id, x]); });
      due.sort((a, b) => a[1].due - b[1].due || a[0] - b[0]);
      for (const [id, x] of due) {
        if (!C.timers.has(id)) continue;
        if (x.every) x.due += x.every; else C.timers.delete(id);   // an interval that fell behind runs once per frame and catches up
        try { x.fn.apply(window, x.args); } catch (e) { errors.push('timer: ' + String((e && e.message) || e).slice(0, 180)); }
      }
    } finally { flushing = false; }
  };
  const VC = (window.__vc = { C, DT, EPS, realNow, errors });
  // PHASE 2a — ONE VIRTUAL FRAME PER REAL FRAME, AND NEVER AHEAD OF ITS TIMERS. Measured under contention (HOG=60 with four other
  // probe browsers and the test suite on the machine): the same 1v1 take released its jumper one frame earlier than the idle run
  // and missed where the idle run made it. The old clock advanced inside the first rAF callback of a frame and flushed the timers
  // due at the OLD time there; their promise continuations (the driver's next act, a read of the meter) run as microtasks AFTER
  // that callback — so under load they saw the NEW time and ran after the frame's update, where idle (the native setTimeout(0)
  // between frames got there first) they ran before it. The agent bridge's one-frame hold then ran dry for a frame and the game
  // read the squeeze as let go. Now:
  //   · every requestAnimationFrame callback is QUEUED here and run by one native frame (the ticker), in request order, after
  //     the time has advanced (the engine's loop, a driver's frame(), the slam's NOW! watcher alike);
  //   · a real frame that finds a timer of the CURRENT virtual time still due only flushes the timers and returns: their
  //     continuations drain before the next real frame, which then advances. The native setTimeout(0) after each frame still
  //     flushes between frames when the machine is idle, so an idle run skips no real frame. Either way every timer due at
  //     frame k, and everything it resolves, has run before frame k + 1 — a function of frames only.
  //   · paused / frozen: no time passes, and queued callbacks still run (with the unchanged time) so nothing waiting on a frame
  //     hangs (the sheets' posing, a page waiter).
  // Math.random is reseeded EVERY FRAME from (take seed, frame): the audio kit fills noise buffers with Math.random when a voice
  // line decodes (a real-time event), which moved the dice stream by a load-dependent amount mid-take.
  let rq = []; let rqId = 1e9;   // ids far above the native ones: a cancel for a callback requested before the install goes native
  const nCAF = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => { const id = ++rqId; rq.push({ id, cb }); return id; };
  window.cancelAnimationFrame = (id) => { if (id > 1e9) rq = rq.filter((x) => x.id !== id); else nCAF(id); };
  const dueNow = () => { for (const x of C.timers.values()) if (x.due <= C.vt + EPS) return true; return false; };
  // HOG (the instrument's own load test, AUDIT 2026-09-25): burn 0..hogMs of WALL time inside every frame (a native LCG, never
  // Math.random) — what a loaded machine does to a frame. With a sound virtual clock the recording must not change at all.
  let hogA = 12345;
  const hog = () => { const H = Number(CFG.hogMs) || 0; if (!H || C.frozen) return; hogA = (Math.imul(hogA, 1103515245) + 12345) >>> 0; const e = realNow() + (H * (hogA >>> 8)) / 16777216; while (realNow() < e) { /* burn */ } };
  const runQueue = () => { const run = rq; rq = []; for (const x of run) { try { x.cb(C.vt); } catch (e) { errors.push('raf: ' + String((e && e.message) || e).slice(0, 180)); } } };
  const ticker = () => {
    nRaf(ticker);
    if (C.frozen) { runQueue(); return; }
    if (dueNow()) { flush(); return; }
    C.frames++; C.vt = C.vt0 + C.frames * DTX;
    if (VC.frameSeed) VC.frameSeed(C.frames);
    runQueue();
    hog();
    nST(flush, 0);
  };
  performance.now = () => C.vt;
  nRaf(ticker);
  window.setTimeout = (fn, ms, ...args) => {
    if (typeof fn !== 'function') return nST(fn, ms);
    const id = ++C.seq; C.timers.set(id, { due: C.vt + Math.max(0, Number(ms) || 0), fn, args, every: 0 }); return id;
  };
  window.setInterval = (fn, ms, ...args) => {
    if (typeof fn !== 'function') return nSI(fn, ms);
    const id = ++C.seq; const every = Math.max(DT, Number(ms) || 0); C.timers.set(id, { due: C.vt + every, fn, args, every }); return id;
  };
  window.clearTimeout = window.clearInterval = (id) => { if (id == null) return; if (C.timers.has(id)) C.timers.delete(id); else nCT(id); };
  // PAUSE BETWEEN TAKES: node pulls a take's frames over wall-clock round trips; with the render loop running the game played on
  // through them, so the next reset landed at a different clip phase each run (measured: two identical smokes differed by up to
  // 0.047 in a bone quaternion). Paused, no frame is drawn, no game time passes and no timer fires until the next take resumes.
  // AUDIT 2026-09-25: a pause that lands after a frame's step but before its render rolls the clock back to the last RENDERED frame,
  // so the next take's first frame is always one DT (kept in 2a, where a step and its render share one native frame).
  scene.onAfterRenderObservable.add(() => { C.renderedFrames = C.frames; });
  VC.pause = () => { if (C.paused) return; const eng = scene.getEngine(); C.loops = (eng._activeRenderLoops || []).slice(); eng.stopRenderLoop(); C.frozen = true; C.paused = true; if (C.frames !== C.renderedFrames) { C.frames = C.renderedFrames; C.vt = C.vt0 + C.frames * DTX; } };
  VC.resume = () => { if (!C.paused) return; const eng = scene.getEngine(); C.frozen = false; C.paused = false; for (const fn of C.loops || []) eng.runRenderLoop(fn); };
  VC.now = () => C.vt;
  VC.wallMs = () => realNow() - C.wall0;
  const mulberry = (seed) => { let a = (Number(seed) >>> 0) || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  VC.mulberry = mulberry;
  VC.reseed = (seed) => {
    VC.seedBase = (Number(seed) >>> 0) || 1; VC.seedFrame0 = C.frames;
    Math.random = mulberry(VC.seedBase);
  };
  // per frame, relative to the reseed: the same take on the same frame draws the same numbers whatever ran between frames
  VC.frameSeed = CFG.frameSeed === false ? null : (fr) => { if (VC.seedBase == null) return; Math.random = mulberry((VC.seedBase ^ Math.imul((fr - VC.seedFrame0) | 0, 0x9e3779b1)) >>> 0); };
  if (CFG.seed != null) VC.reseed(CFG.seed);
  // RE-BASE BABYLON onto the fixed base (no jump): the engine's dt is the frame-time monitor's last sample, the animation clock
  // is the scene's _animationTimeLast; the animation time itself and every running animatable's offset shift together, so a
  // running clip keeps its phase and the time base is the same bits every run.
  try { const eng = scene.getEngine(); const pm = eng.performanceMonitor || eng._performanceMonitor; if (pm) { pm.reset(); pm._lastFrameTimeMs = C.vt; } } catch (e) { errors.push('rebase pm: ' + e); }
  try {
    if (scene._animationTimeLast) scene._animationTimeLast = C.vt;
    const ANIM_BASE = 1e5, shift = ANIM_BASE - (scene._animationTime || 0);
    scene._animationTime = ANIM_BASE;
    for (const a of scene._activeAnimatables || []) { if (a._localDelayOffset != null) a._localDelayOffset += shift; if (a._pausedDelay != null) a._pausedDelay += shift; }
    // and every running loop restarts from its first frame: the phase an idle loop had reached depended on how long the real-time
    // boot took (the first take's dribble bounce was at a different point every run)
    for (const g of scene.animationGroups) if (g.isPlaying) for (const a of g.animatables || []) { try { if (a.loopAnimation) a.goToFrame(a.fromFrame); } catch (e) {} }
  } catch (e) { errors.push('rebase anim: ' + e); }
  // PHASE 2a — INSTALLED PAUSED (CFG.startPaused, default on). The clock used to run from the install while node evaluated the
  // page half over wall-clock round trips, so the mode's start began a frame-count later that varied run to run (measured: the
  // first take's shot trace began at frame 112 in one run and 114 in the next). Every per-frame reseed before the first take's
  // own reseed is counted from the install, so the start's dice moved with it — 3PT draws the first ball's bar phase there
  // (S.barT = Math.random()), and the same rack fired its first shot at +717 ms in one run and +133 ms in the next. Paused, no
  // frame passes until the page half resumes the game (startMode / the dunk's start), whatever the round trips took.
  if (CFG.startPaused !== false) VC.pause();
  return { ok: true, dt: DT, vt0: C.vt0, paused: C.paused };
})();
