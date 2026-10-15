// PM 2026-10-14 (#259): the 1v1 win-by-2 hard cap stays 15 — the server session ceiling (17 = 15 − 1 + a three) mirrors it.
import { describe, expect, it } from 'vitest';
import { WIN_BY_2_CAP, winRule, gameWinner, postedMax } from './onevoneRules';

describe('1v1 win-by-2 hard cap', () => {
  it('is 15', () => {
    expect(WIN_BY_2_CAP).toBe(15);
    expect(winRule(11, true).cap).toBe(15);
  });
  it('by 2 until 15, then the first to 15 wins whatever the margin', () => {
    const r = winRule(11, true);
    expect(gameWinner(11, 10, r)).toBeNull();
    expect(gameWinner(12, 10, r)).toBe('me');
    expect(gameWinner(13, 12, r)).toBeNull();
    expect(gameWinner(14, 14, r)).toBeNull();
    expect(gameWinner(15, 14, r)).toBe('me');
    expect(gameWinner(14, 15, r)).toBe('foe');
    expect(postedMax(r)).toBe(17);
  });
  it('first to 11 without win-by-2 is unchanged', () => {
    expect(gameWinner(11, 10, winRule(11, false))).toBe('me');
  });
});
