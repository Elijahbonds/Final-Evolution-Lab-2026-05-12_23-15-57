// SNOW DRAW BUDGET — the mode flags `draws 786 > 600` against its own budget. What is drawing?
//
// Groups every enabled, visible mesh by a name stem and reports the biggest contributors, plus how many are already
// instanced. Guessing which props to batch is how you spend an afternoon batching the wrong ones.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const MODE = process.env.MODE ?? 'snowboard_slalom';
const exe = (() => {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
})();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.addInitScript(`(() => {
  const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
})()`);
await p.goto(`${BASE}/dev/mode/${MODE}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(9000);
const s0 = p.locator('text=/^START$/').first();
if (await s0.count()) { await s0.click(); await p.waitForTimeout(4000); }
await p.evaluate(`(() => { const pad = window.__PAD; setInterval(() => { pad.axes[1] = -1; pad.timestamp = performance.now(); }, 60); })()`);
await p.waitForTimeout(6000);
const out = await p.evaluate(`(() => {
  const s = window.__FEL_DEV__.scene;
  const stem = (n) => n.replace(/[._-]?\\d+$/, '').replace(/_c\\d+|_p\\d+/g, '');
  const groups = {};
  let visible = 0, instanced = 0, thin = 0;
  for (const m of s.meshes) {
    if (!m.isEnabled() || !m.isVisible) continue;
    const verts = m.getTotalVertices ? m.getTotalVertices() : 0;
    if (!verts) continue;
    visible++;
    const isInst = m.getClassName && m.getClassName() === 'InstancedMesh';
    if (isInst) instanced++;
    if (m.thinInstanceCount > 0) thin++;
    const k = stem(m.name);
    groups[k] = groups[k] || { n: 0, inst: 0, thin: 0 };
    groups[k].n++;
    if (isInst) groups[k].inst++;
    if (m.thinInstanceCount > 0) groups[k].thin += m.thinInstanceCount;
  }
  const top = Object.entries(groups).sort((a, b2) => b2[1].n - a[1].n).slice(0, 14);
  return { draws: s.getEngine().drawCalls, visible, instanced, thin, top };
})()`);
console.log(JSON.stringify(out, null, 1));
await b.close();
