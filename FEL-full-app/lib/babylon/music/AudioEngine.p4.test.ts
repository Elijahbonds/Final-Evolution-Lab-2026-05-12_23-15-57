// MUSIC-SUITE P4 (2026-09-25): the PHASE-4 ENGINE CONTRACT on the REAL AudioEngine (fakeWebAudio.ts is the browser: a
// clock you set, a 25 ms scheduler you fire, sources that log start(at, offset, duration), their rate, and their stop()).
//   (2) a pitched step plays its note; drums ignore a note; velocity scales the hit;
//   (3) the metronome and the count-in land on the audio clock where they should, with their own clicks;
//   (4) takes play on every pass of their bars, are cut at the next pass, and stop at once on stop().
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeAudioBuffer, FakeOfflineAudioContext, installFakeWebAudio, type FakeAudioContext, type FakeStart, type FakeWebAudio } from './fakeWebAudio';
import {
  AudioEngine, barSec, countInClicks, metronomeClick, noteRate, sampleRoot, stepNote, stepVelocity, takeFromShot, takeSpan, takeStartsAt,
  voiceFor, type EngineTake, type TrackState,
} from './AudioEngine';
import { clickBuffer } from './mixGraph';
import { VOICE_ROOTS, synthesizeKit, synthesizeNote, voiceRootOf } from './SynthKit';

const BPM = 120, STEPS = 16, TICK = 0.025, LEAD = 0.05, BASE = 60 / BPM / 4, BAR = STEPS * BASE;
let fake: FakeWebAudio;
beforeEach(() => { fake = installFakeWebAudio(); });
afterEach(() => fake.uninstall());

const buf = (sec = 0.1): AudioBuffer => new FakeAudioBuffer(1, Math.round(44100 * sec), 44100) as unknown as AudioBuffer;
const row = (sampleId: string, hits: number[], extra: Partial<TrackState> = {}): TrackState => ({
  sampleId, pattern: Array.from({ length: STEPS }, (_, i) => hits.includes(i)), volume: 0.8, muted: false, pan: 0, ...extra,
});
const clock = (eng: AudioEngine): FakeAudioContext => eng.context as unknown as FakeAudioContext;
/** Run the live scheduler from t = 0 until `until` (audio seconds). */
function run(eng: AudioEngine, until: number, from = 0): void {
  const ctx = clock(eng);
  for (let k = Math.floor(from / TICK) + 1; k * TICK <= until; k++) { ctx.currentTime = k * TICK; fake.tick(); }
}

describe('(2) a step has a note: pitched rows play it, drums ignore it', () => {
  it('pure: stepNote / stepVelocity / voiceFor', () => {
    const bass = row('bass', [0], { notes: new Array(STEPS).fill(45), vels: new Array(STEPS).fill(0.5) });
    const kick = row('kick', [0], { notes: new Array(STEPS).fill(45) });
    expect(stepNote(bass, 0)).toBe(45);
    expect(stepNote(kick, 0)).toBeNull();                                 // a drum ignores a note
    expect(stepNote(row('lead', [0]), 0)).toBeNull();                     // no note = the row's own buffer
    expect(stepVelocity(bass, 0)).toBe(0.5);
    expect(stepVelocity(kick, 0)).toBe(1);
    expect(noteRate(45, 33)).toBe(2);
    const b = buf();
    expect(voiceFor({ id: 'bass', buffer: b, rootMidi: 33 }, bass, 0)).toEqual({ buffer: b, rate: 2, note: 45 });
    const exact = buf();
    expect(voiceFor({ id: 'bass', buffer: b, rootMidi: 33 }, bass, 0, new Map([['bass#45', exact]]))).toEqual({ buffer: exact, rate: 1, note: 45 });
    expect(voiceFor({ id: 'kick', buffer: b }, kick, 0)).toEqual({ buffer: b, rate: 1, note: null });
    expect(sampleRoot({ id: 'flip_2', buffer: b })).toBe(60);             // a chop's own pitch is "60"
    expect(sampleRoot({ id: 'bass', buffer: b })).toBeNull();             // an unknown buffer: played as it is
  });

  it('live and rendered: the bass plays its notes by rate from its root, the kick plays rate 1 whatever its notes say', async () => {
    const notes = [33, 33, 33, 33, 36, 36, 36, 36, 40, 40, 40, 40, 45, 45, 45, 45];
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0, tracks: [row('bass', [0, 4, 8, 12], { notes }), row('kick', [2], { notes: new Array(STEPS).fill(80) })] });
    eng.loadBuffer('bass', 'Bass', buf(0.4), 'bass', 33);
    eng.loadBuffer('kick', 'Kick', buf(), 'kick');
    clock(eng).currentTime = 0;
    eng.start();
    run(eng, LEAD + BAR + 0.1);
    eng.stop();
    const live = clock(eng).starts.filter((s) => s.at < LEAD + BAR - 1e-9).map((s) => [Math.round((s.at - LEAD) / BASE), s.rate]);
    const want = [[0, 1], [2, 1], [4, Math.pow(2, 3 / 12)], [8, Math.pow(2, 7 / 12)], [12, 2]];
    expect(live).toEqual(want);
    const before = FakeOfflineAudioContext.created.length;
    await eng.renderMixdown(1);
    expect(FakeOfflineAudioContext.created[before].starts.map((s) => [Math.round(s.at / BASE), s.rate]).sort((a, b) => a[0]! - b[0]!)).toEqual(want);
    eng.dispose();
  });

  it('a note rendered ON its pitch (loadNote / SynthKit.synthesizeNote) is played as it is; a kit swap forgets them', () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0, tracks: [row('lead', [0], { notes: new Array(STEPS).fill(72) })] });
    eng.loadBuffer('lead', 'Lead', buf(), 'melody', 69);
    const c5 = buf();
    eng.loadNote('lead', 72, c5);
    expect(eng.loadedNotes('lead')).toEqual([72]);
    clock(eng).currentTime = 0; eng.start(); run(eng, LEAD + BASE); eng.stop();
    const s = clock(eng).starts[0];
    expect([s.buffer === c5, s.rate]).toEqual([true, 1]);
    eng.swapKit(new Map([['lead', buf()]]));
    expect(eng.loadedNotes('lead')).toEqual([]);
  });

  it('velocity scales the hit\'s gain (row volume × step velocity)', () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0, tracks: [row('hat', [0, 1], { volume: 0.5, vels: [1, 0.4, ...new Array(STEPS - 2).fill(1)] })] });
    eng.loadBuffer('hat', 'Hat', buf(), 'hat');
    clock(eng).currentTime = 0; eng.start(); run(eng, LEAD + 2 * BASE); eng.stop();
    const gains = clock(eng).starts.slice(0, 2).map((s) => ((s.src!.outputs[0] as unknown as { gain: { value: number } }).gain.value));
    expect(gains[0]).toBeCloseTo(0.5, 9);
    expect(gains[1]).toBeCloseTo(0.2, 9);
  });

  it('SynthKit: the pitched voices are notes (STREET A1 / A4, NEON C2 / C5, DUST G1 / G4); the drums are not', async () => {
    const kit = await synthesizeKit('neon');
    expect(voiceRootOf(kit.get('bass')!)).toBe(VOICE_ROOTS.neon.bass);
    expect(voiceRootOf(kit.get('lead')!)).toBe(72);
    expect(voiceRootOf(kit.get('kick')!)).toBeUndefined();
    const e2 = await synthesizeNote('street', 'bass', 40);
    expect(voiceRootOf(e2)).toBe(40);
    expect(e2.duration).toBeCloseTo(kit.get('bass')!.duration, 6);         // same envelope length at any pitch
    // the engine finds the root through the buffer: a bass step on E2 from the NEON bass (C2) plays 2^(4/12)
    expect(voiceFor({ id: 'bass', buffer: kit.get('bass')! }, row('bass', [0], { notes: new Array(STEPS).fill(40) }), 0).rate).toBeCloseTo(Math.pow(2, 4 / 12), 12);
  });
});

describe('(3) metronome and count-in, on the audio clock', () => {
  it('pure: the metronome clicks the quarter notes (the downbeat accented); a count-in is one click per beat, each bar accented', () => {
    expect(Array.from({ length: 16 }, (_, i) => metronomeClick(i))).toEqual(['accent', null, null, null, 'beat', null, null, null, 'beat', null, null, null, 'beat', null, null, null]);
    const c = countInClicks(10, 2, 120);
    expect(c.map((x) => x.at)).toEqual([10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5]);
    expect(c.map((x) => x.kind)).toEqual(['countAccent', 'count', 'count', 'count', 'countAccent', 'count', 'count', 'count']);
    expect(barSec(92)).toBeCloseTo(4 * 60 / 92, 12);
  });

  it('countIn(1) at 92 BPM: four count clicks from +50 ms a beat apart, then bar 0 exactly one bar later; nothing of the song before', () => {
    const bpm = 92, beat = 60 / bpm;
    const eng = new AudioEngine({ bpm, steps: STEPS, swing: 0.15, tracks: [row('kick', [0, 4, 8, 12])] });
    eng.loadBuffer('kick', 'Kick', buf(), 'kick');
    const ctx = clock(eng);
    ctx.currentTime = 2;
    const { startAt, clicks } = eng.countIn(1);
    expect(startAt).toBeCloseTo(2 + LEAD + 4 * beat, 12);
    expect(eng.songStartSec).toBe(startAt);
    expect(clicks.map((c) => c.at)).toEqual([0, 1, 2, 3].map((k) => 2 + LEAD + k * beat));
    const countBuf = clickBuffer(ctx as unknown as BaseAudioContext, 'count'), accentBuf = clickBuffer(ctx as unknown as BaseAudioContext, 'countAccent');
    expect(ctx.starts.slice(0, 4).map((s) => (s.buffer === accentBuf ? 'A' : s.buffer === countBuf ? 'c' : '?'))).toEqual(['A', 'c', 'c', 'c']);
    expect(eng.countingIn).toBe(true);
    run(eng, startAt - 0.11, 2);
    expect(ctx.starts).toHaveLength(4);                                    // no kick during the count
    run(eng, startAt + 4 * beat + 0.2, startAt - 0.11);
    const kicks = ctx.starts.slice(4).map((s) => s.at);
    expect(kicks[0]).toBeCloseTo(startAt, 12);                             // bar 0's downbeat, one bar after the first click
    expect(kicks[1] - kicks[0]).toBeCloseTo(beat, 12);
    expect(eng.countingIn).toBe(false);
    expect(eng.countIn(2).clicks).toEqual([]);                             // already running: nothing new
    eng.stop();
  });

  it('the metronome clicks each quarter of the song on the steps\' own times (never swung), accenting the downbeat', () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0.4, tracks: [] });
    eng.setMetronome(true);
    const ctx = clock(eng);
    ctx.currentTime = 0; eng.start(); run(eng, LEAD + 2 * BAR + 0.05); eng.stop();
    const acc = clickBuffer(ctx as unknown as BaseAudioContext, 'accent'), beat = clickBuffer(ctx as unknown as BaseAudioContext, 'beat');
    const clicks = ctx.starts.filter((s) => s.at < LEAD + 2 * BAR - 1e-9);
    expect(clicks.map((s) => +(s.at - LEAD).toFixed(9))).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((k) => +(k * 0.5).toFixed(9)));
    expect(clicks.map((s) => (s.buffer === acc ? 'A' : s.buffer === beat ? 'b' : '?')).join('')).toBe('AbbbAbbb');
    eng.setMetronome(false);
  });

  it('stop() during the count-in takes back every click not yet sounded', () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0, tracks: [] });
    const ctx = clock(eng);
    ctx.currentTime = 0;
    eng.countIn(1);
    ctx.currentTime = 0.6;                                                 // two clicks in
    eng.stop();
    expect(ctx.stops.map((s) => s.at)).toEqual([0.6, 0.6, 0.6, 0.6]);      // every click told to stop now (sounded ones are over)
    expect(eng.isRunning).toBe(false);
  });
});

describe('(4) takes: on every pass of their bars, cut at the next pass, stopped by STOP', () => {
  const take = (over: Partial<EngineTake> = {}): EngineTake => ({ id: 't1', buffer: buf(3), startBar: 1, gain: 0.9, trimStart: 0, trimEnd: 0, muted: false, ...over });

  it('pure: the loop rule (the booth\'s: bar % loop === startBar; a start outside the loop never plays), the span, the adapter', () => {
    const t = take({ loopBars: 4 });
    expect([0, 1, 2, 3, 4, 5, 9, 13].filter((b) => takeStartsAt(t, b, null))).toEqual([1, 5, 9, 13]);
    expect([0, 1, 5].filter((b) => takeStartsAt(take({ startBar: 5, loopBars: 4 }), b, null))).toEqual([]);
    expect([1, 3, 5].filter((b) => takeStartsAt(take(), b, 2))).toEqual([1, 3, 5]);           // the song's length when it has none
    expect([1, 3, 5].filter((b) => takeStartsAt(take(), b, null))).toEqual([1]);              // neither: once
    expect(takeSpan(take(), 10)).toEqual({ when: 10, offset: 0, duration: 3 });
    expect(takeSpan(take({ trimStart: 0.25, trimEnd: 2 }), 10)).toEqual({ when: 10.25, offset: 0.25, duration: 1.75 });   // a gate: it keeps its place
    expect(takeSpan(take({ trimEnd: 9 }), 0)!.duration).toBe(3);                              // past the buffer = its end
    expect(takeSpan(take({ trimStart: 3 }), 0)).toBeNull();
    expect(takeFromShot({ id: 'x', buffer: buf(), atBar: 2, gain: 0.7 })).toMatchObject({ id: 'x', startBar: 2, gain: 0.7, trimStart: 0, trimEnd: 0, muted: false });
  });

  it('a 1-bar take at bar 1 of a 2-bar loop sounds on bars 1, 3, 5 — each pass cut at the next — and STOP stops it at once', () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0, tracks: [] });
    eng.setTakes([take({ loopBars: 2 })]);                                 // 3 s of audio, bars are 2 s: cut at 4 s (its next pass)
    const ctx = clock(eng);
    ctx.currentTime = 0; eng.start();
    run(eng, LEAD + 5 * BAR + 0.5);
    const passes = ctx.starts.map((s: FakeStart) => ({ at: +(s.at - LEAD).toFixed(9), offset: s.offset, duration: s.duration }));
    expect(passes).toEqual([1, 3, 5].map((b) => ({ at: b * BAR, offset: 0, duration: 3 })).map((p) => ({ ...p, duration: Math.min(3, 2 * BAR) })));
    const playing = ctx.starts[2].src!;
    expect(playing.stoppedAt).toBeNull();
    eng.stop();                                                            // mid-pass (bar 5 is sounding)
    expect(playing.stoppedAt).toBe(ctx.currentTime);
    expect(eng.isRunning).toBe(false);
  });

  it('song length from setSongBars; a muted take never starts; unmuting starts it at its next pass; a changed take stops at once', () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0, tracks: [] });
    eng.setSongBars(3);
    const a = take({ id: 'a', startBar: 0, buffer: buf(1) }), b = take({ id: 'b', startBar: 2, muted: true, buffer: buf(1) });
    eng.setTakes([a, b]);
    const ctx = clock(eng);
    ctx.currentTime = 0; eng.start();
    run(eng, LEAD + 3 * BAR + 0.3);                                        // bars 0..3: a on 0 and 3, b muted
    expect(ctx.starts.map((s) => Math.round((s.at - LEAD) / BAR))).toEqual([0, 3]);
    eng.setTakes([a, { ...b, muted: false }]);
    run(eng, LEAD + 6 * BAR + 0.3, LEAD + 3 * BAR + 0.3);                  // bars 4..6: b on 5, a on 6
    expect(ctx.starts.map((s) => Math.round((s.at - LEAD) / BAR))).toEqual([0, 3, 5, 6]);
    const aNow = ctx.starts[3].src!;
    eng.setTakes([{ ...a, buffer: buf(1) }, { ...b, muted: false }]);      // a re-recorded mid-pass: the old one stops now
    expect(aNow.stoppedAt).toBe(ctx.currentTime);
    eng.stop();
  });

  it('a pass whose bar line went by in a stall joins late, at the offset it would have reached — not from its top', () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0, tracks: [] });
    eng.setTakes([take({ startBar: 0, loopBars: 1 })]);                   // every bar
    const ctx = clock(eng);
    ctx.currentTime = 0; eng.start();
    run(eng, LEAD + BAR - 0.3);                                           // bar 0's pass is playing; bar 1's line not reached
    expect(ctx.starts).toHaveLength(1);
    ctx.currentTime = LEAD + BAR + 0.3; fake.tick();                       // the main thread stalls across bar 1's line
    expect(ctx.starts).toHaveLength(2);
    const s = ctx.starts[1];
    expect(s.at).toBeCloseTo(ctx.currentTime, 9);
    expect(s.offset).toBeCloseTo(0.3, 9);
    expect(s.duration).toBeCloseTo(BAR - 0.3, 9);                          // still cut where its next pass begins
    eng.stop();
  });

  it('the old one-shots (SongPanel) still play once at their bar, and the song render places each take once, gated by its trims', async () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0, tracks: [] });
    eng.setOneShots([{ id: 'v', buffer: buf(1), atBar: 1, gain: 0.8 }]);
    const ctx = clock(eng);
    ctx.currentTime = 0; eng.start(); run(eng, LEAD + 4 * BAR); eng.stop();
    expect(ctx.starts.map((s) => Math.round((s.at - LEAD) / BAR))).toEqual([1]);
    const before = FakeOfflineAudioContext.created.length;
    await eng.renderSong([[], [], []], [{ id: '1', buffer: buf(1), atBar: 2, gain: 0.8, trimStart: 0.1, trimEnd: 0.6 }, { buffer: buf(1), atBar: 0, gain: 1, muted: true }], 8);
    const off = FakeOfflineAudioContext.created[before];
    expect(off.starts.map((s) => [s.at, s.offset, s.duration])).toEqual([[2 * BAR + 0.1, 0.1, 0.5]]);
  });
});

// ── MUSIC-SUITE P4 FIX PASS (2026-09-25) ────────────────────────────────────────────────────────────────────────────
describe('P4 FIX PASS: a take\'s GAIN and TRIM move the pass that is playing', () => {
  const take = (over: Partial<EngineTake> = {}): EngineTake => ({ id: 't1', buffer: buf(3), startBar: 0, loopBars: 4, gain: 0.9, trimStart: 0, trimEnd: 0, muted: false, ...over });
  it('a GAIN move glides the sounding pass\'s gain at once, and the pass keeps playing (it waited up to a whole loop)', () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0, tracks: [] });
    const t = take();
    eng.setTakes([t]);
    const ctx = clock(eng);
    ctx.currentTime = 0; eng.start();
    run(eng, LEAD + 1.0);                                                  // 1 s into bar 0's pass
    const pass = ctx.starts[0].src!;
    const gainNode = pass.outputs[0] as unknown as { gain: { value: number; setTargetAtTime: (v: number, at: number, tc: number) => unknown } };
    const glides: [number, number][] = [];
    const orig = gainNode.gain.setTargetAtTime.bind(gainNode.gain);
    gainNode.gain.setTargetAtTime = (v, at, tc) => { glides.push([v, at]); return orig(v, at, tc); };
    eng.setTakes([{ ...t, gain: 0.3 }]);
    expect(glides).toEqual([[0.3, ctx.currentTime]]);
    expect(gainNode.gain.value).toBe(0.3);
    expect(pass.stoppedAt).toBeNull();                                     // not stopped
    expect(ctx.starts).toHaveLength(1);                                    // and not restarted
    eng.stop();
  });
  it('a TRIM move restarts the pass NOW at the offset it has reached (it went silent until the next pass)', () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0, tracks: [] });
    const t = take();
    eng.setTakes([t]);
    const ctx = clock(eng);
    ctx.currentTime = 0; eng.start();
    run(eng, LEAD + 1.0);
    const first = ctx.starts[0];
    eng.setTakes([{ ...t, trimEnd: 2.5 }]);                               // the OUT handle dragged
    expect(first.src!.stoppedAt).toBe(ctx.currentTime);
    expect(ctx.starts).toHaveLength(2);
    const again = ctx.starts[1];
    expect(again.at).toBeCloseTo(ctx.currentTime, 9);                     // at once
    expect(again.offset).toBeCloseTo(ctx.currentTime - LEAD, 9);           // where the take had got to on the grid
    expect(again.duration).toBeCloseTo(2.5 - (ctx.currentTime - LEAD), 9); // up to the new end
    eng.setTakes([{ ...t, trimEnd: 2.5, trimStart: 0.2 }]);               // IN dragged past a gate already behind us: same offset
    expect(ctx.starts[2].offset).toBeCloseTo(ctx.currentTime - LEAD, 9);
    eng.setTakes([{ ...t, trimEnd: 2.5, trimStart: 0.2, startBar: 1 }]);  // moved to another bar: stops, starts at its bar
    expect(ctx.starts).toHaveLength(3);
    eng.stop();
  });
});

describe('P4 FIX PASS: a count-in INTO a bar of the running song (the booth\'s RECORD over a playing song)', () => {
  it('countInBefore(3, 1): four count clicks on bar 2\'s beats, the first accented; nothing when stopped; stop() takes them back', () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0.3, tracks: [] });
    expect(eng.countInBefore(3, 1)).toEqual([]);                           // not running
    const ctx = clock(eng);
    ctx.currentTime = 0; eng.start();
    run(eng, LEAD + 0.5);
    const clicks = eng.countInBefore(3, 1);
    expect(clicks.map((c) => +(c.at - LEAD - 2 * BAR).toFixed(9))).toEqual([0, 0.5, 1, 1.5]);   // bar 2, never swung
    expect(clicks.map((c) => c.kind)).toEqual(['countAccent', 'count', 'count', 'count']);
    const acc = clickBuffer(ctx as unknown as BaseAudioContext, 'countAccent');
    expect(ctx.starts.filter((s) => s.buffer === acc)).toHaveLength(1);
    expect(eng.countInBefore(0, 1)).toEqual([]);                           // no bar before bar 0
    const n = ctx.stops.length;
    eng.stop();
    expect(ctx.stops.length - n).toBe(4);                                  // every count click told to stop
  });
  it('a click already gone by is not placed (a count-in asked for too late only plays what is left)', () => {
    const eng = new AudioEngine({ bpm: BPM, steps: STEPS, swing: 0, tracks: [] });
    const ctx = clock(eng);
    ctx.currentTime = 0; eng.start();
    run(eng, LEAD + BAR + 0.75);                                           // 0.75 s into bar 1
    expect(eng.countInBefore(2, 1).map((c) => +(c.at - LEAD - BAR).toFixed(9))).toEqual([1, 1.5]);
    eng.stop();
  });
});
