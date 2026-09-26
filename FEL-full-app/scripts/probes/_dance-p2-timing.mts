// MUSIC-SUITE P2 (2026-09-25) — the Cypher's clock, input and sound graph, re-measured on /dev/mode/dance after the fix.
//
// P1's _dance-baseline.mts measured the bugs (BASELINE.md §2a); this runs the same tests against the P2 room and adds
// the ones P2 promises. The judge is read the same way (DancePerformance.hit / update wrapped through the dev server's
// webpack module cache); the song clock's mapping comes from the dev-only seam DanceMode now publishes
// (__FEL_DEV__.danceClock: song time is not the audio clock once the game has been held — READY counts too), so every
// press "on the beat" is timed on the clock the judge actually uses (heard = song − latency).
//
// Runs (one page at a time): (1) the pick screen — d-pad browsing at +2 / +4 / +5.5 s and the 6 s auto-start, the top
// chip's calibration line; (2) ?track=cypher — (a) R2 held 1 s in a step gap, (a2) an R2 pull on a step's beat,
// (b) SPACE held 1 s in a gap, (c) three SPACE taps (two key-DOWN on the beat, one key-UP on the beat), (d) pad START
// pause for 5 s + START resume (the song clock, the MISS burst, past-time audio starts, the count back in), (e) an in-page
// bot pressing SPACE ON the beat (0 ms lead: the "aim at the step" player P1 scored 1,170, grade D) for every step no test
// uses, and the results.
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_dance-p2-timing.mts   (BASE, OUT env override)
import { chromium, type Page, type Browser } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p2';
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[dance-p2 +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), frames: {}, pageErrors: [] as string[], console: [] as string[] };
const frame = async (p: Page, name: string) => { const path = `${OUT}/dance-${name}.png`; await p.screenshot({ path }); R.frames[name] = path; log('frame', path); };

const INIT = `
window.__name = window.__name || function (f) { return f; };
(() => {
  const mk = () => ({ pressed: false, touched: false, value: 0 });
  const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: Date.now(), buttons: Array.from({ length: 17 }, mk) };
  navigator.getGamepads = () => [pad];
  window.__padBtn = (i, v) => { pad.buttons[i] = { pressed: v > 0.1, touched: v > 0, value: v }; pad.timestamp = Date.now(); };
  const AC = window.AudioContext;
  window.__ACS = [];
  window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__ACS.push(this); } };
  window.__STARTS = [];   // [wall ms, ctx index, ctx currentTime at the call, scheduled when]
  for (const proto of [AudioScheduledSourceNode.prototype, AudioBufferSourceNode.prototype]) {
    if (!Object.prototype.hasOwnProperty.call(proto, 'start')) continue;
    const st = proto.start;
    proto.start = function (when, ...rest) {
      try { const L = window.__STARTS; L.push([performance.now(), window.__ACS.indexOf(this.context), this.context.currentTime, when ?? 0, (this.buffer && this.buffer.duration) || 0]); if (L.length > 40000) L.splice(0, 20000); } catch (e) {}
      return st.call(this, when, ...rest);
    };
  }
  window.__key = (type) => window.dispatchEvent(new KeyboardEvent(type, { key: ' ', code: 'Space', bubbles: true }));
})();`;

const HOOK = `(() => {
  if (!window.__wreq) { try { self.webpackChunk_N_E.push([['felprobe' + Date.now()], {}, (r) => { window.__wreq = r; }]); } catch (e) { return { ok: false, why: String(e) }; } }
  const r = window.__wreq;
  if (!r || !r.c) return { ok: false, why: 'no webpack module cache' };
  const mod = Object.values(r.c).find((m) => { try { return m && m.exports && m.exports.DancePerformance; } catch (e) { return false; } });
  if (!mod) return { ok: false, why: 'DanceCore not in the module cache yet' };
  const P = mod.exports.DancePerformance.prototype;
  if (!P.__felWrapped) {
    P.__felWrapped = true;
    window.__DLOG = [];
    const oh = P.hit;
    P.hit = function (now) {
      const l0 = this.counts.MISS; const res = oh.call(this, now);
      // a MISS returned by hit() is always a wild tap (DanceCore registerMiss(undefined)); the signed delta comes from onJudged
      window.__DLOG.push({ k: 'hit', label: res, wild: res === 'MISS' && this.counts.MISS > l0, a: now, w: performance.now(), delta: window.__lastDelta ?? null });
      window.__DPERF = this; return res;
    };
    const ou = P.update;
    P.update = function (now) {
      window.__DPERF = this;
      if (!this.__felJudged) {
        this.__felJudged = true;
        const oj = this.onJudged;
        this.onJudged = (l, p, c, s, d) => { window.__lastDelta = d ?? null; return oj && oj(l, p, c, s, d); };
      }
      const m = this.counts.MISS; ou.call(this, now); const d = this.counts.MISS - m;
      if (d > 0) window.__DLOG.push({ k: 'expire', n: d, a: now, w: performance.now() });
    };
  }
  if (!window.__BUS && window.__FEL_DEV__ && window.__FEL_DEV__.input) {
    window.__BUS = [];
    window.__FEL_DEV__.input.on((e) => {
      if ((e.t === 'trigger' && e.side === 'R') || e.t === 'button') window.__BUS.push({ w: performance.now(), t: e.t, v: e.value, btn: e.btn, pressed: e.pressed, src: e.src });
      if (window.__BUS.length > 20000) window.__BUS.splice(0, 10000);
    });
  }
  return { ok: true, bus: !!window.__BUS, clock: !!(window.__FEL_DEV__ && window.__FEL_DEV__.danceClock) };
})()`;

const hud = (p: Page) => p.evaluate(() => {
  const pre = document.querySelector('pre'); const head = pre?.previousElementSibling?.textContent ?? '';
  let json: Any = null; try { json = JSON.parse(pre?.textContent ?? 'null'); } catch { /* mid-render */ }
  return { head, hud: json };
});
const now = (p: Page) => p.evaluate(() => performance.now());
const sleep = (p: Page, ms: number) => p.waitForTimeout(ms);
const clockState = (p: Page) => p.evaluate(() => (window as Any).__FEL_DEV__?.danceClock?.state?.() ?? null);

async function tally(p: Page, from: number, to: number): Promise<Any> {
  return p.evaluate(([a, b]) => {
    const L = ((window as Any).__DLOG ?? []).filter((e: Any) => e.w >= a && e.w <= b);
    const B = ((window as Any).__BUS ?? []).filter((e: Any) => e.w >= a && e.w <= b);
    const hits = L.filter((e: Any) => e.k === 'hit');
    return {
      judgedTaps: hits.length,
      judgements: hits.map((e: Any) => ({ label: e.label, wild: e.wild, deltaMs: e.delta === null ? null : +(+e.delta).toFixed(1) })),
      wildTaps: hits.filter((e: Any) => e.wild).length,
      expiredSteps: L.filter((e: Any) => e.k === 'expire').reduce((n: number, e: Any) => n + e.n, 0),
      busTriggerREvents: B.filter((e: Any) => e.t === 'trigger').length,
      busTriggerROver05: B.filter((e: Any) => e.t === 'trigger' && e.v > 0.5).length,
      busAPresses: B.filter((e: Any) => e.t === 'button' && e.btn === 'A' && e.pressed).map((e: Any) => e.src ?? 'pad'),
    };
  }, [from, to]);
}

async function bootMode(p: Page, url: string): Promise<void> {
  await p.addInitScript({ content: INIT });
  p.on('pageerror', (e) => { R.pageErrors.push(String(e).slice(0, 300)); log('PAGEERROR', String(e).slice(0, 200)); });
  p.on('console', (m) => {
    const s = m.text();
    if (/\[dev\] result|FEL-DANCE|DANCE-JUICE|no AudioContext/.test(s)) { R.console.push(s.slice(0, 600)); log('CON', s.slice(0, 200)); }
  });
  for (let attempt = 1; attempt <= 5; attempt++) {
    const errs = R.pageErrors.length;
    if (attempt === 1) await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
    else { log('reload after ChunkLoadError, attempt', attempt); await p.reload({ waitUntil: 'domcontentloaded', timeout: 300000 }); }
    const ok = await p.waitForFunction(() => /· ready|· playing/.test(document.querySelector('pre')?.previousElementSibling?.textContent ?? ''), undefined, { timeout: 240000 })
      .then(() => true).catch(() => false);
    if (ok) { R.bootAttempts = attempt; return; }
    if (!R.pageErrors.slice(errs).some((e: string) => /ChunkLoadError/.test(e))) throw new Error('mode never reached ready (no ChunkLoadError either)');
  }
  throw new Error('mode page chunk never loaded after 5 attempts');
}
async function padPress(p: Page, i: number, ms = 90): Promise<void> {
  await p.evaluate((b) => (window as Any).__padBtn(b, 1), i); await sleep(p, ms); await p.evaluate((b) => (window as Any).__padBtn(b, 0), i);
}

async function pickRun(browser: Browser): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await bootMode(p, `${BASE}/dev/mode/dance`);
  await padPress(p, 0);   // A wakes the harness (dropped as a gameplay press) — the pick screen stays up
  const w0 = await now(p);
  const rounds: Any[] = [];
  const sample = async () => { const h = await hud(p); rounds.push({ ms: Math.round((await now(p)) - w0), round: h.hud?.round ?? null, banner: h.hud?.banner ?? null }); };
  const browse: number[] = [];
  let shotCal = false;
  for (const at of [2000, 4000, 5500]) {
    while ((await now(p)) - w0 < at) { await sample(); if (!shotCal && /calibrate/i.test(String(rounds[rounds.length - 1].round))) { await frame(p, 'pick-calibrate'); shotCal = true; } await sleep(p, 250); }
    await padPress(p, 15, 60);   // d-pad right
    browse.push(Math.round((await now(p)) - w0));
  }
  let startedAtMs: number | null = null;
  for (let i = 0; i < 160; i++) {
    await sample();
    if (!shotCal && /calibrate/i.test(String(rounds[rounds.length - 1].round))) { await frame(p, 'pick-calibrate'); shotCal = true; }
    const b = String(rounds[rounds.length - 1].banner ?? '');
    if (/^[1-4]$/.test(b) || b === 'GO') { startedAtMs = rounds[rounds.length - 1].ms; break; }
    await sleep(p, 100);
  }
  const lastBrowse = browse[browse.length - 1];
  R.pick = {
    browseAtMs: browse, countInStartedMsAfterWake: startedAtMs,
    countInMsAfterLastBrowse: startedAtMs === null ? null : startedAtMs - lastBrowse,
    roundsSeen: [...new Set(rounds.map((r) => r.round))],
    how: 'pad A wakes; d-pad right (buttons[15]) at +2/+4/+5.5 s; count-in start = first HUD banner 4..1 or GO; the top chip (hud.round) sampled every 100–250 ms',
  };
  log('pick', JSON.stringify(R.pick));
  await ctx.close();
}

async function measuredRun(browser: Browser): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await bootMode(p, `${BASE}/dev/mode/dance?track=cypher`);
  let hook: Any = null;
  for (let i = 0; i < 100; i++) { hook = await p.evaluate(HOOK); if (hook.ok && hook.bus && hook.clock) break; await sleep(p, 200); }
  R.hook = hook;
  log('hook', JSON.stringify(hook));
  const wWake = await now(p);
  await padPress(p, 0);
  let started = false;
  for (let i = 0; i < 150; i++) { started = await p.evaluate(() => !!(window as Any).__DPERF?.running); if (started) break; await sleep(p, 100); }
  R.audio = await p.evaluate(() => {
    const w = window as Any; const g = w.__FEL_DEV__?.audio?.();
    return {
      contextsConstructed: w.__ACS.length, states: w.__ACS.map((c: AudioContext) => c.state),
      soundKitGraph: !!g, danceOnSoundKitContext: !!g && g.ctx === w.__ACS[0], musicBus: !!g?.music,
      outputLatency: w.__ACS[0]?.outputLatency ?? null, baseLatency: w.__ACS[0]?.baseLatency ?? null,
      how: 'every AudioContext constructed (init-script subclass); __FEL_DEV__.audio() is SoundKit.graph() (ModeHarness dev handle)',
    };
  });
  R.audio.msFromWakeToSong = Math.round((await now(p)) - wWake);
  R.clockAtStart = await clockState(p);
  log('audio', JSON.stringify(R.audio), JSON.stringify(R.clockAtStart));
  if (!started) { await frame(p, 'stuck-countin'); R.fatal = 'the song never started (count-in stuck)'; await ctx.close(); return; }
  const chart = await p.evaluate(() => { const d = (window as Any).__DPERF; return { steps: d.steps.length, bpm: d.bpm, beats: d.steps.map((s: Any) => s.beat), started: d.started }; });
  const bd = 60 / chart.bpm;
  const stepSec = (chart.beats as number[]).map((b) => +(b * bd).toFixed(3));
  R.chart = { ...chart, stepSec };
  log('chart', JSON.stringify(stepSec));
  /** Wait in-page until the judge's heard clock reaches song second `sec` (relative to beat 0) minus `leadSec`. */
  const untilHeard = (sec: number, leadSec = 0) => p.evaluate(async ([x, lead]) => {
    const w = window as Any; const dc = w.__FEL_DEV__.danceClock; const t = w.__DPERF.started + x - lead;
    while (dc.state().paused || dc.heard() < t) await new Promise((r) => setTimeout(r, 1));
    return dc.heard();
  }, [sec, leadSec] as [number, number]);

  // THE ON-BEAT BOT: SPACE key-down the instant the heard clock reaches each step it owns (0 ms lead) — the player P1's
  // "intent aimed at the step" modelled, whose just-late taps were wild MISSes (5 of 11). It stands still while the song
  // is held or counting back (a key-up A would RESUME a paused harness: any real press resumes).
  const TEST_STEPS = [2, 4, 5, 6];
  const botSteps = stepSec.map((_, i) => i).filter((i) => !TEST_STEPS.includes(i));
  await p.evaluate(([own]) => {
    const w = window as Any; const d = w.__DPERF; const bd2 = 60 / d.bpm; const dc = w.__FEL_DEV__.danceClock;
    const times = (own as number[]).map((i) => d.started + d.steps[i].beat * bd2);
    let k = 0; w.__BOT = [];
    const iv = setInterval(() => {
      if (k >= times.length) { clearInterval(iv); return; }
      const st = dc.state(); if (st.paused || !st.accepting) return;
      const h = dc.heard();
      if (h > times[k] + 0.1) { w.__BOT.push({ step: +(times[k] - d.started).toFixed(3), skipped: true }); k++; return; }
      if (h >= times[k]) {
        w.__key('keydown'); setTimeout(() => w.__key('keyup'), 70);
        w.__BOT.push({ step: +(times[k] - d.started).toFixed(3), pressHeardVsStepMs: +((h - times[k]) * 1000).toFixed(1) }); k++;
      }
    }, 1);
  }, [botSteps]);

  // (a) R2 held 1 s in the gap between the steps at 1.25 s and 6.25 s
  await untilHeard(2.5);
  const a0 = await now(p);
  await p.evaluate(() => (window as Any).__padBtn(7, 1));
  await sleep(p, 1000);
  await p.evaluate(() => (window as Any).__padBtn(7, 0));
  const a1 = await now(p);
  await sleep(p, 250);
  R.r2Hold = { ...(await tally(p, a0, a1 + 250)), heldMs: Math.round(a1 - a0), how: 'pad buttons[7] value 1 for 1000 ms in a step-free gap; judgements from the wrapped hit()' };
  log('R2 hold', JSON.stringify(R.r2Hold));

  // (a2) an R2 pull ON a step's beat (pull the instant the heard clock reaches it; the pad is read on the next frame)
  {
    await untilHeard(stepSec[2]);
    const w0 = await now(p);
    await p.evaluate(() => (window as Any).__padBtn(7, 1));
    await sleep(p, 150);
    await p.evaluate(() => (window as Any).__padBtn(7, 0));
    await sleep(p, 250);
    R.r2Pull = { step: stepSec[2], ...(await tally(p, w0, await now(p))), how: 'pad buttons[7] pulled when the heard clock reached the step, held 150 ms' };
    log('R2 pull', JSON.stringify(R.r2Pull));
  }
  await frame(p, 'mid-desktop');

  // (b) SPACE held 1 s in the gap between 8.75 s and 11.25 s
  await untilHeard(9.3);
  const b0 = await now(p);
  await p.keyboard.down(' ');
  await sleep(p, 1000);
  await p.keyboard.up(' ');
  const b1 = await now(p);
  await sleep(p, 250);
  R.spaceHold = { ...(await tally(p, b0, b1 + 250)), heldMs: Math.round(b1 - b0), how: 'keyboard.down(" ") … 1000 ms … keyboard.up(" ") in a step-free gap' };
  log('SPACE hold', JSON.stringify(R.spaceHold));

  // (c) SPACE taps: key DOWN on the beat (steps 4, 5), and key down 110 ms early so it comes UP on the beat (step 6)
  const taps: Any[] = [];
  for (const [i, lead] of [[4, 0], [5, 0], [6, 110]] as [number, number][]) {
    const res = await p.evaluate(async ([x, leadMs]) => {
      const w = window as Any; const dc = w.__FEL_DEV__.danceClock; const target = w.__DPERF.started + x - leadMs / 1000;
      while (dc.heard() < target) await new Promise((r) => setTimeout(r, 1));
      const l0 = (w.__DLOG ?? []).length;
      const downAt = performance.now(); const downHeard = dc.heard();
      w.__key('keydown');
      await new Promise((r) => setTimeout(r, 110));
      const upAt = performance.now();
      w.__key('keyup');
      await new Promise((r) => setTimeout(r, 120));
      const hits = (w.__DLOG ?? []).slice(l0).filter((e: Any) => e.k === 'hit');
      const h = hits[0];
      return { downVsTargetMs: +((downHeard - target) * 1000).toFixed(1), judgements: hits.length, label: h?.label ?? null, wild: h?.wild ?? null,
        deltaMs: h?.delta ?? null, judgedAt: h ? (h.w >= upAt - 1 ? 'key-UP' : 'key-DOWN') : 'none', judgedMsAfterDown: h ? +(h.w - downAt).toFixed(1) : null };
    }, [stepSec[i], lead] as [number, number]);
    taps.push({ step: stepSec[i], keyDownLeadMs: lead, ...res });
  }
  R.spaceTap = { taps, how: 'in-page KeyboardEvent keydown on window when the heard clock reached the step (lead 0) or 110 ms before it; keyup 110 ms later' };
  log('SPACE taps', JSON.stringify(taps));

  // (d) pause 5 s with pad START at song 20.6 s, resume with START
  await untilHeard(20.6);
  const songBefore = await p.evaluate(() => (window as Any).__FEL_DEV__.danceClock.song());
  const d0 = await now(p);
  await padPress(p, 9);
  await sleep(p, 300);
  const pausedState = await clockState(p);
  const songPaused1 = await p.evaluate(() => (window as Any).__FEL_DEV__.danceClock.song());
  await sleep(p, 4700);
  const songPaused2 = await p.evaluate(() => (window as Any).__FEL_DEV__.danceClock.song());
  const r0 = await now(p);
  await padPress(p, 9);
  // the count back in: sample the banner and the clock through it
  const back: Any[] = [];
  for (let i = 0; i < 16; i++) {
    const [h, st, s] = await Promise.all([hud(p), clockState(p), p.evaluate(() => (window as Any).__FEL_DEV__.danceClock.song())]);
    back.push({ ms: Math.round((await now(p)) - r0), banner: h.hud?.banner ?? null, countingBack: st?.countingBack, accepting: st?.accepting, song: +(+s).toFixed(3) });
    if (i === 3) {
      // MUSIC-SUITE P2 live-proof pass (2026-09-25): the dev perf overlay sits over the top of the HUD readout, where the
      // count-back's "banner" line is — hide it for this one frame (and a close-up of the readout), then put it back.
      const box = await p.evaluate(() => {
        const perf = [...document.querySelectorAll('div')].filter((d) => /fps\s+avg/.test(d.textContent ?? '') && getComputedStyle(d).position === 'fixed')
          .sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length)[0] as HTMLElement | undefined;
        if (perf) { perf.dataset.probeHidden = perf.style.visibility || 'visible'; perf.style.visibility = 'hidden'; }
        const r = document.querySelector('pre')?.parentElement?.getBoundingClientRect();
        return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
      });
      await frame(p, 'countback');
      if (box) { const path = `${OUT}/dance-countback-hud.png`; await p.screenshot({ path, clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.min(1280, box.w), height: Math.min(800, box.h) } }); R.frames['countback-hud'] = path; }
      await p.evaluate(() => { const el = document.querySelector('[data-probe-hidden]') as HTMLElement | null; if (el) { el.style.visibility = el.dataset.probeHidden === 'visible' ? '' : (el.dataset.probeHidden ?? ''); delete el.dataset.probeHidden; } });
    }
    await sleep(p, 180);
  }
  await sleep(p, 600);
  const pauseTally = await tally(p, d0 + 50, r0);
  const resumeTally = await tally(p, r0, r0 + 3000);
  const bursts = await p.evaluate(([pa, ra]) => {
    const S3 = (window as Any).__STARTS as number[][];
    const win = (a: number, b: number) => S3.filter((s) => s[0] >= a && s[0] < b);
    const past = (L: number[][]) => L.filter((s) => s[3] > 0 && s[3] < s[2] - 0.005);
    // MUSIC-SUITE P2 live-proof pass (2026-09-25): WHAT the starts right after the resume are — P1 found 2 sounds
    // scheduled 0.735 s in the past there. Each start: ms after the resume press, how far ahead of the clock it was
    // scheduled (negative = in the past), and its buffer's length (a stem is seconds long, a kit hit or click is short).
    // Per-100 ms counts for the 1 s after the resume vs the 1 s before the pause press, for comparison.
    const per100 = (a: number) => Array.from({ length: 10 }, (_, i) => win(a + i * 100, a + (i + 1) * 100).length);
    return {
      startsWhilePaused: win(pa + 300, ra).length,
      startsIn300msAfterResume: win(ra, ra + 300).length,
      pastTimeStartsIn3sAfterResume: past(win(ra, ra + 3000)).length,
      pastTimeStartsWholeRunSoFar: past(S3).length,
      resumeStartsDump: win(ra, ra + 1000).map((s) => ({ msAfterResumePress: +(s[0] - ra).toFixed(1), aheadSec: s[3] > 0 ? +(s[3] - s[2]).toFixed(3) : 'now (start() with no time)', bufferSec: +(+s[4]).toFixed(2) })),
      startsPer100msAfterResume: per100(ra),
      startsPer100msOrdinaryBeforePause: per100(pa - 1100),
    };
  }, [d0, r0]);
  R.pause = {
    pausedMs: Math.round(r0 - d0), songAtPausePress: songBefore, songJustAfterPause: songPaused1, songAfter5s: songPaused2,
    clockWhilePaused: pausedState, countBack: back, duringPause: pauseTally, first3sAfterResume: resumeTally, audio: bursts,
    how: 'pad START (buttons[9]) at heard song 20.6 s → harness paused; 5 s; START again resumes. Song time from __FEL_DEV__.danceClock; MISS burst = steps the wrapped update() expired after the resume; audio = source starts on the (one) context, past-time = scheduled more than 5 ms behind the clock at the call',
  };
  log('pause', JSON.stringify(R.pause).slice(0, 1500));

  // results
  let result: string | null = null;
  for (let i = 0; i < 500; i++) {
    result = R.console.find((s: string) => s.includes('[dev] result')) ?? null;
    if (result) break;
    await sleep(p, 150);
  }
  await sleep(p, 1200);
  await frame(p, 'results');
  const endHud = (await hud(p)).hud;
  R.results = await p.evaluate(() => {
    const w = window as Any; const d = w.__DPERF; const L = w.__DLOG ?? [];
    const hits = L.filter((e: Any) => e.k === 'hit');
    return { counts: d?.counts, score: d?.score, maxCombo: d?.maxCombo, judgedTaps: hits.length, wildTaps: hits.filter((e: Any) => e.wild).length,
      expiredSteps: L.filter((e: Any) => e.k === 'expire').reduce((n: number, e: Any) => n + e.n, 0), bot: w.__BOT,
      clockAtEnd: w.__FEL_DEV__?.danceClock?.state?.() ?? null };
  });
  R.results.consoleResult = result;
  R.results.endBanner = endHud?.banner ?? null;
  // the bot's own presses: every one it made, and what each was judged
  R.results.botJudgements = await p.evaluate(() => {
    const w = window as Any; const L = (w.__DLOG ?? []).filter((e: Any) => e.k === 'hit');
    return L.map((e: Any) => ({ label: e.label, wild: e.wild, deltaMs: e.delta === null ? null : +(+e.delta).toFixed(1) }));
  });
  log('results', JSON.stringify(R.results).slice(0, 900));
  await ctx.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ARGS });
  try {
    if (!process.env.SKIP_PICK) await pickRun(browser);
    await measuredRun(browser);
  } catch (e) { R.fatal = String((e as Error)?.stack ?? e).slice(0, 1200); console.error(e); }
  finally {
    await browser.close();
    R.runtimeSec = Math.round((Date.now() - t0) / 1000);
    fs.writeFileSync(`${OUT}/dance-p2-timing.json`, JSON.stringify(R, null, 2));
    log('wrote', `${OUT}/dance-p2-timing.json`);
  }
}
main();
