// IMPROVE-AUDIT (2026-11-22): a first-time visitor's path, timed — home → PLAY NOW → /try's birth date → the guest dunk,
// on the phone tier (390x844 touch, DPR 3, CPU slowed 4x) against the every-screen rig's production build (ES_* env).
// Every tap is counted and every screen photographed (JPG). Read-only: a guest makes no account.
//   /home/user/wt/gate-run.sh 900 npx tsx scripts/probes/improve-audit/firstvisit.mts <outDir> [tag]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { chromiumExe } from '../_chromium.mts';
import { ORIGIN, dbUp, serve } from '../../every-screen/rig.mts';

const out = process.argv[2]; const tag = process.argv[3] ?? 'fv1';
if (!out) { console.error('usage: firstvisit.mts <outDir> [tag]'); process.exit(2); }
mkdirSync(out, { recursive: true });
dbUp();
const stop = await serve(join(out, 'server.log'));
const steps: { step: string; atMs: number; url: string; ok: boolean; note?: string }[] = [];
let taps = 0;
try {
  const browser = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 ImproveAuditRig' });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const t0 = Date.now();
  const mark = async (step: string, ok: boolean, note?: string) => {
    steps.push({ step, atMs: Date.now() - t0, url: page.url().replace(ORIGIN, ''), ok, note });
    console.log(`${(Date.now() - t0) / 1000}s ${step} ${ok ? 'ok' : 'FAIL'} ${note ?? ''}`);
    await page.screenshot({ path: join(out, `${tag}-${steps.length}-${step.replace(/\W+/g, '-')}.jpg`), type: 'jpeg', quality: 62 }).catch(() => {});
  };
  const tapText = async (re: RegExp): Promise<boolean> => {
    const el = page.locator('a,button,[role="button"]').filter({ hasText: re }).first();
    const b = await el.boundingBox().catch(() => null);
    if (!b) return false;
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); taps++;
    return true;
  };
  await page.goto(ORIGIN + '/', { waitUntil: 'load' });
  await mark('home', true);
  await mark('tap PLAY NOW', await tapText(/play now/i));
  await page.waitForURL(/\/try/, { timeout: 30000 }).catch(() => {});
  await page.waitForSelector('select', { timeout: 30000 }).catch(() => {});
  await mark('the try page', page.url().includes('/try'));
  // the birth date: a year (a tap and a pick), a month and a day (typed)
  await page.selectOption('select', '1995').catch(() => {}); taps++;
  await page.fill('input[aria-label="Month"]', '6').catch(() => {}); taps++;
  await page.fill('input[aria-label="Day"]', '15').catch(() => {}); taps++;
  await mark('continue', await tapText(/^\s*continue\s*$/i));
  await page.waitForTimeout(2500);
  await mark('after the birth date', true, (await page.evaluate('document.body.innerText').catch(() => '') as string).replace(/\s+/g, ' ').slice(0, 160));
  // a save offer may come next; the guest path is "play without saving"
  if (await tapText(/play without saving|just play|skip/i)) await mark('play without saving', true);
  const ready = await page.waitForSelector('[data-splash-phase="ready"]', { timeout: 150000 }).then(() => true).catch(() => false);
  await mark('the dunk is ready', ready);
  if (ready) {
    const ok = await tapText(/tap to start/i) || (await page.locator('[data-splash-phase="ready"]').boundingBox().then(async (b) => { if (!b) return false; await page.touchscreen.tap(b.x + b.width / 2, b.y + 60); taps++; return true; }));
    const live = await page.waitForFunction(`!document.querySelector('[data-splash-phase]')`, undefined, { timeout: 60000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(3000);
    await mark('playing', ok && live);
  }
  writeFileSync(join(out, `${tag}-firstvisit.json`), JSON.stringify({ tag, taps, steps, errors }, null, 1));
  await browser.close();
} finally { stop(); }
