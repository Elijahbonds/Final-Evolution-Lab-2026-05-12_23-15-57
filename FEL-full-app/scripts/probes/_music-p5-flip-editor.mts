// MUSIC-SUITE P5 (2026-09-25), "The Flip, for real" — the chop editor, measured in a browser on the dev-only /dev/music
// route (the real StudioMode, no GameShell, database offline). Every Web Audio source the page starts is logged by an
// init script (its buffer's length / rate / first and last sample, its playbackRate, and whether it reaches the speakers
// beside the desk), so what the player HEARS is read, not inferred:
//   1. a pad plays its BAKED chop (rate 1, faded edges, gated at 1.2 s) through its row's strip — never to the speakers;
//      +12 on the pad halves the buffer;
//   2. SEND + ARM REC: the grid row plays the SAME buffer the pad played (what you tune is what you sequence);
//   3. QUANTIZE: taps 20 ms early / 60 ms late on the audio clock land on the targeted step; QUANTIZE off, 20 ms early
//      lands on the step before;
//   4. the waveform: a mouse drag moves a shared marker for both pads, onto a zero crossing; + SLICE / − SLICE;
//   5. banks: B gets its own source, A keeps its edited slices; a chop kit saved from A loads into C; clearing banks lets
//      their decoded sources go (the room's cache);
//   6. autosave + reload bring back the banks, the kit and the moved marker;
//   7. a section keeps its own chop: re-tuned pad, song mode plays the section's chop, song mode off plays the new one;
//   8. the phone (390 px, touch): a finger drag moves a marker (pointer capture), no sideways scroll, frames.
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p5-flip-editor.mts   (BASE, OUT env override)
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p5/editor';
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p5flip +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), route: '/dev/music', frames: {}, pageErrors: [] as string[], checks: [] as Any[] };
const check = (name: string, pass: boolean, got: unknown, want: unknown) => { R.checks.push({ name, pass, got, want }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(got)); };
const frame = async (p: Page, name: string) => { const path = `${OUT}/p5flip-${name}.png`; await p.screenshot({ path, fullPage: true }); R.frames[name] = path; };
const flip = (p: Page) => p.evaluate(() => (window as Any).__FEL_FLIP__ ?? null);
const qa = (p: Page, id: string) => p.locator(`[data-qa="${id}"]`);
const btn = (p: Page, name: string | RegExp) => p.getByRole('button', { name, exact: typeof name === 'string' }).first();
const audioLog = (p: Page) => p.evaluate(() => ((window as Any).__AUDIO_LOG__ as Any[]).slice());
const clearLog = (p: Page) => p.evaluate(() => { ((window as Any).__AUDIO_LOG__ as Any[]).length = 0; });
const STUDIO_TIER = `try { if (!localStorage.getItem('fel-music-progress')) localStorage.setItem('fel-music-progress', '{"patternsMade":1,"sectionsSaved":2,"chainEntries":2}'); } catch {}`;
// every AudioBufferSourceNode.start: what it plays, and where it goes
const AUDIO_SPY = `(() => {
  const L = []; window.__AUDIO_LOG__ = L;
  const oc = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (d, ...r) { try { this.__to = d; } catch (e) {} return oc.call(this, d, ...r); };
  const os = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when, ...r) {
    try {
      const b = this.buffer, g = this.__to, s = g && g.__to, dst = this.context.destination;
      const d = b ? b.getChannelData(0) : null;
      L.push({ t: this.context.currentTime, when: when || 0, len: b ? b.length : -1, sr: b ? b.sampleRate : 0, rate: this.playbackRate.value,
        first: d ? d[0] : null, last: d ? d[d.length - 1] : null, toSpeakers: g === dst || s === dst, ch: b ? b.numberOfChannels : 0 });
      if (L.length > 4000) L.splice(0, 1000);
    } catch (e) {}
    return os.call(this, when, ...r);
  };
})();`;

async function openFlip(p: Page): Promise<void> {
  await p.goto(`${BASE}/dev/music?stage=studio`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  const start = p.getByRole('button', { name: 'TAP TO START' });
  await start.waitFor({ timeout: 240000 });
  await start.click();
  await p.waitForFunction(() => !!(window as Any).__FEL_GRID__, undefined, { timeout: 60000 });
  await btn(p, 'FLIP').click();
  await qa(p, 'flip-banks').waitFor({ timeout: 30000 });
  await p.waitForTimeout(400);
}
/** Load a pack source from the shelf into the bank on the pads, and wait for it to decode. */
async function loadShelf(p: Page, shelf: string, label: string): Promise<Any> {
  await qa(p, `flip-shelf-${shelf}`).click();
  await btn(p, label).click();
  await p.waitForFunction((l) => { const f = (window as Any).__FEL_FLIP__; return f && f.decoded && f.slices > 0 && (f.banks ?? [])[['A', 'B', 'C', 'D'].indexOf(f.bank)] !== null && document.querySelector('[data-qa="flip-source"]')?.textContent?.includes(l); }, label, { timeout: 60000 });
  await p.waitForTimeout(300);
  return flip(p);
}
const sampleRatio = (f: Any): number => (f.rate && f.liveRate ? f.liveRate / f.rate : 1);
/** The x on the waveform canvas of a sample stored at the bank's rate. */
async function xOf(p: Page, f: Any, stored: number): Promise<{ x: number; y: number; w: number }> {
  await qa(p, 'flip-waveform').scrollIntoViewIfNeeded();
  const box = (await qa(p, 'flip-waveform').boundingBox())!;
  return { x: box.x + (stored * sampleRatio(f)) / f.sourceLength * box.width, y: box.y + box.height / 2, w: box.width };
}
/** Is `at` (decoded samples) on a zero crossing of the room's own decode of the bank's source? */
async function onCrossing(p: Page, key: string, at: number): Promise<{ at: number; around: number[] | null; ok: boolean }> {
  const around = await p.evaluate(([k, a]) => (window as Any).__FEL_FLIP_ROOM__.peek(k, a, 2), [key, at] as const);
  if (!around || around.length < 4) return { at, around, ok: false };
  const [a, b, c] = [around[1], around[2], around[3]];       // samples at-1, at, at+1
  const ok = b === 0 || Math.sign(a) !== Math.sign(b) || Math.sign(b) !== Math.sign(c);
  return { at, around, ok };
}
/** Tap pad 1 `offsetMs` from a scheduled step on the HEARD clock (negative = early); returns the step aimed at and got. */
const TAP = async (p: Page, offsetMs: number): Promise<Any> => p.evaluate(async (off) => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
  const room = (window as Any).__FEL_FLIP_ROOM__;
  for (let i = 0; i < 400; i++) {
    const c = room.clock();
    if (c) {
      const heard = c.now - c.latencySec;
      const lead = (off / 1000);
      const m = c.marks.filter((k: Any) => k.time + lead - heard > 0.035 && k.time + lead - heard < 0.09).pop();
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
const stored = (p: Page) => p.evaluate(() => new Promise<Any>((res) => {
  const pid = (window as Any).__FEL_PROJECT__?.id;
  const r = indexedDB.open('fel-studio', 1);
  r.onsuccess = () => { const db = r.result; const q = db.transaction('projects', 'readonly').objectStore('projects').get(pid); q.onsuccess = () => { db.close(); res(q.result ?? null); }; };
  r.onerror = () => res(null);
}));
async function saved(p: Page): Promise<void> {
  await p.waitForFunction(() => /Saved on this device ·/.test(document.querySelector('[data-qa="save-status"]')?.textContent ?? ''), undefined, { timeout: 8000 }).catch(() => undefined);
}

async function desktop(ctx: BrowserContext): Promise<void> {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => R.pageErrors.push(`desktop: ${e.message}`));
  await openFlip(p);
  // the FEL-theme lesson (the content lane's) may have put the theme on bank A on this first visit: close it if open
  if (await qa(p, 'lesson-close').count()) await qa(p, 'lesson-close').click().catch(() => undefined);
  const a0 = await loadShelf(p, 'loops', 'Pocket Bass');
  R.bankA = { source: a0.source, slices: a0.slices, mode: a0.mode, rate: a0.rate, liveRate: a0.liveRate, length: a0.sourceLength };
  check('a pack loop loads on bank A on its own FEL cuts (slicing "cuts")', a0.bank === 'A' && a0.mode === 'cuts' && a0.slices >= 8, { bank: a0.bank, mode: a0.mode, slices: a0.slices }, 'A / cuts / ≥ 8');
  await frame(p, 'desktop-loaded');

  // ── 1. the pad plays its baked chop, through its strip ──
  await clearLog(p);
  await p.keyboard.press('1'); await p.waitForTimeout(150);
  const s1 = a0.slicesAll[0];
  const want1 = Math.min(Math.round((s1.end - s1.start) * sampleRatio(a0)), Math.round(1.2 * a0.liveRate));
  const hit1 = (await audioLog(p)).filter((e: Any) => e.len > 64).pop();
  check('pad 1: the baked chop at rate 1, edges faded to 0, gated length, through the desk (not the speakers)',
    !!hit1 && hit1.rate === 1 && hit1.first === 0 && Math.abs(hit1.last) < 1e-6 && Math.abs(hit1.len - want1) <= 2 && !hit1.toSpeakers, hit1, { len: want1, rate: 1, first: 0, last: 0, toSpeakers: false });
  // +12 on pad 1: half the buffer (resampled), still rate 1
  await p.getByRole('button', { name: 'pad 1', exact: true }).dispatchEvent('pointerdown');
  await p.waitForTimeout(150);
  await p.locator('input[type="range"][min="-12"]').fill('12');
  await p.waitForTimeout(200);
  await p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());   // pad keys are ignored while a field has focus
  await clearLog(p);
  await p.keyboard.press('1'); await p.waitForTimeout(150);
  const hit12 = (await audioLog(p)).filter((e: Any) => e.len > 64).pop();
  const want12 = Math.min(Math.floor((Math.round((s1.end - s1.start) * sampleRatio(a0)) - 1) / 2) + 1, Math.round(1.2 * a0.liveRate));
  check('pad 1 at +12: the octave is baked in (half the samples, rate 1)', !!hit12 && hit12.rate === 1 && Math.abs(hit12.len - want12) <= 2, { len: hit12?.len, rate: hit12?.rate }, { len: want12, rate: 1 });
  const note = await qa(p, 'flip-pitch-note').textContent().catch(() => null);
  check('the pad says what its row will play', /what you tune is what you sequence/.test(note ?? ''), note, 'what you tune is what you sequence …');

  // ── 2. SEND + ARM REC: the grid row plays the pad's buffer ──
  await qa(p, 'flip-send').click(); await p.waitForTimeout(300);
  const loaded = await p.evaluate(() => (window as Any).__FEL_FLIP_ROOM__.loaded('flip_0'));
  check('SEND TO TRACK: row FLIP 1 has its baked chop in the engine', loaded === true, loaded, true);
  await btn(p, 'ARM REC').click();
  await btn(p, 'PLAY').click();
  await p.waitForTimeout(900);
  // ── 3. QUANTIZE on the audio clock ──
  const early: Any[] = [], late: Any[] = [], off: Any[] = [];
  for (let i = 0; i < 5; i++) { early.push(await TAP(p, -20)); await p.waitForTimeout(150); }
  for (let i = 0; i < 5; i++) { late.push(await TAP(p, 60)); await p.waitForTimeout(150); }
  await qa(p, 'flip-quantize').click(); await p.waitForTimeout(100);
  for (let i = 0; i < 4; i++) { off.push(await TAP(p, -20)); await p.waitForTimeout(150); }
  await qa(p, 'flip-quantize').click();
  R.quantize = { early, late, off };
  check('QUANTIZE on: a tap 20 ms early lands on the step it was aimed at (5 of 5)', early.every((x) => x && x.got === x.aimed), early.map((x) => x && `${x.aimed}→${x.got} (${x.offMs} ms)`), 'aimed = got');
  check('QUANTIZE on: 60 ms late (under half a 16th) lands on the same step (5 of 5)', late.every((x) => x && x.got === x.aimed), late.map((x) => x && `${x.aimed}→${x.got} (${x.offMs} ms)`), 'aimed = got');
  check('QUANTIZE off: 20 ms early lands on the step it falls in (the one before)', off.every((x) => x && x.got === (x.aimed + 15) % 16), off.map((x) => x && `${x.aimed}→${x.got} (${x.offMs} ms)`), 'aimed − 1');
  await btn(p, '● REC ARMED').click();
  await clearLog(p);
  await p.waitForTimeout(2800);                                  // ~1 bar at 92 BPM: the row's hits
  const grid = (await audioLog(p)).filter((e: Any) => e.when > 0 && Math.abs(e.len - hit12.len) <= 1);
  check('the grid row FLIP 1 plays the very buffer the pad played (same length, rate 1)', grid.length >= 3 && grid.every((e: Any) => e.rate === 1 && !e.toSpeakers), { hits: grid.length, lens: [...new Set(grid.map((e: Any) => e.len))], rates: [...new Set(grid.map((e: Any) => e.rate))] }, `≥ 3 hits of ${hit12.len} at rate 1`);
  await btn(p, 'STOP').click(); await p.waitForTimeout(300);
  await frame(p, 'desktop-recorded');

  // ── 4. the waveform: drag pad 2's start (shared with pad 1's end) ──
  const f4 = await flip(p);
  const before = { p1: f4.slicesAll[0], p2: f4.slicesAll[1] };
  const at = await xOf(p, f4, before.p2.start);
  await p.mouse.move(at.x, at.y); await p.mouse.down();
  for (let k = 1; k <= 6; k++) { await p.mouse.move(at.x + k * 5, at.y); await p.waitForTimeout(30); }
  await p.mouse.up(); await p.waitForTimeout(400);
  const f4b = await flip(p);
  const after = { p1: f4b.slicesAll[0], p2: f4b.slicesAll[1] };
  const movedSamples = (after.p2.start - before.p2.start) * sampleRatio(f4b);
  const expectSamples = (30 / at.w) * f4b.sourceLength;
  const cross = await onCrossing(p, `/audio/flip/audio/${f4b.source}.mp3`, Math.round(after.p2.start * sampleRatio(f4b)));
  R.drag = { before, after, movedSamples, expectSamples, cross };
  check('a mouse drag moves the shared marker for both pads (pad 1 ends where pad 2 starts)', after.p1.end === after.p2.start && after.p2.start > before.p2.start, { before, after }, 'both moved together');
  check('…by what the pointer moved (within the 2 ms snap)', Math.abs(movedSamples - expectSamples) <= Math.ceil(0.002 * f4b.liveRate) + f4b.sourceLength / at.w, { movedSamples, expectSamples }, '±2 ms');
  check('…onto a zero crossing of the decoded source', cross.ok, cross, 'a sign change at the cut');
  await frame(p, 'desktop-dragged');
  // + SLICE on pad 2 at the dashed line, then − SLICE
  const n0 = f4b.slices;
  const mid = await xOf(p, f4b, (after.p2.start + after.p2.end) / 2);
  await p.mouse.click(mid.x, mid.y); await p.waitForTimeout(250);
  await qa(p, 'flip-slice-add').click(); await p.waitForTimeout(250);
  const fAdd = await flip(p);
  check('+ SLICE: pad 2 is cut in two; the second half is the first empty pad', fAdd.slices === n0 + 1 && fAdd.slicesAll[1].end === fAdd.slicesAll[fAdd.selected].start, { slices: fAdd.slices, p2: fAdd.slicesAll[1], added: fAdd.selected, addedSlice: fAdd.slicesAll[fAdd.selected] }, `${n0 + 1} slices`);
  await qa(p, 'flip-slice-remove').click(); await p.waitForTimeout(250);
  const fRem = await flip(p);
  check('− SLICE: the new pad goes, its sound back to pad 2', fRem.slices === n0 && fRem.slicesAll[1].end === after.p2.end, { slices: fRem.slices, p2: fRem.slicesAll[1] }, `${n0} slices, pad 2 whole`);

  // ── 5. banks and kits ──
  const aSlices = (await flip(p)).slicesAll;
  await qa(p, 'flip-bank-B').click(); await p.waitForTimeout(250);
  const bEmpty = await flip(p);
  check('bank B starts empty', bEmpty.bank === 'B' && bEmpty.source === null, { bank: bEmpty.bank, source: bEmpty.source }, 'B / none');
  await loadShelf(p, 'loops', 'Night Arp');
  await qa(p, 'flip-bank-A').click(); await p.waitForTimeout(400);
  const backA = await flip(p);
  check('bank A kept its source and its edited slices while B got its own', backA.source === a0.source && JSON.stringify(backA.slicesAll) === JSON.stringify(aSlices) && backA.banks[1] === 'loop_arp_pluck', { a: backA.source, b: backA.banks[1], same: JSON.stringify(backA.slicesAll) === JSON.stringify(aSlices) }, 'A intact, B = Night Arp');
  await qa(p, 'flip-kit-name').fill('Probe kit');
  await qa(p, 'flip-kit-save').click(); await p.waitForTimeout(250);
  await p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await qa(p, 'flip-bank-C').click(); await p.waitForTimeout(250);
  await p.getByRole('button', { name: 'load Probe kit into bank C' }).click();
  await p.waitForFunction(() => (window as Any).__FEL_FLIP__?.decoded, undefined, { timeout: 20000 }).catch(() => undefined);
  const cKit = await flip(p);
  check('a chop kit saved from bank A loads into bank C, slices and all', JSON.stringify(cKit.kits) === '["Probe kit"]' && cKit.banks[2] === a0.source && JSON.stringify(cKit.slicesAll) === JSON.stringify(aSlices), { kits: cKit.kits, c: cKit.banks[2] }, 'Probe kit on C');
  await frame(p, 'desktop-banks-kits');
  const srcBefore = await p.evaluate(() => (window as Any).__FEL_FLIP_ROOM__.sources());
  await qa(p, 'flip-bank-B').click(); await p.waitForTimeout(250);
  await qa(p, 'flip-clear-bank').click(); await p.waitForTimeout(400);
  const srcAfter = await p.evaluate(() => (window as Any).__FEL_FLIP_ROOM__.sources());
  check('CLEAR BANK B lets Night Arp\'s decode go; bank A / C\'s source stays', srcBefore.some((k: string) => k.includes('loop_arp_pluck')) && !srcAfter.some((k: string) => k.includes('loop_arp_pluck')) && srcAfter.some((k: string) => k.includes(a0.source)), { before: srcBefore, after: srcAfter }, 'arp gone, bass kept');

  // ── 6. autosave + reload ──
  await saved(p);
  const rec = await stored(p);
  R.storedFlip = rec ? { v: rec.body?.v ?? rec.v, flip: { source: rec.body?.flip?.source?.id, otherBanks: rec.body?.flip?.otherBanks?.map((b: Any) => b?.source?.id ?? null), kits: rec.body?.flip?.kits?.map((k: Any) => k.name) } } : null;
  await p.reload({ waitUntil: 'domcontentloaded' });
  const start = p.getByRole('button', { name: 'TAP TO START' });
  await start.waitFor({ timeout: 240000 }); await start.click();
  await p.waitForFunction(() => !!(window as Any).__FEL_GRID__, undefined, { timeout: 60000 });
  await btn(p, 'FLIP').click(); await qa(p, 'flip-banks').waitFor();
  if (await qa(p, 'flip-bank-A').getAttribute('aria-pressed') !== 'true') await qa(p, 'flip-bank-A').click();
  await p.waitForFunction(() => (window as Any).__FEL_FLIP__?.decoded, undefined, { timeout: 30000 }).catch(() => undefined);
  const re = await flip(p);
  check('a reload brings back the banks, the kit and the moved marker (autosaved)', re.source === a0.source && re.banks[2] === a0.source && re.banks[1] === null && JSON.stringify(re.kits) === '["Probe kit"]' && re.slicesAll[1].start === after.p2.start,
    { stored: R.storedFlip, banks: re.banks, kits: re.kits, p2: re.slicesAll[1] }, 'A + C, Probe kit, pad 2 where it was dragged');

  // ── 7. a section keeps its own chop ──
  await btn(p, 'STUDIO').click(); await p.waitForTimeout(300);
  await btn(p, 'SAVE GRID AS SECTION').click(); await p.waitForTimeout(400);
  const secRec = await stored(p).catch(() => null);
  await btn(p, 'FLIP').click(); await qa(p, 'flip-banks').waitFor();
  await p.waitForFunction(() => (window as Any).__FEL_FLIP__?.decoded, undefined, { timeout: 30000 }).catch(() => undefined);
  await p.getByRole('button', { name: 'pad 1', exact: true }).dispatchEvent('pointerdown'); await p.waitForTimeout(150);
  await p.locator('input[type="range"][min="-12"]').fill('0'); await p.waitForTimeout(200);
  await p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await qa(p, 'flip-send').click(); await p.waitForTimeout(400);
  const fNow = await flip(p);                                       // pad 1 as it is now (its end was dragged in step 4)
  const lenNow = Math.min(Math.round((fNow.slicesAll[0].end - fNow.slicesAll[0].start) * sampleRatio(fNow)), Math.round(1.2 * fNow.liveRate));
  await btn(p, 'STUDIO').click(); await p.waitForTimeout(300);
  await btn(p, 'PLAY').click();
  await qa(p, 'song-mode').click();
  await p.waitForTimeout(900);
  await clearLog(p);
  await p.waitForTimeout(5200);                                   // two bars of the section
  const inSong = (await audioLog(p)).filter((e: Any) => e.when > 0 && (Math.abs(e.len - hit12.len) <= 1 || Math.abs(e.len - lenNow) <= 1));
  await qa(p, 'song-mode').click();
  await p.waitForTimeout(3200);
  await clearLog(p);
  await p.waitForTimeout(2800);
  const offSong = (await audioLog(p)).filter((e: Any) => e.when > 0 && (Math.abs(e.len - hit12.len) <= 1 || Math.abs(e.len - lenNow) <= 1));
  await btn(p, 'STOP').click();
  const secChops = (secRec?.body?.sections ?? secRec?.sections ?? []).map((s: Any) => (s.chops ?? []).map((c: Any) => `${c.sampleId}:${c.pitch}`));
  R.section = { secChops, inSong: inSong.map((e: Any) => e.len), offSong: offSong.map((e: Any) => e.len), sectionLen: hit12.len, newLen: lenNow };
  check('the section was saved with its own chop (FLIP 1 at +12)', JSON.stringify(secChops).includes('flip_0:12'), secChops, 'flip_0:12');
  check('song mode plays the section\'s own chop (+12), after the pad was re-sent at 0', inSong.length >= 2 && inSong.every((e: Any) => Math.abs(e.len - hit12.len) <= 1), R.section.inSong, `all ${hit12.len}`);
  check('song mode off: the grid plays the new chop (0)', offSong.length >= 2 && offSong.every((e: Any) => Math.abs(e.len - lenNow) <= 1), R.section.offSong, `all ${lenNow}`);
  await p.close();
}

async function phone(ctx: BrowserContext): Promise<void> {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => R.pageErrors.push(`phone: ${e.message}`));
  await openFlip(p);
  if (await qa(p, 'lesson-close').count()) await qa(p, 'lesson-close').click().catch(() => undefined);
  const f = await loadShelf(p, 'loops', 'Pocket Bass');
  await frame(p, 'phone-flip');
  const overflow = await p.evaluate(() => ({ sw: document.scrollingElement!.scrollWidth, iw: window.innerWidth }));
  check('phone: the FLIP tab has no sideways scroll at 390 px', overflow.sw <= overflow.iw, overflow, 'scrollWidth ≤ innerWidth');
  // a finger drag on pad 3's start (CDP touch events → pointer events, pointerType touch)
  const before = f.slicesAll[2];
  const a = await xOf(p, f, before.start);
  const cdp = await ctx.newCDPSession(p);
  const touch = (type: string, x: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: a.y }] } as Any);
  // MUSIC-SUITE P5 FIX PASS (2026-09-25): on touch only the SELECTED pad's markers can be grabbed (a tap anywhere else is a
  // tap — the review measured 325 of 343 phone columns grabbing a marker). A still tap in the middle of slice 3 selects it
  // and moves nothing; then its start is dragged.
  const midX = (await xOf(p, f, (before.start + before.end) / 2)).x;
  await touch('touchStart', midX); await p.waitForTimeout(40); await touch('touchEnd', midX); await p.waitForTimeout(300);
  const tapped = await flip(p);
  R.phoneTap = { selected: tapped.selected, slice3: tapped.slicesAll[2] };
  check('phone: a still tap in the middle of a slice selects it and moves no cut', tapped.selected === 2 && JSON.stringify(tapped.slicesAll) === JSON.stringify(f.slicesAll), R.phoneTap, 'pad 3 selected, cuts unchanged');
  await touch('touchStart', a.x);
  for (let k = 1; k <= 6; k++) { await touch('touchMove', a.x + k * 4); await p.waitForTimeout(30); }
  await touch('touchEnd', a.x + 24);
  await p.waitForTimeout(400);
  const g = await flip(p);
  R.phoneDrag = { before, after: g.slicesAll[2], prevEnd: g.slicesAll[1].end, width: a.w };
  check('phone: a finger drag moves the marker (pointer capture, touch-action pan-y)', g.slicesAll[2].start > before.start && g.slicesAll[1].end === g.slicesAll[2].start, R.phoneDrag, 'moved right, shared');
  await frame(p, 'phone-dragged');
  await p.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: chromiumExe(), args: ARGS, headless: true });
  try {
    const dctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await dctx.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
    await dctx.addInitScript({ content: STUDIO_TIER });
    await dctx.addInitScript({ content: AUDIO_SPY });
    try { await desktop(dctx); } catch (e) { R.desktopError = String((e as Error)?.stack ?? e); log('desktop error', e); }
    await dctx.close();
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await pctx.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
    await pctx.addInitScript({ content: AUDIO_SPY });
    try { await phone(pctx); } catch (e) { R.phoneError = String((e as Error)?.stack ?? e); log('phone error', e); }
    await pctx.close();
  } finally {
    await browser.close();
  }
  R.passed = R.checks.filter((c: Any) => c.pass).length;
  R.total = R.checks.length;
  fs.writeFileSync(`${OUT}/p5flip-proof.json`, JSON.stringify(R, null, 2));
  log(`${R.passed}/${R.total} checks; page errors: ${R.pageErrors.length}`);
  process.exit(0);
})();
