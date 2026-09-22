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

  // SKATE: a real line — ride at speed, POP THE MOMENT YOU LAND, two tricks an air (spaced, the way the board needs), link
  // the landing into a manual, and play the two balance mechanics off what the mode now shows (`saveDir` names the side to
  // lean on a sketchy landing, `balance` is the manual's needle). Before those were published nobody could read them.
  skateboard: loop(`
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-0.7, -0.7], [0.7, -0.7]]; let k = 0, manualT = 0, popAt = -9999, air = false;
    stick(0, -1); hold(5, true);   // R1: the shared boost, held
    setInterval(() => {
      const now = performance.now(), h = Q.rawHud();
      // a sketchy landing: lean the way it says until it is saved
      if (h.saveDir === 'LEFT' || h.saveDir === 'RIGHT') { stick(h.saveDir === 'LEFT' ? -0.9 : 0.9, -0.4); popAt = now; return; }
      // riding a manual: hold the needle at centre — push back the way it is falling
      const n = typeof h.balance === 'number' ? h.balance / 100 : null;
      if (manualT > now && n !== null) { stick(clamp(n * 2.4, 0.9), -0.6); return; }
      const hero = Q.hero && Q.hero();
      let y = 0; if (hero) { let r = hero; while (r.parent) r = r.parent; y = r.getAbsolutePosition().y; }
      const grounded = y < 0.25;
      const since = now - popAt;
      if (grounded && since > 700) { btn(A, 90); popAt = now; air = true; return; }        // POP on the ground, every time
      if (air && since > 220 && since < 260) { const d = dirs[k++ % dirs.length]; stick(d[0], d[1]); btn(B, 60); setTimeout(() => stick(0, -1), 90); return; }   // FLIP
      if (air && since > 430 && since < 470) { const d = dirs[k++ % dirs.length]; stick(d[0], d[1]); btn(X, 60); setTimeout(() => stick(0, -1), 90); return; }   // GRAB (spaced past the cadence)
      if (air && grounded && since > 600) { air = false; stick(0, 1); setTimeout(() => stick(0, -1), 70); manualT = now + 1800; return; }   // land → flick back-forward: MANUAL
      if (manualT <= now) stick(0, -1);
    }, 16);
  `),

  // SNOWBOARD: the LINE is the score — steer through each gate (the mode publishes the next one for QA), tricks between them
  snowboard_slalom: loop(`
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]]; let k = 0, t = 0, lastX = null, lastZ = null, lastCmd = 0, airT = 0;
    setInterval(() => {
      t += 16;
      const h = Q.hero && Q.hero(); const s = Q.scene && Q.scene(); if (!h) return;
      let r = h; while (r.parent) r = r.parent; const q = r.getAbsolutePosition();
      const g = s && s.metadata ? s.metadata.qaNextGate : null;
      // boards phase 8: steer the HEADING — the movement model integrates yaw from the stick (1.9 rad/s), so a lateral
      // error steer over-rotates past the gate and swings to the edge (measured: 1 gate in 60 s, two edge turns). Aim the
      // nose at the gate, clamped to a committed carve, and steer the yaw error. yaw 0 = down the slope, +steer = +x.
      const dz = g ? Math.max(1, g.z - q.z) : 20;
      const wantYaw = g ? clamp(Math.atan2(g.x - q.x, dz), 0.55) : 0;
      let dyaw = wantYaw - r.rotation.y; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      const want = clamp(dyaw * 2.5, 1);
      lastCmd = want; lastX = q.x; lastZ = q.z;
      stick(want, -0.75);
      // a trick between gates: jump, then spin or grab in the air, and tuck on the straights
      if (dz > 22 && t % 2600 < 16) { airT = t; btn(A, 90); }
      else if (airT && t - airT > 220 && t - airT < 236) { const d = dirs[k++ % dirs.length]; stick(d[0], d[1]); btn(B, 60); setTimeout(() => stick(want, -0.75), 110); }
      else if (airT && t - airT > 460 && t - airT < 476) { const d = dirs[k++ % dirs.length]; stick(d[0], d[1]); btn(X, 60); setTimeout(() => stick(want, -0.75), 110); airT = 0; }
      hold(RT, dz > 30);
    }, 16);
  `),

  // SURF: ride the face, and treat the wave moves as MOVES. The mechanics probe measured a masher at 2836 against a
  // deliberate 587 — but per scoring event the two were identical (123 vs 117 points); the masher simply got 23 events
  // to the deliberate driver's 5, because a 1-press-a-second driver cycling every verb spends most of its presses on
  // things that do not score. A surfer holds trim, carves the face, and puts a move on it as often as the wave lets
  // them: B is locked for 0.55 s after each one and the SAME move again on this wave decays, so the honest baseline
  // rotates the held direction and comes back every 0.7 s. Airs go off the lip, which from a driver's seat is "when
  // the board leaves the water".
  surf: loop(`
    const dirs = [[0, -1], [-1, 0], [1, 0], [0, 1], [-0.7, -0.7], [0.7, -0.7]]; let k = 0, t = 0, lastMove = 0, lastAir = 0;
    setInterval(() => {
      t += 16;
      const h = Q.hero && Q.hero(); if (!h) return;
      let r = h; while (r.parent) r = r.parent;
      const d = Q.rawHud ? Q.rawHud() : {};
      // carve the face: a slow weave keeps the rider in the pocket instead of running straight off the shoulder
      const weave = Math.sin(t / 900) * 0.55;
      // boards phase 8: the PUMP — the trim alternates drop / climb every 0.4 s on the face (the game reads the rhythm as drive)
      stick(weave, Math.floor(t / 400) % 2 === 0 ? -0.7 : 0.7);
      hold(RT, true);                                   // trim held: speed is what every move is paid out of
      const airborne = !!(d && (d.air || d.airborne));
      if (airborne && t - lastAir > 1200) { lastAir = t; btn(Y, 70); }
      else if (!airborne && t - lastMove > 700) {
        lastMove = t;
        const dir = dirs[k++ % dirs.length];
        stick(dir[0], dir[1]);
        btn(B, 70);
        setTimeout(() => stick(weave, Math.floor(t / 400) % 2 === 0 ? -0.7 : 0.7), 140);     // back on the face; the carve itself is drawn out in update()
      }
    }, 16);
  `),

  // TENNIS (net/precision pass, 2026-09-22): play the point — steer to the incoming landing off the mode's QA seam
  // (scene.metadata.tennis), swing at the contact aimed inside the lines (alternating sides), R1 on an aerial read.
  tennis: loop(`
    let side = 1, swungAt = -1;
    setInterval(() => {
      const s = Q.scene && Q.scene(); const st = s && s.metadata && s.metadata.tennis ? s.metadata.tennis.state() : null; if (!st) return;
      if (!st.awaitingHuman || !st.shot) { stick(0, 0); return; }
      const dx = st.shot.toX - st.footX;
      if (st.flightT < 0.9) { stick(clamp(dx * 1.2) * st.steerSign, 0); return; }
      if (st.flightT >= 0.93 && swungAt !== st.shot.toZ + ':' + st.flightT.toFixed(2)) {
        swungAt = st.shot.toZ + ':' + st.flightT.toFixed(2);
        if (st.aerial) btn(5, 60); else { stick(side * 0.75, 0); btn(A, 60); side = -side; }   // aim for the corners (0.85+ is the cage bank)
        setTimeout(() => stick(0, 0), 200);
      }
    }, 16);
  `),

  // VOLLEYBALL: no seam — read the ball mesh. On my side (the human spawns at +z) steer under the ball's x and HIT when it
  // comes down into reach; B to BLOCK when their ball crosses high near the net.
  volleyball_mesh_v1: loop(`
    let lastHit = 0, lastBlock = 0;
    setInterval(() => {
      const s = Q.scene && Q.scene(); const h = Q.hero && Q.hero(); if (!s || !h) return;
      const ball = s.getMeshByName('ball'); if (!ball) return;
      let r = h; while (r.parent) r = r.parent; const q = r.getAbsolutePosition(), b = ball.position;
      const now = performance.now();
      const mine = b.z > 0.2;
      if (mine) {
        stick(clamp((b.x - q.x) * 1.5), clamp((b.z - q.z) * 0.8));
        const near = Math.hypot(b.x - q.x, b.z - q.z) < 1.6;
        if (near && b.y < 2.6 && now - lastHit > 450) { lastHit = now; btn(A, 60); }
      } else {
        stick(clamp((b.x - q.x) * 0.6), 0);
        if (b.z > -3 && b.z < 0 && b.y > 2.4 && now - lastBlock > 1500) { lastBlock = now; btn(B, 60); }
      }
    }, 16);
  `),

  // VOLLEYBALL (net/precision phase 6): the net seam (scene.metadata.net) — steer under the incoming landing, A at the
  // contact for each of the three touches (aimed across on the spike), B to BLOCK when their spike comes.
  volleyball: loop(`
    let swungAt = '', side = 1, blockedAt = '';
    setInterval(() => {
      const s = Q.scene && Q.scene(); const st = s && s.metadata && s.metadata.net ? s.metadata.net.state() : null; if (!st) return;
      if (!st.awaitingHuman || !st.shot) { stick(0, 0); return; }
      const key = st.shot.toX.toFixed(2) + ':' + st.shot.toZ.toFixed(2);
      const dx = st.shot.toX - st.footX;
      if (st.flightT < 0.88) { stick(clamp(dx * 1.4) * st.steerSign, 0); return; }
      if (st.flightT >= 0.92 && swungAt !== key) {
        swungAt = key;
        const spike = st.touches >= 2;
        stick(spike ? side * 0.6 : 0, 0); btn(A, 60); if (spike) side = -side;
        setTimeout(() => stick(0, 0), 200);
      }
    }, 16);
  `),

  // PENALTY (the Breakaway): run at the goal off the seam (scene.metadata.soccer), strike from 3 m out aimed at a corner;
  // in the keeper round, dive on the stick when their kick is away.
  penalty: loop(`
    let corner = 1, struck = -1, keepSince = 0, dove = -1;
    setInterval(() => {
      const s = Q.scene && Q.scene(); const st = s && s.metadata && s.metadata.soccer ? s.metadata.soccer.state() : null; if (!st) return;
      const now = performance.now();
      if (st.phase === 'break') {
        keepSince = 0;
        if (struck === st.round) { stick(0, 0); return; }
        if (st.z < 3.2) { stick(0, -1); return; }                    // run at the goal
        struck = st.round; stick(corner * 0.8, -1); btn(A, 60); corner = -corner; setTimeout(() => stick(0, 0), 200);
        return;
      }
      if (st.phase === 'keep') {                                        // their kick: dive on the stick 1.15 s after it starts
        if (!keepSince) keepSince = now;
        if (dove !== st.round && now - keepSince > 1150) { dove = st.round; stick(Math.random() < 0.5 ? -1 : 1, 0); setTimeout(() => stick(0, 0), 350); }
        return;
      }
      keepSince = 0; stick(0, 0);
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
