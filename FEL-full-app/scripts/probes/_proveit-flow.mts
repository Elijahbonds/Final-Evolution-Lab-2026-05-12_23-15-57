// _proveit-flow — the one game on the card that has no pad (scorecard, 2026-09-15).
//
// /play/dunkduel is PROVE IT: a real-camera head-to-head judged by on-device pose tracking. The scorecard's Controls,
// Logic and Body categories are written for a pad and a rig, and this game has neither — it has scored N/A on all six
// since rc10, which is not a pass and is not a judgement either. What CAN be measured, and is what the game lives or
// dies on, is the FLOW: does the page come up, does consent actually reach the camera, does the tracker start, and does
// the judge panel arrive — with no console errors on the way.
//
// Chromium's fake capture device plays a synthetic pattern, so no pose is ever found and no dunk is ever judged: the
// run stops at "armed, tracking, waiting for a body". That boundary is stated in the result rather than papered over.
//   BASE=http://127.0.0.1:3096 TAG=rc20 npx tsx scripts/probes/_proveit-flow.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3096';
const TAG = process.env.TAG ?? 'run';
const OUT = `${process.env.HOME}/Claude/outbox/finish-release/scorecard/${TAG}`;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: chromiumExe(), headless: false,
  args: ['--window-size=1280,860', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-angle=metal'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['camera'] });
const errors: string[] = [];
const page = await ctx.newPage();
// the pose runtime logs its own start-up at error level ("INFO: Created TensorFlow Lite XNNPACK delegate for CPU.") —
// a log LEVEL is not a fault, and counting it cost the game two points for loading correctly
const benign = (t: string) => /^(INFO|WARNING|W\d{4}|I\d{4}):/.test(t.trim()) || /XNNPACK delegate/.test(t);
page.on('console', (m) => { if (m.type() === 'error' && !benign(m.text())) errors.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));

// login (the play routes are behind auth on a production build)
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
if (/\/login/.test(page.url())) {
  await page.fill('input[type="email"]', process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
  await page.fill('input[type="password"]', process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
  await page.click('button[type="submit"]');
  const t = Date.now(); while (Date.now() - t < 30000 && /\/login/.test(page.url())) await page.waitForTimeout(300);
}

const t0 = Date.now();
await page.goto(`${BASE}/play/dunkduel`, { waitUntil: 'domcontentloaded', timeout: 120000 });
let ready = '';
while (Date.now() - t0 < 60000) { ready = await page.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => ''); if (ready) break; await page.waitForTimeout(300); }
const readyMs = Date.now() - t0;
await page.screenshot({ path: `${OUT}/dunkduel-1-open.png` });

// the consent gate: the one button on the page that starts the camera
const start = page.locator('button', { hasText: /start|camera|allow|begin|prove/i }).first();
const sawConsent = await start.count() > 0;
if (sawConsent) await start.click().catch(() => {});
// walk as deep as a synthetic camera can go: consent → the tracker downloads → "prop the phone" → armed. Each gate is
// one CTA, so clicking whatever CTA is on screen (a few times, slowly) is the whole flow.
const walked: string[] = [];
for (let i = 0; i < 3; i++) {
  await page.waitForTimeout(5000);
  const cta = page.locator('button', { hasText: /start|attempt|player|again|try/i }).first();
  if (await cta.count()) { walked.push(((await cta.textContent()) ?? '').trim().slice(0, 40)); await cta.click().catch(() => {}); }
}
await page.waitForTimeout(2000);

const live = await page.evaluate(() => {
  const v = document.querySelector('video') as HTMLVideoElement | null;
  const s = v?.srcObject as MediaStream | null;
  return {
    hasVideo: !!v,
    streaming: !!s && s.getVideoTracks().some((t) => t.readyState === 'live'),
    w: v?.videoWidth ?? 0, h: v?.videoHeight ?? 0,
    ready: document.getElementById('fel-ready')?.dataset.state ?? '',
    text: (document.body.innerText || '').slice(0, 400),
  };
});
await page.screenshot({ path: `${OUT}/dunkduel-2-mid.png` });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/dunkduel-3-late.png` });

const res = {
  slug: 'dunkduel', path: '/play/dunkduel', tag: TAG,
  readyMs, readyState: ready, sawConsent, walked, ...live,
  errors: errors.slice(0, 5), errorCount: errors.length,
  note: 'chromium fake camera: a synthetic pattern, so no pose is ever found and no dunk is judged — the flow is measured to "armed and tracking"',
};
fs.writeFileSync(`${OUT}/dunkduel-flow.json`, JSON.stringify(res, null, 1));
await browser.close();
console.log(JSON.stringify(res, null, 1));
