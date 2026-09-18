// CONTROLLER-STICK-LIVE smoke (2026-09-14) — a production /try, four fake pads, the gates the QA HARD named:
//   G1 handle   __FEL_DEV__.input appears on a PRODUCTION build, well inside 60 s
//   G2 adopt    press-to-adopt: a pad is null in getGamepads() until its first press (no gamepadconnected event, as
//               Chrome does it) — chips P1–P4 appear and match the bus roster slot for slot
//   G3 sticks   each slot's stick push reads non-zero on padState() for THAT slot only, and on onSlot() + on()
//   G4 play     a pad press takes READY to playing (START-UNSTICK not regressed)
//   G5 remount  reload with a pad already plugged (no event, no press): handle < 60 s, P1 re-seated, stick live
// Usage: BASE=http://127.0.0.1:3087 npx tsx scripts/probes/_controller-stick-live-smoke.mts
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3000';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/controller-stick-live';
fs.mkdirSync(OUT, { recursive: true });

const PADS = [
  { id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', mapping: 'standard', name: 'DualSense', a: 0 },
  { id: 'Pro Controller (Vendor: 057e Product: 2009)', mapping: '', name: 'Switch Pro Controller', a: 1 },
  { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', mapping: 'standard', name: 'Xbox Wireless Controller', a: 0 },
  { id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 05c4)', mapping: 'standard', name: 'DualShock 4', a: 0 },
];
const gates: Record<string, { verdict: 'PASS' | 'FAIL'; [k: string]: unknown }> = {};
const logs: string[] = [];
const text = (p: Page) => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());

const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--window-size=1280,860', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.on('console', (m) => { const t = m.text(); if (/\[PAD\]/.test(t)) logs.push(t.slice(0, 200)); });
page.on('pageerror', (e) => logs.push(`pageerror ${String(e.message).slice(0, 200)}`));

// A STRING init script (tsx breaks function init scripts). `__plugged` pads survive a reload through sessionStorage,
// which is how a pad already held before the page loaded looks to getGamepads(): present, no event.
await page.addInitScript(`
  window.__PADS = [null, null, null, null];
  window.__mk = function (index, id, mapping) {
    var b = []; for (var i = 0; i < 17; i++) b.push({ pressed: false, touched: false, value: 0 });
    return { index: index, id: id, mapping: mapping, connected: true, timestamp: Date.now(), axes: [0, 0, 0, 0], buttons: b };
  };
  try { var keep = JSON.parse(sessionStorage.getItem('__keepPads') || '[]'); keep.forEach(function (k) { window.__PADS[k.index] = window.__mk(k.index, k.id, k.mapping); }); } catch (e) {}
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: function () { return window.__PADS; } });
  window.__press = function (index, id, mapping, btn, withEvent) {
    var p = window.__PADS[index] || window.__mk(index, id, mapping);
    p.buttons[btn] = { pressed: true, touched: true, value: 1 }; p.timestamp = Date.now();
    window.__PADS[index] = p;
    if (withEvent) { var ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: p }); window.dispatchEvent(ev); }
  };
`);
const release = (i: number, b: number) => page.evaluate(([i, b]) => { const p = (window as any).__PADS[i]; if (p) { p.buttons[b] = { pressed: false, touched: false, value: 0 }; p.timestamp = Date.now(); } }, [i, b]);
const stick = (i: number, x: number, y: number) => page.evaluate(([i, x, y]) => { const p = (window as any).__PADS[i]; if (p) { p.axes[0] = x; p.axes[1] = y; p.timestamp = Date.now(); } }, [i, x, y]);
const state = (p: Page) => p.evaluate(() => (window as any).__FEL_DEV__?.input?.padState?.() ?? null);
const chips = (p: Page) => p.$$eval('[data-pad-chip]', (els) => els.map((e) => e.textContent?.trim() ?? ''));
const subscribe = (p: Page) => p.evaluate(() => {
  const w = window as any; const bus = w.__FEL_DEV__.input;
  w.__EV = { merged: 0, slot: { 0: 0, 1: 0, 2: 0, 3: 0 } as Record<number, number> };
  bus.on((e: any) => { if (e.t === 'stick' && e.side === 'L' && Math.abs(e.y) > 0.5) w.__EV.merged++; });
  bus.onSlot((e: any, s: number) => { if (e.t === 'stick' && e.side === 'L' && Math.abs(e.y) > 0.5) w.__EV.slot[s]++; });
});

// ── G1 handle ──
let t0 = Date.now();
const res = await page.goto(`${BASE}/try`, { waitUntil: 'domcontentloaded', timeout: 60000 });
const buildId = await page.evaluate(() => document.documentElement.innerHTML.match(/buildId\\?":\\?"([^"\\]+)/)?.[1] ?? null);
let handleMs = -1;
try { await page.waitForFunction(() => !!(window as any).__FEL_DEV__?.input, null, { timeout: 60000 }); handleMs = Date.now() - t0; } catch { /* FAIL below */ }
const env = await page.evaluate(() => ({ keys: Object.keys((window as any).__FEL_DEV__ ?? {}), scene: !!(window as any).__FEL_DEV__?.scene }));
gates.G1_handle = { verdict: handleMs >= 0 && handleMs < 60000 ? 'PASS' : 'FAIL', status: res?.status(), buildId, handleMs, handleKeys: env.keys, sceneExposed: env.scene };
if (handleMs < 0) { fs.writeFileSync(`${OUT}/gates.json`, JSON.stringify({ gates, logs }, null, 2)); console.log(JSON.stringify(gates, null, 2)); await browser.close(); process.exit(2); }
await subscribe(page);
// the bus starts after load (READY): wait for the start prompt before plugging
await page.waitForFunction(() => /TAP TO START|press any button/i.test(document.body.innerText), null, { timeout: 90000 }).catch(() => {});
const readyMs = Date.now() - t0;
const readyText = await text(page);
await page.screenshot({ path: `${OUT}/00-ready.png` });

// ── G2 press-to-adopt ──
const beforePress = await state(page);
for (let i = 0; i < 4; i++) {
  const p = PADS[i];
  await page.evaluate(([i, id, m, b, ev]) => (window as any).__press(i, id, m, b, ev), [i, p.id, p.mapping, 4 /* L1: no READY wake */, i === 0] as const);
  await page.waitForTimeout(150);
  await release(i, 4);
  await page.waitForTimeout(250);
}
await page.waitForTimeout(600);
const roster = (await state(page)) as any[];
const chipText = await chips(page);
const expectChips = PADS.map((p, i) => `P${i + 1} ${p.name}`);
const rosterChips = (roster ?? []).map((p) => `P${p.slot + 1} ${p.name}`);
gates.G2_adopt = {
  verdict: (beforePress ?? []).length === 0 && JSON.stringify(chipText) === JSON.stringify(expectChips) && JSON.stringify(rosterChips) === JSON.stringify(expectChips) ? 'PASS' : 'FAIL',
  beforePress: (beforePress ?? []).length, chips: chipText, roster: rosterChips,
};
await page.screenshot({ path: `${OUT}/01-four-chips.png` });

// ── G3 per-slot live sticks ──
const perSlot: Record<string, unknown>[] = [];
for (let i = 0; i < 4; i++) {
  await stick(i, 0, -1);
  await page.waitForTimeout(200);
  const s = (await state(page)) as any[];
  perSlot.push({ slot: i, ly: s.map((p) => +p.ly.toFixed(2)) });
  await stick(i, 0, 0);
  await page.waitForTimeout(150);
}
const ev = await page.evaluate(() => (window as any).__EV);
const slotOk = perSlot.every((r: any) => r.ly.every((v: number, j: number) => (j === r.slot ? v < -0.9 : v === 0)));
gates.G3_sticks = { verdict: slotOk && [0, 1, 2, 3].every((s) => ev.slot[s] >= 1) && ev.merged >= 4 ? 'PASS' : 'FAIL', padStateLyDuringPush: perSlot, onSlotPushes: ev.slot, mergedPushes: ev.merged };

// ── G4 pad input started play ──
// START-UNSTICK wakes READY on any press / push, so the pads' own adopt presses and stick pushes above are what
// started the contest: READY showed TAP TO START before any pad existed, and it is gone now. A pad A press follows.
const pre = readyText;
await page.evaluate(([b]) => (window as any).__press(1, '', '', b, false), [1 /* Switch Pro bottom = A */]);
await page.waitForTimeout(150); await release(1, 1);
let playing = false;
for (let n = 0; n < 20 && !playing; n++) { await page.waitForTimeout(250); playing = !/TAP TO START/i.test(await text(page)); }
await stick(0, 0, -1); await page.waitForTimeout(900); await stick(0, 0, 0);
gates.G4_play = { verdict: /TAP TO START/i.test(pre) && playing ? 'PASS' : 'FAIL', hadTapToStart: /TAP TO START/i.test(pre), after: (await text(page)).slice(0, 160) };
await page.screenshot({ path: `${OUT}/02-playing.png` });

// ── G5 remount with a pad already plugged ──
await page.evaluate((k) => sessionStorage.setItem('__keepPads', JSON.stringify(k)), [{ index: 0, id: PADS[0].id, mapping: PADS[0].mapping }]);
t0 = Date.now();
let remountMs = -1, reseated: unknown = null, liveAfter = false, chipsAfter: string[] = [];
try {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!(window as any).__FEL_DEV__?.input, null, { timeout: 60000 });
  remountMs = Date.now() - t0;
  await page.waitForFunction(() => ((window as any).__FEL_DEV__?.input?.padState?.() ?? []).length >= 1, null, { timeout: 60000 });
  reseated = await state(page);
  await stick(0, 0.8, 0); await page.waitForTimeout(200);
  liveAfter = ((await state(page)) as any[])[0].lx > 0.5;
  await stick(0, 0, 0);
  chipsAfter = await chips(page);
} catch (e) { logs.push(`G5 ${String(e).slice(0, 200)}`); }
const totalRemountMs = Date.now() - t0;
gates.G5_remount = { verdict: remountMs >= 0 && totalRemountMs < 60000 && liveAfter && chipsAfter[0] === 'P1 DualSense' ? 'PASS' : 'FAIL', handleMs: remountMs, reseatedAndLiveMs: totalRemountMs, reseated: (reseated as any[] | null)?.map((p) => `P${p.slot + 1} ${p.name}`), liveAfter, chipsAfter };
await page.screenshot({ path: `${OUT}/03-remount.png` });

const hard = Object.entries(gates).filter(([, g]) => g.verdict !== 'PASS').map(([k]) => k);
const out = { base: BASE, buildId, readyMs, gates, hard, logs: logs.slice(0, 30) };
fs.writeFileSync(`${OUT}/gates.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
process.exit(hard.length ? 2 : 0);
