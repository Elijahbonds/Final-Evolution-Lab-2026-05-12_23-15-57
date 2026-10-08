// MUSIC-SUITE P7 (2026-09-29), "SET AS MY WALK-OUT's gap-free loop": loopRender.ts's pure half — no AudioContext, no
// DOM, so every claim in its header comment is a number here: the loop's length is exact, the wrapped tail actually
// lands on the start, and the seam (the sample right before the wrap meeting the sample right after it) is inaudible
// even when the raw render is nowhere close on its own. The Web Audio adapter (renderWalkOutLoopBuffer) is proven
// against the real engine in a browser — see outbox/finish-release/musicsuite/p7 — since fakeWebAudio.ts schedules
// but never actually renders PCM (AudioEngine.baseline.test.ts's own header).
import { describe, expect, it } from 'vitest';
import { barSec } from './AudioEngine';
import { LOOP_CROSSFADE_MS, LOOP_SNAP_MS, loopSamplesFor, tailWrapLoop } from './loopRender';

const RATE = 1000;   // 1 sample = 1 ms: crossfade/snap lengths (given in ms) are round sample counts, easy to reason about

/** A steady tone, so "the middle of the loop" has an unmistakable shape a broken wrap or a bad crossfade would disturb. */
function sine(n: number, hz: number, sr = RATE, amp = 0.6): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * hz * i) / sr);
  return out;
}

describe('loopSamplesFor', () => {
  it('is exactly N bars at the tempo, in samples — the same tempo math every render in this room shares', () => {
    expect(loopSamplesFor(8, 120, 44100)).toBe(Math.round(barSec(120) * 8 * 44100));
    expect(loopSamplesFor(2, 92, 48000)).toBe(Math.round(barSec(92) * 2 * 48000));
  });
  it('rounds to a whole sample rather than leaving a fractional one for the loop point to drift on', () => {
    const n = loopSamplesFor(8, 133, 44100);
    expect(Number.isInteger(n)).toBe(true);
  });
  it('never returns zero or a negative count for a nonsense bar count', () => {
    expect(loopSamplesFor(0, 120, 44100)).toBeGreaterThan(0);
    expect(loopSamplesFor(-3, 120, 44100)).toBeGreaterThan(0);
  });
});

describe('tailWrapLoop — loop length exact', () => {
  it('every channel comes back exactly loopSamples long, whatever the render tail on top of it was', () => {
    const loopSamples = 400;
    const main = sine(loopSamples, 5);
    const tail = sine(150, 5).map((v, i) => v * Math.exp(-i / 40));
    const rendered = new Float32Array([...main, ...tail]);
    const out = tailWrapLoop([rendered, rendered.slice()], RATE, loopSamples);
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(loopSamples);
    expect(out[1]).toHaveLength(loopSamples);
  });

  it('is exact even with no tail at all (a render trimmed to precisely the loop length)', () => {
    const loopSamples = 200;
    const out = tailWrapLoop([sine(loopSamples, 5)], RATE, loopSamples);
    expect(out[0]).toHaveLength(loopSamples);
  });

  it('refuses a render shorter than the loop it was asked for, rather than silently repeating a partial bar', () => {
    expect(() => tailWrapLoop([new Float32Array(100)], RATE, 200)).toThrow(/shorter/);
  });
});

describe('tailWrapLoop — tail-wrap continuity', () => {
  it('folds the tail onto the start, additively — the decay is heard, not discarded', () => {
    const loopSamples = 400;
    const main = new Float32Array(loopSamples);           // a silent "song": anything at the start is the wrapped tail alone
    const tailLevel = 0.3;
    const tail = new Float32Array(80).fill(tailLevel);      // a steady "still ringing" decay carried past the loop point
    const rendered = new Float32Array([...main, ...tail]);
    const out = tailWrapLoop([rendered], RATE, loopSamples);
    // well inside the tail's own 80 samples and nowhere near the seam's crossfade window (which sits at the far END
    // of the loop, not the start) — every one of these should be the tail, landed exactly, untouched by anything else
    for (let i = 0; i < 60; i++) expect(out[0][i]).toBeCloseTo(tailLevel, 5);
  });

  it('a tail longer than the loop wraps more than once rather than being dropped', () => {
    const loopSamples = 50;
    const main = new Float32Array(loopSamples);
    const tail = new Float32Array(130).fill(0.1);           // 2 full wraps + a partial third
    const rendered = new Float32Array([...main, ...tail]);
    const out = tailWrapLoop([rendered], RATE, loopSamples);
    // sample 0 receives the tail's 0th, 50th AND 100th sample — three contributions, not one
    expect(out[0][0]).toBeCloseTo(0.3, 5);
  });
});

describe('tailWrapLoop — no click (the seam is inaudible)', () => {
  it('the last sample and the first meet, even when the raw render ends and begins at totally different levels', () => {
    const loopSamples = 400;
    const main = new Float32Array(loopSamples).fill(0.5);
    main[0] = -0.7;                                         // a hard, un-decayed jump from end (+0.5) to start (-0.7)
    const rendered = new Float32Array([...main, ...new Float32Array(50)]);   // no tail energy: the worst case for the wrap
    const out = tailWrapLoop([rendered], RATE, loopSamples);
    const seamDelta = Math.abs(out[0][loopSamples - 1] - out[0][0]);
    expect(seamDelta).toBeLessThan(1e-6);
  });

  it('the seam has no bigger a first-difference than a normal step inside a steady tone', () => {
    const loopSamples = 500;
    const hz = 7;
    // a tone whose period does not divide the loop evenly, so a naive cut is guaranteed to click without the fix
    const rendered = sine(loopSamples + 60, hz);
    const out = tailWrapLoop([rendered], RATE, loopSamples);
    const seamDiff = Math.abs(out[0][0] - out[0][loopSamples - 1]);
    // the tone's own largest sample-to-sample step, well away from the seam, as the yardstick for "an ordinary step"
    let typical = 0;
    for (let i = 100; i < 400; i++) typical = Math.max(typical, Math.abs(out[0][i] - out[0][i - 1]));
    expect(seamDiff).toBeLessThan(typical);
  });

  it('leaves the middle of the loop alone — only the wrapped tail and the crossfade window touch anything', () => {
    const loopSamples = 400;
    const tailLen = 60;
    const rendered = sine(loopSamples + tailLen, 5);
    const plain = sine(loopSamples, 5);
    const out = tailWrapLoop([rendered.slice()], RATE, loopSamples);
    const fadeSamples = Math.ceil(LOOP_CROSSFADE_MS + LOOP_SNAP_MS);
    for (let i = Math.max(fadeSamples, tailLen); i < loopSamples - fadeSamples; i++) {
      expect(out[0][i]).toBeCloseTo(plain[i], 6);
    }
  });
});
