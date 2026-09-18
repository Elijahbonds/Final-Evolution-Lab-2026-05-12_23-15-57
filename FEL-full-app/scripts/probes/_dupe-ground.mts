import { chromium } from 'playwright-core';
import fs from 'node:fs';
const MODE = process.env.MODE ?? 'football';
const exe = (() => { const r = process.env.HOME + '/Library/Caches/ms-playwright';
  const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
  return `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`; })();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle','--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 900, height: 600 } });
await p.goto(`http://localhost:3061/dev/mode/${MODE}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(10000);
const s0 = p.locator('text=/^START$/').first();
if (await s0.count()) { await s0.click(); await p.waitForTimeout(2500); }
console.log(await p.evaluate(`(() => {
  const s = window.__FEL_DEV__.scene;
  const chain = (m) => { const out = []; let n = m; while (n) { out.push(n.name); n = n.parent; } return out.join(' < '); };
  return s.meshes.filter(m => /venue_ground|venue_surround/.test(m.name)).map(m => ({
    name: m.name, parents: chain(m).slice(0, 120), visible: m.isVisible,
    size: [+(m.getBoundingInfo().boundingBox.extendSizeWorld.x*2).toFixed(0), +(m.getBoundingInfo().boundingBox.extendSizeWorld.z*2).toFixed(0)],
    y: +m.getBoundingInfo().boundingBox.centerWorld.y.toFixed(2),
  }));
})()`));
await b.close();
