// Days, streaks and the daily goal — pure, so midnight and time zones can be tested without a clock.
//
// A "day" is the viewer's LOCAL calendar day, as an integer: days since 1970-01-01 in local time. The offset is the
// one Date#getTimezoneOffset() returns (minutes; UTC − local, so +420 in Los Angeles in summer, −60 in Paris in
// winter), read AT the moment being converted, so a daylight-saving change mid-streak lands on the right day.

export const DAY_MS = 86_400_000;

/** The daily goal: cards a day (owner's "5 cards a day"). */
export const DAILY_GOAL = 5;

/** The local day number of an instant. */
export function dayNumber(ms: number, tzOffsetMin: number): number {
  return Math.floor((ms - tzOffsetMin * 60_000) / DAY_MS);
}

/** The local day of an instant on this device. */
export function localDay(ms: number = Date.now()): number {
  return dayNumber(ms, new Date(ms).getTimezoneOffset());
}

export interface Streak {
  /** Consecutive days the daily goal was met, ending on `lastDay`. */
  count: number;
  best: number;
  /** The last day the goal was met, or null if never. */
  lastDay: number | null;
}

export const NO_STREAK: Streak = { count: 0, best: 0, lastDay: null };

/** Credit `today` as a goal-met day. Idempotent within a day; a gap of more than one day starts over at 1. */
export function creditDay(s: Streak, today: number): Streak {
  if (s.lastDay === today) return s;
  const count = s.lastDay !== null && s.lastDay === today - 1 ? s.count + 1 : 1;
  return { count, best: Math.max(s.best, count), lastDay: today };
}

/**
 * The streak to SHOW today. It is still alive through today if the goal was met yesterday (today's cards are not
 * done yet); after a missed day it reads 0. Nothing is written on a read — the next credit starts it again.
 */
export function liveStreak(s: Streak, today: number): number {
  if (s.lastDay === null) return 0;
  return s.lastDay >= today - 1 ? s.count : 0;
}

export interface Today {
  day: number;
  /** Card ids that counted toward today's goal (unique). */
  done: string[];
}

/** Count a card toward the goal of `day`, rolling the tally over at local midnight. */
export function countToward(t: Today, day: number, cardId: string): Today {
  const base = t.day === day ? t : { day, done: [] };
  if (base.done.includes(cardId)) return base;
  return { day, done: [...base.done, cardId] };
}

export function doneToday(t: Today, day: number): number {
  return t.day === day ? t.done.length : 0;
}
