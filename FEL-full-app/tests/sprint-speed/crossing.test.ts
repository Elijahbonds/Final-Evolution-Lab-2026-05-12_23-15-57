// The line-crossing core on synthetic sequences with known crossing times (SPRINT-SPEED, 2026-10-25): 30, 60 and 240 fps,
// a random frame phase, constant speed, speeding up and slowing down, landmark noise. Sub-frame error bounds asserted.
import { describe, expect, it } from 'vitest';
import { findCrossings, firstCrossing, fitZero } from '@/lib/sprint/crossing';
import { lineSeq } from '../helpers/sprintSynth';

const FPS = [30, 60, 240] as const;

describe('sub-frame crossing time', () => {
  it.each(FPS)('%i fps, no noise, constant speed: exact to 0.01 ms whatever the frame phase', (fps) => {
    for (let seed = 1; seed <= 40; seed++) {
      const tc = 1000 + seed * 3.7;
      const c = firstCrossing(lineSeq({ fps, tc, v: 2.5, seed }));
      expect(c).not.toBeNull();
      expect(Math.abs(c!.t - tc)).toBeLessThan(0.01);
      expect(c!.dir).toBe(1);
    }
  });

  it.each(FPS)('%i fps, no noise, speeding up or slowing (±2 picture heights/s²): within 0.02 of a frame', (fps) => {
    const frame = 1000 / fps;
    for (const a of [-2, 2]) for (let seed = 1; seed <= 30; seed++) {
      const tc = 2000;
      const c = firstCrossing(lineSeq({ fps, tc, v: 2.5, a, seed }));
      expect(Math.abs(c!.t - tc)).toBeLessThan(0.02 * frame);
    }
  });

  it.each(FPS)('%i fps, landmark noise σ = 0.004: the error stays inside its own ± and well inside one frame', (fps) => {
    const frame = 1000 / fps;
    const errs: number[] = [];
    let inside = 0;
    const N = 300;
    for (let seed = 1; seed <= N; seed++) {
      // a sprinter far from the lens moves slowly across the picture: 1.5 picture heights/s is the hard case
      const c = firstCrossing(lineSeq({ fps, tc: 3000, v: 1.5, sd: 0.004, seed }), { pointSd: 0.004 });
      expect(c).not.toBeNull();
      const e = c!.t - 3000;
      errs.push(Math.abs(e));
      if (Math.abs(e) <= 2 * c!.sdMs) inside++;
    }
    const mean = errs.reduce((s, x) => s + x, 0) / N;
    const p95 = [...errs].sort((a, b) => a - b)[Math.floor(0.95 * N)];
    // the claimed ±1 SD is honest: ≥ 90 % of reads inside ±2 SD (95 % expected for a Gaussian)
    expect(inside / N).toBeGreaterThan(0.9);
    // and the read is a fraction of a frame: the noise, not the frame rate, sets it
    expect(mean).toBeLessThan(Math.max(0.25 * frame, 2));
    expect(p95).toBeLessThan(Math.max(0.6 * frame, 5));
  });

  it('a point jittering on the line is not a crossing, and a real crossing still is (the hold)', () => {
    const s = [0, 1, 2, 3, 4, 5].map((i) => ({ t: i * 33, d: i % 2 ? 0.001 : -0.001 }));
    expect(findCrossings(s)).toEqual([]);
    const run = [...Array.from({ length: 6 }, (_, i) => ({ t: i * 33, d: -0.3 + i * 0.01 })), ...Array.from({ length: 6 }, (_, i) => ({ t: 200 + i * 33, d: 0.05 + i * 0.05 }))];
    expect(findCrossings(run)).toHaveLength(1);
  });

  it('direction, `after` and `dir` filter; a dropped frame at the line still times from real timestamps', () => {
    const seq = lineSeq({ fps: 60, tc: 1000, v: -2, seed: 4 });
    expect(firstCrossing(seq)!.dir).toBe(-1);
    expect(firstCrossing(seq, { dir: 1 })).toBeNull();
    expect(firstCrossing(seq, { after: 1500 })).toBeNull();
    // drop the two frames either side of the line: the fit spans the gap on the real times
    const gap = seq.filter((p) => Math.abs(p.t - 1000) > 20);
    const c = firstCrossing(gap)!;
    expect(Math.abs(c.t - 1000)).toBeLessThan(0.01);
  });

  it('fitZero: the zero of a straight line, its slope, and a ± that shrinks with more frames', () => {
    const pts = [0, 10, 20, 30].map((t) => ({ t, d: 0.01 * (t - 12) }));
    const f = fitZero(pts, 0.004)!;
    expect(f.t).toBeCloseTo(12, 9);
    expect(f.slope).toBeCloseTo(0.01, 9);
    const f8 = fitZero([0, 5, 10, 15, 20, 25, 30, 35].map((t) => ({ t, d: 0.01 * (t - 12) })), 0.004)!;
    expect(f8.sdMs).toBeLessThan(f.sdMs);
  });
});
