// DRAW BUDGET — what does each mode actually cost, and which venue is the expensive one?
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const exe = (() => { const r = process.env.HOME + '/Library/Caches/ms-playwright';
  const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
  return `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`; })();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
for (const spec of (process.env.SPECS ?? 'skateboard:venice-park,skateboard:city-plaza,skateboard:warehouse,snowboard_slalom:alpine-run,surf:the-break').split(',')) {
  const [mode, venue] = spec.split(':');
  const p = await b.newPage({ viewport: { width: 1000, height: 640 } });
  try {
    await p.goto(`${BASE}/dev/mode/${mode}${venue ? '?venue=' + venue : ''}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('canvas', { timeout: 120000 });
    await p.waitForTimeout(11000);
    const s0 = p.locator('text=/^START$/').first();
    if (await s0.count()) { await s0.click(); await p.waitForTimeout(3000); }
    const r = await p.evaluate(`(() => {
      const s = window.__FEL_DEV__ && window.__FEL_DEV__.scene; if (!s) return null;
      const e = s.getEngine();
      const vis = s.meshes.filter(m => m.isEnabled() && m.isVisible);
      const thin = vis.filter(m => m.thinInstanceCount > 0);
      const byName = {};
      for (const m of vis) { const k = m.name.replace(/[_.]?\\d+$/, '').slice(0, 22); byName[k] = (byName[k] || 0) + 1; }
      const top = Object.entries(byName).sort((a,b) => b[1]-a[1]).slice(0, 6).map(([k,n]) => k + 'x' + n);
      return { draws: e.drawCalls !== undefined ? e.drawCalls : null, meshes: s.meshes.length, visible: vis.length,
               thinMasters: thin.length, thinInstances: thin.reduce((t,m) => t + m.thinInstanceCount, 0), top };
    })()`);
    console.log(`${spec.padEnd(28)} ${JSON.stringify(r)}`);
  } catch (e) { console.log(`${spec.padEnd(28)} FAILED ${(e as Error).message.slice(0, 60)}`); }
  await p.close();
}
await b.close();
