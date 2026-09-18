import { describe, it, expect } from 'vitest';
import { pickNight, rollRival, rivalProgress, eventWinner, freshTally, bankEvent, nightChampion, nightBoard, EVENTS_PER_NIGHT } from './CarnivalNight';

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
