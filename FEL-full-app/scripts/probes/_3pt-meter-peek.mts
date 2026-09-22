// Phase 7 instrument check: what does the 3PT page expose as the meter? Prints 12 samples of __FEL_QA__.rawHud().
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3011';
const root = process.env.HOME + '/Library/Caches/ms-playwright';
const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
const b = await chromium.launch({ executablePath: `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`${BASE}/dev/mode/threepoint`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 }); await p.waitForTimeout(9000);
const start = p.locator('text=/^START$/').first(); if (await start.count()) { await start.click(); await p.waitForTimeout(3000); }
await p.locator('canvas').first().click({ position: { x: 640, y: 400 } }).catch(() => {});
for (let i = 0; i < 12; i++) {
  const s = await p.evaluate(() => { const n = document.querySelector('div.w-\\[4px\\]') as HTMLElement | null; const bars = document.querySelectorAll('[class*="w-[4px]"]').length; const txt = (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 160); return `needle ${n ? n.style.left : 'none'} bars ${bars} :: ${txt}`; }).catch((e) => 'err ' + e);
  console.log(i, s); await p.waitForTimeout(400);
}
await b.close();
