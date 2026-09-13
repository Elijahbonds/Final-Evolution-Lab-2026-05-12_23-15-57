// HOOPS-LIVE-BALL probe — does the iron actually answer a miss, and does anybody come down with it?
//
// The claim under test is not "the code runs". It is: a missed jumper CONTACTS THE RING, the
// deflection is named (front/back/left/right), the loose ball is then SECURED BY A BODY, and an
// offensive board becomes a PUTBACK instead of a teleport to the check. Plus the regression that
// matters most: the possession loop must never stall waiting on a board.
//
// Drives /dev/mode/onevone through a pre-boot fake pad (the live-pad rule). Offence shoots as early
// as it can every possession, which is the EARLY release — a short miss, off the front iron.
//
// env: BASE (http://localhost:3061) MAXMS (150000)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const MODE = process.env.MODE ?? 'onevone';   // onevone | threevthree
const MAXMS = Number(process.env.MAXMS ?? 150000);
const exe = (() => {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
})();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const rim: string[] = [], board: string[] = [], banners: string[] = [];
let errors = 0;
p.on('console', (m) => {
  const x = m.text();
  if (/\[(1V1|3V3)-RIM\]/.test(x)) rim.push(x);
  if (/\[(1V1|3V3)-BOARD\]/.test(x)) board.push(x);
  if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(x)) errors++;
});
p.on('pageerror', (e) => { errors++; console.log('PAGEERROR', e.message.slice(0, 160)); });
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

// The driver: on offence, squeeze the shot trigger and let go almost at once (EARLY → short miss).
// On defence, do nothing — the AI will shoot and miss on its own, which exercises the other end's board.
await p.evaluate(`(() => {
  window.__BN = [];
  const pad = window.__PAD;
  const press = (i, v) => { pad.buttons[i] = { pressed: v > 0.1, touched: v > 0.1, value: v }; pad.timestamp = performance.now(); };
  let t = 0, phase = 0;
  const scene = window.__FEL_DEV__.scene;
  const topOf = (n) => { let c = n; while (c.parent) c = c.parent; return c; };
  const ballMesh = () => scene.getMeshByName('ball');
  // the stick is CAMERA-RELATIVE (OneVOneMode.camRel), so solve the pad axes from the camera's flat basis
  const axesToward = (tx, tz, hx, hz) => {
    const cam = scene.activeCamera; if (!cam) return [0, 0];
    const f = cam.getForwardRay ? cam.getForwardRay().direction.clone() : null; if (!f) return [0, 0];
    f.y = 0; const fl = Math.hypot(f.x, f.z); if (fl < 1e-4) return [0, 0];
    f.x /= fl; f.z /= fl;
    const rx = -f.z, rz = f.x;                       // camera right on the flat
    const dx = tx - hx, dz = tz - hz;
    const dl = Math.hypot(dx, dz); if (dl < 1e-4) return [0, 0];
    const nx = dx / dl, nz = dz / dl;
    return [nx * rx + nz * rz, -(nx * f.x + nz * f.z)];   // stick y is inverted
  };
  window.__DRVI = setInterval(() => {
    t += 50;
    // CHASE THE LOOSE BALL. Whenever the ball has no parent bone it is live on the floor — go and get
    // it, which is the whole point of a live board and the only way to prove a PUTBACK.
    const bm = ballMesh(); const hero = window.__FEL_DEV__.hero();
    let chasing = false;
    if (bm && hero && !bm.parent) {
      const hr = topOf(hero); const hp = hr.getAbsolutePosition(); const bp = bm.getAbsolutePosition();
      if (Math.hypot(bp.x - hp.x, bp.z - hp.z) > 0.4) {
        const [ax, ay] = axesToward(bp.x, bp.z, hp.x, hp.z);
        pad.axes[0] = ax; pad.axes[1] = ay; pad.timestamp = performance.now();
        chasing = true;
      }
    }
    if (!chasing) { pad.axes[0] = 0; pad.axes[1] = 0; }
    // read the HUD banner the dev page renders as JSON text
    try {
      const txt = document.body.innerText;
      const m = txt.match(/"banner"\\s*:\\s*"([^"]*)"/);
      if (m && m[1] && window.__BN[window.__BN.length - 1] !== m[1]) window.__BN.push(m[1]);
    } catch (e) {}
    // RT (7) = shoot. A 150 ms hold is read as a PUMP FAKE (correctly — isPumpFake), so the hero never
    // actually shot. Tap it for ONE tick to start the rise, then let go and let the meter run all the
    // way out: the mode auto-releases at t>=1, which is WAY LATE — a long miss, off the back iron.
    phase = (phase + 1) % 70;          // 3.5 s: the meter, the arc, and a board all have to fit
    if (phase === 0) press(7, 1);
    else if (phase === 1) press(7, 0);
  }, 50);
})()`);
await p.waitForTimeout(MAXMS);
const bn = await p.evaluate('window.__BN') as string[];
await p.evaluate('clearInterval(window.__DRVI)');
console.log('=== RIM CONTACTS (' + rim.length + ')');
for (const r of rim.slice(0, 24)) console.log('  ' + r);
console.log('=== BOARD EVENTS (' + board.length + ')');
for (const r of board.slice(0, 30)) console.log('  ' + r);
console.log('=== BANNERS (' + bn.length + ')');
console.log('  ' + bn.filter((x) => x).join(' | ').slice(0, 1400));
console.log('errors: ' + errors);
await b.close();
