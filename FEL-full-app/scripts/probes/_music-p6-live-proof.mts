// MUSIC-SUITE P6 LIVE PROOF (2026-09-26) — "PERFORM plays your song + music back in the Arena", end to end on the lane's
// dev server (:3121, database offline by design: /dev/music is the real StudioMode with a stand-in shell; the Arena's
// attempt endpoint is stubbed IN THE PAGE, and what the route does with a post is proven by the route tests on the fake
// prisma — lib/arenaMusicAttempt.test.ts, lib/arenaSubmitRoute.test.ts). Nothing here edits app code: the room is watched
// through webpack's module cache (PerformSet.step / chartStep / tap and AudioEngine, wrapped to OBSERVE — each wrapper
// calls the original and returns its value) and through the dev hooks the room already publishes (__FEL_STUDIO__,
// __FEL_PERFORM__).
//   A. BUILD A 4-BAR SONG by hand in the STUDIO: kick + snare + hats + a Flip row (the FLIP tab's default theme, pad 1 →
//      SEND TO TRACK), two sections (VERSE, HOOK) with different parts, 2 bars each in the chain, SONG MODE ON → PERFORM.
//      The lanes on screen (__FEL_PERFORM__.lanes and the DOM cells) and the notes the judge is offered (PerformSet.step's
//      return) are compared with the song's own rows, bar by bar: a lane shows a note only where its part hits.
//   B. A PERFECT PLAYER (every offered note, on its lane's key, at its heard time) for 10 bars: grade, won, and the BAND —
//      the room's parts (__FEL_PERFORM__.band), the desk's band targets (mixGraph.band) and each strip's live GATE value
//      (the AudioParam as it plays) and meter peak, sampled over the set: the per-part gains over time.
//   C. THE RECAP: per-lane accuracy and the signed early / late histogram (DOM), frame.
//   D. A WRONG-LANE PLAYER (every note on time, always in a lane with no note on that step) and a MASHER (random lane keys,
//      60–190 ms apart, ~8 a second — the P1 masher in lanes) on the same song.
//   E. REACH: keyboard (H J K L and ← ↓ ↑ →), a fake standard pad (X A Y B and the D-pad; the room polls getGamepads each
//      frame) and a real pointer (CDP mouse on each PAD and on each lane ROW) — each input on each of the four lanes, on a
//      note of that lane: the lane the judge saw, and its verdict.
//   F. A DENSE GRID (kick quarters, snare 2 & 4, hats every 16th, Flip every 8th): an EMPTY grid first (notes offered),
//      then a STEADY TAPPER (one key, K = hats, 6 taps a second, never listening) for 9 bars: grade + won.
//   G. THE ARENA: houseBeatFor(seed) for two seeds, rendered TWICE EACH in the real room (/dev/music?arena=<seed>: the beat
//      line, bar 0's lanes, the engine's tempo / swing, and the client bundle's own houseBeatFor through webpack's cache)
//      and in node (the server's module) — identical per seed, different across seeds; then the second render of seed A
//      is PLAYED: the ONE ATTEMPT line before START (frame), the tempo and swing sampled through the set (locked), a
//      perfect player on the chart, and the room's score against judgeHouseSet(houseBeatFor(seed), the posted taps) run
//      here in node — the server's rerun — and against HOUSE_SET_MAX (the new ceiling).
// Usage: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p6-live-proof.mts
//        (BASE, OUT, ONLY=free|arena env)
import { chromium, type Browser, type Page } from 'playwright-core';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { chromiumExe } from './_chromium.mts';
import * as houseNs from '../../lib/babylon/music/houseBeat.ts';
import * as stepNs from '../../lib/babylon/music/stepTime.ts';
import * as perfNs from '../../lib/babylon/music/performSet.ts';
import type { HouseTap } from '../../lib/babylon/music/houseBeat.ts';
// the app's modules load as CommonJS under tsx: the named exports sit on the default (as _music-p6-lanes.mts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const house = ((houseNs as Any).default ?? houseNs) as typeof houseNs;
const { houseBeatFor, judgeHouseSet, HOUSE_LANES, HOUSE_SET_MAX } = house;
const { songStepTime } = ((stepNs as Any).default ?? stepNs) as typeof stepNs;
const perf = ((perfNs as Any).default ?? perfNs) as typeof perfNs;
const { performLaneOf, performSetMax } = perf;

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p6/live';
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p6live +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const R: Any = { base: BASE, at: new Date().toISOString(), frames: {}, pageErrors: [] as string[], checks: [] as Any[] };
const check = (id: string, name: string, pass: boolean, got: unknown, want: unknown) => { R.checks.push({ id, name, pass, got, want }); log(pass ? 'PASS' : 'FAIL', id, name, JSON.stringify(got).slice(0, 300)); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const inPage = (p: Page, fn: string, arg: unknown = null): Promise<Any> => p.evaluate(`(${fn})(${JSON.stringify(arg)})`);
const qa = (p: Page, id: string) => p.locator(`[data-qa="${id}"]`);
const btn = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).first();
const shot = async (p: Page, sel: string | null, name: string) => {
  const path = `${OUT}/${name}.png`;
  if (sel) await p.locator(sel).first().screenshot({ path }); else await p.screenshot({ path });
  R.frames[name] = path;
  return path;
};

const SHIM = 'window.__name = window.__name || function (f) { return f; };';
const STUDIO_TIER = `try { if (!localStorage.getItem('fel-music-progress')) localStorage.setItem('fel-music-progress', '{"patternsMade":1,"sectionsSaved":2,"chainEntries":2}'); } catch (e) {}`;
const CAL = `try { localStorage.setItem('fel.audioOffsetMs', '0'); localStorage.setItem('fel.audioOffsetMeasuredAt', String(Date.now())); } catch (e) {}`;
const PAD = `(() => {
  const pad = { index: 0, id: 'p6-live fake pad (standard)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: performance.now(),
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad;
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
  window.__padSet = (i, down) => { pad.buttons[i] = { pressed: down, touched: down, value: down ? 1 : 0 }; pad.timestamp = performance.now(); };
})();`;
const ATTEMPT_STUB = `(() => {
  window.__attemptPosts = [];
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('/api/arena/music-attempt')) {
      const body = JSON.parse(init.body);
      window.__attemptPosts.push(body);
      return new Response(JSON.stringify({ ok: true, phase: body.phase }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return orig(input, init);
  };
})();`;

/** Wrap (observe only) PerformSet.step / chartStep / tap and AudioEngine through webpack's module cache. */
const HOOKS = `() => {
  const W = window;
  if (W.__p6hooked) return true;
  let req = null;
  W.webpackChunk_N_E.push([[Symbol('p6-live')], {}, (r) => { req = r; }]);
  const find = (re) => Object.keys(req.c).find((k) => re.test(k));
  const psId = find(/lib\\/babylon\\/music\\/performSet\\.ts$/), aeId = find(/lib\\/babylon\\/music\\/AudioEngine\\.ts$/), hbId = find(/lib\\/babylon\\/music\\/houseBeat\\.ts$/);
  if (!psId || !aeId) return false;
  const PS = req(psId).PerformSet.prototype;
  W.__OFF__ = []; W.__TAPLOG__ = [];
  for (const m of ['step', 'chartStep']) {
    const o = PS[m];
    PS[m] = function (step, time, now, lanes) {
      const r = o.call(this, step, time, now, lanes);
      if (!this.__judge) { W.__SET__ = this; W.__OFFN__ = (W.__OFFN__ || 0) + 1; W.__OFF__.push({ n: W.__OFFN__, k: this.stepCount, step, time, lanes: r.lanes.slice() }); if (W.__OFF__.length > 6000) W.__OFF__.splice(0, 2000); }
      return r;
    };
  }
  const ot = PS.tap;
  PS.tap = function (now, lane) {
    const r = ot.call(this, now, lane);
    if (!this.__judge && this === W.__SET__) {
      const lt = this.lastTap;
      W.__TAPLOG__.push({ now, lane, out: r, j: lt ? lt.judgement : null, errMs: lt && lt.errorSec != null ? Math.round(lt.errorSec * 10000) / 10 : null, tlane: lt && lt.lane !== undefined ? lt.lane : null, wrong: lt ? !!lt.wrongLane : null });
    }
    return r;
  };
  const AE = req(aeId).AudioEngine.prototype;
  for (const m of ['scheduleStep', 'setState']) { const o = AE[m]; AE[m] = function (...a) { W.__eng = this; return o.apply(this, a); }; }
  if (hbId) W.__HB__ = req(hbId);
  W.__p6hooked = true;
  return true;
}`;

// ── in-page drivers ─────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * The set driver: taps the notes the judge was OFFERED (PerformSet.step's own return) at their heard time (+ the set's
 * latencySec), each through `how`: 'right' = its lane's key; 'wrong' = a lane with NO note on that step (the first after
 * it); 'mash' = random lane keys 60–190 ms apart, ignoring the notes; 'steady' = one key at a fixed rate; 'idle' = nothing.
 * Samples the band every 100 ms: the room's parts, the desk's band targets, every strip's live gate value, and each strip's
 * meter peak (max over the interval).
 */
const DRIVE = `async ({ sec, how, key, rateHz, bandLog, fromN }) => {
  const W = window, S = W.__FEL_STUDIO__;
  const KEYS = ['h', 'j', 'k', 'l'];
  const press = (k) => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); document.body.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true, cancelable: true })); };
  const start = S.now(); const end = start + sec;
  const done = new Set(); let taps = 0, driverLate = 0; const samples = []; let lastSample = -1; const peakAcc = {};
  let nextMash = start + 0.1, nextSteady = start + 0.05;
  let lastLanes = ''; const laneChanges = [];
  const lanesTapped = [0, 0, 0, 0];
  while (S.now() < end) {
    const now = S.now();
    const set = W.__SET__; const lat = set ? set.latencySec : 0;
    if (how === 'right' || how === 'wrong') {
      for (const o of W.__OFF__) {
        if (o.n <= fromN || !o.lanes.length) continue;
        const id = o.time.toFixed(5);
        if (done.has(id)) continue;
        const at = o.time + lat;
        if (now < at - 0.0015) continue;
        done.add(id);
        if (now - at > 0.03) { driverLate++; continue; }
        for (const l of o.lanes) {
          let lane = l;
          if (how === 'wrong') { for (let d = 1; d < 4; d++) { const w = (l + d) % 4; if (!o.lanes.includes(w)) { lane = w; break; } } }
          press(KEYS[lane]); taps++; lanesTapped[lane]++;
        }
      }
    } else if (how === 'mash' && now >= nextMash) {
      const lane = Math.floor(Math.random() * 4); press(KEYS[lane]); taps++; lanesTapped[lane]++;
      nextMash = now + (60 + Math.random() * 130) / 1000;
    } else if (how === 'steady' && now >= nextSteady) {
      press(key); taps++; lanesTapped[KEYS.indexOf(key)]++;
      nextSteady += 1 / rateHz;
    }
    if (bandLog) {
      const P = W.__FEL_PERFORM__ || {};
      const lj = JSON.stringify(P.lanes || []);
      if (lj !== lastLanes) {
        lastLanes = lj;
        let heard = null; for (const x of S.steps) if (x.time <= now && (!heard || x.time > heard.time)) heard = x;
        laneChanges.push({ at: now, bar: P.bar, lanes: P.lanes, heardStep: heard ? heard.step : null, heardAt: heard ? heard.time : null });
      }
    }
    if (bandLog && W.__eng) {
      const mg = W.__eng.mixGraph;
      try { const m = mg.meters(); for (const id in m.channels) peakAcc[id] = Math.max(peakAcc[id] || 0, m.channels[id].peak); } catch (e) {}
      if (now - lastSample >= 0.1) {
        lastSample = now;
        const gates = {}; for (const id of mg.channelIds()) gates[id] = Math.round(mg.channel(id).gate.gain.value * 1000) / 1000;
        const P = W.__FEL_PERFORM__ || {};
        samples.push({ at: now, t: Math.round((now - start) * 100) / 100, bar: P.bar, parts: (P.band || []).slice(), target: mg.band ? Object.assign({}, mg.band) : null, gates, peak: Object.assign({}, peakAcc) });
        for (const id in peakAcc) peakAcc[id] = 0;
      }
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  const first = W.__OFF__.find((o) => o.n > fromN);
  return { taps, driverLate, lanesTapped, samples, laneChanges, start, firstStepTime: first ? first.time : null };
}`;

/** The next offered note of `lane` at least `leadS` ahead: its audio time and the set's latency. */
const NEXT_NOTE = `async ({ lane, leadS }) => {
  const W = window, S = W.__FEL_STUDIO__;
  for (let i = 0; i < 2000; i++) {
    const now = S.now(); const lat = W.__SET__ ? W.__SET__.latencySec : 0;
    const o = W.__OFF__.find((x) => x.lanes.includes(lane) && x.time + lat - now > leadS && x.time + lat - now < leadS + 0.12);
    if (o) return { at: o.time + lat, now, lat, step: o.step, k: o.k };
    await new Promise((r) => setTimeout(r, 2));
  }
  return null;
}`;

/** One input at a note of `lane`: key / pad button fired in the page at the note's heard time. */
const REACH_IN_PAGE = `async ({ lane, how, button, key }) => {
  const W = window, S = W.__FEL_STUDIO__;
  let o = null;
  for (let i = 0; i < 3000 && !o; i++) {
    const now = S.now(); const lat = W.__SET__ ? W.__SET__.latencySec : 0;
    o = W.__OFF__.find((x) => x.lanes.includes(lane) && x.time + lat - now > 0.03 && x.time + lat - now < 0.09) || null;
    if (!o) await new Promise((r) => setTimeout(r, 2));
  }
  if (!o) return { err: 'no note' };
  const lat = W.__SET__.latencySec;
  // the pad is read at the next frame's poll (≤ ~16 ms): press it that much early so the judged time is on the note
  const lead = how === 'pad' ? 0.008 : 0;
  while (S.now() < o.time + lat - lead) await new Promise((r) => setTimeout(r, 0));
  const n0 = W.__TAPLOG__.length;
  if (how === 'key') { document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); document.body.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true })); }
  else { W.__padSet(button, true); }
  for (let i = 0; i < 200 && W.__TAPLOG__.length === n0; i++) await new Promise((r) => setTimeout(r, 2));
  if (how === 'pad') { await new Promise((r) => setTimeout(r, 40)); W.__padSet(button, false); }
  const t = W.__TAPLOG__[n0] || null;
  return { noteStep: o.step, tap: t };
}`;

// ── A–F: free play on a 4-bar song ──────────────────────────────────────────────────────────────────────────────────
/** The song, by section: rows → steps. */
const VERSE: Record<string, number[]> = { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], flip: [0, 10] };
const HOOK: Record<string, number[]> = { kick: [0, 3, 8, 11], snare: [4, 12, 15], hat: [2, 6, 10, 14], flip: [0, 6, 12] };
const DENSE: Record<string, number[]> = { kick: [0, 4, 8, 12], snare: [4, 12], hat: [...Array(16).keys()], flip: [0, 2, 4, 6, 8, 10, 12, 14] };
const laneOfRow = (row: string): number => performLaneOf(row === 'flip' ? 'flip_0' : row);
/** The lanes a section shows / offers: its rows through the lanes and the 8th cap (performCapLanes: the 2nd 16th of an 8th a lane already hit is not a note). */
function expectLanes(sec: Record<string, number[]>): number[][] {
  const lanes: number[][] = [[], [], [], []];
  for (const [row, steps] of Object.entries(sec)) for (const s of steps) { const l = laneOfRow(row); if (!lanes[l].includes(s)) lanes[l].push(s); }
  return lanes.map((ls) => ls.sort((a, b) => a - b).filter((s) => !(s % 2 === 1 && ls.includes(s - 1))));
}

async function openRoom(p: Page, path: string): Promise<void> {
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  const start = p.getByRole('button', { name: 'TAP TO START' });
  await start.waitFor({ timeout: 300000 });
  await start.click();
  await p.waitForTimeout(700);
}
async function hook(p: Page): Promise<void> {
  const ok = await inPage(p, HOOKS);
  if (!ok) throw new Error('performSet / AudioEngine not in the webpack cache');
}
async function setGrid(p: Page, rowSteps: Record<string, number[]>, flipRow: string): Promise<void> {
  for (const [row, steps] of Object.entries(rowSteps)) {
    const id = row === 'flip' ? flipRow : row;
    for (const s of steps) {
      const cell = p.locator(`[data-qa="cell"][data-row="${id}"][data-step="${s}"]`);
      if ((await cell.getAttribute('data-on')) !== '1') await cell.click();
    }
  }
  await p.waitForTimeout(250);
}
async function clearGrid(p: Page): Promise<void> {
  const clear = qa(p, 'clear');
  if (await clear.isEnabled().catch(() => false)) { await clear.click(); await qa(p, 'clear-yes').click(); await p.waitForTimeout(300); }
}
async function gridNow(p: Page): Promise<Record<string, number[]>> {
  return p.evaluate(`(() => { const o = {}; for (const c of document.querySelectorAll('[data-qa="cell"][data-on="1"]')) { const r = c.getAttribute('data-row'); (o[r] = o[r] || []).push(Number(c.getAttribute('data-step'))); } return o; })()`);
}
async function endSet(p: Page): Promise<Any> {
  await btn(p, 'END SET').click();
  await p.waitForFunction('window.__FEL_STUDIO__.ended !== null', undefined, { timeout: 15000 }).catch(() => undefined);
  await p.waitForTimeout(400);
  return p.evaluate('window.__FEL_STUDIO__.ended');
}
async function replay(p: Page): Promise<void> {
  if ((await p.locator('[data-dev="replay"]').count()) === 0) { R.notes = [...(R.notes ?? []), 'replay: no end card to REPLAY from']; return; }
  await p.locator('[data-dev="replay"]').click();
  await p.waitForTimeout(600);
  await p.evaluate('window.__FEL_STUDIO__.ended = null');
}
/** Start a driver, THEN press PLAY (so the set's first note is never behind the driver), and hand back the driver's promise. */
async function driveSet(p: Page, args: Any): Promise<{ fromN: number; run: Promise<Any> }> {
  const fromN: number = await p.evaluate('window.__OFFN__ || 0');
  const run = inPage(p, DRIVE, { ...args, fromN });
  await sleep(200);
  await play(p);
  return { fromN, run };
}
async function play(p: Page): Promise<void> {
  const running = await p.evaluate('window.__FEL_STUDIO__.engine()?.running ?? false');
  if (!running) await qa(p, 'perform-play').click();
  await p.waitForFunction('window.__FEL_STUDIO__.engine()?.running === true', undefined, { timeout: 10000 });
}
const summary = (e: Any) => e ? { score: e.score, won: e.won, headline: e.headline, grade: e.stats?.grade, accuracy: e.stats && +e.stats.accuracy.toFixed(4), bars: e.stats?.bars, notes: e.stats?.notes, hits: e.stats?.hits, perfects: e.stats?.perfects, goods: e.stats?.goods, misses: e.stats?.misses, extras: e.stats?.extras, wrongLanes: e.stats?.wrongLanes, maxCombo: e.stats?.maxCombo, meanErrorMs: e.stats?.meanErrorMs, laneAcc: [e.stats?.kickAcc, e.stats?.snareAcc, e.stats?.hatsAcc, e.stats?.flipAcc].map((x: number) => (x === undefined ? null : +x.toFixed(3))) } : null;

/** What the recap on screen says: per-lane accuracy, the non-empty histogram bins, the timing line. */
async function recapData(p: Page): Promise<Any> {
  return {
    lanes: await p.evaluate(`[...document.querySelectorAll('[data-qa="recap-lane"]')].map((e) => [Number(e.getAttribute('data-lane')), Number(e.getAttribute('data-acc'))])`),
    histNonEmpty: await p.evaluate(`[...document.querySelectorAll('[data-qa="recap-hist-bin"]')].map((e) => [Number(e.getAttribute('data-from')), Number(e.getAttribute('data-count'))]).filter((b) => b[1] > 0)`),
    timing: await qa(p, 'recap-timing').textContent().catch(() => null),
  };
}

async function freePlay(browser: Browser): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  for (const s of [SHIM, STUDIO_TIER, CAL, PAD]) await ctx.addInitScript({ content: s });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => R.pageErrors.push(`free: ${String(e).slice(0, 300)}`));
  await openRoom(p, '/dev/music?stage=studio&player=p6live');
  await p.waitForFunction('!!document.querySelector(\'[data-qa="cell"]\')', undefined, { timeout: 60000 });
  await hook(p);

  // ── A. the song ──
  await clearGrid(p);
  await inPage(p, `() => {
    for (const [l, v] of [['BPM', 92], ['SWING', 0]]) {
      const inp = [...document.querySelectorAll('label')].find((x) => (x.textContent || '').trim().startsWith(l))?.querySelector('input');
      if (!inp) continue;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, String(v));
      inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }`);
  // the Flip row: the FLIP tab's default theme on the pads, pad 1 → SEND TO TRACK
  await btn(p, 'FLIP').click();
  await p.waitForFunction('!!(window.__FEL_FLIP__ && window.__FEL_FLIP__.decoded)', undefined, { timeout: 90000 });
  await p.getByRole('button', { name: 'pad 1', exact: true }).dispatchEvent('pointerdown');
  await p.waitForTimeout(250);
  await qa(p, 'flip-send').click();
  await p.waitForTimeout(500);
  await btn(p, 'STUDIO').click();
  await p.waitForTimeout(500);
  const flipRow: string | null = await p.evaluate(`(() => { const c = document.querySelector('[data-qa="cell"][data-row^="flip_"]'); return c ? c.getAttribute('data-row') : null; })()`);
  R.song = { flipRow, source: await p.evaluate('window.__FEL_FLIP__ ? window.__FEL_FLIP__.source : null') };
  check('A0', 'a Flip row exists on the grid after SEND TO TRACK', !!flipRow, flipRow, 'flip_N');
  if (!flipRow) throw new Error('no Flip row');
  const pickName = async (n: string) => p.locator('select').filter({ has: p.locator(`option[value="${n}"]`) }).first().selectOption(n);
  await setGrid(p, VERSE, flipRow);
  R.song.verseGrid = await gridNow(p);
  await pickName('verse');
  await qa(p, 'save-section').click();
  await p.waitForTimeout(300);
  await clearGrid(p);
  await setGrid(p, HOOK, flipRow);
  R.song.hookGrid = await gridNow(p);
  await pickName('hook');
  await qa(p, 'save-section').click();
  await p.waitForTimeout(300);
  R.song.chain = await p.evaluate(`[...document.querySelectorAll('[data-qa="chain-entry"]')].map((e) => e.textContent.replace(/[◀▶×−+]/g, ' ').replace(/\\s+/g, ' ').trim())`);
  await qa(p, 'song-mode').click();
  await p.waitForTimeout(300);
  R.song.songMode = await qa(p, 'song-mode').textContent();
  R.song.bpm = await p.evaluate('window.__FEL_STUDIO__.engine()?.bpm');
  R.song.swing = await p.evaluate('window.__FEL_STUDIO__.engine()?.swing');
  log('song', JSON.stringify(R.song));
  check('A1', 'the song: VERSE + HOOK, 2 bars each in the chain (4 bars), SONG MODE ON, 92 BPM, no swing', R.song.chain.length === 2 && /ON/.test(R.song.songMode) && R.song.bpm === 92 && R.song.swing === 0, { chain: R.song.chain, songMode: R.song.songMode, bpm: R.song.bpm, swing: R.song.swing }, 'verse 2 · hook 2 · ON · 92 · 0');

  // ── PERFORM ──
  await btn(p, 'PERFORM').click();
  await p.waitForTimeout(500);
  await p.evaluate('window.__FEL_STUDIO__.ended = null');
  R.A = { hint: await qa(p, 'perform-hint').textContent().catch(() => null), padsDrawn: await qa(p, 'perform-pad').count(), bandBeforePlay: await p.evaluate('window.__FEL_PERFORM__.band') };
  // B. the perfect player, 10 bars (26.1 s at 92 BPM), with frames on the way
  const barS = 16 * (60 / 92 / 4);
  const { fromN: perfectFromN, run } = await driveSet(p, { sec: 10 * barS + 0.4, how: 'right', bandLog: true });
  const lanesSeen: Any[] = [];
  const domSeen: Any[] = [];
  const watch = (async () => {
    const tEnd = Date.now() + 10 * barS * 1000;
    while (Date.now() < tEnd) {
      const v = await p.evaluate('({ bar: window.__FEL_PERFORM__.bar, lanes: window.__FEL_PERFORM__.lanes, band: window.__FEL_PERFORM__.band })');
      lanesSeen.push(v);
      await sleep(150);
    }
  })();
  // the band build: a frame of the panel the first time each new set of parts is in (kick → +hats → +Flip → +snare)
  const bandShots: Any[] = [];
  {
    let seen = '';
    const tEnd = Date.now() + 2.6 * barS * 1000;
    while (Date.now() < tEnd && bandShots.length < 4) {
      const b = await p.evaluate('JSON.stringify(window.__FEL_PERFORM__.band) + "|" + (window.__FEL_STUDIO__.engine()?.running ? 1 : 0)');
      const [parts, run1] = b.split('|');
      if (run1 === '1' && parts !== seen) {
        seen = parts;
        const name = `p6live-band-${bandShots.length + 1}-${JSON.parse(parts).join('')}`;
        await shot(p, '[data-qa="perform-panel"]', name);
        bandShots.push({ parts: JSON.parse(parts), frame: name, audioSec: await p.evaluate('window.__FEL_STUDIO__.now()') });
      }
      await sleep(25);
    }
  }
  R.B = { bandShots };
  // the DOM at a VERSE bar (5) and a HOOK bar (7), mid-bar (heard step 4..10: clear of the bar lines)
  const DOM_NOW = `({ bar: window.__FEL_PERFORM__.bar, cells: [0,1,2,3].map((l) => [...document.querySelectorAll('[data-qa="perform-cell"][data-lane="' + l + '"][data-on="1"]')].map((c) => Number(c.getAttribute('data-step')))), bandDots: [...document.querySelectorAll('[data-qa="perform-lane-label"]')].map((e) => e.getAttribute('data-band')) })`;
  const HEARD = `(() => { const S = window.__FEL_STUDIO__; const now = S.now(); let h = null; for (const x of S.steps) if (x.time <= now && (!h || x.time > h.time)) h = x; return { bar: window.__FEL_PERFORM__.bar, step: h ? h.step : -1 }; })()`;
  for (const bar of [5, 7]) {
    await p.waitForFunction(`(() => { const h = ${HEARD}; return h.bar === ${bar} && h.step >= 4 && h.step <= 9; })()`, undefined, { timeout: 30000, polling: 10 }).catch(() => undefined);
    domSeen.push(await p.evaluate(DOM_NOW));
    if (bar === 7) await shot(p, '[data-qa="perform-panel"]', 'p6live-lanes-mid-song');
  }
  await shot(p, null, 'p6live-lanes-mid-song-page');
  const drove = await run;
  await watch;
  Object.assign(R.B, { taps: drove.taps, driverLate: drove.driverLate, lanesTapped: drove.lanesTapped });
  const ended = await endSet(p);
  R.B.result = summary(ended);
  log('perfect', JSON.stringify(R.B));

  // the lanes on screen vs the song, bar by bar (bars 1-2 VERSE, 3-4 HOOK, then again)
  const want = { verse: expectLanes(VERSE), hook: expectLanes(HOOK) };
  const sectionOfBar = (bar: number) => (((bar - 1) % 4) < 2 ? 'verse' : 'hook');
  const byBar: Record<number, string[]> = {};
  for (const v of lanesSeen) { if (!v.bar) continue; (byBar[v.bar] = byBar[v.bar] ?? []).push(JSON.stringify(v.lanes)); }
  const screenBars = Object.entries(byBar).map(([bar, list]) => {
    const w = JSON.stringify(want[sectionOfBar(Number(bar)) as 'verse' | 'hook']);
    const odd = [...new Set(list.filter((x) => x !== w))].map((x) => JSON.parse(x));
    return { bar: Number(bar), section: sectionOfBar(Number(bar)), samples: list.length, matching: list.filter((x) => x === w).length, odd, match: list.every((x) => x === w) };
  });
  R.A.want = want;
  R.A.screenBars = screenBars;
  R.A.dom = domSeen.map((d) => ({ ...d, want: want[sectionOfBar(d.bar) as 'verse' | 'hook'], match: JSON.stringify(d.cells) === JSON.stringify(want[sectionOfBar(d.bar) as 'verse' | 'hook']) }));
  // the judge's offered notes vs the song
  const off: Any[] = await p.evaluate(`window.__OFF__.filter((o) => o.n > ${perfectFromN})`);
  const offByBar: Record<number, number[][]> = {};
  const k0 = off.length ? off[0].k : 1;
  for (const o of off) {
    const bar = Math.floor((o.k - k0 + (off[0]?.step ?? 0)) / 16) + 1;
    const lanes = offByBar[bar] ?? (offByBar[bar] = [[], [], [], []]);
    for (const l of o.lanes) lanes[l].push(o.step);
  }
  const judgeBars = Object.entries(offByBar).filter(([, v]) => v.some((x) => x.length)).map(([bar, lanes]) => ({ bar: Number(bar), section: sectionOfBar(Number(bar)), offered: lanes, match: JSON.stringify(lanes) === JSON.stringify(want[sectionOfBar(Number(bar)) as 'verse' | 'hook']) }));
  R.A.judgeBars = judgeBars;
  const fullBars = judgeBars.filter((b) => b.bar <= 10);
  check('A2', 'SCREEN: every bar\'s lanes show a note only where that part of the section hits (VERSE bars 1-2, HOOK 3-4, …)', screenBars.length >= 8 && screenBars.every((b) => b.match),
    screenBars.map((b) => `${b.bar}:${b.section}:${b.matching}/${b.samples}${b.match ? '' : ` odd ${JSON.stringify(b.odd)}`}`), 'all bars match');
  check('A3', 'DOM cells (data-on) = the section\'s parts at two moments (one VERSE bar, one HOOK bar)', R.A.dom.length === 2 && R.A.dom.every((d: Any) => d.match) && new Set(R.A.dom.map((d: Any) => sectionOfBar(d.bar))).size === 2,
    R.A.dom.map((d: Any) => ({ bar: d.bar, cells: d.cells, match: d.match })), 'VERSE + HOOK match');
  check('A4', 'JUDGE: the notes offered each bar are exactly the song\'s parts, lane by lane', fullBars.length >= 9 && fullBars.every((b) => b.match),
    fullBars.map((b) => `${b.bar}:${b.section}:${b.match ? 'ok' : JSON.stringify(b.offered)}`), 'all bars match');

  // the band over time
  const samples: Any[] = drove.samples;
  const laneGate = (s: Any, lane: number) => Math.max(0, ...Object.entries(s.gates).filter(([id]) => performLaneOf(id) === lane && id !== '__takes__' && !/take/i.test(id)).map(([, v]) => v as number));
  const lanePeak = (s: Any, lane: number) => Math.max(0, ...Object.entries(s.peak).filter(([id]) => performLaneOf(id) === lane && !/take/i.test(id)).map(([, v]) => v as number));
  const partsLog: Any[] = [];
  let lastParts = '';
  for (const s of samples) { const k = JSON.stringify(s.parts); if (k !== lastParts) { partsLog.push({ t: s.t, bar: s.bar, parts: s.parts, target: s.target }); lastParts = k; } }
  // per 0.25 s window from the set's first downbeat: the parts, each lane's gate (min..max in the window) and its loudest peak
  const down = drove.firstStepTime ?? drove.start;
  const win: Record<number, Any[]> = {};
  for (const s of samples) { const w = Math.floor((s.at - down) / 0.25); (win[w] = win[w] ?? []).push(s); }
  const gainsTimeline = Object.entries(win).map(([w, ss]) => ({
    fromSec: +(Number(w) * 0.25).toFixed(2), bar: ss[0].bar, parts: ss[ss.length - 1].parts.join(''),
    gate: [0, 1, 2, 3].map((l) => { const v = ss.map((x) => laneGate(x, l)); const lo = Math.min(...v), hi = Math.max(...v); return lo === hi ? +lo.toFixed(2) : `${lo.toFixed(2)}..${hi.toFixed(2)}`; }),
    peakDb: [0, 1, 2, 3].map((l) => { const v = Math.max(...ss.map((x) => lanePeak(x, l))); return v > 0 ? Math.round(20 * Math.log10(v)) : null; }),
  })).sort((a, b) => a.fromSec - b.fromSec);
  // times from the set's first downbeat (the band is on the desk only while the set runs: before PLAY every gate is 1)
  const live = samples.filter((x) => x.target !== null && x.at >= down - 0.06);
  const rel = (x: Any) => +(x.at - down).toFixed(2);
  const joinAt = [0, 1, 2, 3].map((l) => { const s = live.find((x) => x.parts.includes(l)); return s ? rel(s) : null; });
  const gateOpenAt = [0, 1, 2, 3].map((l) => { const s = live.find((x) => laneGate(x, l) > 0.9); return s ? rel(s) : null; });
  const soundAt = [0, 1, 2, 3].map((l) => { const s = live.find((x) => lanePeak(x, l) > 0.01); return s ? rel(s) : null; });
  const gateAtPlay = live[0] ? [0, 1, 2, 3].map((l) => +laneGate(live[0], l).toFixed(3)) : null;
  R.B.band = { downbeatAudioSec: down, foundationAtPlay: live[0]?.parts, gateAtPlay, partsLog: partsLog.map((x) => ({ ...x, fromDownbeatSec: +(samples.find((s) => s.t === x.t)!.at - down).toFixed(2) })),
    joinAtSec: joinAt, joinAtBar: joinAt.map((t) => (t === null ? null : +(t / barS + 1).toFixed(2))), gateOver09AtSec: gateOpenAt, firstSoundAtSec: soundAt, gainsTimeline };
  // the lanes on screen, change by change: when the section's chart replaced the last one, against the heard bar line
  const stepS = barS / 16;
  R.A.laneChanges = (drove.laneChanges as Any[]).filter((c) => c.heardAt !== null).map((c) => {
    const nextBarLine = c.heardAt + (16 - c.heardStep) * stepS;
    const toSection = JSON.stringify(c.lanes) === JSON.stringify(want.verse) ? 'verse' : JSON.stringify(c.lanes) === JSON.stringify(want.hook) ? 'hook' : 'other';
    return { fromDownbeatSec: +(c.at - down).toFixed(3), bar: c.bar, heardStep: c.heardStep, toSection, msBeforeNextBarLine: c.heardStep === 0 ? 0 : Math.round((nextBarLine - c.at) * 1000), msAfterHeardStep: Math.round((c.at - c.heardAt) * 1000) };
  });
  check('B1', 'PERFECT player (10 bars, every note on its lane): grade S, won', ended?.stats?.grade === 'S' && ended?.won === true, R.B.result, 'S · won');
  check('B2', 'the band grows part by part: the kick at PLAY, then each part joins (room parts, desk target and live gate all open)', joinAt.every((t) => t !== null) && gateOpenAt.every((t) => t !== null) && new Set(joinAt).size >= 3,
    { joinAtSec: joinAt, gateOver09AtSec: gateOpenAt, firstSoundAtSec: soundAt }, 'kick first, all four in');
  // C. the recap
  R.C = {
    recap: await p.evaluate('window.__FEL_PERFORM__.recap'),
    lanes: await p.evaluate(`[...document.querySelectorAll('[data-qa="recap-lane"]')].map((e) => [Number(e.getAttribute('data-lane')), Number(e.getAttribute('data-acc'))])`),
    hist: await p.evaluate(`[...document.querySelectorAll('[data-qa="recap-hist-bin"]')].map((e) => [Number(e.getAttribute('data-from')), Number(e.getAttribute('data-count'))])`),
    timing: await qa(p, 'recap-timing').textContent().catch(() => null),
    grade: await qa(p, 'recap-grade').textContent().catch(() => null),
  };
  await p.evaluate(`(() => { const c = document.querySelector('[data-dev="end-card"]'); if (c) c.style.display = 'none'; })()`);
  await qa(p, 'perform-recap').scrollIntoViewIfNeeded().catch(() => undefined);
  await shot(p, '[data-qa="perform-recap"]', 'p6live-recap');
  await p.evaluate(`(() => { const c = document.querySelector('[data-dev="end-card"]'); if (c) c.style.display = ''; })()`);
  const histBins = (R.C.hist as number[][]).filter((b) => b[1] > 0);
  check('C1', 'the recap shows per-lane accuracy (4 lanes) and a signed early/late histogram', R.C.lanes.length === 4 && (R.C.hist as number[][]).some((b) => b[0] < 0) && (R.C.hist as number[][]).some((b) => b[0] >= 0) && histBins.length > 0,
    { lanes: R.C.lanes, nonEmptyBins: histBins, timing: R.C.timing }, '4 lanes · bins both sides of 0');
  log('recap', JSON.stringify(R.C));

  // D. wrong lanes, then the masher
  await replay(p);
  const wrong = await (await driveSet(p, { sec: 9 * barS + 0.4, how: 'wrong', bandLog: false })).run;
  R.D = { wrong: { taps: wrong.taps, lanesTapped: wrong.lanesTapped, tapVerdicts: await p.evaluate(`(() => { const c = {}; for (const t of window.__TAPLOG__.slice(-${wrong.taps})) { const k = t.j + (t.wrong ? ' (WRONG LANE)' : ''); c[k] = (c[k] || 0) + 1; } return c; })()`) } };
  R.D.wrong.result = summary(await endSet(p));
  log('wrong', JSON.stringify(R.D.wrong));
  check('D1', 'WRONG-LANE player (every note on time, in a lane with no note on that step): misses, grade D, not won', R.D.wrong.result?.grade === 'D' && R.D.wrong.result?.won === false, R.D.wrong.result, 'D · lost');
  await replay(p);
  const mash = await (await driveSet(p, { sec: 10 * barS + 0.4, how: 'mash', bandLog: false })).run;
  R.D.masher = { taps: mash.taps, perSec: +(mash.taps / (10 * barS)).toFixed(2), lanesTapped: mash.lanesTapped };
  R.D.masher.result = summary(await endSet(p));
  R.D.masher.recap = await recapData(p);
  await p.evaluate(`(() => { const c = document.querySelector('[data-dev="end-card"]'); if (c) c.style.display = 'none'; })()`);
  await qa(p, 'perform-recap').scrollIntoViewIfNeeded().catch(() => undefined);
  await shot(p, '[data-qa="perform-recap"]', 'p6live-recap-masher');
  await p.evaluate(`(() => { const c = document.querySelector('[data-dev="end-card"]'); if (c) c.style.display = ''; })()`);
  log('masher', JSON.stringify(R.D.masher));
  check('D2', 'MASHER (random lanes ~8/s, 10 bars) scores far below the perfect player and loses', (R.D.masher.result?.score ?? 1e9) < (R.B.result?.score ?? 0) / 4 && R.D.masher.result?.won === false, { masher: R.D.masher.result?.score, perfect: R.B.result?.score, grade: R.D.masher.result?.grade }, '< ¼ of perfect, lost');

  // E. reach: keyboard, pad, pointer on every lane
  await replay(p);
  await play(p);
  const reach: Any[] = [];
  const KEY_SETS = [['h', 'j', 'k', 'l'], ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight']];
  const PAD_SETS = [[2, 0, 3, 1], [14, 13, 12, 15]];
  for (let set = 0; set < 2; set++) for (let lane = 0; lane < 4; lane++) {
    const r = await inPage(p, REACH_IN_PAGE, { lane, how: 'key', key: KEY_SETS[set][lane] });
    reach.push({ input: 'keyboard', control: KEY_SETS[set][lane], lane, ...r });
  }
  for (let set = 0; set < 2; set++) for (let lane = 0; lane < 4; lane++) {
    const r = await inPage(p, REACH_IN_PAGE, { lane, how: 'pad', button: PAD_SETS[set][lane] });
    reach.push({ input: 'pad', control: `button ${PAD_SETS[set][lane]} (${['X', 'A', 'Y', 'B'][lane]}${set ? ' d-pad' : ''})`, lane, ...r });
  }
  // the pointer: a real CDP mouse press on the lane's PAD, then on the lane's ROW, timed from node
  for (const target of ['perform-pad', 'perform-lane']) for (let lane = 0; lane < 4; lane++) {
    const box = (await p.locator(`[data-qa="${target}"][data-lane="${lane}"]`).first().boundingBox())!;
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await p.mouse.move(x, y);
    const n = await inPage(p, NEXT_NOTE, { lane, leadS: 0.04 });
    if (!n) { reach.push({ input: 'pointer', control: target, lane, err: 'no note' }); continue; }
    const n0 = await p.evaluate('window.__TAPLOG__.length');
    const aheadMs = (n.at - (await p.evaluate('window.__FEL_STUDIO__.now()'))) * 1000;
    await sleep(Math.max(0, aheadMs - 10));
    await p.mouse.down();
    await sleep(40);
    await p.mouse.up();
    await sleep(60);
    const t = await p.evaluate(`window.__TAPLOG__[${n0}] || null`);
    reach.push({ input: 'pointer', control: `${target === 'perform-pad' ? 'pad' : 'lane row'} (CDP mouse)`, lane, noteStep: n.step, tap: t });
  }
  R.E = { reach: reach.map((r) => ({ input: r.input, control: r.control, lane: r.lane, judgedLane: r.tap?.tlane ?? r.tap?.lane ?? null, verdict: r.tap?.j ?? r.err ?? null, errMs: r.tap?.errMs ?? null })) };
  await endSet(p);
  const reachOk = (input: string) => [0, 1, 2, 3].every((l) => R.E.reach.filter((r: Any) => r.input === input && r.lane === l).every((r: Any) => r.judgedLane === l && /PERFECT|GOOD/.test(String(r.verdict))));
  for (const input of ['keyboard', 'pad', 'pointer']) {
    check(`E-${input}`, `${input.toUpperCase()} reaches all four lanes (each control's tap judged in its own lane, a hit)`, reachOk(input),
      R.E.reach.filter((r: Any) => r.input === input).map((r: Any) => `${r.control}→L${r.judgedLane} ${r.verdict}${r.errMs !== null ? ` ${r.errMs}ms` : ''}`), 'L0..L3 hits');
  }

  // F. the dense grid: empty first, then the steady tapper
  await replay(p);
  await btn(p, 'BUILD').click();
  await p.waitForTimeout(300);
  if (/ON/.test((await qa(p, 'song-mode').textContent()) ?? '')) { await qa(p, 'song-mode').click(); await p.waitForTimeout(300); }
  await clearGrid(p);
  await btn(p, 'PERFORM').click();
  await p.waitForTimeout(400);
  const offBefore = await p.evaluate('window.__OFF__.length');
  await play(p);
  await sleep(2 * barS * 1000);
  const emptyOff: Any[] = await p.evaluate(`window.__OFF__.slice(${offBefore})`);
  R.F = { empty: { stepsScheduled: emptyOff.length, notesOffered: emptyOff.reduce((a, o) => a + o.lanes.length, 0), lanes: await p.evaluate('window.__FEL_PERFORM__.lanes') } };
  R.F.empty.result = summary(await endSet(p));
  check('F1', 'an EMPTY grid offers no notes (steps scheduled, zero notes) and the set is not won', R.F.empty.stepsScheduled > 16 && R.F.empty.notesOffered === 0 && R.F.empty.result?.won === false, R.F.empty, '0 notes · lost');
  await replay(p);
  await btn(p, 'BUILD').click();
  await p.waitForTimeout(300);
  await setGrid(p, DENSE, flipRow);
  R.F.denseGrid = await gridNow(p);
  await btn(p, 'PERFORM').click();
  await p.waitForTimeout(400);
  R.F.denseLanes = await p.evaluate('window.__FEL_PERFORM__.lanes');
  const steady = await (await driveSet(p, { sec: 9 * barS + 0.4, how: 'steady', key: 'k', rateHz: 6, bandLog: false })).run;
  R.F.steady = { taps: steady.taps, rateHz: 6, key: 'K (hats)', lanesTapped: steady.lanesTapped };
  R.F.steady.result = summary(await endSet(p));
  R.F.steady.recap = await recapData(p);
  log('steady', JSON.stringify(R.F.steady));
  check('F2', 'STEADY TAPPER on a dense grid (K = hats, 6 taps/s, 9 bars, never listening): grade below C, not won', R.F.steady.result?.won === false && ['D'].includes(R.F.steady.result?.grade), R.F.steady.result, 'D · lost');
  // the same dense grid played right (so "dense" is not what loses)
  await replay(p);
  const denseRight = await (await driveSet(p, { sec: 9 * barS + 0.4, how: 'right', bandLog: false })).run;
  R.F.denseRight = { taps: denseRight.taps, result: summary(await endSet(p)) };
  check('F3', 'the SAME dense grid played on its lanes: won', R.F.denseRight.result?.won === true, R.F.denseRight.result, 'won');
  await ctx.close();
}

// ── G. the Arena ────────────────────────────────────────────────────────────────────────────────────────────────────
/** The whole HouseBeat object (v, seed, kit, tempo, swing, the 8-bar lane patterns with velocities, all 192 notes with times), hashed. */
const fpJson = (json: string) => crypto.createHash('sha1').update(json).digest('hex').slice(0, 16);
const fp = (b: Any) => fpJson(JSON.stringify(b));
async function arena(browser: Browser): Promise<void> {
  const SEEDS = ['cm_p6live_alpha', 'cm_p6live_bravo'];
  R.G = { seeds: SEEDS, node: {} as Any, room: [] as Any[] };
  for (const s of SEEDS) {
    const a = houseBeatFor(s), b = houseBeatFor(s);
    R.G.node[s] = { fp: [fp(a), fp(b)], kit: a.kit, bpm: a.bpm, swing: a.swing, notes: a.notes.length, bar0: [0, 1, 2, 3].map((l) => a.notes.filter((n) => n.bar === 0 && HOUSE_LANES.indexOf(n.lane) === l).map((n) => n.step)) };
  }
  const order = [SEEDS[0], SEEDS[1], SEEDS[1], SEEDS[0]];
  let keep: { p: Page; ctx: Any } | null = null;
  for (let i = 0; i < order.length; i++) {
    const seed = order[i];
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    for (const s of [SHIM, CAL, ATTEMPT_STUB]) await ctx.addInitScript({ content: s });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => R.pageErrors.push(`arena: ${String(e).slice(0, 300)}`));
    await openRoom(p, `/dev/music?arena=${seed}&player=p6arena${i}`);
    await qa(p, 'arena-set').waitFor({ timeout: 60000 });
    await p.waitForTimeout(800);
    await hook(p);
    const clientJson: string = await p.evaluate(`JSON.stringify(window.__HB__.houseBeatFor(${JSON.stringify(seed)}))`);
    const r = {
      seed, load: i + 1,
      clientFp: fpJson(clientJson), clientBytes: clientJson.length,
      beatLine: await qa(p, 'arena-beat').textContent().catch(() => null),
      rules: await qa(p, 'arena-rules').textContent().catch(() => null),
      lanesBar0: await p.evaluate('window.__FEL_PERFORM__.lanes'),
      engine: await p.evaluate('(() => { const e = window.__FEL_STUDIO__.engine(); return e ? { bpm: e.bpm, swing: e.swing } : null; })()'),
      tempoControls: await p.evaluate(`[...document.querySelectorAll('label')].filter((x) => /^(BPM|SWING)/.test((x.textContent || '').trim())).length`),
      phase: await qa(p, 'arena-set').getAttribute('data-phase'),
    };
    R.G.room.push(r);
    log('arena render', JSON.stringify(r));
    if (i === order.length - 1) keep = { p, ctx }; else await ctx.close();
  }
  const [a1, b1, b2, a2] = R.G.room;
  const nA = R.G.node[SEEDS[0]], nB = R.G.node[SEEDS[1]];
  check('G1', 'houseBeatFor: the same seed renders the same beat twice (node ×2, room client ×2 — fingerprint, beat line, bar 0 lanes, engine tempo)',
    nA.fp[0] === nA.fp[1] && nB.fp[0] === nB.fp[1] && a1.clientFp === a2.clientFp && b1.clientFp === b2.clientFp && a1.clientFp === nA.fp[0] && b1.clientFp === nB.fp[0]
      && a1.beatLine === a2.beatLine && JSON.stringify(a1.lanesBar0) === JSON.stringify(a2.lanesBar0) && JSON.stringify(b1.lanesBar0) === JSON.stringify(b2.lanesBar0)
      && JSON.stringify(a1.lanesBar0) === JSON.stringify(nA.bar0) && JSON.stringify(b1.lanesBar0) === JSON.stringify(nB.bar0) && a1.engine?.bpm === nA.bpm && b1.engine?.bpm === nB.bpm,
    { [SEEDS[0]]: { node: nA.fp, room: [a1.clientFp, a2.clientFp], line: [a1.beatLine, a2.beatLine] }, [SEEDS[1]]: { node: nB.fp, room: [b1.clientFp, b2.clientFp], line: [b1.beatLine, b2.beatLine] } }, 'identical per seed');
  check('G2', 'two seeds give different beats', nA.fp[0] !== nB.fp[0] && a1.clientFp !== b1.clientFp, { a: nA.fp[0], b: nB.fp[0], a0: nA.bar0, b0: nB.bar0 }, 'different');

  // play the last render (seed A, second load)
  const { p, ctx } = keep!;
  const seed = SEEDS[0];
  const beat = houseBeatFor(seed);
  await shot(p, '[data-qa="arena-set"]', 'p6live-arena-one-attempt');
  check('G3', 'the ONE ATTEMPT line is on screen BEFORE START, with the locked beat line, and no tempo/swing control', /ONE attempt/.test(a2.rules ?? '') && /locked/.test(a2.beatLine ?? '') && a2.tempoControls === 0 && a2.phase === 'ready',
    { rules: a2.rules, beatLine: a2.beatLine, tempoControls: a2.tempoControls, phase: a2.phase }, 'ONE attempt · locked · 0 controls · ready');
  await qa(p, 'arena-start').click();
  const plan = beat.notes.map((n) => ({ rel: songStepTime(n.bar, n.step, 16, beat.bpm, beat.swing), lane: HOUSE_LANES.indexOf(n.lane) }));
  const tempoSamples: Any[] = [];
  const sampler = (async () => {
    for (let i = 0; i < 90; i++) {
      const v = await p.evaluate('(() => { const e = window.__FEL_STUDIO__.engine(); return { phase: document.querySelector(\'[data-qa="arena-set"]\')?.getAttribute("data-phase"), bpm: e?.bpm, swing: e?.swing, running: e?.running }; })()').catch(() => null);
      if (v) tempoSamples.push(v);
      if (v && v.phase === 'done') break;
      await sleep(1000);
    }
  })();
  const played = await inPage(p, `async (pl) => {
    const W = window, P = W.__FEL_STUDIO__;
    const keys = ['h', 'j', 'k', 'l'];
    const startAt = P.now();
    let t0 = null;
    for (let i = 0; i < 6000 && t0 === null; i++) {
      const o = W.__OFF__.find((x) => x.time > startAt && x.k === 1);
      if (o) t0 = o.time;
      await new Promise((r) => setTimeout(r, 3));
    }
    if (t0 === null) return { err: 'no downbeat' };
    const lat = W.__SET__.latencySec;
    let taps = 0, late = 0;
    for (const n of pl) {
      while (P.now() < t0 + n.rel + lat - 0.0015) await new Promise((r) => setTimeout(r, 0));
      if (P.now() - (t0 + n.rel + lat) > 0.03) late++;
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: keys[n.lane], bubbles: true, cancelable: true }));
      taps++;
    }
    for (let i = 0; i < 8000; i++) { if (W.__FEL_STUDIO__.ended) break; await new Promise((r) => setTimeout(r, 20)); }
    return { taps, late, downbeat: t0, lat };
  }`, plan);
  await sampler;
  const posts: Any[] = await p.evaluate('window.__attemptPosts');
  const ended = await p.evaluate('window.__FEL_STUDIO__.ended');
  const finish = posts.find((x) => x.phase === 'finish');
  const taps: HouseTap[] = finish?.taps ?? [];
  const rerun = judgeHouseSet(beat, taps);
  R.G.play = {
    seed, beat: { kit: beat.kit, bpm: beat.bpm, swing: beat.swing, notes: beat.notes.length, setBars: beat.setBars }, played,
    posts: posts.map((x) => ({ phase: x.phase, matchId: x.matchId, taps: x.taps ? x.taps.length : undefined })),
    room: summary(ended), recapArena: await qa(p, 'recap-arena').textContent().catch(() => null),
    rerun: { score: rerun.score, accuracy: rerun.accuracy, grade: rerun.grade, won: rerun.won },
    ceiling: { HOUSE_SET_MAX, oldCeiling: performSetMax(512) },
    tempo: Object.fromEntries(['starting', 'playing', 'done'].map((ph) => { const ss = tempoSamples.filter((s) => s.phase === ph); return [ph, { samples: ss.length, bpms: [...new Set(ss.map((s) => s.bpm))], swings: [...new Set(ss.map((s) => s.swing))], running: [...new Set(ss.map((s) => s.running))] }]; })),
  };
  log('arena play', JSON.stringify(R.G.play));
  await shot(p, '[data-qa="arena-set"]', 'p6live-arena-recap');
  const pl = R.G.play.tempo.playing;
  check('G4', 'the house beat plays LOCKED through the set (every tempo/swing sample while PLAYING = the beat\'s)', pl.samples >= 30 && pl.bpms.length === 1 && pl.bpms[0] === beat.bpm && pl.swings.length === 1 && pl.swings[0] === beat.swing,
    R.G.play.tempo, { bpm: beat.bpm, swing: beat.swing });
  check('G5', 'ONE start post, one finish post with the taps; the room\'s score = judgeHouseSet(houseBeatFor(id), posted taps) rerun in node', posts.filter((x) => x.phase === 'start').length === 1 && !!finish && ended?.score === rerun.score,
    { starts: posts.filter((x) => x.phase === 'start').length, finishTaps: taps.length, room: ended?.score, rerun: rerun.score }, 'equal');
  check('G6', 'a perfect house set scores exactly the new ceiling HOUSE_SET_MAX', ended?.score === HOUSE_SET_MAX, { room: ended?.score, HOUSE_SET_MAX, old: performSetMax(512) }, HOUSE_SET_MAX);
  await ctx.close();
}

async function run(): Promise<void> {
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: ARGS });
  try {
    const only = process.env.ONLY ?? '';
    if (!only || only === 'free') await freePlay(browser).catch((e) => { R.freeError = String(e?.stack ?? e).slice(0, 1200); log('free ERROR', e); });
    if (!only || only === 'arena') await arena(browser).catch((e) => { R.arenaError = String(e?.stack ?? e).slice(0, 1200); log('arena ERROR', e); });
  } finally {
    await browser.close();
    R.passed = R.checks.filter((c: Any) => c.pass).length; R.total = R.checks.length;
    const file = `${OUT}/p6live-probe${process.env.ONLY ? `-${process.env.ONLY}` : ''}.json`;
    fs.writeFileSync(file, JSON.stringify(R, null, 1));
    log(`${R.passed}/${R.total} checks, ${R.pageErrors.length} page errors → ${file}`);
  }
}
run().catch((e) => { console.error(e); process.exit(1); });
