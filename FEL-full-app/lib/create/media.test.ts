// CREATE HUB: track preparation without Web Audio — limits, MIME names, loudness, the WAV encoder, the beat-maker mix.
import { describe, expect, it } from 'vitest';
import { MIX_RATE, UPLOAD_LIMITS, academyBars, barsIn, chooseFormat, encodeMixWav, measureLufs, mixStemsLooped, peakOf, resample, trackProblem, uploadMime, wavBytes } from './media';

const sine = (sec: number, rate: number, amp: number, hz = 1000) => Float32Array.from({ length: Math.round(sec * rate) }, (_, i) => amp * Math.sin(2 * Math.PI * hz * i / rate));

describe('limits and types', () => {
  it('trackProblem names each refusal', () => {
    expect(trackProblem({ bytes: 1000, durationSec: 30, peak: 0.5 })).toBeNull();
    expect(trackProblem({ bytes: 1000, durationSec: 241 })).toMatch(/4 minutes/);
    expect(trackProblem({ bytes: UPLOAD_LIMITS.bytes + 1, durationSec: 30 })).toMatch(/8 MB/);
    expect(trackProblem({ bytes: 1000, durationSec: 0.5 })).toMatch(/under a second/);
    expect(trackProblem({ bytes: 1000, durationSec: 0 })).toMatch(/no audio/);
    expect(trackProblem({ bytes: 1000, durationSec: 30, peak: 0 })).toMatch(/silent/);
  });
  it('uploadMime maps aliases and extensions to the allowlist, else null', () => {
    expect(uploadMime('audio/mp3')).toBe('audio/mpeg');
    expect(uploadMime('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(uploadMime('audio/x-wav')).toBe('audio/wav');
    expect(uploadMime('', 'Song.M4A')).toBe('audio/x-m4a');
    expect(uploadMime('audio/flac', 'a.flac')).toBeNull();
    expect(uploadMime('video/mp4', 'a.mov')).toBeNull();
  });
});

describe('loudness', () => {
  it('a full-scale 1 kHz sine reads about -3 LUFS per channel; stereo sums to about 0', () => {
    const s = sine(2, 8000, 1);
    expect(measureLufs([s], 8000)).toBeCloseTo(-3.7, 0);
    expect(measureLufs([s, s], 8000)).toBeCloseTo(-0.7, 0);
  });
  it('20 dB quieter reads 20 LU lower; silence is -70', () => {
    const a = measureLufs([sine(2, 8000, 1)], 8000);
    const b = measureLufs([sine(2, 8000, 0.1)], 8000);
    expect(a - b).toBeCloseTo(20, 0);
    expect(measureLufs([new Float32Array(8000)], 8000)).toBe(-70);
  });
  it('silent gaps do not drag the reading down (the gates)', () => {
    const loud = sine(2, 8000, 0.5);
    const gappy = new Float32Array(loud.length * 2); gappy.set(loud, 0);
    expect(measureLufs([gappy], 8000)).toBeCloseTo(measureLufs([loud], 8000), 0);
  });
  it('peakOf', () => { expect(peakOf([Float32Array.from([0.1, -0.7, 0.3])])).toBeCloseTo(0.7); });
});

describe('encoding', () => {
  it('resample halves the length 44.1 → 22.05 kHz and keeps a slow wave', () => {
    const s = sine(1, 44_100, 0.5, 100);
    const r = resample(s, 44_100, MIX_RATE);
    expect(r.length).toBe(22_050);
    expect(r[2205]).toBeCloseTo(s[4410], 2);
  });
  it('a valid 16-bit PCM WAV header and size', () => {
    const b = wavBytes([Float32Array.from([0, 1, -1]), Float32Array.from([0.5, -0.5, 0])], 22_050);
    const v = new DataView(b.buffer);
    expect(String.fromCharCode(...b.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...b.slice(8, 12))).toBe('WAVE');
    expect(v.getUint16(22, true)).toBe(2);         // channels
    expect(v.getUint32(24, true)).toBe(22_050);    // rate
    expect(v.getUint16(34, true)).toBe(16);        // bits
    expect(v.getUint32(40, true)).toBe(12);        // data bytes: 3 frames × 2 ch × 2
    expect(b.length).toBe(56);
    expect(v.getInt16(46, true)).toBe(16384);      // frame 0, right = +0.5 (interleaved L R)
    expect(v.getInt16(48, true)).toBe(32767);      // frame 1, left = +1
    expect(v.getInt16(52, true)).toBe(-32768);     // frame 2, left = -1
  });
  it('the richest format that fits 8 MB: 22.05 kHz stereo, then mono, then 16 kHz mono', () => {
    expect(chooseFormat(90, 2)).toEqual({ rate: MIX_RATE, channels: 2 });
    expect(chooseFormat(100, 2)).toEqual({ rate: MIX_RATE, channels: 1 });
    expect(chooseFormat(30, 1)).toEqual({ rate: MIX_RATE, channels: 1 });
    expect(chooseFormat(200, 2)).toEqual({ rate: 16_000, channels: 1 });
    expect(chooseFormat(240, 2)).toEqual({ rate: 16_000, channels: 1 });
  });
  it('a 4-minute stereo mix encodes mono and fits the cap', () => {
    const rate = 8000;   // small for the test; the encoder resamples to 22.05 kHz
    const ch = new Float32Array(rate * 240);
    const e = encodeMixWav([ch, ch], rate);
    expect(e.channels).toBe(1);
    expect(e.durationSec).toBe(240);
    expect(e.bytes.length).toBeLessThanOrEqual(UPLOAD_LIMITS.bytes);
  });
});

describe('the beat maker mix', () => {
  it('sums the stems, repeats them, and never clips', () => {
    const one = [Float32Array.from([0.9, 0, 0.9, 0])];
    const out = mixStemsLooped([one, one, one], 4);
    expect(out).toHaveLength(1);
    expect(out[0].length).toBe(16);
    expect(peakOf(out)).toBeLessThan(1);
    expect(out[0][4]).toBeCloseTo(out[0][0]);
    expect(mixStemsLooped([], 4)).toEqual([]);
  });
  it('bars at a tempo, and the Academy render length (8–32 bars, about 30 s)', () => {
    expect(barsIn(30, 120)).toBe(15);
    expect(academyBars(120)).toBe(16);
    expect(academyBars(60)).toBe(8);
    expect(academyBars(300)).toBe(32);
  });
});
