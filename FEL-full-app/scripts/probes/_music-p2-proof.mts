// MUSIC-SUITE P2 (2026-09-25) — LIVE PROOF for the Groove Academy on the lane's dev server (/dev/music: the real
// StudioMode, no GameShell). Phase 1 measured the bugs (outbox musicsuite/BASELINE.md 2b–2d, p1/music-baseline.json,
// p1/sim-baseline.json); this re-measures the numbers phase 2 promised, in a real browser, after the P2 fix pass.
//
// What is new against _music-p2-perform.mts (which read the live step times against the straight-grid FORMULA): the
// LIVE-VS-RENDER swing error here is the real thing — every AudioBufferSourceNode.start() is recorded by an init script,
// the live engine is captured through the dev server's webpack module cache (its scheduleStep/setState are wrapped to
// remember `this`), and after two... four bars of PLAY the SAME engine's renderMixdown(4) is run in the page, so the
// export's own start() times on its OfflineAudioContext are compared step by step with the live start() times on the
// AudioContext. P1's number was "bar-4 line 391 ms late, worst step 379 ms" at 15 % swing.
//
// Checks, each written to the JSON with how it was taken:
//   0. the header frame (the Calibrate link) and the link's href/target/text;
//   1. SWING 0 / 15 / 40 %: kick on all 16 steps at 92 BPM, 4 bars of PLAY, live start()s vs renderMixdown(4)'s
//      start()s: per-step error (max |err|), bar lines, the live loop's effective BPM (bar 1 and over 4 bars);
//   2. THE JUDGE at 92 BPM / swing 15 %, calibration 0 ms (dated), taps at −30 / 0 / +30 ms from a note, 4 each, by
//      the TAP control's pointerdown and by keydown J — on (A) a kick on every 16th (P1's "music running" case: −30 and
//      0 ms scored GOOD on the PREVIOUS note) and (B) the 14-cell beat (P1 browser: +11.5 ms GOOD, −28 ms GOOD);
//   3. THE WIN: (B) tapped on time for 9 bars → END SET; one tap then END SET at ~2 s; one tap then 9 bars untouched;
//   4. AN EMPTY GRID: PERFORM 5 s, one J, END SET — the notes the set offered (P1: 355 a minute, and a 200-point win);
//   5. A SHARD SPEND ASKS: CELL on the studio floor → the inline confirm (frame) → CANCEL → nothing spent.
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p2-proof.mts   (BASE, OUT env override)
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p2/proof';
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[proof +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), route: '/dev/music?stage=perform', frames: {}, pageErrors: [] as string[] };
const frame = async (p: Page, name: string, clip?: { x: number; y: number; width: number; height: number }) => {
  const path = `${OUT}/music-${name}.png`; await p.screenshot({ path, ...(clip ? { clip } : {}) }); R.frames[name] = path; log('frame', path);
};

// Calibration 0 ms, dated (an undated reading is ignored since the P2 fix pass), so the judge's latency is exactly 0 and
// every offset below is the judge's own error. Every source start is recorded with its context.
const INIT = `
window.__name = window.__name || function (f) { return f; };
try { localStorage.setItem('fel.audioOffsetMs', '0'); localStorage.setItem('fel.audioOffsetMeasuredAt', String(Date.now())); } catch (e) {}
(() => {
  window.__SRC = [];
  const st = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when, ...rest) {
    try { window.__SRC.push({ off: (typeof OfflineAudioContext !== 'undefined') && this.context instanceof OfflineAudioContext, ctx: this.context, now: this.context.currentTime, when: when ?? 0, buf: this.buffer }); if (window.__SRC.length > 20000) window.__SRC.splice(0, 10000); } catch (e) {}
    return st.call(this, when, ...rest);
  };
})();`;

const HOOK = `(() => {
  if (!window.__wreq) { try { self.webpackChunk_N_E.push([['musproof' + Date.now()], {}, (r) => { window.__wreq = r; }]); } catch (e) { return 'push failed: ' + e; } }
  const r = window.__wreq; if (!r || !r.c) return 'no module cache';
  const mod = Object.values(r.c).find((m) => { try { return m && m.exports && m.exports.AudioEngine && m.exports.AudioEngine.prototype.renderMixdown; } catch (e) { return false; } });
  if (!mod) return 'AudioEngine not in the module cache';
  const P = mod.exports.AudioEngine.prototype;
  if (!P.__proofWrapped) {
    P.__proofWrapped = true;
    const os = P.scheduleStep; P.scheduleStep = function (s, t) { window.__ENG = this; return os.call(this, s, t); };
    const ss = P.setState; P.setState = function (s) { window.__ENG = this; return ss.call(this, s); };
  }
  return 'ok';
})()`;

const GRID_EL = `[...document.querySelectorAll('div')].find((d) => (d.style.gridTemplateColumns || '').includes('repeat(16'))`;
const clickCell = (p: Page, row: number, step: number) => p.evaluate(`(() => { const g = ${GRID_EL}; g.children[${row} * 17 + 1 + ${step}].click(); })()`);
const litRow = (p: Page, row: number) => p.evaluate(`(() => { const g = ${GRID_EL}; return [...g.children].slice(${row} * 17 + 1, ${row} * 17 + 17).map((c, j) => getComputedStyle(c).backgroundColor === 'rgb(255, 179, 71)' ? j : -1).filter((j) => j >= 0); })()`) as Promise<number[]>;
async function setRow(p: Page, row: number, want: number[]): Promise<void> {
  const lit = new Set(await litRow(p, row));
  for (let s = 0; s < 16; s++) if (lit.has(s) !== want.includes(s)) await clickCell(p, row, s);
  await p.waitForTimeout(120);
}
const btn = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).first();
async function setRange(p: Page, label: string, v: number): Promise<void> {
  await p.evaluate(([l, val]) => {
    const inp = [...document.querySelectorAll('label')].find((x) => (x.textContent || '').startsWith(l as string))!.querySelector('input')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(inp, String(val));
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }, [label, v]);
  await p.waitForTimeout(120);
}
const status = (p: Page) => p.evaluate(() => document.querySelector('[data-qa="perform-status"]')?.textContent ?? null);
const ended = (p: Page) => p.evaluate(() => (window as Any).__FEL_STUDIO__?.ended ?? null);

async function freshRoom(p: Page): Promise<void> {
  await p.getByRole('button', { name: 'TAP TO START' }).waitFor({ timeout: 240000 });
  await p.getByRole('button', { name: 'TAP TO START' }).click();
  await p.waitForFunction(`(${GRID_EL}) != null`, undefined, { timeout: 60000 });
  await p.waitForTimeout(300);
  R.hook = await p.evaluate(HOOK);
}
const replay = async (p: Page) => { await p.locator('[data-dev="replay"]').click(); await p.waitForTimeout(300); await freshRoom(p); };

/**
 * In-page: the live start()s of the last PLAY vs renderMixdown(bars) on the same engine. `live` = the starts on the
 * engine's AudioContext whose buffer is the kick's (the row under test), in time order; `render` = the starts on the
 * OfflineAudioContext renderMixdown made. Both are taken relative to their own step 0 (the live grid is anchored at
 * start() + 0.05 s, the render at 0 s; step 0 is never swung).
 */
const LIVE_VS_RENDER = `async ([bars, bpm, sinceIdx]) => {
  const E = window.__ENG; const S = window.__SRC.slice(sinceIdx);
  const liveAll = S.filter((s) => !s.off && s.ctx === E.ctx);
  const counts = new Map(); for (const s of liveAll) counts.set(s.buf, (counts.get(s.buf) || 0) + 1);
  const kick = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const live = liveAll.filter((s) => s.buf === kick).map((s) => s.when).sort((a, b) => a - b);
  const mark = window.__SRC.length;
  await E.renderMixdown(bars);
  const render = window.__SRC.slice(mark).filter((s) => s.off).map((s) => s.when).sort((a, b) => a - b);
  const base = 60 / bpm / 4; const n = Math.min(render.length, live.length, bars * 16);
  const err = []; for (let i = 0; i < n; i++) err.push(((live[i] - live[0]) - (render[i] - render[0])) * 1000);
  const barLines = []; for (let b = 1; b <= bars; b++) if (live.length > b * 16) barLines.push({ bar: b, liveSec: +(live[b * 16] - live[0]).toFixed(6), renderGridSec: +(b * 16 * base).toFixed(6), errMs: +(((live[b * 16] - live[0]) - b * 16 * base) * 1000).toFixed(3) });
  const bar1 = live.length > 16 ? live[16] - live[0] : null;
  const barsN = live.length > bars * 16 ? (live[bars * 16] - live[0]) / bars : null;
  const odd = []; const even = [];
  for (let i = 0; i < Math.min(16, n); i++) (i % 2 ? odd : even).push(+(((live[i] - live[0]) - i * base) * 1000).toFixed(3));
  return {
    liveStarts: live.length, renderStarts: render.length, otherLiveStarts: liveAll.length - live.length, compared: n,
    maxAbsErrMs: +Math.max(...err.map(Math.abs)).toFixed(4), meanAbsErrMs: +(err.reduce((a, x) => a + Math.abs(x), 0) / n).toFixed(4),
    barLines, effectiveBpmBar1: bar1 ? +(240 / bar1).toFixed(3) : null, effectiveBpmOverBars: barsN ? +(240 / barsN).toFixed(3) : null,
    liveBar1OffGridMs: { onBeat16ths: even, offBeat16ths: odd }, expectedOffBeatDelayMs: +(E.state.swing * 0.5 * base * 1000).toFixed(3),
    engineSwing: E.state.swing, engineBpm: E.state.bpm,
  };
}`;

/**
 * In-page: aim `how` at a NOTE `offsetMs` away on the engine clock and report the verdict the status line shows. The
 * target is the first note (a step in `noteSteps`) far enough ahead — taken from the scheduled steps when it is already
 * scheduled, else predicted on the fixed grid (P2: step time = straight grid + swing on odd 16ths, never drifting).
 */
const TAP_AT = `async ([offsetMs, how, noteSteps, bpm, swing]) => {
  const P = window.__FEL_STUDIO__;
  const el = document.querySelector('[data-qa="perform-status"]');
  const tap = document.querySelector('[data-qa="perform-tap"]');
  const base = 60 / bpm / 4; const sd = (s) => (s % 2 === 1 ? swing * 0.5 * base : 0);
  for (let i = 0; i < 400 && !P.steps.length; i++) await new Promise((r) => setTimeout(r, 5));
  const last = P.steps[P.steps.length - 1]; if (!last) return { err: 'nothing scheduled' };
  const grid0 = last.time - sd(last.step);
  const lead = 0.045 + Math.max(0, -offsetMs / 1000);
  let target = null, targetStep = null;
  for (let k = 0; k < 64 && target === null; k++) {
    const st = (last.step + k) % 16; const t = grid0 + k * base + sd(st);
    if (noteSteps.includes(st) && t - P.now() > lead) { target = t; targetStep = st; }
  }
  const seen = [];
  const mo = new MutationObserver(() => seen.push({ at: P.now(), text: el.textContent }));
  mo.observe(el, { childList: true, characterData: true, subtree: true });
  const at = target + offsetMs / 1000;
  while (P.now() < at) await new Promise((r) => setTimeout(r, 0));
  const tapAt = P.now();
  const scheduledAtTap = P.steps.some((s) => Math.abs(s.time - target) < 1e-6);
  if (how === 'pointer') tap.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'touch', isPrimary: true }));
  else { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', code: 'KeyJ', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'j', code: 'KeyJ', bubbles: true })); }
  await new Promise((r) => setTimeout(r, 200));
  mo.disconnect();
  const v = seen.find((x) => /PERFECT|GOOD|EXTRA/.test(x.text));
  const word = v ? (/PERFECT/.test(v.text) ? 'PERFECT' : /GOOD/.test(v.text) ? 'GOOD' : 'EXTRA') : null;
  return { offsetMs, how, targetStep, landedMs: +((tapAt - target) * 1000).toFixed(1), noteScheduledAtTap: scheduledAtTap,
    predictionExact: P.steps.some((s) => Math.abs(s.time - target) < 1e-6), verdict: word, status: v ? v.text : el.textContent };
}`;

/** In-page: keydown J on every scheduled note (a step in noteSteps) the moment the engine clock reaches it, for `sec`. */
const TAP_ALL = `async ([sec, noteSteps]) => {
  const P = window.__FEL_STUDIO__;
  const end = P.now() + sec; const done = new Set(); let taps = 0; const errs = [];
  while (P.now() < end) {
    const now = P.now();
    for (const s of P.steps) {
      const k = s.time.toFixed(5);
      if (done.has(k) || s.time > now) continue;
      done.add(k);
      if (!noteSteps.includes(s.step) || now - s.time > 0.05) continue;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', code: 'KeyJ', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'j', code: 'KeyJ', bubbles: true }));
      taps++; errs.push((now - s.time) * 1000);
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  errs.sort((a, b) => a - b);
  return { taps, errMsMedian: +(errs[Math.floor(errs.length / 2)] ?? NaN).toFixed(2), errMsMax: +(errs[errs.length - 1] ?? NaN).toFixed(2) };
}`;

const ALL16 = Array.from({ length: 16 }, (_, i) => i);
const BEAT = { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] };
const BEAT_NOTES = [0, 2, 4, 6, 8, 10, 12, 14];

async function judgeRun(p: Page, label: string, noteSteps: number[]): Promise<Any> {
  await btn(p, 'BUILD').click();
  await btn(p, 'PERFORM').click();          // a fresh set
  await p.waitForTimeout(150);
  await btn(p, 'PLAY').click();
  await p.waitForTimeout(700);
  const taps: Any[] = [];
  for (let rep = 0; rep < 4; rep++) {
    for (const how of ['pointer', 'j']) {
      for (const off of [-30, 0, 30]) {
        taps.push(await p.evaluate(`(${TAP_AT})([${off}, '${how}', ${JSON.stringify(noteSteps)}, 92, 0.15])`));
        await p.waitForTimeout(90);
      }
    }
  }
  await btn(p, 'STOP').click();
  await p.waitForTimeout(150);
  const byOffset: Any = {};
  for (const off of [-30, 0, 30]) {
    const rows = taps.filter((t) => t.offsetMs === off);
    byOffset[off] = { taps: rows.length, PERFECT: rows.filter((t) => t.verdict === 'PERFECT').length, GOOD: rows.filter((t) => t.verdict === 'GOOD').length,
      EXTRA: rows.filter((t) => t.verdict === 'EXTRA').length, none: rows.filter((t) => !t.verdict).length,
      landedMs: [Math.min(...rows.map((t) => t.landedMs)), Math.max(...rows.map((t) => t.landedMs))],
      goodTexts: rows.filter((t) => t.verdict === 'GOOD').map((t) => t.status) };
  }
  log('judge', label, JSON.stringify(byOffset));
  return { pattern: label, bpm: 92, swing: 0.15, noteSteps, byOffset, taps };
}

async function run(): Promise<void> {
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: ARGS });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript({ content: INIT });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { R.pageErrors.push(String(e).slice(0, 300)); log('PAGEERROR', String(e).slice(0, 200)); });
  await p.goto(`${BASE}/dev/music?stage=perform`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await freshRoom(p);
  log('hook', R.hook);

  // ── 0. header + Calibrate link ──
  R.calibrateLink = await p.evaluate(() => { const a = document.querySelector('[data-qa="academy-calibrate"]'); return a ? { href: a.getAttribute('href'), target: a.getAttribute('target'), text: a.textContent, title: a.getAttribute('title') } : null; });
  await frame(p, 'proof-academy-header');
  const hb = await p.evaluate(() => { const a = document.querySelector('[data-qa="academy-calibrate"]'); const h = a?.parentElement?.getBoundingClientRect(); return h ? { x: h.x, y: h.y, w: h.width, h: h.height } : null; });
  if (hb) await frame(p, 'proof-academy-header-zoom', { x: Math.max(0, hb.x - 8), y: Math.max(0, hb.y - 8), width: Math.min(1280, hb.w + 16), height: hb.h + 70 });
  log('calibrate link', JSON.stringify(R.calibrateLink));

  // ── 1. swing: live start()s vs renderMixdown(4), kick on every 16th ──
  await setRow(p, 0, ALL16);
  await setRange(p, 'BPM', 92);
  R.swing = [];
  for (const sw of [0, 15, 40]) {
    await setRange(p, 'SWING', sw);
    const since = await p.evaluate(() => (window as Any).__SRC.length);
    await p.evaluate(() => (window as Any).__FEL_STUDIO__.reset());
    await btn(p, 'PLAY').click();
    await p.waitForTimeout(Math.round(4 * 16 * (60 / 92 / 4) * 1000) + 700);
    await btn(p, 'STOP').click();
    await p.waitForTimeout(250);
    const res = await p.evaluate(`(${LIVE_VS_RENDER})([4, 92, ${since}])`);
    R.swing.push({ swingPct: sw, ...(res as Any) });
    log('swing', sw, JSON.stringify(res));
  }
  R.swingHow = 'kick on all 16 steps at 92 BPM; SWING slider set; PLAY for 4 bars + 0.7 s; every AudioBufferSourceNode.start() recorded (init script); live = starts on the engine\'s AudioContext with the kick buffer; render = starts inside the SAME engine\'s renderMixdown(4) (OfflineAudioContext); err = (live_i − live_0) − (render_i − render_0) over 64 steps; effective BPM = 240 / (live bar length)';
  await setRange(p, 'SWING', 15);           // the default, for the judge

  // ── 2. the judge ──
  R.judge = [];
  R.judge.push(await judgeRun(p, 'A: kick on every 16th', ALL16));
  await setRow(p, 0, BEAT.kick); await setRow(p, 1, BEAT.snare); await setRow(p, 2, BEAT.hat);
  R.judge.push(await judgeRun(p, 'B: the 14-cell beat', BEAT_NOTES));
  R.judgeHow = 'calibration 0 ms (dated) so latency 0; each tap aimed on the engine clock (ctx.currentTime, 128-frame quanta) at a note ± offset (the note taken from the fixed grid: straight 16ths + swing × 0.5 × 16th on odd steps, checked against the scheduled steps), fired as a pointerdown on [data-qa=perform-tap] or keydown J on window; verdict = the first PERFECT/GOOD/EXTRA the [data-qa=perform-status] line shows within 200 ms';
  await p.evaluate(`(${TAP_AT})([30, 'j', ${JSON.stringify(BEAT_NOTES)}, 92, 0.15])`).catch(() => null);

  // ── 3. the win: (B) on time for 9 bars ──
  await btn(p, 'BUILD').click();
  await btn(p, 'PERFORM').click();
  await btn(p, 'PLAY').click();
  R.onTime = await p.evaluate(`(${TAP_ALL})([${9 * 16 * (60 / 92 / 4) + 0.4}, ${JSON.stringify(BEAT_NOTES)}])`);
  await btn(p, 'STOP').click();
  await p.waitForTimeout(300);
  await btn(p, 'END SET').click();
  await p.waitForTimeout(400);
  R.onTimeResult = await ended(p);
  log('on time 9 bars', JSON.stringify(R.onTime), JSON.stringify(R.onTimeResult?.stats), R.onTimeResult?.won);

  // one tap, END SET at ~2 s (P1 sim: score 100, won, +15 LC)
  await replay(p);
  await setRow(p, 0, BEAT.kick);
  await btn(p, 'PLAY').click();
  await p.waitForTimeout(600);
  R.oneTap = await p.evaluate(`(${TAP_AT})([0, 'j', [0, 4, 8, 12], 92, 0.15])`);
  await p.waitForTimeout(1500);
  await btn(p, 'STOP').click();
  await btn(p, 'END SET').click();
  await p.waitForTimeout(400);
  R.oneTapResult = await ended(p);
  log('one tap (short)', JSON.stringify(R.oneTap), JSON.stringify(R.oneTapResult));

  // one tap, then 9 bars left alone (bars >= 8 but accuracy ~3 %)
  await replay(p);
  await setRow(p, 0, BEAT.kick);
  await btn(p, 'PLAY').click();
  await p.waitForTimeout(600);
  R.oneTapLong = await p.evaluate(`(${TAP_AT})([0, 'j', [0, 4, 8, 12], 92, 0.15])`);
  await p.waitForTimeout(Math.round(9 * 16 * (60 / 92 / 4) * 1000) + 300);
  await btn(p, 'STOP').click();
  await btn(p, 'END SET').click();
  await p.waitForTimeout(400);
  R.oneTapLongResult = await ended(p);
  log('one tap (9 bars)', JSON.stringify(R.oneTapLongResult));

  // ── 4. an empty grid ──
  await replay(p);
  const litAll = await p.evaluate(`(() => { const g = ${GRID_EL}; return [...g.children].filter((c) => getComputedStyle(c).backgroundColor === 'rgb(255, 179, 71)').length; })()`);
  await btn(p, 'PLAY').click();
  await p.waitForTimeout(5000);
  await p.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', code: 'KeyJ', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'j', code: 'KeyJ', bubbles: true })); });
  await p.waitForTimeout(100);
  const emptyStatus = await status(p);
  const emptyAudible = await p.evaluate(() => ({ ...(window as Any).__FEL_STUDIO__.audible }));
  await btn(p, 'STOP').click();
  await btn(p, 'END SET').click();
  await p.waitForTimeout(400);
  R.empty = { litCells: litAll, playedSec: 5, statusAfterTap: emptyStatus, audibleHits: emptyAudible, result: await ended(p),
    how: 'REPLAY remounts on an empty grid; PERFORM, PLAY 5 s, one keydown J, END SET; notes = the set\'s own count (stats.notes)' };
  log('empty', JSON.stringify(R.empty));

  // ── 5. a shard spend asks first ──
  await replay(p);
  await btn(p, 'BUILD').click().catch(() => undefined);
  const spends0 = await p.evaluate(() => (window as Any).__FEL_STUDIO__.spends.length);
  const cell = p.getByRole('button', { name: /CELL: LAY A FOUNDATION/ });
  await cell.scrollIntoViewIfNeeded();
  await cell.click();
  const conf = p.locator('[data-qa="shop-confirm"]');
  await conf.waitFor({ timeout: 5000 });
  const confirmText = await conf.textContent();
  const spendsAsked = await p.evaluate(() => (window as Any).__FEL_STUDIO__.spends.length);
  await conf.scrollIntoViewIfNeeded();
  await frame(p, 'proof-shard-confirm');
  const cb = await conf.boundingBox();
  if (cb) await frame(p, 'proof-shard-confirm-zoom', { x: 0, y: Math.max(0, cb.y - 150), width: 1280, height: Math.min(900 - Math.max(0, cb.y - 150), cb.height + 260) });
  await p.locator('[data-qa="shop-no"]').click();
  await p.waitForTimeout(200);
  R.shardConfirm = { confirmText, spendsBeforeClick: spends0, spendsAfterClick: spendsAsked, confirmGoneAfterCancel: (await conf.count()) === 0,
    spendsAfterCancel: await p.evaluate(() => (window as Any).__FEL_STUDIO__.spends.length),
    how: 'CELL: LAY A FOUNDATION clicked; [data-qa=shop-confirm] waited for; the dev route logs every spend that reaches spendShards (only the confirm\'s yes does); CANCEL ([data-qa=shop-no])' };
  log('shard confirm', JSON.stringify(R.shardConfirm));
  await browser.close();
}

run()
  .catch((e) => { R.fatal = String(e?.stack ?? e).slice(0, 1500); console.error(e); })
  .finally(() => {
    R.runtimeSec = Math.round((Date.now() - t0) / 1000);
    fs.writeFileSync(`${OUT}/music-p2-proof.json`, JSON.stringify(R, null, 1));
    log('wrote', `${OUT}/music-p2-proof.json`);
    process.exit(0);
  });
