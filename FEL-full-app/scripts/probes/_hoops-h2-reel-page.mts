// HOOPS-GAMEPLAY H2 (2026-10-16): the in-page half of the H2 BEFORE / AFTER move reel (scripts/probes/_hoops-h2-reel.mts).
//
// Built on the H1 reel's page script (HOOPS-GAMEPLAY h1, 2026-10-14, scripts/probes/_hoops-reel-page.mts in the H1 lane — not on
// lane/finish-release yet, so the parts this reel needs are carried here under their own names): a seeded Math.random, a fake
// DualShock in getGamepads() slot 0 (the human input path: InputBus → LocalInputSource → the slot — no ?agent=1, which replaces
// the local input), a console tap that keeps the mode's [1V1-…] / [3V3-…] lines on the page's clock, and a recorder (a 960×600
// caption canvas copying the Babylon canvas every frame, captureStream(30) + MediaRecorder, vp9 → vp8; no ffmpeg).
//
// Plain JS strings so playwright ships them verbatim (tsx's esbuild would wrap a passed function in __name() helpers the page lacks).
// Nothing here writes game state: it presses the pad a player would press and reads the modes' own dev seams
// (scene.metadata.onevone / .threevthree). Pad: 0 Cross 1 Circle 2 Square 3 Triangle 4 L1 5 R1 6 L2 7 R2; axes 0/1 the left stick,
// 2/3 the right stick (up = −1).

export const initScript = (seed: number): string => String.raw`(() => {
  window.__name = window.__name || ((f) => f);   // tsx's esbuild wraps the node side's nested functions in __name() (the dunk probe's PAD_INIT)
  let s = (SEED >>> 0) || 1;
  const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Math.random = rnd;
  window.__reseed = (n) => { s = (n >>> 0) || 1; };
  const pad = { index: 0, id: 'fake-dualshock (standard)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
  window.__LOG = [];
  const oi = console.info.bind(console);
  console.info = (...a) => {
    try {
      const m = a.map((x) => (typeof x === 'string' ? x : String(x))).join(' ');
      if (/\[(1V1|3V3|HOOPS)-/.test(m)) { window.__LOG.push({ t: performance.now(), m: m.slice(0, 300) }); if (window.__LOG.length > 6000) window.__LOG.splice(0, 2000); }
    } catch (e) { /* the tap never breaks the game's own logging */ }
    oi(...a);
  };
})()`.replace('SEED', String(seed));

export const LIB = String.raw`(() => {
  if (window.__R) return 'already';
  const dev = window.__FEL_DEV__; const s = dev.scene; const eng = s.getEngine(); const src = eng.getRenderingCanvas(); const pad = window.__PAD;
  const R = window.__R = { label: '', scen: '', note: '', sub: '', chunks: [], stills: {}, err: '', rows: [], sampling: false, sample: null, tick: null, zoom: 1 };
  const comp = document.createElement('canvas'); comp.width = 960; comp.height = 600; const cx = comp.getContext('2d'); R.comp = comp;
  R.frames = 0;
  eng.onEndFrameObservable.add(() => {
    R.frames++;
    try {
      // THE MOVE VIEW (H2): the play camera's frame, cropped and scaled round the hero (R.zoom×, the crop centre eased) — a move is read
      // at the body's scale, and the game's camera is not touched. The full frame rides in a corner inset. R.zoom 1: the plain frame.
      const W = src.width, H = src.height;
      if (R.zoom > 1) {
        const h = R.focus ? R.focus() : R.hero(); const cam = s.activeCamera;   // H2c: R.focus — a defender scenario crops round HIM
        if (h && cam) {
          const V = h.position.constructor; const p = h.getAbsolutePosition(); const q = V.TransformCoordinates(new V(p.x, p.y + 1.0, p.z), cam.getTransformationMatrix());
          const tx = (q.x + 1) / 2 * W, ty = (1 - q.y) / 2 * H;
          if (R.cx0 === undefined) { R.cx0 = tx; R.cy0 = ty; } else { R.cx0 += (tx - R.cx0) * 0.18; R.cy0 += (ty - R.cy0) * 0.18; }
        }
        const sw = W / R.zoom, sh = H / R.zoom;
        const sx = Math.max(0, Math.min(W - sw, (R.cx0 ?? W / 2) - sw / 2)), sy = Math.max(0, Math.min(H - sh, (R.cy0 ?? H / 2) - sh / 2));
        cx.drawImage(src, sx, sy, sw, sh, 0, 0, 960, 540);
        cx.drawImage(src, 0, 0, W, H, 960 - 248, 8, 240, 135); cx.strokeStyle = '#ffd400'; cx.lineWidth = 1; cx.strokeRect(960 - 248, 8, 240, 135);
      } else cx.drawImage(src, 0, 0, 960, 540);
      cx.fillStyle = '#0b0d12'; cx.fillRect(0, 540, 960, 60);
      cx.textAlign = 'left'; cx.font = 'bold 15px Menlo, monospace'; cx.fillStyle = '#ffd400'; cx.fillText((R.label + '  ' + R.scen).slice(0, 80), 10, 559);
      cx.font = '13px Menlo, monospace'; cx.fillStyle = '#ececec'; cx.fillText(String(R.note).slice(0, 124), 10, 577);
      cx.fillStyle = '#9fb3c8'; cx.fillText(String(R.sub).slice(0, 124), 10, 594);
    } catch (e) { R.err = String(e).slice(0, 200); }
  });
  R.recStart = () => {
    R.recDiscard(); R.chunks = [];
    const st = comp.captureStream(30);
    const mt = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
    R.mime = mt; const rec = new MediaRecorder(st, { mimeType: mt, videoBitsPerSecond: 2500000 });
    rec.ondataavailable = (e) => { if (e.data && e.data.size) R.chunks.push(e.data); };
    rec.start(250); R.rec = rec; R.recT0 = performance.now(); return mt;
  };
  R.recStop = () => new Promise((res) => {
    const rec = R.rec; if (!rec || rec.state === 'inactive') return res(0);
    rec.onstop = () => { const blob = new Blob(R.chunks, { type: R.mime }); R.recDur = (performance.now() - R.recT0) / 1000; const fr = new FileReader(); fr.onload = () => { R.b64 = String(fr.result).split(',')[1] || ''; res(blob.size); }; fr.readAsDataURL(blob); };
    rec.stop(); R.rec = null;
  });
  R.recDiscard = () => { const rec = R.rec; R.rec = null; R.chunks = []; if (rec && rec.state !== 'inactive') { rec.ondataavailable = null; rec.onstop = null; try { rec.stop(); } catch (e) {} } };
  R.still = (name) => { R.stills[name] = comp.toDataURL('image/png'); return name; };
  R.top = (n) => { let c = n; while (c && c.parent) c = c.parent; return c; };
  R.hero = () => { const h = dev.hero(); return h ? R.top(h) : null; };
  R.pos = (n) => { const p = n.getAbsolutePosition(); return { x: p.x, y: p.y, z: p.z }; };
  R.basis = () => { const cam = s.activeCamera; const V = cam.position.constructor; const f = cam.getDirection(new V(0, 0, 1)); f.y = 0; f.normalize(); const r = cam.getDirection(new V(1, 0, 0)); r.y = 0; r.normalize(); return { f, r }; };
  // the LEFT stick toward a world direction (camera-relative, as the modes' camRel reads it)
  R.steer = (wx, wz, mag) => {
    const L = Math.hypot(wx, wz); if (L < 1e-4 || !(mag > 0)) { pad.axes[0] = 0; pad.axes[1] = 0; return; }
    wx /= L; wz /= L; const b = R.basis(); const mx = (wx * b.r.x + wz * b.r.z) * mag, my = (wx * b.f.x + wz * b.f.z) * mag;
    pad.axes[0] = Math.max(-1, Math.min(1, mx)); pad.axes[1] = Math.max(-1, Math.min(1, -my));
  };
  R.btn = (i, on, v) => { const b = pad.buttons[i]; b.pressed = !!on; b.value = on ? (v === undefined ? 1 : v) : 0; };
  R.tap = (i, ms) => { R.btn(i, true); setTimeout(() => R.btn(i, false), ms || 70); };
  R.flick = (x, y, ms) => { pad.axes[2] = x; pad.axes[3] = y; setTimeout(() => { pad.axes[2] = 0; pad.axes[3] = 0; }, ms || 90); };
  R.rs = (x, y) => { pad.axes[2] = x; pad.axes[3] = y; };
  // H2b: the right stick rolled round the ring (sign +1 clockwise on screen, from the ball hand's side), deg in ms — the spin's rotation
  R.roll = (sign, ms, deg, a0) => { const t0 = performance.now(); const span = ((deg || 220) * Math.PI) / 180; const start = a0 === undefined ? Math.PI : a0;
    const id = setInterval(() => { const k = Math.min(1, (performance.now() - t0) / (ms || 240)); const a = start + sign * span * k; pad.axes[2] = Math.cos(a); pad.axes[3] = Math.sin(a); if (k >= 1) { clearInterval(id); setTimeout(() => { pad.axes[2] = 0; pad.axes[3] = 0; }, 30); } }, 8); };
  // H2b: the left stick out and home again inside ms (the jab's TAP), timed in-page
  R.lsTap = (ms) => { setTimeout(() => { pad.axes[0] = 0; pad.axes[1] = 0; }, ms || 120); };
  R.neutral = () => { pad.axes[0] = 0; pad.axes[1] = 0; pad.axes[2] = 0; pad.axes[3] = 0; for (const b of pad.buttons) { b.pressed = false; b.value = 0; } };
  R.logSince = (t, re) => window.__LOG.filter((l) => l.t >= t && (!re || new RegExp(re).test(l.m)));
  s.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    if (R.tick) { try { R.tick(now); } catch (e) { R.err = 'tick: ' + String(e).slice(0, 200); } }
    if (R.sampling && R.sample) { try { R.rows.push(R.sample(now)); if (R.rows.length > 20000) R.rows.splice(0, 5000); } catch (e) { R.err = 'sample: ' + String(e).slice(0, 200); } }
  });
  return 'installed';
})()`;
