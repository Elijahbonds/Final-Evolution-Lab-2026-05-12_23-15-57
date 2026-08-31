// Mode audit capture — drives a mode through the SHIPPING route in a real
// browser and reports what the console says while it plays.
//
// This exists because the in-app browser pane runs occluded, and Chrome
// suspends requestAnimationFrame in an occluded renderer. FEL reads analog
// hold-depth from a rAF loop (InputBus.pollPads), so in that pane a charge
// input never registers, the mode never advances, and every screenshot is of a
// game sitting still. Playwright drives a normal renderer at 60fps instead.
//
// Phase 3 wants "no [FEL-FRAME] hero off-screen".
// Phase 9 wants a playthrough through the real route, not a dev harness.
// Both are console questions, so both are answered here.
//
//   URL=http://localhost:3000/try OUT_DIR=docs/shots/x npx tsx scripts/capture-mode-audit.mts

import { chromium, type ConsoleMessage } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = process.env.OUT_DIR ?? 'docs/shots/audit';
const URL = process.env.URL ?? 'http://localhost:3000/try';
const DUNKS = Number(process.env.DUNKS ?? 4);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

const logs: string[] = [];
page.on('console', (m: ConsoleMessage) => {
  const t = m.text();
  if (m.type() === 'error' || m.type() === 'warning' || /FEL-/.test(t)) logs.push(`[${m.type()}] ${t}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 30_000 });
const fps = await page.evaluate<number>(`new Promise(function (res) {
  var n = 0, t0 = performance.now();
  function f() { if (++n < 30) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - t0) / 1000))); }
  requestAnimationFrame(f);
})`);
console.log(`rAF live at ~${fps} fps`);

const shot = async (n: string) => { await page.screenshot({ path: `${OUT}/${n}.png` }); };
const text = async () => (await page.evaluate<string>('document.body.innerText')).replace(/\n+/g, ' | ');

await page.getByText(/TAP TO START/i).first().click({ force: true }).catch(() => {});
await page.waitForTimeout(4500);
await shot('phase-approach');

// Play several dunks end to end — enough to cross a round boundary and reach
// the rival's turn, so every phase of the mode is actually exercised.
for (let d = 0; d < DUNKS; d++) {
  await page.keyboard.down(' ');
  await page.waitForTimeout(1300);
  await page.keyboard.up(' ');
  for (let i = 0; i < 20; i++) { await page.keyboard.press('j'); await page.waitForTimeout(55); }
  await shot(`dunk${d}-flight`);
  await page.waitForTimeout(2600);
  await shot(`dunk${d}-judging`);
  await page.waitForTimeout(4200);
  await shot(`dunk${d}-after`);
  console.log(`  dunk ${d}: ${(await text()).slice(60, 190)}`);
}
await shot('phase-final');

const frameWarn = logs.filter((l) => /FEL-FRAME/.test(l));
const missing = logs.filter((l) => /MISSING CLIP/.test(l));
const errors = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
console.log(`\n[FEL-FRAME] lines ........ ${frameWarn.length}`);
for (const l of frameWarn.slice(0, 6)) console.log('   ·', l.slice(0, 170));
console.log(`MISSING CLIP lines ....... ${missing.length}`);
for (const l of [...new Set(missing)].slice(0, 6)) console.log('   ·', l.slice(0, 170));
console.log(`errors ................... ${errors.length}`);
for (const l of [...new Set(errors)].slice(0, 10)) console.log('   ·', l.slice(0, 170));
await browser.close();
