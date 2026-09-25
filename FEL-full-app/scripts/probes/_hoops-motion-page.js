// _hoops-motion-page.js — the IN-PAGE half of _hoops-motion-probe.mts (HOOPS MOTION pass, phase 1, 2026-09-24).
//
// Evaluated into a /dev/mode/<mode>?agent=1 page once the mode reports 'loaded'. Plain JS on purpose: the dunk probe's
// recorder lived inside a template literal, and a backtick in a comment there ends it (this repo has sprung that four times).
//
// Four jobs:
//   1. THE VIRTUAL CLOCK. performance.now, requestAnimationFrame, setTimeout and setInterval are replaced so that every
//      rendered frame advances game time by exactly one fixed step (VDT, default 1000/60 ms) whatever the wall clock did.
//      This is the capped clock of the clothing and car-clip probes with the cap equal to the floor: a frame that took
//      80 ms of wall time on a loaded machine still advances the game 16.67 ms, and so does one that took 9 ms. Babylon's
//      engine delta, the animation clock, the harness dt, the modes' later() timers, the agent bridge's hold queue and
//      every driver below all read this clock, so what a take does is a function of FRAMES, not of machine load.
//      Math.random is reseeded per take (mulberry32), so the AI's dice are the same on every run of the same code.
//   2. THE BODIES. Every player body the mode owns (1v1: me + foe; 3v3: me + mate0/1 + foe0/1/2 from the seam's jobs();
//      3PT / carnival: me + every other rigged body near the court as b0, b1 …), bound to their skeleton's bone nodes.
//   3. THE RECORDER. On onAfterRenderObservable (after the clips, posture, carry IK, rim reach, foot planting — the pose
//      the player saw): per body the root transform, every bone's local rotation, the Hips position, the world position of
//      the 22 joints, the joint audit (bend, hinge error, upper-bone roll) and the playing clips with weights; per frame the
//      ball (world position, the node it is parented to and whose body that is, released or not) and a small mode state.
//   4. THE DRIVERS. Each take is a play run IN THE PAGE on the virtual clock: the agent bridge for 1v1 / 3v3 (the slot
//      reads the bridge under ?agent=1 and bypasses local input by design), the right stick and the keyboard through the
//      real InputBus (InputBus.emit / a KeyboardEvent on window: the J key is A, space is the analog R trigger).
(() => {
  if (window.__hm) return 'already';
  const CFG = window.__HM_CFG || {};
  const dev = window.__FEL_DEV__;
  const scene = dev.scene;
  const MODE = dev.modeId;
  const HM = (window.__hm = { mode: MODE, marks: [], errors: [], version: 1 });

  // ── 1. the virtual clock ─────────────────────────────────────────────────────────────────────────────────────────
  const DT = Number(CFG.dt) > 0 ? Number(CFG.dt) : 1000 / 60;
  const realNow = performance.now.bind(performance);
  const nRaf = window.requestAnimationFrame.bind(window);
  const nST = window.setTimeout.bind(window), nCT = window.clearTimeout.bind(window), nSI = window.setInterval.bind(window);
  // AUDIT 2026-09-25 — THE CLOCK WAS NOT REPRODUCIBLE. Two identical runs (same tip, seed, takes, an idle machine) diverged from the
  // FIRST recorded frame of every take (a clip fade one frame apart, joints up to 5 m apart later, take lengths ±50 ms). Cause: vt
  // started at Math.ceil(realNow()) — a different number every run — and was ACCUMULATED (vt += 16.666…), so a timer that is an
  // exact number of frames long (sleep(150) = 9 frames, act(…, 600) = 36) fired on frame k or k+1 by floating-point luck (simulated:
  // 34 % of start points fire sleep(150) a frame late), and every engine dt differed in its last bits. Now: a FIXED base (the same
  // bits every run), vt = base + frames × DT (never accumulated), timers compared with a 1e-6 ms tolerance (an exact multiple of the
  // frame fires on exactly that frame), and Babylon's own clocks (the engine's frame-time monitor, the scene's animation clock) are
  // re-based onto it below so the first frame after the install is one DT, not a jump.
  const VT_BASE = (() => { const b = Number(CFG.vtBase) > 0 ? Number(CFG.vtBase) : 4e6; return realNow() < b - 6e5 ? b : Math.ceil((realNow() + 6e5) / 1e6) * 1e6; })();
  const C = (HM.clock = { dt: DT, vt: VT_BASE, vt0: VT_BASE, frames: 0, lastTs: -1, timers: new Map(), seq: 50000000, wall0: realNow(), frozen: false, renderedFrames: 0 });
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
        try { x.fn.apply(window, x.args); } catch (e) { HM.errors.push('timer: ' + String((e && e.message) || e).slice(0, 180)); }
      }
    } finally { flushing = false; }
  };
  // ONE step per browser frame: every rAF callback of a frame sees the same timestamp, the first one to run advances.
  // AUDIT 2026-09-25: the timers due at the previous frame's time are flushed HERE too, synchronously, before the step — the
  // native setTimeout(0) below normally runs them between frames, but on a loaded main thread Chrome may serve the next frame's
  // rAF first, and a driver's step then landed a frame late (load-dependent). Whichever path runs them, the same set runs before
  // the next step. Math.random is reseeded EVERY FRAME from (take seed, frame): the audio kit fills noise buffers with
  // Math.random when a voice line decodes (a real-time event), which moved the dice stream by a load-dependent amount mid-take.
  const advance = (ts) => {
    if (ts === C.lastTs) return; C.lastTs = ts; if (C.frozen) return;
    flush();
    C.frames++; C.vt = C.vt0 + C.frames * DT;
    if (HM.frameSeed) HM.frameSeed(C.frames);
    nST(flush, 0);
  };
  performance.now = () => C.vt;
  window.requestAnimationFrame = (cb) => nRaf((ts) => { advance(ts); cb(C.vt); });
  // HOG (the instrument's own load test, AUDIT 2026-09-25): burn 0..hogMs of WALL time inside every frame (a native LCG, never
  // Math.random) — what a loaded machine does to a frame. With a sound virtual clock the recording must not change at all.
  let hogA = 12345;
  const hog = () => { const H = Number(CFG.hogMs) || 0; if (!H || C.frozen) return; hogA = (Math.imul(hogA, 1103515245) + 12345) >>> 0; const e = realNow() + (H * (hogA >>> 8)) / 16777216; while (realNow() < e) { /* burn */ } };
  const ticker = (ts) => { advance(ts); hog(); nRaf(ticker); };   // time moves even in a frame the engine did not ask for
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
  // AUDIT 2026-09-25: a pause that lands after this frame's step but before its render (the sync flush above resolves the take's
  // last sleep inside the frame) rolls the clock back to the last RENDERED frame, so the next take's first frame is always one DT.
  scene.onAfterRenderObservable.add(() => { C.renderedFrames = C.frames; });
  HM.pause = () => { if (C.paused) return; const eng = scene.getEngine(); C.loops = (eng._activeRenderLoops || []).slice(); eng.stopRenderLoop(); C.frozen = true; C.paused = true; if (C.frames !== C.renderedFrames) { C.frames = C.renderedFrames; C.vt = C.vt0 + C.frames * DT; } };
  HM.resume = () => { if (!C.paused) return; const eng = scene.getEngine(); C.frozen = false; C.paused = false; for (const fn of C.loops || []) eng.runRenderLoop(fn); };
  HM.now = () => C.vt;
  HM.wallMs = () => realNow() - C.wall0;
  const mulberry = (seed) => { let a = (Number(seed) >>> 0) || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  HM.reseed = (seed) => {
    HM.seedBase = (Number(seed) >>> 0) || 1; HM.seedFrame0 = C.frames;
    Math.random = mulberry(HM.seedBase);
  };
  // per frame, relative to the reseed: the same take on the same frame draws the same numbers whatever ran between frames
  HM.frameSeed = CFG.frameSeed === false ? null : (fr) => { if (HM.seedBase == null) return; Math.random = mulberry((HM.seedBase ^ Math.imul((fr - HM.seedFrame0) | 0, 0x9e3779b1)) >>> 0); };
  if (CFG.seed != null) HM.reseed(CFG.seed);
  // RE-BASE BABYLON onto the fixed base (no jump): the engine's dt is the frame-time monitor's last sample, the animation clock
  // is the scene's _animationTimeLast; the animation time itself and every running animatable's offset shift together, so a
  // running clip keeps its phase and the time base is the same bits every run.
  try { const eng = scene.getEngine(); const pm = eng.performanceMonitor || eng._performanceMonitor; if (pm) { pm.reset(); pm._lastFrameTimeMs = C.vt; } } catch (e) { HM.errors.push('rebase pm: ' + e); }
  try {
    if (scene._animationTimeLast) scene._animationTimeLast = C.vt;
    const ANIM_BASE = 1e5, shift = ANIM_BASE - (scene._animationTime || 0);
    scene._animationTime = ANIM_BASE;
    for (const a of scene._activeAnimatables || []) { if (a._localDelayOffset != null) a._localDelayOffset += shift; if (a._pausedDelay != null) a._pausedDelay += shift; }
    // and every running loop restarts from its first frame: the phase an idle loop had reached depended on how long the real-time
    // boot took (the first take's dribble bounce was at a different point every run)
    for (const g of scene.animationGroups) if (g.isPlaying) for (const a of g.animatables || []) { try { if (a.loopAnimation) a.goToFrame(a.fromFrame); } catch (e) {} }
  } catch (e) { HM.errors.push('rebase anim: ' + e); }

  // console marks (every bracket-tagged line the modes log), stamped on the virtual clock, only while recording
  const markRe = /^\[[0-9A-Z][0-9A-Z-]*\]/;
  for (const k of ['info', 'log', 'warn']) {
    const o = console[k].bind(console);
    console[k] = (...a) => { const s = String(a[0]); if (HM.rec && HM.rec.on && markRe.test(s) && HM.marks.length < 6000) HM.marks.push({ t: C.vt, msg: s.slice(0, 220) }); o(...a); };
  }
  window.addEventListener('error', (e) => HM.errors.push('error: ' + String(e.message).slice(0, 180)));

  // ── 2. the bodies ────────────────────────────────────────────────────────────────────────────────────────────────
  const JN = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];
  HM.JN = JN;
  const clean = (n) => String(n).replace(/^mixamorig:?/, '').replace(/(_c\d+)+$/, '').replace(/_p\d+$/, '');
  HM.clean = clean;
  const topOf = (n) => { while (n && n.parent) n = n.parent; return n; };
  const qm = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  const qi = (a) => [-a[0], -a[1], -a[2], a[3]];
  const qr = (q, v) => { const r = qm(qm(q, [v[0], v[1], v[2], 0]), qi(q)); return [r[0], r[1], r[2]]; };
  const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dt3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const skelOf = (root) => scene.skeletons.find((s) => s.bones.length && s.bones.some((b) => { const t = b.getTransformNode(); return t && t.isDescendantOf(root); }));
  // the joint audit of the dunk probe (phase 9), unchanged: each limb's hinge from the REST pose alone
  const limbsFor = (root, sk, byName) => {
    const boneOf = new Map(); for (const b of sk.bones) { const t = b.getTransformNode(); if (t) boneOf.set(t, b); }
    const dec = (n) => { const b = boneOf.get(n); try { const V = root.position.constructor, Q = (n.rotationQuaternion || root.rotationQuaternion || { constructor: null }).constructor; if (!b || !Q) throw 0; const vs = new V(), vp = new V(), qq = new Q(); b.getRestMatrix().decompose(vs, qq, vp); return { q: [qq.x, qq.y, qq.z, qq.w], p: [vp.x, vp.y, vp.z] }; } catch (e) { const q = n.rotationQuaternion; return { q: q ? [q.x, q.y, q.z, q.w] : [0, 0, 0, 1], p: [n.position.x, n.position.y, n.position.z] }; } };
    const chainTo = (n) => { const c = []; for (let x = n; x && x !== root; x = x.parent) c.unshift(x); return c; };
    const bindWorld = (n) => { let q = [0, 0, 0, 1], p = [0, 0, 0]; for (const x of chainTo(n)) { const d = dec(x); const r = qr(q, d.p); p = [p[0] + r[0], p[1] + r[1], p[2] + r[2]]; q = qm(q, d.q); } return { q, p }; };
    const toes = []; for (const sd of ['Left', 'Right']) { const f = byName.get(sd + 'Foot'), t = byName.get(sd + 'ToeBase'); if (f && t) { const a = bindWorld(f).p, b = bindWorld(t).p; toes.push(nrm([b[0] - a[0], 0, b[2] - a[2]])); } }
    const front = toes.length ? nrm(toes.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0])) : [0, 0, 1];
    const out = [];
    for (const [key, up, lo, end, toward] of [['LArm', 'LeftArm', 'LeftForeArm', 'LeftHand', 1], ['RArm', 'RightArm', 'RightForeArm', 'RightHand', 1], ['LLeg', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', -1], ['RLeg', 'RightUpLeg', 'RightLeg', 'RightFoot', -1]]) {
      const U = byName.get(up), L = byName.get(lo), E = byName.get(end); if (!U || !L || !E) continue;
      const bw = bindWorld(U), aL = nrm(dec(L).p), fL = qr(qi(bw.q), [front[0] * toward, front[1] * toward, front[2] * toward]);
      let h = nrm(crs(aL, fL));
      const s2 = Math.SQRT1_2, rot = [h[0] * s2, h[1] * s2, h[2] * s2, s2];
      if (dt3(qr(rot, aL), fL) < 0) h = [-h[0], -h[1], -h[2]];
      out.push({ key, U, L, E, h, aL, prevQ: null });
    }
    return out;
  };
  const makeBody = (id, root) => {
    const sk = skelOf(root); if (!sk) return null;
    const nodes = sk.bones.map((b) => b.getTransformNode()).filter(Boolean);
    const byName = new Map(nodes.map((n) => [clean(n.name), n]));
    return { id, root, sk, nodes, names: nodes.map((n) => n.name), set: new Set(nodes), jn: JN.map((j) => byName.get(j) || null), byName, limbs: limbsFor(root, sk, byName) };
  };
  const bodies = (HM.bodies = new Map());
  const groupOwner = new Map();
  HM.bind = () => {
    const want = [];
    const h = dev.hero && dev.hero(); if (h) want.push(['me', topOf(h)]);
    const md = scene.metadata || {};
    if (MODE === 'onevone' && md.onevone && md.onevone.foeRoot) want.push(['foe', topOf(md.onevone.foeRoot)]);
    else if (MODE === 'threevthree' && md.threevthree && md.threevthree.jobs) { for (const j of md.threevthree.jobs()) if (j.id !== 'me' && j.root) want.push([j.id, topOf(j.root)]); }
    else {
      // generic: every other rigged body near the court, in skeleton order (ids stable for the life of the page)
      HM.generic = HM.generic || new Map();
      const taken = new Set(want.map((w) => w[1]));
      for (const s of scene.skeletons) {
        const t = s.bones[0] && s.bones[0].getTransformNode(); const r = t && topOf(t);
        if (!r || taken.has(r) || (r.isDisposed && r.isDisposed())) continue;
        taken.add(r);
        const p = r.getAbsolutePosition(); if (Math.hypot(p.x, p.z) > 40) continue;
        if (!HM.generic.has(r)) HM.generic.set(r, 'b' + HM.generic.size);
        want.push([HM.generic.get(r), r]);
        // AUDIT 2026-09-25: the cap was 9 bodies (me + 8) and 3PT has 5 bench bodies at x 10.3 before the 5 rivals at x −9.2 in
        // skeleton order, so rivals 4 and 5 were never recorded (ai_3pt_react could only find rivals 1-3)
        if (want.length >= (Number(CFG.maxBodies) || 16)) break;
      }
    }
    let changed = false;
    const keep = new Set();
    for (const [id, root] of want) {
      keep.add(id);
      const cur = bodies.get(id);
      if (cur && cur.root === root) continue;
      const b = makeBody(id, root); if (!b) continue;
      bodies.set(id, b); changed = true;
    }
    for (const [id, b] of [...bodies]) if (!keep.has(id) || (b.root.isDisposed && b.root.isDisposed())) { bodies.delete(id); changed = true; }
    if (changed) groupOwner.clear();
    return [...bodies.keys()];
  };
  const ownerOf = (g) => {
    let o = groupOwner.get(g); if (o !== undefined) return o;
    o = ''; const ta = g.targetedAnimations || [];
    for (let i = 0; i < ta.length && i < 6 && !o; i++) { const t = ta[i].target; for (const b of bodies.values()) if (b.set.has(t)) { o = b.id; break; } }
    groupOwner.set(g, o); return o;
  };

  // ── 3. the recorder ──────────────────────────────────────────────────────────────────────────────────────────────
  const R = (HM.rec = { on: false, frames: [], max: Number(CFG.maxFrames) || 1500 });
  const r4 = (v) => Math.round(v * 1e4) / 1e4, r5 = (v) => Math.round(v * 1e5) / 1e5;
  const BALLS = ['ball', 'tp_ball', 'carn_ball'];
  let ballRef = null;
  const findBall = () => { if (ballRef && !ballRef.isDisposed()) return ballRef; ballRef = null; for (const n of BALLS) { const m = scene.getMeshByName(n); if (m) { ballRef = m; break; } } return ballRef; };
  HM.findBall = findBall;
  const hudNow = () => { const q = window.__FEL_QA__; return q && q.rawHud ? q.rawHud() : {}; };
  HM.hud = hudNow;
  const seam = () => (scene.metadata || {})[MODE] || null;
  HM.seam = seam;
  const state = () => {
    try {
      const s = seam(); const h = hudNow();
      if (MODE === 'onevone' && s) { const p = s.post(), c = s.carry(); return { po: s.possession(), ca: c.active ? c.side : '', sh: p.shooting ? 1 : 0, fi: p.finish ? 1 : 0, ga: p.gather ? 1 : 0, pst: p.posting ? 1 : 0, sp: p.spinning ? 1 : 0, st: h.shotType || '', ph: s.attackPhase ? s.attackPhase() : '', fj: s.foeJob ? s.foeJob() : '' }; }
      if (MODE === 'threevthree' && s) { const p = s.post(), c = s.carry(); const jobs = s.jobs ? s.jobs().map((j) => j.id + ':' + j.job + (j.boxing ? '!' : '')).join(' ') : ''; return { cr: s.carrier(), ca: c.active ? c.side : '', sh: p.shooting ? 1 : 0, fi: p.finish ? 1 : 0, ga: p.gather ? 1 : 0, pst: p.posting ? 1 : 0, st: h.shotType || '', ph: s.attackPhase ? s.attackPhase() : '', jb: jobs }; }
      if (MODE === 'threepoint') return { m: h.meter == null ? null : h.meter, mo: h.money ? 1 : 0, r: h.rackIdx, b: h.ballIdx, rd: h.round || '', bn: h.banner || '' };
      return { tm: h.time == null ? null : h.time, bn: h.banner || '' };
    } catch (e) { return { err: String((e && e.message) || e).slice(0, 60) }; }
  };
  const audit = (b) => {
    const jt = {};
    for (const Lm of b.limbs) {
      const uq = Lm.U.absoluteRotationQuaternion, qU = [uq.x, uq.y, uq.z, uq.w];
      const S = Lm.U.getAbsolutePosition(), E = Lm.L.getAbsolutePosition(), H = Lm.E.getAbsolutePosition();
      const a = nrm([E.x - S.x, E.y - S.y, E.z - S.z]), bb = nrm([H.x - E.x, H.y - E.y, H.z - E.z]);
      const bend = (Math.acos(Math.max(-1, Math.min(1, dt3(a, bb)))) * 180) / Math.PI;
      let err = -1; if (bend > 12) { const n = nrm(crs(a, bb)), hw = qr(qU, Lm.h); err = (Math.acos(Math.max(-1, Math.min(1, dt3(n, hw)))) * 180) / Math.PI; }
      let roll = 0; if (Lm.prevQ) { const d = qm(qi(Lm.prevQ), qU); const w = d[3] < 0 ? -d[3] : d[3], v = (d[3] < 0 ? -1 : 1) * dt3([d[0], d[1], d[2]], Lm.aL); roll = (2 * Math.atan2(v, w) * 180) / Math.PI; }
      Lm.prevQ = qU;
      jt[Lm.key] = [Math.round(bend), Math.round(err), Math.round(roll * 10) / 10];
    }
    return jt;
  };
  scene.onAfterRenderObservable.add(() => {
    if (!R.on) return;
    const clips = {};
    for (const g of scene.animationGroups) {
      if (!g.isPlaying) continue;
      const o = ownerOf(g); if (!o) continue;
      const a = g.animatables && g.animatables[0];
      const w = a && typeof a.weight === 'number' && a.weight >= 0 ? a.weight : g.weight >= 0 ? g.weight : 1;
      if (w <= 0.02) continue;
      // AUDIT 2026-09-25: a group whose weight was never set (−1) is recorded as 1 like before, with a third element −1: Babylon
      // writes an unweighted group straight to the bones and lets any weighted group on the same bones override it, while two
      // explicit 1.0 weights are slerped 50/50 — the two read the same without this flag
      const raw = a && typeof a.weight === 'number' ? a.weight : g.weight;
      (clips[o] = clips[o] || []).push(raw < 0 ? [g.name, 1, -1] : [g.name, Math.round(w * 100) / 100]);
    }
    const f = { t: C.vt, B: {} };
    for (const b of bodies.values()) {
      const root = b.root; if (root.isDisposed && root.isDisposed()) continue;
      const rp = root.position, rq = root.rotationQuaternion;
      const q = new Array(b.nodes.length * 4);
      for (let i = 0; i < b.nodes.length; i++) { const r = b.nodes[i].rotationQuaternion; if (r) { q[i * 4] = r5(r.x); q[i * 4 + 1] = r5(r.y); q[i * 4 + 2] = r5(r.z); q[i * 4 + 3] = r5(r.w); } else { q[i * 4] = 0; q[i * 4 + 1] = 0; q[i * 4 + 2] = 0; q[i * 4 + 3] = 1; } }
      const hips = b.jn[0];
      const j = b.jn.map((n) => { if (!n) return null; const a = n.getAbsolutePosition(); return [r4(a.x), r4(a.y), r4(a.z)]; });
      f.B[b.id] = {
        rp: [r4(rp.x), r4(rp.y), r4(rp.z)], rq: rq ? [r5(rq.x), r5(rq.y), r5(rq.z), r5(rq.w)] : null,
        rr: [r5(root.rotation.x), r5(root.rotation.y), r5(root.rotation.z)], rs: [r4(root.scaling.x), r4(root.scaling.y), r4(root.scaling.z)],
        q, hp: hips ? [r5(hips.position.x), r5(hips.position.y), r5(hips.position.z)] : null, j, jt: audit(b), c: clips[b.id] || [],
      };
    }
    const ball = findBall();
    if (ball) {
      const a = ball.getAbsolutePosition(); const par = ball.parent; let bb = '';
      if (par) for (const b of bodies.values()) if (b.set.has(par)) { bb = b.id; break; }
      f.ball = [r4(a.x), r4(a.y), r4(a.z)]; f.bp = par ? par.name : ''; f.bb = bb; f.bh = par ? (/left/i.test(par.name) ? 'L' : /right/i.test(par.name) ? 'R' : '') : '';
      f.br = !!(ball.metadata && ball.metadata.felReleased); f.be = ball.isEnabled() ? 1 : 0;
    }
    f.s = state();
    R.frames.push(f);
    if (R.frames.length > R.max) R.frames.shift();
  });
  HM.pull = (from, n) => {
    const fr = R.frames.slice(from || 0, (from || 0) + (n || R.frames.length));
    return { bodies: Object.fromEntries([...bodies.values()].map((b) => [b.id, b.names])), frames: fr, total: R.frames.length, marks: from ? [] : HM.marks.slice(), errors: HM.errors.slice(-20) };
  };

  // ── 4. the drivers ───────────────────────────────────────────────────────────────────────────────────────────────
  const agent = () => window.__NEXUS_AGENT__;
  const bus = () => dev.input;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const until = async (pred, maxMs) => { const t0 = C.vt; while (C.vt - t0 < maxMs) { let ok = false; try { ok = !!pred(); } catch (e) {} if (ok) return true; await frame(); } return false; };
  HM.sleep = sleep; HM.until = until; HM.frame = frame;
  const act = (intent, ms) => agent().act(intent, ms);   // the hold drains on frame dt; the promise resolves on the virtual clock
  const heroRoot = () => { const h = dev.hero && dev.hero(); return h ? topOf(h) : null; };
  const RIM = { x: 0, z: -0.6 };
  const distRim = () => { const r = heroRoot(); return r ? Math.hypot(r.position.x - RIM.x, r.position.z - RIM.z) : 99; };
  /** The stick that points the hero at a WORLD point: the mode maps every stick through the director's camera (camRel), so
   *  this is the inverse of that — the lab's __steer, unchanged. */
  const stickTo = (tx, tz) => {
    const cam = scene.activeCamera, r = heroRoot(); if (!cam || !r) return null;
    const wx = tx - r.position.x, wz = tz - r.position.z, wl = Math.hypot(wx, wz); if (wl < 0.2) return null;
    const f = cam.getForwardRay().direction; const fl = Math.hypot(f.x, f.z) || 1; const fx = f.x / fl, fz = f.z / fl;
    return { x: (wx * fz - wz * fx) / wl, y: (wx * fx + wz * fz) / wl };
  };
  const guardRoot = () => { const s = seam(); if (!s) return null; if (MODE === 'onevone') return s.foeRoot; const n = s.nearestFoeRoot ? s.nearestFoeRoot() : null; return n || s.foeRoot; };
  /** Drive at the rim until `stop` metres out, going AROUND the defender inside 2.2 m (the lab's driveToRim). */
  const driveTo = async (stop, mag, extra, maxMs) => {
    const t0 = C.vt; let side = 0;   // the side of the defender to go by is picked ONCE per drive: re-picked every 130 ms it
    // flipped the stick in traffic, and the mode reads a stick reversal as a MOVE (measured in 3v3: a spin, then three in the key)
    while (C.vt - t0 < (maxMs || 2600)) {
      if (distRim() <= stop) return true;
      const r = heroRoot(); let tx = RIM.x, tz = RIM.z;
      const g = guardRoot(); if (g && r && Math.hypot(r.position.x - g.position.x, r.position.z - g.position.z) < 2.2) { if (!side) side = r.position.x >= g.position.x ? 1 : -1; tx = RIM.x + side * 1.3; }
      const v = stickTo(tx, tz); if (!v) return true;
      await act(Object.assign({ moveX: v.x * mag, moveY: v.y * mag, sprint: mag > 0.85 }, extra || {}), 130);
    }
    return false;
  };
  /** THE SHOT, released IN THE GREEN: the squeeze is held a frame at a time and let go on the frame the HUD meter reaches the
   *  centre of the mode's own green (shotMeterGreen "centre,half"). A fixed hold was graded LATE on the first smoke (the
   *  green sits at the rise's 0.62 after the gather, so it moves with the gather). `charge` keeps the lab's fixed hold. */
  const shoot = async (charge, hold, green) => {
    if (green === false || CFG.green === false) { await act(Object.assign({ actionHeld: charge }, hold || {}), Math.round(600 * charge)); await act(Object.assign({ actionHeld: 0, action: true }, hold || {}), 80); return; }
    const t0 = C.vt; let started = false;
    while (C.vt - t0 < 1800) {
      await act(Object.assign({ actionHeld: 1 }, hold || {}), DT);
      const h = hudNow(); const t = Number(h.shotMeterT) || 0; const g = String(h.shotMeterGreen || '').split(',').map(Number);
      if (t > 0) started = true;
      if (started && g.length === 2 && isFinite(g[0]) && t >= g[0] - g[1] * 0.1) break;
      if (started && t <= 0 && C.vt - t0 > 200) break;   // the meter closed on its own (a finish released off the gather)
    }
    await act(Object.assign({ actionHeld: 0, action: true }, hold || {}), 80);
  };
  const Rs = (x, y) => bus().emit({ t: 'stick', side: 'R', x, y });
  const flick = async (x, y) => { Rs(x, y); await sleep(30); Rs(x * 0.9, y * 0.9); await sleep(60); Rs(0, 0); };
  const sweep = async () => { for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * Math.PI; Rs(Math.cos(a) * 0.95, Math.sin(a) * 0.95); await sleep(28); } Rs(0, 0); };
  const ballMir = () => { const s = seam(); const c = s && s.carry ? s.carry() : null; return c && c.side === 'Left' ? -1 : 1; };
  const key = (k, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k, bubbles: true }));
  const tapKey = async (k, ms) => { key(k, true); await sleep(ms || 70); key(k, false); };
  HM.key = key; HM.tapKey = tapKey;
  // the 2K right-stick gestures, written for the ball in the RIGHT hand (x flips for the left) — the lab's rstick table
  const HANDLE = { hesi: [1, 0], between: [-1, 0], crossover: [-0.75, -0.75], inout: [0, -1], behind: [-0.75, 0.75], sizeup: [0.75, -0.75] };

  const P = (HM.plays = {});
  P.idle = async (o) => { await act({ moveX: 0, moveY: 0 }, o.ms || 1500); };
  P.waitOnly = async (o) => { await sleep(o.ms || 1500); };   // modes with no agent control (3PT, the carnival)
  P.jumper = async (o) => { await act({ moveX: 0, moveY: 0 }, 500); await shoot(o.charge ?? 0.8, null, o.green); };
  P.jumperNow = async (o) => { await shoot(o.charge ?? 0.8, null, o.green); };   // at the check: the defender is still on the ball (a contested look)
  // THE PULL-UP ACROSS THE FLOOR: straight at the rim the jog reached the floater band before the squeeze (measured: FLOATER
  // at 3.32 m), so the pull-up is taken moving sideways at the arc — the rim stays 5+ m away and the body is at speed
  P.pullup = async (o) => { const x = o.side ?? 0.75; await act({ moveX: x, moveY: 0.1, sprint: false }, 650); await shoot(o.charge ?? 0.8, { moveX: x, moveY: 0.1, sprint: false }, o.green); };
  // THE FADE from the check: giving ground at speed (> 1.2 m/s, mostly away) at the squeeze — a 320 ms back-step after a jog
  // in still had the forward momentum and read as a HOOK (measured)
  P.fade = async (o) => { await act({ moveX: 0, moveY: -0.8, sprint: false }, 600); await shoot(o.charge ?? 0.8, { moveX: 0, moveY: -0.8, sprint: false }, o.green); };
  // THE STEP-BACK is the right stick pulled DOWN off the dribble (the lab's rstick table); L2 held near the defender is a
  // post-up (measured: the first version posted up and shot a set jumper)
  P.stepback = async (o) => {
    const jog = act({ moveX: 0, moveY: 0.4 }, 900);
    await sleep(600); await flick(0, 1);
    await jog;
    await shoot(o.charge ?? 0.8, null, o.green);   // inside STEPBACK_WINDOW_SEC: the step-back jumper
  };
  // THE LAYUP FROM THE WING: straight down the middle the defender stays on the hip and the read is a running HOOK
  // (measured at 6.2 m/s, 2.70 m out); in from the wing he trails, and the read is the layup's
  const wing = async (x) => { const t0 = C.vt; while (C.vt - t0 < 1500) { const v = stickTo(x, 2.2); if (!v) break; const r = heroRoot(); if (r && Math.hypot(r.position.x - x, r.position.z - 2.2) < 0.7) break; await act({ moveX: v.x, moveY: v.y, sprint: false }, 130); } };
  P.layup = async (o) => {
    if (o.baseline) { const t0 = C.vt; while (C.vt - t0 < 3000) { const v = stickTo(4.2, -0.3); if (!v) break; const r = heroRoot(); if (r && Math.hypot(r.position.x - 4.2, r.position.z + 0.3) < 0.7) break; await act({ moveX: v.x, moveY: v.y, sprint: false }, 130); } }
    else await wing(o.wing ?? 3.2);
    const mag = o.mag ?? 0.8; await driveTo(o.stop ?? 2.8, mag, null, 2600); await shoot(o.charge ?? 0.8, { moveX: 0, moveY: mag }, o.green);
  };
  /** A shot at the check with the AI's rolls HELD OFF on the dribble (no strip) and let loose at the squeeze (luck 0: the block
   *  jump or the hand-up lands, whichever his read allows — a block needs him inside 2.2 m, facing, at the gather). */
  P.contested = async (o) => { const s = seam(); await act({ moveX: 0, moveY: o.creep ?? 0.25 }, o.hold ?? 350); if (s && s.luck) s.luck(o.luckShot ?? 0); await shoot(o.charge ?? 0.8, null, o.green); };
  P.floater = async (o) => { await driveTo(3.0, 0.45, null, 4000); await act({ moveX: 0, moveY: 0 }, 150); await shoot(o.charge ?? 0.8, null, o.green); };
  P.dunk = async (o) => { if (o.wing) await wing(o.wing); await driveTo(2.4, 1); await shoot(o.charge ?? 0.8, { moveX: 0, moveY: 1, sprint: true, turbo: true }, o.green); };
  P.handle = async (o) => {
    const jog = act({ moveX: 0, moveY: 0.35 }, 1700);
    await sleep(500);
    if (o.move === 'spin') await sweep(); else { const v = HANDLE[o.move] || HANDLE.crossover; await flick(v[0] * ballMir(), v[1]); }
    await jog;
  };
  P.posthook = async () => {
    await driveTo(3.4, 1);
    const post = act({ brace: true }, 1600);
    await sleep(500); Rs(0.7, -0.7); await sleep(200); Rs(0.72, -0.7); await sleep(200); Rs(0.72, -0.7); await sleep(250); Rs(0, 0);
    await post; await sleep(600);
  };
  P.postread = async (o) => {
    await driveTo(3.2, 1);
    await act({ moveX: 0, moveY: 0.3, brace: true }, 900);
    const c = o.charge ?? 0.8;
    if (o.read === 'fade') { await act({ moveX: 0, moveY: -1, sprint: true, brace: true, actionHeld: c }, Math.round(600 * c) + 380); await act({ moveX: 0, moveY: -1, sprint: true, brace: true, actionHeld: 0, action: true }, 80); }
    else if (o.read === 'dropstep') { await act({ moveX: 0, moveY: 1, brace: true, actionHeld: c }, Math.round(600 * c) + 340); await act({ moveX: 0, moveY: 1, brace: true, actionHeld: 0, action: true }, 80); }
    else {
      await act({ moveX: 0, moveY: 0, brace: true, actionHeld: 0.3 }, 120); await act({ moveX: 0, moveY: 0, brace: true, actionHeld: 0, action: true }, 60);
      await sleep(150);
      await act({ moveX: 0, moveY: 0.6, brace: true, actionHeld: c }, Math.round(600 * c) + 300); await act({ moveX: 0, moveY: 0.6, brace: true, actionHeld: 0, action: true }, 80);
    }
  };
  P.rebound = async (o) => {
    if (o.close) await driveTo(3.4, 0.7, null, 2500);   // a closer miss: the crash starts nearer the iron
    await act({ moveX: 0, moveY: 0 }, 400);
    await shoot(o.charge ?? 0.3, null, false);   // released early on purpose: short off the front of the iron
    const t0 = C.vt;
    if (o.crash === false) { await act({ moveX: 0, moveY: 0 }, 2400); return; }   // stand and watch: the board is his
    const spot = o.spot || [0.4, 0.8];
    while (C.vt - t0 < 2400) { const v = stickTo(spot[0], spot[1]); await act(v ? { moveX: v.x * 0.9, moveY: v.y * 0.9, sprint: true, brace: true } : { brace: true }, 130); }
  };
  // THE PASS. A chest pass is picked off when a defender's feet are within 0.8 m of its flight (3v3), and an unaimed pass into
  // a set defence was picked off in both first takes — so the pass goes at the CHECK (before the coverage sets), or to the
  // screener as he POPS (o.afterScreen: call the screen, pass on the pop)
  P.pass = async (o) => {
    if (o.afterScreen) { await act({ screen: true }, 80); await until(() => HM.marks.some((m) => /screen pop/.test(m.msg)), 2500); }
    else await act({ moveX: 0, moveY: 0 }, o.wait ?? 0);
    await act({ pass: true }, 80); await act({ moveX: 0, moveY: 0 }, 1800);
  };
  /** THE ALLEY-OOP (3v3 D7): an UNAIMED pass to a teammate cutting hard at the rim goes up as a lob — the only mate shot that is
   *  not a 1 %-a-frame roll inside 3.5 m of the rim. Waits (up to 3.5 s) for a mate inside 4.5 m of the rim moving > 2.5 m/s. */
  P.passToCutter = async () => {
    const s = seam(); const t0 = C.vt; let fired = false;
    while (C.vt - t0 < 3500 && !fired) {
      const jobs = s && s.jobs ? s.jobs() : [];
      const cutter = jobs.find((j) => /^mate/.test(j.id) && Math.hypot(j.x - RIM.x, j.z - RIM.z) < 4.5 && j.speed > 2.5);
      if (cutter) { fired = true; await act({ moveX: 0, moveY: 0, pass: true }, 80); break; }
      await act({ moveX: 0, moveY: 0 }, 50);
    }
    if (!fired) await act({ moveX: 0, moveY: 0, pass: true }, 80);
    await act({ moveX: 0, moveY: 0 }, 1800);
  };
  P.screen = async (o) => { await act({ screen: true }, 80); await sleep(400); await driveTo(3.2, 0.8); await shoot(o.charge ?? 0.8, null, o.green); };
  /** Defense: stay a metre off the handler on the rim side (3v3: drop to the rim once the drive starts), then the style. */
  P.defend = async (o) => {
    const s = seam(); if (!s) return;
    const onD = () => (MODE === 'onevone' ? s.possession() === 'defense' : s.carrier() === 'foeTeam');
    const t0 = C.vt; let lastPh = ''; let poked = false;
    while (C.vt - t0 < (o.maxMs || 7000) && onD()) {
      const him = MODE === 'onevone' ? s.foeRoot : (s.driverRoot && s.driverRoot()) || s.foeRoot;
      const ph = s.attackPhase ? s.attackPhase() : '';
      if (ph === 'gather' && lastPh !== 'gather' && o.style === 'block' && s.block) s.block();
      lastPh = ph;
      const intent = { moveX: 0, moveY: 0 };
      if (him) {
        const hp = him.position; let tx, tz;
        if (MODE === 'threevthree' && ph !== '' && ph !== 'check' && o.style !== 'steal') { const rl = Math.hypot(hp.x - RIM.x, hp.z - RIM.z) || 1; tx = RIM.x + ((hp.x - RIM.x) / rl) * 1.0; tz = RIM.z + ((hp.z - RIM.z) / rl) * 1.0; }
        else { const dx = RIM.x - hp.x, dz = RIM.z - hp.z, dl = Math.hypot(dx, dz) || 1; tx = hp.x + (dx / dl) * 1.0; tz = hp.z + (dz / dl) * 1.0; }
        if (o.style === 'steal') { tx = hp.x + (tx - hp.x) * 0.35; tz = hp.z + (tz - hp.z) * 0.35; }   // the poke needs his dribble inside 1.7 m: play up on him
        const v = stickTo(tx, tz); if (v) { intent.moveX = v.x * 0.8; intent.moveY = v.y * 0.8; intent.sprint = false; }
        const r = heroRoot(); const gap = r ? Math.hypot(r.position.x - hp.x, r.position.z - hp.z) : 99;
        if (o.style === 'contest' && (ph === 'gather' || (s.post && s.post().shooting))) intent.contest = true;
        if (o.style === 'contest' && gap < 2.4 && ph !== 'drive') intent.contest = true;
        if (o.style === 'steal' && !poked && gap < 1.7) { poked = true; intent.steal = true; }
        if (o.style === 'box') intent.brace = true;
      }
      await act(intent, 120);
    }
  };
  /** 3PT: the J key on the bar's own tell — pressed the first frame the HUD meter reaches the target (0.72). */
  P.threept = async (o) => {
    const tgt = o.target ?? 0.72; const t0 = C.vt; let lastKey = ''; let firedAt = 0;
    while (C.vt - t0 < (o.ms || 13000)) {
      const h = hudNow(); const k = h.rackIdx + ':' + h.ballIdx + ':' + (h.round || '');
      const live = typeof h.meter === 'number';
      if (live && (k !== lastKey || C.vt - firedAt > 600) && h.meter >= tgt - 0.004 && h.meter < tgt + 0.12) { lastKey = k; firedAt = C.vt; await tapKey('j', 50); }
      await frame();
    }
  };
  /** 3PT: keep firing until the qualifying standings are up (not recorded). */
  P.threeptUntilStandings = async (o) => {
    const t0 = C.vt;
    while (C.vt - t0 < (o.ms || 70000)) {
      const h = hudNow(); if (h.board && !(typeof h.meter === 'number')) return;
      await P.threept({ ms: 1000, target: o.target });
    }
  };
  /** Carnival Slam Rush: space held (the analog R trigger ramps 0 → 1 over 1.1 s) to the sweet spot, then let go. */
  P.slam = async (o) => { key(' ', true); await sleep(o.holdMs || 950); key(' ', false); await sleep(o.after || 900); };
  P.waitHud = async (o) => { await until(() => { const h = hudNow(); return o.key in h && h[o.key] !== null && h[o.key] !== '' && (o.value == null || h[o.key] === o.value); }, o.ms || 30000); };
  P.carnivalSettle = async (o) => { await until(() => { const h = hudNow(); return !(typeof h.time === 'number' && h.time > 0) || !!h.board; }, o.ms || 30000); await sleep(o.after || 3500); };

  /** One take: the preparation (a possession reset through the seam), the play, the tail. Recording spans play + tail. */
  HM.take = async (name, o) => {
    o = o || {};
    HM.resume();
    const s = seam();
    if (o.seed != null) HM.reseed(o.seed);   // before the reset: the reset and the settle roll the same dice every run
    let prepOk = true;
    // AUDIT 2026-09-25: RECORD FROM THE RESET, not from the end of the settle. 74 of 382 baseline recordings had less pre-roll than
    // their window (the clip was already on when the play began: hero_1v1_def_stance, ai_3v3_help, ai_3v3_drive, the first 3PT rack
    // shot …) and the anchor fell on the take's first frame, which is not an onset. The prep frames are kept; the node side searches
    // play anchors from tPlay and cuts every window at a reset.
    const recPrep = o.rec !== false && CFG.recPrep === true && !!o.prep;   // opt-in: the attempts runners' anchor code predates it
    HM.bind(); R.frames = []; HM.marks = []; R.on = recPrep;
    const tPrep = C.vt;
    if (o.prep === 'offense' && s && s.offense) {
      // A STABLE reset: a make's pending hand-over (3v3 alternates possessions: later(200, opponentPossession)) could fire
      // just after my reset and start THEIR possession inside my take (measured: the pass take passed on defence). The reset
      // must hold for `stable` ms; if it flips, reset again.
      const mineNow = () => (MODE === 'onevone' ? s.possession() === 'mine' && s.post().carrying : s.carrier() === 'me');
      for (let tries = 0; tries < 4; tries++) {
        s.offense();
        prepOk = await until(mineNow, 8000);
        const held = await until(() => !mineNow(), o.stable ?? (MODE === 'threevthree' ? 700 : 0));
        if (!held || (o.stable ?? (MODE === 'threevthree' ? 700 : 0)) === 0) break;
      }
      await sleep(o.settle ?? 150);
    } else if (o.prep === 'defense' && s && s.defend) {
      s.defend();
      prepOk = await until(() => (MODE === 'onevone' ? s.possession() === 'defense' : s.carrier() === 'foeTeam'), 8000);
      await sleep(o.settle ?? 300);
    }
    const roots0 = [...bodies.values()].map((b) => b.root);
    HM.bind();
    // a body re-bound by the reset would misindex the frames recorded before it: drop the prep frames then
    if (!recPrep || [...bodies.values()].some((b, i) => b.root !== roots0[i]) || bodies.size !== roots0.length) { R.frames = []; HM.marks = []; }
    // the AI's block / strip / hand-up rolls: 0.99 = none land (so my play reaches its end), 0 = all land, null = the dice
    const luck = Object.prototype.hasOwnProperty.call(o, 'luck') ? o.luck : undefined;
    if (luck !== undefined && s && s.luck) s.luck(luck);
    R.on = o.rec !== false;
    const t0 = C.vt, w0 = realNow();
    let err = '';
    try { await P[o.play || name](o); } catch (e) { err = String((e && e.message) || e).slice(0, 200); }
    await sleep(o.postMs ?? 2600);
    R.on = false;
    if (luck !== undefined && s && s.luck) s.luck(null);
    const ended = !!(s && s.ended && s.ended());
    HM.pause();
    return { name, prepOk, luck, ended, t0, tPlay: t0, tPrep, t1: C.vt, virtualMs: Math.round(C.vt - t0), wallMs: Math.round(realNow() - w0), frames: R.frames.length, err, bodies: [...bodies.keys()], clock: { vt0: C.vt0, frames: C.frames } };
  };
  HM.ended = () => { const s = seam(); return !!(s && s.ended && s.ended()); };
  /** Wake the mode (the agent bridge's start), the carnival's first press, the settle — then pause until the first take. */
  HM.startMode = async (o) => {
    o = o || {};
    HM.resume();
    const a = agent(); const started = a ? await a.start(30000) : 'no bridge';
    if (MODE === 'carnival') { await sleep(800); await tapKey('j', 60); await until(() => { const h = hudNow(); return typeof h.time === 'number' && h.time > 0; }, 30000); }
    await sleep(o.settle || 1200);
    HM.pause();
    return { started, frames: C.frames, virtualMs: Math.round(C.vt - C.vt0), wallMs: Math.round(realNow() - C.wall0) };
  };

  // ── 5. the frozen replay: stop everything, then pose recorded frames and photograph them ──────────────────────────────
  HM.freeze = () => {
    R.on = false; C.frozen = true;
    const eng = scene.getEngine(); eng.stopRenderLoop();
    scene.animationsEnabled = false;
    for (const k of ['onBeforeRenderObservable', 'onAfterRenderObservable', 'onAfterAnimationsObservable', 'onBeforeAnimationsObservable', 'onBeforeCameraRenderObservable', 'onAfterCameraRenderObservable', 'onBeforeActiveMeshesEvaluationObservable']) { try { scene[k].clear(); } catch (e) {} }
    const st = document.createElement('style'); st.textContent = 'body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important}'; document.head.appendChild(st);
    // PHYSICS: the player roots carry physics bodies, and the step inside scene.render() wrote each body's position back onto
    // its root — a posed frame came out at the spawn (measured: the hero drawn at (0, 0, 5), 1.3 m off the recording)
    let phys = 0;
    try { if ('physicsEnabled' in scene) scene.physicsEnabled = false; } catch (e) {}
    for (const n of [...scene.transformNodes, ...scene.meshes]) { const pb = n.physicsBody; if (pb) { phys++; try { pb.disableSync = true; pb.disablePreStep = true; } catch (e) {} } }
    const ball = findBall(); if (ball) { ball.setParent(null); }
    scene.activeCamera.fov = 0.72;
    HM.hidden = [];
    return { cam: scene.activeCamera.getClassName(), bodies: [...bodies.keys()], ball: !!ball, physicsBodiesMuted: phys, physicsEnabled: scene.physicsEnabled };
  };
  /** Pose every recorded body of frame `f` (names per body id), aim the camera at the subject, render, and report how far the
   *  posed joints landed from the recorded ones (a layer still writing after the freeze would show here). */
  HM.pose = (names, f, subject, view, fwd) => {
    for (const id of Object.keys(f.B)) {
      const b = bodies.get(id); const d = f.B[id]; if (!b || !d) continue;
      const r = b.root; r.position.set(d.rp[0], d.rp[1], d.rp[2]);
      if (d.rq) { if (!r.rotationQuaternion) r.rotationQuaternion = r.rotation.toQuaternion(); r.rotationQuaternion.set(d.rq[0], d.rq[1], d.rq[2], d.rq[3]); } else { r.rotationQuaternion = null; r.rotation.set(d.rr[0], d.rr[1], d.rr[2]); }
      r.scaling.set(d.rs[0], d.rs[1], d.rs[2]);
      const nm = names[id] || [];
      for (let i = 0; i < nm.length; i++) { const n = b.byName.get(clean(nm[i])); if (!n) continue; if (!n.rotationQuaternion) n.rotationQuaternion = n.rotation.toQuaternion(); n.rotationQuaternion.set(d.q[i * 4], d.q[i * 4 + 1], d.q[i * 4 + 2], d.q[i * 4 + 3]); }
      const hips = b.byName.get('Hips'); if (hips && d.hp) hips.position.set(d.hp[0], d.hp[1], d.hp[2]);
      r.computeWorldMatrix(true); for (const n of r.getDescendants(false)) if (n.computeWorldMatrix) n.computeWorldMatrix(true);
    }
    const ball = findBall();
    if (ball) { if (f.ball) { ball.setEnabled(true); ball.position.set(f.ball[0], f.ball[1], f.ball[2]); ball.computeWorldMatrix(true); } else ball.setEnabled(false); }
    const sb = f.B[subject]; const b = bodies.get(subject);
    if (!sb || !b) { scene.render(); return { err: 'no subject' }; }
    const hp = sb.j[0] || sb.rp; const tgt = { x: hp[0], y: hp[1] + 0.2, z: hp[2] };   // the hips + 0.2: the feet and an overhead hand both in a 440 px cell
    const right = [fwd[2], 0, -fwd[0]];
    const dir = view === 'side' ? right : [fwd[0] * 0.77 + right[0] * 0.64, 0, fwd[2] * 0.77 + right[2] * 0.64];
    const D = Number(CFG.camDist) || 6.0, c = scene.activeCamera, V = c.position.constructor;
    const pos = new V(tgt.x + dir[0] * D, tgt.y + (view === 'side' ? 0.15 : 0.6), tgt.z + dir[2] * D);
    if (c.setPosition && c.target) { c.target = new V(tgt.x, tgt.y, tgt.z); c.setPosition(pos); } else { c.position.copyFrom(pos); c.setTarget(new V(tgt.x, tgt.y, tgt.z)); }
    for (const m of HM.hidden) m.setEnabled(true);
    HM.hidden = [];
    const Ray = c.getForwardRay(1).constructor;
    for (let k = 0; k < 12; k++) {
      c.computeWorldMatrix(true);
      const from = c.position.clone(), to = new V(tgt.x, tgt.y, tgt.z); const d = to.subtract(from); const L = d.length();
      const hit = scene.pickWithRay(new Ray(from, d.normalize(), L - 0.7), (m) => m.isEnabled() && m.isVisible && m.getTotalVertices() > 0 && !m.isDescendantOf(b.root) && m !== ball && !(ball && m.isDescendantOf(ball)), false);
      if (!hit || !hit.hit || !hit.pickedMesh) break;
      hit.pickedMesh.setEnabled(false); HM.hidden.push(hit.pickedMesh);
    }
    scene.render();
    let e = 0, n = 0; for (let i = 0; i < b.jn.length; i++) { const node = b.jn[i]; const want = sb.j[i]; if (!node || !want) continue; const a = node.getAbsolutePosition(); e += Math.hypot(a.x - want[0], a.y - want[1], a.z - want[2]); n++; }
    return { poseErr: n ? Math.round((e / n) * 1e4) / 1e4 : -1 };
  };
  HM.pause();   // from here on the game only runs inside startMode() and a take
  return { ok: true, mode: MODE, dt: DT, bodies: HM.bind() };
})();
