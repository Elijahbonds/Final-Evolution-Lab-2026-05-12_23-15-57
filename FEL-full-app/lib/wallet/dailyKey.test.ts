import { describe, expect, it, vi } from 'vitest';

// lib/economy.ts reaches for the app's Prisma client at import time; the key functions tested here never touch it
vi.mock('@/lib/db', () => ({ prisma: {} }));

import { DAY_TIME_ZONE, dailyKey, isReservedDailyKey, ptDay, ptDayBounds } from './dailyKey';
import { DAILY_EVENT_TYPES, EVENT_REASON, REASON } from './reward-rules';
import { buildDedupeKey } from '@/lib/economy';

// DAILY-KEY-HOTFIX (2026-09-28): the server's once-a-day key. The instants are written with their Pacific offset so each
// case reads as the wall clock it tests: -08:00 is PST (winter), -07:00 is PDT (summer).
const at = (iso: string) => new Date(iso);

describe('ptDay: the America/Los_Angeles calendar date', () => {
  it('is the zone the daily rewards belong to', () => {
    expect(DAY_TIME_ZONE).toBe('America/Los_Angeles');
  });

  it('turns over at Pacific midnight, not UTC midnight (PST, a non-DST date)', () => {
    expect(ptDay(at('2026-01-15T23:59:59-08:00'))).toBe('2026-01-15');
    expect(ptDay(at('2026-01-16T00:00:01-08:00'))).toBe('2026-01-16');
    // UTC midnight in PST is 16:00 Pacific: still the same Pacific day either side of it
    expect(ptDay(at('2026-01-15T15:59:00-08:00'))).toBe('2026-01-15');
    expect(ptDay(at('2026-01-15T16:01:00-08:00'))).toBe('2026-01-15');
  });

  it('turns over at Pacific midnight, not UTC midnight (PDT, a DST date)', () => {
    expect(ptDay(at('2026-07-15T23:59:59-07:00'))).toBe('2026-07-15');
    expect(ptDay(at('2026-07-16T00:00:01-07:00'))).toBe('2026-07-16');
    // UTC midnight in PDT is 17:00 Pacific
    expect(ptDay(at('2026-07-15T16:59:00-07:00'))).toBe('2026-07-15');
    expect(ptDay(at('2026-07-15T17:01:00-07:00'))).toBe('2026-07-15');
    expect(at('2026-07-15T17:01:00-07:00').toISOString().slice(0, 10)).toBe('2026-07-16');   // the UTC day already moved on
  });

  it('holds across both clock changes (2026-03-08 spring forward, 2026-11-01 fall back)', () => {
    expect(ptDay(at('2026-03-07T23:59:59-08:00'))).toBe('2026-03-07');
    expect(ptDay(at('2026-03-08T00:00:01-08:00'))).toBe('2026-03-08');
    expect(ptDay(at('2026-03-08T23:59:59-07:00'))).toBe('2026-03-08');
    expect(ptDay(at('2026-03-09T00:00:01-07:00'))).toBe('2026-03-09');
    expect(ptDay(at('2026-10-31T23:59:59-07:00'))).toBe('2026-10-31');
    expect(ptDay(at('2026-11-01T00:00:01-07:00'))).toBe('2026-11-01');
    expect(ptDay(at('2026-11-01T23:59:59-08:00'))).toBe('2026-11-01');
    expect(ptDay(at('2026-11-02T00:00:01-08:00'))).toBe('2026-11-02');
  });
});

describe('ptDayBounds: the Pacific day as instants [start, end)', () => {
  const cases: Array<[string, string, string, string, number]> = [
    // [an instant, its PT day, start, end, hours long]
    ['2026-01-15T12:00:00-08:00', '2026-01-15', '2026-01-15T08:00:00.000Z', '2026-01-16T08:00:00.000Z', 24],
    ['2026-07-15T17:01:00-07:00', '2026-07-15', '2026-07-15T07:00:00.000Z', '2026-07-16T07:00:00.000Z', 24],
    ['2026-03-08T12:00:00-07:00', '2026-03-08', '2026-03-08T08:00:00.000Z', '2026-03-09T07:00:00.000Z', 23],
    ['2026-11-01T12:00:00-08:00', '2026-11-01', '2026-11-01T07:00:00.000Z', '2026-11-02T08:00:00.000Z', 25],
    ['2026-12-31T23:59:59-08:00', '2026-12-31', '2026-12-31T08:00:00.000Z', '2027-01-01T08:00:00.000Z', 24],
  ];
  it.each(cases)('%s is in %s, from %s to %s (%i h)', (instant, day, start, end, hours) => {
    const b = ptDayBounds(at(instant));
    expect(b.day).toBe(day);
    expect(b.start.toISOString()).toBe(start);
    expect(b.end.toISOString()).toBe(end);
    expect((b.end.getTime() - b.start.getTime()) / 3_600_000).toBe(hours);
    // the edges are the day's own: the first instant is in it, the one before and the end are not
    expect(ptDay(b.start)).toBe(day);
    expect(ptDay(new Date(b.start.getTime() - 1))).not.toBe(day);
    expect(ptDay(b.end)).not.toBe(day);
    expect(ptDay(new Date(b.end.getTime() - 1))).toBe(day);
  });
});

describe('the daily keys', () => {
  it('daily_first_session: `<event>:<PT day>:<user id>`, whatever the UTC day', () => {
    expect(dailyKey('daily_first_session', 'u1', at('2026-07-15T17:30:00-07:00'))).toBe('daily_first_session:2026-07-15:u1');
    expect(dailyKey('daily_first_session', 'u1', at('2026-01-15T16:30:00-08:00'))).toBe('daily_first_session:2026-01-15:u1');
  });

  it('daily_streak: the key is the PT day (was the UTC day)', () => {
    // 5:30 pm PDT is already the next UTC day; the streak's day is still the Pacific one
    expect(buildDedupeKey({ kind: 'daily_streak', now: at('2026-07-15T17:30:00-07:00') })).toBe('streak:2026-07-15');
    expect(buildDedupeKey({ kind: 'daily_streak', now: at('2026-01-15T16:30:00-08:00') })).toBe('streak:2026-01-15');
    expect(buildDedupeKey({ kind: 'daily_streak', now: at('2026-07-16T00:00:01-07:00') })).toBe('streak:2026-07-16');
  });
});

describe('DAILY_EVENT_TYPES: every daily event type in EVENT_REASON, derived', () => {
  it('is exactly the one daily the wallet has today', () => {
    expect([...DAILY_EVENT_TYPES]).toEqual(['daily_first_session']);
    expect(EVENT_REASON.daily_first_session).toBe(REASON.DAILY_FIRST_SESSION);
  });

  it('leaves no daily-looking event type or reason out, so a new one cannot slip past the per-day key', () => {
    for (const [eventType, reasonCode] of Object.entries(EVENT_REASON)) {
      const daily = /daily/i.test(eventType) || /daily/i.test(reasonCode);
      expect(DAILY_EVENT_TYPES.has(eventType), eventType).toBe(daily);
    }
  });

  it('reserves the daily key space: another event may not file under `<daily type>:`', () => {
    expect(isReservedDailyKey('daily_first_session:2026-07-15:u1')).toBe(true);
    expect(isReservedDailyKey('daily_first_session:anything')).toBe(true);
    expect(isReservedDailyKey('daily_first_sessionX')).toBe(false);
    expect(isReservedDailyKey('k_3f1c')).toBe(false);
    expect(isReservedDailyKey('run:abc:completed')).toBe(false);
  });
});
