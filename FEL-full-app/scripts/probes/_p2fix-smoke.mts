// MUSIC-SUITE P2 FIX PASS (2026-09-25) — the review's findings, re-checked in a real browser on the lane's dev server.
//
//   A. /dev/music?stage=perform (the real StudioMode), kick 0/8 + snare 4/12 at 92 BPM (a quarter-note beat):
//      1. a mouse click on TAP, then Enter held (1 keydown + 20 repeats + keyup): how many taps the set counted
//         (review: 1 + 21);
//      2. a bot tapping every quarter note (keydown J on the engine clock) for 9 bars, END SET: the result
//         (review: 25 %, grade D — every 16th was a note);
//      3. a fresh set, a masher at 10 taps/s for 9 bars, END SET (review: 50.4 %, C, won).
//   B. /dev/mode/dance?track=cypher: SPACE 30 ms before beat 0 on the heard clock, while the room is still in the
//      count-in (review: dropped, then a MISS) — the judge's first judgement.
// Calibration: 0 ms, dated (an undated one is now ignored), so the judges' latency is exactly 0 on both pages.
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_p2fix-smoke.mts   (BASE, OUT env override)
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p2';
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p2fix +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), pageErrors: [] as string[] };

const CAL = () => { try { localStorage.setItem('fel.audioOffsetMs', '0'); localStorage.setItem('fel.audioOffsetMeasuredAt', String(Date.now())); } catch { /* none */ } };
const GRID_EL = `[...document.querySelectorAll('div')].find((d) => (d.style.gridTemplateColumns || '').includes('repeat(16'))`;
const clickCell = (p: Page, row: number, step: number) => p.evaluate(`(() => { const g = ${GRID_EL}; g.children[${row} * 17 + 1 + ${step}].click(); })()`);
const btn = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).first();
const ended = (p: Page) => p.evaluate(() => (window as Any).__FEL_STUDIO__?.ended ?? null);

/** In-page: for `bars` bars, tap (keydown J) either every scheduled quarter note (`quarters`) or at `rate` per second. */
const PLAY_BOT = `async ([mode, bars, rate]) => {
  const P = window.__FEL_STUDIO__;
  const key = () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', code: 'KeyJ', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'j', code: 'KeyJ', bubbles: true })); };
  const start = P.now(); const stepSec = 60 / 92 / 4; const until = start + bars * 16 * stepSec;
  const tapped = new Set(); let n = 0; let nextMash = start + 0.037;
  while (P.now() < until) {
    const now = P.now();
    if (mode === 'quarters') {
      for (const s of P.steps) {
        if (s.step % 4 !== 0 || tapped.has(s.time) || s.time > now || s.time < start) continue;
        if (now - s.time < 0.02) { key(); n++; }
        tapped.add(s.time);
      }
    } else if (now >= nextMash) { key(); n++; nextMash += 1 / rate; }
    await new Promise((r) => setTimeout(r, 1));
  }
  await new Promise((r) => setTimeout(r, 400));
  return { taps: n, seconds: +(P.now() - start).toFixed(2) };
}`;

async function academy(): Promise<void> {
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: ARGS });
  try { await academyIn(browser); } finally { await browser.close().catch(() => undefined); }
}
async function academyIn(browser: Awaited<ReturnType<typeof chromium.launch>>): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(CAL);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { R.pageErrors.push(`music: ${String(e).slice(0, 300)}`); log('PAGEERROR', String(e).slice(0, 200)); });
  await p.goto(`${BASE}/dev/music?stage=perform`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  /** The room from its splash: the kick-and-snare beat, playing, in PERFORM (a REPLAY remounts it on an empty grid). */
  const freshRoom = async () => {
    await p.getByRole('button', { name: 'TAP TO START' }).waitFor({ timeout: 240000 });
    await p.getByRole('button', { name: 'TAP TO START' }).click();
    await p.waitForFunction(`(${GRID_EL}) != null`, undefined, { timeout: 60000 });
    await p.waitForTimeout(300);
    for (const s of [0, 8]) await clickCell(p, 0, s);               // kick 1 & 3
    for (const s of [4, 12]) await clickCell(p, 1, s);              // snare 2 & 4
    await btn(p, 'PLAY').click();
    await p.waitForTimeout(600);
    await btn(p, 'PERFORM').click();
    await p.waitForTimeout(200);
  };
  /** The dev route's end card (GameShell's stand-in) covers the room: its REPLAY remounts it, as the shell's does. */
  const replay = async () => { await p.locator('[data-dev="replay"]').click(); await p.waitForTimeout(300); };
  await freshRoom();
  R.calibrateLink = await p.evaluate(() => { const a = document.querySelector('[data-qa="academy-calibrate"]'); return a ? { href: a.getAttribute('href'), target: a.getAttribute('target'), text: a.textContent } : null; });

  // 1. a click on TAP, then Enter held with 20 OS repeats
  await p.waitForTimeout(200);
  const tap = p.locator('[data-qa="perform-tap"]');
  await tap.click();
  for (let i = 0; i < 21; i++) { await p.keyboard.down('Enter'); await p.waitForTimeout(30); }
  await p.keyboard.up('Enter');
  await p.waitForTimeout(600);
  await btn(p, 'END SET').click();
  await p.waitForTimeout(300);
  const e1 = await ended(p);
  R.heldEnter = { tapsCounted: (e1?.stats?.hits ?? 0) + (e1?.stats?.extras ?? 0), stats: e1?.stats ?? null,
    how: 'mouse click on TAP (focuses it) + keyboard.down("Enter") ×21 (Playwright marks the 2nd+ as repeat) + up; taps = hits + extras of the set' };
  log('held Enter', JSON.stringify(R.heldEnter));

  // 2. quarter notes on the beat for 9 bars
  await replay(); await freshRoom();
  const q = await p.evaluate(PLAY_BOT, ['quarters', 9, 0]);
  await btn(p, 'END SET').click();
  await p.waitForTimeout(300);
  const e2 = await ended(p);
  R.quarterPlayer = { bot: q, won: e2?.won, outcome: e2?.outcome, headline: e2?.headline, stats: e2?.stats };
  log('quarters', JSON.stringify(R.quarterPlayer));

  // 3. a masher at 10 taps/s for 9 bars
  await replay(); await freshRoom();
  const m = await p.evaluate(PLAY_BOT, ['mash', 9, 10]);
  await btn(p, 'END SET').click();
  await p.waitForTimeout(300);
  const e3 = await ended(p);
  R.masher10 = { bot: m, won: e3?.won, outcome: e3?.outcome, headline: e3?.headline, stats: e3?.stats };
  log('masher', JSON.stringify(R.masher10));
  await p.screenshot({ path: `${OUT}/fixpass-music-perform.png` });
}

async function dance(): Promise<void> {
  if (process.env.SKIP_DANCE) return;
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: ARGS });
  try { await danceIn(browser); } finally { await browser.close().catch(() => undefined); }
}
async function danceIn(browser: Awaited<ReturnType<typeof chromium.launch>>): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(CAL);
  await ctx.addInitScript({ content: `window.__name = window.__name || function (f) { return f; };
    (() => { const mk = () => ({ pressed: false, touched: false, value: 0 });
      const pad = { index: 0, id: 'fake (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: Date.now(), buttons: Array.from({ length: 17 }, mk) };
      navigator.getGamepads = () => [pad];
      window.__padBtn = (i, v) => { pad.buttons[i] = { pressed: v > 0.1, touched: v > 0, value: v }; pad.timestamp = Date.now(); }; })();` });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { R.pageErrors.push(`dance: ${String(e).slice(0, 300)}`); log('PAGEERROR', String(e).slice(0, 200)); });
  await p.goto(`${BASE}/dev/mode/dance?track=cypher`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForFunction(() => /· ready|· playing/.test(document.querySelector('pre')?.previousElementSibling?.textContent ?? ''), undefined, { timeout: 240000 });
  // hook the judge (DancePerformance.hit) through the dev server's module cache, as _dance-p2-timing.mts does
  const hooked = await p.evaluate(`(() => {
    if (!window.__wreq) { try { self.webpackChunk_N_E.push([['p2fix' + Date.now()], {}, (r) => { window.__wreq = r; }]); } catch (e) { return String(e); } }
    const mod = Object.values(window.__wreq.c).find((m) => { try { return m && m.exports && m.exports.DancePerformance; } catch (e) { return false; } });
    if (!mod) return 'no DanceCore';
    const P = mod.exports.DancePerformance.prototype;
    if (!P.__p2fix) { P.__p2fix = true; window.__J = [];
      const oh = P.hit; P.hit = function (now) { const r = oh.call(this, now); window.__J.push({ k: 'hit', label: r, at: now, miss: this.counts.MISS }); return r; };
      const ou = P.update; P.update = function (now) { const m = this.counts.MISS; ou.call(this, now); if (this.counts.MISS > m) window.__J.push({ k: 'expire', n: this.counts.MISS - m, at: now }); }; }
    return 'ok';
  })()`);
  R.danceHook = hooked;
  await p.evaluate(() => (window as Any).__padBtn(0, 1)); await p.waitForTimeout(90); await p.evaluate(() => (window as Any).__padBtn(0, 0));
  // wait for the count-in to be armed, then press SPACE when the heard clock is 30 ms before beat 0
  const res = await p.evaluate(async () => {
    const w = window as Any;
    for (let i = 0; i < 20000; i++) {
      const st = w.__FEL_DEV__?.danceClock?.state?.();
      if (st && st.phase === 'countin' && st.startAt > 0 && !st.paused) break;
      await new Promise((r) => setTimeout(r, 2));
    }
    const dc = w.__FEL_DEV__.danceClock; const st = dc.state();
    const target = st.startAt - 0.030;
    while (dc.heard() < target) await new Promise((r) => setTimeout(r, 1));
    const heard = dc.heard(), phase = dc.state().phase;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
    await new Promise((r) => setTimeout(r, 70));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }));
    await new Promise((r) => setTimeout(r, 900));
    return { pressHeardVsBeat0Ms: +((heard - st.startAt) * 1000).toFixed(1), phaseAtPress: phase, latencySec: st.latencySec, latencyFrom: st.latencyFrom, judge: (w.__J ?? []).slice(0, 4) };
  });
  R.danceBeat0 = res;
  log('dance beat 0', JSON.stringify(res));
}

async function main() {
  try { await academy(); } catch (e) { R.academyError = String(e).slice(0, 400); log('academy failed', R.academyError); }
  try { await dance(); } catch (e) { R.danceError = String(e).slice(0, 400); log('dance failed', R.danceError); }
  const out = `${OUT}/fixpass-smoke${process.env.SKIP_DANCE ? '-music' : ''}.json`;
  fs.writeFileSync(out, JSON.stringify(R, null, 2));
  log('wrote', out);
  process.exit(0);
}
void main();
