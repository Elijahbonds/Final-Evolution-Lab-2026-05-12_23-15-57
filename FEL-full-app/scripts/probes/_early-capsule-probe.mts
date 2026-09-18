// Are capsule stand-ins visible in the FIRST SECONDS of a mount? That is the window the 2.5 s auto-hide
// left open, and the one a player actually sees.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const MODE = process.env.MODE ?? 'tennis';
const exe = (() => { const r = process.env.HOME + '/Library/Caches/ms-playwright';
  const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
  return `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`; })();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle','--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 800, height: 500 } });
await p.goto(`http://localhost:3061/dev/mode/${MODE}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
// poll from the moment a scene exists — the old auto-hide fired at 2.5 s, so sample well inside that
const seen: string[] = [];
for (let i = 0; i < 40; i++) {
  const r = await p.evaluate(`(() => {
    const s = window.__FEL_DEV__ && window.__FEL_DEV__.scene; if (!s) return null;
    const parts = s.meshes.filter(m => /^(torso|head|leg|arm)$/.test(m.name));
    return { total: parts.length, visible: parts.filter(m => m.isEnabled() && m.isVisible).length };
  })()`);
  if (r) seen.push(`${(i * 0.25).toFixed(2)}s:${r.visible}/${r.total}`);
  await p.waitForTimeout(250);
}
const anyVisible = seen.some((s) => !/:0\//.test(s));
console.log(MODE, 'samples:', seen.filter((_, i) => i % 6 === 0).join(' '));
console.log(MODE, anyVisible ? 'CAPSULES WERE VISIBLE at some point' : 'never visible — clean');
await b.close();
