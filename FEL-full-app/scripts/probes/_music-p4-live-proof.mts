// MUSIC-SUITE P4 (2026-09-26) — THE LIVE PROOF of "Pocket studio + melody", on the dev server's /dev/music (the real
// StudioMode, no GameShell, database offline). One browser, one page at a time (the disk is ~96 % full). What it measures,
// each against the phase-1 baseline (outbox musicsuite/BASELINE.md, p1/music-baseline.json) where one exists:
//
//   PHONE 375 × 812 (isMobile, touch, DPR 2): the step cell (P1: 16.5 px), body scrollWidth vs clientWidth (P1: a 418 px
//     page in a 375 px screen) with the grid, the note editor, the mixer and the booth open; page 1 / page 2 of 8; a bass
//     MELODY painted with the note editor by touch; PLAY — the notes the ENGINE scheduled (its own voiceFor, read inside
//     scheduleStep) and the sources it started (AudioBufferSourceNode.start, each buffer tagged with the note it was
//     rendered on), plus each note buffer's pitch measured (YIN) so "the engine played A1" is heard, not only logged;
//     the record booth ARMED on a fake mic with its meter reading.
//   DESKTOP 1280 × 800: SOLO one strip — which rows the engine lets sound (hears()), which sources started, which channel
//     meters moved; the FULL 8-track test pattern (8 rows × 16 steps) PUBLISHED through the room's own button — the float
//     render (renderMixBuffer) and the 16-bit WAV it wrote, peak dBFS each (MASTER off and on); a TAKE on a fake mic that
//     plays a WAV of clicks on the bar (--use-file-for-fake-audio-capture): the click is aimed to reach the graph at the
//     bar line + the booth's own latency L (a player dead on the beat, by the booth's formula) and the take's first
//     transient is read against its bar; it LOOPS; STOP — the take's source is stopped at the press, nothing starts after,
//     the master meter falls to silence; CHECK MY TIMING — 8 taps 75 ms late (± a few ms) compute and save an offset, and
//     a second take after it uses the calibration.
//   BEFORE: the P1 engine (git 23518f9c AudioEngine.ts + SynthKit.ts — P1 did not touch either) renders the same FULL
//     pattern in about:blank's real OfflineAudioContext.
//
// Engine internals are read through webpack's module cache in the dev bundle (webpackChunk_N_E): AudioEngine.prototype's
// scheduleStep / setState / setTakes / renderMixBuffer / renderMixdown are wrapped to WATCH (they call the original).
// Usage: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p4-live-proof.mts
//        (BASE, OUT env override). Writes <OUT>/live-proof.json; the frames next to it.
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { build, type Plugin } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p4/live';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const GIT = '/Library/Developer/CommandLineTools/usr/bin/git';
const P1_COMMIT = '23518f9c';
fs.mkdirSync(OUT, { recursive: true });
const BPM = 92;
const BAR = 240 / BPM;                 // 2.6087 s
const SR = 48000;
const WAV = `${OUT}/clicks-on-the-bar-92bpm-48k.wav`;
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p4-live +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), route: '/dev/music', frames: {}, pageErrors: [] as string[], checks: [] as Any[], numbers: {}, notes: [] as string[] };
const check = (name: string, pass: boolean, got: unknown, want: unknown) => { R.checks.push({ name, pass, got, want }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(got)?.slice(0, 400)); };
const qa = (p: Page, id: string) => p.locator(`[data-qa="${id}"]`);
const cell = (p: Page, row: string, step: number) => p.locator(`[data-qa="cell"][data-row="${row}"][data-step="${step}"]`);
const on = (p: Page, row: string): Promise<number[]> => p.evaluate((r) => [...document.querySelectorAll(`[data-qa="cell"][data-row="${r}"][data-on="1"]`)].map((c) => Number((c as HTMLElement).dataset.step)), row);
const frame = async (p: Page, name: string, full = false) => { const f = `${OUT}/p4-live-${name}.png`; await p.screenshot({ path: f, fullPage: full }); R.frames[name] = f; log('frame', name); };
const center = async (p: Page, loc: ReturnType<Page['locator']>) => { const b = (await loc.boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

// ── the fake mic's file: a click on every bar line at 92 BPM, 48 kHz mono, 23 bars = 60.000 s (the loop keeps the period) ──
function writeClickWav(file: string): { clicks: number; frames: number; periodFrames: number } {
  const frames = Math.round(23 * BAR * SR);   // 2 880 000
  const pcm = new Int16Array(frames);
  let clicks = 0;
  for (let k = 0; k < 23; k++) {
    const at = Math.round(k * BAR * SR);
    // a sharp click: full level on its FIRST sample (so "the first transient" is one exact frame), a 2.5 kHz ring, 8 ms
    for (let n = 0; n < 400 && at + n < frames; n++) pcm[at + n] = Math.round(32767 * 0.9 * Math.exp(-n / 40) * Math.cos((2 * Math.PI * 2500 * n) / SR));
    // …then a quiet 330 Hz bed (0.2, under the 0.3 onset threshold) to the next click, so a take has SOUND all through
    // its bar: STOP in the middle of a pass must then take the takes strip from a level to silence (a click alone
    // would leave the pass silent mid-bar, and the meter could not tell a stopped take from a quiet one)
    const next = Math.min(frames, Math.round((k + 1) * BAR * SR));
    for (let i = at + 400; i < next - 240; i++) {
      const j = i - (at + 400), fade = Math.min(1, j / 240, (next - 240 - i) / 240);
      pcm[i] = Math.round(32767 * 0.2 * fade * Math.sin((2 * Math.PI * 330 * j) / SR));
    }
    clicks++;
  }
  const buf = Buffer.alloc(44 + pcm.byteLength);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + pcm.byteLength, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(pcm.byteLength, 40);
  Buffer.from(pcm.buffer).copy(buf, 44);
  fs.writeFileSync(file, buf);
  return { clicks, frames, periodFrames: BAR * SR };
}

/** Installed before the page's scripts: every live source start / stop (tagged by the buffer's note), every mic stream,
 *  the mic's MediaStreamSource (the detector taps the SAME node the booth's tape hangs off: identical frames), the tier. */
const INIT = `(() => {
  const W = window;
  if (!W.__name) W.__name = (f) => f;   // tsx's keepNames helper, for the named functions evaluated in the page
  W.__srcLog = []; W.__bufTag = new WeakMap(); let n = 0;
  const S = AudioBufferSourceNode.prototype; const st = S.start, sp = S.stop;
  S.start = function (when = 0, offset, duration) {
    if (!(this.context instanceof OfflineAudioContext)) {
      if (this.__id === undefined) this.__id = ++n;
      const b = this.buffer;
      W.__srcLog.push({ k: 'start', id: this.__id, when, offset, duration, len: b ? b.length : 0, sr: b ? b.sampleRate : 0, rate: this.playbackRate.value, tag: b ? (W.__bufTag.get(b) || null) : null, now: this.context.currentTime });
    }
    return st.apply(this, arguments);
  };
  S.stop = function (when = 0) {
    if (!(this.context instanceof OfflineAudioContext)) {
      if (this.__id === undefined) this.__id = ++n;
      const b = this.buffer;
      W.__srcLog.push({ k: 'stop', id: this.__id, when, len: b ? b.length : 0, tag: b ? (W.__bufTag.get(b) || null) : null, now: this.context.currentTime });
    }
    return sp.apply(this, arguments);
  };
  W.__streams = [];
  const md = navigator.mediaDevices;
  if (md && md.getUserMedia) { const gum = md.getUserMedia.bind(md); md.getUserMedia = async (c) => { const s = await gum(c); W.__streams.push({ c: JSON.stringify(c), s }); return s; }; }
  const cms = AudioContext.prototype.createMediaStreamSource;
  AudioContext.prototype.createMediaStreamSource = function (s) { const node = cms.call(this, s); if (!W.__probeOwn) { W.__micCtx = this; W.__micSrc = node; } return node; };
  localStorage.setItem('fel-music-progress', JSON.stringify({ patternsMade: 3, sectionsSaved: 2, chainEntries: 2 }));
})();`;

async function openRoom(p: Page): Promise<void> {
  await p.goto(`${BASE}/dev/music?stage=studio`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  const start = p.getByRole('button', { name: 'TAP TO START' });
  await start.waitFor({ timeout: 300000 });
  await start.click();
  await qa(p, 'kit-grid').waitFor({ timeout: 60000 });
  await p.waitForTimeout(700);
  await installEngineHooks(p);
}

/** Wrap (watch only) the engine's prototype through webpack's module cache. */
async function installEngineHooks(p: Page): Promise<void> {
  const ok = await p.evaluate(() => {
    const W = window as Any;
    if (W.__engHooks) return true;
    let req: Any = null;
    W.webpackChunk_N_E.push([[Symbol('p4-live')], {}, (r: Any) => { req = r; }]);
    const id = Object.keys(req.c).find((k) => /lib\/babylon\/music\/AudioEngine\.ts$/.test(k));
    if (!id) return false;
    const AE = req(id);
    W.__AE = AE;
    const proto = AE.AudioEngine.prototype;
    W.__noteLog = []; W.__renders = [];
    const oStep = proto.scheduleStep, oSet = proto.setState, oTakes = proto.setTakes, oBuf = proto.renderMixBuffer, oMix = proto.renderMixdown;
    proto.scheduleStep = function (this: Any, step: number, time: number) {
      W.__eng = this;
      const past = time < this.ctx.currentTime;
      for (const t of this.state.tracks) {
        if (!t.pattern[step]) continue;
        const heard = this.hears(t) && this.samples.has(t.sampleId);
        let v: Any = null;
        if (heard) {
          v = AE.voiceFor(this.samples.get(t.sampleId), t, step, this.notes);
          W.__bufTag.set(v.buffer, t.sampleId + (v.note !== null ? '#' + v.note : ''));
        }
        W.__noteLog.push({ step, time, id: t.sampleId, heard, past, note: v ? v.note : null, rate: v ? v.rate : null, len: v ? v.buffer.length : null });
      }
      return oStep.call(this, step, time);
    };
    proto.setState = function (this: Any, s: Any) { W.__eng = this; return oSet.call(this, s); };
    proto.setTakes = function (this: Any, list: Any[]) { W.__eng = this; for (const t of list) W.__bufTag.set(t.buffer, 'take:' + t.id); return oTakes.call(this, list); };
    proto.renderMixBuffer = async function (this: Any, ...a: Any[]) {
      const b: AudioBuffer = await oBuf.apply(this, a);
      let peak = 0, over = 0; const ceil = Math.pow(10, -0.3 / 20);
      for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) { const x = Math.abs(d[i]); if (x > peak) peak = x; if (x > ceil + 1e-6) over++; } }
      W.__renders.push({ kind: 'float', bars: a[0], tracks: (a[1] ?? this.state.tracks).filter((t: Any) => t.pattern.some(Boolean)).map((t: Any) => `${t.sampleId}:${t.pattern.filter(Boolean).length}`), polished: this.polished, mixer: JSON.stringify(this.mixer), sampleRate: b.sampleRate, length: b.length, channels: b.numberOfChannels, peak, peakDb: 20 * Math.log10(Math.max(peak, 1e-12)), overMinus03: over });
      return b;
    };
    proto.renderMixdown = async function (this: Any, ...a: Any[]) {
      const blob: Blob = await oMix.apply(this, a);
      const dv = new DataView(await blob.arrayBuffer());
      let peak = 0, full = 0; const n = (dv.byteLength - 44) / 2;
      for (let i = 0; i < n; i++) { const s = Math.abs(dv.getInt16(44 + 2 * i, true)); if (s > peak) peak = s; if (s >= 32767) full++; }
      W.__renders.push({ kind: 'wav', bytes: dv.byteLength, peakCode: peak, peakDb: 20 * Math.log10(Math.max(peak, 1) / 32767), fullScaleSamples: full });
      return blob;
    };
    W.__engHooks = true;
    return true;
  });
  if (!ok) throw new Error('AudioEngine module not found in the webpack cache');
}

/** The mic's clicks on the audio clock: an AudioWorklet on the booth's own MediaStreamSource (same node, same frames). */
async function startDetector(p: Page): Promise<boolean> {
  return p.evaluate(async () => {
    const W = window as Any;
    const ctx: AudioContext = W.__micCtx; const src: AudioNode = W.__micSrc;
    if (!ctx || !src) return false;
    W.__onsets = [];
    if (!W.__detLoaded || W.__detCtx !== ctx) {
      const code = `class P4Onset extends AudioWorkletProcessor { constructor(){ super(); this.last = -1e12; }
        process(inputs){ const i0 = inputs[0]; if (i0 && i0[0]) { const ch = i0[0]; for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]);
          if (a > 0.3 && currentFrame + i - this.last > 4800) { this.last = currentFrame + i; this.port.postMessage({ frame: currentFrame + i, amp: ch[i] }); } } } return true; } }
        registerProcessor('p4-onset', P4Onset);`;
      const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      W.__detLoaded = true; W.__detCtx = ctx;
    }
    if (W.__det) { try { W.__det.disconnect(); } catch { /* */ } }
    const node = new AudioWorkletNode(ctx, 'p4-onset', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    const sink = ctx.createGain(); sink.gain.value = 0;
    node.connect(sink).connect(ctx.destination);
    node.port.onmessage = (e) => W.__onsets.push({ frame: e.data.frame, amp: e.data.amp, sr: ctx.sampleRate });
    src.connect(node);
    W.__det = node;
    return true;
  });
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// PHONE
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const MELODY: Record<number, number> = { 0: 33, 3: 36, 6: 40, 7: 38, 8: 43, 10: 40, 12: 36, 14: 35 };   // A1 C2 E2 D2 | G2 E2 C2 B1 (A minor)
const NOTE_NAME = (m: number) => `${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
const overflow = (p: Page): Promise<Any> => p.evaluate(() => ({
  innerWidth, bodyScrollW: document.body.scrollWidth, bodyClientW: document.body.clientWidth,
  docScrollW: document.documentElement.scrollWidth, docClientW: document.documentElement.clientWidth,
  wide: [...document.querySelectorAll('body *')].filter((e) => { const r = (e as HTMLElement).getBoundingClientRect(); return r.right > innerWidth + 0.5 && r.width > 0 && getComputedStyle(e).position !== 'fixed'; })
    .slice(0, 6).map((e) => `${(e as HTMLElement).tagName}.${(e as HTMLElement).dataset.qa ?? ''} right=${(e as HTMLElement).getBoundingClientRect().right.toFixed(0)}`),
}));
const flat = (o: Any) => o.bodyScrollW === o.bodyClientW && o.docScrollW <= o.docClientW;
async function scrollToQa(p: Page, id: string, pad = 8): Promise<void> {
  await p.evaluate(([q, d]) => { const el = document.querySelector(`[data-qa="${q}"]`); if (el) scrollTo(0, el.getBoundingClientRect().top + scrollY - (d as number)); }, [id, pad] as const);
  await p.waitForTimeout(250);
}

async function phone(browser: Browser): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['microphone'] });
  await ctx.addInitScript(INIT);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => R.pageErrors.push(`phone: ${e.message}`));
  p.on('framenavigated', (f) => { if (f === p.mainFrame() && R.numbers.phoneOpened) R.notes.push(`phone page navigated mid-run: ${f.url()}`); });
  await openRoom(p);
  R.numbers.phoneOpened = true;
  const tap = async (loc: ReturnType<Page['locator']>) => { await loc.scrollIntoViewIfNeeded(); const c = await center(p, loc); await p.touchscreen.tap(c.x, c.y); await p.waitForTimeout(120); };

  // ── layout ──
  const g = await p.evaluate(() => (window as Any).__FEL_GRID__);
  const rows = await p.evaluate(() => [...document.querySelectorAll('[data-qa="grid-row"]')].map((r) => (r as HTMLElement).dataset.row));
  const box = (await cell(p, 'kick', 0).boundingBox())!;
  const perRow = await p.locator('[data-qa="cell"][data-row="kick"]').count();
  const cellsAll = await p.evaluate(() => [...document.querySelectorAll('[data-qa="cell"]')].map((c) => { const r = c.getBoundingClientRect(); return Math.min(r.width, r.height); }));
  const ov0 = await overflow(p);
  R.numbers.phone = { grid: { compact: g?.compact, pages: g?.pages, pageSteps: g?.pageSteps }, rows, cell: { w: round(box.width, 1), h: round(box.height, 1), perRow, smallestOfAll: round(Math.min(...cellsAll), 1), cells: cellsAll.length }, overflowGrid: ov0 };
  check('PHONE 375: the grid is 2 pages of 8, every step cell ≥ 40 px (P1: 16.5 px)', g?.compact === true && g?.pages === 2 && perRow === 8 && Math.min(...cellsAll) >= 40,
    R.numbers.phone.cell, '2 × 8, min cell ≥ 40');
  check('PHONE 375: body scrollWidth == clientWidth (P1: a 418 px page, 43 px sideways)', flat(ov0), ov0, 'equal, no wider element');

  // a beat on page 1, by touch
  for (const [r, s] of [['kick', 0], ['kick', 4], ['snare', 4], ['hat', 2], ['hat', 6]] as const) await tap(cell(p, r, s));
  await scrollToQa(p, 'step-grid', 60);
  await frame(p, 'phone-grid-page1');
  // what sits in the frame's top band (a dark strip showed there in a run: which element is it?)
  R.numbers.phone.topBand = await p.evaluate(() => ({ scrollY, at: document.elementsFromPoint(187, 12).slice(0, 4).map((e) => `${e.tagName}.${(e as HTMLElement).dataset.qa ?? ''}:${getComputedStyle(e).position}:${getComputedStyle(e).backgroundColor}:${(e.textContent ?? '').slice(0, 60)}`) }));
  // page 2
  await tap(p.locator('[data-qa="grid-page"][data-page="1"]'));
  const steps2 = await p.evaluate(() => [...document.querySelectorAll('[data-qa="cell"][data-row="kick"]')].map((c) => Number((c as HTMLElement).dataset.step)));
  for (const [r, s] of [['kick', 8], ['kick', 12], ['snare', 12], ['hat', 10], ['hat', 14]] as const) await tap(cell(p, r, s));
  const box2 = (await cell(p, 'kick', 8).boundingBox())!;
  const ov2 = await overflow(p);
  R.numbers.phone.page2 = { steps: steps2, cell: { w: round(box2.width, 1), h: round(box2.height, 1) }, overflow: ov2 };
  check('PHONE page 2 draws steps 9–16 at ≥ 40 px, still no sideways scroll', JSON.stringify(steps2) === '[8,9,10,11,12,13,14,15]' && box2.width >= 40 && box2.height >= 40 && flat(ov2), R.numbers.phone.page2, '8..15, ≥ 40, flat');
  await scrollToQa(p, 'step-grid', 60);
  await frame(p, 'phone-grid-page2');

  // ── the note editor: a bass melody by touch, page 1 then page 2 ──
  await tap(p.locator('[data-qa="grid-page"][data-page="0"]'));
  await tap(p.locator('[data-qa="note-open"][data-row="bass"]'));
  await qa(p, 'note-row').waitFor({ timeout: 5000 });
  const keyText = await qa(p, 'note-row-key').textContent();
  const offered = await p.evaluate(() => [...new Set([...document.querySelectorAll('[data-qa="note-cell"]')].map((c) => Number((c as HTMLElement).dataset.note)))]);
  const picked: Record<number, number> = {};
  for (const [page, stepsOnPage] of [[0, [0, 3, 6, 7]], [1, [8, 10, 12, 14]]] as const) {
    if (page === 1) { await tap(p.locator('[data-qa="grid-page"][data-page="1"]')); await qa(p, 'note-row').waitFor(); }
    for (const s of stepsOnPage) {
      const want = MELODY[s];
      const target = p.locator(`[data-qa="note-row"] [data-qa="note-cell"][data-step="${s}"][data-note="${want}"]`);
      if (!(await target.count())) { R.notes.push(`note editor: ${NOTE_NAME(want)} not offered on step ${s + 1} (window ${JSON.stringify(offered)})`); continue; }
      await tap(target);
      picked[s] = want;
    }
  }
  await p.waitForTimeout(500);
  const ovNote = await overflow(p);
  const noteCell = (await p.locator('[data-qa="note-cell"]').first().boundingBox())!;
  const bassLit = await on(p, 'bass');
  R.numbers.phone.noteEditor = { keyText, offered, picked, bassLitPage2: bassLit, noteCell: { w: round(noteCell.width, 1), h: round(noteCell.height, 1) }, overflow: ovNote };
  await scrollToQa(p, 'note-row', 150);
  await frame(p, 'phone-note-editor');
  check('PHONE note editor: 8 notes of an A-minor bass line picked by touch, note cells ≥ 40 px tall, no sideways scroll', Object.keys(picked).length === 8 && noteCell.height >= 40 && flat(ovNote), R.numbers.phone.noteEditor, '8 picked, ≥ 40, flat');
  // the engine holds the line (its own state)
  const engBass = await p.evaluate(() => { const t = (window as Any).__eng?.state?.tracks?.find((x: Any) => x.sampleId === 'bass'); return t ? { pattern: t.pattern.map((b: boolean, i: number) => (b ? i : -1)).filter((i: number) => i >= 0), notes: t.notes } : null; });
  const engLine = engBass ? Object.fromEntries(engBass.pattern.map((s: number) => [s, engBass.notes?.[s]])) : null;
  R.numbers.phone.engineBassState = engLine;
  check('the ENGINE\'s bass track holds exactly the painted line (step → MIDI)', JSON.stringify(engLine) === JSON.stringify(Object.fromEntries(Object.entries(MELODY).map(([s, n]) => [s, n]))), { engine: engLine, painted: MELODY }, 'equal');

  // the note renders: one buffer per note, rendered ON the note (rate 1) — wait for all of them
  const distinct = [...new Set(Object.values(MELODY))].sort((a, b) => a - b);
  // (the kit's own root note needs no render: its buffer already sounds it — StudioMode's VOICE_ROOTS skip)
  await p.waitForFunction((d) => { const W = window as Any; const e = W.__eng; if (!e) return false; const root = W.__AE.sampleRoot(e.samples.get('bass')); const r = e.loadedNotes('bass'); return d.every((n: number) => n === root || r.includes(n)); }, distinct, { timeout: 15000, polling: 100 }).catch(() => R.notes.push('note renders not all loaded within 15 s'));
  // PLAY two bars+, then STOP
  await p.evaluate(() => { (window as Any).__noteLog.length = 0; (window as Any).__srcLog.length = 0; });
  await scrollToQa(p, 'transport', 200);
  const playBtn = p.locator('[data-qa="transport"] button').first();
  await tap(playBtn);
  await p.waitForTimeout(Math.round((2 * BAR + 0.6) * 1000));
  await tap(playBtn);
  await p.waitForTimeout(300);
  const played = await p.evaluate(() => {
    const W = window as Any;
    const nl = W.__noteLog.filter((e: Any) => e.id === 'bass');
    const starts = W.__srcLog.filter((e: Any) => e.k === 'start' && typeof e.tag === 'string' && e.tag.startsWith('bass'));
    return { scheduled: nl.map((e: Any) => ({ step: e.step, time: e.time, note: e.note, rate: e.rate, heard: e.heard, past: e.past })), started: starts.map((e: Any) => ({ when: e.when, tag: e.tag, rate: e.rate })) };
  });
  // pair each scheduled bass note with the source the engine started at that time
  const passes: Any[] = [];
  let cur: Any[] = [];
  for (const e of played.scheduled) { if (cur.length && e.step < cur[cur.length - 1].step) { passes.push(cur); cur = []; } cur.push(e); }
  if (cur.length) passes.push(cur);
  const fullPasses = passes.filter((ps) => ps.length === 8);
  const paired = played.scheduled.map((e: Any) => { const s = played.started.find((x: Any) => Math.abs(x.when - e.time) < 1e-6); return { step: e.step + 1, note: e.note, name: e.note !== null ? NOTE_NAME(e.note) : null, rate: e.rate, sourceTag: s?.tag ?? null, sourceRate: s?.rate ?? null }; });
  // the pitch of each note buffer, measured (YIN on 100 ms after the attack)
  const pitch = await p.evaluate((notes) => {
    const W = window as Any;
    const yin = (d: Float32Array, sr: number): number => {
      const from = Math.floor(0.03 * sr), N = Math.floor(0.1 * sr), maxLag = Math.ceil(sr / 30), minLag = Math.floor(sr / 800);
      const x = d.subarray(from, from + N + maxLag + 2);
      const diff = new Float64Array(maxLag + 2), cm = new Float64Array(maxLag + 2); cm[0] = 1;
      let run = 0;
      for (let tau = 1; tau <= maxLag + 1; tau++) { let s = 0; for (let i = 0; i < N; i++) { const q = x[i] - x[i + tau]; s += q * q; } diff[tau] = s; run += s; cm[tau] = run ? (s * tau) / run : 1; }
      let tau = -1;
      for (let t = minLag; t <= maxLag; t++) if (cm[t] < 0.12) { while (t + 1 <= maxLag && cm[t + 1] < cm[t]) t++; tau = t; break; }
      if (tau < 0) { tau = minLag; for (let t = minLag; t <= maxLag; t++) if (cm[t] < cm[tau]) tau = t; }
      const y0 = cm[tau - 1], y1 = cm[tau], y2 = cm[tau + 1], den = y0 - 2 * y1 + y2;
      return sr / (tau + (den ? (0.5 * (y0 - y2)) / den : 0));
    };
    const e = W.__eng; const sample = e?.samples?.get('bass');
    return notes.map((n: number) => {
      if (!sample) return { note: n, hz: null };
      // the buffer + rate the engine would play for this note (voiceFor: a render ON the note, or the kit's root buffer)
      const v = W.__AE.voiceFor(sample, { sampleId: 'bass', notes: [n] }, 0, e.notes);
      const hz = yin(v.buffer.getChannelData(0), v.buffer.sampleRate) * v.rate;
      return { note: n, wantHz: +(440 * Math.pow(2, (n - 69) / 12)).toFixed(2), hz: +hz.toFixed(2), midi: +(69 + 12 * Math.log2(hz / 440)).toFixed(2), rate: v.rate, from: v.buffer === sample.buffer ? 'the kit\'s bass (its root)' : 'a render on the note', len: v.buffer.length, sr: v.buffer.sampleRate };
    });
  }, distinct);
  R.numbers.phone.melodyPlayed = { passes: passes.map((ps) => ps.map((e: Any) => `${e.step + 1}:${e.note !== null ? NOTE_NAME(e.note) : '—'}`).join(' ')), paired: paired.slice(0, 16), pitch };
  const wantPass = Object.entries(MELODY).map(([s, n]) => `${Number(s) + 1}:${NOTE_NAME(n)}`).join(' ');
  check('PLAY: the engine scheduled the painted line on every pass (step:note), each as its own note render at rate 1',
    fullPasses.length >= 2 && fullPasses.every((ps) => ps.map((e: Any) => `${e.step + 1}:${NOTE_NAME(e.note)}`).join(' ') === wantPass) && paired.every((x: Any) => x.sourceTag === `bass#${x.note}` && x.rate === 1 && x.sourceRate === 1),
    { fullPasses: fullPasses.length, pass1: R.numbers.phone.melodyPlayed.passes[0], unmatchedSources: paired.filter((x: Any) => x.sourceTag !== `bass#${x.note}`).length }, `≥ 2 passes of ${wantPass}`);
  check('the note buffers sound their notes (YIN pitch within ±0.3 semitone of the scheduled MIDI note)', pitch.every((x: Any) => x.hz && Math.abs(x.midi - x.note) <= 0.3), pitch.map((x: Any) => `${NOTE_NAME(x.note)} ${x.wantHz}→${x.hz} Hz`), '±0.3 st');

  // ── the mixer (phone) ──
  await tap(p.locator('[data-qa="note-close"]'));
  await tap(qa(p, 'mixer-toggle'));
  await qa(p, 'mixer').waitFor({ timeout: 5000 });
  const ms = async (sel: string) => { const b = await p.locator(sel).first().boundingBox(); return b ? { w: round(b.width, 1), h: round(b.height, 1) } : null; };
  const mixSizes = { mute: await ms('[data-qa="strip-mute"]'), solo: await ms('[data-qa="strip-solo"]') };
  const ovMix = await overflow(p);
  R.numbers.phone.mixer = { sizes: mixSizes, strips: await p.locator('[data-qa="mixer-strip"]').count(), overflow: ovMix };
  await scrollToQa(p, 'mixer', 8);
  await frame(p, 'phone-mixer');
  check('PHONE mixer: M / S ≥ 40 × 40, no sideways scroll with it open', !!mixSizes.mute && mixSizes.mute.w >= 40 && mixSizes.mute.h >= 40 && !!mixSizes.solo && mixSizes.solo.w >= 40 && flat(ovMix), R.numbers.phone.mixer, '≥ 40, flat');

  // ── the booth, armed, the meter reading the (fake) mic ──
  await scrollToQa(p, 'record-booth', 120);
  await tap(qa(p, 'booth-arm'));
  await qa(p, 'mic-on').waitFor({ timeout: 15000 });
  // screenshot while a click is fresh on the meter: wait for the newest block to carry one
  await p.waitForFunction(() => ((window as Any).__FEL_BOOTH__?.peakDb ?? -90) > -6, undefined, { timeout: 8000, polling: 10 }).catch(() => R.notes.push('phone booth: no click seen on the meter in 8 s'));
  await p.waitForTimeout(60);
  const meter = await p.evaluate(() => { const m = document.querySelector('[data-qa="input-meter"]'); const bar = m?.querySelector('div') as HTMLElement | null; return { text: m?.textContent ?? null, barWidth: bar?.style.width ?? null, boothRecentPeakDb: +((window as Any).__FEL_BOOTH__?.recentPeakDb ?? -90).toFixed(1) }; });
  await frame(p, 'phone-booth-armed');
  const ovAll = await overflow(p);
  const boothBox = (await qa(p, 'record-booth').boundingBox())!;
  R.numbers.phone.booth = { meter, boothRight: round(boothBox.x + boothBox.width, 1), overflowAllOpen: ovAll, settings: await p.evaluate(() => (window as Any).__FEL_BOOTH__?.settings ?? null) };
  check('PHONE booth ARMED: MIC ON, the meter reads the fake mic\'s clicks, the booth fits, no sideways scroll with grid + mixer + booth open', parseFloat(meter.barWidth ?? '0') > 0 && meter.boothRecentPeakDb > -20 && boothBox.x + boothBox.width <= 375.5 && flat(ovAll), R.numbers.phone.booth, 'meter > 0, fits, flat');
  await tap(qa(p, 'booth-close'));
  await p.waitForTimeout(300);
  await ctx.close();
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// DESKTOP
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
async function stroke(p: Page, row: string, from: number, to: number): Promise<void> {
  const a = await center(p, cell(p, row, from)), b = await center(p, cell(p, row, to));
  await p.mouse.move(a.x, a.y); await p.mouse.down();
  await p.mouse.move(b.x, b.y, { steps: Math.max(8, Math.abs(to - from) * 2) });
  await p.mouse.up();
  await p.waitForTimeout(80);
}
const transportBtn = (p: Page) => p.locator('[data-qa="transport"] button').first();
const running = (p: Page): Promise<boolean> => p.evaluate(() => !!(window as Any).__eng?.isRunning);

async function desktop(browser: Browser): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['microphone'] });
  await ctx.addInitScript(INIT);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => R.pageErrors.push(`desktop: ${e.message}`));
  p.on('framenavigated', (f) => { if (f === p.mainFrame() && R.numbers.desktopOpened) R.notes.push(`desktop page navigated mid-run: ${f.url()}`); });
  await openRoom(p);
  R.numbers.desktopOpened = true;
  const rows = await p.evaluate(() => [...document.querySelectorAll('[data-qa="grid-row"]')].map((r) => (r as HTMLElement).dataset.row));
  const dbox = (await cell(p, 'kick', 0).boundingBox())!;
  const perRow = await p.locator('[data-qa="cell"][data-row="kick"]').count();
  const ovD = await overflow(p);
  R.numbers.desktop = { rows, cell: { w: round(dbox.width, 1), h: round(dbox.height, 1), perRow }, overflow: ovD };
  check('DESKTOP 1280: 16 columns, 8 rows at THE STUDIO tier, no sideways scroll', perRow === 16 && rows.length >= 8 && flat(ovD), R.numbers.desktop, '16, 8, flat');

  // a beat: kick quarters, snare 2 & 4, hat eighths, a bass line
  for (const s of [0, 4, 8, 12]) await cell(p, 'kick', s).click();
  for (const s of [4, 12]) await cell(p, 'snare', s).click();
  for (const s of [0, 2, 4, 6, 8, 10, 12, 14]) await cell(p, 'hat', s).click();
  for (const s of [0, 3, 6, 10]) await cell(p, 'bass', s).click();
  await p.evaluate(() => scrollTo(0, 0));
  await frame(p, 'desktop-grid');

  // ── SOLO ── (first one bar with no solo, so every row's strip exists and has sounded: the contrast)
  await qa(p, 'mixer-toggle').click();
  await qa(p, 'mixer').waitFor({ timeout: 5000 });
  await p.evaluate(() => { (window as Any).__noteLog.length = 0; (window as Any).__srcLog.length = 0; });
  await transportBtn(p).click();
  const preMax: Record<string, number> = {};
  const tPre = Date.now() + (BAR + 0.3) * 1000;
  while (Date.now() < tPre) { const m = await p.evaluate(() => (window as Any).__eng?.meters?.() ?? null); if (m) for (const [id, v] of Object.entries(m.channels as Record<string, Any>)) preMax[id] = Math.max(preMax[id] ?? 0, v.peak); await p.waitForTimeout(40); }
  await transportBtn(p).click();
  await p.waitForTimeout(1300);   // every tail rung out (the kick is 0.55 s) before the solo's reading starts
  R.numbers.preSolo = await p.evaluate(() => { const W = window as Any; const heard: Record<string, number> = {}; for (const e of W.__noteLog) if (e.heard) heard[e.id] = (heard[e.id] ?? 0) + 1; return { heard }; });
  R.numbers.preSolo.channelMeterPeakDb = Object.fromEntries(Object.entries(preMax).map(([k, v]) => [k, v > 0 ? round(20 * Math.log10(v), 1) : null]));
  await p.locator('[data-qa="mixer-strip"][data-row="snare"] [data-qa="strip-solo"]').click();
  await p.waitForTimeout(300);
  const silentMarks = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-qa="grid-row"]')].map((r) => [(r as HTMLElement).dataset.row, (r as HTMLElement).dataset.silent || ''])));
  await p.evaluate(() => { (window as Any).__noteLog.length = 0; (window as Any).__srcLog.length = 0; });
  await scrollToQa(p, 'mixer', 8);
  await transportBtn(p).click();
  const meterMax: Record<string, number> = {};
  let masterMax = 0;
  let shot = false;
  const tEnd = Date.now() + (2 * BAR + 0.4) * 1000;
  while (Date.now() < tEnd) {
    // the frame mid-play, as a snare hit lands (the strip and master meters moving, the other strips still)
    if (!shot && Date.now() > tEnd - (BAR + 0.4) * 1000 && (await p.evaluate(() => ((window as Any).__eng?.meters?.()?.channels?.snare?.peak ?? 0) > 0.05))) { await frame(p, 'desktop-mixer-solo'); shot = true; }
    const m = await p.evaluate(() => (window as Any).__eng?.meters?.() ?? null);
    if (m) {
      for (const [id, v] of Object.entries(m.channels as Record<string, Any>)) meterMax[id] = Math.max(meterMax[id] ?? 0, v.peak);
      masterMax = Math.max(masterMax, m.master.l.peak, m.master.r.peak);
    }
    await p.waitForTimeout(40);
  }
  await transportBtn(p).click();
  await p.waitForTimeout(250);
  const soloRun = await p.evaluate(() => {
    const W = window as Any;
    const heard: Record<string, number> = {}, written: Record<string, number> = {};
    for (const e of W.__noteLog) { written[e.id] = (written[e.id] ?? 0) + 1; if (e.heard) heard[e.id] = (heard[e.id] ?? 0) + 1; }
    const started: Record<string, number> = {};
    for (const e of W.__srcLog) if (e.k === 'start') { const k = e.tag ? String(e.tag).split('#')[0] : `untagged:${e.len}`; started[k] = (started[k] ?? 0) + 1; }
    return { written, heard, started, engineMixer: W.__eng?.mixerState };
  });
  R.numbers.solo = { silentMarks, ...soloRun, channelMeterPeakDb: Object.fromEntries(Object.entries(meterMax).map(([k, v]) => [k, v > 0 ? round(20 * Math.log10(v), 1) : -Infinity])), masterPeakDb: masterMax > 0 ? round(20 * Math.log10(masterMax), 1) : null };
  const onlySnare = (o: Record<string, number>) => Object.keys(o).filter((k) => !k.startsWith('untagged')).every((k) => k === 'snare') && (o.snare ?? 0) > 0;
  check('SOLO snare: the engine lets ONLY the snare sound (hears), starts only snare sources, and only the snare channel meter moves',
    onlySnare(soloRun.heard) && onlySnare(soloRun.started) && (meterMax.snare ?? 0) > 0 && Object.entries(meterMax).every(([k, v]) => k === 'snare' || k === 'takes' || v === 0)
      && Object.entries(silentMarks).every(([k, v]) => (k === 'snare' ? v === '' : v === 'solo')),
    { written: soloRun.written, heard: soloRun.heard, started: soloRun.started, meters: R.numbers.solo.channelMeterPeakDb, silentMarks }, 'snare only');
  if (!shot) { await scrollToQa(p, 'mixer', 8); await frame(p, 'desktop-mixer-solo'); R.notes.push('solo frame taken after STOP (no snare peak caught mid-play)'); }
  await p.locator('[data-qa="mixer-strip"][data-row="snare"] [data-qa="strip-solo"]').click();
  await p.waitForTimeout(200);

  // ── THE FULL 8-TRACK TEST PATTERN, published through the room's button ──
  await p.evaluate(() => scrollTo(0, 0));
  await qa(p, 'clear').click(); await qa(p, 'clear-yes').click();
  await p.waitForFunction(() => document.querySelectorAll('[data-qa="cell"][data-on="1"]').length === 0, undefined, { timeout: 5000 }).catch(() => R.notes.push('CLEAR: cells still lit after 5 s'));
  await p.waitForTimeout(200);
  const kitRows = ['kick', 'snare', 'hat', 'open', 'clap', 'bass', 'lead', 'fx'];
  for (const r of kitRows) if (rows.includes(r)) await stroke(p, r, 0, 15);
  // a stroke that crossed a gap leaves a cell: tap the unlit ones (a stroke from an unlit cell only paints ON)
  for (const r of kitRows) for (let s = 0; s < 16; s++) if (!(await on(p, r)).includes(s)) await cell(p, r, s).click();
  const lit = Object.fromEntries(await Promise.all(kitRows.map(async (r) => [r, (await on(p, r)).length])));
  R.numbers.fullPattern = { lit };
  check('FULL: all 8 kit rows lit on all 16 steps', kitRows.every((r) => lit[r] === 16), lit, '8 × 16');
  // the live master while it plays (what you hear): peak over one bar
  await p.evaluate(() => { (window as Any).__srcLog.length = 0; });
  await transportBtn(p).click();
  let liveMaster = 0, liveLimit = 0;
  const tl = Date.now() + (BAR + 0.3) * 1000;
  while (Date.now() < tl) { const m = await p.evaluate(() => (window as Any).__eng?.meters?.() ?? null); if (m) { liveMaster = Math.max(liveMaster, m.master.l.peak, m.master.r.peak); liveLimit = Math.min(liveLimit, m.limiterDb); } await p.waitForTimeout(30); }
  await transportBtn(p).click(); await p.waitForTimeout(300);
  const publishOnce = async (title: string): Promise<Any[]> => {
    await p.evaluate(() => { (window as Any).__renders.length = 0; });
    await p.getByPlaceholder('track title…').fill(title);
    await p.getByRole('button', { name: 'PUBLISH TO LIBRARY' }).click();
    await p.waitForFunction(() => (window as Any).__renders.length >= 2, undefined, { timeout: 60000, polling: 100 }).catch(() => R.notes.push(`publish "${title}": no render captured in 60 s`));
    await p.waitForTimeout(600);
    return p.evaluate(() => (window as Any).__renders.slice());
  };
  const offRenders = await publishOnce('P4 live FULL 8x16');
  const libLine1 = await qa(p, 'library-line').textContent().catch(() => null);
  const masterBtn = p.getByRole('button', { name: /^MASTER (ON|OFF)$/ });
  await masterBtn.click(); await p.waitForTimeout(250);
  const masterState = await masterBtn.textContent();
  const onRenders = await publishOnce('P4 live FULL 8x16 MASTER');
  await masterBtn.click(); await p.waitForTimeout(200);
  R.numbers.render = { masterOff: offRenders, masterOn: { button: masterState, renders: onRenders }, libraryLine: libLine1, liveMasterPeakDb: liveMaster > 0 ? round(20 * Math.log10(liveMaster), 2) : null, liveLimiterPullDb: round(liveLimit, 2) };
  const fl = [...offRenders, ...onRenders].filter((r: Any) => r.kind === 'float');
  const wv = [...offRenders, ...onRenders].filter((r: Any) => r.kind === 'wav');
  check('RENDER (PUBLISH, the room\'s own path): the FULL 8-track pattern peaks ≤ −0.3 dBFS — float render and the 16-bit WAV, MASTER off and on',
    fl.length === 2 && wv.length === 2 && fl.every((r: Any) => r.peakDb <= -0.3 + 1e-4 && r.overMinus03 === 0) && wv.every((r: Any) => r.peakDb <= -0.3 + 0.001),
    { float: fl.map((r: Any) => ({ polished: r.polished, peakDb: round(r.peakDb, 3), over: r.overMinus03, tracks: r.tracks.length })), wav: wv.map((r: Any) => ({ peakDb: round(r.peakDb, 3), fullScale: r.fullScaleSamples })) }, '≤ −0.3 dBFS, 0 samples over');
  check('LIVE: the same pattern playing peaks ≤ −0.3 dBFS on the master meter (what you hear = what you export)', liveMaster > 0 && 20 * Math.log10(liveMaster) <= -0.3 + 0.01, { liveMasterPeakDb: R.numbers.render.liveMasterPeakDb, limiterPullDb: R.numbers.render.liveLimiterPullDb }, '≤ −0.3');
  // read the track volumes for the P1 render (same pattern, same levels)
  R.numbers.fullPattern.volumes = await p.evaluate(() => Object.fromEntries(((window as Any).__eng?.state?.tracks ?? []).map((t: Any) => [t.sampleId, t.volume])));
  R.numbers.fullPattern.swing = await p.evaluate(() => (window as Any).__eng?.state?.swing);
  R.numbers.fullPattern.kitRate = await p.evaluate(() => (window as Any).__eng?.ctx?.sampleRate);
  await qa(p, 'clear').click(); await qa(p, 'clear-yes').click();
  await p.waitForFunction(() => document.querySelectorAll('[data-qa="cell"][data-on="1"]').length === 0, undefined, { timeout: 5000 }).catch(() => undefined);
  await p.waitForTimeout(200);
  // under the take: kick quarters and a 16th hat (so hits are always queued ahead: STOP has something to take back)
  for (const s of [0, 4, 8, 12]) await cell(p, 'kick', s).click();
  await stroke(p, 'hat', 0, 15);

  // ── THE TAKE ──
  await scrollToQa(p, 'record-booth', 120);
  await qa(p, 'booth-loop').selectOption('2');
  await qa(p, 'booth-from').selectOption('0');
  await qa(p, 'booth-length').selectOption('1');
  await qa(p, 'booth-countin').selectOption('1');
  const take1 = await recordAimedTake(p, 'take1', true);
  R.numbers.take1 = take1;
  if (take1.ok) {
    check('TAKE on the bar: the click aimed at bar + L lands ≤ 10 ms from the take\'s bar line (first transient)', Math.abs(take1.offsetMs) <= 10, { offsetMs: take1.offsetMs, aimResidualMs: take1.aimResidualMs, cutErrorFrames: take1.cutErrorFrames, latencyMs: take1.latencyMs }, '|offset| ≤ 10 ms');
    check('the take is cut exactly where the click entered the graph (0 frames slip), from a bar line of the running song + L', take1.cutErrorFrames === 0 && Math.abs(take1.barLineErrMs) < 0.01 && Math.abs(take1.startFrameErrFrames) <= 1 && take1.gaps === 0,
      { cutErrorFrames: take1.cutErrorFrames, barLineErrMs: take1.barLineErrMs, startFrameErrFrames: take1.startFrameErrFrames, gaps: take1.gaps }, '0 / 0 / ≤ 1 / 0');
  } else check('TAKE on the bar', false, take1, 'a take');

  // LOOP, then STOP mid-pass
  if (take1.ok) {
    const takeTag = `take:${take1.id}`;
    await p.waitForTimeout(Math.round(4.2 * BAR * 1000));
    const loopStarts = await p.evaluate((tag) => (window as Any).__srcLog.filter((e: Any) => e.k === 'start' && e.tag === tag).map((e: Any) => e.when), takeTag);
    const gaps = loopStarts.slice(1).map((w: number, i: number) => round((w - loopStarts[i]) / BAR, 5));
    const fromBar = loopStarts.map((w: number) => round(((w - take1.barTime) / BAR), 5));
    R.numbers.loop = { starts: loopStarts, gapsBars: gaps, barsFromTakeBar: fromBar };
    check('LOOP: the take plays on every pass of its bar (every 2 bars), each on a bar line (≤ 0.01 ms)', loopStarts.length >= 2 && gaps.every((g: number) => Math.abs(g - 2) < 1e-4) && fromBar.every((b: number) => Math.abs(b - Math.round(b)) * BAR * 1000 < 0.01),
      { passes: loopStarts.length, gapsBars: gaps }, '≥ 2 passes, 2 bars apart');
    // STOP inside a pass
    await p.waitForFunction((tag) => { const W = window as Any; const s = W.__srcLog.filter((e: Any) => e.k === 'start' && e.tag === tag); const l = s[s.length - 1]; const now = W.__eng.ctx.currentTime; return l && now > l.when + 0.25 && now < l.when + 1.2 && W.__srcLog.some((e: Any) => e.k === 'start' && e.when > now + 0.01); }, takeTag, { timeout: 12000, polling: 20 }).catch(() => R.notes.push('STOP: no mid-pass moment found'));
    // the press itself, in the page: the audio clock read in the same task as the click (a Playwright click adds ~70 ms
    // of its own round trip between "now" and the press)
    const pressed = await p.evaluate(() => { const W = window as Any; const m = W.__eng.meters(); const t = W.__eng.ctx.currentTime; (document.querySelector('[data-qa="transport"] button') as HTMLButtonElement).click(); return { t, takesPeak: m.channels.takes?.peak ?? 0 }; });
    const stopAt = pressed.t;
    const takesBeforeDb = round(20 * Math.log10(Math.max(pressed.takesPeak, 1e-9)), 1);
    const silence: Any[] = [];
    const ts = Date.now();
    while (Date.now() - ts < 2600) {
      const m = await p.evaluate(() => { const W = window as Any; const x = W.__eng.meters(); return { t: W.__eng.ctx.currentTime, l: x.master.l.peak, r: x.master.r.peak, takes: x.channels.takes?.peak ?? 0 }; });
      silence.push({ afterMs: Math.round((m.t - stopAt) * 1000), masterDb: round(20 * Math.log10(Math.max(m.l, m.r, 1e-9)), 1), takesDb: round(20 * Math.log10(Math.max(m.takes, 1e-9)), 1) });
      await p.waitForTimeout(25);
    }
    const stopLog = await p.evaluate(([tag, t]) => {
      const W = window as Any;
      const L = W.__srcLog;
      const starts = L.filter((e: Any) => e.k === 'start');
      const stops = L.filter((e: Any) => e.k === 'stop');
      const lastTake = [...starts].reverse().find((e: Any) => e.tag === tag);
      const takeStop = lastTake ? stops.find((s: Any) => s.id === lastTake.id && s.when >= lastTake.when) : null;
      // every source scheduled to begin after the press must have been stopped at (or before) the press
      const pending = starts.filter((e: Any) => e.when > (t as number) + 0.002);
      const unstopped = pending.filter((e: Any) => !stops.some((s: Any) => s.id === e.id && s.when <= (t as number) + 0.05));
      const startedAfter = starts.filter((e: Any) => e.now > (t as number) + 0.06);
      return { lastTakeStart: lastTake?.when ?? null, takeStopWhen: takeStop?.when ?? null, pendingAtStop: pending.length, unstopped: unstopped.length, sourcesStartedAfterStop: startedAfter.length, running: !!W.__eng.isRunning };
    }, [takeTag, stopAt] as const);
    const takesSilentAt = silence.find((s) => s.takesDb <= -120)?.afterMs ?? null;
    const firstQuiet = silence.find((s) => s.masterDb <= -60);
    const firstZero = silence.find((s) => s.masterDb <= -120);
    R.numbers.stop = { stopPressedAt: stopAt, takesMeterAtPressDb: takesBeforeDb, takesStripSilentAfterMs: takesSilentAt, ...stopLog, takeStoppedMsAfterPress: stopLog.takeStopWhen !== null ? round((stopLog.takeStopWhen - stopAt) * 1000, 1) : null, meterAfterStop: silence, firstBelowMinus60DbAfterMs: firstQuiet?.afterMs ?? null, firstDigitalSilenceAfterMs: firstZero?.afterMs ?? null };
    check('STOP: the sounding take is stopped at the press (≤ 60 ms), every pending source is taken back, nothing starts after, the transport is off',
      stopLog.takeStopWhen !== null && stopLog.takeStopWhen - stopAt < 0.06 && stopLog.unstopped === 0 && stopLog.sourcesStartedAfterStop === 0 && !stopLog.running,
      { takeStoppedMsAfterPress: R.numbers.stop.takeStoppedMsAfterPress, pendingAtStop: stopLog.pendingAtStop, unstopped: stopLog.unstopped, startedAfter: stopLog.sourcesStartedAfterStop }, 'stopped, 0, 0');
    check('STOP → silence: the take (sounding at the press) is digital silence on its strip within one meter window, the master falls to digital silence as the drum tails ring out',
      takesBeforeDb > -40 && takesSilentAt !== null && takesSilentAt <= 120 && !!firstQuiet && !!firstZero,
      { takesMeterAtPressDb: takesBeforeDb, takesStripSilentAfterMs: takesSilentAt, masterBelowMinus60AfterMs: R.numbers.stop.firstBelowMinus60DbAfterMs, masterDigitalSilenceAfterMs: R.numbers.stop.firstDigitalSilenceAfterMs, last: silence[silence.length - 1] }, 'takes > −40 dB at the press → −∞ by ≤ 120 ms; master → −∞');
  }

  // ── CHECK MY TIMING: 8 taps 75 ms late (with a few ms of human jitter) ──
  // (the room refuses a check while the booth's mic is open — "Close the mic first": the check stops the transport)
  await qa(p, 'booth-close').click().catch(() => undefined);
  await p.waitForTimeout(300);
  await p.evaluate(() => scrollTo(0, 0));
  const offBefore = await p.evaluate(() => ({ off: localStorage.getItem('fel.audioOffsetMs'), at: localStorage.getItem('fel.audioOffsetMeasuredAt') }));
  await qa(p, 'timing-check').click();
  await p.waitForFunction(() => (window as Any).__FEL_GRID__?.check === 'listening' && ((window as Any).__FEL_GRID__?.checkClicks?.length ?? 0) >= 8, undefined, { timeout: 8000 });
  const JIT = [-8, 5, -3, 9, -6, 2, 7, -4];
  const tapped = await p.evaluate(async (jit) => {
    const W = window as Any;
    // the room's read clicks: the last 8 of the count-in, already AS HEARD (scheduled + the desk's delay, heardClicks)
    const clicks: number[] = W.__FEL_GRID__.checkClicks;
    const all = clicks.length;
    const g: number = W.__FEL_GRID__.graphLatencySec ?? 0;
    const at: number[] = [];
    for (let i = 0; i < clicks.length; i++) {
      const target = clicks[i] + 0.075 + jit[i] / 1000;
      while (W.__eng.ctx.currentTime < target) await new Promise((r) => setTimeout(r, 1));
      at.push(W.__eng.ctx.currentTime - clicks[i]);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }));
    }
    return { clicksRead: all, clicks, graphLatencySec: g, tapLateMs: at.map((x) => Math.round(x * 10000) / 10) };
  }, JIT);
  await p.waitForTimeout(700);
  const result = await qa(p, 'timing-result').textContent().catch(() => null);
  const stored = await p.evaluate(() => ({ off: localStorage.getItem('fel.audioOffsetMs'), at: localStorage.getItem('fel.audioOffsetMeasuredAt') }));
  const shown = await qa(p, 'timing-offset').textContent().catch(() => null);
  const meanLate = tapped.tapLateMs.reduce((a: number, b: number) => a + b, 0) / tapped.tapLateMs.length;
  R.numbers.calibration = { before: offBefore, tapped, meanTapLateMs: round(meanLate, 2), result, stored, shown, savedGrid: await p.evaluate(() => (window as Any).__FEL_GRID__?.savedOffsetMs ?? null) };
  check('CHECK MY TIMING: 8 taps (mean ≈ +75 ms late) compute +75 ms (25 ms snap), SAVED dated, shown in the transport',
    stored.off === '75' && !!stored.at && /\+75 ms/.test(result ?? '') && /\+75 ms/.test(shown ?? ''), { meanTapLateMs: R.numbers.calibration.meanTapLateMs, result, stored, shown }, "'+75 ms', stored 75 + a date");
  await p.waitForTimeout(300);
  await frame(p, 'desktop-timing');

  // ── take 2: the booth now reads the calibration (L = 75 ms + the desk + the mic) ──
  await scrollToQa(p, 'record-booth', 120);
  const take2 = await recordAimedTake(p, 'take2', false);
  R.numbers.take2 = take2;
  if (take2.ok) {
    check('TAKE 2 after the check: the booth\'s L comes from the calibration, and the click aimed at bar + L again lands ≤ 10 ms from its bar',
      take2.latency?.outFrom === 'calibration' && Math.abs(take2.offsetMs) <= 10 && take2.cutErrorFrames === 0,
      { outFrom: take2.latency?.outFrom, latencyMs: take2.latencyMs, offsetMs: take2.offsetMs, aimResidualMs: take2.aimResidualMs, cutErrorFrames: take2.cutErrorFrames }, 'calibration, ≤ 10 ms, 0 frames');
  } else check('TAKE 2 after the check', false, take2, 'a take');
  if (await running(p)) { await transportBtn(p).click(); await p.waitForTimeout(300); }
  await scrollToQa(p, 'record-booth', 120);
  await frame(p, 'desktop-booth-takes');
  await qa(p, 'booth-close').click().catch(() => undefined);
  await p.waitForTimeout(300);
  await ctx.close();
}

/**
 * ARM, learn the fake mic's click phase on the audio clock, start the room's transport so a bar line + L meets a click
 * (retrying until the audio clock's 5.33 ms quantum lands within 1.5 ms), RECORD over the playing song, cut, measure.
 */
async function recordAimedTake(p: Page, name: string, frameArmed: boolean): Promise<Any> {
  await qa(p, 'booth-arm').click();
  await qa(p, 'mic-on').waitFor({ timeout: 15000 });
  await p.waitForTimeout(300);
  if (!(await startDetector(p))) return { ok: false, why: 'no mic source to tap' };
  await p.waitForFunction(() => ((window as Any).__onsets?.length ?? 0) >= 3, undefined, { timeout: 15000, polling: 50 }).catch(() => undefined);
  const on0 = await p.evaluate(() => (window as Any).__onsets.slice());
  if (on0.length < 3) return { ok: false, why: `only ${on0.length} clicks heard on the fake mic in 15 s`, onsets: on0 };
  const periods = on0.slice(1).map((o: Any, i: number) => o.frame - on0[i].frame);
  if (frameArmed) {
    await p.waitForFunction(() => ((window as Any).__FEL_BOOTH__?.peakDb ?? -90) > -6, undefined, { timeout: 6000, polling: 10 }).catch(() => undefined);
    await p.waitForTimeout(60);
    await frame(p, 'desktop-booth-armed');
  }
  const L = await p.evaluate(() => (window as Any).__FEL_BOOTH__?.latency ?? null);
  if (!L) return { ok: false, why: 'the booth reports no latency' };
  // aim: songStart ≡ click − L (mod bar); PLAY is pressed START_LEAD (0.05 s) earlier on the audio clock
  let aim: Any = null;
  for (let attempt = 1; attempt <= 14; attempt++) {
    aim = await p.evaluate(async ([Ls, bar]) => {
      const W = window as Any;
      const ctx: AudioContext = W.__eng.ctx; const sr = ctx.sampleRate;
      const on = W.__onsets; const last = on[on.length - 1];
      const per = on.length > 1 ? (last.frame - on[0].frame) / (on.length - 1) / sr : bar;
      const lastSec = last.frame / sr;
      let n = Math.ceil((ctx.currentTime + 0.25 + (Ls as number) - lastSec) / per);
      let songStart = lastSec + n * per - (Ls as number);
      while (songStart - 0.05 < ctx.currentTime + 0.15) { n++; songStart += per; }
      const pressAt = songStart - 0.05;
      while (ctx.currentTime < pressAt - 0.0027) await new Promise((r) => setTimeout(r, 0));
      const btn = document.querySelector('[data-qa="transport"] button') as HTMLButtonElement;
      const nowAtPress = ctx.currentTime;
      btn.click();
      const got = W.__eng.songStartSec;
      return { wantSongStart: songStart, gotSongStart: got, nowAtPress, residualMs: (songStart - got) * 1000, periodSec: per, lastClickSec: lastSec };
    }, [L.totalSec, BAR] as const);
    aim.attempt = attempt;
    // keep a residual in [0, 1.5] ms: the click then enters at (or just after) the take's first frame, so its first
    // sample is IN the take (a click a fraction of a ms before the cut would leave only its ring to read)
    if (aim.residualMs >= 0 && aim.residualMs <= 1.5) break;
    await transportBtn(p).click();   // STOP, and try the next click
    await p.waitForTimeout(200);
  }
  // RECORD over the playing song (count-in 1 bar into the next bar 0 of the 2-bar loop)
  const takesBefore = await p.evaluate(() => (window as Any).__FEL_BOOTH__?.takes ?? 0);
  await qa(p, 'booth-record').click();
  await p.waitForFunction((n) => ((window as Any).__FEL_BOOTH__?.takes ?? 0) > (n as number) && (window as Any).__FEL_BOOTH__?.phase === 'armed', takesBefore, { timeout: 25000, polling: 50 }).catch(() => undefined);
  const b = await p.evaluate(() => { const x = (window as Any).__FEL_BOOTH__; return { lastTake: x?.lastTake ?? null, latency: x?.latency ?? null, takes: x?.takes ?? 0 }; });
  const lt = b.lastTake;
  if (!lt || b.takes <= takesBefore) return { ok: false, why: 'no take was kept', aim, booth: b };
  const m = await p.evaluate(([id, startFrame]) => {
    const W = window as Any;
    const t = (W.__eng.takeList as Any[]).find((x) => x.id === id);
    if (!t) return null;
    const d: Float32Array = t.buffer.getChannelData(0);
    let idx = -1; for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.3) { idx = i; break; }
    let peak = 0; for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    // the click the detector saw nearest the cut's start (the same MediaStreamSource node)
    const near = W.__onsets.map((o: Any) => o.frame).filter((f: number) => f >= (startFrame as number) - 24000 && f < (startFrame as number) + d.length).sort((a: number, b: number) => Math.abs(a - (startFrame as number)) - Math.abs(b - (startFrame as number)))[0] ?? null;
    return { idx, len: d.length, sr: t.buffer.sampleRate, peak, detectorClickFrame: near, songStart: W.__eng.songStartSec };
  }, [lt.id, lt.startFrame] as const);
  if (!m) return { ok: false, why: 'the take is not in the engine', lastTake: lt };
  const sr = m.sr;
  const barIndex = Math.round((lt.startTime - m.songStart) / BAR);
  const expectedIdx = m.detectorClickFrame !== null ? m.detectorClickFrame - lt.startFrame : null;
  const out = {
    ok: true, name, id: lt.id, latency: b.latency, latencyMs: lt.latencyMs, aim, onsetPeriodsFrames: periods,
    barTime: lt.startTime, songStartSec: m.songStart, takeBarIndexInSong: barIndex,
    barLineErrMs: round((lt.startTime - (m.songStart + barIndex * BAR)) * 1000, 4),
    startFrame: lt.startFrame, startFrameErrFrames: lt.startFrame - Math.round((lt.startTime + (b.latency?.totalSec ?? 0)) * sr),
    frames: lt.frames, gaps: lt.gaps, takePeakDb: round(20 * Math.log10(Math.max(m.peak, 1e-9)), 1),
    firstTransientFrame: m.idx, offsetMs: m.idx >= 0 ? round((m.idx / sr) * 1000, 3) : null,
    detectorClickFrame: m.detectorClickFrame, expectedFirstTransientFrame: expectedIdx,
    cutErrorFrames: expectedIdx !== null && m.idx >= 0 ? m.idx - expectedIdx : null,
    aimResidualMs: expectedIdx !== null ? round((expectedIdx / sr) * 1000, 3) : null,
  };
  return out;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// BEFORE: the P1 engine renders the same FULL pattern (about:blank, real OfflineAudioContext)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
async function p1Render(browser: Browser): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p4-live-p1-'));
  try {
    for (const f of ['AudioEngine.ts', 'SynthKit.ts']) fs.writeFileSync(path.join(dir, f), execFileSync(GIT, ['show', `${P1_COMMIT}:FEL-full-app/lib/babylon/music/${f}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 24 }));
    const atAlias: Plugin = { name: 'at', setup(b) { b.onResolve({ filter: /^@\// }, (a) => { const base = path.join(ROOT, a.path.slice(2)); for (const ext of ['.ts', '.tsx', '/index.ts']) if (fs.existsSync(base + ext)) return { path: base + ext }; return { path: base }; }); } };
    const entry = path.join(dir, 'entry.ts');
    fs.writeFileSync(entry, `import { AudioEngine } from './AudioEngine'; import { synthesizeKit, KIT_SLOTS } from './SynthKit'; (window as any).__P1 = { AudioEngine, synthesizeKit, KIT_SLOTS };`);
    const js = (await build({ entryPoints: [entry], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', plugins: [atAlias], logLevel: 'silent' })).outputFiles[0].text;
    const page = await browser.newPage();
    await page.goto('about:blank');
    await page.evaluate('globalThis.__name = (f) => f');
    await page.addScriptTag({ content: js });
    const vols = R.numbers.fullPattern?.volumes ?? {};
    const swing = R.numbers.fullPattern?.swing ?? 0.15;
    const res = await page.evaluate(async ([v, sw, bpm]) => {
      const E = (window as Any).__P1;
      const proto = OfflineAudioContext.prototype as Any; const orig = proto.startRendering; let last: AudioBuffer | null = null;
      proto.startRendering = function () { return orig.call(this).then((b: AudioBuffer) => { last = b; return b; }); };
      const kit = await E.synthesizeKit('street');
      const out: Any[] = [];
      for (const polish of [false, true]) {
        const tracks = E.KIT_SLOTS.map((k: Any) => ({ sampleId: k.id, pattern: Array(16).fill(true), volume: (v as Any)[k.id] ?? 0.8, muted: false, pan: 0 }));
        const eng = new E.AudioEngine({ bpm, steps: 16, tracks, swing: sw });
        for (const k of E.KIT_SLOTS) eng.loadBuffer(k.id, k.name, kit.get(k.id), k.category);
        eng.masterPolish(polish);
        last = null;
        const blob: Blob = await eng.renderMixdown(2);
        const b = last as AudioBuffer | null;
        let peak = 0, over0 = 0;
        if (b) for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) { const x = Math.abs(d[i]); if (x > peak) peak = x; if (x > 1) over0++; } }
        const dv = new DataView(await blob.arrayBuffer()); let wpeak = 0, full = 0; const n = (dv.byteLength - 44) / 2;
        for (let i = 0; i < n; i++) { const s = Math.abs(dv.getInt16(44 + 2 * i, true)); if (s > wpeak) wpeak = s; if (s >= 32767) full++; }
        out.push({ polished: polish, floatPeakDb: 20 * Math.log10(Math.max(peak, 1e-12)), samplesOver0dBFS: over0, wavPeakDb: 20 * Math.log10(Math.max(wpeak, 1) / 32767), wavFullScaleSamples: full, sampleRate: b?.sampleRate ?? null });
        eng.dispose?.();
      }
      proto.startRendering = orig;
      return out;
    }, [vols, swing, BPM] as const);
    R.numbers.p1Render = { commit: P1_COMMIT, how: 'P1 AudioEngine.ts + SynthKit.ts bundled by esbuild, about:blank, STREET kit, 8 rows × 16 steps, 2 bars, the P4 room\'s volumes and swing', results: res };
    // BEFORE, STOP: the P1 engine live (a real AudioContext), a 16th hat + a 2.6 s one-shot take on bar 0 (P1's takes were
    // setOneShots), STOP 1 s in — what is taken back, and what its master (tapped with an analyser) still plays after
    R.numbers.p1Stop = await page.evaluate(async () => {
      const E = (window as Any).__P1;
      const log: Any[] = []; let n = 0;
      const S = AudioBufferSourceNode.prototype as Any; const st = S.start, sp = S.stop;
      S.start = function (this: Any, w = 0, ...r: Any[]) { if (this.__id === undefined) this.__id = ++n; log.push({ k: 'start', id: this.__id, when: w, len: this.buffer?.length ?? 0 }); return st.call(this, w, ...r); };
      S.stop = function (this: Any, w = 0) { if (this.__id === undefined) this.__id = ++n; log.push({ k: 'stop', id: this.__id, when: w }); return sp.call(this, w); };
      const kit = await E.synthesizeKit('street');
      const tracks = E.KIT_SLOTS.map((k: Any) => ({ sampleId: k.id, pattern: Array(16).fill(k.id === 'hat'), volume: 0.8, muted: false, pan: 0 }));
      const eng = new E.AudioEngine({ bpm: 92, steps: 16, tracks, swing: 0.15 });
      for (const k of E.KIT_SLOTS) eng.loadBuffer(k.id, k.name, kit.get(k.id), k.category);
      const ctx: AudioContext = eng.ctx;
      if (ctx.state === 'suspended') await ctx.resume();
      const an = ctx.createAnalyser(); an.fftSize = 2048; eng.master.connect(an);
      const tone = ctx.createBuffer(1, Math.round(ctx.sampleRate * 2.6), ctx.sampleRate);
      const d = tone.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = 0.2 * Math.sin((2 * Math.PI * 330 * i) / ctx.sampleRate);
      eng.setOneShots([{ id: 't', buffer: tone, atBar: 0, gain: 0.9 }]);
      eng.start();
      await new Promise((r) => setTimeout(r, 1000));
      const tStop = ctx.currentTime;
      eng.stop();
      const buf = new Float32Array(2048);
      const peakDb = () => { an.getFloatTimeDomainData(buf); let p = 0; for (const x of buf) p = Math.max(p, Math.abs(x)); return Math.round(20 * Math.log10(Math.max(p, 1e-9)) * 10) / 10; };
      const meter: Any[] = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 2600) { meter.push({ afterMs: Math.round((ctx.currentTime - tStop) * 1000), masterDb: peakDb() }); await new Promise((r) => setTimeout(r, 100)); }
      const take = log.find((e) => e.k === 'start' && e.len === tone.length);
      const takeStopped = take ? log.some((e) => e.k === 'stop' && e.id === take.id) : null;
      const pending = log.filter((e) => e.k === 'start' && e.when > tStop + 0.002);
      const pendingStopped = pending.filter((e) => log.some((x) => x.k === 'stop' && x.id === e.id)).length;
      const lastLoud = [...meter].reverse().find((m) => m.masterDb > -60);
      S.start = st; S.stop = sp;
      eng.dispose?.();
      return { tStop, takeStartedAt: take?.when ?? null, takeEndsAt: take ? take.when + tone.duration : null, takeStoppedByStop: takeStopped, pendingAtStop: pending.length, pendingTakenBack: pendingStopped, masterStillAboveMinus60DbAtMs: lastLoud?.afterMs ?? null, meter: meter.filter((_, i) => i % 3 === 0) };
    });
    await page.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

async function main(): Promise<void> {
  const wav = writeClickWav(WAV);
  R.numbers.fakeMic = { file: WAV, ...wav, how: 'a click (full level on its first sample, 2.5 kHz ring, 8 ms) on each bar line at 92 BPM, a 0.2 330 Hz bed between clicks (under the 0.3 onset threshold); 23 bars = 60.000 s so the loop keeps the bar period' };
  const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${WAV}`];
  const browser = await chromium.launch({ executablePath: chromiumExe(), args: ARGS, headless: true });
  try {
    const which = process.env.ONLY ?? 'phone,desktop,p1';
    if (which.includes('phone')) await phone(browser).catch((e) => { R.notes.push(`phone FATAL: ${String(e?.stack ?? e).slice(0, 800)}`); log('phone FATAL', e); });
    if (which.includes('desktop')) await desktop(browser).catch((e) => { R.notes.push(`desktop FATAL: ${String(e?.stack ?? e).slice(0, 800)}`); log('desktop FATAL', e); });
    if (which.includes('p1')) await p1Render(browser).catch((e) => { R.notes.push(`p1 FATAL: ${String(e?.stack ?? e).slice(0, 800)}`); log('p1 FATAL', e); });
  } finally { await browser.close(); }
  check('no page errors', R.pageErrors.length === 0, R.pageErrors, []);
}

main().catch((e) => { R.fatal = String(e?.stack ?? e); log('FATAL', e); }).finally(() => {
  R.passed = R.checks.filter((c: Any) => c.pass).length; R.total = R.checks.length;
  fs.writeFileSync(`${OUT}/live-proof${process.env.ONLY ? '-' + process.env.ONLY.replace(/,/g, '+') : ''}.json`, JSON.stringify(R, null, 2));
  log(`${R.passed}/${R.total} checks passed → ${OUT}`);
  process.exit(0);
});
