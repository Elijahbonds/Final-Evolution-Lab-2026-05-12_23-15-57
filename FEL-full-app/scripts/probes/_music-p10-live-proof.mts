// MUSIC-SUITE P10 (2026-09-29) — THE PHASE-1 DANCE BASELINE, TAKEN AGAIN LIVE on the lane's :3121 (next dev, .next-music,
// database pinned offline), plus the Flip lesson frames the P10 brief asks for. Probe only: no app code.
//
// Why a new file and not a re-run of _dance-baseline.mts (P1) or _dance-p2-timing.mts (P2): both time their tests on
// THE CYPHER's P7-era chart by the clock — "R2 held 1 s in the gap between the steps at 1.25 s and 6.25 s", "SPACE held
// in the gap 8.75 → 11.25 s", "pause at 20.6 s". P9 replaced that chart with an authored one (80 presses, 48 a minute,
// longest gap 2.5 s: p10/live/sim-baseline-now.json), so those fixed seconds now land ON steps and the numbers would
// measure the wrong thing. This probe asks the SAME questions of the chart the room is actually playing:
//   pick     BASELINE.md §2a "Pick screen": d-pad browsing at +2 / +4 / +5.5 s after the wake — does the count-in wait
//            for the player (P1: it started 6.07–6.28 s after the wake, mid-browse)?
//   timing   BASELINE.md §2a input rows, on ?track=cypher: the AudioContexts the room made (P1: 2, SoundKit 144–160 ms
//            behind); R2 held 1 s in a step-free gap (P1: 57 wild taps); an R2 pull ON a step's beat; SPACE held 1 s in a
//            gap (P1: 23); SPACE key-DOWN on the beat ×2 and 110 ms early ×1 (P1: judged on key-UP, 114–195 ms late,
//            GOOD); pad START pause 5 s + resume (P1: song ran on 24.2 → 28.9 s, 2 MISS in one frame, 2 sounds 0.735 s in
//            the past). The gaps / steps are found in the chart at run time (the first step-free gaps ≥ 1.5 s after
//            2 s; plain press steps — no hold, no freestyle slot — after each test). Every other step is danced by an
//            intent driver (so the song around the tests is not a wall of expiries), which never presses inside a test's
//            window. Then the song runs out and the result is read.
//   aim      BASELINE.md §2a "Tap just after the beat" + "Bots on THE CYPHER": the same full CYPHER danced three times by
//            an in-page driver on the judge's heard clock (__FEL_DEV__.danceClock), jitter 0 —
//              AT      every press at the step's own time (P1: 1,170, 16 %, grade D — its just-late taps were wild MISSes);
//              EARLY   every press one frame early, −16.7 ms (P1: 5,395, 93 %, grade A);
//              LATE    the P1 "input-first" offsets +1 / +5 / +15 / +30 ms cycled step by step (P1: all four a wild MISS).
//            Holds are held for their length, freestyle slots get J K L I in turn (the P9 intent driver's plan).
//   lesson   frames: the Flip tab's first visit (the CHOP THE FEL THEME card, FlipLesson.tsx) on desktop 1280×800 and on
//            the 390×844 phone profile.
// The judge is observed through the dev server's webpack module cache (DancePerformance.prototype.hit / update wrapped,
// every argument passed through — P9's hit(now, press) carries the freestyle pick, which the P2 probe's one-argument
// wrapper would have dropped). Nothing is written to the room.
// Usage: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p10-live-proof.mts
//   (ONLY=pick,timing,aim,lesson  TRACK=cypher  OUT=<dir>)
import fs from 'node:fs';
import type { Page } from 'playwright-core';
import { BASE, assertDisk, launch, newPage, writeJson, sleep, DESKTOP, PHONE, type Any } from './_p10-lib.mts';

const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p10/live';
fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.env.ONLY ?? 'pick,timing,aim,lesson').split(',');
const TRACK = process.env.TRACK ?? 'cypher';
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p10-live +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const R: Any = { base: BASE, at: new Date().toISOString(), track: TRACK, disk: {}, frames: {}, errors: [] as string[] };
const save = () => writeJson(`${OUT}/dance-live-proof.json`, R);
const CAL = `try { localStorage.setItem('fel.audioOffsetMs', '0'); localStorage.setItem('fel.audioOffsetMeasuredAt', String(Date.now())); } catch (e) {}`;

/** Every audio source start on the page: [wall ms, ctx index in __ACS, ctx time at the call, when, buffer s]. */
const STARTS_INIT = `(() => {
  window.__STARTS = [];
  for (const proto of [AudioScheduledSourceNode.prototype, AudioBufferSourceNode.prototype]) {
    if (!Object.prototype.hasOwnProperty.call(proto, 'start') || Object.prototype.hasOwnProperty.call(proto, '__p10live')) continue;
    proto.__p10live = true;
    const st = proto.start;
    proto.start = function (when, ...rest) {
      try { const L = window.__STARTS; L.push([performance.now(), (window.__ACS || []).indexOf(this.context), this.context.currentTime, when ?? 0, (this.buffer && this.buffer.duration) || 0]); if (L.length > 40000) L.splice(0, 20000); } catch (e) {}
      return st.call(this, when, ...rest);
    };
  }
})()`;

/** The room's judge, observed: hits (label, wild, signed delta), expiries, and the room's instance as __DPERF. */
const JUDGE_HOOK = `(() => {
  if (!window.__wreq) { try { self.webpackChunk_N_E.push([['p10live' + Date.now()], {}, (r) => { window.__wreq = r; }]); } catch (e) { return { ok: false, why: String(e) }; } }
  const r = window.__wreq; if (!r || !r.c) return { ok: false, why: 'no webpack module cache' };
  const mod = Object.values(r.c).find((m) => { try { return m && m.exports && m.exports.DancePerformance; } catch (e) { return false; } });
  if (!mod) return { ok: false, why: 'DanceCore not in the module cache yet' };
  const P = mod.exports.DancePerformance.prototype;
  if (!P.__p10LiveWrapped) {
    P.__p10LiveWrapped = true; window.__DLOG = [];
    const oh = P.hit;
    P.hit = function (...a) {
      if (!this.__p10Room) return oh.apply(this, a);
      const m0 = this.counts.MISS; window.__lastDelta = null;
      const res = oh.apply(this, a);
      // hit() returns MISS only on its wild path (no pending or upcoming step inside MISS_AFTER — DanceCore.ts hit(), the
      // registerMiss(undefined, …) branch); a timed press is PERFECT / GREAT / GOOD. So a MISS answer IS a wild tap.
      window.__DLOG.push({ k: 'hit', label: res, wild: res === 'MISS' && this.counts.MISS > m0, a: a[0], w: performance.now(), delta: window.__lastDelta, key: a[1] && a[1].key ? a[1].key : null });
      if (window.__DLOG.length > 40000) window.__DLOG.splice(0, 10000);
      return res;
    };
    const ou = P.update;
    P.update = function (now) {
      if (!this.__p10Seen) {
        this.__p10Seen = true; this.__p10Room = !!this.onJudged;
        if (this.__p10Room) { const oj = this.onJudged; this.onJudged = (l, p, c, s, d) => { window.__lastDelta = d ?? null; return oj && oj(l, p, c, s, d); }; }
      }
      if (!this.__p10Room) return ou.call(this, now);
      window.__DPERF = this;
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

/**
 * The intent driver: presses each step of the room's chart at the step's heard time + offsetsMs[i % n] (jitter 0), holds
 * held for their length (+20 ms), freestyle slots J K L I in turn, every other press 'j' (key-down, key-up 60 ms later or
 * half-way to the next press). `skip` = step indices it leaves alone (a test's own steps). It stands still while the song
 * is paused or counting back, and passes over a step it is more than 100 ms late for (never a burst after a resume).
 * Every press is logged with its realised lateness on the heard clock (the aim, measured, not assumed).
 */
const DRIVER = `window.__drive = (o) => {
  const w = window, d = w.__DPERF, dc = w.__FEL_DEV__.danceClock;
  const bd = 60 / d.bpm, steps = d.steps, offs = o.offsetsMs && o.offsetsMs.length ? o.offsetsMs : [0];
  const skip = new Set(o.skip || []);
  const FREE = ['j', 'k', 'l', 'i'];
  const plan = []; let freeN = 0;
  for (let i = 0; i < steps.length; i++) {
    if (skip.has(i)) continue;
    const s = steps[i]; const t = d.started + s.beat * bd;
    const kind = s.pressFree ? 'free' : (s.pressHoldBeats > 0 ? 'hold' : (s.pressKind || 'move'));
    const off = offs[i % offs.length];
    let key = 'j'; if (kind === 'free') { key = FREE[freeN % 4]; freeN++; }
    const p = { i, t, at: t + off / 1000, off, key, kind };
    if (kind === 'hold') p.upAt = t + s.pressHoldBeats * bd + 0.02;
    plan.push(p);
  }
  for (let k = 0; k < plan.length; k++) { const p = plan[k]; if (p.kind === 'hold') continue; const nx = plan[k + 1]; p.upAt = p.at + Math.min(0.06, nx ? Math.max(0.01, (nx.at - p.at) * 0.5) : 0.06); }
  const ev = []; for (const p of plan) { ev.push({ at: p.at, type: 'keydown', p }); ev.push({ at: p.upAt, type: 'keyup', p }); }
  ev.sort((a, b) => a.at - b.at || (a.type === 'keyup' ? -1 : 1));
  let k = 0; w.__DRV = { steps: steps.length, planned: plan.length, done: false, pressed: [], passedOver: 0 };
  const iv = setInterval(() => {
    if (w.__DRV.stop) { clearInterval(iv); return; }
    const st = dc.state(); if (st.paused || st.countingBack) return;
    const h = dc.heard();
    while (k < ev.length && h >= ev[k].at) {
      const e = ev[k++];
      if (e.type === 'keydown' && h > e.at + 0.1) { e.p.passed = true; w.__DRV.passedOver++; continue; }
      if (e.type === 'keyup' && e.p.passed) continue;
      w.dispatchEvent(new KeyboardEvent(e.type, { key: e.p.key, bubbles: true }));
      if (e.type === 'keydown') w.__DRV.pressed.push({ i: e.p.i, off: e.p.off, kind: e.p.kind, lateMs: Math.round((h - e.at) * 10000) / 10 });
    }
    if (k >= ev.length) { clearInterval(iv); w.__DRV.done = true; }
  }, 1);
  return { steps: steps.length, planned: plan.length, bpm: d.bpm, lengthSec: Math.round(((steps[steps.length - 1].beat + (steps[steps.length - 1].pressHoldBeats || 0)) * bd) * 10) / 10 };
};`;

const now = (p: Page) => p.evaluate(() => performance.now());
const clockState = (p: Page) => p.evaluate(() => (window as Any).__FEL_DEV__?.danceClock?.state?.() ?? null);
const devHud = (p: Page) => p.evaluate(() => { try { return JSON.parse(document.querySelector('pre')?.textContent ?? 'null'); } catch { return null; } });
async function padPress(p: Page, i: number, ms = 90): Promise<void> {
  await p.evaluate((b) => (window as Any).__padBtn(b, 1), i); await p.waitForTimeout(ms); await p.evaluate((b) => (window as Any).__padBtn(b, 0), i);
}
/** Judgements + expiries + R-trigger / A bus events between two wall times. */
async function tally(p: Page, from: number, to: number): Promise<Any> {
  return p.evaluate(([a, b]) => {
    const L = ((window as Any).__DLOG ?? []).filter((e: Any) => e.w >= a && e.w <= b);
    const B = ((window as Any).__BUS ?? []).filter((e: Any) => e.w >= a && e.w <= b);
    const hits = L.filter((e: Any) => e.k === 'hit');
    return {
      judgedTaps: hits.length,
      judgements: hits.map((e: Any) => ({ label: e.label, wild: e.wild, deltaMs: e.delta == null ? null : +(+e.delta).toFixed(1), msFromWindowStart: +(e.w - a).toFixed(1) })),
      wildTaps: hits.filter((e: Any) => e.wild).length,
      expiredSteps: L.filter((e: Any) => e.k === 'expire').reduce((n: number, e: Any) => n + e.n, 0),
      busTriggerROver05: B.filter((e: Any) => e.t === 'trigger' && e.v > 0.5).length,
      busAPresses: B.filter((e: Any) => e.t === 'button' && e.btn === 'A' && e.pressed).map((e: Any) => e.src ?? 'pad'),
    };
  }, [from, to] as [number, number]);
}
/** Wait in-page until the judge's heard clock reaches song second `sec` (from the song's beat 0) minus `leadSec`. */
const untilHeard = (p: Page, sec: number, leadSec = 0) => p.evaluate(async ([x, lead]) => {
  const w = window as Any; const dc = w.__FEL_DEV__.danceClock; const t = w.__DPERF.started + x - lead;
  while (dc.state().paused || dc.heard() < t) await new Promise((r) => setTimeout(r, 1));
  return dc.heard() - w.__DPERF.started;
}, [sec, leadSec] as [number, number]);

async function openRoom(tag: string, query: string, profile: Any = DESKTOP): Promise<{ b: Any; ctx: Any; p: Page }> {
  R.disk[tag] = assertDisk(tag);
  const b = await launch();
  const ctx = await b.newContext(profile);
  for (const s of [CAL, STARTS_INIT]) await ctx.addInitScript({ content: s });
  const p = await newPage(ctx, R.errors, tag);
  p.on('console', (m) => { const s = m.text(); if (/\[dev\] result/.test(s)) (R.console ??= []).push(`${tag}: ${s.slice(0, 400)}`); });
  await p.goto(`${BASE}/dev/mode/dance${query}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForFunction(() => /· ready|· playing/.test(document.querySelector('pre')?.previousElementSibling?.textContent ?? ''), undefined, { timeout: 240000 });
  return { b, ctx, p };
}
async function hookAndWake(p: Page): Promise<Any> {
  let h: Any = null;
  for (let i = 0; i < 150; i++) { h = await p.evaluate(JUDGE_HOOK); if (h.ok && h.clock) break; await p.waitForTimeout(200); }
  await p.evaluate(DRIVER);
  const w = await now(p);
  await padPress(p, 0);   // A wakes the harness; on ?track= the count-in starts
  let running = false;
  for (let i = 0; i < 300; i++) { running = await p.evaluate(() => !!(window as Any).__DPERF?.running); if (running) break; await p.waitForTimeout(100); }
  return { hook: h, running, msFromWakeToSong: Math.round((await now(p)) - w) };
}
const result = (p: Page) => p.evaluate(() => {
  const w = window as Any; const d = w.__DPERF; const L = (w.__DLOG ?? []);
  const hits = L.filter((e: Any) => e.k === 'hit');
  const r = d?.result ? d.result() : null;
  return { result: r, gradeHud: null, judgedTaps: hits.length, wildTaps: hits.filter((e: Any) => e.wild).length,
    expiredSteps: L.filter((e: Any) => e.k === 'expire').reduce((n: number, e: Any) => n + e.n, 0), steps: d?.steps?.length ?? null };
});
async function waitSongEnd(p: Page, capMs = 200000): Promise<void> {
  const end = Date.now() + capMs;
  while (Date.now() < end) {
    const s = await p.evaluate(() => { const d = (window as Any).__DPERF; return d ? { running: d.running } : null; });
    if (s && !s.running) return;
    await p.waitForTimeout(500);
  }
}
/** The dev readout's end line (the room prints its grade there once the song ends). */
const readoutText = (p: Page) => p.evaluate(() => (document.querySelector('pre')?.textContent ?? '').slice(0, 1200));

// ── pick ────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function pickRun(): Promise<void> {
  const { b, ctx, p } = await openRoom('pick', '');
  try {
    await padPress(p, 0);
    const w0 = await now(p);
    const rounds: Any[] = [];
    const sample = async () => { const h = await devHud(p); rounds.push({ ms: Math.round((await now(p)) - w0), round: h?.round ?? null, banner: h?.banner ?? null }); };
    const browse: number[] = [];
    for (const at of [2000, 4000, 5500]) {
      while ((await now(p)) - w0 < at) { await sample(); await p.waitForTimeout(200); }
      await padPress(p, 15, 60);   // d-pad right
      browse.push(Math.round((await now(p)) - w0));
    }
    let startedAtMs: number | null = null;
    for (let i = 0; i < 200; i++) {
      await sample();
      const bn = String(rounds[rounds.length - 1].banner ?? '');
      if (/^[1-4]$/.test(bn) || bn === 'GO') { startedAtMs = rounds[rounds.length - 1].ms; break; }
      await p.waitForTimeout(100);
    }
    await p.screenshot({ path: `${OUT}/dance-pick.png` }); R.frames['dance-pick'] = `${OUT}/dance-pick.png`;
    R.pick = {
      browseAtMs: browse, countInStartedMsAfterWake: startedAtMs,
      countInMsAfterLastBrowse: startedAtMs === null ? null : startedAtMs - browse[browse.length - 1],
      roundsSeen: [...new Set(rounds.map((r) => r.round))].slice(0, 12),
      how: 'no ?track: pad A wakes; d-pad right (buttons[15]) at +2 / +4 / +5.5 s; the count-in start = the first HUD banner 4..1 or GO, timed from the wake on performance.now()',
    };
    log('pick', JSON.stringify(R.pick));
  } finally { await ctx.close(); await b.close(); }
}

// ── timing ──────────────────────────────────────────────────────────────────────────────────────────────────────────
async function timingRun(): Promise<void> {
  const { b, ctx, p } = await openRoom('timing', `?track=${TRACK}`);
  try {
    const w = await hookAndWake(p);
    R.timingHook = w;
    if (!w.running) { R.timingFatal = 'the song never started'; return; }
    R.audio = await p.evaluate(() => {
      const w2 = window as Any; const g = w2.__FEL_DEV__?.audio?.();
      const acs = w2.__ACS as AudioContext[];
      return { contextsConstructed: acs.length, states: acs.map((c) => c.state), danceOnSoundKitContext: !!g && g.ctx === acs[0],
        clockOffsetsMs: acs.map((c) => Math.round((c.currentTime - acs[0].currentTime) * 1000)),
        outputLatency: acs[0]?.outputLatency ?? null, how: 'every AudioContext constructed (the _p10-lib init subclass); SoundKit.graph() through the ModeHarness dev handle' };
    });
    // the chart the room is playing: press steps with their time from beat 0, their end (a hold's release) and kind
    const chart = await p.evaluate(() => {
      const d = (window as Any).__DPERF; const bd = 60 / d.bpm;
      return { bpm: d.bpm, steps: d.steps.map((s: Any, i: number) => ({ i, t: +(s.beat * bd).toFixed(4), end: +((s.beat + (s.pressHoldBeats || 0)) * bd).toFixed(4), hold: (s.pressHoldBeats || 0) > 0, free: !!s.pressFree })) };
    });
    R.chart = { bpm: chart.bpm, steps: chart.steps.length, holds: chart.steps.filter((s: Any) => s.hold).length, free: chart.steps.filter((s: Any) => s.free).length };
    const S = chart.steps as Any[];
    /** the first step-free gap of at least `len` s starting after `after` s: [gap start, gap end] */
    const gapAfter = (after: number, len: number): [number, number] | null => {
      let lastEnd = 0;
      for (const s of S) { if (s.t - lastEnd >= len && lastEnd >= after) return [lastEnd, s.t]; lastEnd = Math.max(lastEnd, s.end); }
      return null;
    };
    const plainAfter = (after: number): Any | null => S.find((s) => s.t >= after && !s.hold && !s.free) ?? null;
    const g1 = gapAfter(2, 1.5) ?? gapAfter(2, 1.3);
    if (!g1) { R.timingFatal = 'no step-free gap ≥ 1.3 s in the chart'; return; }
    const r2HoldAt = g1[0] + 0.2, r2HoldMs = Math.min(1000, Math.round((g1[1] - g1[0] - 0.45) * 1000));
    const pullStep = plainAfter(r2HoldAt + r2HoldMs / 1000 + 0.6);
    const g2 = gapAfter((pullStep?.end ?? r2HoldAt) + 0.6, 1.5) ?? gapAfter((pullStep?.end ?? r2HoldAt) + 0.6, 1.3);
    const spHoldAt = g2 ? g2[0] + 0.2 : null, spHoldMs = g2 ? Math.min(1000, Math.round((g2[1] - g2[0] - 0.45) * 1000)) : null;
    const tapSteps: Any[] = [];
    let cursor = (spHoldAt ?? (pullStep?.end ?? 0)) + (spHoldMs ?? 0) / 1000 + 0.6;
    for (let k = 0; k < 3; k++) { const s = plainAfter(cursor); if (!s) break; tapSteps.push(s); cursor = s.end + 0.7; }
    const pauseAt = cursor + 0.8;
    // the driver leaves every step inside a test's window alone
    const windows: [number, number][] = [[r2HoldAt - 0.35, r2HoldAt + r2HoldMs / 1000 + 0.35]];
    if (pullStep) windows.push([pullStep.t - 0.4, pullStep.end + 0.45]);
    if (spHoldAt != null && spHoldMs != null) windows.push([spHoldAt - 0.35, spHoldAt + spHoldMs / 1000 + 0.35]);
    for (const s of tapSteps) windows.push([s.t - 0.45, s.end + 0.45]);
    const skip = S.filter((s) => windows.some(([a, z]) => s.end >= a && s.t <= z)).map((s) => s.i);
    R.timingPlan = { r2Hold: { atSec: +r2HoldAt.toFixed(3), ms: r2HoldMs, gap: g1 }, r2PullStep: pullStep, spaceHold: { atSec: spHoldAt, ms: spHoldMs, gap: g2 }, tapSteps, pauseAtSec: +pauseAt.toFixed(3), driverSkips: skip.length };
    log('timing plan', JSON.stringify(R.timingPlan));
    R.timingDriver = await p.evaluate((x) => (window as Any).__drive(x), { offsetsMs: [0], skip });

    // (a) R2 held in a gap
    await untilHeard(p, r2HoldAt);
    const a0 = await now(p);
    await p.evaluate(() => (window as Any).__padBtn(7, 1)); await p.waitForTimeout(r2HoldMs); await p.evaluate(() => (window as Any).__padBtn(7, 0));
    const a1 = await now(p); await p.waitForTimeout(250);
    R.r2Hold = { ...(await tally(p, a0, a1 + 250)), heldMs: Math.round(a1 - a0), how: 'pad buttons[7] value 1 held in a step-free gap; judgements from the wrapped hit()' };
    log('R2 hold', JSON.stringify(R.r2Hold).slice(0, 400));
    // (a2) R2 pulled ON a step's beat
    if (pullStep) {
      await untilHeard(p, pullStep.t);
      const w0 = await now(p);
      await p.evaluate(() => (window as Any).__padBtn(7, 1)); await p.waitForTimeout(150); await p.evaluate(() => (window as Any).__padBtn(7, 0));
      await p.waitForTimeout(250);
      R.r2Pull = { stepSec: pullStep.t, ...(await tally(p, w0, await now(p))), how: 'pad buttons[7] pulled when the heard clock reached the step, held 150 ms' };
      log('R2 pull', JSON.stringify(R.r2Pull).slice(0, 400));
    }
    await p.screenshot({ path: `${OUT}/dance-mid-desktop.png` }); R.frames['dance-mid-desktop'] = `${OUT}/dance-mid-desktop.png`;
    // (b) SPACE held in a gap
    if (spHoldAt != null && spHoldMs != null) {
      await untilHeard(p, spHoldAt);
      const b0 = await now(p);
      await p.keyboard.down(' '); await p.waitForTimeout(spHoldMs); await p.keyboard.up(' ');
      const b1 = await now(p); await p.waitForTimeout(250);
      R.spaceHold = { ...(await tally(p, b0, b1 + 250)), heldMs: Math.round(b1 - b0), how: 'keyboard.down(" ") … keyboard.up(" ") in a step-free gap (real CDP key events, auto-repeat on)' };
      log('SPACE hold', JSON.stringify(R.spaceHold).slice(0, 400));
    }
    // (c) SPACE taps: key-DOWN on the beat (×2), key-DOWN 110 ms early (×1); each key-up 110 ms after its down
    const taps: Any[] = [];
    for (const [k, s] of tapSteps.entries()) {
      const lead = k === 2 ? 110 : 0;
      const res = await p.evaluate(async ([x, leadMs]) => {
        const w2 = window as Any; const dc = w2.__FEL_DEV__.danceClock; const target = w2.__DPERF.started + x - leadMs / 1000;
        while (dc.heard() < target) await new Promise((r) => setTimeout(r, 1));
        const l0 = (w2.__DLOG ?? []).length;
        const downAt = performance.now(); const downHeard = dc.heard();
        w2.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
        await new Promise((r) => setTimeout(r, 110));
        const upAt = performance.now();
        w2.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }));
        await new Promise((r) => setTimeout(r, 120));
        const hits = (w2.__DLOG ?? []).slice(l0).filter((e: Any) => e.k === 'hit');
        const h = hits[0];
        return { downVsTargetMs: +((downHeard - target) * 1000).toFixed(1), judgements: hits.length, label: h?.label ?? null, wild: h?.wild ?? null,
          deltaMs: h?.delta == null ? null : +(+h.delta).toFixed(1), judgedAt: h ? (h.w >= upAt - 1 ? 'key-UP' : 'key-DOWN') : 'none', judgedMsAfterDown: h ? +(h.w - downAt).toFixed(1) : null };
      }, [s.t, lead] as [number, number]);
      taps.push({ stepSec: s.t, keyDownLeadMs: lead, ...res });
    }
    R.spaceTap = { taps, how: 'in-page KeyboardEvent keydown (Space) on window when the heard clock reached the step (lead 0) or 110 ms before it; keyup 110 ms later' };
    log('SPACE taps', JSON.stringify(taps));
    // (d) pad START pause 5 s, START resume
    await untilHeard(p, pauseAt);
    const songBefore = await p.evaluate(() => (window as Any).__FEL_DEV__.danceClock.song() - (window as Any).__DPERF.started);
    const d0 = await now(p);
    await padPress(p, 9);
    await p.waitForTimeout(300);
    const pausedState = await clockState(p);
    const song1 = await p.evaluate(() => (window as Any).__FEL_DEV__.danceClock.song() - (window as Any).__DPERF.started);
    await p.waitForTimeout(4700);
    const song2 = await p.evaluate(() => (window as Any).__FEL_DEV__.danceClock.song() - (window as Any).__DPERF.started);
    const r0 = await now(p);
    await padPress(p, 9);
    const back: Any[] = [];
    for (let i = 0; i < 14; i++) {
      const [h, st] = await Promise.all([devHud(p), clockState(p)]);
      back.push({ ms: Math.round((await now(p)) - r0), banner: h?.banner ?? null, countingBack: st?.countingBack, accepting: st?.accepting });
      if (i === 3) { await p.screenshot({ path: `${OUT}/dance-countback.png` }); R.frames['dance-countback'] = `${OUT}/dance-countback.png`; }
      await p.waitForTimeout(180);
    }
    await p.waitForTimeout(600);
    const during = await tally(p, d0 + 50, r0);
    const burst = await tally(p, r0, r0 + 300);
    const after3 = await tally(p, r0, r0 + 3000);
    const audio = await p.evaluate(([pa, ra]) => {
      const S3 = (window as Any).__STARTS as number[][];
      const win = (a: number, z: number) => S3.filter((s) => s[0] >= a && s[0] < z);
      const past = (L: number[][]) => L.filter((s) => s[3] > 0 && s[3] < s[2] - 0.005);
      return { startsWhilePaused: win(pa + 300, ra).length, pastTimeStartsIn3sAfterResume: past(win(ra, ra + 3000)).length, pastTimeStartsWholeRun: past(S3).length,
        worstPastSec: past(S3).reduce((m, s) => Math.max(m, s[2] - s[3]), 0) };
    }, [d0, r0] as [number, number]);
    R.pause = {
      pausedMs: Math.round(r0 - d0), songAtPausePressSec: +songBefore.toFixed(3), song300msAfterPauseSec: +song1.toFixed(3), song5sAfterPauseSec: +song2.toFixed(3),
      clockWhilePaused: pausedState, countBack: back, duringPause: { judgedTaps: during.judgedTaps, expiredSteps: during.expiredSteps },
      missBurstIn300msAfterResume: burst.expiredSteps + burst.wildTaps, first3sAfterResume: { judgedTaps: after3.judgedTaps, wildTaps: after3.wildTaps, expiredSteps: after3.expiredSteps }, audio,
      how: 'pad START (buttons[9]) → paused; 5 s; START again. Song time from __FEL_DEV__.danceClock (from beat 0). MISS burst = expiries + wild taps in the 300 ms after the resume press; the driver dances every step outside the tests, so a later expiry is a missed press, not a burst. Audio = source starts; past-time = scheduled > 5 ms behind the clock at the call',
    };
    log('pause', JSON.stringify(R.pause).slice(0, 900));
    await waitSongEnd(p);
    await p.waitForTimeout(1500);
    R.timingResult = { ...(await result(p)), driver: await p.evaluate(() => { const d = (window as Any).__DRV; return d ? { planned: d.planned, pressed: d.pressed.length, passedOver: d.passedOver } : null; }), readout: await readoutText(p) };
    await p.screenshot({ path: `${OUT}/dance-results.png` }); R.frames['dance-results'] = `${OUT}/dance-results.png`;
    log('timing result', JSON.stringify(R.timingResult).slice(0, 600));
  } finally { await ctx.close(); await b.close(); }
}

// ── aim ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function aimRun(name: string, offsetsMs: number[]): Promise<Any> {
  const { b, ctx, p } = await openRoom(`aim-${name}`, `?track=${TRACK}`);
  try {
    const w = await hookAndWake(p);
    if (!w.running) return { fatal: 'the song never started', ...w };
    const plan = await p.evaluate((x) => (window as Any).__drive(x), { offsetsMs });
    await waitSongEnd(p);
    await p.waitForTimeout(1500);
    const res = await result(p);
    const detail = await p.evaluate(() => {
      const w2 = window as Any; const D = w2.__DRV; const hits = (w2.__DLOG ?? []).filter((e: Any) => e.k === 'hit');
      const late = D.pressed.map((x: Any) => x.lateMs).sort((a: number, z: number) => a - z);
      const q = (f: number) => late.length ? late[Math.min(late.length - 1, Math.floor(late.length * f))] : null;
      // per intended offset: what the judge said (hits are in press order; one keydown = one hit() call)
      const byOff: Record<string, Record<string, number>> = {};
      hits.forEach((h: Any, k: number) => { const pr = D.pressed[k]; const key = pr ? String(pr.off) : '?'; const lab = h.wild ? 'WILD MISS' : h.label; (byOff[key] ??= {})[lab] = (byOff[key][lab] || 0) + 1; });
      return { planned: D.planned, pressed: D.pressed.length, passedOver: D.passedOver, dispatchLateMs: { p50: q(0.5), p95: q(0.95), max: late.length ? late[late.length - 1] : null }, byIntendedOffset: byOff };
    });
    const readout = await readoutText(p);
    await p.screenshot({ path: `${OUT}/dance-aim-${name}.png` }); R.frames[`dance-aim-${name}`] = `${OUT}/dance-aim-${name}.png`;
    return { offsetsMs, plan, ...w, ...res, ...detail, readout };
  } finally { await ctx.close(); await b.close(); }
}

// ── lesson ──────────────────────────────────────────────────────────────────────────────────────────────────────────
async function lessonFrame(profileName: 'desktop' | 'phone'): Promise<Any> {
  R.disk[`lesson-${profileName}`] = assertDisk(`lesson-${profileName}`);
  const b = await launch();
  try {
    const ctx = await b.newContext(profileName === 'phone' ? PHONE : DESKTOP);
    await ctx.addInitScript({ content: CAL });
    const p = await newPage(ctx, R.errors, `lesson-${profileName}`);
    await p.goto(`${BASE}/dev/music?stage=studio&player=p10lesson${profileName}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    const start = p.getByRole('button', { name: 'TAP TO START' }); await start.waitFor({ timeout: 300000 }); await start.click();
    await p.waitForFunction(() => !!document.querySelector('[data-qa="cell"]'), undefined, { timeout: 60000 });
    await p.getByRole('button', { name: 'FLIP', exact: true }).click();
    await p.waitForSelector('[data-qa="flip-lesson"]', { timeout: 60000 });
    await p.waitForFunction(() => !!((window as Any).__FEL_FLIP__ && (window as Any).__FEL_FLIP__.decoded), undefined, { timeout: 90000 }).catch(() => undefined);
    await p.waitForTimeout(1200);
    const facts = await p.evaluate(() => {
      const L = document.querySelector('[data-qa="flip-lesson"]') as HTMLElement | null;
      const r = L?.getBoundingClientRect();
      const btn = (qa: string) => { const x = document.querySelector(`[data-qa="${qa}"]`) as HTMLButtonElement | null; return x ? { text: (x.textContent ?? '').trim().slice(0, 40), disabled: x.disabled } : null; };
      return { lessonShown: !!L, box: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
        themes: Array.from(document.querySelectorAll('[data-qa="lesson-theme"]')).map((t) => (t.textContent ?? '').trim()),
        order: btn('lesson-order'), flip: btn('lesson-flip'), close: btn('lesson-close'),
        tip: (document.querySelector('[data-qa="lesson-tip"]')?.textContent ?? '').slice(0, 160),
        flipDecoded: !!((window as Any).__FEL_FLIP__ && (window as Any).__FEL_FLIP__.decoded),
        pageScrollW: document.documentElement.scrollWidth, vw: window.innerWidth };
    });
    await p.screenshot({ path: `${OUT}/flip-lesson-${profileName}.png` }); R.frames[`flip-lesson-${profileName}`] = `${OUT}/flip-lesson-${profileName}.png`;
    await ctx.close();
    return facts;
  } finally { await b.close(); }
}

try {
  if (ONLY.includes('pick')) { log('pick'); await pickRun(); save(); }
  if (ONLY.includes('timing')) { log('timing'); await timingRun(); save(); }
  if (ONLY.includes('aim')) {
    R.aim = {};
    for (const [name, offs] of [['at', [0]], ['early', [-16.7]], ['late', [1, 5, 15, 30]]] as [string, number[]][]) {
      log('aim', name);
      R.aim[name] = await aimRun(name, offs);
      log('aim', name, JSON.stringify({ result: R.aim[name].result, wild: R.aim[name].wildTaps, late: R.aim[name].dispatchLateMs, byOff: R.aim[name].byIntendedOffset }));
      save();
    }
  }
  if (ONLY.includes('lesson')) {
    R.lesson = {};
    for (const pr of ['desktop', 'phone'] as const) { log('lesson', pr); R.lesson[pr] = await lessonFrame(pr); log('lesson', pr, JSON.stringify(R.lesson[pr])); save(); }
  }
} catch (e) { R.fatal = String((e as Error)?.stack ?? e).slice(0, 1500); console.error(e); }
R.runtimeSec = Math.round((Date.now() - t0) / 1000);
save();
log('wrote', `${OUT}/dance-live-proof.json`, R.errors.length ? `errors ${R.errors.length}: ${R.errors.slice(0, 3).join(' | ')}` : 'no page errors');
await sleep(10);
process.exit(0);
