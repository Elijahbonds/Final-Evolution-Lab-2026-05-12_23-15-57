import { describe, it, expect } from 'vitest';
import { DancePerformance, beatDuration, WILD_TAP_COST } from './DanceCore';

const routine = (n: number) => Array.from({ length: n }, (_, i) => ({ clipId: 'step', beat: i * 2, holdBeats: 1, mirrored: false }));

/** Plays a 16-step routine at 120 bpm (a step every second) with a tapping strategy; returns the score. */
function play(tapsAt: (stepTime: number, i: number) => number[]): { score: number; perfect: number } {
  const p = new DancePerformance(120);
  p.setRoutine(routine(16));
  p.start(0);
  const bd = beatDuration(120);
  const taps: number[] = [];
  for (let i = 0; i < 16; i++) taps.push(...tapsAt(i * 2 * bd, i));
  taps.sort((a, b) => a - b);
  let ti = 0;
  for (let t = 0; t <= 34 * bd; t += 1 / 120) {
    p.update(t);
    while (ti < taps.length && taps[ti] <= t) { p.hit(taps[ti]); ti++; }
  }
  return { score: p.score, perfect: p.counts.PERFECT };
}

describe('Dance — the grade is for timing, and spam has none (MECHANICS PASS)', () => {
  it('one tap on each step beats mashing 8 taps a second', () => {
    const dancer = play((t) => [t + 0.01]);
    const masher = play((t) => Array.from({ length: 8 }, (_, k) => t - 0.5 + k * 0.125));
    expect(dancer.perfect).toBe(16);
    expect(dancer.score).toBeGreaterThan(masher.score * 1.5);
  });

  it('a wild tap costs, and never takes the score below zero', () => {
    const p = new DancePerformance(120);
    p.setRoutine(routine(4)); p.start(0);
    p.update(0.5); p.hit(0.5);
    expect(p.score).toBe(0);
    p.update(1.0); p.hit(1.0 + 0.005);                             // a PERFECT on the step at beat 2 (1.0 s)
    const after = p.score;
    p.update(1.5); p.hit(1.5);
    expect(p.score).toBe(Math.max(0, after - WILD_TAP_COST));
  });
});
