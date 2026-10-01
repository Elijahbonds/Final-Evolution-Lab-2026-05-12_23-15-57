// MUSIC-SUITE P10 (2026-09-29), PARKED ITEMS — measured LIVE on the lane's dev server (:3121, /dev/music: the real
// StudioMode, database offline by design). Each check is a P2–P9 report's "P10" row, closed in code this phase and seen
// here in a real Chromium. Nothing here edits app code: the room is read through its own dev hooks (__FEL_STUDIO__,
// __FEL_GRID__, __FEL_FLIP__), the DOM, and AudioBufferSourceNode.start (wrapped to OBSERVE — the original always runs).
//   DESKTOP 1280 (THE STUDIO tier seeded):
//     D1 the probe hook reads the engine: a row MUTED ON THE MIXER is never counted; a bass line's notes are recorded;
//     D2 painting notes by DRAGGING (mouse) in the bass note row: a rising run, ONE undo takes it all back;
//     D3 the lesson demo on the AUDIO clock: each hit's scheduled start against the theme's cuts (P5: 14.0–18.7 ms drift);
//     D4 the waveform in words: the screen-reader lines, and an arrow-key nudge announced;
//     D5 the booth's input meter: the number reads what the bar shows, every frame (P4: 89 % beside "−90 dB");
//     D6 the badge's own row at 1280 (P5: it sat on "Calibrate ↗");
//     D7 the room reverb's cost: the real desk (buildMixGraph) rendered with the room fed vs idle, at 1× and 6× CPU
//        throttle, the graph's build time (the impulse is made on the main thread), and live frame times.
//   PHONE 375 × 812 (touch, DPR 2):
//     P1 the badge vs the title and the Calibrate link; P2 the toast vs the waveform after a source loads;
//     P3 the grid follows the playhead to the next page, and holds while the player edits;
//     P4 a sideways touch drag paints notes (one undo), a vertical one (a scroll) writes nothing.
// Usage: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p10-parked.mts
//        (BASE, OUT, ONLY=desk,phone env)
import { chromium, type BrowserContext, type CDPSession, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p10/parked';
const ONLY = (process.env.ONLY ?? 'desk,phone').split(',');
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p10-parked +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), route: '/dev/music', frames: {}, pageErrors: [] as string[], checks: [] as Any[], numbers: {} };
const check = (id: string, name: string, pass: boolean, got: unknown, want: unknown) => { R.checks.push({ id, name, pass, got, want }); log(pass ? 'PASS' : 'FAIL', id, name, JSON.stringify(got).slice(0, 400)); };
const save = () => fs.writeFileSync(`${OUT}/p10-parked-proof.json`, JSON.stringify(R, null, 2));
const frame = async (p: Page, name: string, full = false) => { const path = `${OUT}/p10-${name}.png`; await p.screenshot({ path, fullPage: full }); R.frames[name] = path; };
const qa = (p: Page, id: string) => p.locator(`[data-qa="${id}"]`);
const btn = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).first();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cell = (p: Page, row: string, step: number) => p.locator(`[data-qa="cell"][data-row="${row}"][data-step="${step}"]`);
const litNotes = (p: Page): Promise<[number, number][]> => p.evaluate(() => [...document.querySelectorAll('[data-qa="note-row"] [data-qa="note-cell"][data-on="1"]')].map((c) => [Number((c as HTMLElement).dataset.step), Number((c as HTMLElement).dataset.note)] as [number, number]));
const rectOf = (p: Page, sel: string): Promise<Any> => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }, sel);
const overlaps = (a: Any, b: Any): boolean => !!a && !!b && a.w > 0 && b.w > 0 && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** Every AudioBufferSourceNode start (when, the clock at the call, the buffer's length) — before the page's own scripts. */
const INIT = `(() => {
  window.__name = window.__name || function (f) { return f; };   // tsx's keepNames helper, for the functions evaluate() sends
  window.__srcLog = [];
  const S = AudioBufferSourceNode.prototype; const st = S.start;
  S.start = function (when = 0) { window.__srcLog.push({ when, now: this.context.currentTime, len: this.buffer ? this.buffer.length : 0, at: performance.now() }); return st.apply(this, arguments); };
  try { localStorage.setItem('fel-music-progress', JSON.stringify({ patternsMade: 3, sectionsSaved: 2, chainEntries: 2 })); } catch (e) {}
})();`;

async function openRoom(p: Page, url = `${BASE}/dev/music?stage=studio`): Promise<void> {
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  const start = p.getByRole('button', { name: 'TAP TO START' });
  await start.waitFor({ timeout: 300000 });
  await start.click();
  await qa(p, 'kit-grid').waitFor({ timeout: 90000 });
  await sleep(700);
}
const wreq = `(() => { if (!window.__wreq) { try { self.webpackChunk_N_E.push([['felp10' + Date.now()], {}, (r) => { window.__wreq = r; }]); } catch (e) {} } return !!window.__wreq; })()`;
/** Grab the live AudioEngine (the room's) by wrapping its prototype's scheduleStep once more — observation only. */
const GRAB_ENGINE = `(() => {
  ${wreq};
  const m = Object.values(window.__wreq.c).find((x) => { try { return x && x.exports && x.exports.AudioEngine && x.exports.stepNote; } catch (e) { return false; } });
  if (!m) return false;
  const P = m.exports.AudioEngine.prototype;
  if (!P.__p10) { P.__p10 = true; const o = P.scheduleStep; P.scheduleStep = function () { window.__ENG = this; return o.apply(this, arguments); }; }
  return true;
})()`;

// ── DESKTOP ─────────────────────────────────────────────────────────────────────────────────────────────────────────
async function desk(ctx: BrowserContext): Promise<void> {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { R.pageErrors.push(`desk: ${e.message}`.slice(0, 300)); log('PAGEERROR', e.message.slice(0, 200)); });
  const cdp = await ctx.newCDPSession(p);
  await openRoom(p);

  // D6 — the badge's own row at 1280 (it shows on FLIP). Measured first: FLIP is where the lesson auto-loads the theme.
  await btn(p, 'FLIP').click();
  await qa(p, 'flip-lesson').waitFor({ timeout: 30000 }).catch(() => undefined);
  await p.waitForFunction(() => { const f = (window as Any).__FEL_FLIP__; return !!f?.decoded && f.source === 'theme_a_sunday_tape'; }, undefined, { timeout: 60000 }).catch(() => undefined);
  await sleep(600);
  const badgeSel = '[data-qa="phone-room"] [data-testid="host-lobby-badge"]';
  const badge = await rectOf(p, badgeSel);
  const calib = await rectOf(p, '[data-qa="academy-calibrate"]');
  const room1280 = await rectOf(p, '[data-qa="phone-room"]');
  const hits1280 = await p.evaluate((s) => {
    const b = document.querySelector(s)?.getBoundingClientRect(); if (!b) return null;
    return [...document.querySelectorAll('a, button, [data-qa="tier-chip"], h1, div')].filter((e) => !e.closest('[data-qa="phone-room"]') && e.children.length === 0 && (e.textContent ?? '').trim()).map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.left < b.right && b.left < r.right && r.top < b.bottom && b.top < r.bottom).map(({ e }) => (e.textContent ?? '').trim().slice(0, 40));
  }, badgeSel);
  R.numbers.badge1280 = { badge, calibrate: calib, row: room1280, textUnderBadge: hits1280 };
  check('D6', 'desktop: the phone badge sits on its own row — not on "Calibrate ↗" or any other text (P5: it covered the link)', !!badge && !overlaps(badge, calib) && (hits1280 ?? []).length === 0, R.numbers.badge1280, 'no overlap, nothing under it');
  await frame(p, 'desk-badge-row');

  // D3 — the lesson demo on the audio clock
  const pack = JSON.parse(fs.readFileSync(new URL('../../public/audio/flip/pack.json', import.meta.url), 'utf8'));
  const cuts: number[] = pack.items.find((i: Any) => i.id === 'theme_a_sunday_tape').suggestedPads;
  const decoded = await p.evaluate(() => !!(window as Any).__FEL_FLIP__?.decoded);
  await p.evaluate(() => { (window as Any).__srcLog.length = 0; });
  const clickAt = await p.evaluate(() => performance.now());
  await qa(p, 'lesson-order').click();
  await sleep(400);
  const demo = await p.evaluate((c) => { const L = (window as Any).__srcLog.filter((e: Any) => e.at >= c); return { starts: L, plan: (window as Any).__FEL_FLIP__?.demoPlan ?? null }; }, clickAt);
  const sched = (demo.starts as Any[]).filter((e) => e.when > e.now);   // started ahead of time on the audio clock
  const w0 = sched[0]?.when ?? 0;
  const driftMs = sched.length === cuts.length ? Math.max(...sched.map((e: Any, i: number) => Math.abs((e.when - w0) - (cuts[i] - cuts[0])) * 1000)) : null;
  R.numbers.lessonDemo = { decoded, startsSeen: demo.starts.length, scheduledAhead: sched.length, firstLeadMs: sched.length ? +((sched[0].when - sched[0].now) * 1000).toFixed(2) : null, maxDriftMs: driftMs, plan: demo.plan?.length ?? null };
  check('D3', '▶ PADS 1 → 16: all 16 hits started ahead on the audio clock, each at its own cut (drift < 0.01 ms; P5 timer: 14.0–18.7 ms)', sched.length === cuts.length && driftMs !== null && driftMs < 0.01, R.numbers.lessonDemo, '16 scheduled, drift ≈ 0');
  await sleep(11500);   // let it run out
  await p.evaluate(() => { (window as Any).__srcLog.length = 0; });
  await qa(p, 'lesson-flip').click();
  await sleep(500);
  await qa(p, 'lesson-flip').click();   // ■ STOP mid-demo
  const stopAt = await p.evaluate(() => performance.now());
  await sleep(2500);
  const afterStop = await p.evaluate((c) => (window as Any).__srcLog.filter((e: Any) => e.at > c).length, stopAt);
  check('D3b', '■ STOP ends a scheduled demo: no new source starts after it (the rest go silent)', afterStop === 0, { startsAfterStop: afterStop }, 0);

  // D4 — the waveform in words
  const words0 = await p.evaluate(() => ({ sel: document.querySelector('[data-qa="flip-waveform-selected"]')?.textContent ?? null, all: document.querySelector('[data-qa="flip-waveform-slices"]')?.textContent ?? null,
    described: (() => { const c = document.querySelector('[data-qa="flip-waveform"]'); const ids = (c?.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean); return ids.map((id) => !!document.getElementById(id)); })(), role: document.querySelector('[data-qa="flip-waveform"]')?.getAttribute('role') }));
  await p.getByRole('button', { name: 'pad 5', exact: true }).dispatchEvent('pointerdown');
  await sleep(250);
  const words1 = await p.evaluate(() => document.querySelector('[data-qa="flip-waveform-selected"]')?.textContent ?? null);
  await qa(p, 'flip-waveform').focus();
  await p.keyboard.press('ArrowRight');
  await sleep(300);
  const words2 = await p.evaluate(() => document.querySelector('[data-qa="flip-waveform-selected"]')?.textContent ?? null);
  R.numbers.waveformWords = { before: words0, pad5: words1, afterArrow: words2 };
  const startOf = (s: string | null) => { const m = /selected: ([\d.]+) s/.exec(s ?? ''); return m ? Number(m[1]) : null; };
  const moved = startOf(words2) !== null && startOf(words1) !== null ? Math.round((startOf(words2)! - startOf(words1)!) * 1000) : null;
  check('D4', 'the waveform in words: 16 slices listed, the canvas described by both lines, "Pad 5 selected …" and a → nudge heard (+5 ms)',
    /^16 slices on/.test(words0.all ?? '') && words0.described.length === 2 && words0.described.every(Boolean) && words0.role === 'application' && /^Pad 5 selected: /.test(words1 ?? '') && moved !== null && moved >= 3 && moved <= 7,
    { all: (words0.all ?? '').slice(0, 80), pad5: words1, afterArrow: words2, movedMs: moved }, '16 slices / Pad 5 / +5 ms');
  await frame(p, 'desk-flip-waveform');

  // D2 — painting notes by dragging (mouse), then one UNDO
  await btn(p, 'STUDIO').click();
  await sleep(400);
  await p.locator('[data-qa="note-open"][data-row="bass"]').click();
  await qa(p, 'note-row').waitFor({ timeout: 5000 });
  const notesOffered: number[] = await p.evaluate(() => [...new Set([...document.querySelectorAll('[data-qa="note-row"] [data-qa="note-cell"]')].map((c) => Number((c as HTMLElement).dataset.note)))]);
  // a rising run: step s on the s-th note from the bottom of the window (notesOffered is high → low)
  const low = [...notesOffered].reverse();
  const center = async (step: number, note: number) => { const b = (await p.locator(`[data-qa="note-row"] [data-qa="note-cell"][data-step="${step}"][data-note="${note}"]`).boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const a = await center(0, low[0]);
  const z = await center(6, low[6]);
  await p.mouse.move(a.x, a.y);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(a.x + ((z.x - a.x) * i) / 12, a.y + ((z.y - a.y) * i) / 12, { steps: 2 });
  await p.mouse.up();
  await sleep(300);
  const painted = await litNotes(p);
  const bassLit = await p.evaluate(() => [...document.querySelectorAll('[data-qa="cell"][data-row="bass"][data-on="1"]')].map((c) => Number((c as HTMLElement).dataset.step)));
  await frame(p, 'desk-note-drag');
  await qa(p, 'undo').click();
  await sleep(300);
  const afterUndo = await litNotes(p);
  R.numbers.noteDrag = { offered: notesOffered, painted, bassLit, afterOneUndo: afterUndo };
  const byStep = [...painted].sort((x, y) => x[0] - y[0]);   // the DOM lists the row high → low; the run is read by step
  const rising = byStep.length >= 7 && byStep.every(([s, n], i) => i === 0 || (n > byStep[i - 1][1] && s === byStep[i - 1][0] + 1));
  check('D2', 'a mouse DRAG across the bass note row paints a rising run on steps 0–6 (was one tap a note), and ONE undo takes the whole stroke back',
    rising && byStep[0][0] === 0 && byStep[byStep.length - 1][0] === 6 && afterUndo.length === 0, R.numbers.noteDrag, '7 rising notes, then none');

  // D1 — the probe hook reads the engine: snare MUTED ON THE MIXER is not counted; the bass line's notes are recorded
  // (the drag is redone so the bass plays a line: steps 0-6)
  await qa(p, 'redo').click().catch(() => undefined);
  await sleep(200);
  await p.locator('[data-qa="note-close"]').click().catch(() => undefined);
  for (const s of [0, 4, 8, 12]) await cell(p, 'kick', s).click();
  for (const s of [4, 12]) await cell(p, 'snare', s).click();
  await qa(p, 'mixer-toggle').click();
  await p.locator('[data-qa="mixer-strip"][data-row="snare"] [data-qa="strip-mute"]').click();
  await sleep(300);
  await p.evaluate(() => (window as Any).__FEL_STUDIO__.reset());
  await btn(p, 'PLAY').click();
  await sleep(Math.round((2 * 16 * 60) / 92 / 4 * 1000) + 400);   // two bars at 92 BPM
  const hookRead = await p.evaluate(() => { const s = (window as Any).__FEL_STUDIO__; const e = s.engine(); return { audible: { ...s.audible }, bassNotes: (s.notes.bass ?? []).slice(0, 16), skipped: s.skipped, snareRow: e.tracks.find((t: Any) => t.sampleId === 'snare') }; });
  await btn(p, 'STOP').click();
  R.numbers.probeHook = hookRead;
  check('D1', 'the dev hook counts what the ENGINE started: snare muted on the mixer counts 0 (heard: false), kick counts, the bass line\'s notes are recorded',
    !hookRead.audible.snare && (hookRead.audible.kick ?? 0) >= 6 && hookRead.snareRow?.heard === false && hookRead.bassNotes.length >= 7 && new Set(hookRead.bassNotes).size >= 5,
    hookRead, 'snare 0 / heard false, kick ≥ 6, ≥ 5 distinct bass notes');
  await p.locator('[data-qa="mixer-strip"][data-row="snare"] [data-qa="strip-mute"]').click();

  // D5 — the booth's meter: number vs bar, every frame
  await qa(p, 'booth-arm').click();
  await qa(p, 'mic-on').waitFor({ timeout: 20000 }).catch(() => undefined);
  await sleep(800);
  const meter = await p.evaluate(() => new Promise<Any>((res) => {
    const out: { w: number; t: string }[] = [];
    const bar = document.querySelector('[data-qa="input-meter"] div') as HTMLElement | null;
    const txt = document.querySelector('[data-qa="input-meter-db"]') as HTMLElement | null;
    let n = 0;
    const tick = () => { if (bar && txt) out.push({ w: parseFloat(bar.style.width) || 0, t: txt.textContent ?? '' }); if (++n < 240) requestAnimationFrame(tick); else res(out); };
    requestAnimationFrame(tick);
  }));
  const parsed = (meter as Any[]).map((m) => ({ ...m, db: m.t === '−∞ dB' ? null : Number(m.t.replace('−', '-').replace(' dB', '')) }));
  const mism = parsed.filter((m) => (m.db === null ? m.w > 1 : Math.abs(m.db - (m.w / 100 * 60 - 60)) > 1.2));
  const nonEmpty = parsed.filter((m) => m.w > 5).length;
  R.numbers.boothMeter = { frames: parsed.length, framesWithSignal: nonEmpty, mismatches: mism.length, sample: parsed.filter((_, i) => i % 24 === 0) };
  check('D5', 'the booth meter: on every one of 240 frames the dB number reads what the bar shows (±1.2 dB for rounding); the fake mic moved it',
    parsed.length >= 200 && mism.length === 0 && nonEmpty > 10, { frames: parsed.length, withSignal: nonEmpty, mismatches: mism.slice(0, 5) }, '0 mismatches');
  await frame(p, 'desk-booth-meter');
  await qa(p, 'booth-close').click().catch(() => undefined);

  // D7 — the room reverb's cost
  const grabbed = await p.evaluate(GRAB_ENGINE);
  const RENDER = `(async (o) => {
    ${wreq};
    const m = Object.values(window.__wreq.c).find((x) => { try { return x && x.exports && x.exports.buildMixGraph && x.exports.roomImpulse; } catch (e) { return false; } });
    if (!m) return { err: 'no mixGraph module' };
    const { buildMixGraph } = m.exports;
    const ids = ['kick', 'snare', 'hat', 'open', 'clap', 'bass', 'lead', 'fx'];
    const SR = o.sr, SEC = o.sec;
    const one = async (send) => {
      const ctx = new OfflineAudioContext(2, SR * SEC, SR);
      const channels = {}; for (const id of ids) channels[id] = { sendA: send, sendB: 0 };
      const tb = performance.now();
      const g = buildMixGraph(ctx, { mixer: { master: 1, channels } }, {});
      for (const [k, id] of ids.entries()) {
        const b = ctx.createBuffer(1, Math.round(SR * 0.5), SR); const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (SR * (0.02 + 0.01 * k)));
        const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.connect(g.channel(id).input); s.start((k * 0.0625) % 0.5);
      }
      const built = performance.now() - tb;
      const t = performance.now(); await ctx.startRendering(); return { renderMs: performance.now() - t, buildMs: built };
    };
    const rows = { roomFed: [], roomIdle: [] };
    for (let i = 0; i < o.reps; i++) { rows.roomIdle.push(await one(0)); rows.roomFed.push(await one(0.35)); }
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const sum = (k) => ({ renderMsMedian: +med(rows[k].map((r) => r.renderMs)).toFixed(1), buildMsMedian: +med(rows[k].map((r) => r.buildMs)).toFixed(2), realtimeX: +(SEC * 1000 / med(rows[k].map((r) => r.renderMs))).toFixed(1) });
    return { sr: SR, sec: SEC, reps: o.reps, roomIdle: sum('roomIdle'), roomFed: sum('roomFed'), renderCapacity: 'renderCapacity' in AudioContext.prototype, playoutStats: 'playoutStats' in AudioContext.prototype };
  })`;
  const rv1 = await p.evaluate(`${RENDER}({ sr: 48000, sec: 20, reps: 3 })`);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  const rv6 = await p.evaluate(`${RENDER}({ sr: 48000, sec: 20, reps: 3 })`);
  // live: the room playing a full 8-row grid, frame intervals with the room fed vs idle, at 6× throttle
  const fill = async () => { for (const r of ['hat']) for (const s of [0, 2, 4, 6, 8, 10, 12, 14]) { const c = cell(p, r, s); if ((await c.getAttribute('data-on')) !== '1') await c.click(); } };
  await fill();
  await btn(p, 'PLAY').click();
  await sleep(1200);
  const frames = (ms: number) => p.evaluate((d) => new Promise<Any>((res) => { const iv: number[] = []; let last = performance.now(); const until = last + d; const f = () => { const n = performance.now(); iv.push(n - last); last = n; if (n < until) requestAnimationFrame(f); else { const s = [...iv].sort((a, b) => a - b); res({ frames: iv.length, p50: +s[Math.floor(s.length * 0.5)].toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), max: +s[s.length - 1].toFixed(1) }); } }; requestAnimationFrame(f); }), ms);
  const setSends = (v: number) => p.evaluate((val) => { const e = (window as Any).__ENG; if (!e) return false; const ch: Any = {}; for (const id of ['kick', 'snare', 'hat', 'open', 'clap', 'bass', 'lead', 'fx']) ch[id] = { sendA: val }; e.setMixer({ master: 1, channels: ch }); return true; }, v);
  const liveIdle = await setSends(0) ? await frames(4000) : null;
  const liveFed = await setSends(0.35) ? await frames(4000) : null;
  await setSends(0);
  await btn(p, 'STOP').click();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  R.numbers.reverb = { grabbedEngine: grabbed, offline1x: rv1, offline6x: rv6, liveFramesAt6x: { roomIdle: liveIdle, roomFed: liveFed } };
  const costPct = (r: Any) => r?.roomFed && r?.roomIdle ? +((r.roomFed.renderMsMedian - r.roomIdle.renderMsMedian) / (r.sec * 1000) * 100).toFixed(3) : null;
  R.numbers.reverb.roomCostPctOfOneCoreHere = { at1x: costPct(rv1), at6x: costPct(rv6) };
  // assumption: a low-end phone core (Cortex-A53 class) is ~10x slower single-threaded than this Mac's (Geekbench-class
  // single-core scores ~250 vs ~2,500) — the audio thread is NOT throttled by DevTools' CPU throttle (it slows the main
  // thread; the 6x offline numbers below say whether it reached the render thread), so the phone figure is extrapolated.
  const fedLoadPhone = rv1?.roomFed ? +(100 * 10 / rv1.roomFed.realtimeX).toFixed(2) : null;
  R.numbers.reverb.assumedLowEndPhone = { slowdownX: 10, desktopFullDeskLoadPctOfRealtime: rv1?.roomFed ? +(100 / rv1.roomFed.realtimeX).toFixed(3) : null, phoneFullDeskLoadPctOfRealtime: fedLoadPhone };
  check('D7', 'the room reverb\'s cost measured: the whole desk with the room FED renders ≥ 20× faster than real time here (≤ 50 % of a 10× slower phone core, extrapolated)',
    !!rv1?.roomFed && rv1.roomFed.realtimeX >= 20, R.numbers.reverb, 'realtime ≥ 20×');
  save();
  await p.close();
}

// ── PHONE ───────────────────────────────────────────────────────────────────────────────────────────────────────────
async function touchPath(cdp: CDPSession, pts: { x: number; y: number }[], stepMs = 16): Promise<void> {
  const tp = (q: { x: number; y: number }) => [{ x: q.x, y: q.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(pts[0]) });
  for (const q of pts.slice(1)) { await sleep(stepMs); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(q) }); }
  await sleep(stepMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, n: number) => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));

async function phone(ctx: BrowserContext): Promise<void> {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { R.pageErrors.push(`phone: ${e.message}`.slice(0, 300)); log('PAGEERROR', e.message.slice(0, 200)); });
  const cdp = await ctx.newCDPSession(p);
  await openRoom(p);

  // P3 — the grid follows the playhead (STUDIO, stopped → PLAY)
  for (const s of [0, 4]) await cell(p, 'kick', s).tap();
  const lastTapAt = await p.evaluate(() => performance.now());   // the grid's last touch: the page holds FOLLOW_HOLD_MS from here
  await p.evaluate(() => { document.querySelector('[data-qa="step-grid"]')?.scrollIntoView({ block: 'center' }); });
  const playBtn = qa(p, 'transport').locator('button').first();   // PLAY / STOP (the same button)
  await playBtn.tap();
  const sample = (ms: number) => p.evaluate((d) => new Promise<Any[]>((res) => {
    const out: Any[] = []; const t0 = performance.now();
    const f = () => {
      const g = document.querySelector('[data-qa="step-grid"]') as HTMLElement | null;
      const head = document.querySelector('[data-qa="step-overview"] [data-head="1"]') as HTMLElement | null;
      out.push({ t: +(performance.now() - t0).toFixed(0), at: +performance.now().toFixed(0), page: g ? Number(g.dataset.page) : null, head: head ? Number(head.dataset.step) : -1 });
      if (performance.now() - t0 < d) requestAnimationFrame(f); else res(out);
    };
    requestAnimationFrame(f);
  }), ms);
  await sleep(1500);   // the 2.5 s hold from the two taps above runs out
  const s1 = await sample(4000);
  // only frames after the taps' hold (FOLLOW_HOLD_MS = 2.5 s from the last tap) — before it the page is held on purpose
  const withHead = s1.filter((x) => x.head >= 0 && x.at > lastTapAt + 2550);
  const agree = withHead.filter((x) => x.page === Math.floor(x.head / 8)).length;
  const heldAtStart = s1.filter((x) => x.head >= 0 && x.at <= lastTapAt + 2550).length;
  const flips = s1.filter((x, i) => i > 0 && x.page !== s1[i - 1].page).length;
  // then a tap on the grid while the playhead is on page 1: the page holds ~FOLLOW_HOLD_MS, then follows again
  await p.waitForFunction(() => { const h = document.querySelector('[data-qa="step-overview"] [data-head="1"]') as HTMLElement | null; return !!h && Number(h.dataset.step) <= 2; }, undefined, { timeout: 8000, polling: 'raf' }).catch(() => undefined);
  await cell(p, 'kick', 6).tap();
  const touchedAt = await p.evaluate(() => performance.now());
  const s2 = await sample(5000);
  const firstFollow = s2.find((x) => x.head >= 8 && x.page === 1);
  const heldWrong = s2.filter((x) => x.head >= 8 && x.page === 0);
  const holdMs = firstFollow ? firstFollow.t : null;
  await playBtn.tap();   // STOP
  await sleep(200);
  await p.locator('[data-qa="grid-page"][data-page="0"]').tap();   // the note row below draws page 1's steps
  R.numbers.follow = { sampled: s1.length, framesInsideTheFirstHold: heldAtStart, framesAfterIt: withHead.length, pageAgreesWithHead: agree, pageFlips: flips, afterTouch: { touchedAt: +touchedAt.toFixed(0), firstFollowMsAfterTouch: holdMs, framesHeldOnPage1WhileHeadOnPage2: heldWrong.length }, samples1: s1, samples2: s2 };
  check('P3', 'playing, the phone grid turns to the playhead\'s page (≥ 95 % of frames past the taps\' hold agree — a flip may lag a frame; ≥ 3 turns in 4 s); after a tap it holds ≥ 2.4 s, then follows again',
    withHead.length > 60 && agree / withHead.length >= 0.95 && flips >= 3 && holdMs !== null && holdMs >= 2400 && holdMs <= 2500 + 1400 + 400,
    { agreePct: withHead.length ? +(100 * agree / withHead.length).toFixed(1) : null, flips, holdMs, heldFrames: heldWrong.length }, '≥ 90 %, ≥ 3, 2.4–4.3 s');
  await frame(p, 'phone-grid-follow');

  // P4 — a sideways touch drag paints notes (one undo); a vertical drag (a scroll) writes nothing
  await p.locator('[data-qa="note-open"][data-row="bass"]').tap();
  await qa(p, 'note-row').waitFor({ timeout: 5000 });
  await qa(p, 'note-row').scrollIntoViewIfNeeded();
  await sleep(300);
  const offered: number[] = await p.evaluate(() => [...new Set([...document.querySelectorAll('[data-qa="note-row"] [data-qa="note-cell"]')].map((c) => Number((c as HTMLElement).dataset.note)))]);
  const mid = offered[Math.floor(offered.length / 2)];
  const cc = async (s: number, n: number) => { const b = (await p.locator(`[data-qa="note-row"] [data-qa="note-cell"][data-step="${s}"][data-note="${n}"]`).boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const before = await litNotes(p);
  const A = await cc(0, mid), Z = await cc(5, mid);
  await touchPath(cdp, lerp(A, Z, 20));
  await sleep(300);
  const touchPainted = (await litNotes(p)).filter(([, n]) => n === mid).map(([s]) => s);
  await qa(p, 'undo').tap();
  await sleep(300);
  const afterUndoT = await litNotes(p);
  const scrollY0 = await p.evaluate(() => scrollY);
  const B = await cc(7, mid);
  await touchPath(cdp, lerp(B, { x: B.x, y: B.y - 240 }, 15));
  await sleep(400);
  const scrollY1 = await p.evaluate(() => scrollY);
  const afterScroll = await litNotes(p);
  R.numbers.touchNotes = { note: mid, before, painted: touchPainted, afterOneUndo: afterUndoT, scroll: { from: scrollY0, to: scrollY1 }, afterScroll };
  check('P4', 'phone: a sideways finger drag paints steps 0–5 on one note, ONE undo takes it back; a vertical drag scrolls and writes nothing',
    JSON.stringify(touchPainted) === '[0,1,2,3,4,5]' && JSON.stringify(afterUndoT) === JSON.stringify(before) && JSON.stringify(afterScroll) === JSON.stringify(before) && scrollY1 !== scrollY0,
    R.numbers.touchNotes, '0..5, then back; scroll moved, 0 written');
  await frame(p, 'phone-note-drag');
  await p.locator('[data-qa="note-close"]').tap().catch(() => undefined);

  // P1 — the badge vs the title and the Calibrate link (FLIP: the badge shows)
  await btn(p, 'FLIP').tap();
  await p.waitForFunction(() => { const f = (window as Any).__FEL_FLIP__; return !!f?.decoded; }, undefined, { timeout: 60000 }).catch(() => undefined);
  await p.evaluate(() => scrollTo(0, 0));
  await sleep(500);
  const badge = await rectOf(p, '[data-qa="phone-room"] [data-testid="host-lobby-badge"]');
  const title = await p.evaluate(() => { const e = [...document.querySelectorAll('div')].find((d) => d.textContent === 'FEL GROOVE ACADEMY'); const r = e?.getBoundingClientRect(); return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height } : null; });
  const calib = await rectOf(p, '[data-qa="academy-calibrate"]');
  const sideways = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  R.numbers.badgePhone = { badge, title, calibrate: calib, sidewaysScrollPx: sideways };
  check('P1', 'phone 375: the badge is on its own row — clear of the FEL GROOVE ACADEMY title and "Calibrate ↗" (P5: it sat across the title), no sideways scroll',
    !!badge && !overlaps(badge, title) && !overlaps(badge, calib) && sideways <= 0, R.numbers.badgePhone, 'no overlap');
  await frame(p, 'phone-badge');

  // P2 — the toast vs the waveform right after a source loads, with the waveform in the BOTTOM band, then the TOP band
  const loadOther = async (label: string) => p.evaluate((l) => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === l) as HTMLButtonElement | undefined; b?.click(); return !!b; }, label);
  const toastCase = async (where: 'bottom' | 'top', label: string) => {
    await p.evaluate((w) => { const wf = document.querySelector('[data-qa="flip-waveform"]') as HTMLElement; const r = wf.getBoundingClientRect(); const want = w === 'bottom' ? innerHeight - r.height - 20 : 30; scrollBy(0, r.top - want); }, where);
    await sleep(250);
    // the shelf that holds `label` (LOOPS): its group button first, clicked without scrolling
    await p.evaluate(() => { const g = [...document.querySelectorAll('[data-qa^="flip-shelf-"]')].find((x) => /LOOPS/i.test(x.textContent ?? '')) as HTMLButtonElement | undefined; g?.click(); });
    await sleep(150);
    const found = await loadOther(label);
    await p.waitForSelector('[data-qa="toast"]', { timeout: 8000 }).catch(() => undefined);
    await sleep(120);
    const toast = await rectOf(p, '[data-qa="toast"]');
    const spot = await p.evaluate(() => document.querySelector('[data-qa="toast"]')?.getAttribute('data-spot') ?? null);
    const text = await p.evaluate(() => document.querySelector('[data-qa="toast"]')?.textContent ?? null);
    const wf = await rectOf(p, '[data-qa="flip-waveform"]');
    await frame(p, `phone-toast-${where}`);
    await sleep(2400);   // the line goes
    return { where, label, found, text, spot, toast, waveform: wf, overlap: overlaps(toast, wf) };
  };
  const tb = await toastCase('bottom', 'Pocket Bass');
  const tt = await toastCase('top', 'Night Arp');
  R.numbers.toast = { bottomBand: tb, topBand: tt };
  check('P2', 'phone: the "N slices on bank A" line never lands on the waveform — up when the waveform is low, down when it is high',
    tb.found && tt.found && !!tb.toast && !!tt.toast && !tb.overlap && !tt.overlap && tb.spot === 'top' && tt.spot === 'bottom',
    { bottomBand: { spot: tb.spot, overlap: tb.overlap, text: tb.text }, topBand: { spot: tt.spot, overlap: tt.overlap, text: tt.text } }, 'top / bottom, no overlap');
  save();
  await p.close();
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: true, args: ARGS });
  try {
    if (ONLY.includes('desk')) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, permissions: ['microphone'] });
      await ctx.addInitScript({ content: INIT });
      try { await desk(ctx); } catch (e) { R.checks.push({ id: 'desk', name: 'desk crashed', pass: false, got: String((e as Error)?.stack ?? e).slice(0, 1500), want: 'no crash' }); log('CRASH desk', e); }
      await ctx.close();
    }
    if (ONLY.includes('phone')) {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['microphone'] });
      await ctx.addInitScript({ content: INIT });
      try { await phone(ctx); } catch (e) { R.checks.push({ id: 'phone', name: 'phone crashed', pass: false, got: String((e as Error)?.stack ?? e).slice(0, 1500), want: 'no crash' }); log('CRASH phone', e); }
      await ctx.close();
    }
  } finally {
    await browser.close();
    check('ERR', 'no page errors', R.pageErrors.length === 0, R.pageErrors, []);
    R.passed = R.checks.filter((c: Any) => c.pass).length;
    R.failed = R.checks.filter((c: Any) => !c.pass).map((c: Any) => `${c.id} ${c.name}`);
    R.runtimeSec = Math.round((Date.now() - t0) / 1000);
    save();
    log(`done: ${R.passed} passed, ${R.failed.length} failed → ${OUT}/p10-parked-proof.json`);
  }
}
void main();
