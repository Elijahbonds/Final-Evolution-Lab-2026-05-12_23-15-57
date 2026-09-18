// CLAIM-NOT-BLOCK live repro: reach the /try night card, then prove every claim path keeps the tab,
// the stage and GO AGAIN. Usage: npx tsx scripts/_claim-not-block-eye.mts [baseUrl]
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.argv[2] ?? 'http://127.0.0.1:3061';
const TRY = `${BASE}/try`;
const OUT = '/Users/elijahbonds/Claude/outbox/claim-not-block-eye';
fs.mkdirSync(OUT, { recursive: true });
const CHROME = '/Users/elijahbonds/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

async function injectPad(page: Page) {
  await page.evaluate(() => {
    if ((window as any).__PAD) return;
    const pad: any = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: Date.now(),
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    (window as any).__PAD = pad; (navigator as any).getGamepads = () => [pad];
    const ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: pad }); window.dispatchEvent(ev);
  });
}
const setBtn = (page: Page, i: number, on: boolean, value?: number) => page.evaluate(([i, on, value]) => { const p = (window as any).__PAD; if (!p) return; p.buttons[i].pressed = on; p.buttons[i].value = value ?? (on ? 1 : 0); p.timestamp = Date.now(); }, [i, on, value] as any);
const setStick = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => { const p = (window as any).__PAD; if (!p) return; p.axes[0] = x; p.axes[1] = y; p.timestamp = Date.now(); }, [x, y] as any);
async function tapBtn(page: Page, i: number, ms = 120) { await setBtn(page, i, true); await page.waitForTimeout(ms); await setBtn(page, i, false); }
const text = (page: Page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
const onCard = (t: string) => /GO AGAIN/.test(t) && /TOOK THE CARD/.test(t);
async function oneDunk(page: Page) {
  await setStick(page, 0, -1); await setBtn(page, 7, true, 1); await page.waitForTimeout(1500);
  await setBtn(page, 7, false, 0); await page.waitForTimeout(300); await tapBtn(page, 0, 100);
  await page.waitForTimeout(2400); await setStick(page, 0, 0);
}
async function reachCard(page: Page) {
  for (let n = 0; n < 30; n++) {
    const t = await text(page);
    if (onCard(t)) return true;
    if (/TAP TO START|PRESS START/i.test(t)) { await page.getByText(/TAP TO START/i).first().click().catch(() => {}); await tapBtn(page, 9, 150); await page.waitForTimeout(900); continue; }
    await oneDunk(page);
  }
  for (let i = 0; i < 15; i++) { await page.waitForTimeout(700); if (onCard(await text(page))) return true; }
  return false;
}

const gates: Record<string, any> = {};
const fail = (k: string, v: any) => { gates[k] = { verdict: 'FAIL', ...v }; };
const pass = (k: string, v: any) => { gates[k] = { verdict: 'PASS', ...v }; };

const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--window-size=1280,860'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
let mainNavs = 0;
page.on('framenavigated', (f) => { if (f === page.mainFrame()) mainNavs++; });
await page.goto(TRY, { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForSelector('canvas', { timeout: 180000 });
await page.waitForTimeout(1500); await injectPad(page);
const navsAtBoot = mainNavs;

// G1 — card 1: CLAIM YOUR ATHLETE opens the sheet in place
const reached = await reachCard(page);
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/01-card.png` });
if (!reached) { fail('reach_card', { text: (await text(page)).slice(0, 400) }); }
else {
  await page.getByRole('button', { name: /CLAIM YOUR ATHLETE/ }).click();
  await page.waitForTimeout(700);
  const sheet = await page.getByRole('dialog', { name: 'Claim your athlete' }).isVisible();
  await page.screenshot({ path: `${OUT}/02-sheet.png` });
  const ok = sheet && page.url().includes('/try') && mainNavs === navsAtBoot;
  (ok ? pass : fail)('card_claim_opens_sheet', { sheet, url: page.url(), navs: mainNavs - navsAtBoot });

  // G2 — OPEN SIGN-UP goes to a NEW TAB; this tab stays on /try with the card up
  const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 15000 }), page.getByRole('link', { name: /OPEN SIGN-UP/ }).click()]);
  await popup.waitForURL(/\/signup/, { timeout: 60000 }).catch(() => {});   // the page event fires on about:blank
  const popupUrl = popup.url();
  await page.bringToFront(); await page.waitForTimeout(800);
  const t2 = await text(page);
  const sheetGone = !(await page.getByRole('dialog', { name: 'Claim your athlete' }).isVisible().catch(() => false));
  await page.screenshot({ path: `${OUT}/03-after-newtab.png` });
  const ok2 = /\/signup/.test(popupUrl) && page.url().includes('/try') && onCard(t2) && sheetGone && mainNavs === navsAtBoot;
  (ok2 ? pass : fail)('signup_new_tab', { popupUrl, tryUrl: page.url(), cardStillUp: onCard(t2), sheetGone, navs: mainNavs - navsAtBoot });
  await popup.close();

  // G3 — header CLAIM → sheet → KEEP DUNKING, then Esc path, then GO AGAIN plays in place
  await page.getByRole('button', { name: 'CLAIM', exact: true }).click();
  await page.waitForTimeout(500);
  const hdrSheet = await page.getByRole('dialog', { name: 'Claim your athlete' }).isVisible();
  await page.getByRole('button', { name: 'KEEP DUNKING' }).click();
  await page.waitForTimeout(600);
  const keepClosed = !(await page.getByRole('dialog', { name: 'Claim your athlete' }).isVisible().catch(() => false));
  await page.getByRole('button', { name: 'CLAIM', exact: true }).click();
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const escClosed = !(await page.getByRole('dialog', { name: 'Claim your athlete' }).isVisible().catch(() => false));
  const notPaused = !/PAUSED/.test(await text(page));   // InputBus maps Escape to START: the sheet must swallow it
  (hdrSheet && keepClosed && escClosed && notPaused ? pass : fail)('header_claim_dismiss', { hdrSheet, keepClosed, escClosed, notPaused });

  const tBefore = await text(page);
  if (onCard(tBefore)) await page.getByRole('button', { name: 'GO AGAIN', exact: true }).click();
  await page.waitForTimeout(2500);
  const t3 = await text(page);
  await page.screenshot({ path: `${OUT}/04-go-again.png` });
  const ok3 = page.url().includes('/try') && !onCard(t3) && !/TAP TO START/i.test(t3) && mainNavs === navsAtBoot;
  (ok3 ? pass : fail)('go_again_after_claim', { url: page.url(), cardGone: !onCard(t3), coldBoot: /TAP TO START/i.test(t3), navs: mainNavs - navsAtBoot, hud: t3.slice(0, 200) });

  // G4 — and the guest can actually dunk again: a second card lands in the same mount
  const again = await reachCard(page);
  await page.screenshot({ path: `${OUT}/05-card-2.png` });
  (again && mainNavs === navsAtBoot ? pass : fail)('second_night_same_mount', { again, navs: mainNavs - navsAtBoot, hud: (await text(page)).slice(0, 200) });
}
const failed = Object.entries(gates).filter(([, v]) => v.verdict !== 'PASS').map(([k]) => k);
const report = { base: BASE, gates, verdict: failed.length || !reached ? 'SHARE_BLOCKED' : 'LAND_PASS', failed };
fs.writeFileSync(`${OUT}/FINAL.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
