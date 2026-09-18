// Mid-EASTBAY capture — the hardest thing in this mode to see.
//
// EASTBAY is the highest-difficulty named trick (3.4) and it fires MID-AIR, in
// the cinematic phase, before the slam window opens. The combo is a held d-pad
// DOWN plus Y (keyboard: ArrowDown + i). The clip runs about a second inside a
// two-second flight, so this shoots every ~70ms from the moment the trick is
// armed and records which frames the mode itself reports as EASTBAY.

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = process.env.OUT_DIR ?? 'docs/shots/eastbay';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const errs: string[] = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto('http://localhost:3000/try', { waitUntil: 'networkidle' });
await page.waitForSelector('canvas');
const text = async () => (await page.evaluate<string>('document.body.innerText')).replace(/\n+/g, ' | ');

await page.getByText(/TAP TO START/i).first().click({ force: true }).catch(() => {});
await page.waitForTimeout(4500);

// Load and launch.
await page.keyboard.down(' ');
await page.waitForTimeout(1300);
await page.keyboard.up(' ');

// Throw EASTBAY AT THE RIM, not at the floor.
// The flight is 1.5s. The eastbay motion itself runs 0.55s (ball under the
// raised knee) to 1.25s (one-hand extension to the rim), and the broadcast
// rim-cam cut fires at 0.69s. Arming it at t=0 — which the first version of
// this script did — plays the trick while the dunker is still leaving the
// floor, half a court from the basket. Wait for him to get up there first.
await page.waitForTimeout(600);
await page.keyboard.down('ArrowDown');
await page.waitForTimeout(40);
await page.keyboard.press('i');

const hits: string[] = [];
for (let i = 0; i < 16; i++) {
  const t = await text();
  const shot = `${OUT}/eastbay-${String(i).padStart(2, '0')}.png`;
  await page.screenshot({ path: shot });
  if (/EASTBAY|COMBO/i.test(t)) hits.push(`${i}: ${(t.match(/(COMBO[^|]*|EASTBAY[^|]*)/i) ?? [''])[0].trim()}`);
  await page.waitForTimeout(60);
}
await page.keyboard.up('ArrowDown');

console.log('frames the mode reported EASTBAY:');
if (hits.length === 0) console.log('  (none — the trick did not fire)');
for (const h of hits) console.log('  ·', h);
console.log('errors:', errs.length);
await browser.close();
