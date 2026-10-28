// hoops-audit IN-PAGE half (lane/hoops-audit, 2026-10-27). Plain JS, evaluated into the rig page (./entry.mjs, DEV bundle)
// once the hoops seam is up. The driver (./drive.mjs) installs the virtual clock first: every rendered frame is 1/60 s of game
// time, Math.random is seeded, so a run measures FRAMES, not machine load.
//
// Three jobs:
//   1. THE RECORDER (scene.onAfterRenderObservable — the pose the player saw): per body the root, the 20 watched bones' local
//      rotation speed, both feet, both hands and the head; the ball and who holds it; the camera; where the hero sits on screen;
//      the possession. Typed arrays, analysed in the page (HG.analyse) so only numbers cross back.
//      Metric definitions follow scripts/probes/_hoops-motion-probe.mts where it has one (pops, planted-foot slide), so the
//      numbers sit next to the hoops-motion baseline: a POP is a bone turning >= 600 deg/s, >= 3.5x the median of the 6 frames
//      either side (floored at 60) and >= 3x the speed 3 frames away; SEVERE >= 3000 deg/s. A planted foot is low (within 5 cm
//      of the body's 5th-percentile foot height), the lower foot, and not rising (> 2 mm a frame); its slide is its XZ travel
//      that frame.
//   2. THE BOT (scene.onBeforeRenderObservable): a scripted, imperfect human through the real InputBus — on the ball it drives
//      at the rim with a sway, throws right-stick moves, passes (3v3), and holds Square (X) to shoot, letting go near the HUD's
//      green with a timing error; off the ball it shadows the driver, pokes and jumps at the gather after a 220 ms "human"
//      delay. Every press is logged with its frame.
//   3. THE TESTS (HG.test.*): input -> response on the game clock — the stick (onset, time to pace, stop), a reversal, the shot
//      press, each right-stick flick, a pass, the poke and the block jump. Frame counts x 16.7 ms; display / OS latency is NOT in
//      them (add about 2-4 frames on a phone).
(() => {
  if (window.__hg) return 'already';
  const CFG = window.__HG_CFG || {};
  const dev = window.__FEL_DEV__;
  const scene = dev.scene;
  const bus = window.__bus;
  const MODE = dev.modeId;
  const engine = scene.getEngine();
  const HG = (window.__hg = { mode: MODE, errors: [], frame: 0, inputs: [], strips: {}, notes: [] });
  const S = () => (scene.metadata || {})[MODE];
  const topOf = (n) => { while (n && n.parent) n = n.parent; return n; };
  const clean = (n) => String(n).replace(/^mixamorig:?/, '').replace(/(_c\d+)+$/, '').replace(/_p\d+$/, '');
  const now = () => performance.now();
  const RIM = { x: 0, z: -0.6 };
  const V3 = scene.activeCamera.position.constructor;

  // ── bodies ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const WATCH = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot'];
  const NW = WATCH.length;
  const skelOf = (root) => scene.skeletons.find((s) => s.bones.length && s.bones.some((b) => { const t = b.getTransformNode(); return t && t.isDescendantOf(root); }));
  const makeBody = (id, root) => {
    const sk = skelOf(root); if (!sk) return null;
    const by = new Map(); for (const b of sk.bones) { const t = b.getTransformNode(); if (t) by.set(clean(t.name), t); }
    const set = new Set(by.values());
    return { id, root, set, w: WATCH.map((n) => by.get(n) || null), lf: by.get('LeftFoot'), rf: by.get('RightFoot'), lh: by.get('LeftHand'), rh: by.get('RightHand'), head: by.get('Head'), hips: by.get('Hips'), prevQ: WATCH.map(() => null) };
  };
  const B = [];
  const bind = () => {
    const want = [];
    const h = dev.hero && dev.hero(); if (h) want.push(['me', topOf(h)]);
    const s = S();
    if (MODE === 'onevone' && s && s.foeRoot) want.push(['foe', topOf(s.foeRoot)]);
    if (MODE === 'threevthree' && s && s.jobs) for (const j of s.jobs()) if (j.id !== 'me' && j.root) want.push([j.id, topOf(j.root)]);
    for (const [id, r] of want) { if (B.some((b) => b.id === id)) continue; const b = makeBody(id, r); if (b) B.push(b); else HG.errors.push('no skeleton for ' + id); }
    HG.bodies = B.map((b) => b.id);
  };
  bind();
  const NB = 6;
  const MAXF = CFG.maxFrames || 20000;
  const K = 17;   // root xyz yaw | lf xyz | rf xyz | lh xyz | rh xyz | head y
  const ang = new Float32Array(MAXF * NB * NW);
  const pos = new Float32Array(MAXF * NB * K);
  const ballA = new Float32Array(MAXF * 5);       // x y z holderBody(-1 none) heldByBone(0/1)
  const camA = new Float32Array(MAXF * 7);        // pos xyz fwd xyz fov
  const scr = new Float32Array(MAXF * 3);         // hero ndc x y, in front (1/0)
  const poss = new Int8Array(MAXF);               // 1 = my team's ball, 2 = theirs, 0 = neither / dead
  const tArr = new Float64Array(MAXF);
  let F = 0;
  const ball = () => scene.getMeshByName('ball');
  const qAng = (a, b) => { const d = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w); return 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI; };
  const lqOf = (t) => { if (t.rotationQuaternion) return t.rotationQuaternion; const r = t.rotation; const Q = scene.activeCamera.absoluteRotation ? scene.activeCamera.absoluteRotation.constructor : null; return Q ? Q.FromEulerAngles(r.x, r.y, r.z) : null; };
  const holderOfBall = () => {
    const bl = ball(); if (!bl || !bl.parent) return [-1, 0];
    let n = bl.parent;
    for (let i = 0; i < 6 && n; i++, n = n.parent) for (let bi = 0; bi < B.length; bi++) if (B[bi].set.has(n) || B[bi].root === n) return [bi, 1];
    return [-1, 0];
  };
  const possCode = () => {
    const s = S(); if (!s) return 0;
    try {
      if (MODE === 'onevone') return s.possession() === 'mine' ? 1 : 2;
      const c = s.carrier(); return c === 'foeTeam' ? 2 : 1;
    } catch (e) { return 0; }
  };
  HG.possCode = possCode;
  const record = () => {
    if (!HG.rec || F >= MAXF) return;
    const cam = scene.activeCamera;
    tArr[F] = now();
    for (let bi = 0; bi < B.length && bi < NB; bi++) {
      const b = B[bi]; const o = (F * NB + bi) * K; const r = b.root.getAbsolutePosition(); const m = b.root.getWorldMatrix().m;
      pos[o] = r.x; pos[o + 1] = r.y; pos[o + 2] = r.z; pos[o + 3] = Math.atan2(m[8], m[10]);
      const put = (n, at) => { if (!n) { pos[o + at] = NaN; pos[o + at + 1] = NaN; pos[o + at + 2] = NaN; return; } const p = n.getAbsolutePosition(); pos[o + at] = p.x; pos[o + at + 1] = p.y; pos[o + at + 2] = p.z; };
      put(b.lf, 4); put(b.rf, 7); put(b.lh, 10); put(b.rh, 13); pos[o + 16] = b.head ? b.head.getAbsolutePosition().y : NaN;
      const ao = (F * NB + bi) * NW;
      for (let j = 0; j < NW; j++) {
        const t = b.w[j]; if (!t) { ang[ao + j] = NaN; continue; }
        const q = lqOf(t); if (!q) { ang[ao + j] = NaN; continue; }
        const pq = b.prevQ[j]; ang[ao + j] = pq ? qAng(pq, q) * 60 : 0;
        b.prevQ[j] = { x: q.x, y: q.y, z: q.z, w: q.w };
      }
    }
    const bl = ball(); const [hb, hbone] = holderOfBall();
    if (bl) { const p = bl.getAbsolutePosition(); ballA[F * 5] = p.x; ballA[F * 5 + 1] = p.y; ballA[F * 5 + 2] = p.z; } else { ballA[F * 5] = NaN; }
    ballA[F * 5 + 3] = hb; ballA[F * 5 + 4] = hbone;
    if (cam) {
      const cp = cam.globalPosition || cam.position; const fw = cam.getDirection(new V3(0, 0, 1));
      camA[F * 7] = cp.x; camA[F * 7 + 1] = cp.y; camA[F * 7 + 2] = cp.z; camA[F * 7 + 3] = fw.x; camA[F * 7 + 4] = fw.y; camA[F * 7 + 5] = fw.z; camA[F * 7 + 6] = cam.fov || 0;
      if (B[0]) { const hp = (B[0].hips || B[0].root).getAbsolutePosition(); const tm = scene.getTransformMatrix(); const v = V3.TransformCoordinates(hp, tm); const rel = hp.subtract(cp); scr[F * 3] = v.x; scr[F * 3 + 1] = v.y; scr[F * 3 + 2] = (rel.x * fw.x + rel.y * fw.y + rel.z * fw.z) > 0 ? 1 : 0; }
    }
    poss[F] = possCode();
    F++;
  };
  scene.onAfterRenderObservable.add(() => { HG.frame++; window.__frameNo = HG.frame; try { record(); } catch (e) { if (HG.errors.length < 20) HG.errors.push('rec ' + String(e && e.message || e).slice(0, 160)); } });
  HG.start = () => { HG.rec = true; HG.f0 = HG.frame; F = 0; for (const b of B) b.prevQ = WATCH.map(() => null); };
  HG.stop = () => { HG.rec = false; return F; };

  // ── input helpers (every emit logged with its frame) ─────────────────────────────────────────────────────────────
  const emit = (e) => { bus.emit(e); if (HG.inputs.length < 30000) HG.inputs.push([HG.frame, e.t, e.btn || e.side || '', e.pressed === undefined ? (e.x !== undefined ? +(+e.x).toFixed(2) + ',' + (+e.y).toFixed(2) : e.value) : e.pressed ? 1 : 0]); };
  HG.emit = emit;
  const basis = () => { const cam = scene.activeCamera; const f = cam.getDirection(new V3(0, 0, 1)); f.y = 0; f.normalize(); const r = cam.getDirection(new V3(1, 0, 0)); r.y = 0; r.normalize(); return { f, r }; };
  let lastStick = '';
  const stick = (x, y) => { const k = x.toFixed(2) + y.toFixed(2); if (k === lastStick) return; lastStick = k; emit({ t: 'stick', side: 'L', x, y }); };
  const steer = (wx, wz, mag) => { const L = Math.hypot(wx, wz); if (L < 1e-4 || !(mag > 0)) { stick(0, 0); return; } wx /= L; wz /= L; const b = basis(); stick(Math.max(-1, Math.min(1, (wx * b.r.x + wz * b.r.z) * mag)), Math.max(-1, Math.min(1, -(wx * b.f.x + wz * b.f.z) * mag))); };
  HG.steer = steer; HG.stick = stick;
  const timers = [];
  const later = (sec, fn) => timers.push({ at: now() + sec * 1000, fn });
  const down = new Set();
  const press = (btn) => { if (down.has(btn)) return; down.add(btn); emit({ t: 'button', btn, pressed: true }); };
  const release = (btn) => { if (!down.has(btn)) return; down.delete(btn); emit({ t: 'button', btn, pressed: false }); };
  const tap = (btn, sec = 0.05) => { press(btn); later(sec, () => release(btn)); };
  const turbo = (on) => emit({ t: 'trigger', side: 'R', value: on ? 1 : 0 });
  const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1], upleft: [-0.71, -0.71], upright: [0.71, -0.71], downleft: [-0.71, 0.71], downright: [0.71, 0.71] };
  const flick = (dir) => { const d = DIRS[dir]; emit({ t: 'stick', side: 'R', x: d[0], y: d[1] }); later(0.05, () => emit({ t: 'stick', side: 'R', x: d[0], y: d[1] })); later(0.1, () => emit({ t: 'stick', side: 'R', x: 0, y: 0 })); };
  HG.press = press; HG.release = release; HG.tap = tap; HG.flick = flick; HG.turbo = turbo; HG.later = later;
  scene.onBeforeRenderObservable.add(() => { const t = now(); for (let i = 0; i < timers.length;) { if (timers[i].at <= t) { const x = timers.splice(i, 1)[0]; try { x.fn(); } catch (e) { HG.errors.push('timer ' + String(e && e.message || e).slice(0, 120)); } } else i++; } });

  // hoops-p02: THE DEFENCE SNAPSHOT — on every release / block / swat / reach / goaltend log line, the geometry of that frame (every
  // body's root, both hands and hips; the ball; who holds it), so a block or a contest can be read as bodies and a ball, not a number
  HG.snaps = [];
  { const SNAP = /release|block|swat|reject|rim protector|reach|goaltend|strip|contest|hand up|BLOCK-GEO|STOP/i;
    const r3 = (v) => (v ? [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)] : null);
    const o = console.info.bind(console);
    console.info = (...a) => { o(...a); try { const m = String(a[0] ?? ''); if (HG.autoStrip && (HG.autoN || 0) < 8 && /blocked at the release|\] swat at k|rim protector swat|ai swat read at the bump: HIT|my block read .*HIT|ai reach resolve strip/.test(m)) { const n = HG.autoN = (HG.autoN || 0) + 1; HG.strip(`auto-${n}-${/my block|\] swat at/.test(m) ? 'myblock' : /reach/.test(m) ? 'aistrip' : 'aiblock'}`, 12, 3); }
      if (/^\[(1V1|3V3)-(DEF|REF|BLOCK|CONTEST)\]/.test(m) && SNAP.test(m) && HG.snaps.length < 3000) { const bl = ball(); HG.snaps.push({ f: HG.frame, m: m.slice(0, 200), ball: bl ? r3(bl.getAbsolutePosition()) : null, holder: holderOfBall()[0], bodies: B.map((b) => ({ id: b.id, root: r3(b.root.getAbsolutePosition()), rh: r3(b.rh && b.rh.getAbsolutePosition()), lh: r3(b.lh && b.lh.getAbsolutePosition()), hipsY: b.hips ? +b.hips.getAbsolutePosition().y.toFixed(3) : null })) }); } } catch (e) { /* the probe never breaks the game */ } };
  }

  // ── world reads ──────────────────────────────────────────────────────────────────────────────────────────────────
  const meP = () => B[0].root.getAbsolutePosition();
  const ballP = () => { const b = ball(); return b ? b.getAbsolutePosition() : null; };
  const iHaveBall = () => { const s = S(); if (!s) return false; try { if (MODE === 'onevone') return s.possession() === 'mine' && s.carry().mine; return s.carrier() === 'me' && s.carry().active; } catch (e) { return false; } };
  const driverPos = () => { const s = S(); if (!s) return null; try { if (MODE === 'onevone') return s.possession() === 'defense' ? s.foeRoot.getAbsolutePosition() : null; const r = s.driverRoot(); return r ? r.getAbsolutePosition() : null; } catch (e) { return null; } };
  const atkPhase = () => { try { return S().attackPhase(); } catch (e) { return ''; } };
  const meterNow = () => { const h = window.__hudNow || {}; const t = +h.shotMeterT || 0; const g = String(h.shotMeterGreen || '').split(',').map(Number); return { t, c: g[0] || 0.62, w: g[1] || 0.09 }; };
  HG.meterNow = meterNow; HG.iHaveBall = iHaveBall;

  // ── 2. the bot ───────────────────────────────────────────────────────────────────────────────────────────────────
  let rs = 0x9e3779b9 ^ (CFG.botSeed || 11);
  const rnd = () => { rs += 0x6D2B79F5; let r = Math.imul(rs ^ (rs >>> 15), 1 | rs); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const bot = HG.bot = { on: false, mode: '', plan: null, shooting: false, shootT0: 0, moves: 0, shots: 0, passes: 0, pokes: 0, blocks: 0, tally: {} };
  const MOVES = ['left', 'right', 'down', 'downleft', 'downright', 'upleft', 'upright', 'left', 'right'];
  const newOffPlan = () => ({ t0: now(), shootAt: now() + (2 + rnd() * 4) * 1000, nextMove: now() + (0.6 + rnd() * 1.2) * 1000, passAt: MODE === 'threevthree' && rnd() < 0.4 ? now() + (0.8 + rnd() * 2) * 1000 : Infinity, turbo: rnd() < 0.35, swaySide: rnd() < 0.5 ? -1 : 1, off: gauss() * 0.75 });
  const newDefPlan = () => ({ t0: now(), nextPoke: now() + (0.5 + rnd() * 0.9) * 1000, blocked: false, gatherSeen: 0 });
  scene.onBeforeRenderObservable.add(() => {
    if (!bot.on) return;
    try {
      const s = S(); if (!s || (s.ended && s.ended())) { stick(0, 0); return; }
      const t = now();
      const me = meP();
      const pc = possCode();
      if (bot.shooting) {
        const m = meterNow();
        const target = m.c + bot.plan.off * m.w;
        if ((m.t > 0 && m.t >= target) || t - bot.shootT0 > 1800) { release('X'); bot.shooting = false; bot.shots++; }
        stick(0, 0); return;
      }
      if (iHaveBall()) {
        if (bot.mode !== 'off') { bot.mode = 'off'; bot.plan = newOffPlan(); if (bot.plan.turbo) turbo(true); }
        const P = bot.plan;
        const tx = RIM.x - me.x, tz = RIM.z - me.z; const dist = Math.hypot(tx, tz) || 1;
        if (t >= P.passAt) { tap('A'); bot.passes++; P.passAt = Infinity; turbo(false); return; }
        if (t >= P.shootAt || dist < 1.7) { turbo(false); press('X'); bot.shooting = true; bot.shootT0 = t; stick(0, 0); return; }
        if (t >= P.nextMove) { const d = MOVES[Math.floor(rnd() * MOVES.length)]; flick(d); bot.moves++; bot.tally[d] = (bot.tally[d] || 0) + 1; P.nextMove = t + (0.9 + rnd() * 1.4) * 1000; }
        const side = Math.floor((t - P.t0) / 800) % 2 ? P.swaySide : -P.swaySide;
        const fx = tx / dist, fz = tz / dist; const fwd = dist > 2.2 ? 1 : 0.3;
        steer(fx * fwd + -fz * side * 0.55, fz * fwd + fx * side * 0.55, 0.95);
        return;
      }
      if (bot.mode === 'off') turbo(false);
      if (pc === 2) {
        if (bot.mode !== 'def') { bot.mode = 'def'; bot.plan = newDefPlan(); }
        const P = bot.plan; const dp = driverPos();
        if (!dp) { const bp = ballP(); if (bp) steer(bp.x - me.x, bp.z - me.z, 0.9); return; }
        const rx = RIM.x - dp.x, rz = RIM.z - dp.z, rl = Math.hypot(rx, rz) || 1;
        const gx = dp.x + rx / rl * 1.0, gz = dp.z + rz / rl * 1.0; const ex = gx - me.x, ez = gz - me.z, el = Math.hypot(ex, ez);
        steer(ex, ez, el < 0.15 ? 0 : Math.min(1, 0.3 + el));
        const dd = Math.hypot(dp.x - me.x, dp.z - me.z);
        if (dd < 1.6 && t >= P.nextPoke) { if (rnd() < 0.5) { tap('X'); bot.pokes++; } P.nextPoke = t + (0.6 + rnd() * 1.0) * 1000; }
        const ph = atkPhase();
        if (ph === 'gather' && !P.gatherSeen) P.gatherSeen = t;
        if (!P.blocked && P.gatherSeen && t - P.gatherSeen >= 220 && dd < 2.4) { P.blocked = true; tap('Y'); bot.blocks++; }
        return;
      }
      // my team's ball with a mate (3v3), or a dead / loose ball: drift to the wing, chase a loose ball near me
      if (bot.mode !== 'wait') bot.mode = 'wait';
      const bp = ballP(); const [hb] = holderOfBall();
      if (bp && hb < 0 && bp.y < 1.6 && Math.hypot(bp.x - me.x, bp.z - me.z) < 6) { steer(bp.x - me.x, bp.z - me.z, 1); return; }
      const wx = me.x < 0 ? -4.2 : 4.2, wz = 3.2; steer(wx - me.x, wz - me.z, Math.hypot(wx - me.x, wz - me.z) < 0.4 ? 0 : 0.6);
    } catch (e) { if (HG.errors.length < 20) HG.errors.push('bot ' + String(e && e.message || e).slice(0, 160)); }
  });

  // ── 3. the tests (input -> response on the game clock) ──────────────────────────────────────────────────────────
  // Each test is a little timeline; it resolves a result object. `watch(fn, maxSec)` resolves the first frame fn() is truthy.
  const watch = (fn, maxSec) => new Promise((res) => { const f0 = HG.frame; const o = scene.onAfterRenderObservable.add(() => { let v = null; try { v = fn(); } catch (e) { v = null; } if (v) { scene.onAfterRenderObservable.remove(o); res({ frames: HG.frame - f0, v }); } else if (HG.frame - f0 > maxSec * 60) { scene.onAfterRenderObservable.remove(o); res({ frames: null, v: null }); } }); });
  const waitSec = (sec) => watch(() => false, sec).then(() => null);
  const speedSampler = () => { let last = null, lastF = 0, v = 0; return () => { const p = meP(); if (last && HG.frame !== lastF) v = Math.hypot(p.x - last.x, p.z - last.z) * 60 / (HG.frame - lastF); last = { x: p.x, z: p.z }; lastF = HG.frame; return v; }; };
  const logCount = (re) => (window.__LOG || []).filter((l) => re.test(l.m)).length;
  const logSince = (f0, re) => (window.__LOG || []).find((l) => l.f >= f0 && re.test(l.m));
  HG.test = {};
  // T1/T2: the stick — onset (the root has moved 2 cm), 90 % of the pace it settles at, the stop; then a reversal at pace
  HG.test.stick = async (arg) => {
    // hoops-p01: arg is the turbo flag, or { turbo, strip } — `strip` names a frame strip taken from the stop's first frame
    const turboOn = arg && typeof arg === 'object' ? !!arg.turbo : !!arg; const stripName = arg && typeof arg === 'object' ? arg.strip : null;
    const sp = speedSampler(); const o = { turbo: !!turboOn };
    const p0 = meP().clone ? meP().clone() : { x: meP().x, z: meP().z };
    if (turboOn) turbo(true);
    const tx = RIM.x - p0.x, tz = RIM.z - p0.z;
    const f0 = HG.frame; steer(-tz, tx, 1);   // across the court (sideways to the rim) so the run is not cut by the rim
    const on = await watch(() => { const p = meP(); return Math.hypot(p.x - p0.x, p.z - p0.z) > 0.02; }, 2); o.onsetF = on.frames;
    const vs = []; await watch(() => { vs.push(sp()); return false; }, 1.2); o.peak = Math.max(...vs); o.settle = vs.slice(-10).reduce((a, b) => a + b, 0) / 10;
    let k = vs.findIndex((v) => v >= 0.9 * o.settle); o.to90F = k >= 0 ? k + (o.onsetF || 0) : null; o.vs = vs.filter((_, i) => i % 3 === 0).map((v) => +v.toFixed(2));
    // reversal at pace
    const r0 = HG.frame; steer(tz, -tx, 1);
    const dir = { x: tz, z: -tx }; const dl = Math.hypot(dir.x, dir.z) || 1; let prev = meP().clone();
    const rv = await watch(() => { const p = meP(); const dx = p.x - prev.x, dz = p.z - prev.z; prev = p.clone(); return (dx * dir.x + dz * dir.z) / dl * 60 > 0.5 * o.settle; }, 2); o.reverseF = rv.frames;
    await waitSec(0.6);
    // the stop
    const s0 = HG.frame; const ps = meP().clone(); o.stopFromMps = +o.settle.toFixed(2); stick(0, 0); if (turboOn) turbo(false);
    if (stripName) HG.strip(stripName, 14, 2);
    let prev2 = meP().clone();
    const st = await watch(() => { const p = meP(); const v = Math.hypot(p.x - prev2.x, p.z - prev2.z) * 60; prev2 = p.clone(); return v < 0.15; }, 2); o.stopF = st.frames; const pe = meP(); o.stopM = +Math.hypot(pe.x - ps.x, pe.z - ps.z).toFixed(2);
    o.frames = { f0, r0, s0 };
    return o;
  };
  // T2b (hoops-p01): THE STOP FROM PACE — run straight across the court for `sec` (a jog, or the turbo), let go of everything; the frames
  // until the root is under 0.15 m/s and the metres it slid. (T1's own stop comes after its reversal, a backpedal capped at 0.7 of a jog.)
  HG.test.stopLine = async (arg) => {
    const turboOn = !!(arg && arg.turbo); const o = { turbo: turboOn }; const sp = speedSampler();
    const p0 = meP().clone(); const tx = RIM.x - p0.x, tz = RIM.z - p0.z;
    const sgn = (-tz) * (p0.x >= 0 ? -1 : 1) >= 0 ? 1 : -1;   // across the court, away from the nearer sideline (over it is a turnover)
    if (turboOn) turbo(true); steer(-tz * sgn, tx * sgn, 1);
    const vs = []; await watch(() => { vs.push(sp()); return false; }, (arg && arg.sec) || 1.0); o.fromMps = +(vs.slice(-6).reduce((a, b) => a + b, 0) / 6).toFixed(2);
    const s0 = HG.frame; const ps = meP().clone(); stick(0, 0); if (turboOn) turbo(false);
    if (arg && arg.strip) HG.strip(arg.strip, 14, 2);
    let prev = meP().clone(); const tr = [];
    const st = await watch(() => { const p = meP(); const v = Math.hypot(p.x - prev.x, p.z - prev.z) * 60; prev = p.clone(); tr.push(+v.toFixed(2)); return v < 0.15; }, 2);
    o.stopF = st.frames; const pe = meP(); o.stopM = +Math.hypot(pe.x - ps.x, pe.z - ps.z).toFixed(2); o.trace = tr.slice(0, 40); o.frames = { s0 };
    return o;
  };
  // T3: the shot press — the meter shows, the ball moves up, the body answers (1v1 anim tree state); then let go at the green
  HG.test.shot = async () => {
    const o = {}; const b0 = ballP(); const y0 = b0 ? b0.y : 0; const st0 = MODE === 'onevone' ? S().animState().me : '';
    const f0 = HG.frame; press('X');
    const m = await watch(() => meterNow().t > 0, 1.5); o.meterF = m.frames;
    const bu = await watch(() => { const b = ballP(); return b && b.y > y0 + 0.05; }, 1.5); o.ballUpF = bu.frames;
    if (MODE === 'onevone') { const an = await watch(() => S().animState().me !== st0, 1.5); o.animF = an.frames; }
    const rel = await watch(() => { const mm = meterNow(); return mm.t >= mm.c; }, 2); release('X'); o.releaseF = HG.frame - f0;
    const ban = await watch(() => { const h = (window.__hud || []).filter((x) => x.f >= f0 && x.banner); return h.length ? h[h.length - 1].banner : null; }, 3); o.banner = ban.v; o.f0 = f0;
    return o;
  };
  // T3b (hoops-p01): THE INPUT BUFFER — Square tapped while a move is still going. kind 'spin': the right-stick rotation (the spin locks
  // the shot gate), the tap 0.1 s into the spin; clearF = the spin's last frame, fireF = the first frame the shot is on (meter / shooting /
  // gather / finish). kind 'cross': the up-away flick (the crossover with the ball in the right hand), the tap 4 frames later.
  const sweep = () => { const n = 7; for (let i = 0; i <= n; i++) { const a = Math.PI * (1 - i / n); const x = +(0.9 * Math.cos(a)).toFixed(2), y = +(-0.9 * Math.sin(a)).toFixed(2); if (i === 0) emit({ t: 'stick', side: 'R', x, y }); else later(i / 60, () => emit({ t: 'stick', side: 'R', x, y })); } later((n + 1) / 60, () => emit({ t: 'stick', side: 'R', x: 0, y: 0 })); };
  HG.sweep = sweep;
  HG.test.buffer = async (kind) => {
    const o = { kind }; const post = () => S().post(); const f0 = HG.frame;
    if (kind === 'spin') sweep(); else flick('upleft');
    const busy = await watch(() => (kind === 'spin' ? post().spinning : logSince(f0, /\[(1V1|3V3)-(HANDLE|STICK)\]/)), 0.8); o.busyF = busy.frames;
    await waitSec(kind === 'spin' ? 0.1 : 4 / 60);
    const p0 = post(); o.busyAtPress = kind === 'spin' ? !!p0.spinning : null; o.shootingBefore = !!(p0.shooting || p0.finish || p0.gather);
    const fp = HG.frame; tap('X');
    let clearAt = null, fireAt = null;
    await watch(() => { const p = post(); if (clearAt === null && !(kind === 'spin' && p.spinning)) clearAt = HG.frame; if (fireAt === null && (p.shooting || p.finish || p.gather || meterNow().t > 0)) fireAt = HG.frame; return fireAt !== null && clearAt !== null; }, 2.5);
    o.pressToClearF = clearAt === null ? null : clearAt - fp; o.pressToFireF = fireAt === null ? null : fireAt - fp; o.clearToFireF = fireAt === null || clearAt === null ? null : fireAt - clearAt;
    o.log = ((window.__LOG || []).filter((l) => l.f >= f0).map((l) => l.m.slice(0, 70)).slice(0, 6)).join(' | ');
    o.f0 = f0; return o;
  };
  // T4: a right-stick flick — did a move fire (a HANDLE / STICK / MOVE log line), and how long until the ball moved sideways
  HG.test.flick = async (dir) => {
    const o = { dir }; const f0 = HG.frame; const b0 = ballP(); const me0 = meP();
    const side0 = b0 ? (b0.x - me0.x) : 0;
    flick(dir);
    const lg = await watch(() => logSince(f0, /\[(1V1|3V3)-(HANDLE|STICK|MOVE)\]|\[HOOPS-HAND\]/), 0.7); o.logF = lg.frames; o.log = lg.v ? lg.v.m.slice(0, 90) : '';
    let maxShift = 0; await watch(() => { const b = ballP(), p = meP(); if (b) maxShift = Math.max(maxShift, Math.abs((b.x - p.x) - side0)); return false; }, 0.6); o.ballShift = +maxShift.toFixed(2);
    o.f0 = f0; return o;
  };
  // T5: a pass (3v3) — the ball leaves my hand
  HG.test.pass = async () => { const o = {}; const f0 = HG.frame; tap('A'); const l = await watch(() => { const b = ballP(), p = meP(); return b && Math.hypot(b.x - p.x, b.z - p.z) > 1.0; }, 1.5); o.leaveF = l.frames; const c = await watch(() => { const s = S(); return /mate/.test(s.carrier()) ? s.carrier() : null; }, 3); o.catchF = c.frames; o.f0 = f0; return o; };
  // T6: defence — the poke (a log line or the hand moving) and the block jump (hips up 4 cm)
  HG.test.poke = async () => { const o = {}; const f0 = HG.frame; const hy = () => (B[0].rh ? B[0].rh.getAbsolutePosition() : meP()); const h0 = hy().clone(); tap('X'); const l = await watch(() => logSince(f0, /poke|reach|strip|steal|whiff|parry|drive-by/i), 1); o.logF = l.frames; o.log = l.v ? l.v.m.slice(0, 90) : ''; const hm = await watch(() => { const h = hy(); return Math.hypot(h.x - h0.x, h.y - h0.y, h.z - h0.z) > 0.15; }, 1); o.handF = hm.frames; o.f0 = f0; return o; };
  HG.test.block = async () => { const o = {}; const hips = () => (B[0].hips ? B[0].hips.getAbsolutePosition().y : meP().y); const y0 = hips(); const f0 = HG.frame; tap('Y'); const up = await watch(() => hips() > y0 + 0.04, 1); o.upF = up.frames; let top = y0; await watch(() => { top = Math.max(top, hips()); return false; }, 1.2); o.rise = +(top - y0).toFixed(2); o.f0 = f0; return o; };

  // ── strips: N frames from the canvas, every k-th rendered frame, as JPEG data URLs ──────────────────────────────
  HG.strip = (name, n = 12, every = 4) => new Promise((res) => { const out = []; let c = 0; const o = engine.onEndFrameObservable.add(() => { if (c++ % every) return; try { out.push(engine.getRenderingCanvas().toDataURL('image/jpeg', 0.7)); } catch (e) { out.push(''); } if (out.length >= n) { engine.onEndFrameObservable.remove(o); HG.strips[name] = out; res(out.length); } }); });

  // ── analysis ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const pctl = (a, p) => { if (!a.length) return null; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
  const r2 = (x) => (x === null || x === undefined || !isFinite(x) ? null : Math.round(x * 100) / 100);
  HG.analyse = (opts = {}) => {
    const n = F; const out = { f0: HG.f0, frames: n, bodies: B.map((b) => b.id), perBody: {}, ball: {}, camera: {}, possessions: [] };
    // possession segments (a change of the possession code; zeros carried forward)
    const pc = new Int8Array(n); let last = 0; for (let i = 0; i < n; i++) { pc[i] = poss[i] || last; last = pc[i]; }
    const cuts = new Set(); let segStart = 0;
    for (let i = 1; i <= n; i++) { if (i === n || pc[i] !== pc[i - 1]) { out.possessions.push({ side: pc[segStart] === 1 ? 'mine' : pc[segStart] === 2 ? 'theirs' : '?', f0: segStart, f1: i - 1, sec: r2((i - segStart) / 60) }); for (let d = -3; d <= 3; d++) cuts.add(i + d); segStart = i; } }
    // a teleport (> 0.5 m of root in one frame on any body) is a reset too
    for (let i = 1; i < n; i++) for (let bi = 0; bi < B.length; bi++) { const o = (i * NB + bi) * K, p = ((i - 1) * NB + bi) * K; if (Math.hypot(pos[o] - pos[p], pos[o + 2] - pos[p + 2]) > 0.5) for (let d = -3; d <= 3; d++) cuts.add(i + d); }
    const segOf = (f) => { for (let k = 0; k < out.possessions.length; k++) if (f >= out.possessions[k].f0 && f <= out.possessions[k].f1) return k; return -1; };
    out.resetFrames = cuts.size;
    for (let bi = 0; bi < B.length; bi++) {
      const R = { pops: 0, severe: 0, whips: 0, popBones: {}, rootSnaps: 0, rootJumps: 0, slideP90Cm: null, slideCmPerS: null, plantedFrames: 0, skates: 0, accP99: null, speedP95: null };
      // pops per watched bone
      for (let j = 0; j < NW; j++) {
        const w = new Float32Array(n); for (let i = 0; i < n; i++) w[i] = ang[(i * NB + bi) * NW + j] || 0;
        for (let i = 1; i < n; i++) {
          if (cuts.has(i)) continue;
          const nb = []; for (let k = Math.max(1, i - 6); k <= Math.min(n - 1, i + 6); k++) if (k !== i) nb.push(w[k]); nb.sort((a, b) => a - b);
          const med = nb[Math.floor(nb.length / 2)] || 0; const side = Math.max(w[i - 3] || 0, w[i + 3] || 0);
          if (/Arm|Leg|Hand|Foot/.test(WATCH[j]) && w[i] > 1500) R.whips++;
          if (w[i] >= 600 && w[i] >= 3.5 * Math.max(med, 60) && w[i] >= 3 * side) { R.pops++; if (opts.popFrames && (R.popAt || (R.popAt = [])).length < 3000) R.popAt.push(i); if (w[i] >= 3000) R.severe++; R.popBones[WATCH[j]] = (R.popBones[WATCH[j]] || 0) + 1; const sg = segOf(i); if (sg >= 0) { const P = out.possessions[sg]; (P.pops || (P.pops = {}))[B[bi].id] = (P.pops[B[bi].id] || 0) + 1; } }
        }
      }
      // root snaps (> 20 deg of yaw in one frame) and root jumps (0.25-0.5 m in one frame) outside resets
      const vel = []; const acc = [];
      for (let i = 1; i < n; i++) {
        if (cuts.has(i)) continue;
        const o = (i * NB + bi) * K, p = ((i - 1) * NB + bi) * K;
        let dy = Math.abs(pos[o + 3] - pos[p + 3]) * 180 / Math.PI; if (dy > 180) dy = 360 - dy;
        if (dy > 20) { R.rootSnaps++; const sg = segOf(i); if (sg >= 0) { const P = out.possessions[sg]; (P.rootSnaps || (P.rootSnaps = {}))[B[bi].id] = (P.rootSnaps[B[bi].id] || 0) + 1; } }
        const d = Math.hypot(pos[o] - pos[p], pos[o + 2] - pos[p + 2]); if (d > 0.25) R.rootJumps++;
        vel[i] = d * 60;
        if (i > 1 && vel[i - 1] !== undefined && !cuts.has(i - 1)) { const q = ((i - 2) * NB + bi) * K; const ax = (pos[o] - 2 * pos[p] + pos[q]) * 3600, az = (pos[o + 2] - 2 * pos[p + 2] + pos[q + 2]) * 3600; acc.push(Math.hypot(ax, az)); }
      }
      R.accP99 = r2(pctl(acc, 0.99)); R.speedP95 = r2(pctl(vel.filter((v) => v !== undefined), 0.95));
      // planted-foot slide (the footplant probe's test, low against this body's own 5th-percentile foot height)
      const fy = []; for (let i = 0; i < n; i++) { const o = (i * NB + bi) * K; if (isFinite(pos[o + 5])) fy.push(pos[o + 5]); if (isFinite(pos[o + 8])) fy.push(pos[o + 8]); }
      const floorY = fy.length > 20 ? pctl(fy, 0.05) : 0.06; const slides = [];
      let movingPlanted = 0, movingSlide = 0;
      for (let i = 1; i < n; i++) {
        if (cuts.has(i)) continue;
        const o = (i * NB + bi) * K, p = ((i - 1) * NB + bi) * K;
        for (const [fa, ob] of [[4, 7], [7, 4]]) {
          const y = pos[o + fa + 1], yWas = pos[p + fa + 1], yo = pos[o + ob + 1]; if (!isFinite(y) || !isFinite(yWas)) continue;
          if (y < floorY + 0.05 && (!isFinite(yo) || y <= yo) && !(y - yWas > 0.002)) { const s = Math.hypot(pos[o + fa] - pos[p + fa], pos[o + fa + 2] - pos[p + fa + 2]); slides.push(s); if (vel[i] > 0.5) { movingPlanted++; movingSlide += s; } }
        }
      }
      R.plantedFrames = slides.length; R.slideP90Cm = r2(pctl(slides, 0.9) * 100); R.skates = slides.filter((s) => s > 0.05).length;
      R.slideCmPerS = slides.length ? r2(slides.reduce((a, b) => a + b, 0) / slides.length * 60 * 100) : null;
      R.slideCmPerSMoving = movingPlanted ? r2(movingSlide / movingPlanted * 60 * 100) : null;
      out.perBody[B[bi].id] = R;
    }
    // the ball: in the hand (held, parented to a body's bone) — centre to the nearer hand bone; dribble apex — the carrier's
    // nearer hand at each top of the bounce while nobody holds it; the path — the most it moves in one frame while held
    const held = [], apex = [], path = []; let warps = 0;
    for (let i = 2; i < n - 1; i++) {
      if (cuts.has(i)) continue;
      const bx = ballA[i * 5], by = ballA[i * 5 + 1], bz = ballA[i * 5 + 2], hb = ballA[i * 5 + 3]; if (!isFinite(bx)) continue;
      const near = (bi) => { const o = (i * NB + bi) * K; return Math.min(Math.hypot(bx - pos[o + 10], by - pos[o + 11], bz - pos[o + 12]), Math.hypot(bx - pos[o + 13], by - pos[o + 14], bz - pos[o + 15])); };
      if (hb >= 0) { held.push(near(hb)); const pb = (i - 1) * 5; if (ballA[pb + 3] === hb) { const d = Math.hypot(bx - ballA[pb], by - ballA[pb + 1], bz - ballA[pb + 2]); path.push(d); if (d > 0.15) warps++; } }
      else {
        const yP = ballA[(i - 1) * 5 + 1], yN = ballA[(i + 1) * 5 + 1];
        if (by > yP && by >= yN && by > 0.5 && by < 1.4) { let bestD = Infinity; for (let bi = 0; bi < B.length; bi++) bestD = Math.min(bestD, near(bi)); if (bestD < 0.8) apex.push(bestD); }
      }
    }
    out.ball = { heldFrames: held.length, heldMedCm: r2(pctl(held, 0.5) * 100), heldP90Cm: r2(pctl(held, 0.9) * 100), apexN: apex.length, apexMedCm: r2(pctl(apex, 0.5) * 100), apexP90Cm: r2(pctl(apex, 0.9) * 100), pathP99Cm: r2(pctl(path, 0.99) * 100), warpsOver15cm: warps };
    // the camera: speed, turn rate, snaps, hero framing
    const cs = [], cw = [], cj = []; let snaps = 0, inFrame = 0, nF = 0, fovs = new Set();
    for (let i = 1; i < n; i++) {
      const o = i * 7, p = (i - 1) * 7; const d = Math.hypot(camA[o] - camA[p], camA[o + 1] - camA[p + 1], camA[o + 2] - camA[p + 2]);
      const dot = camA[o + 3] * camA[p + 3] + camA[o + 4] * camA[p + 4] + camA[o + 5] * camA[p + 5]; const a = Math.acos(Math.min(1, Math.max(-1, dot))) * 180 / Math.PI;
      fovs.add(Math.round(camA[o + 6] * 100));
      if (cuts.has(i)) continue;
      cs.push(d * 60); cw.push(a * 60); if (d > 0.5 || a > 10) snaps++;
      if (i > 1 && !cuts.has(i - 1)) { const q = (i - 2) * 7; cj.push(Math.hypot(camA[o] - 2 * camA[p] + camA[q], camA[o + 1] - 2 * camA[p + 1] + camA[q + 1], camA[o + 2] - 2 * camA[p + 2] + camA[q + 2]) * 3600); }
      nF++; if (scr[i * 3 + 2] && Math.abs(scr[i * 3]) < 0.9 && Math.abs(scr[i * 3 + 1]) < 0.9) inFrame++;
    }
    // overlap: frames where two bodies' roots are closer than 0.6 m (two torsos of ~0.38 m radius interpenetrate), outside resets
    let overlapF = 0, minPair = Infinity; const pairD = [];
    for (let i = 0; i < n; i++) { if (cuts.has(i)) continue; let hit = false; for (let a = 0; a < B.length; a++) for (let c = a + 1; c < B.length; c++) { const oa = (i * NB + a) * K, oc = (i * NB + c) * K; const d = Math.hypot(pos[oa] - pos[oc], pos[oa + 2] - pos[oc + 2]); if (d < minPair) minPair = d; if (d < 1.2) pairD.push(d); if (d < 0.6) hit = true; } if (hit) overlapF++; }
    out.overlap = { framesUnder06m: overlapF, pct: n ? r2(overlapF / n * 100) : null, minPairM: r2(minPair), closeP10M: r2(pctl(pairD, 0.1)) };
    out.camera = { speedP95: r2(pctl(cs, 0.95)), turnP95DegS: r2(pctl(cw, 0.95)), turnP99DegS: r2(pctl(cw, 0.99)), accelP95: r2(pctl(cj, 0.95)), accelP99: r2(pctl(cj, 0.99)), snaps, heroInFramePct: nF ? r2(inFrame / nF * 100) : null, fovs: [...fovs].slice(0, 8) };
    out.errors = HG.errors.slice(0, 10);
    if (opts.raw) out.raw = { possCode: Array.from(pc.filter((_, i) => i % 6 === 0)) };
    return out;
  };
  return 'ok ' + HG.bodies.join(',');
})();
