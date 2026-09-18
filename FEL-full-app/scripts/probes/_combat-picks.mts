// THE PICKS REACH THE LIVE FIGHT. Boot each combat mode with a weapon and a style in the URL and confirm the
// mode comes up clean — a style that only exists in a unit test is a style nobody is fighting with.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const r = process.env.HOME + '/Library/Caches/ms-playwright';
const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
const b = await chromium.launch({ executablePath: `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-gl=angle','--use-angle=metal'] });
for (const job of (process.env.JOBS ?? '').split(';').filter(Boolean)) {
  const [mode, qs] = job.split('?');
  const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  const errs: string[] = [];
  const notes: string[] = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
  p.on('console', (m) => { const t = m.text(); if (/\[KE-STYLE\]/.test(t)) notes.push(t); });
  try {
    await p.goto(`http://localhost:3061/dev/mode/${mode}?${qs ?? ''}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('canvas', { timeout: 240000 });
    await p.waitForTimeout(12000);
    const s0 = p.locator('text=/^START$/').first();
    if (await s0.count()) { await s0.click(); await p.waitForTimeout(3500); }
    const out = await p.evaluate(`(() => {
      const s = window.__FEL_DEV__.scene;
      return {
        meshes: s.meshes.length, skeletons: s.skeletons.length,
        props: s.meshes.filter((m) => /staff|blade|gauntlet|weapon/i.test(m.name)).map((m) => m.name),
        playing: s.animationGroups.filter((g) => g.isPlaying).length,
      };
    })()`);
    console.log(job.padEnd(52), JSON.stringify(out), 'err=' + errs.length, errs[0] ?? '');
    for (const n of notes) console.log('   ', n);
  } catch (e) { console.log(job.padEnd(52), 'FAILED', String(e).slice(0, 110)); }
  await p.close();
}
await b.close();
