// MUSIC-SUITE P5 (2026-09-25), "The Flip, for real": the chop editor's rules (chopEdit.ts) — the zero-crossing snap, the
// fades, the minimum slice, the bake (pitch / gate / reverse), a pad's row among four banks, where an ARM REC tap lands on
// the audio clock, and which decoded sources the room keeps. Pure; node.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GATE_MAX_S, PAD_COUNT, padsFromSlices, rateForPitch, type Pad } from './Flip';
import {
  DRAG_SLOP_PX, FADE_MS, GATE_FADE_MS, GRAB_PX, MIN_SLICE_MS, SNAP_MS, applyEdgeFades, bakeChop, bakeKey, bankAtRate, edgeAt, fadeLength, fullView,
  gestureEnd, gestureMove, gestureStart, grabAt, liveSourceKeys, minSliceSamples, moveEdge, msToSamples, padAt, padsWithRows, peaks, pruneMap,
  chopKeyText, planChopSwap, pxOfSample, recordStep, removePad, resample, rowLabel, rowSlotFor, sampleAtPx, samplesPerPx, snapSlices, splitPad, zeroCrossingNear,
  zoomView, type Region, type StepMark, type WaveView,
} from './chopEdit';
import { itemCuts, parseFlipPack } from './flipPack';
import { changedFlipRows, chopSignature } from './studioEdit';
import { emptyFlip, flipSampleId, withBank, type ProjectFlipRow, type ProjectFlipSource } from './StudioProject';

const SR = 8000;
/** A sine at `hz` — its zero crossings are every SR / (2 hz) samples. */
const sine = (n: number, hz = 100, sr = SR): Float32Array => Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * hz * i) / sr));
const pad = (start: number, end: number, over: Partial<Pad> = {}): Pad => ({ slice: { start, end }, pitch: 0, reverse: false, gate: true, ...over });
const EMPTY: Pad = { slice: null, pitch: 0, reverse: false, gate: true };
const sixteen = (...ps: Pad[]): Pad[] => Array.from({ length: PAD_COUNT }, (_, i) => ps[i] ?? EMPTY);
const src = (id: string, over: Partial<ProjectFlipSource> = {}): ProjectFlipSource => ({ id, label: id, kind: 'fel', note: '', url: `/audio/${id}.wav`, ...over });
const row = (slot: number, over: Partial<ProjectFlipRow> = {}): ProjectFlipRow => ({
  sampleId: flipSampleId(slot), pad: slot, label: `FLIP ${slot + 1}`, source: src('s'), slice: { start: 0, end: 800 }, reverse: false, pitch: 0, gate: true, ...over,
});

describe('the zero-crossing snap (within 2 ms)', () => {
  // 100 Hz at 8 kHz: a crossing every 40 samples (0, 40, 80, …); 2 ms = 16 samples
  const wave = sine(2000);
  it('a marker dropped 7 samples off a crossing lands on it; one 25 samples off (> 2 ms) stays where it was dropped', () => {
    expect(SNAP_MS).toBe(2);
    expect(msToSamples(SNAP_MS, SR)).toBe(16);
    expect(zeroCrossingNear(wave, 407, 16)).toBe(400);
    expect(zeroCrossingNear(wave, 393, 16)).toBe(400);
    expect(zeroCrossingNear(wave, 420, 16)).toBe(420);     // 20 from either crossing: nothing in reach
    expect(Math.abs(wave[zeroCrossingNear(wave, 407, 16)])).toBeLessThan(1e-6);
  });
  it('never leaves [lo, hi], and the file\'s own edges count as crossings', () => {
    expect(zeroCrossingNear(wave, 407, 16, 405, 500)).toBe(407);   // the crossing at 400 is out of bounds
    const dc = new Float32Array(100).fill(0.5);                      // no crossing anywhere
    expect(zeroCrossingNear(dc, 5, 16)).toBe(0);
    expect(zeroCrossingNear(dc, 95, 16)).toBe(100);
    expect(zeroCrossingNear(dc, 50, 16)).toBe(50);
  });
  it('of the two samples either side of a crossing, the one nearer zero', () => {
    const w = Float32Array.from([0.5, 0.4, 0.3, -0.05, -0.4, -0.5]);
    expect(zeroCrossingNear(w, 2, 2)).toBe(3);
  });
});

describe('fades on every chop edge (2–5 ms)', () => {
  it('3 ms raised-cosine in and out: the first and last samples are 0, the middle untouched', () => {
    expect(FADE_MS).toBeGreaterThanOrEqual(2); expect(FADE_MS).toBeLessThanOrEqual(5);
    expect(GATE_FADE_MS).toBeLessThanOrEqual(5);
    const b = applyEdgeFades(new Float32Array(1000).fill(1), SR);
    const n = fadeLength(1000, SR);
    expect(n).toBe(24);                                           // 3 ms at 8 kHz
    expect(b[0]).toBe(0); expect(b[999]).toBeCloseTo(0, 6);
    expect(b[n]).toBe(1); expect(b[500]).toBe(1);
    for (let k = 1; k < n; k++) expect(b[k]).toBeGreaterThan(b[k - 1]);   // monotonic: no click in the fade
  });
  it('a very short chop fades over a quarter of itself at most', () => {
    expect(fadeLength(40, SR)).toBe(10);
    expect(fadeLength(3, SR)).toBe(0);
  });
});

describe('editing slices', () => {
  const wave = sine(4000);
  it('the minimum slice is 10 ms', () => {
    expect(MIN_SLICE_MS).toBe(10);
    expect(minSliceSamples(SR)).toBe(80);
  });
  it('dragging a shared marker moves both pads, snapped to the crossing', () => {
    const pads = sixteen(pad(0, 800), pad(800, 1600), pad(1600, 4000));
    const out = moveEdge(pads, 1, 'start', 1007, wave, SR);
    expect(out[1].slice).toEqual({ start: 1000, end: 1600 });
    expect(out[0].slice).toEqual({ start: 0, end: 1000 });       // the neighbour that shared the marker
    expect(out[2]).toBe(pads[2]);
  });
  it('a drag stops 10 ms short of the far marker, and short of the neighbour\'s far end', () => {
    const pads = sixteen(pad(0, 800), pad(800, 1600));
    expect(moveEdge(pads, 1, 'start', 5000, wave, SR)[1].slice).toEqual({ start: 1520, end: 1600 });
    expect(moveEdge(pads, 1, 'start', -50, wave, SR)[0].slice).toEqual({ start: 0, end: 80 });
    expect(moveEdge(pads, 1, 'end', 99999, wave, SR)[1].slice!.end).toBe(4000);   // the file's end
  });
  it('a move that changes nothing hands back the same pads (no empty undo step)', () => {
    const pads = sixteen(pad(0, 800), pad(800, 1600));
    expect(moveEdge(pads, 1, 'start', 803, wave, SR)).toBe(pads);
    expect(moveEdge(pads, 5, 'start', 100, wave, SR)).toBe(pads);
  });
  it('+ SLICE cuts a pad in two onto the first empty pad (no renumbering); refuses when full or too short', () => {
    const pads = sixteen(pad(0, 800, { pitch: 3 }), pad(800, 1600));
    const r = splitPad(pads, 0, 407, wave, SR)!;
    expect(r.added).toBe(2);
    expect(r.pads[0].slice).toEqual({ start: 0, end: 400 });
    expect(r.pads[2]).toEqual(pad(400, 800, { pitch: 3 }));      // the rest of the same chop, tuned the same
    expect(r.pads[1]).toBe(pads[1]);
    expect(splitPad(sixteen(pad(0, 150)), 0, 75, wave, SR)).toBeNull();   // 150 < 2 × 80
    const full = Array.from({ length: PAD_COUNT }, (_, i) => pad(i * 200, (i + 1) * 200));
    expect(splitPad(full, 0, 100, wave, SR)).toBeNull();
  });
  it('− SLICE takes a marker away: the pad before grows over the gap (else the pad after); the pad is emptied', () => {
    const pads = sixteen(pad(0, 800), pad(800, 1600), pad(1600, 4000));
    const a = removePad(pads, 1);
    expect(a.merged).toBe(0);
    expect(a.pads[0].slice).toEqual({ start: 0, end: 1600 });
    expect(a.pads[1].slice).toBeNull();
    const b = removePad(pads, 0);
    expect(b.merged).toBe(1);
    expect(b.pads[1].slice).toEqual({ start: 0, end: 1600 });
    expect(removePad(sixteen(pad(0, 100), pad(500, 900)), 1).merged).toBeNull();
  });
  it('fresh slices snap their inner cuts (shared by both sides) and keep the file\'s edges', () => {
    const s = snapSlices([{ start: 0, end: 1005 }, { start: 1005, end: 2011 }, { start: 2011, end: 4000 }], wave, SR);
    expect(s).toEqual([{ start: 0, end: 1000 }, { start: 1000, end: 2000 }, { start: 2000, end: 4000 }]);
  });
  it('the waveform: the selected pad\'s marker wins a tie; a shared marker goes to the side the pointer is on', () => {
    const regions = [{ pad: 0, start: 0, end: 800 }, { pad: 1, start: 800, end: 1600 }];
    expect(edgeAt(regions, 805, 20, null)).toEqual({ pad: 1, edge: 'start' });
    expect(edgeAt(regions, 795, 20, null)).toEqual({ pad: 0, edge: 'end' });
    expect(edgeAt(regions, 805, 20, 0)).toEqual({ pad: 0, edge: 'end' });
    expect(edgeAt(regions, 400, 20, null)).toBeNull();
    expect(padAt(regions, 400, null)).toBe(0);
    expect(padAt([...regions, { pad: 5, start: 300, end: 500 }], 400, null)).toBe(5);   // the shortest holding it
    expect(padAt(regions, 9999, null)).toBe(-1);
  });
  it('peaks: the min and max of each column', () => {
    const p = peaks(Float32Array.from([0.1, -0.5, 0.9, -0.2]), 2);
    expect([...p.min]).toEqual([-0.5, -0.2].map(Math.fround));
    expect([...p.max]).toEqual([0.1, 0.9].map(Math.fround));
  });
  it('a bank saved at 48 kHz is edited in the samples of a 44.1 kHz decode (rescaled once)', () => {
    const b = { source: src('x'), slicing: 'grid' as const, gridN: 2, chops: sixteen(pad(0, 48000), pad(48000, 96000)), rate: 48000 };
    const at = bankAtRate(b, 44100);
    expect(at.rate).toBe(44100);
    expect(at.chops[1].slice).toEqual({ start: 44100, end: 88200 });
    expect(bankAtRate(at, 44100)).toBe(at);
  });
});

describe('the bake: what you tune is what you sequence', () => {
  const ramp = Float32Array.from({ length: 1000 }, (_, i) => i / 1000);
  it('reverse: the slice backwards (then faded)', () => {
    const b = bakeChop(ramp, { slice: { start: 100, end: 900 }, pitch: 0, reverse: true, gate: false }, SR);
    expect(b.length).toBe(800);
    expect(b[400]).toBeCloseTo(ramp[899 - 400], 6);                // the middle is the source, backwards
    expect(b[0]).toBe(0);                                         // …and the edges are faded
  });
  it('pitch: +12 is an octave up — half as long, what playbackRate 2 plays; −12 twice as long', () => {
    expect(resample(ramp, rateForPitch(12)).length).toBe(500);
    const up = bakeChop(ramp, { slice: { start: 0, end: 1000 }, pitch: 12, reverse: false, gate: false }, SR);
    expect(up.length).toBe(500);
    expect(up[250]).toBeCloseTo(ramp[500], 6);
    const down = bakeChop(ramp, { slice: { start: 0, end: 1000 }, pitch: -12, reverse: false, gate: false }, SR);
    expect(down.length).toBe(1999);
    expect(down[1001]).toBeCloseTo((ramp[500] + ramp[501]) / 2, 6);   // interpolated between samples
  });
  it('gate: cut at GATE_MAX_S of what you hear (after the pitch), with the longer release fade', () => {
    const long = new Float32Array(SR * 3).fill(0.5);
    const g = bakeChop(long, { slice: { start: 0, end: long.length }, pitch: 0, reverse: false, gate: true }, SR);
    expect(g.length).toBe(Math.round(GATE_MAX_S * SR));
    expect(g[g.length - 1]).toBeCloseTo(0, 6);
    expect(g[g.length - 1 - msToSamples(GATE_FADE_MS, SR)]).toBe(0.5);
    const down = bakeChop(long, { slice: { start: 0, end: SR }, pitch: -12, reverse: false, gate: true }, SR);
    expect(down.length).toBe(Math.round(GATE_MAX_S * SR));         // a 1 s slice an octave down = 2 s heard → gated
    expect(bakeChop(long, { slice: { start: 0, end: long.length }, pitch: 0, reverse: false, gate: false }, SR).length).toBe(long.length);
  });
  it('a slice counted at another rate is the same stretch of sound', () => {
    const b = bakeChop(ramp, { slice: { start: 0, end: 200 }, pitch: 0, reverse: false, gate: false, rate: 4000 }, SR);
    expect(b.length).toBe(400);
  });
  it('bakeKey changes with everything that changes the sound — and so does the row\'s signature (an undo reloads it)', () => {
    const a = row(0);
    expect(bakeKey(a)).toBe(bakeKey(row(0)));
    for (const over of [{ pitch: 2 }, { gate: false }, { reverse: true }, { slice: { start: 0, end: 801 } }, { rate: 44100 }, { source: src('t') }]) {
      expect(bakeKey(row(0, over as Partial<ProjectFlipRow>))).not.toBe(bakeKey(a));
      // MUSIC-SUITE P5 FIX PASS: chopSignature (what changedFlipRows / an undo's reload compares) sees the same changes
      expect(chopSignature(row(0, over as Partial<ProjectFlipRow>))).not.toBe(chopSignature(a));
    }
    const before = [row(0), row(1), row(2)];
    const after = [row(0, { pitch: 5 }), row(1, { slice: { start: 10, end: 800 } }), row(2)];
    expect(changedFlipRows(before, after).map((r) => r.sampleId)).toEqual(['flip_0', 'flip_1']);
  });
});

describe('a pad\'s row among four banks', () => {
  it('bank A goes to its own number, as before banks; the row it went to before is REPLACED', () => {
    expect(rowSlotFor([], [], 0, 3)).toEqual({ slot: 3, replaces: false });
    expect(rowSlotFor([row(3)], [], 0, 3)).toEqual({ slot: 3, replaces: true });
    expect(rowLabel(3, 0, 3)).toBe('FLIP 4');
  });
  it('bank B\'s pad 3 never takes bank A\'s row 3: its own number when free, else the first free row', () => {
    expect(rowSlotFor([row(3)], ['flip_3'], 1, 3)).toEqual({ slot: 0, replaces: false });
    expect(rowSlotFor([row(0), row(3)], ['flip_0', 'flip_3'], 1, 3)).toEqual({ slot: 1, replaces: false });
    expect(rowSlotFor([], [], 1, 3)).toEqual({ slot: 3, replaces: false });
    const bRow = row(1, { origin: { bank: 1, pad: 3 } });
    expect(rowSlotFor([row(3), bRow], [], 1, 3)).toEqual({ slot: 1, replaces: true });
    expect(rowLabel(1, 1, 3)).toBe('FLIP 2 · B4');
    expect([...padsWithRows([row(3), bRow], 1)]).toEqual([3]);
    expect([...padsWithRows([row(3), bRow], 0)]).toEqual([3]);
  });
  it('a row whose chop was lost keeps its number for its own pad; all sixteen taken = no row', () => {
    expect(rowSlotFor([], ['flip_3'], 0, 3)).toEqual({ slot: 3, replaces: false });
    expect(rowSlotFor([], ['flip_3'], 2, 3)).toEqual({ slot: 0, replaces: false });
    const all = Array.from({ length: PAD_COUNT }, (_, i) => row(i));
    expect(rowSlotFor(all, [], 1, 0)).toBeNull();
  });
});

describe('ARM REC: a tap lands on the NEAREST step by the audio clock', () => {
  // 92 BPM: a 16th is 163 ms. Steps 4 and 5 scheduled at 10.000 and 10.163 (the engine schedules 100 ms ahead).
  const stepSec = 60 / 92 / 4;
  const marks: StepMark[] = [{ step: 3, time: 10 - stepSec }, { step: 4, time: 10 }, { step: 5, time: 10 + stepSec }];
  const at = (tap: number, quantize = true, m = marks) => recordStep(tap, m, { stepSec, steps: 16, quantize, startSec: 0 });
  it('a tap 20 ms early lands on the coming step — not the one already sounding (quantizeTap gave 4)', () => {
    expect(at(10 + stepSec - 0.02)).toBe(5);
  });
  it('late within half a step: the same step; past half: the next', () => {
    expect(at(10 + 0.06)).toBe(4);
    expect(at(10 + stepSec / 2 - 0.001)).toBe(4);
    expect(at(10 + stepSec / 2 + 0.001)).toBe(5);
    expect(at(10 + stepSec / 2)).toBe(5);                          // a dead tie: the later step
  });
  it('past the last scheduled step, by the step length; round the bar', () => {
    expect(at(10 + 3 * stepSec + 0.01)).toBe(7);
    const end = [{ step: 15, time: 20 }];
    expect(at(20 + stepSec - 0.01, true, end)).toBe(0);
  });
  it('QUANTIZE off: the step the tap falls in', () => {
    expect(at(10 + stepSec - 0.02, false)).toBe(4);
    expect(at(10 + 0.001, false)).toBe(4);
  });
  it('no clock, or a tap in the count-in: nothing is written', () => {
    expect(recordStep(10, [], { stepSec, steps: 16, quantize: true })).toBeNull();
    expect(recordStep(9, marks, { stepSec, steps: 16, quantize: true, startSec: 10 })).toBeNull();
    expect(recordStep(10 - 0.03, [{ step: 0, time: 10 }], { stepSec, steps: 16, quantize: true, startSec: 10 })).toBe(0);   // 30 ms early for bar 0
    expect(recordStep(10 - 0.03, [{ step: 0, time: 10 }], { stepSec, steps: 16, quantize: false, startSec: 10 })).toBeNull();
  });
  it('marks from a run before this one are ignored', () => {
    const stale = [{ step: 9, time: 3 }, ...marks];
    expect(recordStep(10 + stepSec - 0.02, stale, { stepSec, steps: 16, quantize: true, startSec: 9 })).toBe(5);
  });
});

describe('memory: what the open project still plays', () => {
  it('every bank\'s source, every row\'s, every section\'s own chops — not a kit\'s; the rest is dropped', () => {
    let flip = withBank(emptyFlip(), 0, { source: src('a'), slicing: 'transient', gridN: 8, chops: padsFromSlices([{ start: 0, end: 10 }]) });
    flip = withBank(flip, 2, { source: src('c', { kind: 'own', audio: { key: 'aud_c', mime: 'audio/webm', bytes: 1 } }), slicing: 'grid', gridN: 4, chops: padsFromSlices([{ start: 0, end: 10 }]) });
    flip = { ...flip, kits: [{ id: 'k', name: 'k', savedAt: 1, bank: { source: src('kit'), slicing: 'grid', gridN: 2, chops: padsFromSlices([]) } }] };
    const keys = liveSourceKeys({ flip, flipRows: [row(0, { source: src('r') })], sections: [{ chops: [row(1, { source: src('sec') })] }] });
    expect([...keys].sort()).toEqual(['/audio/a.wav', '/audio/r.wav', '/audio/sec.wav', 'aud_c'].sort());
    const cache = new Map([['/audio/a.wav', 1], ['/audio/gone.wav', 2], ['aud_c', 3]]);
    expect(pruneMap(cache, keys)).toEqual(['/audio/gone.wav']);
    expect([...cache.keys()]).toEqual(['/audio/a.wav', 'aud_c']);
  });
});

// ── MUSIC-SUITE P5 FIX PASS (2026-09-25): the waveform's pointer rules ────────────────────────────────────────────────
// The review measured it on Sunday Tape's own 16 FEL cuts (48 kHz): on a 343 px phone canvas with the 18 px touch grab,
// 325 of 343 columns grabbed a marker, a tap in the middle of slice 5 moved pad 5's start 335 ms on release, and a
// cancelled press (a page scroll) moved the grabbed marker to the touch-down point. These run the same cuts.
describe('the waveform: a tap never moves a cut', () => {
  const APP = path.resolve(__dirname, '../../..');
  const pack = parseFlipPack(JSON.parse(fs.readFileSync(path.join(APP, 'public/audio/flip/pack.json'), 'utf8')));
  if (!pack.ok) throw new Error('pack.json');
  const tape = pack.pack.byId.get('theme_a_sunday_tape')!;
  const RATE = 48000;
  const LEN = Math.round((tape.samples * RATE) / 44100);
  const REGIONS: Region[] = itemCuts(tape, RATE, LEN).map((c, pad) => ({ pad, ...c }));
  const PHONE: WaveView = fullView(LEN, 343);
  const DESK: WaveView = fullView(LEN, 900);
  const mid = (pad: number, v: WaveView): number => pxOfSample(v, (REGIONS[pad].start + REGIONS[pad].end) / 2);

  it('the fixture is the default theme\'s 16 FEL cuts (one phone pixel is ~31 ms of it)', () => {
    expect(REGIONS).toHaveLength(16);
    expect((samplesPerPx(PHONE) / RATE) * 1000).toBeGreaterThan(30);
  });

  it('touch grabs only the selected pad\'s markers — nothing at all with no pad selected (was 325 of 343 columns)', () => {
    const grabbing = (sel: number | null): number => Array.from({ length: 343 }, (_, x) => grabAt(REGIONS, PHONE, x + 0.5, 'touch', sel)).filter(Boolean).length;
    expect(grabbing(null)).toBe(0);
    const five = grabbing(4);
    expect(five).toBeGreaterThan(0);
    expect(five).toBeLessThanOrEqual(2 * (2 * GRAB_PX.touch + 1));
    // a mouse may grab any marker (8 px here: these slices are ~56 px wide, so the third-of-a-slice cap does not bind —
    // and a still mouse press is a tap either way, below), never the middle of a slice
    const mouse = Array.from({ length: 900 }, (_, x) => grabAt(REGIONS, DESK, x + 0.5, 'mouse', null)).filter(Boolean).length;
    expect(mouse).toBeLessThanOrEqual(256);
    for (const r of REGIONS) expect(grabAt(REGIONS, DESK, mid(r.pad, DESK), 'mouse', null), `pad ${r.pad + 1}`).toBeNull();
  });

  it('the grab distance is at most a third of the narrowest slice under the pointer', () => {
    // three 12-px slices on a 1-sample-per-px view: a mouse's 8 px would reach the middle of each; the cap is 4 px
    const v: WaveView = { from: 0, to: 36, width: 36 };
    const tiny: Region[] = [{ pad: 0, start: 0, end: 12 }, { pad: 1, start: 12, end: 24 }, { pad: 2, start: 24, end: 36 }];
    expect(grabAt(tiny, v, 18, 'mouse', null)).toBeNull();                          // the middle of pad 2's slice
    expect(grabAt(tiny, v, 15, 'mouse', null)).toMatchObject({ pad: 1, edge: 'start', marker: 12 });
  });

  it('a tap in the middle of slice 5 selects it (a TAP) and moves nothing — on the phone and the desk', () => {
    for (const [v, kind, sel] of [[PHONE, 'touch', 4], [PHONE, 'touch', null], [DESK, 'mouse', null], [DESK, 'mouse', 4]] as const) {
      const g = gestureStart(REGIONS, v, mid(4, v), kind, sel);
      const r = gestureEnd(g, v, mid(4, v), false);
      expect(r.end).toBeNull();
      expect(padAt(REGIONS, r.tap!, sel)).toBe(4);
    }
  });

  it('a press 5 px from a marker that never moves changes nothing (a wobble under the slop is still a tap)', () => {
    const x = pxOfSample(DESK, REGIONS[4].start) + 5;
    const g = gestureStart(REGIONS, DESK, x, 'mouse', 4);
    expect(g.grab).toMatchObject({ pad: 4, edge: 'start' });
    const w = gestureMove(g, DESK, x + DRAG_SLOP_PX.mouse - 1);
    expect(w.move).toBeNull();
    expect(gestureEnd(w.g, DESK, x + 1, false).end).toBeNull();
  });

  it('a cancel with no movement (the page scrolled) changes nothing; a cancelled drag keeps where it got to', () => {
    const x = pxOfSample(PHONE, REGIONS[4].start);
    const g = gestureStart(REGIONS, PHONE, x, 'touch', 4);
    expect(g.grab).not.toBeNull();
    expect(gestureEnd(g, PHONE, x, true)).toEqual({ end: null, tap: null });
    const moved = gestureMove(g, PHONE, x + 10).g;
    expect(gestureEnd(moved, PHONE, x + 80, true).end?.at).toBe(moved.last);
  });

  it('a 30 px drag moves the marker by 30 px of samples (the grab offset kept, not the absolute pointer)', () => {
    const marker = REGIONS[4].start;
    const x = pxOfSample(DESK, marker) + 3;   // grabbed 3 px to the right of it
    let g = gestureStart(REGIONS, DESK, x, 'mouse', 4);
    for (let k = 1; k <= 30; k++) g = gestureMove(g, DESK, x + k).g;
    const end = gestureEnd(g, DESK, x + 30, false).end!;
    expect(end).toMatchObject({ pad: 4, edge: 'start' });
    expect(end.at - marker).toBe(Math.round(30 * samplesPerPx(DESK)));
  });

  it('ZOOM: the selected slice ± a quarter of it fills the canvas (px ↔ sample round-trips)', () => {
    const r = REGIONS[4];
    const v = zoomView(LEN, 343, r, RATE);
    expect(v.from).toBeLessThan(r.start);
    expect(v.to).toBeGreaterThan(r.end);
    expect(samplesPerPx(v)).toBeLessThan(samplesPerPx(PHONE) / 8);
    expect(Math.abs(sampleAtPx(v, pxOfSample(v, r.end)) - r.end)).toBeLessThanOrEqual(1);
    expect(zoomView(LEN, 343, null, RATE)).toEqual(fullView(LEN, 343));
  });
});

// MUSIC-SUITE P5 FIX PASS (2026-09-25): song mode skipped a chop not baked yet and retried only on a bar line (none once
// song mode ends): a section chop that could not be decoded left the row on the GRID's chop, and a failed grid row kept
// the last SECTION's after song mode ended. The plan loads what is baked, silences what failed, bakes the rest.
describe('song mode\'s chop swap', () => {
  it('baked → loaded; failed → silent (never the chop before); the rest pending until baked', () => {
    const a = row(0), b = row(1, { pitch: 3 }), c = row(2, { slice: { start: 5, end: 700 } });
    const cache = new Map([[bakeKey(a), 'A']]);
    const plan = planChopSwap([a, b, c], (k) => cache.get(k), new Set([bakeKey(b)]));
    expect(plan.load).toEqual([{ row: a, buffer: 'A' }]);
    expect(plan.silence).toEqual(['flip_1']);
    expect(plan.pending).toEqual([c]);
    expect(plan.done).toBe(false);
    cache.set(bakeKey(c), 'C');
    expect(planChopSwap([a, b, c], (k) => cache.get(k), new Set([bakeKey(b)])).done).toBe(true);
  });
});

// MUSIC-SUITE P5 FIX PASS (2026-09-25; P4 deferred it): a chop's own key — its source's key moved by the pad's pitch
describe('a chop\'s own key', () => {
  it('a key moves by the pitch, in the source\'s own accidentals; a root note keeps its octave; unknown stays unknown', () => {
    expect(chopKeyText('Eb major', 0)).toBe('Eb major');
    expect(chopKeyText('Eb major', 2)).toBe('F major');
    expect(chopKeyText('Eb major', -4)).toBe('B major');
    expect(chopKeyText('D dorian', 1)).toBe('Eb dorian');
    expect(chopKeyText('F# minor', 1)).toBe('G minor');
    expect(chopKeyText('F# minor', 3)).toBe('A minor');
    expect(chopKeyText('C4', 13)).toBe('Db5');
    expect(chopKeyText('A1', -12)).toBe('A0');
    expect(chopKeyText(undefined, 3)).toBeNull();
    expect(chopKeyText('not a key', 0)).toBeNull();
  });
});
