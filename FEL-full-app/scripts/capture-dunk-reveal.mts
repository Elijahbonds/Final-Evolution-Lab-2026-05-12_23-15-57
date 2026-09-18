// Visual capture — the five-judge reveal, on a REAL browser at real frame rate.
//
// Why this exists: the in-app browser pane runs occluded, and Chrome suspends
// requestAnimationFrame in an occluded renderer. The dunk charge ramp lives in
// a rAF loop (InputBus.pollPads emits the analog hold-depth there), so in that
// pane the mode simply cannot be driven — the charge never registers and no
// dunk ever happens. Screenshots of it are therefore screenshots of a game
// sitting still, which prove nothing about a reveal.
//
// Playwright drives a normal visible-to-the-page Chromium instead, so rAF runs
// and the mode behaves exactly as it does for a player.

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = process.env.OUT_DIR ?? 'docs/shots/dunk';
const URL = process.env.URL ?? 'http://localhost:3000/try';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
page.on('console', (m) => { if (m.type() === 'error') console.log('  [page error]', m.text().slice(0, 160)); });

console.log('→', URL);
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 30_000 });

// confirm rAF is actually running before trying to play — the whole point
// NB: these run as STRINGS. tsx compiles with esbuild, which injects a `__name`
// helper around named arrow functions — that helper does not exist in the page,
// so a normal closure here dies with "__name is not defined".
const fps = await page.evaluate<number>(`new Promise(function (res) {
  var n = 0, t0 = performance.now();
  function f() { if (++n < 30) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - t0) / 1000))); }
  requestAnimationFrame(f);
})`);
console.log(`   rAF is live at ~${fps} fps`);
if (fps < 15) { console.error('   frame rate too low to drive the mode'); await browser.close(); process.exit(1); }

const shot = async (name: string) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`   ✎ ${OUT}/${name}.png`);
};
const text = async () => (await page.evaluate<string>('document.body.innerText')).replace(/\n+/g, ' | ');

// START
await page.getByText(/TAP TO START/i).first().click({ force: true }).catch(() => {});
await page.waitForTimeout(4500);            // ride out the 3-2-1
await shot('01-approach');

// CHARGE: hold space so InputBus ramps the analog depth, then release to launch
await page.keyboard.down(' ');
await page.waitForTimeout(1300);            // ramp is 0→1 over 1.1s
await shot('02-charged');
await page.keyboard.up(' ');

// SLAM: tap A (j) across the flight so the QTE window is hit. Shoot the flight
// densely — this is the stretch the authored dunk clips drive, and the whole
// reason the mode exists. Sub-100ms spacing because a dunk is ~2s long.
for (let i = 0; i < 22; i++) {
  await page.keyboard.press('j');
  if (i < 14) await shot(`02b-flight-${String(i).padStart(2, '0')}`);
  await page.waitForTimeout(55);
}

// The reveal runs 5.1s: confer → 5 cards → drum → total. Sample it.
const seen: string[] = [];
for (let i = 0; i < 22; i++) {
  const t = await text();
  if (/CONFER|Silk|Doc|Mac|Reign|Prime|FIFTY|TOTAL/i.test(t)) {
    seen.push(t.slice(0, 220));
    await shot(`03-reveal-${String(i).padStart(2, '0')}`);
  }
  await page.waitForTimeout(400);
}
await shot('04-after');
console.log('\nreveal frames captured:', seen.length);
for (const s of seen.slice(0, 12)) console.log('   ·', s);
await browser.close();
