// AERO ACES probe — does it actually fly, and can the course be completed?
//
// Flies /dev/mode/aeroaces with a simple autopilot: point at the next ring, hold throttle, roll into the turn.
// Reports gates taken, laps, stalls and whether the run finished. A mode that typechecks is not a mode that flies.
//
// env: BASE (http://localhost:3061) MAXMS (150000) COURSE (bay-circuit)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const MAXMS = Number(process.env.MAXMS ?? 150000);
const COURSE = process.env.COURSE ?? 'bay-circuit';
const exe = (() => {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
})();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
let errors = 0; const errs: string[] = [];
p.on('console', (m) => { if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(m.text())) { errors++; if (errs.length < 5) errs.push(m.text().slice(0, 140)); } });
p.on('pageerror', (e) => { errors++; errs.push('PAGEERROR ' + e.message.slice(0, 160)); });
await p.addInitScript(`(() => {
  const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
})()`);
await p.goto(`${BASE}/dev/mode/aeroaces?course=${COURSE}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(9000);
const start = p.locator('text=/^START$/').first();
if (await start.count()) { await start.click(); await p.waitForTimeout(3000); }
// AUTOPILOT. Reads the plane and the ring it is chasing out of the scene and flies at it: roll toward the
// bearing, pitch toward the height, throttle open. This is the honest test of whether the mode is flyable.
await p.evaluate(`(() => {
  const scene = window.__FEL_DEV__.scene;
  const pad = window.__PAD;
  const press = (i, v) => { pad.buttons[i] = { pressed: v > 0.1, touched: v > 0.1, value: v }; pad.timestamp = performance.now(); };
  window.__AP = { gates: 0, stalls: 0, maxSpeed: 0, minAlt: 9999, hudSeen: [] };
  const planeOf = () => scene.getMeshByName('aero_body');
  const ringOf = () => {
    // the chased ring is the bright one (emissive gold) — exactly what a player reads
    for (const m of scene.meshes) {
      if (!/^aero_ring_/.test(m.name)) continue;
      const e = m.material && m.material.emissiveColor;
      if (e && e.r > 0.5) return m;
    }
    return null;
  };
  window.__API = setInterval(() => {
    const plane = planeOf(), ring = ringOf();
    press(7, 1);                                   // throttle wide open
    if (!plane || !ring) return;
    const pp = plane.getAbsolutePosition(), rp = ring.getAbsolutePosition();
    // bearing error: where the ring is relative to where the nose points
    const want = Math.atan2(rp.x - pp.x, rp.z - pp.z);
    let err = want - plane.rotation.y;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    // ROLL into the turn (that is how this model turns), and pitch toward the ring's height
    // A proportional-only roll oscillated (one gate in 90 s): it rolled hard, overshot the bearing, rolled
    // hard back. DAMPED on the rate of change of the error, which is what a pilot does by anticipating.
    const prev = window.__AP.lastErr === undefined ? err : window.__AP.lastErr;
    const rate = err - prev;
    window.__AP.lastErr = err;
    pad.axes[0] = Math.max(-1, Math.min(1, err * 1.1 + rate * 9));
    const dy = rp.y - pp.y;
    // Stick BACK (axes[1] POSITIVE) raises the nose, like an aircraft — so climbing toward a ring above me
    // needs a positive value. My first pass negated this and the autopilot dove at every ring above it,
    // scraping the floor and stalling for 1282 frames.
    pad.axes[1] = Math.max(-1, Math.min(1, dy / 40));
    pad.timestamp = performance.now();
    const txt = document.body.innerText;
    const sp = txt.match(/"speed"\\s*:\\s*(\\d+)/); if (sp) window.__AP.maxSpeed = Math.max(window.__AP.maxSpeed, Number(sp[1]));
    const al = txt.match(/"altitude"\\s*:\\s*(\\d+)/); if (al) window.__AP.minAlt = Math.min(window.__AP.minAlt, Number(al[1]));
    const gt = txt.match(/"gate"\\s*:\\s*"([^"]*)"/); if (gt && !window.__AP.hudSeen.includes(gt[1])) window.__AP.hudSeen.push(gt[1]);
    if (/STALL/.test(txt)) window.__AP.stalls++;
  }, 60);
})()`);
await p.waitForTimeout(MAXMS);
const ap = await p.evaluate('window.__AP') as { gates: number; stalls: number; maxSpeed: number; minAlt: number; hudSeen: string[] };
const hud = await p.evaluate(`(() => { const t = document.body.innerText; return { lap: (t.match(/"lap"\\s*:\\s*"([^"]*)"/) || [])[1], time: (t.match(/"time"\\s*:\\s*"([^"]*)"/) || [])[1], banner: (t.match(/"banner"\\s*:\\s*"([^"]*)"/) || [])[1], gate: (t.match(/"gate"\\s*:\\s*"([^"]*)"/) || [])[1] }; })()`) as Record<string, string>;
await p.evaluate('clearInterval(window.__API)');
console.log('course: ' + COURSE);
console.log('gates the HUD showed (in order): ' + JSON.stringify(ap.hudSeen));
console.log('max speed ' + ap.maxSpeed + ' m/s · min altitude ' + ap.minAlt + ' m · stall frames ' + ap.stalls);
console.log('final HUD: ' + JSON.stringify(hud));
console.log('errors: ' + errors + (errs.length ? ' :: ' + errs.join(' | ') : ''));
await b.close();
