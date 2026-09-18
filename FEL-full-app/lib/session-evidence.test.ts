import { describe, expect, it } from 'vitest';
import { sessionHasPlay } from './session-evidence';

describe('sessionHasPlay', () => {
  it('an idle run that ended on the clock is not play', () => {
    expect(sessionHasPlay({ score: 0, won: false })).toBe(false);
    expect(sessionHasPlay({ score: 0, won: false, hits: 0, misses: 0, dodges: 0, combos: 0, maxCombo: 0, played: false })).toBe(false);
    expect(sessionHasPlay({})).toBe(false);
    expect(sessionHasPlay({ score: NaN, hits: -1 })).toBe(false);
  });
  it('points, a win, any tally, a combo or seen input all count', () => {
    expect(sessionHasPlay({ score: 4 })).toBe(true);
    expect(sessionHasPlay({ score: 0, won: true })).toBe(true);
    expect(sessionHasPlay({ score: 0, misses: 3 })).toBe(true);
    expect(sessionHasPlay({ score: 0, dodges: 1 })).toBe(true);
    expect(sessionHasPlay({ score: 0, maxCombo: 2 })).toBe(true);
    expect(sessionHasPlay({ score: 0, played: true })).toBe(true);
  });
});
