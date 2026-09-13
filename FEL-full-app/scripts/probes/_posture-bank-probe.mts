// DYNAMIC POSTURE probe — does the chest actually ROLL when the body cuts?
//
// The claim is bones, so the measurement is bones: bind the hero's Spine1/Spine2 and read their ROLL (the z of
// the bone's own euler) while driving a hard left-right-left cut. Before this pass every authored hoops stance was
// pitch-only, so roll was identically zero for the whole game — if the numbers below are flat, the layer is not
// reaching the rig.
//
// env: BASE (http://localhost:3061) MODE (onevone) MAXMS (70000)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const MODE = process.env.MODE ?? 'onevone';
const MAXMS = Number(process.env.MAXMS ?? 70000);
const exe = (() => {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
})();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
let errors = 0; const errs: string[] = [];
p.on('console', (m) => { if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(m.text())) { errors++; if (errs.length < 4) errs.push(m.text().slice(0, 140)); } });
p.on('pageerror', (e) => { errors++; errs.push('PAGEERROR ' + e.message.slice(0, 160)); });
await p.addInitScript(`window.__HOLD_RUN = ${process.env.HOLD_RUN === '1'};`);
await p.addInitScript(`(() => {
  const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
})()`);
await p.goto(`${BASE}/dev/mode/${MODE}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(9000);
const start = p.locator('text=/^START$/').first();
if (await start.count()) { await start.click(); await p.waitForTimeout(3500); }
// Bind the spine ONCE (the bind-once rule: re-resolving nodes every frame picks up a different body after a swap),
// then cut hard left/right and sample the bones' roll every frame.
await p.evaluate(`(() => {
  const scene = window.__FEL_DEV__.scene;
  const pad = window.__PAD;
  const bare = (n) => n.replace(/^mixamorig:/, '').replace(/_c\\d+$/, '').replace(/_p\\d+$/, '');
  const topOf = (n) => { let c = n; while (c.parent) c = c.parent; return c; };
  const hero = window.__FEL_DEV__.hero();
  const hr = hero ? topOf(hero) : null;
  const under = (n, root) => { for (let c = n; c; c = c.parent) if (c === root) return true; return false; };
  const node = (name) => scene.transformNodes.find((n) => bare(n.name) === name && (!hr || under(n, hr)));
  const S1 = node('Spine1'), S2 = node('Spine2'), HD = node('Head');
  window.__PB = { bound: { s1: !!S1, s2: !!S2, hd: !!HD }, roll1: [], roll2: [], rollHead: [], frames: 0 };
  const rollOf = (n) => {
    if (!n) return 0;
    // the bone's own euler z, which is the axis the stance triple's third slot writes
    if (n.rotationQuaternion) { const e = n.rotationQuaternion.toEulerAngles(); return e.z; }
    return n.rotation.z;
  };
  scene.onBeforeRenderObservable.add(() => {
    window.__PB.frames++;
    window.__PB.roll1.push(rollOf(S1));
    window.__PB.roll2.push(rollOf(S2));
    window.__PB.rollHead.push(rollOf(HD));
    if (window.__PB.roll1.length > 4000) { window.__PB.roll1.shift(); window.__PB.roll2.shift(); window.__PB.rollHead.shift(); }
  });
  // HARD CUTS: full stick, reversing every ~700 ms. That is a real lateral acceleration, not a drift.
  let t = 0, dir = 1;
  const press = (i, v) => { pad.buttons[i] = { pressed: v > 0.1, touched: v > 0.1, value: v }; pad.timestamp = performance.now(); };
  window.__PBI = setInterval(() => {
    t += 60;
    if (t % 700 < 60) dir = -dir;
    pad.axes[0] = dir; pad.axes[1] = -0.4;
    // The dunk runway only RUNS while the run is held, so with no button held the approach update never ticks and
    // the tracker is never fed — measured: spine1 roll exactly 0.00 over 3301 frames.
    if (window.__HOLD_RUN) press(7, 1);
    pad.timestamp = performance.now();
  }, 60);
})()`);
await p.waitForTimeout(MAXMS);
const pb = await p.evaluate(`(() => {
  const d = window.__PB;
  const deg = (r) => r * 180 / Math.PI;
  const span = (a) => a.length ? (Math.max(...a) - Math.min(...a)) : 0;
  const peak = (a) => a.length ? Math.max(...a.map(Math.abs)) : 0;
  return {
    bound: d.bound, frames: d.frames,
    s1SpanDeg: deg(span(d.roll1)), s2SpanDeg: deg(span(d.roll2)), headSpanDeg: deg(span(d.rollHead)),
    s1PeakDeg: deg(peak(d.roll1)), s2PeakDeg: deg(peak(d.roll2)),
  };
})()`) as Record<string, unknown>;
await p.evaluate('clearInterval(window.__PBI)');
console.log('mode: ' + MODE);
console.log('bones bound: ' + JSON.stringify(pb.bound) + ' over ' + pb.frames + ' frames');
console.log('SPINE ROLL swept (deg):  spine1 ' + Number(pb.s1SpanDeg).toFixed(2) + '  spine2 ' + Number(pb.s2SpanDeg).toFixed(2) + '  head ' + Number(pb.headSpanDeg).toFixed(2));
console.log('peak |roll| (deg):       spine1 ' + Number(pb.s1PeakDeg).toFixed(2) + '  spine2 ' + Number(pb.s2PeakDeg).toFixed(2));
console.log('errors: ' + errors + (errs.length ? ' :: ' + errs.join(' | ') : ''));
await b.close();
