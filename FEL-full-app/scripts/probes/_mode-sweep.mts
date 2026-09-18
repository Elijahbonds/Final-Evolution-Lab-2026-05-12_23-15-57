// MODE SWEEP — boot every enabled mode and report what is wrong with it.
//
// The cheap broad net: does it boot, does it error, how many draws, is anything floating, are there visible
// capsule bodies. Anything that stands out gets a focused probe of its own.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const MODES = (process.env.MODES ?? '').split(',').filter(Boolean);
const exe = (() => { const r = process.env.HOME + '/Library/Caches/ms-playwright';
  const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
  return `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`; })();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle','--use-angle=metal'] });
for (const mode of MODES) {
  const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
  let errors = 0; const errText: string[] = [];
  p.on('pageerror', (e) => { errors++; if (errText.length < 2) errText.push(e.message.slice(0, 90)); });
  p.on('console', (m) => { const t = m.text();
    if (m.type() === 'error' && !/401|favicon|Graphics were reset/.test(t)) { errors++; if (errText.length < 2) errText.push(t.slice(0, 90)); } });
  try {
    await p.goto(`${BASE}/dev/mode/${mode}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('canvas', { timeout: 120000 });
    await p.waitForTimeout(11000);
    const s0 = p.locator('text=/^START$/').first();
    if (await s0.count()) { await s0.click(); await p.waitForTimeout(3500); }
    const r = await p.evaluate(`(() => {
      const s = window.__FEL_DEV__ && window.__FEL_DEV__.scene; if (!s) return { boot: 'NO SCENE' };
      const caps = s.meshes.filter(m => /^(torso|head|leg|arm)$/.test(m.name) && m.isEnabled() && m.isVisible).length;
      const txt = document.body.innerText;
      const draws = /draws (\\d+)/.exec(txt);
      const over = /⚠ draws (\\d+) > (\\d+)/.exec(txt);
      const bodies = s.skeletons.length;
      return { boot: 'ok', draws: draws ? +draws[1] : null, over: over ? over[1] + '>' + over[2] : null,
               bodies, capsules: caps, meshes: s.meshes.length };
    })()`);
    console.log(`${mode.padEnd(20)} ${JSON.stringify(r)} err=${errors}${errText.length ? ' :: ' + errText[0] : ''}`);
  } catch (e) { console.log(`${mode.padEnd(20)} FAILED ${(e as Error).message.slice(0, 70)}`); }
  await p.close();
}
await b.close();
