// THE BLEND SLIDER, driven. A slider that renders is not a slider that changes anything — this picks a
// secondary school, drags the mix, and reads back the blend name and the trait bars at each stop.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const r = process.env.HOME + '/Library/Caches/ms-playwright';
const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
const b = await chromium.launch({ executablePath: `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-gl=angle','--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1000, height: 900 } });
await p.goto('http://localhost:3061/dev/splash/karate', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(14000);
// primary SHARP, then blend with ANCHORED
await p.locator('button', { hasText: /^SHARP$/ }).first().click();
await p.waitForTimeout(400);
await p.locator('button', { hasText: /^ANCHORED$/ }).last().click();
await p.waitForTimeout(500);
const slider = p.locator('input[type=range]');
console.log('slider present:', await slider.count());
for (const v of ['0', '30', '50', '80', '100']) {
  await slider.fill(v);
  await p.waitForTimeout(250);
  const name = await p.locator('input[type=range]').evaluate((el) => el.getAttribute('aria-label'));
  const bars = await p.evaluate(`(() => Array.from(document.querySelectorAll('input[type=range]'))[0]
      .parentElement.querySelectorAll('span[style*="height"]')
      .length)()`);
  console.log(`mix ${v.padStart(3)} -> ${name}   traitBars=${bars}`);
  if (v === '30') await p.screenshot({ path: './shots/splash-blend.png' });
}
// and it is remembered
console.log('stored:', await p.evaluate(`localStorage.getItem('fel-combat-style')`));
await b.close();
