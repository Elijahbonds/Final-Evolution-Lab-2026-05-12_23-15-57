import { describe, it, expect } from 'vitest';
import { pickNight, rollRival, simulateRivalRun, rivalProgress, eventWinner, freshTally, bankEvent, nightChampion, nightBoard, EVENTS_PER_NIGHT, rivalMakeRate, RIVAL_BASE_RATE, RIVAL_RATE_MAX } from './CarnivalNight';

describe('carnival night rules', () => {
  it('draws a seeded four from the pool with no repeats', () => {
    const pool = ['a', 'b', 'c', 'd', 'e', 'f'];
    const a = pickNight(pool, 11), b = pickNight(pool, 11), c = pickNight(pool, 12);
    expect(a).toHaveLength(EVENTS_PER_NIGHT);
    expect(new Set(a).size).toBe(4);
    expect(a).toEqual(b);
    expect(c).not.toEqual(a);
    expect(pickNight(['x', 'y'], 1)).toHaveLength(2);
  });

  it('rival roll stays inside its range; the ticker starts at 0, ends at the full score, surges mid-event', () => {
    for (let i = 0; i < 50; i++) { const v = rollRival([4, 9]); expect(v).toBeGreaterThanOrEqual(4); expect(v).toBeLessThanOrEqual(9); }
    expect(simulateRivalRun([4, 9], () => 1)).toBe(4);
    expect(simulateRivalRun([4, 9], () => 1)).toBe(rollRival([4, 9], () => 1));
    expect(simulateRivalRun([4, 9], () => 0)).toBe(9);
    expect(rivalProgress(0)).toBe(0);
    expect(rivalProgress(1)).toBe(1);
    expect(rivalProgress(-1)).toBe(0);
    expect(rivalProgress(0.25)).toBeLessThan(0.25);
    expect(rivalProgress(0.5)).toBeCloseTo(0.5, 5);
    expect(rivalProgress(0.75)).toBeGreaterThan(0.75);
  });

  it('banks events to the winner, ties to nobody, and crowns on points then events won', () => {
    const t = freshTally();
    expect(bankEvent(t, 'SLAM RUSH', 60, 48)).toBe(0);
    expect(bankEvent(t, 'HOT SHOT', 30, 75)).toBe(1);
    expect(bankEvent(t, 'COIN STORM', 50, 50)).toBe(-1);
    expect(t.points).toEqual([140, 173]);
    expect(t.won).toEqual([['SLAM RUSH'], ['HOT SHOT']]);
    expect(nightChampion(t)).toBe(1);
    const tie = freshTally();
    bankEvent(tie, 'A', 10, 0); bankEvent(tie, 'B', 0, 5); bankEvent(tie, 'C', 0, 5);
    expect(tie.points).toEqual([10, 10]);
    expect(nightChampion(tie)).toBe(1);          // more events won breaks the tie
    const flat = freshTally();
    expect(nightChampion(flat)).toBe(0);         // nothing played: the host keeps the crown
    expect(eventWinner(1, 1)).toBe(-1);
    const board = nightBoard(t, ['YOU', 'RIVAL']);
    expect(board[0]).toEqual({ name: 'YOU', score: 140, line: 'SLAM RUSH' });
    expect(nightBoard(flat, ['P1', 'P2'])[1].line).toBe('—');
  });
});

// IMPROVE (2026-10-06): the rival was eight coin flips at a flat 55 % all night, so event 4 played like event 1.
describe('the rival warms up through the night', () => {
  it('the first event is the old rival; each later event and each event the player took add to the make rate, capped', () => {
    expect(rivalMakeRate(0)).toBe(RIVAL_BASE_RATE);
    expect(RIVAL_BASE_RATE).toBe(0.55);
    expect(rivalMakeRate(1)).toBeCloseTo(0.58, 10);
    expect(rivalMakeRate(3)).toBeCloseTo(0.64, 10);
    expect(rivalMakeRate(3, 2)).toBeCloseTo(0.68, 10);
    expect(rivalMakeRate(3, 3)).toBe(RIVAL_RATE_MAX);
    expect(rivalMakeRate(20, 20)).toBe(RIVAL_RATE_MAX);
    for (let i = 0; i < 3; i++) expect(rivalMakeRate(i + 1, i)).toBeGreaterThan(rivalMakeRate(i, i));
  });

  it('the rate is what each attempt is rolled against; the band is still the event\'s own', () => {
    expect(simulateRivalRun([4, 9], () => 0.6)).toBe(4);                  // 0.6 misses at the base 0.55
    expect(simulateRivalRun([4, 9], () => 0.6, 8, rivalMakeRate(3))).toBe(9);   // and makes at event 4's 0.64
    expect(rollRival([4, 9], () => 0.6, rivalMakeRate(3))).toBe(9);
    expect(rollRival([4, 9], () => 0.6)).toBe(4);                        // the old two-argument call is the old rival
    for (let i = 0; i < 50; i++) { const v = rollRival([4, 9], Math.random, RIVAL_RATE_MAX); expect(v).toBeGreaterThanOrEqual(4); expect(v).toBeLessThanOrEqual(9); }
  });
});
