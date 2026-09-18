// BOARD EYE — look at the board modes, then decide what needs polishing.
//
// env: BASE MODE OUT SECS (14)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const MODE = process.env.MODE ?? 'skateboard';
const OUT = process.env.OUT ?? './shots';
const SECS = Number(process.env.SECS ?? 14);
fs.mkdirSync(OUT, { recursive: true });
const exe = (() => {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
})();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
p.on('pageerror', () => { errors++; });
await p.addInitScript(`(() => {
  const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
})()`);
await p.goto(`${BASE}/dev/mode/${MODE}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(9000);
const start = p.locator('text=/^START$/').first();
if (await start.count()) { await start.click(); await p.waitForTimeout(3000); }
// ride forward so the shot is of the world in motion, not a parked rider
// Ride forward only. The RIGHT TRIGGER is crouch on skate, carve on surf and tuck on snow — holding it folds the
// rider into a ball, and a screenshot of that is a screenshot of the probe, not of the mode.
await p.evaluate(`(() => { const pad = window.__PAD; setInterval(() => { pad.axes[1] = -1; pad.timestamp = performance.now(); }, 60); })()`);
for (let i = 0; i < 3; i++) {
  await p.waitForTimeout((SECS * 1000) / 3);
  await p.screenshot({ path: `${OUT}/${MODE}-${i}.png` });
}
const stats = await p.evaluate(`(() => {
  const s = window.__FEL_DEV__ && window.__FEL_DEV__.scene; if (!s) return null;
  const mats = new Set(), tex = new Set();
  let meshes = 0, untextured = 0;
  for (const m of s.meshes) {
    if (!m.isEnabled() || !m.isVisible) continue;
    meshes++;
    const mm = m.material; if (!mm) { untextured++; continue; }
    mats.add(mm.name);
    const t = mm.albedoTexture || mm.diffuseTexture;
    if (t) tex.add(t.name || 'tex'); else untextured++;
  }
  return { meshes, materials: mats.size, textures: tex.size, untextured, draws: s.getEngine().drawCalls ?? -1, fps: Math.round(s.getEngine().getFps()) };
})()`);
console.log(MODE + ': ' + JSON.stringify(stats) + '  errors ' + errors);
await b.close();
