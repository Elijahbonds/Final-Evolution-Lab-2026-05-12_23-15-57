// AERO ACES — can a lap actually be finished?
//
// Reported open since the mode shipped: an autopilot never completed one. A mode that cannot be finished is
// worse than a mode that is missing, so this flies it with a simple pursuit autopilot — point at the next
// gate, hold throttle — and reports how far it gets.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const SECS = Number(process.env.SECS ?? 90);
const exe = (() => { const r = process.env.HOME + '/Library/Caches/ms-playwright';
  const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
  return `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`; })();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1000, height: 640 } });
const lines: string[] = []; let errors = 0;
p.on('console', (m) => { const t = m.text(); if (/AERO|gate|lap/i.test(t)) lines.push(t.slice(0, 120)); if (m.type() === 'error' && !/401/.test(t)) errors++; });
p.on('pageerror', () => { errors++; });
await p.addInitScript(`(() => {
  const pad = { index: 0, id: 'fake', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
})()`);
await p.goto(`${BASE}/dev/mode/aeroaces`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(10000);
const s0 = p.locator('text=/^START$/').first();
if (await s0.count()) { await s0.click(); await p.waitForTimeout(3000); }

// PURSUIT AUTOPILOT. Read the next gate from the mode's dev seam, steer at it, hold throttle.
await p.evaluate(`(() => {
  const dev = window.__FEL_DEV__;
  const aero = dev.scene.metadata && dev.scene.metadata.aero;
  window.__AERO_LOG = [];
  const pad = window.__PAD;
  window.__AP = setInterval(() => {
    const st = aero && aero.state ? aero.state() : null;
    if (!st || !st.pos) { pad.buttons[7].value = 1; pad.timestamp = performance.now(); return; }
    let g = st.nextGate;
    if (g) {
      // FLY AN APPROACH, NOT A CHASE. A gate is passed by crossing its plane inside the radius travelling
      // the right way. Aiming at the ring's centre arrives at whatever angle the turn happens to end on, and
      // a miss becomes an orbit — the aircraft circled gate 3 for 150 s doing exactly that. So the target is
      // a point one approach-length BEFORE the gate along its own through-axis, and only once the aircraft
      // is lined up and close does the target become the ring itself. That is how you fly a gate.
      const APPROACH = 130;
      const ax = g.x - g.through.x * APPROACH, ay = g.y - g.through.y * APPROACH, az = g.z - g.through.z * APPROACH;
      const dAppr = Math.hypot(ax - st.pos.x, az - st.pos.z);
      // lined up = past the approach point and already pointing through the ring
      const toGate = Math.hypot(g.x - st.pos.x, g.z - st.pos.z);
      // LATCH THE COMMIT. Without it the target flips between the approach point and the ring as the
      // aircraft crosses the threshold, and the target jumping 200 m every few seconds is itself what keeps
      // it circling (the trace showed distance spiking to 226 with nothing else changing). Once committed to
      // a gate, stay committed until the gate INDEX changes.
      if (window.__AERO_COMMIT !== st.next) {
        if (dAppr < 60 || toGate < APPROACH * 0.7) window.__AERO_COMMIT = st.next;
      }
      const onLine = window.__AERO_COMMIT === st.next;
      if (!onLine) g = { ...g, x: ax, y: ay, z: az };
      // bearing to the gate in the aircraft's own frame — position and heading from the seam, because the
      // hero mesh's rotation is the RENDERED pose (pitch/roll baked in) and the flight model's own heading
      // is the thing the controls actually move
      const dx = g.x - st.pos.x, dz = g.z - st.pos.z, dy = g.y - st.pos.y;
      const yaw = st.heading;
      const fwd = Math.cos(yaw) * dz + Math.sin(yaw) * dx;
      const right = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
      const dist = Math.hypot(dx, dz);
      // STEER ON THE BEARING ANGLE, NOT A DISTANCE RATIO. The first working version used right/dist, which
      // saturates at full roll for any target off the nose — so the aircraft held a hard bank and flew a
      // circle around the gate instead of lining up on it. An aircraft turns by ROLLING, and the roll it
      // wants is proportional to how many degrees off it is.
      const bearing = Math.atan2(right, fwd);          // −π..π, 0 = dead ahead
      pad.axes[0] = Math.max(-1, Math.min(1, bearing * 0.7));
      window.__AERO_BEARING = bearing;
      // STICK BACK IS NOSE UP, and on a gamepad "back" is POSITIVE y. The first run had this inverted and
      // flew the aircraft into the floor: 2879 crashes, speed 0.1, y 14.
      const elevation = Math.atan2(dy, Math.max(1, dist));
      // …and level the wings before pulling: pitching hard while banked turns instead of climbing
      // ALWAYS hold the climb. Gating it on bearing meant the aircraft never climbed while turning, and it
      // turns most of the time — so it sank 164 m below the gate it was circling (measured).
      // DAMPED. At 2.2 the aircraft porpoised straight through the target altitude and back (trace: dy +53
      // then −61 around one gate), which is what an undamped proportional controller does. Gentler, and it
      // eases off as the gate gets close so the last hundred metres are a straight run rather than a chase.
      // PROPORTIONAL + DERIVATIVE. Proportional alone porpoises: the aircraft has momentum, so by the time
      // the error is zero it is already climbing hard and sails straight through (measured: y swinging
      // 164 ↔ 306 around one gate). The damping term reads the aircraft's own vertical RATE and pulls
      // against it, which is what stops the overshoot rather than just making it slower.
      const vy = window.__AERO_PREV ? (st.pos.y - window.__AERO_PREV.y) / 0.05 : 0;
      window.__AERO_PREV = { y: st.pos.y };
      const wantVy = Math.max(-35, Math.min(35, dy * 0.45));      // close the gap, but never faster than this
      pad.axes[1] = Math.max(-1, Math.min(1, (wantVy - vy) * 0.06));
      void elevation;
      window.__AERO_LOG.push({ t: +st.time.toFixed(1), next: st.next, dist: +dist.toFixed(1),
                               dy: +dy.toFixed(0), y: +st.pos.y.toFixed(0), spd: st.speed });
      if (window.__AERO_LOG.length > 400) window.__AERO_LOG.shift();
    }
    // THROTTLE BACK TO TURN. An aircraft's turn radius grows with speed, so holding full throttle while
    // correcting onto a 24 m ring is what keeps the circle wider than the correction needs. Ease off when
    // the nose is off the target and close in.
    const st2 = st.nextGate;
    const near2 = st2 ? Math.hypot(st2.x - st.pos.x, st2.z - st.pos.z) : 999;
    const offNose = Math.abs(window.__AERO_BEARING ?? 0);
    pad.buttons[7].value = near2 < 220 && offNose > 0.35 ? 0.35 : 1;
    pad.timestamp = performance.now();
  }, 50);
})()`);
await p.waitForTimeout(SECS * 1000);
const out = await p.evaluate(`(() => {
  const aero = window.__FEL_DEV__.scene.metadata && window.__FEL_DEV__.scene.metadata.aero;
  const st = aero && aero.state ? aero.state() : null;
  const log = window.__AERO_LOG || [];
  // a trace every ~5 s, so "converging" and "orbiting" are distinguishable
  const trace = log.filter(function (_, i) { return i % 100 === 0; }).map(function (l) { return 't' + l.t + ' g' + l.next + ' d' + l.dist + ' dy' + l.dy + ' y' + l.y + ' v' + l.spd; });
  return { state: st, sampled: log.length, trace, gatesSeen: [...new Set(log.map(l => l.next))] };
})()`);
console.log('AERO:', JSON.stringify(out));
console.log('lines:', lines.slice(-6).join(' | ') || 'none');
console.log('errors', errors);
await p.screenshot({ path: './shots/aero-lap.png' });
await b.close();
