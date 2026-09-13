// CONTACT DUNK probe — is he dunked ON, or dunked NEXT TO?
//
// Drives hard at the ring with turbo so the drive-dunk gate fires with a body in the lane, and reports the
// [1V1-CONTACT] calls. The claim under test is that a SET body is planted chest-to-chest and goes down at
// the FLUSH, while a late body is only shoved through.
//
// env: BASE (http://localhost:3061) MAXMS (120000)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const MAXMS = Number(process.env.MAXMS ?? 120000);
const exe = (() => {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
})();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const hits: string[] = []; let errors = 0;
p.on('console', (m) => {
  const x = m.text();
  if (/\[1V1-CONTACT\]/.test(x)) hits.push(x);
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
// Use the mode's own probe seam (scene.metadata.onevone.poster) to set the geometry a poster needs — my
// possession, a run-up, and a defender ON HIS FEET between me and the ring — then squeeze the shot input,
// which is what consults checkDriveDunk. Driving into him by brute force keeps him stunned and 1v1 passes a
// null defender while stunned, so the contest reads "no defender" and no poster can ever happen.
const ATTEMPTS = Number(process.env.ATTEMPTS ?? 6);
for (let i = 0; i < ATTEMPTS; i++) {
  // HOLD the stick at the ring while the seam runs: with the stick centred, turbo decays and the dribble
  // velocity bleeds off within a frame or two, so by the time the trigger is squeezed the drive-dunk gate's
  // speed and turbo minimums are no longer met and nothing fires (measured: geometry set 6 times, 0 dunks).
  await p.evaluate(`(() => {
    const RIM = { x: 0, z: -0.6 };
    const scene = window.__FEL_DEV__.scene;
    const pad = window.__PAD;
    const topOf = (n) => { let c = n; while (c.parent) c = c.parent; return c; };
    const hero = window.__FEL_DEV__.hero(); if (!hero) return;
    const hp = topOf(hero).getAbsolutePosition();
    const cam = scene.activeCamera;
    const f = cam.getForwardRay().direction.clone(); f.y = 0;
    const fl = Math.hypot(f.x, f.z); f.x /= fl; f.z /= fl;
    const rx = -f.z, rz = f.x;
    const dx = RIM.x - hp.x, dz = RIM.z - hp.z, dl = Math.hypot(dx, dz) || 1;
    const nx = dx / dl, nz = dz / dl;
    pad.axes[0] = nx * rx + nz * rz;
    pad.axes[1] = -(nx * f.x + nz * f.z);
    pad.timestamp = performance.now();
  })()`);
  const ok = await p.evaluate(`window.__FEL_DEV__.scene.metadata.onevone.poster()`);
  if (!ok) { console.log('seam refused (mode ended?)'); break; }
  // RUN UP with the stick held: the dribble controller integrates its own velocity, so the drive-dunk
  // speed minimum is only met by actually accelerating into the ring.
  await p.waitForTimeout(700);
  // squeeze the shot: inside the shot-start branch checkDriveDunk turns this into the dunk
  await p.evaluate(`(() => { const b = window.__PAD.buttons; b[7] = { pressed: true, touched: true, value: 1 }; window.__PAD.timestamp = performance.now(); })()`);
  await p.waitForTimeout(90);
  await p.evaluate(`(() => { const b = window.__PAD.buttons; b[7] = { pressed: false, touched: false, value: 0 }; window.__PAD.timestamp = performance.now(); })()`);
  await p.waitForTimeout(3200);   // the flight, the flush, the fall
  await p.evaluate(`(() => { window.__PAD.axes[0] = 0; window.__PAD.axes[1] = 0; window.__PAD.timestamp = performance.now(); })()`);
}

const kinds = new Map<string, number>();
for (const h of hits) {
  for (const k of ['body_bag', 'poster', 'through', 'clean']) if (h.includes(k)) { kinds.set(k, (kinds.get(k) ?? 0) + 1); break; }
}
console.log('=== CONTACT CALLS (' + hits.length + ')');
for (const h of hits.slice(0, 18)) console.log('  ' + h);
console.log('kinds: ' + JSON.stringify(Object.fromEntries(kinds)));
console.log('planted chest-to-chest: ' + hits.filter((h) => /planted chest to chest/.test(h)).length);
console.log('victims went down: ' + hits.filter((h) => /victim goes down/.test(h)).length);
console.log('errors: ' + errors);
await b.close();
