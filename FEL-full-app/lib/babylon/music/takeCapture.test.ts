// MUSIC-SUITE P4 (2026-09-25): the recording booth's clock — the take is cut where the singer's downbeat lands, it loops on
// its bars, and best-of-N keeps every attempt. Pure (node): the capture is simulated block by block on the context clock.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CAPTURE_CHUNK_FRAMES, PREROLL_SEC, barSec, boothLatency, clampRegion, engineTakeList, firstTransient, gatePcm, gatedBuffer,
  levels, meterFill, muteRecordingSlot, pickTake, pickedTakeIds, scriptProcessorBlockFrame, takeGroups, takeSilence, takeSlot,
  takeStartBar, takeStartFrame, tapeCut, tapeDropBefore, tapeEnd, toDb, wavFromPcm, watchBarLine, type BarClock, type BoothTake, type TapeChunk,
} from './takeCapture';
import { migrateProject, newProject, readTakeRegion, type ProjectTake } from './StudioProject';
import { AudioEngine, takeStartsAt, type EngineTake, type TrackState } from './AudioEngine';
import { FakeAudioBuffer, installFakeWebAudio, type FakeAudioContext, type FakeWebAudio } from './fakeWebAudio';

// ── a simulated input: what the worklet posts ──────────────────────────────────────────────────────────────────────
/**
 * The mic as the capture node sees it, from context frame `from` to `to`: a low noise floor plus, if given, a click (a
 * 2 ms 0.8 burst) whose first sample reaches the graph at context frame `clickFrame`. Posted as the worklet posts it:
 * render quanta of 128 frames stamped with `currentFrame`, gathered into CAPTURE_CHUNK_FRAMES chunks.
 */
function workletTape(o: { from: number; to: number; sr: number; clickFrame?: number; seed?: number }): TapeChunk[] {
  let seed = o.seed ?? 7;
  const noise = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return ((seed / 0x7fffffff) - 0.5) * 0.004; };
  const clickLen = Math.round(0.002 * o.sr);
  const chunks: TapeChunk[] = [];
  const start = Math.floor(o.from / 128) * 128;            // currentFrame is always a quantum boundary
  for (let f = start; f < o.to; f += CAPTURE_CHUNK_FRAMES) {
    const pcm = new Float32Array(Math.min(CAPTURE_CHUNK_FRAMES, o.to - f));
    for (let i = 0; i < pcm.length; i++) {
      const at = f + i;
      pcm[i] = noise();
      if (o.clickFrame !== undefined && at >= o.clickFrame && at < o.clickFrame + clickLen) pcm[i] = 0.8;
    }
    chunks.push({ frame: f, pcm });
  }
  return chunks;
}

/** A singer dead on the bar at audio time T: their click reaches the graph at T + L_out + L_in (the formula). */
function sungOnTheBar(T: number, lat: { outSec: number; inSec: number }, sr: number): number {
  return Math.round((T + lat.outSec + lat.inSec) * sr);
}

describe('latency: capture start = bar time + L_out + L_in', () => {
  it('device terms add up: baseLatency + outputLatency out, the track\'s latency in', () => {
    const l = boothLatency({ baseLatency: 0.01, outputLatency: 0.032, trackLatency: 0.012, savedOffsetMs: null });
    expect(l.outSec).toBeCloseTo(0.042, 9); expect(l.inSec).toBeCloseTo(0.012, 9); expect(l.totalSec).toBeCloseTo(0.054, 9);
    expect([l.outFrom, l.inFrom]).toEqual(['device', 'track']);
  });
  it('the saved calibration is what the player hears: it replaces the device\'s output figures (P2\'s rule)', () => {
    const l = boothLatency({ baseLatency: 0.01, outputLatency: 0.032, trackLatency: 0.01, savedOffsetMs: 225 });
    expect(l.outSec).toBeCloseTo(0.225, 9); expect(l.totalSec).toBeCloseTo(0.235, 9); expect(l.outFrom).toBe('calibration');
  });
  it('a browser that reports nothing gives 0 (said: outFrom/inFrom none); a broken report is capped, a negative one ignored', () => {
    expect(boothLatency({})).toEqual({ outSec: 0, inSec: 0, totalSec: 0, outFrom: 'none', inFrom: 'none', graphSec: 0 });
    expect(boothLatency({ outputLatency: 7, baseLatency: -1, trackLatency: Number.NaN }).outSec).toBe(0.5);
    expect(boothLatency({ outputLatency: 7, trackLatency: Number.NaN }).inFrom).toBe('none');
  });
  it('P4 FIX PASS: the DESK\'s delay (the limiter\'s 6 ms, 12 with MASTER) is part of L_out on every path — a calibration does not hold it', () => {
    const cal = boothLatency({ savedOffsetMs: 225, trackLatency: 0.01, graphLatencySec: 0.006 });
    expect(cal.outSec).toBeCloseTo(0.231, 9); expect(cal.totalSec).toBeCloseTo(0.241, 9); expect(cal.graphSec).toBe(0.006);
    const dev = boothLatency({ baseLatency: 0.01, outputLatency: 0.032, graphLatencySec: 0.012 });
    expect(dev.outSec).toBeCloseTo(0.054, 9); expect(dev.outFrom).toBe('device');
    expect(boothLatency({ graphLatencySec: 0.006 })).toMatchObject({ outSec: 0.006, outFrom: 'none', graphSec: 0.006 });
    expect(boothLatency({ graphLatencySec: Number.NaN }).graphSec).toBe(0);
  });
});

describe('alignment: a click sung on the bar lands on the bar in the take (≤ 10 ms)', () => {
  const cases = [
    { sr: 48000, T: 3.2, lat: { baseLatency: 0.01, outputLatency: 0.032, trackLatency: 0.012 } },
    { sr: 44100, T: 11.73, lat: { baseLatency: 0.0058, outputLatency: 0.0, trackLatency: 0.0 } },
    { sr: 48000, T: 64.05, lat: { baseLatency: 0.01, outputLatency: 0.19, trackLatency: 0.07 } },   // Bluetooth-ish
    { sr: 44100, T: 0.35, lat: { baseLatency: 0.0029, outputLatency: 0.0121, trackLatency: 0.0101 } },
  ];
  for (const c of cases) {
    it(`${c.sr} Hz, bar at ${c.T} s, round trip ${((c.lat.baseLatency + c.lat.outputLatency + c.lat.trackLatency) * 1000).toFixed(1)} ms`, () => {
      const L = boothLatency({ ...c.lat, savedOffsetMs: null });
      const clickFrame = sungOnTheBar(c.T, L, c.sr);
      // the tape runs from well before the bar (ARM) to well after it, on quantum boundaries, never aligned to the bar
      const tape = workletTape({ from: Math.round((c.T - 1.3) * c.sr) + 37, to: Math.round((c.T + 2) * c.sr), sr: c.sr, clickFrame });
      const start = takeStartFrame(c.T, L.totalSec, c.sr);
      const { pcm, gaps } = tapeCut(tape, start, start + Math.round(1.5 * c.sr));
      expect(gaps).toBe(0);
      const onsetMs = (firstTransient(pcm, 0.2) / c.sr) * 1000;   // the take plays from the bar: 0 ms = on the bar
      expect(Math.abs(onsetMs)).toBeLessThanOrEqual(10);
      expect(Math.abs(onsetMs)).toBeLessThan(0.05);                 // in fact to the sample
    });
  }

  it('the ScriptProcessor fallback stamps a block 2 × bufferSize before its playbackTime (Chromium), and aligns the same', () => {
    const sr = 48000, size = CAPTURE_CHUNK_FRAMES, T = 5.5;
    const L = boothLatency({ baseLatency: 0.01, outputLatency: 0.02, trackLatency: 0.01 });
    const clickFrame = sungOnTheBar(T, L, sr);
    const real = workletTape({ from: Math.round(4 * sr), to: Math.round(8 * sr), sr, clickFrame });
    // what onaudioprocess reports for each block, re-stamped by the fallback's formula
    const restamped = real.map((c) => ({ frame: scriptProcessorBlockFrame((c.frame + 2 * size) / sr, size, sr), pcm: c.pcm }));
    expect(restamped.map((c) => c.frame)).toEqual(real.map((c) => c.frame));
    const start = takeStartFrame(T, L.totalSec, sr);
    const onset = firstTransient(tapeCut(restamped, start, start + sr).pcm);
    expect(Math.abs((onset / sr) * 1000)).toBeLessThanOrEqual(10);
  });

  it('BEFORE (P1, a model): a recorder started in onBar — 100 ms ahead of the bar — put the same click 142 ms late', () => {
    // SongPanel then: onBar fired as the scheduler crossed the bar (SCHEDULE_AHEAD_S 0.1 s early) → getUserMedia →
    // MediaRecorder.start(); the take was placed ON the bar. Even with the mic already granted and a recorder that starts
    // instantly (both generous), its first sample is 100 ms before the bar and no latency is taken off.
    const sr = 48000, T = 3.2;
    const L = boothLatency({ baseLatency: 0.01, outputLatency: 0.032, trackLatency: 0 });
    const tape = workletTape({ from: Math.round(2 * sr), to: Math.round(5 * sr), sr, clickFrame: sungOnTheBar(T, L, sr) });
    const oldStart = Math.round((T - 0.1) * sr);
    const oldMs = (firstTransient(tapeCut(tape, oldStart, oldStart + sr).pcm) / sr) * 1000;
    expect(oldMs).toBeCloseTo(142, 0);
    const newStart = takeStartFrame(T, L.totalSec, sr);
    expect(Math.abs((firstTransient(tapeCut(tape, newStart, newStart + sr).pcm) / sr) * 1000)).toBeLessThan(0.05);
  });

  it('a click sung 30 ms late is 30 ms late in the take — the booth aligns the clock, it does not quantize the singer', () => {
    const sr = 48000, T = 2;
    const L = boothLatency({ baseLatency: 0.01, outputLatency: 0.03 });
    const tape = workletTape({ from: sr, to: 4 * sr, sr, clickFrame: sungOnTheBar(T + 0.03, L, sr) });
    const start = takeStartFrame(T, L.totalSec, sr);
    expect((firstTransient(tapeCut(tape, start, start + sr).pcm) / sr) * 1000).toBeCloseTo(30, 0);
  });
});

describe('the tape', () => {
  it('a dropout is silence in place (counted), never a shift: the samples after it keep their frames', () => {
    const sr = 48000;
    const tape = workletTape({ from: 0, to: sr, sr, clickFrame: 30000 });
    const holed = tape.filter((c) => !(c.frame >= 8192 && c.frame < 12288));   // two chunks lost
    const { pcm, gaps } = tapeCut(holed, 0, sr);
    expect(gaps).toBe(4096);
    expect(firstTransient(pcm)).toBe(30000);
    expect(pcm.subarray(8192, 12288).every((x) => x === 0)).toBe(true);
  });
  it('a cut that starts before the tape is silence up front; the end and the pre-roll trim are exact', () => {
    const tape = workletTape({ from: 1024, to: 9000, sr: 48000 });
    expect(tapeEnd(tape)).toBe(9000);
    expect(tapeCut(tape, 0, 2048).gaps).toBe(1024);
    const kept = tapeDropBefore(tape, 4096);
    expect(kept[0].frame).toBe(3072);            // the chunk holding frame 4096 stays whole
    expect(tapeEnd(kept)).toBe(9000);
    expect(PREROLL_SEC).toBeGreaterThan(0);
  });
});

describe('the region and the start bar', () => {
  it('clampRegion keeps a region inside its loop', () => {
    expect(clampRegion({ fromBar: 6, bars: 8, loopBars: 4 })).toEqual({ fromBar: 3, bars: 1, loopBars: 4 });
    expect(clampRegion({ fromBar: 1, bars: 2, loopBars: 8 })).toEqual({ fromBar: 1, bars: 2, loopBars: 8 });
    expect(clampRegion({ fromBar: -3, bars: 0, loopBars: 0 })).toEqual({ fromBar: 0, bars: 1, loopBars: 1 });
  });
  it('stopped: the count-in comes before bar 0, so a region at bar 1 starts on engine bar 0 + its offset', () => {
    expect(takeStartBar({ currentBar: 0, running: false, countInBars: 1, region: { fromBar: 0, bars: 4, loopBars: 4 } })).toBe(0);
    expect(takeStartBar({ currentBar: 0, running: false, countInBars: 2, region: { fromBar: 2, bars: 2, loopBars: 8 } })).toBe(2);
    // an engine with no count-in of its own: the song's first bars count the singer in, then the region's next pass
    expect(takeStartBar({ currentBar: 0, running: false, countInBars: 1, region: { fromBar: 0, bars: 4, loopBars: 4 }, engineCounts: false })).toBe(4);
    expect(takeStartBar({ currentBar: 0, running: false, countInBars: 2, region: { fromBar: 2, bars: 2, loopBars: 8 }, engineCounts: false })).toBe(2);
  });
  it('running: never the bar the scheduler is already in; the count-in bars come first; then the region\'s next pass', () => {
    // in bar 5 of a 4-bar loop, count-in 1 → earliest 7 → the next loop start is 8
    expect(takeStartBar({ currentBar: 5, running: true, countInBars: 1, region: { fromBar: 0, bars: 4, loopBars: 4 } })).toBe(8);
    // no count-in: the next bar that is the region's bar 3 (0-based 2) of an 8-bar song
    expect(takeStartBar({ currentBar: 10, running: true, countInBars: 0, region: { fromBar: 2, bars: 2, loopBars: 8 } })).toBe(18);
    expect(takeStartBar({ currentBar: 0, running: true, countInBars: 0, region: { fromBar: 1, bars: 1, loopBars: 1 } })).toBe(1);
  });
  it('barSec is 4 beats of 16ths', () => { expect(barSec(120)).toBeCloseTo(2, 9); expect(barSec(92)).toBeCloseTo(2.6087, 3); });

  it('watchBarLine hears the bar\'s step 0 with its audio time, keeps the old handler running, and puts it back', () => {
    const judged: number[] = [];
    const judge = (step: number): void => { judged.push(step); };
    const eng = { onStepScheduled: judge as BarClock['onStepScheduled'], currentBar: 0 };
    const heard: number[] = [];
    watchBarLine(eng, 2, (t) => heard.push(t));
    const snd = { hits: 0, gridLive: false };
    for (let bar = 0; bar < 4; bar++) {
      eng.currentBar = bar;
      for (let s = 0; s < 16; s++) eng.onStepScheduled?.(s, bar * 2 + s * 0.125, snd);
    }
    expect(heard).toEqual([4]);                 // bar 2's line, once
    expect(judged).toHaveLength(64);            // the PERFORM judge saw every step
    expect(eng.onStepScheduled).toBe(judge);    // and has its seat back
    // unwatch before the bar: nothing heard; a watcher replaced by someone else is left alone
    const u = watchBarLine(eng, 9, () => heard.push(-1)); u();
    expect(eng.onStepScheduled).toBe(judge);
    const u2 = watchBarLine(eng, 9, () => undefined); const other = (): void => undefined; eng.onStepScheduled = other; u2();
    expect(eng.onStepScheduled).toBe(other);
  });
});

// ── the REAL engine on a fake clock: the booth's list, played (fakeWebAudio logs every start and stop) ──────────────
describe('the engine plays the booth\'s takes: every pass, cut on STOP, counted in (AudioEngine on fakeWebAudio)', () => {
  const BPM = 120, SR = 44100, BAR = barSec(BPM), TICK = 0.025;
  let fake: FakeWebAudio;
  beforeEach(() => { fake = installFakeWebAudio(); });
  afterEach(() => fake.uninstall());

  function room(): { eng: AudioEngine; ctx: FakeAudioContext } {
    const kick: TrackState = { sampleId: 'kick', pattern: [true, ...new Array<boolean>(15).fill(false)], volume: 0.8, muted: false, pan: 0 };
    const eng = new AudioEngine({ bpm: BPM, steps: 16, tracks: [kick], swing: 0 });
    eng.loadBuffer('kick', 'Kick', new FakeAudioBuffer(1, 441, SR) as unknown as AudioBuffer, 'kick');
    return { eng, ctx: eng.context as unknown as FakeAudioContext };
  }
  /** Run the scheduler until the clock reaches `untilSec` (the browser's 25 ms timer, a fake clock). */
  function runTo(eng: AudioEngine, ctx: FakeAudioContext, untilSec: number): void {
    while (ctx.currentTime < untilSec) { ctx.currentTime = Math.round((ctx.currentTime + TICK) * 1e6) / 1e6; fake.tick(); }
  }
  // MUSIC-SUITE P4 FIX PASS: the booth hands the engine its takes as they are (the trim-in is the engine's own gate)
  const toEngine = (t: BoothTake, _ctx: FakeAudioContext): EngineTake => t;
  const takeStarts = (ctx: FakeAudioContext, buffer: unknown) => ctx.starts.filter((s) => s.buffer === buffer);

  it('LOOP: a take on bar 3 of a 4-bar loop starts on engine bars 2, 6, 10 — each on its bar line, each at most its 1 bar', () => {
    const { eng, ctx } = room();
    const audio = new FakeAudioBuffer(1, Math.round(3 * SR), SR) as unknown as AudioBuffer;   // 3 s sung over a 2 s bar
    const t = take('v', { atBar: 2, bars: 1, loopBars: 4, durationSec: 3 });
    eng.setTakes(engineTakeList([t], new Map([['v', audio]]), { songMode: false, songBars: 0, bpm: BPM }).map((x) => toEngine(x, ctx)));
    eng.start();
    const bar0 = eng.songStartSec;
    runTo(eng, ctx, bar0 + 12 * BAR);
    const starts = takeStarts(ctx, audio);
    expect(starts.map((s) => Math.round((s.at - bar0) / BAR * 1000) / 1000)).toEqual([2, 6, 10]);
    for (const s of starts) {
      expect(s.offset ?? 0).toBe(0);
      expect((s.duration ?? Infinity)).toBeLessThanOrEqual(BAR + 1e-9);          // never past its region
    }
    // the rule the engine used is the booth's region: bar ≡ atBar (mod loop)
    expect(Array.from({ length: 12 }, (_, b) => b).filter((b) => takeStartsAt({ startBar: 2, loopBars: 4 }, b, null))).toEqual([2, 6, 10]);
    eng.stop();
  });

  it('SONG MODE: the take follows the song\'s length, not its own loop (a 3-bar chain → bars 1, 4, 7, 10)', () => {
    const { eng, ctx } = room();
    const audio = new FakeAudioBuffer(1, SR, SR) as unknown as AudioBuffer;
    const t = take('s', { atBar: 1, bars: 1, loopBars: 8, durationSec: 1 });
    eng.setTakes(engineTakeList([t], new Map([['s', audio]]), { songMode: true, songBars: 3, bpm: BPM }).map((x) => toEngine(x, ctx)));
    eng.start();
    runTo(eng, ctx, eng.songStartSec + 11 * BAR);
    expect(takeStarts(ctx, audio).map((s) => Math.round((s.at - eng.songStartSec) / BAR))).toEqual([1, 4, 7, 10]);
    eng.stop();
  });

  it('STOP silences: the take sounding when STOP is pressed is stopped at that instant, and nothing starts after', () => {
    const { eng, ctx } = room();
    const audio = new FakeAudioBuffer(1, Math.round(1.8 * SR), SR) as unknown as AudioBuffer;
    eng.setTakes(engineTakeList([take('v', { atBar: 0, bars: 1, loopBars: 1, durationSec: 1.8 })], new Map([['v', audio]]), { songMode: false, songBars: 0, bpm: BPM }).map((x) => toEngine(x, ctx)));
    eng.start();
    runTo(eng, ctx, eng.songStartSec + 2 * BAR + 0.5);             // inside bar 2's pass of the take
    const before = takeStarts(ctx, audio).length;
    expect(before).toBe(3);
    const sounding = takeStarts(ctx, audio).filter((s) => s.at <= ctx.currentTime);
    const stopAt = ctx.currentTime;
    eng.stop();
    const stopped = new Set(ctx.stops.filter((x) => x.at === stopAt).map((x) => x.src));
    expect(sounding.every((s) => stopped.has(s.src!) || s.at + (s.duration ?? 0) <= stopAt)).toBe(true);
    expect(stopped.has(sounding[sounding.length - 1].src!)).toBe(true);   // the pass in progress: cut at STOP
    runTo(eng, ctx, stopAt + 4 * BAR);
    expect(takeStarts(ctx, audio)).toHaveLength(before);            // no pass after STOP
  });

  it('muting a take silences it at once; unmuting brings it back at its next pass', () => {
    const { eng, ctx } = room();
    const audio = new FakeAudioBuffer(1, Math.round(1.5 * SR), SR) as unknown as AudioBuffer;
    const t = take('v', { atBar: 0, bars: 1, loopBars: 1, durationSec: 1.5 });
    const list = (muted: boolean) => engineTakeList([{ ...t, muted }], new Map([['v', audio]]), { songMode: false, songBars: 0, bpm: BPM }).map((x) => toEngine(x, ctx));
    eng.setTakes(list(false)); eng.start();
    runTo(eng, ctx, eng.songStartSec + 0.5);
    const muteAt = ctx.currentTime;
    eng.setTakes(list(true));
    expect(ctx.stops.some((x) => x.at === muteAt && x.src === takeStarts(ctx, audio)[0].src)).toBe(true);
    runTo(eng, ctx, eng.songStartSec + 2.5 * BAR);
    expect(takeStarts(ctx, audio)).toHaveLength(1);                 // muted through bars 1 and 2
    eng.setTakes(list(false));
    runTo(eng, ctx, eng.songStartSec + 3.5 * BAR);
    expect(takeStarts(ctx, audio).map((s) => Math.round((s.at - eng.songStartSec) / BAR))).toEqual([0, 3]);
    eng.stop();
  });

  it('TRIM IN is a gate (P4 FIX PASS: the engine\'s own — no gated copy): the pass starts 0.3 s after the bar line, 0.3 s in', () => {
    const { eng, ctx } = room();
    const audio = new FakeAudioBuffer(1, SR, SR) as unknown as AudioBuffer;
    audio.getChannelData(0).fill(0.5);
    const list = engineTakeList([take('v', { atBar: 0, bars: 1, loopBars: 1, durationSec: 1, trimStart: 0.3, trimEnd: 0.2 })], new Map([['v', audio]]), { songMode: false, songBars: 0, bpm: BPM });
    expect(list[0]).toMatchObject({ trimStart: 0.3 });
    expect(list[0]).not.toHaveProperty('gateSec');
    expect(list[0].buffer).toBe(audio);                              // the recording itself, not a copy
    expect(list[0].trimEnd).toBeCloseTo(0.8, 9);                     // the engine's END position (1 s − 0.2 s)
    eng.setTakes(list); eng.start();
    runTo(eng, ctx, eng.songStartSec + 0.5);
    const s = takeStarts(ctx, audio)[0];
    expect(s.at).toBeCloseTo(eng.songStartSec + 0.3, 9);             // on the grid: 0.3 s after the bar line …
    expect(s.offset).toBeCloseTo(0.3, 9);                            // … 0.3 s into the take — never slid early
    expect(s.duration).toBeCloseTo(0.5, 9);
    // the same audible result as the old gated copy: silence to 0.3 s, then the take at its own place
    const gated = gatedBuffer(ctx as unknown as BaseAudioContext, audio, 0.3).getChannelData(0);
    expect(gated[Math.round(0.29 * SR)]).toBe(0); expect(gated[Math.round(0.31 * SR)]).toBe(0.5);
    expect(audio.getChannelData(0)[0]).toBe(0.5);                    // the recording itself is untouched
    eng.stop();
  });

  it('COUNT-IN: RECORD from a stop counts in; the bar watcher hears bar 0 at the engine\'s songStartSec, after every count click', () => {
    const { eng, ctx } = room();
    ctx.currentTime = 1.234;
    let heard: number | null = null;
    watchBarLine(eng, takeStartBar({ currentBar: eng.currentBar, running: false, countInBars: 1, region: { fromBar: 0, bars: 2, loopBars: 4 } }), (t) => { heard = t; });
    const { startAt, clicks } = eng.countIn(1);
    expect(clicks).toHaveLength(4);
    expect(eng.isRunning).toBe(true);
    runTo(eng, ctx, startAt + 0.2);
    expect(heard).toBeCloseTo(startAt, 9);
    expect(startAt - clicks[0].at).toBeCloseTo(BAR, 9);
    expect(clicks.every((c) => c.at < startAt)).toBe(true);
    eng.stop();
  });

  it('END TO END: a click sung on bar 0 during the take is heard on the bar line of every later pass (within 10 ms)', () => {
    const { eng, ctx } = room();
    const L = boothLatency({ baseLatency: 0.01, outputLatency: 0.025, trackLatency: 0.01 });
    // record: the take's start bar is heard at songStartSec; the singer's click reaches the tape at T + L (the formula)
    eng.countIn(1);
    const T = eng.songStartSec;
    const tape = workletTape({ from: Math.round((T - 1) * SR), to: Math.round((T + 3) * SR), sr: SR, clickFrame: sungOnTheBar(T, L, SR) });
    const start = takeStartFrame(T, L.totalSec, SR);
    const { pcm } = tapeCut(tape, start, start + Math.round(BAR * SR));
    const onsetSec = firstTransient(pcm) / SR;
    eng.stop();
    // play it back on the grid (a 1-bar region looping every bar): where does the click sound on each pass?
    const audio = new FakeAudioBuffer(1, pcm.length, SR) as unknown as AudioBuffer;
    audio.getChannelData(0).set(pcm);
    eng.setTakes(engineTakeList([take('v', { atBar: 0, bars: 1, loopBars: 1, durationSec: pcm.length / SR })], new Map([['v', audio]]), { songMode: false, songBars: 0, bpm: BPM }).map((x) => toEngine(x, ctx)));
    eng.start();
    const bar0 = eng.songStartSec;
    runTo(eng, ctx, bar0 + 3.5 * BAR);
    const heardAt = takeStarts(ctx, audio).map((s) => s.at - (s.offset ?? 0) + onsetSec);
    expect(heardAt).toHaveLength(4);
    heardAt.forEach((h, pass) => expect(Math.abs(h - (bar0 + pass * BAR)) * 1000).toBeLessThanOrEqual(10));
    eng.stop();
  });

  it('a take whose start is outside the loop never sounds (and the booth says why)', () => {
    const t = take('x', { atBar: 5, loopBars: 8 });
    expect(engineTakeList([t], new Map([['x', buf(8)]]), { songMode: true, songBars: 4, bpm: BPM })).toEqual([]);
    expect(takeSilence(t, { picked: true, songMode: true, songBars: 4, loaded: true, missing: false })).toBe('outside the 4-bar song');
    expect(takeSilence(t, { picked: true, songMode: false, songBars: 4, loaded: true, missing: false })).toBeNull();
  });

  it('gatePcm silences the trimmed ends in place and leaves the recording untouched', () => {
    const pcm = new Float32Array(10).fill(1);
    expect([...gatePcm(pcm, 10, 0.2, 0.3)]).toEqual([0, 0, 1, 1, 1, 1, 1, 0, 0, 0]);
    expect([...pcm]).toEqual(new Array(10).fill(1));
  });
});

// ── best of N ────────────────────────────────────────────────────────────────────────────────────────────────────
const REF = { key: 'aud_x', mime: 'audio/wav', bytes: 1 };
function take(id: string, o: Partial<ProjectTake> = {}): ProjectTake {
  return { id, atBar: 0, bars: 4, loopBars: 4, gain: 0.9, durationSec: 8, trimStart: 0, trimEnd: 0, muted: false, pickedAt: 0, audio: REF, ...o };
}
const buf = (duration: number): AudioBuffer => ({ duration } as unknown as AudioBuffer);

describe('best of N', () => {
  const a = take('a', { pickedAt: 1 }), b = take('b', { pickedAt: 2 }), c = take('c', { atBar: 2, bars: 2, pickedAt: 3 });
  it('takes over the same bars are one group; the newest plays; the others are kept', () => {
    expect(takeSlot(a)).toBe(takeSlot(b)); expect(takeSlot(a)).not.toBe(takeSlot(c));
    expect([...pickedTakeIds([a, b, c])].sort()).toEqual(['b', 'c']);
    const groups = takeGroups([a, b, c]);
    expect(groups.map((g) => [g.slot, g.takes.map((t) => t.id), g.picked])).toEqual([['0+4', ['a', 'b'], 'b'], ['2+2', ['c'], 'c']]);
  });
  it('a new take appended by the room (StudioMode onTake only appends) is the pick without touching the others', () => {
    const d = take('d', { pickedAt: 1000 });
    expect(pickedTakeIds([a, b, c, d]).has('d')).toBe(true);
    expect(pickedTakeIds([a, b, c, d]).has('b')).toBe(false);
  });
  it('PICK moves the group to that take; deleting the pick hands it to the one picked before', () => {
    const picked = pickTake([a, b, c], 'a', 5);
    expect([...pickedTakeIds(picked)].sort()).toEqual(['a', 'c']);
    expect(picked.find((t) => t.id === 'a')!.pickedAt).toBe(5);   // max(now, top + 1) = max(5, 4)
    expect([...pickedTakeIds(picked.filter((t) => t.id !== 'a'))].sort()).toEqual(['b', 'c']);
    // a clock that went backwards still makes the pick the newest
    expect(pickTake([a, b], 'a', 0).find((t) => t.id === 'a')!.pickedAt).toBe(3);
  });
  it('engineTakeList: only picks with audio; the song\'s loop in song mode, the take\'s own off it; muted handed over muted', () => {
    const m = take('m', { atBar: 1, bars: 1, pickedAt: 9, muted: true });
    const buffers = new Map([['a', buf(8)], ['b', buf(8)], ['c', buf(4)], ['m', buf(2)]]);
    const grid = engineTakeList([a, b, c, m], buffers, { songMode: false, songBars: 0, bpm: 120 });
    expect(grid.map((t) => [t.id, t.startBar, t.loopBars, t.muted])).toEqual([['b', 0, 4, false], ['c', 2, 4, false], ['m', 1, 4, true]]);
    const song = engineTakeList([a, b, c, m], buffers, { songMode: true, songBars: 8, bpm: 120 });
    expect(song.map((t) => t.loopBars)).toEqual([8, 8, 8]);
    // a take whose audio is not decoded yet is left out
    expect(engineTakeList([a, b], new Map([['a', buf(8)]]), { songMode: false, songBars: 0, bpm: 120 })).toEqual([]);
  });
  it('a take never plays past its region: its END (the engine\'s trimEnd, seconds in) is the region\'s last bar line at most', () => {
    // 8 s of audio over 2 bars at 120 BPM (4 s): end 4; a 3-bar song with the take at bar 2 → 1 bar fits → end 2
    const t = take('t', { atBar: 2, bars: 2, loopBars: 4 });
    expect(engineTakeList([t], new Map([['t', buf(8)]]), { songMode: false, songBars: 0, bpm: 120 })[0].trimEnd).toBeCloseTo(4, 9);
    expect(engineTakeList([t], new Map([['t', buf(8)]]), { songMode: true, songBars: 3, bpm: 120 })[0].trimEnd).toBeCloseTo(2, 9);
    expect(engineTakeList([t], new Map([['t', buf(8)]]), { songMode: true, songBars: 2, bpm: 120 })).toEqual([]);
    // the booth's trim-out (seconds off the end) becomes the end; nothing left between the trims = left out (the engine
    // would read an end at or before its start as "the whole buffer")
    expect(engineTakeList([{ ...t, durationSec: 3, trimEnd: 1 }], new Map([['t', buf(3)]]), { songMode: false, songBars: 0, bpm: 120 })[0].trimEnd).toBeCloseTo(2, 9);
    expect(engineTakeList([{ ...t, durationSec: 3, trimStart: 2, trimEnd: 1 }], new Map([['t', buf(3)]]), { songMode: false, songBars: 0, bpm: 120 })).toEqual([]);
  });
});

describe('storage and meters', () => {
  it('wavFromPcm writes 16-bit mono PCM at the capture rate', () => {
    const pcm = new Float32Array([0, 0.5, -0.5, 1, -1, 2]);
    const v = new DataView(wavFromPcm(pcm, 48000));
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe('RIFF');
    expect([v.getUint16(22, true), v.getUint32(24, true), v.getUint16(34, true), v.getUint32(40, true)]).toEqual([1, 48000, 16, 12]);
    expect([0, 1, 2, 3, 4, 5].map((i) => v.getInt16(44 + i * 2, true))).toEqual([0, 16383, -16384, 32767, -32768, 32767]);
  });
  it('the meter: peak/RMS, dBFS floored at -90, fill from -60 dB to 0 dB', () => {
    expect(levels(new Float32Array([0.5, -0.5]))).toEqual({ peak: 0.5, rms: 0.5 });
    expect(toDb(0)).toBe(-90); expect(toDb(1)).toBe(0); expect(toDb(0.5)).toBeCloseTo(-6.02, 2);
    expect(meterFill(0)).toBe(0); expect(meterFill(1)).toBe(1); expect(meterFill(0.001)).toBeCloseTo(0, 6);
  });
});

describe('StudioProject takes (P4): a pre-P4 take is read into a region that still starts where it did', () => {
  it('bars from its length at the project tempo; the next power-of-two loop holding it; no trims; list order picks', () => {
    // 5.2 s at 104 BPM (a bar is 2.3077 s) = 2.25 bars → 3; at bar 3 → loop 8 (3 + 3 = 6 → 8)
    const t = readTakeRegion({}, { id: 't', atBar: 3, gain: 0.9, durationSec: 5.2, audio: REF }, 104, 4);
    expect([t.bars, t.loopBars, t.trimStart, t.trimEnd, t.muted, t.pickedAt]).toEqual([3, 8, 0, 0, false, 4]);
    expect(takeStartsAt({ startBar: t.atBar, loopBars: t.loopBars }, 3, null)).toBe(true);    // where it played before P4 (its only pass then)
    expect(takeStartsAt({ startBar: t.atBar, loopBars: t.loopBars }, 11, null)).toBe(true);   // and now on every pass
  });
  it('stored fields are kept (clamped); a stored loop that cannot hold the start is replaced', () => {
    const base = { id: 't', atBar: 5, gain: 1, durationSec: 2, audio: REF };
    const t = readTakeRegion({ bars: 2, loopBars: 4, trimStart: 9, trimEnd: -1, muted: true, pickedAt: 77 }, base, 120, 0);
    expect([t.bars, t.loopBars, t.trimStart, t.trimEnd, t.muted, t.pickedAt]).toEqual([2, 8, 2, 0, true, 77]);
  });
  it('migrateProject reads an old record\'s take with no repair line, and round-trips a P4 take exactly', () => {
    const p = newProject({ now: 1, id: 'prj_t' });
    const old = { ...p, takes: [{ id: 't1', atBar: 0, gain: 0.9, durationSec: 3, audio: REF }] };
    const m = migrateProject(JSON.parse(JSON.stringify(old)), { now: 2 });
    expect(m.ok && m.issues).toEqual([]);
    expect(m.ok && m.project.takes[0]).toMatchObject({ bars: 2, loopBars: 2, trimStart: 0, trimEnd: 0, muted: false, pickedAt: 0 });
    const p4 = { ...p, takes: [take('t2', { atBar: 1, bars: 2, loopBars: 4, trimStart: 0.1, trimEnd: 0.2, muted: true, pickedAt: 123 })] };
    const back = migrateProject(JSON.parse(JSON.stringify(p4)), { now: 2 });
    expect(back.ok && back.project.takes).toEqual(p4.takes);
  });
});

describe('P4 FIX PASS: recording over a region mutes that region\'s current pick (it played under the performer)', () => {
  it('only the takes of the region being recorded go muted, and only while recording; the others play on', () => {
    const takes = [
      { id: 'a', atBar: 0, bars: 2 }, { id: 'b', atBar: 0, bars: 2 }, { id: 'c', atBar: 2, bars: 1 },
    ];
    const list = takes.map((t) => ({ id: t.id, muted: false }));
    expect(muteRecordingSlot(list, takes, null)).toEqual(list);
    expect(muteRecordingSlot(list, takes, '0+2')).toEqual([{ id: 'a', muted: true }, { id: 'b', muted: true }, { id: 'c', muted: false }]);
    expect(muteRecordingSlot(list, takes, '2+1').map((t) => t.muted)).toEqual([false, false, true]);
    const already = [{ id: 'a', muted: true }];
    expect(muteRecordingSlot(already, takes, '0+2')[0]).toBe(already[0]);   // unchanged objects stay the same
  });
});
