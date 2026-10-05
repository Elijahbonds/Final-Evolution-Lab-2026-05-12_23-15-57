// TRAINING scoring sim — the mode's first headless read (R5). Not a feel target: the assertions pin that the
// sim is faithful to training-game.tsx's loop AND measure what the rules produce across a skill spread, so the
// "can a player who learns the ramp win" question has a number on record instead of a vibe. Seeds are fixed, so
// a regression in the loop's shape (the ramp, the zone, the win line) fails here loudly.
import { describe, expect, it } from 'vitest';
import {
  TRAINING_WIN_SCORE, TRAINING_RAMP, TRAINING_EXERCISES,
  simulateTrainingRun, mulberry32,
} from './trainingSim';

const runs = (timingErrorSec: number, n = 40, zoneBonus = 1.0) =>
  Array.from({ length: n }, (_, i) => simulateTrainingRun({ timingErrorSec }, { seed: i + 1, zoneBonus }));

const winRate = (rs: { won: boolean }[]) => rs.filter((r) => r.won).length / rs.length;
const meanScore = (rs: { score: number }[]) => Math.round(rs.reduce((a, r) => a + r.score, 0) / rs.length);

describe('trainingSim — faithfulness to training-game.tsx', () => {
  it('a flawless release (0 error) always wins and every rep is a perfect', () => {
    for (const r of runs(0, 10)) {
      expect(r.won).toBe(true);
      expect(r.perfects).toBe(r.reps);
      expect(r.misses).toBe(0);
    }
  });

  it('the constants are the mode\'s (the integrity test reads the same ones off the source)', () => {
    expect(TRAINING_WIN_SCORE).toBe(1000);
    expect(TRAINING_RAMP).toBe(0.55);
    expect(TRAINING_EXERCISES.map((e) => e.speed)).toEqual([0.85, 1.0, 1.2, 1.35]);
    expect(TRAINING_EXERCISES.map((e) => e.zoneSize)).toEqual([0.2, 0.16, 0.13, 0.11]);
  });

  it('the ramp rate bounds the round: even a flawless player is rep-limited by the hold, not handed a win', () => {
    // at 0.85 speed, power tops out in ~2.1 s; the flawless run is bounded by the ramp, and it does win
    const r = simulateTrainingRun({ timingErrorSec: 0 }, { seed: 1 });
    expect(r.reps).toBeGreaterThan(10);        // a real round of work, not a one-rep win
    expect(r.won).toBe(true);
    // and the win is earned by accuracy, not by mashing: a sloppy run scores meaningfully less
    expect(meanScore(runs(0.30))).toBeLessThan(r.score);
  });
});

describe('trainingSim — what the rules produce (measured, not a target)', () => {
  it('score separates a steady player from a panic-masher, monotonic in timing error', () => {
    const steady = meanScore(runs(0.02));
    const decent = meanScore(runs(0.10));
    const mashy = meanScore(runs(0.30));
    expect(steady).toBeGreaterThan(decent);
    expect(decent).toBeGreaterThan(mashy);
  });

  it('a sloppy player (300 ms timing error) can lose — the win line is real, not a formality', () => {
    expect(winRate(runs(0.30))).toBeLessThan(1);
  });

  it('a steady player (20 ms) wins reliably — the ramp is learnable', () => {
    expect(winRate(runs(0.02))).toBe(1);
  });

  it('the grade zone bonus widens the band (ELITE is measurably easier than STARTER)', () => {
    const starter = meanScore(runs(0.12, 40, 1.0));
    const elite = meanScore(runs(0.12, 40, 1.25));
    expect(elite).toBeGreaterThan(starter);
  });

  it('deterministic: the same seed is the same run', () => {
    expect(simulateTrainingRun({ timingErrorSec: 0.1 }, { seed: 7 })).toEqual(
      simulateTrainingRun({ timingErrorSec: 0.1 }, { seed: 7 }),
    );
    expect(mulberry32(42)()).toBe(mulberry32(42)());
  });
});
