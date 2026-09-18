// Are there PRIMITIVE stand-in bodies in any live mode? (owner: "only humanoids that move well")
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const exe = (() => { const r = process.env.HOME + '/Library/Caches/ms-playwright';
  const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
  return `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`; })();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle','--use-angle=metal'] });
for (const MODE of (process.env.MODES ?? 'tennis,derby,penalty,h2h,football,who_scene_it').split(',')) {
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  try {
    await p.goto(`http://localhost:3061/dev/mode/${MODE}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('canvas', { timeout: 120000 });
    await p.waitForTimeout(11000);
    const s0 = p.locator('text=/^START$/').first();
    if (await s0.count()) { await s0.click(); await p.waitForTimeout(2500); }
    const r = await p.evaluate(`(() => {
      const s = window.__FEL_DEV__ && window.__FEL_DEV__.scene; if (!s) return { err: 'no scene' };
      const prim = s.meshes.filter(m => /^(torso|head|leg|arm)$/.test(m.name));
      const visible = prim.filter(m => m.isEnabled() && m.isVisible);
      const actors = s.transformNodes.filter(n => /^actor_/.test(n.name));
      return { primitiveBodyParts: prim.length, visibleParts: visible.length, actorNodes: actors.map(a => a.name).slice(0, 8) };
    })()`);
    console.log(`${MODE.padEnd(14)} ${JSON.stringify(r)}`);
  } catch (e) { console.log(`${MODE.padEnd(14)} FAILED ${(e as Error).message.slice(0, 60)}`); }
  await p.close();
}
await b.close();
