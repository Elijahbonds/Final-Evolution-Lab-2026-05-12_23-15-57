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
import { chromiumExe } from './probes/_chromium.mts';
import { mkdirSync } from 'node:fs';

const OUT = process.env.OUT_DIR ?? 'docs/shots/mobile';
const URL = process.env.URL ?? 'http://localhost:3000/try';
// The verbs are per-mode. This was hard-coded to dunk's CHARGE/SLAM, so pointing
// it at any other mode died on a locator for a button that mode does not have.
// HOLD_VERB is the analog one held with a real touch; TAP_VERB is tapped.
const HOLD_VERB = process.env.HOLD_VERB ?? 'CHARGE';
const TAP_VERB = process.env.TAP_VERB ?? 'SLAM';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: chromiumExe(),
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

// Phase 9 wants the SHIPPING route, and /play/* calls getServerSession and
// redirects to /login without one -- this script previously only ever pointed at
// /try, which is unauthenticated, so aiming it at a real mode page just timed
// out waiting for a canvas that was never going to appear. Same login the
// desktop capture does: through the real form, as an ordinary player.
// networkidle never settles on hosts that long-poll (the Controller Link
// lobby streams KV heartbeats), and /play/threepoint died on exactly that —
// twice. domcontentloaded + the canvas wait below is the real requirement.
await page.goto(URL, { waitUntil: 'domcontentloaded' });
// The /play → /login redirect is CLIENT-side and lands after hydration, so
// page.url() can still read the target here. Detect the login FORM, not the
// URL — the URL check raced and lost twice on the same route.
const email = page.locator('input[type="email"]');
const onLogin = await email.waitFor({ timeout: 8_000 }).then(() => true).catch(() => false);
if (onLogin) {
  // The login inputs are SSR'd — visible before React hydrates them, and a
  // pre-hydration Enter is a no-op (measured: form filled, still /login).
  // /login does not long-poll, so networkidle is safe HERE specifically.
  await page.waitForLoadState('networkidle').catch(() => {});
  await email.fill(process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
  await page.locator('input[type="password"]').fill(process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
  await page.locator('input[type="password"]').press('Enter');
  await page.waitForURL((u) => !/\/login/.test(u.toString()), { timeout: 30_000 }).catch(() => {});
  // let the session cookie commit before the target page's getServerSession
  // runs — navigating the instant the URL flips can land pre-cookie and come
  // straight back to /login (measured: canvas never appears)
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.goto(URL, { waitUntil: 'load' });
}
// NB: this module's own `const URL = process.env.URL` shadows the global URL
// constructor, so `new URL(...)` throws here. Print the href instead.
console.log('route :', page.url());
// Party-night hubs (carnival) gate the canvas behind a START THE NIGHT
// briefing that renders after a client-side shuffle — loop: canvas wins,
// the hub button starts the night. Same beat as capture-mode-play.
const startNight = page.getByText(/START THE NIGHT/i).first();
for (let i = 0; i < 12; i++) {
  // START THE NIGHT router-pushes to the in-run URL — any probe can land
  // mid-navigation and throw "execution context destroyed". Treat that as
  // progress, not failure.
  try {
    if (await page.$('canvas')) break;
  } catch { /* navigating */ }
  try {
    if (await startNight.isVisible()) {
      await startNight.tap().catch(async () => { await startNight.click({ force: true }).catch(() => {}); });
      console.log('hub   : started the night');
      await page.waitForLoadState('load').catch(() => {});
    }
  } catch { /* navigating */ }
  await page.waitForTimeout(1500);
}
await page.waitForSelector('canvas', { timeout: 30_000 });
const text = async () => (await page.evaluate<string>('document.body.innerText')).replace(/\n+/g, ' | ');

await page.getByText(/TAP TO START/i).first().tap().catch(async () => {
  await page.getByText(/TAP TO START/i).first().click({ force: true });
});
await page.waitForTimeout(4500);
await page.screenshot({ path: `${OUT}/01-mobile-approach.png` });

// TOUCH ONLY from here. Hold the analog verb with a real touch, then tap.
const tapVerb = async (label: string) => {
  const el = page.locator(`text=/^${label}$/`).first();
  const box = await el.boundingBox();
  if (!box) throw new Error(`verb ${label} not found on the mobile layout`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const charge = await tapVerb(HOLD_VERB);
const slam = await tapVerb(TAP_VERB);
console.log(`touch targets: ${HOLD_VERB} ${JSON.stringify(charge)}  ${TAP_VERB} ${JSON.stringify(slam)}`);

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
