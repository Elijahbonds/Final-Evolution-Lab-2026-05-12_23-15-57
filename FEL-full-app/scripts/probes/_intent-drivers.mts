// INTENT DRIVERS (2026-09-15) — the "playing well" side of the mechanics probe's MASHER vs INTENT vs IDLE check.
//
// The generic DELIBERATE driver presses one verb a second, which is a fair test of cause → effect but not of skill: in a
// timing game (derby, golf) or a trick game (skate, snowboard, free run) it scores near nothing, so any masher "beats"
// it and Logic reads −4 for the wrong reason. These drivers play the way a player who understands the mode does —
// swing on the ball, click the meter at the top and in the band, answer what you know, run a line — so a masher that
// still wins has found a real hole in the game's grammar.
//
// Each entry is page JS, installed after the game starts. It reads only what the agent bridge exposes
// (window.__FEL_QA__: rawHud(), scene(), hero()) and drives only the fake pad (window.__PAD), then runs on a 16 ms tick
// until the page closes. Scene metadata written for QA: BrainBrawl's `qaAnswer`.

const PAD_HELPERS = `
  const P = window.__PAD, Q = window.__FEL_QA__;
  const touch = () => { P.timestamp = Date.now(); };
  const btn = (i, ms = 70) => { P.buttons[i].pressed = true; P.buttons[i].value = 1; touch(); setTimeout(() => { P.buttons[i].pressed = false; P.buttons[i].value = 0; touch(); }, ms); };
  const hold = (i, on) => { P.buttons[i].pressed = on; P.buttons[i].value = on ? 1 : 0; touch(); };
  const stick = (x, y) => { P.axes[0] = x; P.axes[1] = y; touch(); };
  const clamp = (v, a = 1) => Math.max(-a, Math.min(a, v));
  const A = 0, B = 1, X = 2, Y = 3, RT = 7;
`;

const loop = (body: string) => `(() => { ${PAD_HELPERS} ${body} })()`;

export const INTENT_DRIVERS: Record<string, string> = {
  // DERBY: the PCI onto the ball's crossing point, the swing as the ball reaches the contact plane (z 0.3)
  derby: loop(`
    let prev = null, sx = 1, sy = 1, lastPci = null, lastCmd = [0, 0], swung = 0;
    setInterval(() => {
      const s = Q.scene && Q.scene(); if (!s) return;
      const ball = s.getMeshByName('bball'); const h = Q.rawHud();
      const pci = typeof h.pci === 'string' ? h.pci.split(',').map(Number) : null;
      if (!ball || !pci) return;
      const p = ball.position, now = performance.now();
      if (prev && now - prev.t > 5) {
        const dt = (now - prev.t) / 1000, vz = (p.z - prev.z) / dt, vx = (p.x - prev.x) / dt, vy = (p.y - prev.y) / dt;
        if (Math.abs(vz) > 2) {
          const ttc = (0.3 - p.z) / vz;
          if (ttc > 0 && ttc < 1.5) {
            const tx = p.x + vx * ttc, ty = p.y + vy * ttc - 4.9 * ttc * ttc * 0.3;
            if (lastPci && Math.abs(lastCmd[0]) > 0.2 && Math.sign(pci[0] - lastPci[0]) === -Math.sign(lastCmd[0] * sx) && Math.abs(pci[0] - lastPci[0]) > 0.003) sx = -sx;
            if (lastPci && Math.abs(lastCmd[1]) > 0.2 && Math.sign(pci[1] - lastPci[1]) === -Math.sign(lastCmd[1] * sy) && Math.abs(pci[1] - lastPci[1]) > 0.003) sy = -sy;
            lastCmd = [clamp((tx - pci[0]) * 8), clamp((ty - pci[1]) * 8)];
            stick(lastCmd[0] * sx, lastCmd[1] * sy); lastPci = pci;
            if (ttc < 0.045 && now - swung > 900) { btn(A, 60); swung = now; }
          }
        } else stick(0, 0);
      }
      prev = { t: now, x: p.x, y: p.y, z: p.z };
    }, 16);
  `),

  // GOLF: the three-click swing — start, POWER at the top of the wave, ACCURACY inside the band on the way down
  golf: loop(`
    let last = null, cool = 0, idleT = 0;
    setInterval(() => {
      const h = Q.rawHud(), ph = h.swingPhase, m = typeof h.meterT === 'number' ? h.meterT : null;
      if (cool > 0) { cool -= 16; last = m; return; }
      if (!ph) { idleT += 16; if (idleT > 1400) { btn(A); idleT = 0; cool = 300; } last = null; return; }
      idleT = 0;
      if (ph === 'power' && m !== null && last !== null && (m >= 0.96 || (m < last && last > 0.85))) { btn(A); cool = 150; }
      else if (ph === 'accuracy' && m !== null && last !== null && m < last && Math.abs(m - 0.28) <= 0.04) { btn(A); cool = 400; }
      last = m;
    }, 16);
  `),

  // BRAIN BRAWL: a player who knows the answer — spin, then answer each challenge once it opens
  brainbrawl: loop(`
    let answered = '', t = 0;
    setInterval(() => {
      const h = Q.rawHud(); const s = Q.scene && Q.scene();
      const open = h.optA && h.optA !== '';
      if (open) {
        const key = String(h.prompt) + '|' + h.optA + h.optB;
        const ans = s && s.metadata ? s.metadata.qaAnswer : null;
        if (key !== answered && typeof ans === 'number') { answered = key; setTimeout(() => btn([A, B, X, Y][ans]), 350); }
      } else { t += 16; if (t > 1500) { t = 0; if (!h.prompt) btn(A); } }
    }, 16);
  `),

  // SKATE: a clean line — push, POP, a flip with a fresh direction, a grab with another, land it. No manual: the sketchy
  // save's wobble is not drawn anywhere, so a player cannot read it either (noted 2026-09-15) and neither does this.
  skateboard: loop(`
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-0.7, -0.7], [0.7, -0.7]]; let k = 0, t = 0;
    stick(0, -0.9);
    setInterval(() => {
      t += 16;
      const phase = t % 1900;
      if (phase < 16) btn(A, 90);                                             // POP
      else if (phase >= 190 && phase < 206) { const d = dirs[k++ % dirs.length]; stick(d[0], d[1]); btn(B, 60); setTimeout(() => stick(0, -0.9), 110); }   // FLIP
      else if (phase >= 430 && phase < 446) { const d = dirs[k++ % dirs.length]; stick(d[0], d[1]); btn(X, 60); setTimeout(() => stick(0, -0.9), 110); }   // GRAB
    }, 16);
  `),

  // SNOWBOARD: the LINE is the score — steer through each gate (the mode publishes the next one for QA), tricks between them
  snowboard_slalom: loop(`
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]]; let k = 0, t = 0, sgn = 1, lastX = null, lastCmd = 0, airT = 0;
    setInterval(() => {
      t += 16;
      const h = Q.hero && Q.hero(); const s = Q.scene && Q.scene(); if (!h) return;
      let r = h; while (r.parent) r = r.parent; const q = r.getAbsolutePosition();
      const g = s && s.metadata ? s.metadata.qaNextGate : null;
      const want = g ? clamp((g.x - q.x) * 0.6, 0.9) : 0;
      if (lastX !== null && Math.abs(lastCmd) > 0.25 && Math.abs(q.x - lastX) > 0.01 && Math.sign(q.x - lastX) !== Math.sign(lastCmd * sgn)) sgn = -sgn;
      lastCmd = want; lastX = q.x;
      stick(want * sgn, -0.75);
      // a trick between gates: jump, then spin or grab in the air, and tuck on the straights
      const dz = g ? Math.abs(g.z - q.z) : 99;
      if (dz > 22 && t % 2600 < 16) { airT = t; btn(A, 90); }
      else if (airT && t - airT > 220 && t - airT < 236) { const d = dirs[k++ % dirs.length]; stick(d[0], d[1]); btn(B, 60); setTimeout(() => stick(want * sgn, -0.75), 110); }
      else if (airT && t - airT > 460 && t - airT < 476) { const d = dirs[k++ % dirs.length]; stick(d[0], d[1]); btn(X, 60); setTimeout(() => stick(want * sgn, -0.75), 110); airT = 0; }
      hold(RT, dz > 30);
    }, 16);
  `),

  // FREE RUN: the low line — steer onto the boxes, VAULT at a box, JUMP each gap edge, SLIDE the bar, a FLIP or TWIST
  // in every real air (the course runs along +z; gaps are where one ground slab ends short of the next)
  freerun: loop(`
    let sgn = 1, lastX = null, lastCmd = 0, flip = 0;
    const pieces = () => { const s = Q.scene && Q.scene(); return s ? s.meshes.filter((m) => m.metadata && m.metadata.freerun).map((m) => ({ kind: m.metadata.freerun, x: m.position.x, z: m.position.z, w: m.getBoundingInfo().boundingBox.extendSize.x * 2, d: m.getBoundingInfo().boundingBox.extendSize.z * 2 })) : []; };
    let P0 = null, lastPress = 0;
    setInterval(() => {
      const h = Q.hero && Q.hero(); if (!h) return; let r = h; while (r.parent) r = r.parent; const q = r.getAbsolutePosition();
      if (!P0 || !P0.length) { P0 = pieces(); if (!P0.length) { btn(A); return; } }
      const now = performance.now();
      const vault = P0.filter((v) => v.kind === 'vault' && v.z - q.z > -0.2 && v.z - q.z < 9).sort((a, b) => a.z - b.z)[0];
      const tx = vault ? clamp(vault.x, 2.5) : 0;
      if (lastX !== null && Math.abs(lastCmd) > 0.2 && Math.abs(q.x - lastX) > 0.004 && Math.sign(q.x - lastX) !== Math.sign(lastCmd * sgn)) sgn = -sgn;
      lastCmd = clamp((tx - q.x) * 0.5, 0.6); stick(lastCmd * sgn, -1); lastX = q.x;
      if (now - lastPress < 350) return;
      // a line is TRICKS ALONG THE ROUTE: between obstacles, jump and throw one (the run's own clock pays the route home)
      if (q.y < 0.2 && now - lastPress > 1200 && !P0.some((pc) => pc.kind === 'vault' && pc.z - q.z > 0 && pc.z - q.z < 4)) {
        btn(A); lastPress = now; setTimeout(() => btn((flip++ % 2) ? Y : X, 60), 200); return;
      }
      for (const pc of P0) {
        const dz = pc.z - pc.d / 2 - q.z, inX = Math.abs(q.x - pc.x) < pc.w / 2 - 0.2;
        const gapEdge = pc.kind === 'ground' && !P0.some((g) => g.kind === 'ground' && Math.abs(g.z - g.d / 2 - (pc.z + pc.d / 2)) < 0.05) && (pc.z + pc.d / 2 - q.z) > 0 && (pc.z + pc.d / 2 - q.z) < 0.9;
        if ((pc.kind === 'vault' && inX && dz > 0 && dz < 1.3) || (gapEdge && q.y > -0.3)) {
          btn(A); lastPress = now;
          setTimeout(() => btn((flip++ % 2) ? Y : X, 60), 180);   // a trick in the air
          return;
        }
        if (pc.kind === 'bar' && dz > 0.2 && dz < 1.3 && q.y < 0.2) { btn(B); lastPress = now; return; }
      }
    }, 16);
  `),
};
