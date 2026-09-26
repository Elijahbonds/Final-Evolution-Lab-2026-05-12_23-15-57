// MUSIC-SUITE P5 (2026-09-26) — "The Flip, for real": THE LIVE PROOF, one run on the lane's dev server (:3121, database
// offline), the real StudioMode on the dev-only /dev/music route and the real phone page (/controller/<code>). Every Web
// Audio source the host starts is logged by an init script with a handle on its AudioBuffer (so a pad's buffer and a grid
// row's buffer can be compared sample for sample), and the engine is read through webpack's module cache (watch only).
//   1. THE LESSON: a first visit opens "chop the FEL theme", the pack's default theme (pack.json themeDefault) goes on the
//      pads, and the Flip gives exactly the pack's suggested pad count, each pad starting at its FEL cut.
//   2. PADS 1 → N IN ORDER (the lesson's ▶ PADS 1 → 16): every started source logged — its audio-clock start, its length,
//      and whether its samples ARE the source from that pad's cut (a content check, not a count).
//   3. THE WAVEFORM: a mouse drag moves a shared marker; the cut lands on a zero crossing within 2 ms of the pointer; the
//      source's samples either side of the cut and the baked chop's first / last sample are read.
//   4. PITCHED + REVERSED → TRACK: pad 3 at −5 and reversed; its buffer is checked against an independent bake written
//      here; SEND TO TRACK, two steps lit, PLAY — the engine's scheduled buffer is compared with the pad's; then the
//      offline render of that row (the export path) is compared with a render of the pad's own buffer through the same
//      desk, and with the P1 rule's chop (the raw slice reversed, unpitched) as a control.
//   5. ARM REC, taps 20 ms EARLY on the audio clock: QUANTIZE on (the step aimed at) and off (the control: the step the
//      tap falls in — the P1 playhead rule's answer).
//   6. CHOP KIT: bank A saved as a kit, CLEAR BANK A, the kit loaded back; then a page reload: the kit, the dragged marker,
//      the recorded steps and the pitched row's baked chop all come back.
//   7. THE PHONE: /controller/<code> in a second (390 px, touch) page; the Academy switched STUDIO / LIBRARY / LISTEN and
//      back to FLIP — the same room, the phone still connected, a pad hit sounds on every tab; BANK B and PLAY / STOP.
//   8. THE UPLOAD TICK: YOUR FILE before and after the tick; an upload in the song — the one-line reason, and what PUBLISH
//      and SEND TO THE DANCE FLOOR do (measured, not assumed).
// Frames: the lesson card, the waveform with slices, the phone pad with transport + banks (+ the upload line).
// Usage: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p5-live-proof.mts
//        (BASE, OUT env override)
import { chromium, type BrowserContext, type CDPSession, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p5/live';
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
  '--disable-features=WebRtcHideLocalIpsWithMdns'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p5live +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), route: '/dev/music', frames: {}, pageErrors: [] as string[], consoleErrors: [] as string[], checks: [] as Any[] };
const check = (id: string, name: string, pass: boolean, got: unknown, want: unknown) => { R.checks.push({ id, name, pass, got, want }); log(pass ? 'PASS' : 'FAIL', id, name, JSON.stringify(got).slice(0, 400)); };
const qa = (p: Page, id: string) => p.locator(`[data-qa="${id}"]`);
const btn = (p: Page, name: string | RegExp) => p.getByRole('button', { name, exact: typeof name === 'string' }).first();
const flip = (p: Page) => p.evaluate(() => (window as Any).__FEL_FLIP__ ?? null);
const audioLog = (p: Page): Promise<Any[]> => p.evaluate(() => ((window as Any).__AUDIO_LOG__ as Any[]).slice());
const clearLog = (p: Page) => p.evaluate(() => { ((window as Any).__AUDIO_LOG__ as Any[]).length = 0; });
const STUDIO_TIER = `try { if (!localStorage.getItem('fel-music-progress')) localStorage.setItem('fel-music-progress', '{"patternsMade":1,"sectionsSaved":2,"chainEntries":2}'); } catch {}`;
// every AudioBufferSourceNode.start: what it plays (a buffer id — the buffer itself kept in __BUFS__), when, how fast, and
// whether it reaches the speakers beside the desk
const AUDIO_SPY = `(() => {
  const L = []; window.__AUDIO_LOG__ = L;
  const BUFS = new Map(); const IDS = new WeakMap(); let n = 0; window.__BUFS__ = BUFS;
  window.__bufId = (b) => { if (!b) return -1; let id = IDS.get(b); if (!id) { id = ++n; IDS.set(b, id); BUFS.set(id, b); if (BUFS.size > 160) BUFS.delete(BUFS.keys().next().value); } return id; };
  const oc = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (d, ...r) { try { this.__to = d; } catch (e) {} return oc.call(this, d, ...r); };
  const os = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when, ...r) {
    try {
      const b = this.buffer, g = this.__to, s = g && g.__to, dst = this.context.destination;
      const d = b ? b.getChannelData(0) : null;
      L.push({ t: this.context.currentTime, when: when || 0, len: b ? b.length : -1, sr: b ? b.sampleRate : 0, rate: this.playbackRate.value,
        gain: g && g.gain ? Math.round(g.gain.value * 10000) / 10000 : null,
        first: d ? d[0] : null, last: d ? d[d.length - 1] : null, toSpeakers: g === dst || s === dst, id: b && b.length > 64 ? window.__bufId(b) : -1 });
      if (L.length > 4000) L.splice(0, 1000);
    } catch (e) {}
    return os.call(this, when, ...r);
  };
})();`;
const SHIM = 'window.__name = window.__name || function (f) { return f; };';

async function openRoom(p: Page, path: string): Promise<void> {
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  const start = p.getByRole('button', { name: 'TAP TO START' });
  await start.waitFor({ timeout: 300000 });
  await start.click();
  await p.waitForFunction(() => !!(window as Any).__FEL_GRID__, undefined, { timeout: 60000 });
  await p.waitForTimeout(500);
  await engineHook(p);
}
/** The engine instance (watch only), through webpack's module cache: any setState / scheduleStep names it. */
async function engineHook(p: Page): Promise<void> {
  const ok = await p.evaluate(() => {
    const W = window as Any;
    if (W.__engHooked) return true;
    let req: Any = null;
    W.webpackChunk_N_E.push([[Symbol('p5-live')], {}, (r: Any) => { req = r; }]);
    const id = Object.keys(req.c).find((k) => /lib\/babylon\/music\/AudioEngine\.ts$/.test(k));
    if (!id) return false;
    const proto = req(id).AudioEngine.prototype;
    if (!proto.__p5live) {
      proto.__p5live = true;
      // any of these names the live engine: a scheduled step, a state change, a loaded chop, a pad heard through a strip
      for (const m of ['scheduleStep', 'setState', 'loadBuffer', 'channelInput']) {
        const o = proto[m];
        proto[m] = function (this: Any, ...a: Any[]) { (window as Any).__eng = this; return o.apply(this, a); };
      }
    }
    W.__engHooked = true;
    return true;
  });
  if (!ok) throw new Error('AudioEngine module not found in the webpack cache');
}
const loadedTheme = (p: Page, id: string, ms = 60000) => p.waitForFunction((want) => { const f = (window as Any).__FEL_FLIP__; return !!f?.decoded && f.source === want; }, id, { timeout: ms }).then(() => true, () => false);
const sampleRatio = (f: Any): number => (f.rate && f.liveRate ? f.liveRate / f.rate : 1);
const tab = async (p: Page, name: 'STUDIO' | 'FLIP' | 'LIBRARY' | 'LISTEN') => { await btn(p, name).click(); await p.waitForTimeout(400); };

/** Tap pad 1 (key '1') `offsetMs` from a scheduled step on the HEARD clock (negative = early). */
const TAP = async (p: Page, offsetMs: number): Promise<Any> => p.evaluate(async (off) => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
  const room = (window as Any).__FEL_FLIP_ROOM__;
  for (let i = 0; i < 500; i++) {
    const c = room.clock();
    if (c) {
      const heard = c.now - c.latencySec;
      const lead = off / 1000;
      const m = c.marks.filter((k: Any) => k.time >= c.startSec && k.time + lead - heard > 0.035 && k.time + lead - heard < 0.09).pop();
      if (m) {
        await sleep((m.time + lead - heard) * 1000 - 1.5);
        const c2 = room.clock();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
        await sleep(30);
        return { aimed: m.step, offMs: Math.round((c2.now - c2.latencySec - m.time) * 10000) / 10, got: (window as Any).__FEL_FLIP__.lastRecordedStep, latencyMs: Math.round(c2.latencySec * 10000) / 10 };
      }
    }
    await sleep(3);
  }
  return null;
}, offsetMs);

/** One CDP touch on a phone button (force + radius → PointerEvent pressure / width). */
async function touch(phone: Page, cdp: CDPSession, label: string, force = 0.6, radius = 10): Promise<void> {
  const b = phone.getByRole('button', { name: label, exact: true }).first();
  const box = (await b.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, force, radiusX: radius, radiusY: radius, id: 1 }] } as Any);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] } as Any);
}
async function phoneHit(host: Page, phone: Page, cdp: CDPSession, label: string, what: string): Promise<Any> {
  const before = await host.evaluate(() => (window as Any).__FEL_PHONE__?.hits ?? 0);
  await clearLog(host);
  await touch(phone, cdp, label);
  const arrived = await host.waitForFunction((n) => ((window as Any).__FEL_PHONE__?.hits ?? 0) > n, before, { timeout: 8000 }).then(() => true, () => false);
  await host.waitForTimeout(150);
  const st = await host.evaluate(() => (window as Any).__FEL_PHONE__ ?? null);
  const audio = (await audioLog(host)).filter((a: Any) => a.len > 64);
  return { what, label, arrived, how: st?.last?.how ?? null, view: st?.last?.view ?? null, bank: st?.bank ?? null, sounded: audio.length, toSpeakers: audio.some((a: Any) => a.toSpeakers), lens: audio.map((a: Any) => a.len) };
}

/** A 1 s 44.1 kHz WAV of four decaying clicks — made here (FEL's), standing in for "the player's own file". */
function testWav(): Buffer {
  const sr = 44100, n = sr, data = Buffer.alloc(n * 2);
  for (const at of [0.05, 0.3, 0.55, 0.8]) for (let i = 0; i < 1500; i++) data.writeInt16LE(Math.round(20000 * Math.exp(-i / 300) * Math.sin(i * 0.25)), (Math.floor(at * sr) + i) * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

async function host(browser: Any): Promise<void> {
  const ctx: BrowserContext = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.addInitScript({ content: SHIM });
  await ctx.addInitScript({ content: STUDIO_TIER });
  await ctx.addInitScript({ content: AUDIO_SPY });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => R.pageErrors.push(`host: ${String(e).slice(0, 300)}`));
  p.on('console', (m) => { if (m.type() === 'error') R.consoleErrors.push(`host: ${m.text().slice(0, 240)}`); });
  let roomPosts = 0;
  p.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/api/controller-link/rooms')) roomPosts++; });
  R.failedLoads = [] as string[];
  p.on('response', (r) => { if (r.status() >= 400) R.failedLoads.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`); });

  // ── 1. THE LESSON: the default theme, the pack's pad count ──────────────────────────────────────────────────────
  await openRoom(p, '/dev/music?stage=studio&player=p5live');
  await tab(p, 'FLIP');
  await qa(p, 'flip-lesson').waitFor({ timeout: 30000 }).catch(() => undefined);
  const pack = await p.evaluate(async () => (await fetch('/audio/flip/pack.json')).json());
  const themeId: string = pack.themeDefault;
  const theme = pack.items.find((i: Any) => i.id === themeId);
  const onPads = await loadedTheme(p, themeId);
  const f1 = await flip(p);
  const rate = f1.liveRate as number;
  const wantCuts = (theme.suggestedPads as number[]).map((t) => Math.round(t * rate));
  const gotCuts = (f1.slicesAll as Any[]).filter(Boolean).map((s: Any) => Math.round(s.start * sampleRatio(f1)));
  R.lesson = { themeDefault: themeId, themeCandidates: pack.themeCandidates, title: theme.title, bpm: theme.bpm, key: theme.key, suggestedPads: theme.suggestedPads, liveRate: rate, source: f1.source, slices: f1.slices, mode: f1.mode, gotCuts, wantCuts };
  const cardText = (await qa(p, 'flip-lesson').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check('1a', 'first visit: the lesson card shows, with the three FEL themes and the default starred', (await qa(p, 'flip-lesson').count()) === 1 && /CHOP THE FEL THEME/.test(cardText) && cardText.includes(`${theme.title} ★`),
    cardText.slice(0, 300), `CHOP THE FEL THEME … ${theme.title} ★`);
  check('1b', `the default theme (pack.json themeDefault = ${themeId}) is on the pads, sliced on FEL's cuts`, onPads && f1.source === themeId && f1.mode === 'cuts', { source: f1.source, mode: f1.mode }, { source: themeId, mode: 'cuts' });
  check('1c', "the Flip gives the pack's suggested pad count", f1.slices === theme.suggestedPads.length, { slices: f1.slices, suggestedPads: theme.suggestedPads.length }, theme.suggestedPads.length);
  check('1d', "every pad starts at its FEL cut (pack seconds × the decode's rate, to the sample)", JSON.stringify(gotCuts) === JSON.stringify(wantCuts), { maxDiffSamples: Math.max(...gotCuts.map((c: number, i: number) => Math.abs(c - wantCuts[i]))) }, 0);
  await qa(p, 'flip-lesson').scrollIntoViewIfNeeded();
  await qa(p, 'flip-lesson').screenshot({ path: `${OUT}/p5-lesson-card.png` });
  R.frames.lessonCard = `${OUT}/p5-lesson-card.png`;

  // ── 2. PADS 1 → N IN ORDER (the lesson's own button): what was started, when, and is it that pad's chop? ──────────
  await p.evaluate(`(() => { const w = window; let v = w.__FEL_FLIP__; w.__P5_PLAYS__ = [];
    Object.defineProperty(w, '__FEL_FLIP__', { configurable: true, get: () => v,
      set: (n) => { if (n && typeof n.lastPlayed === 'number' && n.lastPlayed !== (v && v.lastPlayed)) w.__P5_PLAYS__.push({ pad: n.lastPlayed, t: performance.now() }); v = n; } }); })()`);
  await clearLog(p);
  await qa(p, 'lesson-order').click();
  const endAt = (theme.suggestedPads as number[])[theme.suggestedPads.length - 1];
  await p.waitForTimeout(endAt * 1000 + 1500);
  const plays: Any[] = await p.evaluate(() => (window as Any).__P5_PLAYS__);
  const starts = (await audioLog(p)).filter((e: Any) => e.id > 0);
  const srcKey = `/audio/flip/${theme.file}`;
  const inOrder = await p.evaluate(async ({ starts, cuts, key, rate, suggested }) => {
    const W = window as Any; const room = W.__FEL_FLIP_ROOM__; const f = W.__FEL_FLIP__;
    const fadeIn = Math.min(Math.round(3 * rate / 1000), 1e9);
    const out: Any[] = [];
    for (let i = 0; i < starts.length; i++) {
      const e = starts[i]; const b: AudioBuffer = W.__BUFS__.get(e.id);
      const d = b.getChannelData(0);
      const cut = cuts[i];
      const probeAt = fadeIn + 16;                                                   // past the fade-in: the chop's own samples
      const src = await room.peek(key, cut + probeAt + 128, 128);                    // source [cut + probeAt, +256)
      let maxDiff = 0; for (let k = 0; k < 256 && src; k++) maxDiff = Math.max(maxDiff, Math.abs(d[probeAt + k] - src[k]));
      const slice = f.slicesAll[i]; const sliceLen = Math.round((slice.end - slice.start) * (f.liveRate / (f.rate || f.liveRate)));
      out.push({ pad: i + 1, cutSample: cut, cutSec: +(cut / rate).toFixed(5), packSec: suggested[i], startedAtSec: +(e.t - starts[0].t).toFixed(4),
        wantAtSec: +(suggested[i] - suggested[0]).toFixed(4), driftMs: +(((e.t - starts[0].t) - (suggested[i] - suggested[0])) * 1000).toFixed(1),
        len: b.length, sliceLen, gatedTo: b.length < sliceLen ? b.length : null, first: d[0], last: d[d.length - 1], sameSamplesAsSourceAtCut: maxDiff === 0, maxDiff, toSpeakers: e.toSpeakers, rate: e.rate });
    }
    return out;
  }, { starts, cuts: wantCuts, key: srcKey, rate, suggested: theme.suggestedPads });
  R.padsInOrder = { plays: plays.map((x) => x.pad), starts: inOrder };
  const drifts = inOrder.map((x: Any) => Math.abs(x.driftMs));
  check('2a', `▶ PADS 1 → ${theme.suggestedPads.length}: every pad, in order, one start each`, JSON.stringify(plays.map((x) => x.pad)) === JSON.stringify([...Array(theme.suggestedPads.length).keys()]) && inOrder.length === theme.suggestedPads.length,
    { pads: plays.map((x) => x.pad + 1), starts: inOrder.length }, `1..${theme.suggestedPads.length}`);
  check('2b', "each start plays THAT pad's chop: its samples are the source's from that pad's cut (256 samples past the fade, exact)", inOrder.every((x: Any) => x.sameSamplesAsSourceAtCut),
    inOrder.map((x: Any) => `${x.pad}@${x.cutSample}:${x.maxDiff}`), 'max diff 0 for all');
  check('2c', 'each chop edge is 0 (faded), rate 1, through the desk not the speakers', inOrder.every((x: Any) => x.first === 0 && Math.abs(x.last) < 1e-6 && x.rate === 1 && !x.toSpeakers),
    inOrder.map((x: Any) => [x.first, x.last, x.rate, x.toSpeakers]), '[0, 0, 1, false]');
  check('2d', 'the starts keep the theme\'s time (drift of each start from its pack time; the lesson times hits with setTimeout)', Math.max(...drifts) < 60,
    { maxDriftMs: Math.max(...drifts), meanDriftMs: +(drifts.reduce((a: number, b: number) => a + b, 0) / drifts.length).toFixed(1) }, '< 60 ms');

  // ── 3. THE WAVEFORM: drag the marker between pads 5 and 6; the zero-crossing snap ──────────────────────────────
  const f3 = await flip(p);
  const PAD = 5;                                                                    // pad 6's start = pad 5's end
  const before3 = { p5: f3.slicesAll[PAD - 1], p6: f3.slicesAll[PAD] };
  await qa(p, 'flip-waveform').scrollIntoViewIfNeeded();
  const box = (await qa(p, 'flip-waveform').boundingBox())!;
  const spp = f3.sourceLength / box.width;
  const x0 = box.x + (before3.p6.start * sampleRatio(f3)) / spp + 0.5, y0 = box.y + box.height / 2;
  const DX = 11;
  await p.mouse.move(x0, y0); await p.mouse.down();
  for (let k = 1; k <= DX; k++) { await p.mouse.move(x0 + k, y0); await p.waitForTimeout(25); }
  await p.mouse.up(); await p.waitForTimeout(500);
  const f3b = await flip(p);
  const after3 = { p5: f3b.slicesAll[PAD - 1], p6: f3b.slicesAll[PAD] };
  const cut = Math.round(after3.p6.start * sampleRatio(f3b));
  const target = Math.round(before3.p6.start * sampleRatio(f3) + DX * spp);
  const edge = await p.evaluate(async ({ key, cut, target, rate }) => {
    const room = (window as Any).__FEL_FLIP_ROOM__;
    const at = await room.peek(key, cut, 4);                                        // source [cut − 4, cut + 4)
    const tg = await room.peek(key, target, 4);
    const win = await room.peek(key, target, Math.round(0.005 * rate));             // ±5 ms around the pointer
    const rms = Math.sqrt(win.reduce((a: number, v: number) => a + v * v, 0) / win.length);
    const peak = Math.max(...win.map(Math.abs));
    return { atCut: at, atTarget: tg, localRms: rms, localPeak: peak };
  }, { key: srcKey, cut, target, rate });
  // the moved pad's chop as the pad plays it now (its fade-in starts at 0)
  await clearLog(p);
  await p.keyboard.press('w');                                                      // pad 6 (PAD_KEYS: 1234 qwer asdf zxcv)
  await p.waitForTimeout(200);
  const hit6 = (await audioLog(p)).filter((e: Any) => e.id > 0).pop();
  const signChange = Math.sign(edge.atCut[3]) !== Math.sign(edge.atCut[4]) || Math.sign(edge.atCut[4]) !== Math.sign(edge.atCut[5]) || edge.atCut[4] === 0;
  R.drag = { before: before3, after: after3, pointerPx: DX, samplesPerPx: spp, targetSample: target, cutSample: cut, snapSamples: cut - target, snapMs: +((cut - target) / rate * 1000).toFixed(3),
    sourceAroundCut: edge.atCut, sourceAroundTarget: edge.atTarget, localRms: edge.localRms, localPeak: edge.localPeak, pad6Chop: hit6 ? { len: hit6.len, first: hit6.first, last: hit6.last } : null };
  check('3a', 'a mouse drag moves the shared marker for both pads (pad 5 ends where pad 6 starts)', after3.p5.end === after3.p6.start && after3.p6.start !== before3.p6.start, { before: before3, after: after3 }, 'moved together');
  check('3b', 'the cut is within 2 ms of where the pointer put it', Math.abs(cut - target) <= Math.round(0.002 * rate) + Math.ceil(spp), { snapMs: R.drag.snapMs, snapSamples: R.drag.snapSamples }, '≤ 2 ms (+ 1 px)');
  check('3c', 'the cut is on a zero crossing: the source changes sign at it, the cut sample far below the local level', signChange && Math.abs(edge.atCut[4]) <= Math.max(Math.abs(edge.atCut[3]), Math.abs(edge.atCut[5])) && Math.abs(edge.atCut[4]) < 0.25 * edge.localRms,
    { cutMinus1: edge.atCut[3], cut: edge.atCut[4], cutPlus1: edge.atCut[5], atPointer: edge.atTarget[4], localRms: +edge.localRms.toFixed(4) }, 'sign change, |cut| ≪ local RMS');
  check('3d', "pad 6's chop now starts and ends on exactly 0 (the fades on top of the snap)", !!hit6 && hit6.first === 0 && Math.abs(hit6.last) < 1e-6, R.drag.pad6Chop, { first: 0, last: 0 });
  // the waveform with its slices (pad 6 selected after the drag)
  await p.evaluate(() => document.querySelector('[data-qa="flip-waveform"]')?.scrollIntoView({ block: 'start' }));
  await p.evaluate(() => window.scrollBy(0, -40));
  await p.waitForTimeout(300);
  const wfBox = (await qa(p, 'flip-waveform').boundingBox())!;
  const padsBox = (await p.getByRole('button', { name: 'pad 16', exact: true }).boundingBox())!;
  await p.screenshot({ path: `${OUT}/p5-waveform-slices.png`, clip: { x: Math.max(0, wfBox.x - 8), y: Math.max(0, wfBox.y - 8), width: Math.min(1280, wfBox.width + 16), height: Math.min(990 - wfBox.y, padsBox.y + padsBox.height - wfBox.y + 16) } });
  R.frames.waveform = `${OUT}/p5-waveform-slices.png`;

  // ── 4. PITCHED + REVERSED → TRACK: the pad, the grid, the render ─────────────────────────────────────────────────
  const PITCH = -5, P3 = 2;
  await p.getByRole('button', { name: 'pad 3', exact: true }).dispatchEvent('pointerdown');
  await p.waitForTimeout(200);
  await p.locator('input[type="range"][min="-12"]').fill(String(PITCH));
  await p.waitForTimeout(200);
  await btn(p, 'REVERSE').click();
  await p.waitForTimeout(200);
  await p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const f4 = await flip(p);
  await clearLog(p);
  await p.keyboard.press('3'); await p.waitForTimeout(200);
  const padHit = (await audioLog(p)).filter((e: Any) => e.id > 0).pop();
  const note4 = await qa(p, 'flip-pitch-note').textContent().catch(() => null);
  const keyText = await qa(p, 'flip-chop-key').textContent().catch(() => null);
  const indep = await p.evaluate(async ({ id, slice, key, rate, pitch }) => {
    const W = window as Any;
    const P: AudioBuffer = W.__BUFS__.get(id); const pd = P.getChannelData(0);
    const len = slice.end - slice.start; const half = Math.ceil(len / 2);
    const src: number[] = (await W.__FEL_FLIP_ROOM__.peek(key, slice.start + half, half)).slice(0, len);
    // THE BAKE, written again here (not imported): reverse → resample (linear) → gate 1.2 s → raised-cosine fades 3 / 5 ms
    const raw = Float32Array.from(src).reverse();
    const ratio = Math.pow(2, pitch / 12);
    const n = Math.floor((raw.length - 1) / ratio) + 1;
    let out = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i * ratio, k = Math.floor(x), f = x - k; out[i] = k + 1 < raw.length ? raw[k] * (1 - f) + raw[k + 1] * f : raw[raw.length - 1]; }
    let cut = false; const cap = Math.round(1.2 * rate); if (out.length > cap) { out = out.slice(0, cap); cut = true; }
    const fl = (ms: number) => Math.max(0, Math.min(Math.round(ms * rate / 1000), Math.floor(out.length / 4)));
    const fin = fl(3), fout = fl(cut ? 5 : 3);
    for (let k = 0; k < fin; k++) out[k] *= 0.5 - 0.5 * Math.cos(Math.PI * k / fin);
    for (let k = 0; k < fout; k++) out[out.length - 1 - k] *= 0.5 - 0.5 * Math.cos(Math.PI * k / fout);
    let maxDiff = 0; for (let i = 0; i < Math.min(out.length, pd.length); i++) maxDiff = Math.max(maxDiff, Math.abs(out[i] - pd[i]));
    // the P1 rule's chop (FlipPad.tsx:77-84 then): the raw slice, reversed, NOT pitched, no gate, no fades
    const p1 = W.__eng.context.createBuffer(1, raw.length, rate); p1.copyToChannel(raw, 0);
    W.__P1CHOP__ = p1;
    // the forward (un-reversed) slice, pitched the same — to show the reverse is really in the buffer
    const fwd = Float32Array.from(src); const fwdR = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i * ratio, k = Math.floor(x), f = x - k; fwdR[i] = k + 1 < fwd.length ? fwd[k] * (1 - f) + fwd[k + 1] * f : fwd[fwd.length - 1]; }
    const corr = (a: ArrayLike<number>, b: ArrayLike<number>) => { let ab = 0, aa = 0, bb = 0; const m = Math.min(a.length, b.length); for (let i = 0; i < m; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; } return ab / Math.sqrt(aa * bb || 1); };
    return { padLen: pd.length, sliceLen: len, wantLen: out.length, ratio, maxDiff, gateCut: cut, corrWithForward: corr(pd, fwdR), corrWithP1Rule: corr(pd, raw) };
  }, { id: padHit?.id, slice: { start: Math.round(f4.slicesAll[P3].start * sampleRatio(f4)), end: Math.round(f4.slicesAll[P3].end * sampleRatio(f4)) }, key: srcKey, rate, pitch: PITCH });
  R.pitchedReversed = { pad: 3, pitch: PITCH, reverse: true, padHit, note: note4, chopKey: keyText, independentBake: indep };
  check('4a', 'pad 3 at −5, reversed: its buffer = an independent bake of the slice (reverse, resample 2^(−5/12), gate, fades), sample for sample',
    !!padHit && padHit.rate === 1 && indep.padLen === indep.wantLen && indep.maxDiff < 1e-6, { len: indep.padLen, want: indep.wantLen, maxDiff: indep.maxDiff, rate: padHit?.rate }, { maxDiff: '< 1e-6', rate: 1 });
  check('4b', 'the reverse is really in it: correlation with the FORWARD pitched slice is low', Math.abs(indep.corrWithForward) < 0.5, { corrWithForward: +indep.corrWithForward.toFixed(4) }, '|r| < 0.5');
  await qa(p, 'flip-send').click(); await p.waitForTimeout(500);
  const rowId: string | null = await p.evaluate((id) => {
    const W = window as Any; const P: AudioBuffer = W.__BUFS__.get(id); const pd = P.getChannelData(0);
    for (const [sid, s] of W.__eng?.samples ?? []) {
      if (!/^flip_/.test(sid)) continue;
      const d = s.buffer.getChannelData(0); if (d.length !== pd.length) continue;
      let same = true; for (let i = 0; i < d.length; i += 7) if (d[i] !== pd[i]) { same = false; break; }
      if (same) return sid;
    }
    return null;
  }, padHit?.id);
  check('4c', 'SEND TO TRACK: a Flip row holds the pad\'s exact buffer', !!rowId, rowId, 'flip_N');
  await tab(p, 'STUDIO');
  for (const s of [0, 8]) await p.locator(`[data-qa="cell"][data-row="${rowId}"][data-step="${s}"]`).click();
  await p.waitForTimeout(300);
  await clearLog(p);
  await btn(p, 'PLAY').click();
  await p.waitForFunction((id) => ((window as Any).__AUDIO_LOG__ as Any[]).filter((e) => e.id === id && e.when > 0).length >= 3, padHit?.id, { timeout: 20000 }).catch(() => undefined);
  const seq = (await audioLog(p)).filter((e: Any) => e.len === padHit?.len && e.when > 0);
  await btn(p, 'STOP').click(); await p.waitForTimeout(300);
  const liveCmp = await p.evaluate(({ ids, pid }) => {
    const W = window as Any; const P = W.__BUFS__.get(pid).getChannelData(0);
    return ids.map((id: number) => { const d = W.__BUFS__.get(id).getChannelData(0); let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i] - P[i])); return { id, same: id === pid, len: d.length, maxDiff: m }; });
  }, { ids: [...new Set(seq.map((e: Any) => e.id))], pid: padHit?.id });
  R.pitchedReversed.sequenced = { hits: seq.length, rates: [...new Set(seq.map((e: Any) => e.rate))], toSpeakers: seq.some((e: Any) => e.toSpeakers), buffers: liveCmp };
  check('4d', 'PLAY: the grid row schedules the pad\'s very buffer (same data, rate 1, through the desk)', seq.length >= 2 && liveCmp.every((c: Any) => c.maxDiff === 0) && seq.every((e: Any) => e.rate === 1 && !e.toSpeakers),
    R.pitchedReversed.sequenced, '≥ 2 hits, max diff 0, rate 1');
  const render = await p.evaluate(async ({ row, pid }) => {
    const W = window as Any; const eng = W.__eng;
    const track = eng.state.tracks.find((t: Any) => t.sampleId === row);
    const P = W.__BUFS__.get(pid);
    const A: AudioBuffer = await eng.renderMixBuffer(1, [track]);                              // the export path: the row as the engine holds it
    const B: AudioBuffer = await eng.renderMixBuffer(1, [track], eng.state.swing, new Map([[row, P]]));   // the pad's own buffer, same desk
    const C: AudioBuffer = await eng.renderMixBuffer(1, [track], eng.state.swing, new Map([[row, W.__P1CHOP__]]));   // the P1 rule's chop
    const stat = (x: AudioBuffer, y: AudioBuffer) => {
      let m = 0, ab = 0, aa = 0, bb = 0, peak = 0;
      for (let c = 0; c < 2; c++) { const a = x.getChannelData(c), b = y.getChannelData(c); for (let i = 0; i < Math.min(a.length, b.length); i++) { m = Math.max(m, Math.abs(a[i] - b[i])); ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; peak = Math.max(peak, Math.abs(a[i])); } }
      return { maxDiff: m, corr: ab / Math.sqrt(aa * bb || 1), peakA: peak, len: x.length, sr: x.sampleRate };
    };
    return { steps: track.pattern.map((on: boolean, i: number) => (on ? i : -1)).filter((i: number) => i >= 0), rowVsPad: stat(A, B), rowVsP1Rule: stat(A, C) };
  }, { row: rowId, pid: padHit?.id });
  R.pitchedReversed.render = render;
  check('4e', 'RENDER: the row\'s export render = the pad\'s buffer rendered through the same desk (bit-identical)', render.rowVsPad.maxDiff === 0 && render.rowVsPad.peakA > 0.01,
    { maxDiff: render.rowVsPad.maxDiff, corr: +render.rowVsPad.corr.toFixed(6), peak: +render.rowVsPad.peakA.toFixed(4) }, { maxDiff: 0 });
  check('4f', 'control: the P1 rule\'s chop (reversed only, unpitched) renders measurably different', render.rowVsP1Rule.maxDiff > 0.05 && render.rowVsP1Rule.corr < 0.9,
    { maxDiff: +render.rowVsP1Rule.maxDiff.toFixed(4), corr: +render.rowVsP1Rule.corr.toFixed(4) }, 'differs');

  // ── 5. ARM REC: taps 20 ms early on the audio clock ───────────────────────────────────────────────────────────
  await tab(p, 'FLIP');
  if (await qa(p, 'flip-quantize').getAttribute('aria-pressed') !== 'true') await qa(p, 'flip-quantize').click();
  await btn(p, 'ARM REC').click();
  await btn(p, 'PLAY').click();
  await p.waitForFunction(() => { const c = (window as Any).__FEL_FLIP_ROOM__?.clock(); return !!c && c.now > c.startSec + 0.3; }, undefined, { timeout: 20000 }).catch(() => undefined);
  const early: Any[] = [], off: Any[] = [];
  for (let i = 0; i < 8; i++) { early.push(await TAP(p, -20)); await p.waitForTimeout(140); }
  await qa(p, 'flip-quantize').click(); await p.waitForTimeout(120);
  for (let i = 0; i < 4; i++) { off.push(await TAP(p, -20)); await p.waitForTimeout(140); }
  await qa(p, 'flip-quantize').click();
  await btn(p, '● REC ARMED').click();
  await btn(p, 'STOP').click(); await p.waitForTimeout(400);
  const row0 = await p.evaluate(() => { const t = (window as Any).__eng.state.tracks.find((x: Any) => x.sampleId === 'flip_0'); return t ? t.pattern.map((on: boolean, i: number) => (on ? i : -1)).filter((i: number) => i >= 0) : null; });
  R.taps = { early, off, flip0Lit: row0 };
  const aimedOn = early.filter(Boolean).map((x: Any) => x.aimed), aimedOff = off.filter(Boolean).map((x: Any) => (x.aimed + 15) % 16);
  check('5a', `QUANTIZE on: ${early.length} taps 20 ms early each land on the step aimed at`, early.every((x) => x && x.got === x.aimed),
    early.map((x) => x && `${x.aimed + 1}→${x.got + 1} (${x.offMs} ms)`), 'aimed = got (steps 1-based)');
  check('5b', 'control, QUANTIZE off: the same early tap lands on the step before (what the P1 playhead rule gave)', off.every((x) => x && x.got === (x.aimed + 15) % 16),
    off.map((x) => x && `${x.aimed + 1}→${x.got + 1} (${x.offMs} ms)`), 'aimed − 1');
  check('5c', "the grid row FLIP 1 holds those steps (the engine's pattern)", !!row0 && [...aimedOn, ...aimedOff].every((s: number) => row0.includes(s)), { lit: row0, aimedOn, offControl: aimedOff }, 'all written');

  // ── 6. CHOP KIT: save, clear, load; then a page reload ────────────────────────────────────────────────────────
  const beforeKit = await flip(p);
  await qa(p, 'flip-kit-name').fill('Sunday kit');
  await qa(p, 'flip-kit-save').click(); await p.waitForTimeout(300);
  await p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await qa(p, 'flip-clear-bank').click(); await p.waitForTimeout(400);
  const cleared = await flip(p);
  await p.getByRole('button', { name: 'load Sunday kit into bank A' }).click();
  await p.waitForFunction(() => (window as Any).__FEL_FLIP__?.decoded && (window as Any).__FEL_FLIP__?.slices > 0, undefined, { timeout: 30000 }).catch(() => undefined);
  const reloadedKit = await flip(p);
  await clearLog(p);
  await p.keyboard.press('3'); await p.waitForTimeout(200);
  const kitPad3 = (await audioLog(p)).filter((e: Any) => e.id > 0).pop();
  R.kit = { saved: { source: beforeKit.source, slices: beforeKit.slices, kits: beforeKit.kits }, cleared: { source: cleared.source, slices: cleared.slices, kits: cleared.kits },
    loaded: { source: reloadedKit.source, slices: reloadedKit.slices, kits: reloadedKit.kits, sameSlices: JSON.stringify(reloadedKit.slicesAll) === JSON.stringify(beforeKit.slicesAll), pad6Start: reloadedKit.slicesAll[PAD]?.start }, pad3: kitPad3 ? { len: kitPad3.len, sameBufferAsBefore: kitPad3.len === padHit?.len } : null };
  check('6a', 'SAVE BANK A AS KIT → CLEAR BANK A: the bank is empty, the kit is kept', cleared.source === null && cleared.slices === 0 && JSON.stringify(cleared.kits) === '["Sunday kit"]', R.kit.cleared, { source: null, slices: 0, kits: ['Sunday kit'] });
  check('6b', 'LOAD → A: the same source, all slices back (the dragged marker too), and pad 3 still −5 reversed', reloadedKit.source === themeId && R.kit.loaded.sameSlices && !!kitPad3 && kitPad3.len === padHit?.len,
    R.kit.loaded, 'same slices, pad 3 same chop');
  await p.waitForFunction(() => /Saved on this device ·/.test(document.querySelector('[data-qa="save-status"]')?.textContent ?? ''), undefined, { timeout: 10000 }).catch(() => undefined);
  await p.waitForTimeout(800);
  const padData = await p.evaluate((id) => Array.from((window as Any).__BUFS__.get(id).getChannelData(0) as Float32Array), padHit?.id);
  await p.reload({ waitUntil: 'domcontentloaded' });
  {
    const start = p.getByRole('button', { name: 'TAP TO START' });
    await start.waitFor({ timeout: 300000 }); await start.click();
    await p.waitForFunction(() => !!(window as Any).__FEL_GRID__, undefined, { timeout: 60000 });
    await engineHook(p);
  }
  roomPosts = 0;
  await tab(p, 'FLIP');
  await p.waitForFunction(() => (window as Any).__FEL_FLIP__?.decoded, undefined, { timeout: 60000 }).catch(() => undefined);
  await p.waitForTimeout(800);
  const afterReload = await flip(p);
  const rowBack = await p.evaluate(async ({ row, want }) => {
    const W = window as Any;
    // the restore may have run before the hook: a pad heard (not armed, not playing: nothing is recorded) names the engine
    if (!W.__eng) window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    for (let i = 0; i < 60 && !W.__eng?.samples?.get(row); i++) await new Promise((r) => setTimeout(r, 250));
    const eng = W.__eng; const s = eng?.samples?.get(row); if (!s) return { found: false };
    const d = s.buffer.getChannelData(0); let m = 0; for (let i = 0; i < Math.min(d.length, want.length); i++) m = Math.max(m, Math.abs(d[i] - want[i]));
    const t0 = eng.state.tracks.find((x: Any) => x.sampleId === 'flip_0');
    return { found: true, len: d.length, wantLen: want.length, maxDiff: m, flip0Lit: t0 ? t0.pattern.map((on: boolean, i: number) => (on ? i : -1)).filter((i: number) => i >= 0) : null };
  }, { row: rowId, want: padData });
  R.reload = { flip: { source: afterReload.source, slices: afterReload.slices, kits: afterReload.kits, pad6Start: afterReload.slicesAll?.[PAD]?.start }, pitchedRow: rowBack };
  check('6c', 'reload: the kit, the bank and the dragged marker come back (autosaved on the device)', JSON.stringify(afterReload.kits) === '["Sunday kit"]' && afterReload.source === themeId && afterReload.slicesAll?.[PAD]?.start === after3.p6.start,
    R.reload.flip, { kits: ['Sunday kit'], pad6Start: after3.p6.start });
  check('6d', 'reload: the pitched + reversed row is re-baked to the same chop, and the recorded steps are kept', rowBack.found && rowBack.len === rowBack.wantLen && rowBack.maxDiff === 0 && JSON.stringify(rowBack.flip0Lit) === JSON.stringify(row0),
    rowBack, { maxDiff: 0, flip0Lit: row0 });

  // ── 7. THE PHONE: a second page, the Academy switched away from FLIP and back ─────────────────────────────────
  await p.waitForFunction(() => /^[A-Z0-9]{4,8} ·/.test(document.querySelector('[data-testid="host-lobby-badge"]')?.textContent ?? ''), undefined, { timeout: 60000 });
  const code = /^([A-Z0-9]{4,8}) ·/.exec((await p.locator('[data-testid="host-lobby-badge"]').first().textContent()) ?? '')?.[1] ?? '';
  const postsAtFlip = roomPosts;
  const phoneCtx: BrowserContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await phoneCtx.addInitScript({ content: `(() => { const V = []; window.__VIBE__ = V; try { Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (p) => { V.push(p); return true; } }); } catch (e) {} })();` });
  const phone = await phoneCtx.newPage();
  phone.on('pageerror', (e) => R.pageErrors.push(`phone: ${String(e).slice(0, 300)}`));
  const cdp = await phoneCtx.newCDPSession(phone);
  await phone.goto(`${BASE}/controller/${code}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await phone.getByRole('button', { name: 'JOIN' }).waitFor({ timeout: 180000 });
  await phone.getByRole('button', { name: 'JOIN' }).click();
  await phone.waitForFunction(() => /Connected/.test(document.querySelector('header')?.textContent ?? ''), undefined, { timeout: 60000 });
  await phone.getByRole('button', { name: '16', exact: true }).waitFor({ timeout: 30000 });
  await p.waitForFunction(() => Number(document.querySelector('[data-qa="phone-room"]')?.getAttribute('data-phones') ?? 0) === 1, undefined, { timeout: 30000 }).catch(() => undefined);
  await p.waitForTimeout(2000);
  const labels = await phone.locator('main button').allTextContents();
  await phone.screenshot({ path: `${OUT}/p5-phone-pad.png` });
  R.frames.phonePad = `${OUT}/p5-phone-pad.png`;
  check('7a', 'the phone page is an MPC: BANK A–D, pads 1–16, ▶ PLAY / ■ STOP / ● REC', labels.join('|') === ['BANK A', 'BANK B', 'BANK C', 'BANK D', ...Array.from({ length: 16 }, (_, i) => String(i + 1)), '▶ PLAY', '■ STOP', '● REC'].join('|'), labels, 'BANK A–D, 1–16, PLAY/STOP/REC');
  const perTab: Any[] = [];
  for (const t of ['FLIP', 'STUDIO', 'LIBRARY', 'LISTEN', 'FLIP'] as const) {
    if (!(t === 'FLIP' && perTab.length === 0)) await tab(p, t);
    const conn = await phone.evaluate(() => document.querySelector('header')?.textContent ?? '');
    const h = await phoneHit(p, phone, cdp, '1', `host on ${t}`);
    perTab.push({ tab: t, phone: /Connected/.test(conn) ? 'Connected' : conn.slice(0, 60), roomPostsSoFar: roomPosts, ...h });
  }
  const codeAfter = /^([A-Z0-9]{4,8}) ·/.exec((await p.locator('[data-testid="host-lobby-badge"]').first().textContent()) ?? '')?.[1] ?? '';
  R.phone = { code, codeAfter, postsAtFlip, roomPosts, perTab };
  check('7b', 'switching the Academy FLIP → STUDIO → LIBRARY → LISTEN → FLIP: one room (no new POST, the same code), the phone still Connected', roomPosts === postsAtFlip && codeAfter === code && perTab.every((r) => r.phone === 'Connected'),
    { code, codeAfter, postsAtFlip, roomPosts, phone: perTab.map((r) => `${r.tab}:${r.phone}`) }, 'same room, Connected');
  check('7c', 'a phone pad hit sounds on every tab (FlipPad on FLIP, the room elsewhere), through the desk', perTab.every((r) => r.arrived && r.sounded > 0 && !r.toSpeakers && r.how === (r.tab === 'FLIP' ? 'flippad' : 'played')),
    perTab.map((r) => [r.tab, r.how, r.sounded, r.lens[0]]), 'sounded on each');
  // BANK B and the transport from the phone
  await touch(phone, cdp, 'BANK B');
  const bankB = await p.waitForFunction(() => (window as Any).__FEL_PHONE__?.bank === 'B', undefined, { timeout: 5000 }).then(() => true, () => false);
  await touch(phone, cdp, 'BANK A');
  await p.waitForFunction(() => (window as Any).__FEL_PHONE__?.bank === 'A', undefined, { timeout: 5000 }).catch(() => undefined);
  await touch(phone, cdp, '▶ PLAY');
  const ran = await p.waitForFunction(() => !!(window as Any).__FEL_FLIP_ROOM__?.clock(), undefined, { timeout: 8000 }).then(() => true, () => false);
  await p.waitForTimeout(600);
  await touch(phone, cdp, '■ STOP');
  const stopped = await p.waitForFunction(() => !(window as Any).__FEL_FLIP_ROOM__?.clock(), undefined, { timeout: 8000 }).then(() => true, () => false);
  const vibes = await phone.evaluate(() => ((window as Any).__VIBE__ as number[]).slice());
  R.phone.transport = { bankB, ran, stopped, vibes };
  check('7d', 'the phone\'s BANK B picks bank B in the room; ▶ PLAY starts and ■ STOP stops the Academy', bankB && ran && stopped, R.phone.transport, { bankB: true, ran: true, stopped: true });
  check('7e', 'the phone buzzed once per pad hit (12 ms)', vibes.filter((v) => v === 12).length >= perTab.length, vibes, `≥ ${perTab.length} × 12`);
  await phoneCtx.close();

  // ── 8. THE UPLOAD TICK ────────────────────────────────────────────────────────────────────────────────────────
  await tab(p, 'FLIP');
  await qa(p, 'flip-bank-D').click(); await p.waitForTimeout(300);
  const tick0 = { fileDisabled: await qa(p, 'upload-file').isDisabled(), labelDisabled: await qa(p, 'upload-label').getAttribute('aria-disabled'), title: await qa(p, 'upload-label').getAttribute('title'), hint: await qa(p, 'upload-hint').textContent() };
  check('8a', 'YOUR FILE is disabled until "I made this or I own the rights" is ticked', tick0.fileDisabled === true && tick0.labelDisabled === 'true', tick0, 'disabled');
  await qa(p, 'own-rights').check();
  const tick1 = { fileDisabled: await qa(p, 'upload-file').isDisabled() };
  const wav = `${OUT}/p5-own-clicks.wav`;
  fs.writeFileSync(wav, testWav());
  await qa(p, 'upload-file').setInputFiles(wav);
  const up = await p.waitForFunction(() => { const f = (window as Any).__FEL_FLIP__; return !!f?.decoded && /^own_/.test(f.source ?? ''); }, undefined, { timeout: 30000 }).then(() => true, () => false);
  const srcLine = await qa(p, 'flip-source').innerText().catch(() => '');
  check('8b', 'ticked: YOUR FILE opens, the upload loads on bank D marked "your upload", the tick clears for the next file', !tick1.fileDisabled && up && /your upload/.test(srcLine) && !(await qa(p, 'own-rights').isChecked()), { fileDisabledAfterTick: tick1.fileDisabled, line: srcLine }, 'your upload');
  await p.getByRole('button', { name: /^pad 1 \(bank D\)$/ }).dispatchEvent('pointerdown'); await p.waitForTimeout(200);
  await qa(p, 'flip-send').click(); await p.waitForTimeout(500);
  await tab(p, 'STUDIO');
  const privLine = await qa(p, 'upload-private').innerText().catch(() => null);
  const publishBtn = btn(p, 'PUBLISH TO LIBRARY');
  const pubDisabled = await publishBtn.isDisabled().catch(() => null);
  const danceDisabled = await qa(p, 'dance-export').isDisabled().catch(() => 'no dance-export button');
  await p.getByPlaceholder('track title…').fill('p5 upload song');
  // every line the room says while the publish runs (its toast is brief): watched, not guessed
  // (the toast is one element whose text React swaps in place: polled every 40 ms, not observed for added nodes)
  await p.evaluate(() => { const W = window as Any; W.__SAID__ = []; let last = ''; clearInterval(W.__saidT); W.__saidT = setInterval(() => { const t = document.querySelector('[data-qa="toast"]')?.textContent ?? ''; if (t && t !== last) W.__SAID__.push(t); last = t; }, 40); });
  await publishBtn.click();
  await p.waitForFunction(() => ((window as Any).__SAID__ as string[]).some((t) => /published/.test(t)), undefined, { timeout: 30000 }).catch(() => undefined);
  await p.waitForTimeout(500);
  const afterPub = await p.evaluate(() => ({ said: [...new Set((window as Any).__SAID__ as string[])], libraryLine: (window as Any).__FEL_GRID__?.libraryLine ?? null, titleAfter: (document.querySelector('input[placeholder="track title…"]') as HTMLInputElement | null)?.value ?? null }));
  R.upload = { beforeTick: tick0, privLine, publishDisabled: pubDisabled, danceDisabled, afterPublishClick: afterPub };
  const pubRow = p.getByPlaceholder('track title…');
  await pubRow.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(300);
  const rowBox = (await pubRow.boundingBox())!;
  const lineBox = await qa(p, 'upload-private').boundingBox();
  await p.screenshot({ path: `${OUT}/p5-upload-line.png`, clip: { x: 0, y: Math.max(0, rowBox.y - 24), width: 1280, height: (lineBox ? lineBox.y + lineBox.height - rowBox.y : 60) + 48 } });
  R.frames.uploadLine = `${OUT}/p5-upload-line.png`;
  check('8c', 'an upload in the song: the room says why in one line', !!privLine && /^Device-only: this song uses your upload "p5-own-clicks\.wav"/.test(privLine), privLine, 'Device-only: this song uses your upload …');
  // measured, and reported as is: the task expected PUBLISH / export to be BLOCKED; uploadPrivacy.UPLOAD_DOORS decides
  check('8d', 'PUBLISH TO LIBRARY with an upload in the song is BLOCKED (the task\'s expectation)', pubDisabled === true, { publishDisabled: pubDisabled, afterClick: afterPub }, 'disabled');
  check('8e', 'SEND TO THE DANCE FLOOR with an upload in the song is BLOCKED (the task\'s expectation)', danceDisabled === true, { danceDisabled }, 'disabled');
  // what PUBLISH actually did (the library on this device)
  await tab(p, 'LIBRARY');
  const inLibrary = await p.getByText('p5 upload song', { exact: false }).count();
  R.upload.inLibrary = inLibrary;
  R.upload.inLibraryText = await p.getByText('p5 upload song', { exact: false }).evaluateAll((els) => els.map((e) => `${e.tagName}: ${(e.textContent ?? '').slice(0, 120)}`));
  check('8f', 'measured outcome: the upload song was published to the Academy library on this device (not blocked)', afterPub.said.some((t: string) => /"p5 upload song" published/.test(t)) && inLibrary > 0, { said: afterPub.said, inLibrary }, 'reported as measured');

  // ── 8g. an upload from BEFORE the tick existed (P3 / P4 took YOUR FILE with no tick): what the tick blocks for it ──
  await tab(p, 'FLIP');
  await p.waitForFunction(() => /Saved on this device ·/.test(document.querySelector('[data-qa="save-status"]')?.textContent ?? ''), undefined, { timeout: 10000 }).catch(() => undefined);
  await p.waitForTimeout(800);
  await p.goto(`${BASE}/audio/flip/pack.json`, { waitUntil: 'domcontentloaded' });   // same origin, the room unmounted: nothing autosaves over the edit
  const legacyNote = 'Uploaded by the player — their own recording.';
  const edited = await p.evaluate((note) => new Promise<Any>((res) => {
    const r = indexedDB.open('fel-studio', 1);
    r.onsuccess = () => {
      const db = r.result; const tx = db.transaction('projects', 'readwrite'); const st = tx.objectStore('projects');
      const out: Any[] = [];
      const q = st.openCursor();
      q.onsuccess = () => {
        const c = q.result; if (!c) return;
        const rec = c.value; const f = rec?.body?.flip; let n = 0;
        if (f) {
          if (f.source?.upload === true) { f.source.note = note; n++; }
          for (const b of f.otherBanks ?? []) if (b?.source?.upload === true) { b.source.note = note; n++; }
        }
        if (n) { c.update(rec); out.push({ id: c.key, banks: n }); }
        c.continue();
      };
      tx.oncomplete = () => { db.close(); res(out); };
      tx.onerror = () => res({ error: String(tx.error) });
    };
    r.onerror = () => res({ error: 'open failed' });
  }), legacyNote);
  await openRoom(p, '/dev/music?stage=studio&player=p5live');
  await tab(p, 'FLIP');
  if (await qa(p, 'flip-bank-D').getAttribute('aria-pressed') !== 'true') await qa(p, 'flip-bank-D').click();
  await p.waitForFunction(() => { const f = (window as Any).__FEL_FLIP__; return !!f?.decoded && /^own_/.test(f.source ?? ''); }, undefined, { timeout: 30000 }).catch(() => undefined);
  const oldRow = await qa(p, 'upload-tick-old').innerText().catch(() => null);
  await p.getByRole('button', { name: /^pad 1 \(bank D\)$/ }).dispatchEvent('pointerdown'); await p.waitForTimeout(250);
  const sendOld = { disabled: await qa(p, 'flip-send').isDisabled().catch(() => null), title: await qa(p, 'flip-send').getAttribute('title').catch(() => null) };
  await p.evaluate(() => { const W = window as Any; W.__SAID__ = []; let last = ''; clearInterval(W.__saidT); W.__saidT = setInterval(() => { const t = document.querySelector('[data-qa="toast"]')?.textContent ?? ''; if (t && t !== last) W.__SAID__.push(t); last = t; }, 40); });
  await qa(p, 'flip-kit-save').click(); await p.waitForTimeout(600);
  const kitSaid = await p.evaluate(() => [...new Set((window as Any).__SAID__ as string[])]);
  const kitsAfterRefusal = (await flip(p))?.kits ?? null;
  await qa(p, 'upload-tick-old').scrollIntoViewIfNeeded();
  const tickBox = (await qa(p, 'upload-tick-old').boundingBox())!;
  await p.screenshot({ path: `${OUT}/p5-upload-tick-old.png`, clip: { x: 0, y: Math.max(0, tickBox.y - 12), width: 1280, height: tickBox.height + 24 } });
  R.frames.uploadTickOld = `${OUT}/p5-upload-tick-old.png`;
  await qa(p, 'upload-tick-old-box').check().catch(() => undefined);
  await p.waitForTimeout(400);
  const sendAfterTick = { disabled: await qa(p, 'flip-send').isDisabled().catch(() => null), tickRow: await qa(p, 'upload-tick-old').count() };
  R.upload.legacy = { edited, oldRow, sendOld, kitSaid, kitsAfterRefusal, sendAfterTick };
  check('8g', 'an upload from before the tick: SEND TO TRACK and SAVE KIT are refused with the one-line reason until it is ticked; the tick opens them',
    !!oldRow && sendOld.disabled === true && /^Tick "I made this or I own the rights" for /.test(sendOld.title ?? '') && kitSaid.some((t: string) => /^Tick "I made this or I own the rights" for /.test(t)) && sendAfterTick.disabled === false && sendAfterTick.tickRow === 0,
    R.upload.legacy, 'refused with the line, open after the tick');

  await ctx.close();
}

const browser = await chromium.launch({ executablePath: chromiumExe(), args: ARGS, headless: true });
try { await host(browser); } catch (e) { R.error = String((e as Error)?.stack ?? e).slice(0, 3000); log('ERROR', R.error); } finally { await browser.close(); }
R.passed = R.checks.filter((c: Any) => c.pass).length;
R.total = R.checks.length;
fs.writeFileSync(`${OUT}/p5-live-proof.json`, JSON.stringify(R, null, 1));
log(`${R.passed}/${R.total} checks, ${R.pageErrors.length} page errors → ${OUT}/p5-live-proof.json`);
