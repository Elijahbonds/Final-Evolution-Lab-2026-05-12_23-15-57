import { describe, expect, it } from 'vitest';
import { countToward, creditDay, dayNumber, doneToday, liveStreak, NO_STREAK } from './day';

// Offsets as Date#getTimezoneOffset() reports them: UTC − local, in minutes.
const LA_SUMMER = 420;   // UTC−7
const LA_WINTER = 480;   // UTC−8
const TOKYO = -540;      // UTC+9
const UTC = 0;

const at = (iso: string) => Date.parse(iso);

describe('dayNumber — the LOCAL calendar day', () => {
  it('turns over at local midnight, not UTC midnight', () => {
    // 23:59 and 00:01 in Los Angeles are different local days, though both are the same UTC day (06:59 / 07:01)
    const before = dayNumber(at('2026-10-06T06:59:00Z'), LA_SUMMER);   // 2026-10-05 23:59 PDT
    const after = dayNumber(at('2026-10-06T07:01:00Z'), LA_SUMMER);    // 2026-10-06 00:01 PDT
    expect(after - before).toBe(1);
    expect(dayNumber(at('2026-10-06T06:59:00Z'), UTC)).toBe(dayNumber(at('2026-10-06T07:01:00Z'), UTC));
  });

  it('puts one instant on different days in different zones', () => {
    const t = at('2026-10-06T20:00:00Z');                     // 13:00 in LA, 05:00 next day in Tokyo
    expect(dayNumber(t, TOKYO) - dayNumber(t, LA_SUMMER)).toBe(1);
  });

  it('is exact at the midnight boundary itself', () => {
    const midnightUtc = at('2026-10-06T00:00:00Z');
    expect(dayNumber(midnightUtc, UTC) - dayNumber(midnightUtc - 1, UTC)).toBe(1);
  });

  it('keeps consecutive local days consecutive across a daylight-saving change', () => {
    // US DST ends 2026-11-01 02:00 PDT → 01:00 PST. Noon on Oct 31 (PDT) and noon on Nov 1 (PST) are adjacent days.
    const oct31 = dayNumber(at('2026-10-31T19:00:00Z'), LA_SUMMER);
    const nov1 = dayNumber(at('2026-11-01T20:00:00Z'), LA_WINTER);
    expect(nov1 - oct31).toBe(1);
  });
});

describe('streaks', () => {
  it('starts at 1, grows on consecutive days, and is idempotent within a day', () => {
    let s = creditDay(NO_STREAK, 100);
    expect(s).toEqual({ count: 1, best: 1, lastDay: 100 });
    s = creditDay(s, 100);
    expect(s.count).toBe(1);
    s = creditDay(s, 101);
    s = creditDay(s, 102);
    expect(s).toEqual({ count: 3, best: 3, lastDay: 102 });
  });

  it('a missed day starts over at 1 and keeps the best', () => {
    let s = creditDay(creditDay(creditDay(NO_STREAK, 10), 11), 12);
    s = creditDay(s, 14);
    expect(s).toEqual({ count: 1, best: 3, lastDay: 14 });
  });

  it('shows as alive today if the goal was met yesterday, and 0 after a missed day', () => {
    const s = creditDay(creditDay(NO_STREAK, 50), 51);
    expect(liveStreak(s, 51)).toBe(2);
    expect(liveStreak(s, 52)).toBe(2);   // today's cards aren't done yet; the streak isn't lost until tomorrow
    expect(liveStreak(s, 53)).toBe(0);
    expect(liveStreak(NO_STREAK, 53)).toBe(0);
  });

  it('a streak earned in one zone survives a trip across midnight boundaries', () => {
    // goal met at 23:30 local on day D, then at 00:30 local — that's D+1, so the streak grows
    const d1 = dayNumber(at('2026-10-06T06:30:00Z'), LA_SUMMER);   // Oct 5, 23:30 PDT
    const d2 = dayNumber(at('2026-10-06T07:30:00Z'), LA_SUMMER);   // Oct 6, 00:30 PDT
    expect(creditDay(creditDay(NO_STREAK, d1), d2).count).toBe(2);
  });
});

describe('the daily tally', () => {
  it('counts unique cards and rolls over at a new day', () => {
    let t = countToward({ day: 7, done: [] }, 7, 'a');
    t = countToward(t, 7, 'a');
    t = countToward(t, 7, 'b');
    expect(doneToday(t, 7)).toBe(2);
    expect(doneToday(t, 8)).toBe(0);
    t = countToward(t, 8, 'a');
    expect(t).toEqual({ day: 8, done: ['a'] });
  });
});
