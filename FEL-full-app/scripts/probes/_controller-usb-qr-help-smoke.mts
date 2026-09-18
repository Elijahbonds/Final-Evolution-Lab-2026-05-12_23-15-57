// CONTROLLER-USB-QR-HELP smoke — /try on a production server.
//   U1  USB teach beside the badge from cold (0 taps) + in the panel; a pad's first press flips it to "P1 … connected" + chip
//   Q1  one tap on the badge → a loaded QR <img> + the three scan steps + a /controller/<CODE> link
//   Q2  the room opens (no "Failed to fetch"); a 2-request blip is absorbed by the retry; a hard outage shows RETRY,
//       and RETRY after the server is back opens the room
//   H1  taps from cold to both teaches (≤ 2)
//   H2  the panel closes with ×, TAP TO START still starts the dunk, and the USB line gets out of the way in play
// usage: BASE=http://127.0.0.1:3077 OUT=<dir> node tsx scripts/probes/_controller-usb-qr-help-smoke.mts

import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3000';
const OUT = process.env.OUT ?? '/tmp/fel-usb-qr-help';
fs.mkdirSync(OUT, { recursive: true });
const CHROME = '/Users/elijahbonds/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const gates: Record<string, { verdict: 'PASS' | 'FAIL'; detail: unknown }> = {};
const gate = (id: string, ok: boolean, detail: unknown) => { gates[id] = { verdict: ok ? 'PASS' : 'FAIL', detail }; console.log(id, ok ? 'PASS' : 'FAIL', JSON.stringify(detail).slice(0, 400)); };
const txt = (p: Page, sel: string) => p.locator(sel).first().innerText({ timeout: 2000 }).then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const body = (p: Page) => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));

const PADS = `
  window.__PADS = [null, null, null, null];
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: function () { return window.__PADS; } });
  window.__press = function (index, id) {
    // L1 (button 4): adopts the pad without waking READY, so the pre-play USB line can still be read
    var b = []; for (var i = 0; i < 17; i++) b.push({ pressed: i === 4, touched: i === 4, value: i === 4 ? 1 : 0 });
    window.__PADS[index] = { index: index, id: id, mapping: 'standard', connected: true, timestamp: Date.now(), axes: [0, 0, 0, 0], buttons: b };
  };
  window.__release = function (index) { var p = window.__PADS[index]; if (p) { p.buttons[4] = { pressed: false, touched: false, value: 0 }; p.timestamp = Date.now(); } };
`;

const browser = await chromium.launch({ executablePath: CHROME, headless: process.env.HEADLESS === '1', args: ['--window-size=1280,860', '--autoplay-policy=no-user-gesture-required'] });

async function fresh(): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript(PADS);
  await page.goto(`${BASE}/try`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('[data-testid="host-lobby-badge"]', { timeout: 120000 });
  await page.waitForTimeout(1500);
  return page;
}

// ── U1 / Q1 / Q2a / H1 / H2 on one cold page ──
{
  const page = await fresh();
  let taps = 0;
  const hint0 = await txt(page, '[data-testid="usb-connect-hint"]');
  const badge0 = await txt(page, '[data-testid="host-lobby-badge"]');
  await page.screenshot({ path: `${OUT}/01-cold.png` });

  await page.evaluate(() => (window as any).__press(0, 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)'));
  // The press can land while the arena is still loading: the bus starts after load and adopts a pad already in
  // getGamepads() then (InputBus.start → syncPads), which is how a real pad pressed early behaves too.
  const tPress = Date.now();
  await page.waitForSelector('[data-pad-chip]', { timeout: 120000 }).catch(() => {});
  const adoptMs = Date.now() - tPress;
  await page.evaluate(() => (window as any).__release(0));
  await page.waitForTimeout(800);   // inside the 4 s the lobby holds the join line (the press also starts play)
  const hint1 = await txt(page, '[data-testid="usb-connect-hint"]');
  const chips = await page.$$eval('[data-pad-chip]', (els) => els.map((e) => e.textContent?.trim()));
  await page.screenshot({ path: `${OUT}/02-pad-in.png` });
  gate('U1', /USB/.test(hint0) && /press any button/i.test(hint0) && /^P1 .*connected/.test(hint1) && chips.length === 1, { taps, badge0, hint0, hint1, chips, adoptMs });

  await page.getByTestId('host-lobby-badge').click(); taps++;
  await page.waitForSelector('[data-testid="host-lobby-panel"]', { timeout: 15000 });
  await page.waitForSelector('[data-testid="host-lobby-qr"]', { timeout: 60000 }).catch(() => {});
  const qr = await page.evaluate(() => {
    const img = document.querySelector('[data-testid="host-lobby-qr"]') as HTMLImageElement | null;
    return img ? { w: img.naturalWidth, h: img.naturalHeight, complete: img.complete, alt: img.alt, src: img.src.slice(0, 22) } : null;
  });
  const usbHelp = await txt(page, '[data-testid="usb-connect-help"]');
  const qrHelp = await txt(page, '[data-testid="qr-connect-help"]');
  const panel = await txt(page, '[data-testid="host-lobby-panel"]');
  await page.screenshot({ path: `${OUT}/03-panel.png` });
  gate('Q1', !!qr && qr.w > 0 && qr.complete && /camera/i.test(qrHelp) && /Point it at the QR code/.test(qrHelp) && /Tap the link/.test(qrHelp) && /\/controller\/[2-9A-HJ-NP-Z]{6}/.test(qrHelp), { taps, qr, qrHelp });
  gate('U1-panel', /Plug the controller into this computer with a USB cable/.test(usbHelp) && /Press any button/.test(usbHelp) && /P1 .*connected/.test(usbHelp), { usbHelp });
  gate('Q2-normal', !/failed to fetch|offline|unavailable/i.test(panel) && !!qr, { panelHead: panel.slice(0, 160) });
  gate('H1', taps <= 2, { tapsToUsbTeach: 0, tapsToQrTeach: taps });

  await page.getByRole('button', { name: 'Close controller link' }).click();
  await page.waitForTimeout(400);
  const panelGone = (await page.$('[data-testid="host-lobby-panel"]')) === null;
  await page.getByText('TAP TO START', { exact: false }).first().click({ timeout: 5000 }).catch(() => page.mouse.click(640, 520));
  await page.waitForTimeout(6000);
  const playText = await body(page);
  const hintInPlay = await page.$('[data-testid="usb-connect-hint"]');
  await page.screenshot({ path: `${OUT}/04-play.png` });
  gate('H2', panelGone && !/TAP TO START/.test(playText) && hintInPlay === null, { panelGone, tapToStartGone: !/TAP TO START/.test(playText), hintInPlay: hintInPlay !== null, snippet: playText.slice(0, 200) });
  await page.context().close();
}

// ── Q2b: a blip — the first two room POSTs die at the network, the third succeeds ──
{
  const page = await fresh();
  let aborted = 0;
  await page.route('**/api/controller-link/rooms', (route) => {
    if (route.request().method() === 'POST' && aborted < 2) { aborted++; return route.abort('connectionrefused'); }
    return route.continue();
  });
  await page.getByTestId('host-lobby-badge').click();
  const ok = await page.waitForSelector('[data-testid="host-lobby-qr"]', { timeout: 30000 }).then(() => true).catch(() => false);
  const panel = await txt(page, '[data-testid="host-lobby-panel"]');
  gate('Q2-blip', ok && aborted === 2 && !/failed to fetch|offline/i.test(panel), { aborted, qr: ok });
  await page.context().close();
}

// ── Q2c: a hard outage — every POST dies; the player gets words + RETRY, and RETRY works once the server is back ──
{
  const page = await fresh();
  let down = true; let posts = 0;
  await page.route('**/api/controller-link/rooms', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    posts++;
    return down ? route.abort('connectionrefused') : route.continue();
  });
  await page.getByTestId('host-lobby-badge').click();
  const retryBtn = await page.waitForSelector('[data-testid="host-lobby-retry"]', { timeout: 30000 }).then(() => true).catch(() => false);
  const offline = await txt(page, '[data-testid="qr-connect-help"]');
  const usbStill = await txt(page, '[data-testid="usb-connect-help"]');
  await page.screenshot({ path: `${OUT}/05-outage.png` });
  const postsDuringOutage = posts;
  down = false;
  await page.getByTestId('host-lobby-retry').click().catch(() => {});
  const back = await page.waitForSelector('[data-testid="host-lobby-qr"]', { timeout: 30000 }).then(() => true).catch(() => false);
  await page.screenshot({ path: `${OUT}/06-retried.png` });
  gate('Q2-outage', retryBtn && /Can't reach the game server/.test(offline) && !/Failed to fetch/.test(offline) && /USB cable/.test(usbStill) && postsDuringOutage === 4 && back,
    { retryBtn, offline, postsDuringOutage, qrAfterRetry: back });
  await page.context().close();
}

await browser.close();
const hard = Object.entries(gates).filter(([, g]) => g.verdict === 'FAIL').map(([k]) => k);
fs.writeFileSync(`${OUT}/FINAL.json`, JSON.stringify({ base: BASE, gates, HARD_FAILS: hard, verdict: hard.length ? 'FAIL' : 'PASS' }, null, 2));
console.log('===', hard.length ? `FAIL ${hard.join(',')}` : 'ALL PASS');
