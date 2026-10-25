import { describe, expect, it } from 'vitest';
import { addDays, dayStart, lastDays, prevWeekKey, weekBounds, weekDays, weekKeyOf } from './week';

describe('the group week: Monday–Sunday on the Pacific clock (the drill claim\'s day)', () => {
  it('a Sunday late evening PT is still last week; past midnight PT Monday is the new one', () => {
    expect(weekKeyOf(Date.parse('2026-10-26T06:30:00Z'))).toBe('2026-10-19'); // Sun Oct 25, 23:30 PDT
    expect(weekKeyOf(Date.parse('2026-10-26T07:30:00Z'))).toBe('2026-10-26'); // Mon Oct 26, 00:30 PDT
    expect(prevWeekKey('2026-10-26')).toBe('2026-10-19');
    expect(weekDays('2026-10-26')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  });
  it('bounds across the end of daylight time (Nov 1 2026): start in PDT, end in PST', () => {
    const b = weekBounds('2026-10-26');
    expect(b.start.toISOString()).toBe('2026-10-26T07:00:00.000Z');
    expect(b.end.toISOString()).toBe('2026-11-02T08:00:00.000Z');
    expect(dayStart('2026-11-01').toISOString()).toBe('2026-11-01T07:00:00.000Z');
  });
  it('day arithmetic and the read window', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(lastDays(Date.parse('2026-10-25T18:00:00Z'), 3)).toEqual(['2026-10-25', '2026-10-24', '2026-10-23']);
  });
});
