import { describe, it, expect } from 'vitest';
import { compareWeeks, weeklySeries, distinctDays, DAY_MS, WEEK_MS } from './week';

const now = Date.UTC(2026, 9, 24, 12);
const at = (daysAgo: number, value: number) => ({ at: now - daysAgo * DAY_MS, value });

describe('compareWeeks', () => {
  it('max per week, better when up', () => {
    const c = compareWeeks([at(1, 24), at(3, 25), at(9, 23)], now, { reduce: 'max' });
    expect(c).toEqual({ thisWeek: 25, lastWeek: 23, delta: 2, trend: 'better', direction: 'up' });
  });
  it('no reading this week is null, never 0, and there is no arrow', () => {
    expect(compareWeeks([at(9, 23)], now, { reduce: 'max' })).toEqual({ thisWeek: null, lastWeek: 23, delta: null, trend: null, direction: null });
  });
  it('one week only: a number, no arrow', () => {
    expect(compareWeeks([at(2, 23)], now, { reduce: 'mean' })).toMatchObject({ thisWeek: 23, lastWeek: null, trend: null, direction: null });
  });
  it('inside the noise band reads same', () => {
    expect(compareWeeks([at(1, 24.3), at(8, 24)], now, { reduce: 'max', sameBand: 0.5 })).toMatchObject({ trend: 'same', direction: 'same' });
  });
  it('lower-is-better flips the trend, not the arrow', () => {
    expect(compareWeeks([at(1, 0.2), at(8, 0.3)], now, { reduce: 'min', lowerIsBetter: true })).toMatchObject({ trend: 'better', direction: 'down' });
  });
  it('a count is a real zero, but two empty weeks compare nothing', () => {
    expect(compareWeeks([at(8, 1)], now, { reduce: 'count' })).toMatchObject({ thisWeek: 0, lastWeek: 1, direction: 'down' });
    expect(compareWeeks([], now, { reduce: 'count' })).toMatchObject({ thisWeek: 0, lastWeek: 0, direction: null });
  });
  it('the weeks are rolling and half-open: seven days ago opens this week, a millisecond before is last week', () => {
    expect(compareWeeks([{ at: now - WEEK_MS, value: 5 }], now, { reduce: 'max' })).toMatchObject({ thisWeek: 5, lastWeek: null });
    expect(compareWeeks([{ at: now - WEEK_MS - 1, value: 5 }], now, { reduce: 'max' })).toMatchObject({ thisWeek: null, lastWeek: 5 });
  });
});

describe('weeklySeries', () => {
  it('eight weeks oldest first, a week with nothing is a gap', () => {
    const s = weeklySeries([at(1, 10), at(2, 12), at(50, 7)], now, 'max');
    expect(s).toHaveLength(8);
    expect(s[7]).toBe(12);
    expect(s[0]).toBe(7);
    expect(s.slice(1, 7).every((v) => v === null)).toBe(true);
  });
});

describe('distinctDays', () => {
  it('three sessions on one day are one day played', () => {
    const d0 = Date.UTC(2026, 9, 20, 1), d1 = Date.UTC(2026, 9, 20, 22), d2 = Date.UTC(2026, 9, 21, 3);
    expect(distinctDays([d0, d1, d2])).toEqual([{ at: d1, value: 1 }, { at: d2, value: 1 }]);
  });
});
