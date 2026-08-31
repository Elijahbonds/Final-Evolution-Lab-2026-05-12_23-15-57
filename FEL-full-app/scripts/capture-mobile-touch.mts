// Phase 5 + Phase 9 — drive the mode on a MOBILE viewport using TOUCH ONLY.
//
// The keyboard audit proves the mode works; it does not prove the shipping
// input path works. Dunk is a touch-first mode reached from a phone via /try,
// and its verbs (CHARGE hold, SLAM, STYLE) go through TouchOverlay -> InputBus,
// not through the keyboard branch. Those are different code paths, and the
// Karate VS bug is the standing proof that a broken touch path degrades
// silently rather than failing.
//
// This is emulation, not hardware: a real device also answers questions about
// thermals, GPU and actual touch latency that this cannot.

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = process.env.OUT_DIR ?? 'docs/shots/mobile';
const URL = process.env.URL ?? 'http://localhost:3000/try';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },       // iPhone 14-ish
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});

const logs: string[] = [];
page.on('console', (m) => { if (m.type() === 'error' || /FEL-/.test(m.text())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 30_000 });
const text = async () => (await page.evaluate<string>('document.body.innerText')).replace(/\n+/g, ' | ');

await page.getByText(/TAP TO START/i).first().tap().catch(async () => {
  await page.getByText(/TAP TO START/i).first().click({ force: true });
});
await page.waitForTimeout(4500);
await page.screenshot({ path: `${OUT}/01-mobile-approach.png` });

// TOUCH ONLY from here. Hold CHARGE with a real touch, then tap SLAM.
const tapVerb = async (label: string) => {
  const el = page.locator(`text=/^${label}$/`).first();
  const box = await el.boundingBox();
  if (!box) throw new Error(`verb ${label} not found on the mobile layout`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const charge = await tapVerb('CHARGE');
const slam = await tapVerb('SLAM');
console.log(`touch targets: CHARGE ${JSON.stringify(charge)}  SLAM ${JSON.stringify(slam)}`);

// Hold CHARGE with REAL touch input via CDP. TouchOverlay binds React
// onPointerDown/onPointerUp, and the browser only synthesizes pointer events
// from genuine input — a hand-built TouchEvent dispatched through
// element.dispatchEvent produces no pointer event at all, so the overlay never
// sees it. That is a testing artefact, not a bug in the overlay, and it is
// exactly the trap that makes "I sent an event" a worthless proof.
const cdp = await page.context().newCDPSession(page);
const touch = async (type: 'touchStart' | 'touchEnd', x?: number, y?: number) => {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x: x!, y: y!, radiusX: 12, radiusY: 12, force: 1 }],
  });
};

await touch('touchStart', charge.x, charge.y);
await page.waitForTimeout(1400);
await page.screenshot({ path: `${OUT}/02-mobile-charged.png` });
await touch('touchEnd');

for (let i = 0; i < 20; i++) {
  await touch('touchStart', slam.x, slam.y);
  await page.waitForTimeout(30);
  await touch('touchEnd');
  await page.waitForTimeout(30);
}
await page.waitForTimeout(2600);
await page.screenshot({ path: `${OUT}/03-mobile-judging.png` });
console.log('after touch dunk:', (await text()).slice(0, 240));

const errs = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
console.log(`\nerrors: ${errs.length}`);
for (const l of [...new Set(errs)].slice(0, 8)) console.log('  ·', l.slice(0, 170));
await browser.close();
