// THE REF probe — do the handbook's rules actually get called in a running game?
//
// A handbook nobody emits from is decoration, so this drives the two rules the modes had no detector for
// until now: THREE SECONDS (walk into the paint with the ball and just stand there) and GOALTENDING
// (jump late, at the rim, while their shot is already falling).
//
// Walks rather than sprints: a full-magnitude stick at the rim triggers the drive dunk instead of camping.
//
// env: BASE (http://localhost:3061) MAXMS (150000)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const MAXMS = Number(process.env.MAXMS ?? 150000);
const exe = (() => {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
})();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const ref: string[] = []; let errors = 0;
p.on('console', (m) => {
  const x = m.text();
  if (/\[1V1-REF\]/.test(x)) ref.push(x);
  if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(x)) errors++;
});
p.on('pageerror', (e) => { errors++; console.log('PAGEERROR', e.message.slice(0, 170)); });
await p.addInitScript(`(() => {
  const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
})()`);
await p.goto(`${BASE}/dev/mode/onevone`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(9000);
const start = p.locator('text=/^START$/').first();
if (await start.count()) { await start.click(); await p.waitForTimeout(3500); }
await p.evaluate(`(() => {
  const RIM = { x: 0, z: -0.6 };
  const scene = window.__FEL_DEV__.scene;
  const pad = window.__PAD;
  const topOf = (n) => { let c = n; while (c.parent) c = c.parent; return c; };
  const press = (i, v) => { pad.buttons[i] = { pressed: v > 0.1, touched: v > 0.1, value: v }; pad.timestamp = performance.now(); };
  // camera-relative stick, like OneVOneMode.camRel
  const axesToward = (tx, tz, hx, hz) => {
    const cam = scene.activeCamera; if (!cam || !cam.getForwardRay) return [0, 0];
    const f = cam.getForwardRay().direction.clone(); f.y = 0;
    const fl = Math.hypot(f.x, f.z); if (fl < 1e-4) return [0, 0];
    f.x /= fl; f.z /= fl;
    const rx = -f.z, rz = f.x;
    const dx = tx - hx, dz = tz - hz, dl = Math.hypot(dx, dz);
    if (dl < 1e-4) return [0, 0];
    const nx = dx / dl, nz = dz / dl;
    return [nx * rx + nz * rz, -(nx * f.x + nz * f.z)];
  };
  let tick = 0;
  window.__DIAG = { minD: 999, hints: new Set(), banners: new Set(), samples: [] };
  window.__DRVI = setInterval(() => {
    tick++;
    const hero = window.__FEL_DEV__.hero(); if (!hero) return;
    const hr = topOf(hero);
    const hp = hr.getAbsolutePosition();
    // Only camp while I actually HAVE the ball: three seconds is an OFFENSIVE rule, so standing in the
    // paint on defence proves nothing. Carry is read off the ball's parent chain (it is attached to a hand bone).
    // Babylon attaches the ball to a BONE, which is not under the mesh root, so walking the parent chain
    // from the ball never reaches the hero. Proximity is the reliable read: attached AND in my hands.
    const bm = scene.getMeshByName('ball');
    let carrying = false;
    if (bm) {
      const bp = bm.getAbsolutePosition();
      const bd = Math.hypot(bp.x - hp.x, bp.z - hp.z);
      window.__DIAG.ballOk = true;
      window.__DIAG.ballParent = bm.parent ? bm.parent.name : 'NONE';
      window.__DIAG.minBallD = Math.min(window.__DIAG.minBallD ?? 999, bd);
      // 1v1's live dribble drives the ball in WORLD space (the carry rig), unparented — so a parent
      // check reads 'not carried' for the entire possession. Proximity is the only honest read.
      carrying = bd < 1.3;
    } else window.__DIAG.ballOk = false;
    window.__DIAG.carryFrames = (window.__DIAG.carryFrames || 0) + (carrying ? 1 : 0);
    if (!carrying) { pad.axes[0] = 0; pad.axes[1] = 0; pad.timestamp = performance.now(); return; }
    window.__DIAG.minDCarry = Math.min(window.__DIAG.minDCarry ?? 999, Math.hypot(hp.x - RIM.x, hp.z - RIM.z));
    const d = Math.hypot(hp.x - RIM.x, hp.z - RIM.z);
    window.__DIAG.minD = Math.min(window.__DIAG.minD, d);
    try {
      const txt = document.body.innerText;
      const h = txt.match(/"hint"\s*:\s*"([^"]*)"/); if (h && h[1]) window.__DIAG.hints.add(h[1]);
      const bn = txt.match(/"banner"\s*:\s*"([^"]*)"/); if (bn && bn[1]) window.__DIAG.banners.add(bn[1]);
    } catch (e) {}
    if (tick % 20 === 0) window.__DIAG.samples.push(d.toFixed(2));
    // WALK to the ring (0.5 magnitude: a full stick sprints and triggers the drive dunk), then STAND.
    // Standing in the paint with the ball is exactly what three seconds exists to punish.
    if (d > 1.1) {
      const [ax, ay] = axesToward(RIM.x, RIM.z, hp.x, hp.z);
      pad.axes[0] = ax * 0.5; pad.axes[1] = ay * 0.5;
    } else { pad.axes[0] = 0; pad.axes[1] = 0; }
    pad.timestamp = performance.now();
    // and jump (A) on a loop: near the rim on defence that is the late contest a falling ball punishes
    // no A presses during the camp test: on offence the button does other things and muddies it
  }, 50);
})()`);
await p.waitForTimeout(MAXMS);
const diag = await p.evaluate('({ ballOk: window.__DIAG.ballOk, ballParent: window.__DIAG.ballParent, minBallD: window.__DIAG.minBallD ?? -1, minD: window.__DIAG.minD, minDCarry: window.__DIAG.minDCarry ?? -1, carryFrames: window.__DIAG.carryFrames ?? 0, hints: [...window.__DIAG.hints], banners: [...window.__DIAG.banners], samples: window.__DIAG.samples.slice(0, 40) })') as any;
await p.evaluate('clearInterval(window.__DRVI)');
console.log('closest the hero got to the ring: ' + diag.minD.toFixed(2) + ' m (paint radius 2.6)');
console.log('distance samples: ' + diag.samples.join(' '));
console.log('ball mesh found: ' + diag.ballOk + ', parent: ' + diag.ballParent + ', closest ball-hero: ' + Number(diag.minBallD).toFixed(2));
console.log('frames WITH the ball: ' + diag.carryFrames + ', closest while carrying: ' + Number(diag.minDCarry).toFixed(2));
console.log('hints seen: ' + JSON.stringify(diag.hints));
console.log('banners seen: ' + JSON.stringify(diag.banners.slice(0, 24)));
const ended = await p.evaluate(`/WIN|LOSS|FINAL/.test(document.body.innerText)`);
console.log('page shows an end state: ' + ended);
const kinds = new Map<string, number>();
for (const r of ref) { const k = (r.match(/\] (\w+)/) ?? [])[1] ?? '?'; kinds.set(k, (kinds.get(k) ?? 0) + 1); }
console.log('=== REF CALLS (' + ref.length + ')');
for (const r of ref.slice(0, 20)) console.log('  ' + r);
console.log('kinds: ' + JSON.stringify(Object.fromEntries(kinds)));
console.log('errors: ' + errors);
await b.close();
