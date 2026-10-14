// PM 2026-10-14 (#259): the 1v1 win-by-2 cap is 13, per the spec (it was 15).
import { describe, expect, it } from 'vitest';
import { WIN_BY_2_CAP, winRule, gameWinner, postedMax } from './onevoneRules';

describe('1v1 win-by-2 hard cap', () => {
  it('is 13', () => {
    expect(WIN_BY_2_CAP).toBe(13);
    expect(winRule(11, true).cap).toBe(13);
  });
  it('by 2 until 13, then the first to 13 wins whatever the margin', () => {
    const r = winRule(11, true);
    expect(gameWinner(11, 10, r)).toBeNull();
    expect(gameWinner(12, 10, r)).toBe('me');
    expect(gameWinner(12, 12, r)).toBeNull();
    expect(gameWinner(13, 12, r)).toBe('me');
    expect(gameWinner(12, 13, r)).toBe('foe');
    expect(postedMax(r)).toBe(15);
  });
  it('first to 11 without win-by-2 is unchanged', () => {
    expect(gameWinner(11, 10, winRule(11, false))).toBe('me');
  });
});
