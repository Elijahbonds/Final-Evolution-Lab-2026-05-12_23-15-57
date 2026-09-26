// MUSIC-SUITE P4 (2026-09-25), the recording booth — measured in a browser on the dev-only /dev/music route (the real
// StudioMode, no GameShell, database offline), with Chromium's FAKE audio capture (a beeping mic) standing in for a
// singer. What it checks:
//   1. ARM opens the mic ahead of the bar with RAW input (the track's settings: echoCancellation / noiseSuppression /
//      autoGainControl false), through the AudioWorklet, with a live meter and a visible MIC ON.
//   2. The worklet's clock stamp, in the real browser: a click scheduled on the context lands on the tape at its frame
//      (BoothMic.clockCheck — the device terms of the latency formula are tested in takeCapture.test.ts).
//   3. RECORD from a stop counts in (the engine's count-in clicks, then bar 0) and cuts a take of exactly the region's
//      length from bar 0's audio time + the latency; the booth stops the song it started.
//   4. BEST OF 2: a second take over the same bars; the newest plays; PICK / MUTE / DELETE (asked).
//   5. LOOP + STOP: PLAY → the picked take starts on every pass of its bars (on the bar lines the scheduler used); the
//      room's STOP stops the take that is sounding at that instant, and nothing starts after.
//   6. A reload keeps both takes (decoded from the store) and their group.
//   7. CLOSE MIC ends the track (the browser's mic light goes out); 0 page errors; frames (desktop + phone).
//
// MUSIC-SUITE P4 FIX PASS (2026-09-25): the probe had been written against the booth BEFORE grid-ui wired it to the room's
// transport (onTransport). On the integrated tree RECORD from a stop starts the ROOM's transport (PLAY turns to STOP) and
// the song keeps playing after the take — the room's STOP ends it — so "the booth stopped the song it started" failed and
// the next PLAY timed out (~:144). Now: the room's transport is expected (and stopped with its STOP before take 2), and
// the fix pass's booth changes are measured too — the current pick is SILENT while a new take records over its bars, and
// RECORD over a PLAYING song counts in with audible clicks (engine.countInBefore) before the take's bar.
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p4-booth.mts   (BASE, OUT env override)
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p4/booth';
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p4-booth +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), route: '/dev/music', frames: {}, pageErrors: [] as string[], checks: [] as Any[], numbers: {} };
const check = (name: string, pass: boolean, got: unknown, want: unknown) => { R.checks.push({ name, pass, got, want }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(got)); };
const frame = async (p: Page, name: string, full = true) => { const path = `${OUT}/p4-booth-${name}.png`; await p.screenshot({ path, fullPage: full }); R.frames[name] = path; };
const qa = (p: Page, id: string) => p.locator(`[data-qa="${id}"]`);
const booth = (p: Page): Promise<Any> => p.evaluate(() => { const b = (window as Any).__FEL_BOOTH__; return b ? { ...b, peakDb: b.peakDb, recentPeakDb: b.recentPeakDb, clockCheck: undefined } : null; });
const song = (p: Page): Promise<Any> => p.evaluate(() => (window as Any).__FEL_SONG__ ?? null);
const running = (p: Page): Promise<boolean> => p.evaluate(() => !!(window as Any).__FEL_STUDIO__?.engine()?.running);

/** Every AudioBufferSourceNode start/stop, and every getUserMedia stream — installed before the page's own scripts. */
const INIT = `(() => {
  const log = window.__srcLog = [];
  let n = 0;
  const S = AudioBufferSourceNode.prototype; const st = S.start, sp = S.stop;
  S.start = function (when = 0, offset, duration) { if (this.__id === undefined) this.__id = ++n; log.push({ k: 'start', id: this.__id, when, offset, duration, len: this.buffer ? this.buffer.length : 0, now: this.context.currentTime }); return st.apply(this, arguments); };
  S.stop = function (when = 0) { if (this.__id === undefined) this.__id = ++n; log.push({ k: 'stop', id: this.__id, when, len: this.buffer ? this.buffer.length : 0, now: this.context.currentTime }); return sp.apply(this, arguments); };
  window.__streams = [];
  const md = navigator.mediaDevices; const gum = md.getUserMedia.bind(md);
  md.getUserMedia = async (c) => { const s = await gum(c); window.__streams.push({ c: JSON.stringify(c), s }); return s; };
  localStorage.setItem('fel-music-progress', JSON.stringify({ patternsMade: 3, sectionsSaved: 2, chainEntries: 2 }));
})();`;

async function openRoom(p: Page): Promise<void> {
  await p.goto(`${BASE}/dev/music?stage=studio`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  const start = p.getByRole('button', { name: 'TAP TO START' });
  await start.waitFor({ timeout: 240000 });
  await start.click();
  await p.locator('[data-qa="kit-grid"]').waitFor({ timeout: 60000 });
  await qa(p, 'record-booth').waitFor({ timeout: 30000 });
  await p.waitForTimeout(500);
}
async function waitFor(p: Page, fn: string, ms: number, what: string): Promise<void> {
  try { await p.waitForFunction(fn, undefined, { timeout: ms, polling: 50 }); } catch { log('timeout waiting for', what); }
}
const takeStartsOf = (p: Page, len: number): Promise<Any[]> => p.evaluate((l) => (window as Any).__srcLog.filter((e: Any) => e.len === l), len);

async function main(): Promise<void> {
  const browser = await chromium.launch({ executablePath: chromiumExe(), args: ARGS, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 }, permissions: ['microphone'] });
  await ctx.addInitScript(INIT);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => R.pageErrors.push(e.message));
  // a dev-server reload (another lane saving a module) navigates the page: said, so a FATAL is not read as the booth's
  p.on('console', (m) => { if (/full reload|Fast Refresh/i.test(m.text())) log('dev server:', m.text().slice(0, 160)); });
  await openRoom(p);
  p.on('framenavigated', (f) => { if (f === p.mainFrame()) log('navigated:', f.url()); });
  // a beat to sing over: kick on the quarters
  for (const s of [0, 4, 8, 12]) await p.locator(`[data-qa="cell"][data-row="kick"][data-step="${s}"]`).click();

  // ── 1. before ARM: the mic is off, RECORD waits, no stream was asked for ──
  const pre = { micOn: await qa(p, 'mic-on').count(), recordDisabled: await qa(p, 'booth-record').isDisabled(), streams: await p.evaluate(() => (window as Any).__streams.length) };
  check('before ARM: mic off, RECORD disabled, no getUserMedia yet (nothing opens on a bar line)', pre.micOn === 0 && pre.recordDisabled && pre.streams === 0, pre, '0 / true / 0');

  // ── 1. ARM ──
  await qa(p, 'booth-arm').click();
  await qa(p, 'mic-on').waitFor({ timeout: 15000 });
  await p.waitForTimeout(1500);
  const armed = await booth(p);
  const asked = await p.evaluate(() => (window as Any).__streams.map((x: Any) => x.c));
  const peaks: number[] = [];
  for (let i = 0; i < 6; i++) { peaks.push(Math.round((await booth(p)).recentPeakDb)); await p.waitForTimeout(250); }   // the loudest of the last second
  R.numbers.arm = { settings: armed.settings, kind: armed.kind, latency: armed.latency, asked, peaks };
  check('ARM: raw input asked for and granted (echoCancellation / noiseSuppression / autoGainControl all false)',
    /"echoCancellation":false/.test(asked[0] ?? '') && /"noiseSuppression":false/.test(asked[0] ?? '') && /"autoGainControl":false/.test(asked[0] ?? '')
      && armed.settings?.echoCancellation === false && armed.settings?.autoGainControl !== true && armed.settings?.noiseSuppression !== true,
    { asked, settings: armed.settings }, 'false / false / false');
  check('ARM: captured through the AudioWorklet; MIC ON shows; the meter reads the input (the fake mic beeps)', armed.kind === 'worklet' && armed.micOn === true && Math.max(...peaks) > -60, { kind: armed.kind, micOn: armed.micOn, peaks }, 'worklet, true, a peak above -60 dBFS');
  await frame(p, 'armed');

  // ── 2. the worklet's clock stamp, in this browser ──
  const cc: Any[] = [];
  for (let i = 0; i < 5; i++) cc.push(await p.evaluate(() => (window as Any).__FEL_BOOTH__.clockCheck()));
  R.numbers.clockCheck = cc;
  check('clock: a click scheduled on the context lands on the tape at its own frame (5 runs, |error| ≤ 1 ms)', cc.every((c) => c.errorMs !== null && Math.abs(c.errorMs) <= 1), cc.map((c) => c.errorMs), '≤ 1 ms');

  // ── 3. RECORD from a stop: count-in, then a 1-bar take on bar 1 of a 2-bar loop ──
  await qa(p, 'booth-loop').selectOption('2');
  await qa(p, 'booth-from').selectOption('0');
  await qa(p, 'booth-length').selectOption('1');
  await qa(p, 'booth-countin').selectOption('1');
  const logBefore = await p.evaluate(() => (window as Any).__srcLog.length);
  const tRec = await p.evaluate(() => (window as Any).__FEL_STUDIO__.now());
  await qa(p, 'booth-record').click();
  await p.waitForTimeout(600);
  const counting = { status: await qa(p, 'booth-status').textContent().catch(() => null), running: await running(p), phase: (await booth(p)).phase };
  await frame(p, 'counting-in', false);
  await waitFor(p, '(window.__FEL_BOOTH__?.takes ?? 0) >= 1 && window.__FEL_BOOTH__?.phase === "armed"', 20000, 'take 1');
  const b1 = await booth(p);
  const clicks = await p.evaluate(([from, t]) => (window as Any).__srcLog.slice(from).filter((e: Any) => e.k === 'start' && e.when >= t && e.len < 20000), [logBefore, tRec]);
  const bar = 4 * 60 / 92;
  const lt = b1.lastTake;
  R.numbers.take1 = { counting, lastTake: lt, clicksBeforeBar0: lt ? clicks.filter((c: Any) => c.when < lt.startTime - 1e-6).length : null };
  check('RECORD from a stop: the count-in runs first (status says so), the transport starts', /count-in/.test(counting.status ?? '') && counting.running, counting, 'count-in status, running');
  const want = lt ? Math.round(bar * lt.sampleRate) : 0;
  // the take starts at bar 0's audio time + the latency (to the rounding of the ms the hook reports)
  const startErrMs = lt ? Math.abs(lt.startFrame / lt.sampleRate - lt.startTime) * 1000 - lt.latencyMs : null;
  check('take 1: exactly one bar long (the region), cut from bar 0\'s audio time + the latency; no dropped input',
    !!lt && Math.abs(lt.frames - want) <= 2 && lt.gaps === 0 && startErrMs !== null && Math.abs(startErrMs) <= 0.5,
    { ...lt, wantFrames: want, startErrMs }, `${want} frames ± 2, 0 gaps, start = bar 0 + latency`);
  check('count-in: 4 count clicks sounded before bar 0', R.numbers.take1.clicksBeforeBar0 >= 4, R.numbers.take1.clicksBeforeBar0, '≥ 4');
  const afterTake = { running: await running(p), transport: await p.locator('[data-qa="transport"] button').first().textContent() };
  check('RECORD started the ROOM\'s transport (PLAY reads STOP) and the song plays on after the take (fix pass: the integrated booth)', afterTake.running === true && afterTake.transport === 'STOP', afterTake, 'running, STOP');
  await p.locator('[data-qa="transport"] button').first().click();          // the room's STOP
  await p.waitForTimeout(300);
  check('the room\'s STOP stops it', (await running(p)) === false, await running(p), false);

  // ── 4. BEST OF 2 ── (P4 FIX PASS: the current pick — take 1 — must not play under take 2 while it records)
  const logBeforeT2 = await p.evaluate(() => (window as Any).__srcLog.length);
  await qa(p, 'booth-record').click();
  await waitFor(p, '(window.__FEL_BOOTH__?.takes ?? 0) >= 2 && window.__FEL_BOOTH__?.phase === "armed"', 20000, 'take 2');
  const b2 = await booth(p);
  const pickUnder = await p.evaluate(([from, len, t2]) => (window as Any).__srcLog.slice(from).filter((e: Any) => e.k === 'start' && e.len === len && e.when < t2 + 0.01).length, [logBeforeT2, lt?.frames ?? -1, b2.lastTake?.startTime ?? 0]);
  const pickStops = await p.evaluate(([from, len]) => (window as Any).__srcLog.slice(from).filter((e: Any) => e.len === len), [logBeforeT2, lt?.frames ?? -1]);
  R.numbers.pickUnderTake2 = { startsAtOrBeforeTake2: pickUnder, events: pickStops.slice(0, 6) };
  const t1Sounded = pickStops.some((e: Any, i: number) => e.k === 'start' && !pickStops.slice(i + 1).some((x: Any) => x.k === 'stop' && x.id === e.id && x.when <= e.when + 1e-6));
  check('FIX PASS: while take 2 records over bar 1, take 1 (the pick) does not sound under it (it bled into take 2)', !t1Sounded, R.numbers.pickUnderTake2, 'every start of take 1 stopped at or before its start');
  if (await running(p)) { await p.locator('[data-qa="transport"] button').first().click(); await p.waitForTimeout(300); }
  const groups = await p.evaluate(() => [...document.querySelectorAll('[data-qa="take-group"]')].map((g) => ({ slot: (g as HTMLElement).dataset.slot, text: g.firstElementChild?.textContent, takes: [...g.querySelectorAll('[data-qa="song-take"]')].map((t) => ({ id: (t as HTMLElement).dataset.take, picked: (t as HTMLElement).dataset.picked })) })));
  R.numbers.bestOf = { groups, playing: b2.playing, lastTake: b2.lastTake };
  check('the takes hold the input (the fake mic\'s beeps are in them, not silence)', (lt?.peakDb ?? -90) > -40 && (b2.lastTake?.peakDb ?? -90) > -40, [lt?.peakDb, b2.lastTake?.peakDb], 'peaks above -40 dBFS');
  check('best of 2: both takes over bar 1 are one group; the newest plays; the first is kept', groups.length === 1 && groups[0].takes.length === 2 && groups[0].takes[1].picked === '1' && groups[0].takes[0].picked === '0' && /BEST OF 2/.test(groups[0].text ?? '') && b2.playing.length === 1 && b2.playing[0] === groups[0].takes[1].id, R.numbers.bestOf, 'one group, take 2 picked');
  await frame(p, 'best-of-2');

  // ── 5. LOOP + STOP: PLAY, the picked take on every pass of bar 1 of the 2-bar loop ──
  const take2Len = b2.lastTake.frames;
  await p.evaluate(() => (window as Any).__FEL_STUDIO__.reset());
  await p.getByRole('button', { name: 'PLAY', exact: true }).first().click();
  await p.waitForTimeout(Math.round(bar * 4.4 * 1000));
  const steps = await p.evaluate(() => (window as Any).__FEL_STUDIO__.steps.filter((s: Any) => s.step === 0).map((s: Any) => s.time));
  const starts = (await takeStartsOf(p, take2Len)).filter((e: Any) => e.k === 'start');
  const passes = starts.slice(-3);
  const bar0 = steps.length ? steps[0] - Math.round((steps[0] - (passes[0]?.when ?? steps[0])) / bar) * bar : null;
  // the dev hook keeps the last 64 scheduled steps (4 bars): judge the passes whose bar line is still in that window
  const inWindow = passes.filter((s: Any) => steps.length && s.when >= steps[0] - 1e-6);
  const onLines = inWindow.map((s: Any) => Math.min(...steps.map((t: number) => Math.abs(t - s.when))) * 1000);
  const gaps = passes.slice(1).map((s: Any, i: number) => (s.when - passes[i].when) / bar);
  R.numbers.loop = { passes: passes.map((s: Any) => ({ when: s.when, offset: s.offset, duration: s.duration })), barLines: steps, offBarLineMs: onLines, passGapBars: gaps, bar0 };
  check('LOOP: the picked take starts on every pass of its bar (every 2 bars), on a scheduled bar line (≤ 0.01 ms off)', passes.length >= 2 && gaps.every((g: number) => Math.abs(g - 2) < 1e-3) && onLines.length >= 1 && onLines.every((d: number) => d <= 0.01), { passes: passes.length, gaps, onLines }, '≥ 2 passes, 2 bars apart, on the lines');
  // STOP in the middle of a pass
  await waitFor(p, `(() => { const s = window.__srcLog.filter((e) => e.len === ${take2Len} && e.k === 'start'); const l = s[s.length - 1]; const now = window.__FEL_STUDIO__.now(); return l && now > l.when + 0.3 && now < l.when + 1.5; })()`, 8000, 'mid-pass');
  const stopNow = await p.evaluate(() => (window as Any).__FEL_STUDIO__.now());
  await p.getByRole('button', { name: 'STOP', exact: true }).first().click();
  await p.waitForTimeout(200);
  const afterStop = await takeStartsOf(p, take2Len);
  const lastStart = [...afterStop].reverse().find((e: Any) => e.k === 'start');
  const stopped = afterStop.find((e: Any) => e.k === 'stop' && e.id === lastStart?.id);
  await p.waitForTimeout(Math.round(bar * 2.5 * 1000));
  const startsLater = (await takeStartsOf(p, take2Len)).filter((e: Any) => e.k === 'start').length;
  R.numbers.stop = { stopPressedAt: stopNow, lastStart, stopped, startsBefore: afterStop.filter((e: Any) => e.k === 'start').length, startsLater };
  check('STOP: the take sounding when STOP is pressed is stopped at that moment; nothing starts after', !!stopped && stopped.when - stopNow < 0.25 && stopped.when >= lastStart.when && startsLater === afterStop.filter((e: Any) => e.k === 'start').length, R.numbers.stop, 'stopped within the press, no new pass');

  // PICK / MUTE / DELETE (asked)
  await qa(p, 'take-pick').click(); await p.waitForTimeout(250);
  const picked = (await booth(p)).playing;
  const firstId = groups[0].takes[0].id;
  check('PICK hands the bars to take 1 (take 2 kept)', picked.length === 1 && picked[0] === firstId, picked, [firstId]);
  await qa(p, 'take-mute').first().click(); await p.waitForTimeout(250);
  const muted = await booth(p);
  check('MUTE silences the pick (nothing plays these bars; both kept)', muted.playing.length === 0 && muted.takes === 2, { playing: muted.playing, takes: muted.takes }, 'none playing, 2 kept');
  await qa(p, 'take-mute').first().click(); await p.waitForTimeout(150);
  await qa(p, 'take-remove').nth(1).click();
  const confirmText = await qa(p, 'take-remove-confirm').textContent();
  await p.getByRole('button', { name: 'KEEP', exact: true }).click(); await p.waitForTimeout(150);
  check('DELETE asks first, naming the take and its bars; KEEP keeps it', /Remove take 2 \(bar 1, /.test(confirmText ?? '') && (await booth(p)).takes === 2, confirmText, 'asked, still 2');

  // ── 6. reload: both takes back, decoded, one group ──
  await p.waitForTimeout(900);   // autosave (400 ms) + the store
  await openRoom(p);
  await waitFor(p, '(window.__FEL_SONG__?.takesLoaded ?? 0) >= 2', 15000, 'takes decoded');
  const back = { song: await song(p), booth: await booth(p) };
  R.numbers.reload = { takes: back.song?.takes, loaded: back.song?.takesLoaded, missing: back.song?.takesMissing, playing: back.booth?.playing };
  check('reload: both takes are back and decoded; take 1 is still the pick', back.song?.takes === 2 && back.song?.takesLoaded === 2 && back.booth?.playing?.[0] === firstId, R.numbers.reload, '2 / 2 / take 1');

  // ── 7a. FIX PASS: RECORD over a PLAYING song counts in out loud (engine.countInBefore) ──
  await qa(p, 'booth-arm').click(); await qa(p, 'mic-on').waitFor({ timeout: 15000 });
  await qa(p, 'booth-from').selectOption('1');
  await qa(p, 'booth-countin').selectOption('1');
  await p.locator('[data-qa="transport"] button').first().click();          // the room's PLAY
  await p.waitForTimeout(700);
  const logBeforeRun = await p.evaluate(() => (window as Any).__srcLog.length);
  await qa(p, 'booth-record').click();
  await waitFor(p, '(window.__FEL_BOOTH__?.takes ?? 0) >= 3 && window.__FEL_BOOTH__?.phase === "armed"', 25000, 'take 3 (over the running song)');
  const b3 = await booth(p);
  const clickLen = Math.max(1, Math.floor((b3.lastTake?.sampleRate ?? 48000) * 0.045));   // mixGraph clickBuffer: CLICK_SEC 45 ms
  const runClicks = await p.evaluate(([from, t3, len]) => (window as Any).__srcLog.slice(from).filter((e: Any) => e.k === 'start' && e.len === len && e.when < t3 - 1e-6 && e.when > t3 - 2 * 4 * 60 / 92).map((e: Any) => e.when), [logBeforeRun, b3.lastTake?.startTime ?? 0, clickLen]);
  R.numbers.runningCountIn = { take3: b3.lastTake, clickLen, clicksInTheBarBefore: runClicks };
  const beat = 60 / 92;
  const spaced = runClicks.length >= 4 && runClicks.slice(-4).every((w: number, i: number, a: number[]) => i === 0 || Math.abs(w - a[i - 1] - beat) < 1e-3);
  check('FIX PASS: RECORD over a playing song: 4 count clicks a beat apart in the bar before the take (it counted in silently)', spaced && Math.abs((b3.lastTake?.startTime ?? 0) - runClicks[runClicks.length - 1] - beat) < 1e-3, R.numbers.runningCountIn, '4 clicks, the last one beat before the take');
  if (await running(p)) { await p.locator('[data-qa="transport"] button').first().click(); await p.waitForTimeout(300); }

  // ── 7. CLOSE MIC ends the track ──
  const liveBefore = await p.evaluate(() => (window as Any).__streams.at(-1).s.getAudioTracks()[0].readyState);
  await qa(p, 'booth-close').click(); await p.waitForTimeout(200);
  const liveAfter = await p.evaluate(() => (window as Any).__streams.map((x: Any) => x.s.getAudioTracks()[0].readyState));
  check('CLOSE MIC: the track ends (every stream this page opened is ended); MIC ON is gone', liveBefore === 'live' && liveAfter.every((s: string) => s === 'ended') && (await qa(p, 'mic-on').count()) === 0, { liveBefore, liveAfter }, 'live → all ended');

  // phone frame
  await p.setViewportSize({ width: 390, height: 900 });
  await qa(p, 'record-booth').scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  const overflow = await p.evaluate(() => ({ page: document.documentElement.scrollWidth, booth: (document.querySelector('[data-qa="record-booth"]') as HTMLElement).getBoundingClientRect().right }));
  R.numbers.phone = overflow;
  await qa(p, 'record-booth').screenshot({ path: `${OUT}/p4-booth-phone.png` }); R.frames.phone = `${OUT}/p4-booth-phone.png`;
  check('phone (390 px): the booth fits the screen', overflow.booth <= 390 + 1, overflow, 'booth right edge ≤ 390');

  check('no page errors', R.pageErrors.length === 0, R.pageErrors, []);
  await browser.close();
}

main().catch((e) => { R.fatal = String(e?.stack ?? e); log('FATAL', e); }).finally(() => {
  R.passed = R.checks.filter((c: Any) => c.pass).length; R.total = R.checks.length;
  fs.writeFileSync(`${OUT}/booth-proof.json`, JSON.stringify(R, null, 2));
  log(`${R.passed}/${R.total} checks passed → ${OUT}/booth-proof.json`);
  process.exit(0);
});
