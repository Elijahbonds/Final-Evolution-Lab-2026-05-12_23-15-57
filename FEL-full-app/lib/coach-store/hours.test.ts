import { describe, expect, it } from 'vitest';
import { validateBlackoutDates, validateWeeklyHours } from './hours';
import { openSlots } from './slots';
import { ptParts } from '@/lib/sessions/schedule';

describe('validateWeeklyHours', () => {
  it('accepts good windows and sorts output by dow then startMin', () => {
    const result = validateWeeklyHours([
      { dow: 2, startMin: 600, endMin: 660 },
      { dow: 0, startMin: 540, endMin: 600 },
      { dow: 0, startMin: 600, endMin: 660 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value).toEqual([
      { dow: 0, startMin: 540, endMin: 600 },
      { dow: 0, startMin: 600, endMin: 660 },
      { dow: 2, startMin: 600, endMin: 660 },
    ]);
  });

  it('strips unknown keys from each window', () => {
    const result = validateWeeklyHours([{ dow: 1, startMin: 540, endMin: 600, extra: 'nope' }]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value).toEqual([{ dow: 1, startMin: 540, endMin: 600 }]);
  });

  it('rejects start >= end', () => {
    const result = validateWeeklyHours([{ dow: 1, startMin: 600, endMin: 600 }]);
    expect(result.ok).toBe(false);
  });

  it('rejects startMin < 0', () => {
    const result = validateWeeklyHours([{ dow: 1, startMin: -30, endMin: 60 }]);
    expect(result.ok).toBe(false);
  });

  it('rejects endMin > 1440', () => {
    const result = validateWeeklyHours([{ dow: 1, startMin: 1410, endMin: 1470 }]);
    expect(result.ok).toBe(false);
  });

  it('rejects non-30-minute boundaries', () => {
    expect(validateWeeklyHours([{ dow: 1, startMin: 545, endMin: 600 }]).ok).toBe(false);
    expect(validateWeeklyHours([{ dow: 1, startMin: 540, endMin: 605 }]).ok).toBe(false);
  });

  it('enforces a 30-minute minimum window (the smallest grid-aligned span)', () => {
    // On the 30-minute grid the smallest possible window is exactly 30 min; anything shorter
    // would violate the boundary rule first (covered above), so this pins the floor itself.
    expect(validateWeeklyHours([{ dow: 1, startMin: 540, endMin: 570 }]).ok).toBe(true);
  });

  it('rejects overlapping windows on the same day', () => {
    const result = validateWeeklyHours([
      { dow: 1, startMin: 540, endMin: 630 },
      { dow: 1, startMin: 600, endMin: 660 },
    ]);
    expect(result.ok).toBe(false);
  });

  it('accepts touching windows (end == next start)', () => {
    const result = validateWeeklyHours([
      { dow: 1, startMin: 540, endMin: 600 },
      { dow: 1, startMin: 600, endMin: 660 },
    ]);
    expect(result.ok).toBe(true);
  });

  it('accepts the same times on different days', () => {
    const result = validateWeeklyHours([
      { dow: 1, startMin: 540, endMin: 600 },
      { dow: 2, startMin: 540, endMin: 600 },
    ]);
    expect(result.ok).toBe(true);
  });

  it('rejects dow 7, -1, and 1.5', () => {
    expect(validateWeeklyHours([{ dow: 7, startMin: 540, endMin: 600 }]).ok).toBe(false);
    expect(validateWeeklyHours([{ dow: -1, startMin: 540, endMin: 600 }]).ok).toBe(false);
    expect(validateWeeklyHours([{ dow: 1.5, startMin: 540, endMin: 600 }]).ok).toBe(false);
  });

  it('rejects a non-array', () => {
    expect(validateWeeklyHours({ dow: 1 }).ok).toBe(false);
    expect(validateWeeklyHours(null).ok).toBe(false);
  });

  it('rejects more than 6 windows on one day', () => {
    const windows = Array.from({ length: 7 }, (_, i) => ({ dow: 1, startMin: i * 60, endMin: i * 60 + 30 }));
    expect(validateWeeklyHours(windows).ok).toBe(false);
  });

  it('rejects more than 42 windows total', () => {
    const windows: Array<{ dow: number; startMin: number; endMin: number }> = [];
    for (let dow = 0; dow < 7; dow++) {
      for (let i = 0; i < 7; i++) windows.push({ dow, startMin: i * 60, endMin: i * 60 + 30 });
    }
    expect(windows.length).toBe(49);
    expect(validateWeeklyHours(windows).ok).toBe(false);
  });
});

describe('validateBlackoutDates', () => {
  const now = new Date('2026-06-15T12:00:00Z'); // noon UTC = morning PT, same PT calendar day

  it('accepts a future date and today (PT)', () => {
    const result = validateBlackoutDates(['2026-06-15', '2026-07-01'], now);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value).toEqual(['2026-06-15', '2026-07-01']);
  });

  it('accepts today at the UTC-vs-PT edge where UTC is already tomorrow', () => {
    // 2026-06-16T06:00:00Z = 2026-06-15 23:00 PDT (UTC-7): UTC day is ahead of PT day.
    const edgeNow = new Date('2026-06-16T06:00:00Z');
    const result = validateBlackoutDates(['2026-06-15'], edgeNow);
    expect(result.ok).toBe(true);
  });

  it('rejects a past date', () => {
    const result = validateBlackoutDates(['2026-06-14'], now);
    expect(result.ok).toBe(false);
  });

  it('rejects an invalid calendar date', () => {
    const result = validateBlackoutDates(['2026-02-30'], now);
    expect(result.ok).toBe(false);
  });

  it('rejects a bad format', () => {
    expect(validateBlackoutDates(['06/15/2026'], now).ok).toBe(false);
    expect(validateBlackoutDates(['2026-6-15'], now).ok).toBe(false);
  });

  it('rejects more than 400 days ahead', () => {
    const result = validateBlackoutDates(['2027-08-01'], now);
    expect(result.ok).toBe(false);
  });

  it('dedupes duplicate dates', () => {
    const result = validateBlackoutDates(['2026-06-20', '2026-06-20'], now);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value).toEqual(['2026-06-20']);
  });

  it('rejects more than 120 entries', () => {
    const dates = Array.from({ length: 121 }, (_, i) => {
      const d = new Date(now.getTime() + i * 86_400_000);
      return d.toISOString().slice(0, 10);
    });
    expect(validateBlackoutDates(dates, now).ok).toBe(false);
  });

  it('rejects non-string entries', () => {
    expect(validateBlackoutDates([20260615], now).ok).toBe(false);
  });
});

describe('validated hours feed openSlots correctly', () => {
  it('normalized weeklyHours produces slots only inside the saved window', () => {
    const weeklyResult = validateWeeklyHours([{ dow: 0, startMin: 540, endMin: 600 }]); // Sun 9:00-10:00 AM PT
    expect(weeklyResult.ok).toBe(true);
    if (!weeklyResult.ok) return;
    const blackoutResult = validateBlackoutDates([], new Date('2026-07-12T00:00:00Z'));
    expect(blackoutResult.ok).toBe(true);
    if (!blackoutResult.ok) return;
    const slots = openSlots({
      now: new Date('2026-07-12T00:00:00Z'), // a Sunday
      weekly: weeklyResult.value,
      blackouts: blackoutResult.value,
      busy: [],
      bufferMinutes: 0,
      minNoticeHours: 0,
      maxDaysAhead: 7,
      durations: [30],
    });
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      const p = ptParts(slot.startsAt);
      expect(p.weekday).toBe(0);
      const min = p.hour * 60 + p.minute;
      expect(min).toBeGreaterThanOrEqual(540);
      expect(min).toBeLessThan(600);
    }
  });

  it('a saved blackout date produces zero slots on that PT day', () => {
    const weeklyResult = validateWeeklyHours([{ dow: 0, startMin: 540, endMin: 600 }]);
    expect(weeklyResult.ok).toBe(true);
    if (!weeklyResult.ok) return;
    const now = new Date('2026-07-12T00:00:00Z'); // Sunday, PT date 2026-07-11
    const todayKey = `${ptParts(now).y}-${String(ptParts(now).m).padStart(2, '0')}-${String(ptParts(now).day).padStart(2, '0')}`;
    const blackoutResult = validateBlackoutDates([todayKey], now);
    expect(blackoutResult.ok).toBe(true);
    if (!blackoutResult.ok) return;
    const slots = openSlots({
      now,
      weekly: weeklyResult.value,
      blackouts: blackoutResult.value,
      busy: [],
      bufferMinutes: 0,
      minNoticeHours: 0,
      maxDaysAhead: 0,
      durations: [30],
    });
    expect(slots.filter((s) => {
      const p = ptParts(s.startsAt);
      return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.day).padStart(2, '0')}` === todayKey;
    })).toHaveLength(0);
  });
});

