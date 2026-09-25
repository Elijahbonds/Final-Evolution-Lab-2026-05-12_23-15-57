// MUSIC-SUITE P1 (2026-09-25) — the Cypher's input and pause baseline, on /dev/mode/dance with a fake pad.
//
// The map (understand-wf_3a55346f-032.json, THE DANCE ROOM) says, from code: R2 and a held SPACE count EVERY frame over
// 0.5 as a tap (no edge latch), a SPACE tap is judged on key-UP, and a pause lets the song clock run on so the resume
// is a string of MISSes and a stacked-note blast. None of it had been measured. This probe measures it on the real mode.
//
// How it reads the judge without touching the mode: DanceCore's DancePerformance is reached through the dev server's
// webpack module cache (a runtime-only chunk pushed onto webpackChunk_N_E hands back __webpack_require__), and its
// prototype's hit() and update() are wrapped to log every judgement (a MISS returned by hit() is always a WILD tap —
// DanceCore.ts:283 registerMiss(undefined)) and every step that expired unhit (update's MISS delta). The InputBus is
// read through __FEL_DEV__.input.on, the HUD through the dev runner's JSON, and every Web Audio source start (to see a
// burst) through wrapped AudioScheduledSourceNode / AudioBufferSourceNode start()s in an init script. Nothing in the app
// is changed.
//
// TWO CLOCKS (measured here, 2026-09-25): the page runs two AudioContexts — DanceMode's song clock and SoundKit's — about
// 150 ms apart. The dance's is found as the one whose currentTime equals the `now` update() is handed; the first cut
// picked by source-start count and landed on SoundKit's (its miss blips outnumber the kit), which put every timed press
// ~150 ms late.
//
// Runs: (1) the pick screen, with d-pad browsing at +2 / +4 / +5.5 s to time the 6 s auto-start; (2) ?track=cypher,
// chart-aware (the Cypher's 17 steps are read from DancePerformance): (a) R2 (standard mapping buttons[7].value) held 1 s
// in a step-free gap; (a2) a natural 150 ms R2 pull on a step's beat; (b) SPACE held 1 s in a step-free gap; (c) three
// 110 ms SPACE taps on the dance clock — two with the key DOWN on the beat, one with the key UP on the beat — judged at
// down or up?; (d) pad START (buttons[9]) pause for 5 s, START to resume — the MISS burst and the audio burst after;
// frames mid-dance at 1280×800 and 375×812, and the results. A stand-in dancer (in-page, pad A 15 ms ahead of each step
// it owns) plays the steps no test uses, so the band is up before the pause — a silent band cannot show a resume blast.
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_dance-baseline.mts   (BASE, OUT env override)
import { chromium, type Page, type Browser } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p1';
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[dance +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), frames: {}, pageErrors: [] as string[], console: [] as string[] };
const frame = async (p: Page, name: string) => { const path = `${OUT}/dance-${name}.png`; await p.screenshot({ path }); R.frames[name] = path; log('frame', path); };

const INIT = `
window.__name = window.__name || function (f) { return f; };
(() => {
  const mk = () => ({ pressed: false, touched: false, value: 0 });
  const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: Date.now(), buttons: Array.from({ length: 17 }, mk) };
  window.__PAD = pad;
  navigator.getGamepads = () => [pad];
  window.__padBtn = (i, v) => { pad.buttons[i] = { pressed: v > 0.1, touched: v > 0, value: v }; pad.timestamp = Date.now(); };
  // every AudioContext, so the dance's song clock can be found and its state read
  const AC = window.AudioContext;
  window.__ACS = [];
  window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__ACS.push(this); } };
  // every source start: [wall ms, context index, context time, scheduled when]
  window.__STARTS = [];
  // AudioBufferSourceNode declares its OWN start(when, offset, duration), which shadows AudioScheduledSourceNode's, so
  // both are wrapped (the first cut wrapped only the parent and saw oscillators alone — the kit's buffers went uncounted)
  for (const proto of [AudioScheduledSourceNode.prototype, AudioBufferSourceNode.prototype]) {
    if (!Object.prototype.hasOwnProperty.call(proto, 'start')) continue;
    const st = proto.start;
    proto.start = function (when, ...rest) {
      try { const L = window.__STARTS; L.push([performance.now(), window.__ACS.indexOf(this.context), this.context.currentTime, when ?? 0]); if (L.length > 40000) L.splice(0, 20000); } catch (e) {}
      return st.call(this, when, ...rest);
    };
  }
  window.__KEYS = [];
  addEventListener('keydown', (e) => { if (e.key === ' ' && !e.repeat) window.__KEYS.push({ type: 'down', w: performance.now() }); }, true);
  addEventListener('keyup', (e) => { if (e.key === ' ') window.__KEYS.push({ type: 'up', w: performance.now() }); }, true);
})();`;

/** Reach DancePerformance through the webpack module cache and wrap hit() / update(); subscribe to the bus. */
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
      // the nearest step (pending, or the next unfired one) BEFORE the judge consumes it: the tap's signed distance (+ late)
      const bd = 60 / this.bpm; let near = null;
      for (const q of this.pending) if (near === null || Math.abs(now - q.time) < Math.abs(now - near)) near = q.time;
      const nx = this.steps[this.nextIdx];
      if (nx) { const t = this.started + nx.beat * bd; if (near === null || Math.abs(now - t) < Math.abs(now - near)) near = t; }
      const pend = this.pending.length; const res = oh.call(this, now);
      window.__DLOG.push({ k: 'hit', label: res, wild: res === 'MISS', a: now, w: performance.now(), pendingBefore: pend, nearestStepMs: near === null ? null : +((now - near) * 1000).toFixed(1) });
      window.__DPERF = this; return res;
    };
    const ou = P.update;
    P.update = function (now) {
      window.__DPERF = this;
      // THE SONG CLOCK IS FOUND, NOT GUESSED: update() is handed DanceMode's audioNow(), so the context whose currentTime
      // equals it right now is the dance's (the other one is SoundKit's, a fixed offset away)
      if (!window.__DCTX && window.__ACS.length) {
        const off = window.__ACS.map((c) => Math.abs(c.currentTime - now));
        const i = off.indexOf(Math.min(...off));
        window.__DCTX = window.__ACS[i];
        window.__DCTX_DIAG = { index: i, offsetsMs: window.__ACS.map((c) => +((c.currentTime - now) * 1000).toFixed(1)) };
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
  return { ok: true, bus: !!window.__BUS };
})()`;

const hud = (p: Page) => p.evaluate(() => {
  const pre = document.querySelector('pre'); const head = pre?.previousElementSibling?.textContent ?? '';
  let json: Any = null; try { json = JSON.parse(pre?.textContent ?? 'null'); } catch { /* mid-render */ }
  return { head, hud: json };
});
const now = (p: Page) => p.evaluate(() => performance.now());
const sleep = (p: Page, ms: number) => p.waitForTimeout(ms);

/** What happened between two wall times: judged hits, wild taps, expired steps, R>0.5 bus events, A presses. */
async function tally(p: Page, from: number, to: number): Promise<Any> {
  return p.evaluate(([a, b]) => {
    const L = ((window as Any).__DLOG ?? []).filter((e: Any) => e.w >= a && e.w <= b);
    const B = ((window as Any).__BUS ?? []).filter((e: Any) => e.w >= a && e.w <= b);
    const hits = L.filter((e: Any) => e.k === 'hit');
    return {
      judgedTaps: hits.length,
      cleanHits: hits.filter((e: Any) => !e.wild).map((e: Any) => e.label),
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
  // A cold /dev/mode compile on a lane server (the whole Babylon graph, rebuilt whenever another agent edits the lane)
  // can outlast webpack's 120 s chunk timeout in the page: reload until the page chunk arrives.
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
  const w0 = await now(p);
  await padPress(p, 0);   // A wakes the harness (a waking button is dropped, StartWake) — the pick screen stays up
  await sleep(p, 1200);
  await frame(p, 'pick');
  const pickHud = await hud(p);
  // browse right at +2 s, +4 s, +5.5 s after the wake: does the 6 s timeout start the track under a browsing player?
  const browse: Any[] = [];
  for (const at of [2000, 4000, 5500]) {
    const wait = w0 + at - (await now(p)); if (wait > 0) await sleep(p, wait);
    await padPress(p, 15, 60);   // d-pad right (standard mapping 15)
    await sleep(p, 80);
    browse.push({ atMs: at, hud: (await hud(p)).hud?.round ?? null });
  }
  let startedAtMs: number | null = null; let lockedTrack: string | null = null;
  for (let i = 0; i < 60; i++) {
    const h = await hud(p);
    const b = String(h.hud?.banner ?? '');
    if (/^[1-4]$/.test(b) || b === 'GO') { startedAtMs = Math.round((await now(p)) - w0); lockedTrack = String(h.hud?.round ?? ''); break; }
    await sleep(p, 100);
  }
  R.pick = { hudAtPick: pickHud.hud, browse, countInStartedMsAfterWake: startedAtMs, trackLocked: lockedTrack,
    how: 'no ?track: pad A wakes the harness; d-pad right (buttons[15]) at +2/+4/+5.5 s; the count-in start = first HUD banner 4..1 or GO, timed from the wake on performance.now()' };
  log('pick', JSON.stringify(R.pick).slice(0, 400));
  await ctx.close();
}

async function measuredRun(browser: Browser): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await bootMode(p, `${BASE}/dev/mode/dance?track=cypher`);
  let hook: Any = null;
  for (let i = 0; i < 100; i++) { hook = await p.evaluate(HOOK); if (hook.ok && hook.bus) break; await sleep(p, 200); }
  R.hook = hook;
  log('hook', JSON.stringify(hook));
  const acsBefore = await p.evaluate(() => (window as Any).__ACS.map((c: AudioContext) => ({ state: c.state, t: +c.currentTime.toFixed(3) })));
  const wWake = await now(p);
  await padPress(p, 0);   // wake (dropped as a gameplay press)
  // wait for the song to start (DancePerformance.update runs only once the count-in is spent)
  let started = false;
  for (let i = 0; i < 120; i++) { started = await p.evaluate(() => !!(window as Any).__DPERF?.running); if (started) break; await sleep(p, 100); }
  const acsAfter = await p.evaluate(() => (window as Any).__ACS.map((c: AudioContext) => ({ state: c.state, t: +c.currentTime.toFixed(3) })));
  R.audioContexts = { beforeWake: acsBefore, afterCountIn: acsAfter, songStarted: started, msFromWakeToSong: Math.round((await now(p)) - wWake),
    how: 'every AudioContext constructed (init-script subclass); state + currentTime before the wake and once DancePerformance.running' };
  log('audio', JSON.stringify(R.audioContexts));
  if (!started) { await frame(p, 'stuck-countin'); R.fatal = 'the song never started (count-in stuck)'; await ctx.close(); return; }
  const S = await now(p);   // wall time ≈ song beat 0 (+ up to one 100 ms poll)
  const chart = await p.evaluate(() => { const d = (window as Any).__DPERF; return { steps: d.steps.length, bpm: d.bpm, beats: d.steps.map((s: Any) => s.beat), started: d.started }; });
  const bd = 60 / chart.bpm;
  const stepSec = (chart.beats as number[]).map((b) => +(b * bd).toFixed(3));
  R.songClock = await p.evaluate(() => {
    const w = window as Any; const S4 = w.__STARTS as number[][]; const by: Record<number, number> = {}; for (const x of S4) by[x[1]] = (by[x[1]] ?? 0) + 1;
    return { ...w.__DCTX_DIAG, startsPerCtxSoFar: by, how: 'the context whose currentTime equals the now DancePerformance.update() is handed (offsetsMs per context at that call)' };
  });
  log('song clock', JSON.stringify(R.songClock));
  R.chart = { ...chart, stepSec, how: 'DancePerformance.steps / bpm / started (audio clock) via the wrapped update(); stepSec = beat × 60/bpm from song start' };
  log('chart', JSON.stringify(stepSec));
  const at = async (ms: number) => { const w = S + ms - (await now(p)); if (w > 0) await sleep(p, w); };

  // THE STAND-IN DANCER. A run with no clean hit keeps the band silent (every stem starts at 0 and only a hit turns one
  // up), and a silent band cannot show the resume blast. So an in-page bot presses pad A 15 ms before each step it owns
  // (the InputBus reads the pad on the next frame), on the dance's own audio clock. It leaves alone every step a test
  // window uses: the R2 pull at the step near 6 s, the three SPACE taps, and the two steps that fall inside the pause.
  // indices into the chart: 2 = 6.25 s (R2 pull), 4/5/6 = 11.25/13.75/15.0 (SPACE), 9/10 = 22.5/25.0 (inside the pause —
  // a bot press there would RESUME the game: any real press resumes, ModeHarness.ts:603)
  const TEST_STEPS = [2, 4, 5, 6, 9, 10];
  const botSteps = stepSec.map((_, i) => i).filter((i) => !TEST_STEPS.includes(i));
  R.bot = { stepsOwned: botSteps.map((i) => stepSec[i]), leadMs: 15 };
  await p.evaluate(([own]) => {
    const w = window as Any; const d = w.__DPERF; const bd2 = 60 / d.bpm;
    const ctx: AudioContext = w.__DCTX;   // found by the update() wrapper
    const times = (own as number[]).map((i) => d.started + d.steps[i].beat * bd2);
    let k = 0; w.__BOT = [];
    const iv = setInterval(() => {
      if (k >= times.length) { clearInterval(iv); return; }
      const t = ctx.currentTime;
      if (t > times[k] + 0.1) { k++; return; }   // passed it (a pause): let it go
      if (t >= times[k] - 0.015) { w.__padBtn(0, 1); setTimeout(() => w.__padBtn(0, 0), 70); w.__BOT.push({ step: +(times[k] - d.started).toFixed(3), pressAtMs: +((t - times[k]) * 1000).toFixed(1) }); k++; }
    }, 2);
  }, [botSteps]);
  /** Wait in-page until the dance clock reaches song second `sec` (+ lead), precise to ~2 ms. */
  const untilSong = (sec: number) => p.evaluate(async (x) => { const w = window as Any; const t = w.__DPERF.started + x; while (w.__DCTX.currentTime < t) await new Promise((r) => setTimeout(r, 1)); return w.__DCTX.currentTime; }, sec);

  // (a) R2 held 1 s, in the gap between the steps at 1.25 s and 6.25 s: every frame over 0.5 is a tap
  await at(2500);
  const a0 = await now(p); const hudA0 = (await hud(p)).hud;
  await p.evaluate(() => (window as Any).__padBtn(7, 1));
  await sleep(p, 1000);
  await p.evaluate(() => (window as Any).__padBtn(7, 0));
  const a1 = await now(p);
  await sleep(p, 250);
  const hudA1 = (await hud(p)).hud;
  const fpsA = await p.evaluate(([x, y]) => { let n = 0; return new Promise<number>((res) => { const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 500) requestAnimationFrame(f); else res(Math.round(n * 2)); }; requestAnimationFrame(f); void x; void y; }); }, [0, 0]);
  R.r2Hold = { ...(await tally(p, a0, a1 + 250)), heldMs: Math.round(a1 - a0), rafFpsAfter: fpsA, hudBefore: { score: hudA0?.score, combo: hudA0?.combo }, hudAfter: { score: hudA1?.score, combo: hudA1?.combo },
    how: 'pad buttons[7] {pressed, value 1} for 1000 ms in a step-free gap (song 2.5–3.5 s); judgements from the wrapped DancePerformance.hit in [press, release+250 ms]; R>0.5 = InputBus trigger events seen by __FEL_DEV__.input.on; rafFps = requestAnimationFrame count over 500 ms right after' };
  log('R2 hold', JSON.stringify(R.r2Hold));

  // (a2) a natural R2 pull (150 ms) ON a step's beat: one hit, and then?
  {
    const t = stepSec[2];
    await untilSong(t - 0.02);
    const w0 = await now(p);
    await p.evaluate(() => (window as Any).__padBtn(7, 1));
    await sleep(p, 150);
    await p.evaluate(() => (window as Any).__padBtn(7, 0));
    await sleep(p, 250);
    const ta = await tally(p, w0, (await now(p)));
    const detail = await p.evaluate((x) => ((window as Any).__DLOG ?? []).filter((e: Any) => e.k === 'hit' && e.w >= x).map((e: Any) => ({ label: e.label, nearestStepMs: e.nearestStepMs })), w0);
    R.r2Pull = { step: t, ...ta, judgements: detail, how: `pad buttons[7] pulled 20 ms before the step at ${t} s (in-page wait on the dance clock) and held 150 ms, a natural trigger tap` };
    log('R2 pull', JSON.stringify(R.r2Pull));
  }
  await sleep(p, 300);
  await frame(p, 'mid-desktop');

  // (b) SPACE held 1 s, in the gap between 8.75 s and 11.25 s
  await at(9300);
  const b0 = await now(p); const hudB0 = (await hud(p)).hud;
  await p.keyboard.down(' ');
  await sleep(p, 1000);
  await p.keyboard.up(' ');
  const b1 = await now(p);
  await sleep(p, 250);
  const hudB1 = (await hud(p)).hud;
  R.spaceHold = { ...(await tally(p, b0, b1 + 250)), heldMs: Math.round(b1 - b0), hudBefore: { score: hudB0?.score, combo: hudB0?.combo }, hudAfter: { score: hudB1?.score, combo: hudB1?.combo },
    how: 'keyboard.down(" ") … 1000 ms … keyboard.up(" ") in a step-free gap (song 9.3–10.3 s); the pad stays connected and idle; same counters as the R2 hold' };
  log('SPACE hold', JSON.stringify(R.spaceHold));

  // (c) short SPACE taps, key DOWN exactly on a step's beat (in-page key events on the dance clock), held 110 ms
  const taps: Any[] = [];
  // steps 4 and 5: key DOWN on the beat; step 6: key down 110 ms EARLY, so the key comes UP on the beat
  for (const [i, lead] of [[4, 0], [5, 0], [6, 110]] as [number, number][]) {
    const t = stepSec[i] - lead / 1000;
    const res = await p.evaluate(async ([x, hold]) => {
      const w = window as Any; const target = w.__DPERF.started + x;
      while (w.__DCTX.currentTime < target) await new Promise((r) => setTimeout(r, 1));
      const l0 = (w.__DLOG ?? []).length;
      const downAt = performance.now(); const downAudio = w.__DCTX.currentTime;
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
      await new Promise((r) => setTimeout(r, hold));
      const upAt = performance.now();
      document.body.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }));
      await new Promise((r) => setTimeout(r, 120));
      const hits = (w.__DLOG ?? []).slice(l0).filter((e: Any) => e.k === 'hit');
      const h = hits[0];
      return { downVsTargetMs: +((downAudio - target) * 1000).toFixed(1), keyHeldMs: +(upAt - downAt).toFixed(1), judgements: hits.length, label: h?.label ?? null,
        tapVsStepMs: h?.nearestStepMs ?? null, judgedMsAfterDown: h ? +(h.w - downAt).toFixed(1) : null, judgedMsAfterUp: h ? +(h.w - upAt).toFixed(1) : null,
        judgedAt: h ? (h.w >= upAt - 1 ? 'key-UP' : 'key-DOWN') : 'none' };
    }, [t, 110] as [number, number]);
    taps.push({ step: stepSec[i], keyDownLeadMs: lead, ...res });
  }
  R.spaceTap = { taps, how: 'in-page KeyboardEvent keydown dispatched on document.body when the dance clock reached the step (the InputBus reads window key events; these are untrusted but its handler does not check), keyup 110 ms later; the wrapped hit() logs the judgement, its wall time and its signed distance to the nearest step' };
  log('SPACE taps', JSON.stringify(taps));

  // (d) pause 5 s with pad START, resume with START — from song 20.6 s (after the bot's 20.0 s hit), two steps inside
  await untilSong(20.6);
  const hudP0 = (await hud(p)).hud;
  const mixBefore = hudP0?.energy ?? null;
  const d0 = await now(p);
  await padPress(p, 9);
  await sleep(p, 300);
  const phasePaused = (await hud(p)).head;
  const acPaused = await p.evaluate(() => (window as Any).__ACS.map((c: AudioContext) => ({ state: c.state, t: +c.currentTime.toFixed(3) })));
  await sleep(p, 4700);
  const acBeforeResume = await p.evaluate(() => (window as Any).__ACS.map((c: AudioContext) => ({ state: c.state, t: +c.currentTime.toFixed(3) })));
  const r0 = await now(p);
  await padPress(p, 9);
  await sleep(p, 1200);
  const hudP1 = (await hud(p)).hud;
  const pauseTally = await tally(p, d0 + 50, r0);
  const resumeTally = await tally(p, r0, r0 + 1000);
  const expiries = await p.evaluate(([pa, x, y]) => ((window as Any).__DLOG ?? []).filter((e: Any) => e.k === 'expire' && e.w >= pa && e.w <= y).map((e: Any) => ({ n: e.n, msAfterPausePress: +(e.w - pa).toFixed(1), msAfterResumePress: +(e.w - x).toFixed(1) })), [d0, r0, r0 + 1000]);
  const headAfterResume = (await hud(p)).head;
  const bursts = await p.evaluate(([pa, ra]) => {
    const w = window as Any; const S3 = w.__STARTS as number[][]; const di = w.__ACS.indexOf(w.__DCTX);
    const win = (a: number, b: number) => S3.filter((s) => s[1] === di && s[0] >= a && s[0] < b);
    const past = (L: number[][]) => L.filter((s) => s[3] > 0 && s[3] < s[2] - 0.005);
    const after = win(ra, ra + 300); const before = win(pa - 1300, pa - 1000);
    const by: Record<number, number> = {}; for (const x of S3) by[x[1]] = (by[x[1]] ?? 0) + 1;
    const bucket = (a: number) => { const out: number[] = []; for (let k = 0; k < 10; k++) out.push(win(a + k * 100, a + (k + 1) * 100).length); return out; };
    return { danceCtxIndex: di, startsPerCtxWholeRun: by,
      startsPer100msFromResumePress: bucket(ra), startsPer100msOrdinary: bucket(pa - 2000),
      resumeStartsDump: win(ra, ra + 1000).slice(0, 40).map((s) => ({ msAfterResumePress: +(s[0] - ra).toFixed(1), ctxNow: +s[2].toFixed(3), scheduledFor: +s[3].toFixed(3), behindSec: s[3] > 0 ? +(s[2] - s[3]).toFixed(3) : 0 })),
      pastTimeStartsIn1sAfterResume: past(win(ra, ra + 1000)).length,
      startsIn300msAfterResume: after.length, pastTimeStartsAfterResume: past(after).length,
      oldestPastStartSecBehind: past(after).length ? +Math.max(...past(after).map((s) => s[2] - s[3])).toFixed(2) : 0,
      startsInAnOrdinary300msBeforePause: before.length, pastTimeStartsOrdinary: past(before).length };
  }, [d0, r0]);
  R.pause = { pausedMs: Math.round(r0 - d0), mixBeforePause: mixBefore, harnessHeadWhilePaused: phasePaused, audioWhilePaused: { justAfterPause: acPaused, justBeforeResume: acBeforeResume },
    duringPause: pauseTally, firstSecondAfterResume: resumeTally, expiriesAroundPause: expiries, harnessHeadAfterResume: headAfterResume, audioBurst: bursts,
    hudBefore: { score: hudP0?.score, combo: hudP0?.combo, energy: hudP0?.energy }, hudAfter: { score: hudP1?.score, combo: hudP1?.combo, banner: hudP1?.banner, energy: hudP1?.energy },
    how: 'pad START (buttons[9]) 90 ms at song 20.6 s → harness paused; 5 s; START again resumes. MISS burst = steps the wrapped update() expired after the resume (each entry is one update() call = one frame); audio burst = Web Audio source starts on the dance context in the 300 ms after resume whose scheduled time was already in the past, vs an ordinary 300 ms window before the pause' };
  log('pause', JSON.stringify(R.pause).slice(0, 1200));

  // mid-dance on a phone-sized viewport
  await at(29000);
  await p.setViewportSize({ width: 375, height: 812 });
  await sleep(p, 1500);
  await frame(p, 'mid-phone');
  await p.setViewportSize({ width: 1280, height: 800 });

  // results
  let result: string | null = null;
  for (let i = 0; i < 400; i++) {
    result = R.console.find((s: string) => s.includes('[dev] result')) ?? null;
    if (result) break;
    await sleep(p, 150);
  }
  await sleep(p, 1200);
  await frame(p, 'results');
  const endHud = (await hud(p)).hud;
  const all = await p.evaluate(() => { const d = (window as Any).__DPERF; const L = (window as Any).__DLOG ?? []; return {
    counts: d?.counts, score: d?.score, maxCombo: d?.maxCombo,
    judgedTaps: L.filter((e: Any) => e.k === 'hit').length, wildTaps: L.filter((e: Any) => e.k === 'hit' && e.wild).length,
    cleanHits: L.filter((e: Any) => e.k === 'hit' && !e.wild).length, expiredSteps: L.filter((e: Any) => e.k === 'expire').reduce((n: number, e: Any) => n + e.n, 0),
    bot: (window as Any).__BOT, botJudgements: L.filter((e: Any) => e.k === 'hit' && !e.wild).map((e: Any) => [e.label, e.nearestStepMs]) }; });
  R.results = { consoleResult: result, endBanner: endHud?.banner ?? null, whole: all,
    how: 'the harness resultSink line ([dev] result, the dev runner logs SessionResult) + DancePerformance.counts at the end + the wrapped hit()/update() totals' };
  log('results', JSON.stringify(R.results).slice(0, 600));
  await ctx.close();
}

/**
 * THE LATE-BUT-UNFIRED GAP, checked on the pure judge (no browser). The browser run showed an R2 pull 2 ms after a step
 * judged as a WILD tap and then the next frame's pull (34 ms late) capped to GOOD, and 5 of the stand-in dancer's 11
 * presses wild. The cause is in DancePerformance.hit (DanceCore.ts:262-284): a tap AFTER a step's time but BEFORE the
 * update() that moves the step into `pending` finds nothing pending and is not "early" (earlyBy <= 0), so it is a wild
 * miss. Whether a tap meets that gap depends only on whether input or update() runs first in the frame the step falls
 * due — the same tap, the same step, the two orders.
 */
async function gapCheck(): Promise<void> {
  const M: Any = await import('../../lib/babylon/core/DanceCore.ts');
  const { DancePerformance, beatDuration } = M.DancePerformance ? M : M.default;
  const bd = beatDuration(96);
  const steps = [{ clipId: 'dance_bounce_two_step', beat: 4, holdBeats: 2, mirrored: false }];
  const rows: Any[] = [];
  for (const lateMs of [-30, -10, -1, 1, 5, 15, 30]) {
    const a = new DancePerformance(96); a.setRoutine(steps); a.start(0); a.update(4 * bd - 0.02);   // last update before the step
    const b = new DancePerformance(96); b.setRoutine(steps); b.start(0); b.update(4 * bd + lateMs / 1000);   // update ran first
    rows.push({ tapVsStepMs: lateMs, inputBeforeUpdate: a.hit(4 * bd + lateMs / 1000), updateBeforeInput: b.hit(4 * bd + lateMs / 1000) });
  }
  R.gapCheck = { rows, how: 'pure DancePerformance (96 BPM, one step on beat 4): a tap at step ± ms judged (a) when the last update() ran 20 ms before the step, (b) when update() already ran at the tap time' };
  log('gap check', JSON.stringify(rows));
}

async function main() {
  // ONLY_GAP=1: the pure check alone, merged into the JSON the last browser run wrote
  if (process.env.ONLY_GAP) {
    const path = `${OUT}/dance-baseline.json`;
    if (fs.existsSync(path)) Object.assign(R, JSON.parse(fs.readFileSync(path, 'utf8')));
    await gapCheck();
    fs.writeFileSync(path, JSON.stringify(R, null, 2));
    log('merged gapCheck into', path);
    return;
  }
  await gapCheck();
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ARGS });
  try {
    await pickRun(browser);
    await measuredRun(browser);
  } catch (e) { R.fatal = String((e as Error)?.stack ?? e).slice(0, 1200); console.error(e); }
  finally {
    await browser.close();
    R.runtimeSec = Math.round((Date.now() - t0) / 1000);
    fs.writeFileSync(`${OUT}/dance-baseline.json`, JSON.stringify(R, null, 2));
    log('wrote', `${OUT}/dance-baseline.json`);
  }
}
main();
