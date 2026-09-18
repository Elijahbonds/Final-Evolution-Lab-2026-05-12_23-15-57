// SKATE INVERT probe — WHICH axis turns the rider over?
//
// The owner reported "rider invert-detach mid-run" and a screenshot 12 s into a ride shows the body inverted above the
// board on bare ground, while a shot 4 s in shows him upright in the park. So it degrades DURING the run. This samples
// the rider root's three euler angles and its height every frame and reports where they end up.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const MAXMS = Number(process.env.MAXMS ?? 40000);
const exe = (() => {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
})();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
p.on('pageerror', (e) => { errors++; console.log('PAGEERROR ' + e.message.slice(0, 140)); });
await p.addInitScript(`(() => {
  const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
})()`);
await p.goto(`${BASE}/dev/mode/skateboard`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(9000);
const s0 = p.locator('text=/^START$/').first();
if (await s0.count()) { await s0.click(); await p.waitForTimeout(3000); }
await p.evaluate(`(() => {
  const pad = window.__PAD;
  window.__SI = { samples: [], haveDev: !!(window.__FEL_DEV__ && window.__FEL_DEV__.skate) };
  const scene = window.__FEL_DEV__.scene;
  let t = 0;
  scene.onBeforeRenderObservable.add(() => {
    t++;
    if (t % 30) return;
    // The MODE'S OWN dev readout: it publishes the rig's pos and rot directly, which beats guessing which node is the
    // rider and whether it uses .rotation or .rotationQuaternion.
    const d = window.__FEL_DEV__.skate ? window.__FEL_DEV__.skate() : null;
    if (!d) return;
    const deg = (r) => +(r * 180 / Math.PI).toFixed(1);
    window.__SI.samples.push({
      t: Math.round(t / 60), x: deg(d.rot.x), y: deg(d.rot.y), z: deg(d.rot.z),
      py: +d.pos.y.toFixed(2), pz: +d.pos.z.toFixed(1),
      air: d.air ?? null, grind: d.grind ?? null, speed: d.speed !== undefined ? +Number(d.speed).toFixed(2) : null,
    });
  });
  setInterval(() => { pad.axes[1] = -1; pad.timestamp = performance.now(); }, 60);
})()`);
await p.waitForTimeout(MAXMS);
const si = await p.evaluate('window.__SI') as { samples: Record<string, number>[] };
console.log('dev readout present: ' + (si as unknown as {haveDev:boolean}).haveDev);
console.log('rig euler (deg) + height over the run:');
for (const s of si.samples) console.log(`  t${s.t}s  x ${s.x}  y ${s.y}  z ${s.z}   posY ${s.py}  posZ ${s.pz}  speed ${s.speed}`);
console.log('errors: ' + errors);
await b.close();
