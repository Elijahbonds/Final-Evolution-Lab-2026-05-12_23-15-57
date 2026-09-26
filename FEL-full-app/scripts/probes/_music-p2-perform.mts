// MUSIC-SUITE P2 (2026-09-25) — the Groove Academy's timing and PERFORM judge, checked in a real browser on the lane's
// dev server (/dev/music: the real StudioMode, no GameShell; its window.__FEL_STUDIO__ hook publishes the scheduled step
// times on the engine's own clock). What it checks, each with how:
//   1. LIVE SWING — the scheduled step times at 92 BPM, swing 0 / 15 / 40 %: bar length, effective BPM, the off-beat
//      16th's delay against the straight grid (P1: 88.7 BPM at 15 %, reverse swing).
//   2. THE JUDGE — at 60 BPM (a 16th is 250 ms, so a ±100 ms tap cannot be nearer another note), taps at 0 / ±40 / ±100 ms
//      from a scheduled note, by three inputs: a pointerdown on TAP, keydown J, keydown Space. The status line's word.
//   3. INPUT — a real mouse click on TAP is ONE tap (pointerdown taps, the click after it does not); a held key (repeat)
//      is no tap; a Flip pad key ('1') is no tap; Space with PLAY focused taps and does not stop the music.
//   4. THE WIN — 160 BPM, every note tapped on time (keydown J) for 9 bars, END SET: the result the room reported.
//      Then one tap and END SET (P1: won). Then an EMPTY grid (P1: 355 notes a minute).
//   5. The Calibrate link's href. A frame of PERFORM with a GOOD · LATE on screen.
//
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p2-perform.mts   (BASE, OUT env override)
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p2';
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p2 +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), route: '/dev/music?stage=perform', pageErrors: [] as string[] };

const GRID_EL = `[...document.querySelectorAll('div')].find((d) => (d.style.gridTemplateColumns || '').includes('repeat(16'))`;
async function clickCell(p: Page, row: number, step: number): Promise<void> {
  await p.evaluate(`(() => { const g = ${GRID_EL}; g.children[${row} * 17 + 1 + ${step}].click(); })()`);
}
const btn = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).first();
/** Set a labelled range input the way a drag does (React listens to 'input'). */
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

/**
 * In-page: aim at a note `offsetMs` away, fire `how` at that moment on the engine clock, and report the first verdict the
 * status line shows after it (a tap before its note is scheduled WAITS and settles when the scheduler reaches the note).
 * The note is PREDICTED from the last scheduled step + whole steps of `stepSec` — exact, because the grid no longer
 * drifts (swing 0 here) — so a tap can be aimed at a note that is not scheduled yet.
 */
const TAP_AT = `async ([offsetMs, how, stepSec]) => {
  const P = window.__FEL_STUDIO__;
  const tap = [...document.querySelectorAll('button')].find((b) => b.textContent === 'TAP');
  const el = document.querySelector('[data-qa="perform-status"]');
  const last = P.steps[P.steps.length - 1];
  if (!last) return { err: 'nothing scheduled' };
  let target = last.time;
  while (target + offsetMs / 1000 - P.now() < 0.03) target += stepSec;
  const seen = [];
  const mo = new MutationObserver(() => seen.push({ at: P.now(), text: el.textContent }));
  mo.observe(el, { childList: true, characterData: true, subtree: true });
  const at = target + offsetMs / 1000;
  while (P.now() < at) await new Promise((r) => setTimeout(r, 0));
  const tapAt = P.now();
  const scheduledAtTap = P.steps.some((s) => Math.abs(s.time - target) < 1e-6);
  if (how === 'pointer') tap.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'touch', isPrimary: true }));
  else document.body.dispatchEvent(new KeyboardEvent('keydown', { key: how === 'space' ? ' ' : how, code: how === 'space' ? 'Space' : '', bubbles: true, cancelable: true }));
  if (how !== 'pointer') document.body.dispatchEvent(new KeyboardEvent('keyup', { key: how === 'space' ? ' ' : how, bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 220));
  mo.disconnect();
  const verdict = seen.find((x) => /PERFECT|GOOD|EXTRA/.test(x.text))?.text ?? null;
  const scheduledTarget = P.steps.find((s) => Math.abs(s.time - target) < 1e-6);
  return { offsetMs, how, landedMs: +((tapAt - target) * 1000).toFixed(1), noteScheduledAtTap: scheduledAtTap,
    predictionExact: !!scheduledTarget, verdict, settledAfterMs: verdict ? +((seen.find((x) => x.text === verdict).at - tapAt) * 1000).toFixed(1) : null };
}`;

/** In-page: tap (keydown J) every scheduled note for `sec` seconds, each at its own time. */
const TAP_ALL = `async (sec) => {
  const P = window.__FEL_STUDIO__;
  const end = P.now() + sec; const done = new Set(); let taps = 0; const errs = [];
  while (P.now() < end) {
    const now = P.now();
    for (const s of P.steps) {
      const k = s.time.toFixed(5);
      if (done.has(k) || s.time > now) continue;
      done.add(k);
      if (now - s.time > 0.05) continue;               // a note already well past when first seen: leave it
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true }));
      taps++; errs.push((now - s.time) * 1000);
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  errs.sort((a, b) => a - b);
  return { taps, errMsMedian: errs[Math.floor(errs.length / 2)], errMsMax: errs[errs.length - 1] };
}`;

async function run(): Promise<void> {
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: ARGS });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // a saved calibration of 0 ms: the judge's latency is exactly 0, so the offsets below are the judge's own errors
  // (MUSIC-SUITE P2 FIX PASS: with its measured-at date — an undated offset is a pre-P2 reading, and the rooms ignore it)
  await ctx.addInitScript(() => { try { localStorage.setItem('fel.audioOffsetMs', '0'); localStorage.setItem('fel.audioOffsetMeasuredAt', String(Date.now())); } catch { /* none */ } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => R.pageErrors.push(String(e)));
  await p.goto(`${BASE}/dev/music?stage=perform`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await p.getByRole('button', { name: 'TAP TO START' }).waitFor({ timeout: 240000 });
  await p.getByRole('button', { name: 'TAP TO START' }).click();
  await p.waitForFunction(`(${GRID_EL}) != null`, undefined, { timeout: 60000 });
  await p.waitForTimeout(300);
  // (MUSIC-SUITE P2 FIX PASS: the link opens a new tab and reads 'Calibrate ↗')
  R.calibrateHref = await p.evaluate(() => [...document.querySelectorAll('a')].find((a) => (a.textContent || '').startsWith('Calibrate'))?.getAttribute('href') ?? null);
  R.audio = await p.evaluate(() => { const c = (window as Any).__FEL_STUDIO__; return { now: c?.now() ?? null }; });

  // a beat: kick 0/4/8/12, snare 4/12, hats on the eighths
  for (const s of [0, 4, 8, 12]) await clickCell(p, 0, s);
  for (const s of [4, 12]) await clickCell(p, 1, s);
  for (let s = 0; s < 16; s += 2) await clickCell(p, 2, s);

  // ── 1. live swing ──
  R.swing = [];
  for (const sw of [0, 15, 40]) {
    await setRange(p, 'SWING', sw);
    await p.evaluate(() => (window as Any).__FEL_STUDIO__.reset());   // the step ring: this run only
    await btn(p, 'PLAY').click();
    await p.waitForTimeout(3600);
    const steps = await p.evaluate(() => (window as Any).__FEL_STUDIO__.steps.map((s: Any) => ({ ...s })));
    const eng = await p.evaluate(() => (window as Any).__FEL_STUDIO__.engine());
    await btn(p, 'STOP').click();
    await p.waitForTimeout(200);
    const base = 60 / 92 / 4;
    const t0s = steps[0].time;                                   // step 0 of bar 1 (a fresh PLAY starts at step 0)
    const barStarts = steps.filter((s: Any) => s.step === 0).map((s: Any) => s.time);
    const barsSec = barStarts.slice(1).map((t: number, i: number) => +(t - barStarts[i]).toFixed(6));
    const offGrid = (odd: boolean) => [...new Set(steps.filter((s: Any, i: number) => (s.step % 2 === 1) === odd && i < 48)
      .map((s: Any, _j: number) => +(((s.time - t0s) - Math.round((s.time - t0s) / base - (odd ? sw / 200 : 0)) * base) * 1000).toFixed(2)))];
    R.swing.push({ swingPct: sw, engineSwing: eng?.swing, stepsSeen: steps.length, firstStep: steps[0].step, barsSec,
      effectiveBpm: +((4 * 60) / barsSec[0]).toFixed(3), offBeatDelayMs: offGrid(true), onBeatOffGridMs: offGrid(false),
      expectedOffBeatMs: +(sw / 100 * 0.5 * base * 1000).toFixed(2) });
    log('swing', JSON.stringify(R.swing[R.swing.length - 1]));
  }
  await setRange(p, 'SWING', 0);

  // ── 2. the judge at 60 BPM ──
  await setRange(p, 'BPM', 60);
  await btn(p, 'PLAY').click();
  await p.waitForTimeout(700);
  R.judge = [];
  for (const how of ['pointer', 'j', 'space']) {
    for (const off of [0, -40, 40, -110, 110, -200]) {
      R.judge.push(await p.evaluate(`(${TAP_AT})([${off}, '${how}', 0.25])`));
      await p.waitForTimeout(260);
    }
  }
  log('judge', JSON.stringify(R.judge.map((j: Any) => [j.how, j.offsetMs, j.landedMs, j.noteScheduledAtTap, j.verdict, j.settledAfterMs])));
  // a frame with a GOOD · LATE on screen
  await p.evaluate(`(${TAP_AT})([110, 'j', 0.25])`);
  await p.screenshot({ path: `${OUT}/music-perform-p2.png` });
  R.frame = `${OUT}/music-perform-p2.png`;

  // ── 3. input ──
  const scoreOf = async () => Number(/score (\d+)/.exec((await status(p)) ?? '')?.[1] ?? NaN);
  const comboOf = async () => Number(/combo x(\d+)/.exec((await status(p)) ?? '')?.[1] ?? NaN);
  R.input = {};
  // a real mouse click (pointerdown … click detail 1) = exactly one tap: the EXTRA/hit count moves once
  const extrasBefore = await p.evaluate(() => 0);
  void extrasBefore;
  const s0 = await status(p);
  await btn(p, 'TAP').click();
  await p.waitForTimeout(80);
  const s1 = await status(p);
  R.input.realMouseClick = { before: s0, after: s1 };
  // held J: the first keydown taps, repeats do not
  await p.waitForTimeout(300);
  const c0 = await comboOf(), sc0 = await scoreOf();
  await p.evaluate(() => {
    for (let i = 0; i < 20; i++) document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', repeat: true, bubbles: true, cancelable: true }));
  });
  await p.waitForTimeout(80);
  R.input.heldJRepeats = { scoreBefore: sc0, scoreAfter: await scoreOf(), comboBefore: c0, comboAfter: await comboOf(), status: await status(p) };
  // a Flip pad key on the STUDIO tab: nothing
  const f0 = await status(p);
  await p.keyboard.press('1');
  await p.waitForTimeout(80);
  R.input.padKey1 = { before: f0, after: await status(p) };
  // Space with PLAY/STOP focused: a tap, and the music keeps playing
  await btn(p, 'STOP').focus();
  const sp0 = await status(p);
  await p.keyboard.press(' ');
  await p.waitForTimeout(120);
  R.input.spaceOnFocusedStop = { before: sp0, after: await status(p), stillPlaying: (await btn(p, 'STOP').count()) === 1 };
  log('input', JSON.stringify(R.input));
  await btn(p, 'STOP').click();
  await p.waitForTimeout(200);

  // ── 4. the win: 160 BPM, 9 bars on time ──
  await btn(p, 'BUILD').click();
  await btn(p, 'PERFORM').click();           // a fresh set
  await setRange(p, 'BPM', 160);
  await btn(p, 'PLAY').click();
  R.onTime = await p.evaluate(`(${TAP_ALL})(${9 * 1.5 + 0.3})`);
  await btn(p, 'STOP').click();
  await p.waitForTimeout(400);
  await btn(p, 'END SET').click();
  await p.waitForTimeout(400);
  R.onTimeResult = await ended(p);
  log('on time', JSON.stringify(R.onTime), JSON.stringify(R.onTimeResult));
  await p.locator('[data-dev="replay"]').click();
  await p.getByRole('button', { name: 'TAP TO START' }).click();
  await p.waitForFunction(`(${GRID_EL}) != null`, undefined, { timeout: 60000 });
  await p.waitForTimeout(300);

  // one tap, then END SET (P1: score 100, won)
  for (const s of [0, 4, 8, 12]) await clickCell(p, 0, s);
  await btn(p, 'PLAY').click();
  await p.waitForTimeout(600);
  R.oneTap = await p.evaluate(`(${TAP_AT})([0, 'j', 60 / 92 / 4])`);
  await p.waitForTimeout(1500);
  await btn(p, 'STOP').click();
  await btn(p, 'END SET').click();
  await p.waitForTimeout(400);
  R.oneTapResult = await ended(p);
  log('one tap', JSON.stringify(R.oneTapResult));
  await p.locator('[data-dev="replay"]').click();
  await p.getByRole('button', { name: 'TAP TO START' }).click();
  await p.waitForFunction(`(${GRID_EL}) != null`, undefined, { timeout: 60000 });
  await p.waitForTimeout(300);

  // an EMPTY grid (the remount clears it): no notes; a tap is EXTRA
  await btn(p, 'PLAY').click();
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true })));
  await p.waitForTimeout(80);
  R.emptyStatus = await status(p);
  await btn(p, 'STOP').click();
  await btn(p, 'END SET').click();
  await p.waitForTimeout(400);
  R.emptyResult = await ended(p);
  log('empty', R.emptyStatus, JSON.stringify(R.emptyResult));

  await browser.close();
}

run()
  .catch((e) => { R.fatal = String(e?.stack ?? e); console.error(e); })
  .finally(() => {
    fs.writeFileSync(`${OUT}/music-p2-browser.json`, JSON.stringify(R, null, 1));
    log('wrote', `${OUT}/music-p2-browser.json`);
  });
