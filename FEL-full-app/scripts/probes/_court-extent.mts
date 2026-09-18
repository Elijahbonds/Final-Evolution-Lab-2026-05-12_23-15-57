import { chromium } from 'playwright-core';
import fs from 'node:fs';
const exe = (() => { const r = process.env.HOME + '/Library/Caches/ms-playwright';
  const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
  return `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`; })();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle','--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 800, height: 500 } });
await p.goto(`http://localhost:3061/dev/mode/${process.env.MODE ?? 'tennis'}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(11000);
console.log(await p.evaluate(`(() => {
  const s = window.__FEL_DEV__.scene;
  const out = [];
  for (const m of s.meshes) {
    if (!m.isEnabled() || !m.isVisible || m.getTotalVertices() === 0) continue;
    const e = m.getBoundingInfo().boundingBox.extendSizeWorld, c = m.getBoundingInfo().boundingBox.centerWorld;
    if (e.x * 2 < 6 || e.z * 2 < 6) continue;
    out.push({ name: m.name, w: +(e.x*2).toFixed(1), d: +(e.z*2).toFixed(1), cx: +c.x.toFixed(1), cz: +c.z.toFixed(1), y: +c.y.toFixed(2) });
  }
  return out.slice(0, 10);
})()`));
await b.close();
