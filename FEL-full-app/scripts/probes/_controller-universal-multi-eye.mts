// CONTROLLER-UNIVERSAL-MULTI live repro. Usage: npx tsx scripts/probes/_controller-universal-multi-eye.mts [baseUrl]  (a `next dev` server)
// Gates: (1) two fake pads (DualSense + Switch Pro) → P1/P2 chips; both move the hero; slot stream tags both
//        (2) TV MODE toggle reachable on /try (Controller Link panel) and the dunk reads it at takeoff
//        (3) a phone joins /controller/<code> as the dunk's pad and its SLAM reaches the bus
//        (4) phone-landscape /try: the touch verbs sit inside the viewport
import { chromium, devices, type Page } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.argv[2] ?? 'http://127.0.0.1:3061';
const OUT = '/Users/elijahbonds/Claude/outbox/controller-universal-multi-eye';
fs.mkdirSync(OUT, { recursive: true });
const CHROME = '/Users/elijahbonds/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const gates: Record<string, unknown> = {};
const logs: string[] = [];
const text = (p: Page) => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());

const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--window-size=1280,860', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.on('response', (r) => { if (r.url().includes('/api/controller-link/rooms') || r.status() >= 500) logs.push(`${r.status()} ${r.url().slice(-70)}`); });
page.on('console', (m) => { const t = m.text(); if (/\[PAD\]|\[DUNK\] TV MODE|\[DUNK-WIN\] takeoff/.test(t)) logs.push(t); });
// the fake Gamepad API is installed before any page script, empty until the probe plugs a pad in
// (a string, not a function: tsx's keepNames helper does not exist inside the page)
await page.addInitScript(`
  window.__PADS = [null, null, null, null];
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: function () { return window.__PADS; } });
  window.__plug = function (index, id, mapping) {
    var buttons = []; for (var i = 0; i < 17; i++) buttons.push({ pressed: false, touched: false, value: 0 });
    var pad = { index: index, id: id, mapping: mapping, connected: true, timestamp: Date.now(), axes: [0, 0, 0, 0], buttons: buttons };
    window.__PADS[index] = pad;
    var ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: pad }); window.dispatchEvent(ev);
  };
`);
const setBtn = (i: number, b: number, on: boolean, v?: number) => page.evaluate(([i, b, on, v]) => { const p = (window as any).__PADS[i as number]; p.buttons[b as number] = { pressed: on, touched: on, value: (v as number) ?? (on ? 1 : 0) }; }, [i, b, on, v] as const);
const setStick = (i: number, x: number, y: number) => page.evaluate(([i, x, y]) => { const p = (window as any).__PADS[i as number]; p.axes[0] = x; p.axes[1] = y; }, [i, x, y] as const);
const heroPos = () => page.evaluate(() => { const h = (window as any).__FEL_DEV__?.hero?.(); const n = h?.root ?? h; const v = n?.getAbsolutePosition?.() ?? n?.position; return v ? { x: +v.x.toFixed(3), z: +v.z.toFixed(3) } : null; });

await page.goto(`${BASE}/try`, { waitUntil: 'domcontentloaded', timeout: 240000 });
await page.waitForSelector('canvas', { timeout: 240000 });
await page.waitForFunction(() => !!(window as any).__FEL_DEV__?.input, null, { timeout: 240000 });
await page.evaluate(() => {
  const w = window as any; w.__EV = { merged: [] as string[], slot: [] as string[] };
  const bus = w.__FEL_DEV__.input;
  bus.on((e: any) => { if (e.t !== 'trigger') w.__EV.merged.push(JSON.stringify(e)); });
  bus.onSlot((e: any, s: number) => { if (e.t !== 'trigger') w.__EV.slot.push(`${s}:${JSON.stringify(e)}`); });
});

// ── G1: two pads, two chips ──
await page.evaluate(() => (window as any).__plug(0, 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', 'standard'));
await page.waitForTimeout(700);
await page.evaluate(() => (window as any).__plug(1, 'Pro Controller (Vendor: 057e Product: 2009)', ''));
await page.waitForTimeout(500);

// start the contest from P2's pad (Switch Pro START = 9) — any seat can start a single-player night
for (let n = 0; n < 20; n++) {
  const t = await text(page);
  if (/TAP TO START|PRESS START|PRESS ANY/i.test(t)) { await setBtn(1, 9, true); await page.waitForTimeout(150); await setBtn(1, 9, false); }
  const hp = await heroPos();
  if (hp && /DUNK|RD/.test(t) && !/TAP TO START/i.test(t)) break;
  await page.waitForTimeout(900);
}
await page.waitForTimeout(4500);   // through the 3-2-1
const chips = await page.$$eval('[data-pad-chip]', (els) => els.map((e) => e.textContent?.trim()));
await page.screenshot({ path: `${OUT}/01-two-pads-chips.png` });
gates.chips = { verdict: chips.includes('P1 DualSense') && chips.includes('P2 Switch Pro Controller') ? 'PASS' : 'FAIL', chips };
async function run(slot: number) {
  const a = await heroPos();
  await setStick(slot, 0, -1); await page.waitForTimeout(400); await setStick(slot, 0, 0);
  await page.waitForTimeout(250);
  const b = await heroPos();
  return { a, b, moved: a && b ? +Math.hypot(b.x - a.x, b.z - a.z).toFixed(3) : null };
}
const p2 = await run(1);                 // P2 first: a long P1 run parks the hero at the end of the runway
await page.screenshot({ path: `${OUT}/02-p2-moved.png` });
const p1 = await run(0);
await page.screenshot({ path: `${OUT}/03-p1-moved.png` });
const ev = await page.evaluate(() => (window as any).__EV);
const slot0 = ev.slot.filter((s: string) => s.startsWith('0:') && s.includes('"stick"')).length;
const slot1 = ev.slot.filter((s: string) => s.startsWith('1:') && s.includes('"stick"')).length;
gates.both_move = { verdict: (p1.moved ?? 0) > 0.3 && (p2.moved ?? 0) > 0.3 && slot0 > 0 && slot1 > 0 ? 'PASS' : 'FAIL', p1, p2, slotStickEvents: { slot0, slot1 } };

// ── G2: TV MODE on /try ──
await page.getByTestId('host-lobby-badge').click();
await page.waitForSelector('[data-testid="host-lobby-panel"]', { timeout: 15000 });
await page.waitForFunction(() => /\/controller\/[2-9A-HJ-NP-Z]{6}/.test(document.querySelector('[data-testid="host-lobby-panel"]')?.textContent ?? ''), null, { timeout: 90000 }).catch(() => {});   // not a bare 6-letter test: PLAYERS matches it
const before = (await page.getByTestId('tv-mode-toggle').textContent())?.trim();
await page.getByTestId('tv-mode-toggle').click();
const after = (await page.getByTestId('tv-mode-toggle').textContent())?.trim();
const stored = await page.evaluate(() => [localStorage.getItem('fel-display-mode'), localStorage.getItem('fel-display-factor')]);
const panelText = (await page.getByTestId('host-lobby-panel').innerText()).replace(/\s+/g, ' ');
const code = /\/controller\/([2-9A-HJ-NP-Z]{6})/.exec(panelText)?.[1] ?? null;
await page.screenshot({ path: `${OUT}/04-link-panel-tv-mode-on.png` });
// one jump so the mode reads the setting at takeoff
await setStick(0, 0, -1); await setBtn(0, 7, true, 1); await page.waitForTimeout(1600); await setBtn(0, 7, false, 0);
await page.waitForTimeout(300); await setBtn(0, 0, true); await page.waitForTimeout(100); await setBtn(0, 0, false);
await page.waitForTimeout(2600); await setStick(0, 0, 0);
gates.panel_text = panelText.slice(0, 300);
gates.tv_mode = { verdict: before === 'TV MODE OFF' && after === 'TV MODE ON' && stored[0] === 'mirrored' && logs.some((l) => /TV MODE slam window x1\.35/.test(l)) ? 'PASS' : 'FAIL', before, after, stored, code, dunkLog: logs.filter((l) => /TV MODE/.test(l)) };

// ── G3: a phone joins as the dunk's pad ──
if (code) {
  const phoneCtx = await browser.newContext({ ...devices['iPhone 13'] });
  const phone = await phoneCtx.newPage();
  await phone.goto(`${BASE}/controller/${code}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await phone.getByPlaceholder('Your name').fill('PHONE');
  await phone.getByRole('button', { name: 'JOIN' }).click();
  await page.waitForFunction(() => /1\/1 connected|PLAYERS 1\/1/.test(document.body.innerText), null, { timeout: 45000 }).catch(() => {});
  const hostSees = (await text(page)).match(/(PLAYERS \d\/\d|\d\/\d connected)/)?.[0] ?? null;
  await page.evaluate(() => { (window as any).__EV.merged.length = 0; });
  const slam = phone.getByRole('button', { name: 'SLAM' });
  await slam.waitFor({ timeout: 30000 }).catch(() => {});
  await slam.dispatchEvent('pointerdown').catch(() => {});
  await page.waitForTimeout(800);
  const gotA = await page.evaluate(() => (window as any).__EV.merged.some((s: string) => s.includes('"btn":"A"') && s.includes('"pressed":true')));
  await phone.screenshot({ path: `${OUT}/05-phone-controller.png` });
  await page.screenshot({ path: `${OUT}/06-host-phone-joined.png` });
  gates.phone_join = { verdict: hostSees && /1\/1/.test(hostSees) && gotA ? 'PASS' : 'FAIL', hostSees, slamReachedBus: gotA };
  await phoneCtx.close();
} else gates.phone_join = { verdict: 'FAIL', why: 'no room code on the panel' };

// ── G4: phone-landscape /try keeps the verbs on screen ──
const landCtx = await browser.newContext({ ...devices['iPhone 13 landscape'] });
const land = await landCtx.newPage();
await land.goto(`${BASE}/try`, { waitUntil: 'domcontentloaded', timeout: 240000 });
await land.waitForSelector('canvas', { timeout: 240000 });
let boxes: unknown = null;
for (let n = 0; n < 40; n++) {
  const t = await text(land);
  if (/TAP TO START/i.test(t)) await land.getByText(/TAP TO START/i).first().click().catch(() => {});
  boxes = await land.evaluate(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const btns = [...document.querySelectorAll('button')].filter((b) => /^(RUN|SLAM|STYLE|PROP)$/.test((b.textContent ?? '').trim()) && b.getBoundingClientRect().width > 20 && b.getBoundingClientRect().width < 120);
    return btns.length ? { vw, vh, scrollY: window.scrollY, docH: document.documentElement.scrollHeight, rects: btns.map((b) => { const r = b.getBoundingClientRect(); return { t: (b.textContent ?? '').trim().slice(0, 8), right: Math.round(r.right), bottom: Math.round(r.bottom) }; }) } : null;
  });
  if (boxes) break;
  await land.waitForTimeout(1500);
}
await land.screenshot({ path: `${OUT}/07-phone-landscape-try.png` });
const b = boxes as { vw: number; vh: number; rects: { right: number; bottom: number }[] } | null;
gates.phone_landscape = { verdict: b && b.rects.every((r) => r.right <= b.vw && r.bottom <= b.vh) ? 'PASS' : 'FAIL', boxes };
await landCtx.close();

fs.writeFileSync(`${OUT}/gates.json`, JSON.stringify({ base: BASE, gates, logs: logs.slice(0, 30) }, null, 2));
console.log(JSON.stringify(gates, null, 2));
await browser.close();
