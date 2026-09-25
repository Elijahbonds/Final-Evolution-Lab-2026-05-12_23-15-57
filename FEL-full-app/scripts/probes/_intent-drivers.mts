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
    let prev = null, sx = 1, sy = 1, lastPci = null, lastCmd = [0, 0], swung = 0, aimSide = 1;
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
            // net/precision phase 7: the stick AT THE SWING is the bearing — aim a bullseye (±32°: a full stick is ~±32° at drive speed)
            if (ttc < 0.045 && now - swung > 900) { stick(aimSide, 0); btn(A, 60); swung = now; aimSide = -aimSide; setTimeout(() => stick(0, 0), 120); }
          }
        } else stick(0, 0);
      }
      prev = { t: now, x: p.x, y: p.y, z: p.z };
    }, 16);
  `),

  // GOLF: the three-click swing — start, POWER at the top of the wave, ACCURACY inside the band on the way down
  golf: loop(`
    let last = null, cool = 0, idleT = 0, clubTries = 0;
    setInterval(() => {
      const h = Q.rawHud(), ph = h.swingPhase, m = typeof h.meterT === 'number' ? h.meterT : null;
      if (cool > 0) { cool -= 16; last = m; return; }
      // net/precision phase 7: CLUB and POWER for the distance. The HUD says the pin (m) and this club's full carry
      // (aimCarry); a club whose full carry overshoots the pin by more than a third is cycled down (B) before the swing,
      // and the power press comes at pin / carry of the meter instead of the top. (Before: a full driver, every hole — OB.)
      const pin = typeof h.pin === 'string' ? parseFloat(h.pin) : NaN, carry = typeof h.aimCarry === 'number' ? h.aimCarry : NaN;
      if (!ph) {
        if (Number.isFinite(pin) && Number.isFinite(carry) && carry > pin * 1.35 && pin > 12 && clubTries < 8) { btn(B); clubTries++; cool = 350; last = null; return; }
        idleT += 16; if (idleT > 1400) { btn(A); idleT = 0; cool = 300; clubTries = 0; } last = null; return;
      }
      // on the green the putter is automatic and the meter has no carry ticks: a putt's power is the distance (measured: eight
      // 0.98 putts rode the bank out and came back further each time, 2.7 m → 4.4 m, then a pick-up)
      const onGreen = Number.isFinite(pin) && pin < 12;
      const want = onGreen ? clamp(0.22 + pin / 16, 0.75) : Number.isFinite(pin) && Number.isFinite(carry) && carry > 0 ? clamp(pin / carry, 0.98) : 0.96;
      idleT = 0;
      if (ph === 'power' && m !== null && last !== null && (m >= Math.max(0.3, want) || (m < last && last > 0.85))) { btn(A); cool = 150; }
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

  // FREE RUN (racing pass phase 7, 2026-09-23): the LANE RUNNER from _freerun-flow.mts, in the page. The first driver
  // (2026-09-15) predated the three lanes and the seam: it read box meshes, steered by flipping a sign when the runner
  // moved the wrong way, and fell 19–47 times a run on the auto-started course. This one reads the seam's pieces and
  // runs ONE lane (window.__LANE, default mid) with RT held: A at a gap edge, a vault at the graded lead, onto a rail and a
  // spring; the high lane's shaft run OBLIQUE at the far wall for the vector rebound; LT under a bar; X on a hazard; Y on
  // a full kinetic meter; LB at an anchor; B in a lunge window (the parry-vault), RB beside a runner (the drive-by), A on
  // a full draft (the slingshot); a right-stick flick in the air.
  freerun: loop(`
    const LB = 4, RB = 5, LT = 6; const LANE = window.__LANE || 'mid'; const LX = { low: -6, mid: 0, high: 6 };
    let lastTap = 0, lt = false, sign = 1, wallSide = 0, begun = false;
    const tap = (i) => btn(i, 50);
    setInterval(() => {
      const sc = Q.scene && Q.scene(); const f = sc && sc.metadata && sc.metadata.freerun; if (!f) return; const st = f.state();
      if (st.phase === 'pick') { if (!begun) { begun = true; tap(A); } return; }
      if (st.phase !== 'run') { hold(RT, false); hold(LT, false); stick(0, 0); return; }
      hold(RT, true);
      const z = st.z, x = st.x, now = performance.now(), pieces = st.pieces || [];
      const ahead = pieces.filter((q) => q.z + q.d / 2 > z - 0.5 && q.z - q.d / 2 < z + 14 && (q.route === LANE || (LANE === 'high' && q.kind === 'wall') || (LANE === 'mid' && q.kind === 'anchor')));
      let tx = LX[LANE];
      // a lane that has ENDED has no floor: follow the floor ahead instead (measured, phase 7: past HYDRO-DAM's last
      // checkpoint the low line stops, and a runner held to x −6 fell off and respawned 44 times)
      const floorAhead = pieces.filter((q) => q.kind === 'ground' && q.z + q.d / 2 > z + 2 && q.z - q.d / 2 < z + 12);
      if (floorAhead.length && !floorAhead.some((q) => Math.abs(q.x - tx) < q.w / 2 - 0.5)) tx = floorAhead.sort((a, b) => Math.abs(a.x - tx) - Math.abs(b.x - tx))[0].x;
      const vault = ahead.find((q) => q.kind === 'vault' && q.z > z);
      const bar = ahead.find((q) => q.kind === 'bar' && q.z > z - 0.5);
      const rail = ahead.find((q) => q.kind === 'rail' && q.z + q.d / 2 > z);
      const spring = ahead.find((q) => q.kind === 'spring' && q.z > z);
      const walls = ahead.filter((q) => q.kind === 'wall' && Math.abs(q.z - z) < q.d / 2 + 2);
      if (vault) tx = vault.x; if (rail) tx = rail.x; if (spring && !rail) tx = spring.x;
      const inShaft = LANE === 'high' && walls.length >= 2;
      if (inShaft) { if (st.stats.rebounds !== wallSide) { wallSide = st.stats.rebounds; sign = -sign; } tx = sign > 0 ? 8.3 : 3.7; }
      stick(inShaft ? sign * 0.75 : clamp((tx - x) * 0.35), -1);
      const gap = pieces.find((q) => q.kind === 'gap' && q.d > 0 && q.z - q.d / 2 - z > -0.2 && q.z - q.d / 2 - z < 1.3);
      if (st.state === 'ground' && gap && now - lastTap > 250) { tap(A); lastTap = now; }
      if (st.state === 'ground') {
        if (inShaft && st.wallDeg >= 18 && st.wallDeg <= 72 && st.wallDist < 1.4 && now - lastTap > 250) { tap(A); lastTap = now; }
        else if (vault && st.vaultDist < 90 && st.vaultDist / Math.max(0.5, st.speed) <= 0.19 && now - lastTap > 400) { tap(A); lastTap = now; }
        else if (rail && !vault && rail.z - rail.d / 2 - z < 1.6 && rail.z - rail.d / 2 - z > -0.2 && now - lastTap > 500) { tap(A); lastTap = now; }
        const hz = pieces.find((q) => q.kind === 'hazard' && q.z - z > -0.3 && q.z - z < 1.5 && Math.abs(q.x - x) < 1.2);
        if (hz && now - lastTap > 300) { tap(X); lastTap = now; }
        if (st.kinetic >= 50 && now - lastTap > 300 && !vault && !rail) { tap(Y); lastTap = now; }
      }
      if (st.anchor && (st.state === 'ground' || st.state === 'air') && now - lastTap > 200) { tap(LB); lastTap = now; }
      if (st.race && st.race.lunge && Math.abs(st.race.lunge.inSec) <= 0.2 && now - lastTap > 150) { tap(B); lastTap = now; }
      const beside = (st.rivals || []).find((r) => !r.finished && r.stumble <= 0 && Math.abs(r.z - z) < 2.0 && Math.abs(r.x - x) < 2.4 && Math.abs(r.x - x) > 0.3);
      if (beside && st.state === 'ground' && now - lastTap > 400) { tap(RB); lastTap = now; }
      if (st.race && st.race.draft >= 1 && st.state === 'ground' && now - lastTap > 300) { tap(A); lastTap = now; }
      const nearBar = !!bar && bar.z - z < 2.2 && bar.z - z > -0.6;
      if (nearBar !== lt) { lt = nearBar; hold(LT, lt); }
      // a trick only with real height under the runner: a flip thrown on a vault hop cannot come round and lands as a BAIL
      // (measured, phase 7: 9–43 bails a run on the low lanes, every one a trick on a short hop)
      const under = pieces.filter((q) => Math.abs(q.x - x) < q.w / 2 && Math.abs(q.z - z) < q.d / 2 && q.kind !== 'gap').reduce((m, q) => Math.max(m, q.y + 0.5), 0);
      if (st.state === 'air' && now - lastTap > 300 && st.speed > 4 && st.y - under > 1.6 && Math.random() < 0.3) { P.axes[3] = -1; touch(); setTimeout(() => { P.axes[3] = 0; touch(); }, 60); lastTap = now; }
    }, 40);
  `),
  // RACING PASS (2026-09-23): the three racers that had no driver. Each reads the mode's own probe seam and races the line:
  // KART — throttle held, steer onto the line's heading (plus a lateral pull), hold DRIFT (X) into a corner the heading
  // error says is sharp, tap BOOST (R1) on a straight, fire what the balloons gave.
  velocitykart: loop(`
    const LT = 6, R1 = 5; let drift = false, lastFire = 0, boosting = false;
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    // THE START (racing pass phase 4): the HUD's \`start\` is the beat on screen. window.__START picks the driver's timing —
    // 'rocket' (default: throttle down 150 ms after "2" lands), 'early' (held from the first beat: a burnout), 'late' (on "1").
    let beat = '', beatAt = 0;
    const startGas = (h) => { if (h.start !== beat) { beat = h.start; beatAt = performance.now(); } const m = window.__START || (window.__PLAIN ? 'late' : 'rocket');
      return m === 'early' ? true : m === 'late' ? beat === '1' : (beat === '2' && performance.now() - beatAt > 150) || beat === '1'; };
    // RACING PASS phase 6: a driver who READS THE ROAD — steer at the seam's look-ahead point (aheadYaw), lift and brake for
    // a corner faster than it can be held (holdV), drift the tight ones (the boost it banks is the reward), burn the boost
    // on a straight, fire what the balloons gave. The phase 1 driver chased the tangent under the kart and spent a
    // quarter of the race on the grass.
    setInterval(() => {
      const h = Q.rawHud ? Q.rawHud() : {}; if (h.start) { hold(RT, startGas(h)); stick(0, 0); return; }
      const s = Q.scene && Q.scene(); const k = s && s.metadata && s.metadata.kart; if (!k) return; const st = k.state();
      if (st.done) { hold(RT, false); hold(X, false); hold(LT, false); hold(R1, false); stick(0, 0); return; }
      const err = wrap((st.aheadYaw ?? st.tangentYaw ?? 0) - (st.heading || 0));
      const holdV = st.holdV || 99, over = st.speed > holdV * 1.04;
      // window.__PLAIN: the same line and braking with NO skill verbs (no drift, boost, items, rocket) — the contrast that
      // says whether the skills, not the line alone, decide the race
      const PLAIN = !!window.__PLAIN;
      // drift only a real hairpin, from the middle of the road, and ease the steering while the rear is out (a full-gain
      // steer in a slide carried the kart wide into the snow on SUMMIT CLIMB: 19 % of the race off the road)
      const edge = Math.abs(st.lateral || 0) / Math.max(1, st.halfWidth || 9);
      const wantDrift = !PLAIN && (st.cornerR || 999) < 42 && st.speed > 16 && Math.abs(err) > 0.12 && edge < 0.5;
      // window.__TOW (racing pass phase 7): tuck into the lane of the kart 2–14 m ahead — the slipstream's wake
      const tow = window.__TOW ? (st.rivals || []).filter((r) => r.gap > 2 && r.gap < 14).sort((a, b) => a.gap - b.gap)[0] : null;
      const towPull = tow && edge < 0.6 ? clamp((tow.lateral - (st.lateral || 0)) * 0.12, 0.35) : 0;
      stick(clamp(err * (drift ? 1.7 : 2.4) + towPull - (edge > 0.7 ? Math.sign(st.lateral) * 0.3 : 0)), 0);
      if (wantDrift !== drift) { drift = wantDrift; hold(X, drift); }
      hold(RT, !over || drift); hold(LT, !drift && st.speed > holdV * 1.18);
      const wantBoost = !PLAIN && (st.cornerR || 0) > 110 && Math.abs(err) < 0.1 && Number(h.boost) > 25 && !over;
      if (wantBoost !== boosting) { boosting = wantBoost; hold(R1, boosting); }
      const now = performance.now();
      if (!PLAIN && st.item && now - lastFire > 1500) { btn(A); lastFire = now; }
    }, 33);
  `),
  // AERO — the DKR line-follower (_aero-dkr-eye): yaw onto the line's tangent, pitch to the line's height, GAS held, fire
  // what the balloons gave, a STUNT on a long straight, BOOST (R1) when lined up.
  aeroaces: loop(`
    const R1 = 5; let lastFire = 0, lastStunt = 0, lastBoost = 0;
  // THE START (racing pass phase 4): the HUD's \`start\` is the beat on screen. window.__START picks the driver's timing —
  // 'rocket' (default: throttle down 150 ms after "2" lands), 'early' (held from the first beat: a burnout), 'late' (on "1").
  let beat = '', beatAt = 0;
  const startGas = (h) => { if (h.start !== beat) { beat = h.start; beatAt = performance.now(); } const m = window.__START || (window.__PLAIN ? 'late' : 'rocket');
    return m === 'early' ? true : m === 'late' ? beat === '1' : (beat === '2' && performance.now() - beatAt > 150) || beat === '1'; };
    setInterval(() => {
      const h = Q.rawHud ? Q.rawHud() : {}; if (h.start) { hold(RT, startGas(h)); stick(0, 0); return; }
      const s = Q.scene && Q.scene(); const a = s && s.metadata && s.metadata.aero; if (!a) return; const st = a.state();
      if (st.done) { hold(RT, false); stick(0, 0); return; }
      hold(RT, true);
      let err = 0;
      if (st.tangent && st.pos) {
        err = Math.atan2(st.tangent.x, st.tangent.z) - st.heading; err = Math.atan2(Math.sin(err), Math.cos(err));
        // window.__TOW (phase 7): hold the lane of the plane 2–14 m ahead instead of the line's centre — the wake
        const tow = window.__TOW ? (st.rivals || []).filter((r) => r.gap > 2 && r.gap < 14).sort((a, b) => a.gap - b.gap)[0] : null;
        stick(clamp(err * 2.2 - (st.lateral - (tow ? tow.lateral : 0)) * 0.06), clamp((st.lineY - st.pos.y) * 0.12));
      }
      const now = performance.now();
      if (window.__PLAIN) return;   // the line alone: no items, stunts or boost (see the kart's __PLAIN)
      if (st.item && now - lastFire > 1500) { btn(A); lastFire = now; }
      if (Math.abs(err) < 0.05 && now - lastStunt > 9000) { btn(B); lastStunt = now; }
      else if (Math.abs(err) < 0.1 && now - lastBoost > 3000) { btn(R1, 400); lastBoost = now; }
    }, 33);
  `),
  // DANCE (MUSIC-SUITE P1, 2026-09-25) — a dancer who reads the cue lane. The scorecard had no Logic for the cypher
  // (SCORECARD-rc25: "no gauntlet or mechanics evidence") because nothing played it on purpose: the generic deliberate
  // driver taps once a second off the beat. The mode publishes its lane every playing frame (DanceMode.ts:440, HUD
  // `cues`: each upcoming step's `in` = step time − audio now, on the SAME audio clock perf.hit() judges with,
  // DanceMode.ts:386), so a player who watches it knows exactly when each step lands. This one:
  //   · on the pick screen (HUD nextStep '◀ ▶ TRACK · A START', DanceMode.ts:249) presses A once a second until the
  //     count-in takes it (a press during the harness's own 3-2-1 is not delivered, so it retries);
  //   · polls rawHud every 4 ms and treats a NEW `cues` array as "a frame just ran update()", so a cue's `in` is as of
  //     now (± 4 ms), not as of whenever the poll happened to land;
  //   · plans one A per step (a step is one tap: DancePerformance.hit, DanceCore.ts:255).
  // THE PRESS MUST LAND IN THE FRAME BEFORE THE STEP (measured 2026-09-25, _mechanics-probe dance-dry1: aimed AT the step,
  // 6 hits in 30 rounds, and the misses were WILD — "MISS" with no EARLY/LATE). The pad is read on the InputBus's rAF
  // chain (InputBus.ts:569) and onInput runs perf.hit(now) BEFORE that frame's update() has moved a due step into
  // `pending` (DanceCore.ts:198-207). A tap delivered in the first frame after the step's time therefore finds no pending
  // step, and the early-hit rescue (DanceCore.ts:268-281) wants the step still AHEAD (earlyBy > 0): it is judged a wild
  // MISS and costs WILD_TAP_COST. A player tapping dead on the beat meets this on any tap the frame delivers late (a
  // held-file bug for P2: DanceCore.ts is movement play's). So this driver aims one frame EARLY — LEAD = the p90 frame
  // interval + 4 ms, capped at 38 (inside PERFECT's 40 ms) — and the step is taken by the early path as PERFECT.
  // window.__DANCE_LEAD pins LEAD (ms; 8 = aim at the step, the dance-dry1 driver); window.__DANCE_OFF_MS shifts every
  // tap (a late / early dancer). window.__DANCE_LOG keeps [plannedAt, in, name] for a probe.
  dance: loop(`
    const PIN = window.__DANCE_LEAD, OFF = Number(window.__DANCE_OFF_MS ?? 0);
    let lastPick = 0, lastRef = null; const planned = []; const frames = []; let lastF = 0;
    window.__DANCE_PLANNED = 0; window.__DANCE_LOG = [];
    const onFrame = (t) => { if (lastF) { frames.push(t - lastF); if (frames.length > 60) frames.shift(); } lastF = t; requestAnimationFrame(onFrame); };
    requestAnimationFrame(onFrame);
    const lead = () => { if (PIN != null) return Number(PIN); if (!frames.length) return 24; const s = frames.slice().sort((a, b) => a - b); return Math.min(38, s[Math.floor(s.length * 0.9)] + 4); };
    setInterval(() => {
      const h = Q.rawHud ? Q.rawHud() : {}; const now = performance.now();
      if (typeof h.nextStep === 'string' && /TRACK/.test(h.nextStep)) { if (now - lastPick > 1000) { lastPick = now; btn(A, 70); } return; }
      const cues = h.cues;
      if (!Array.isArray(cues) || cues === lastRef) return;
      lastRef = cues;
      for (const c of cues) {
        if (typeof c.in !== 'number' || c.in < -0.12 || c.in > 0.6) continue;
        const at = now + c.in * 1000 + OFF;
        if (planned.some((t) => Math.abs(t - at) < 120)) continue;   // steps are ≥ half a beat apart (268 ms at 112 BPM)
        planned.push(at); if (planned.length > 64) planned.shift();
        window.__DANCE_PLANNED++; window.__DANCE_LOG.push([Math.round(at), c.in, c.name]);
        const L = lead();
        setTimeout(() => btn(A, 45), Math.max(0, at - now - L));
      }
    }, 4);
  `),

  // SPRINT — hands off until the HUD says Go (a tap before it is a false start), then alternate the d-pad on a 115 ms
  // cadence (the carnival A+ recipe: 115 ms wins in ~11.5 s, 200 ms wins faster on the rhythm reward, 420 ms never finishes).
  sprint: loop(`
    const LEFT = 14, RIGHT = 15; let side = 0, last = 0, dipped = false;
    const CAD = Number(window.__SPRINT_CADENCE_MS || 200);
    setInterval(() => {
      const h = Q.rawHud ? Q.rawHud() : {}; if (h.phase !== 'Go' && h.phase !== 'Run') return;
      // THE DIP (racing pass phase 8): d-pad UP inside the last 2 m (the HUD's distance reads "97.3m / 100m")
      const dm = parseFloat(String(h.distance || '0')); if (!window.__NODIP && !dipped && dm > 98) { dipped = true; btn(12, 50); }
      const now = performance.now(); if (now - last < CAD) return; last = now;
      btn(side ? RIGHT : LEFT, 50); side ^= 1;
    }, 8);
  `),

  // MUSIC — the Groove Academy's PERFORM (MUSIC-SUITE P1, 2026-09-25). A DOM room: no pad, no scene. TAP is a React
  // onClick (StudioMode.tsx:510) judged against the engine's audio clock (performTap → PerformSet.tap(ctx.currentTime),
  // StudioMode.tsx:266-274), so this driver CLICKS the button (window.__DOM_CLICK, the _dom-room shim) at chosen times.
  // What is a note today: EVERY sequencer step of free play, sounding or not (PerformSet.note is called for each
  // step, StudioMode.tsx:208-216) — and a note is only tappable once AudioEngine.drainPlayhead has OFFERED it, up to a
  // 25 ms timer tick after its time (AudioEngine.ts:154-161). Four players, picked by window.__PERFORM_TAP:
  //   'onbeat'  (default when the room exposes its schedule) — a perfectly calibrated musician: every note tapped AT its
  //             scheduled time on the audio clock. Needs /dev/music's window.__FEL_STUDIO__.steps (app/dev/music/
  //             loader.tsx: each scheduled step and its time) and the page's AudioContext (_dom-room AUDIO_CLOCK_INIT).
  //   'heard'   — the same musician uncalibrated: taps when the note comes out of the speaker (+ base + output latency).
  //   'hits'    — a musician playing the MUSIC: lays kick on 1-2-3-4 and snare on 2 and 4, then taps only where the beat
  //             sounds (what a player hears as "the notes"); the judge still offers the other twelve steps a bar.
  //   'offered' — the best the judge allows: taps the moment the playhead moves (the drain offered the note), read off the
  //             grid's playhead outline (StudioMode.tsx:470). The fallback on /play/music, which has no schedule readout.
  // window.__INTENT_VARIANT says which one ran (a production run can only be 'offered').
  music: `(() => {
    const S = window.__FEL_STUDIO__;
    const clock = () => (window.__ACS || []).filter((c) => c.state === 'running').slice(-1)[0] || null;
    const tap = () => window.__DOM_CLICK && window.__DOM_CLICK('TAP');
    let want = window.__PERFORM_TAP || (S && clock() ? 'onbeat' : 'offered');
    if (want !== 'offered' && !(S && clock())) want = 'offered';
    window.__INTENT_VARIANT = want; window.__MUSIC_TAPS = 0;
    const HITS = new Set();
    if (want === 'hits') {
      // lay the beat on the STUDIO grid (the grid stays on screen in PERFORM): label cell, then 16 step cells per row
      const lay = (row, steps) => {
        const lab = Array.from(document.querySelectorAll('div')).find((d) => (d.textContent || '').trim() === row && d.nextElementSibling);
        if (!lab) return; let c = lab.nextElementSibling, i = 0;
        while (c && i < 16) { if (steps.includes(i)) c.click(); c = c.nextElementSibling; i++; }
      };
      lay('Kick', [0, 4, 8, 12]); lay('Snare', [4, 12]);
      for (const i of [0, 4, 8, 12]) HITS.add(i);
    }
    if (want === 'offered') {
      const col = () => { const el = document.querySelector('div[style*="outline"]'); if (!el || !el.parentElement) return -1; return Array.prototype.indexOf.call(el.parentElement.children, el); };
      let last = col();
      new MutationObserver(() => { const c = col(); if (c !== last) { last = c; if (c >= 0) { tap(); window.__MUSIC_TAPS++; } } })
        .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['style'] });
      return;
    }
    const done = new Set();
    setInterval(() => {
      const c = clock(); if (!c || !S) return;
      const nowA = c.currentTime;
      const lag = want === 'heard' ? (c.baseLatency || 0) + (c.outputLatency || 0) : 0;
      for (const s of S.steps) {
        const key = s.time.toFixed(4);
        if (done.has(key) || s.time + lag < nowA) continue;
        if (want === 'hits' && !HITS.has(s.step)) continue;
        const ms = (s.time + lag - nowA) * 1000;
        if (ms > 300) continue;
        done.add(key);
        setTimeout(() => { tap(); window.__MUSIC_TAPS++; }, Math.max(0, ms));
      }
    }, 5);
  })()`,
};

/**
 * MASHERS THAT MASH THE VERB (MUSIC-SUITE P1, 2026-09-25). The mechanics probe's generic masher presses one of twelve
 * pad buttons at random, ~8 a second. In a mode with ONE verb that is a weak masher — dance reads only A, B and RT
 * (DanceMode.ts:383), so seven presses in twelve are rests — and in a DOM room it presses nothing at all (TAP is a
 * click, not a pad button). These press the mode's own verbs at the same ~8 a second with random gaps: the masher a
 * rhythm game actually has to beat. _mechanics-probe runs one of these when it exists (GENERIC_MASH=1 forces the old one).
 */
export const MASHER_DRIVERS: Record<string, string> = {
  // A / B / RT (all three are TAP in the cypher), 40 ms down, 50–120 ms up: ~8 presses a second. No stick: the cypher
  // reads none while dancing, and on the pick screen a random stick changes the SONG (dance-dry1's masher landed on
  // BATTLE, 112 BPM, while the intent driver danced THE CYPHER) — so the masher's first A locks the same default song.
  dance: loop(`
    const V = [A, B, RT]; window.__MASH_PRESSES = 0;
    const go = () => { btn(V[Math.floor(Math.random() * V.length)], 40); window.__MASH_PRESSES++; setTimeout(go, 90 + Math.random() * 70); };
    go();
  `),
  // TAP clicked at random, 60–190 ms apart: ~8 a second.
  music: `(() => {
    window.__MASH_PRESSES = 0;
    const go = () => { if (window.__DOM_CLICK && window.__DOM_CLICK('TAP')) window.__MASH_PRESSES++; setTimeout(go, 60 + Math.random() * 130); };
    go();
  })()`,
};
