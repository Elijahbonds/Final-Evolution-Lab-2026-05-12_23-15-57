// TEAMS-SQUADS: the group week. Monday to Sunday on the Pacific clock — the wallet's day (lib/wallet/dailyKey ptDay),
// which is the day the daily drill's claim is keyed on, so "did today's drill" and "this week" agree everywhere.
// assumption: one clock for every member (the app's ledger day); a member in another zone sees the PT day.
// Pure.

import { ptDay, ptDayBounds } from '@/lib/wallet/dailyKey';

const DAY = 86_400_000;

function parse(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
const fmt = (utc: number) => new Date(utc).toISOString().slice(0, 10);

/** 'YYYY-MM-DD' plus n calendar days. */
export const addDays = (day: string, n: number): string => fmt(parse(day) + n * DAY);

/** The PT day of an instant. */
export const dayOf = (at: Date | number): string => ptDay(new Date(at));

/** The week's key: its Monday, PT, 'YYYY-MM-DD'. */
export function weekKeyOf(at: Date | number): string {
  const day = dayOf(at);
  const dow = new Date(parse(day)).getUTCDay(); // 0 Sunday … 6 Saturday
  return addDays(day, -((dow + 6) % 7));
}

export const prevWeekKey = (weekKey: string): string => addDays(weekKey, -7);

/** The seven PT days of a week, Monday first. */
export const weekDays = (weekKey: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(weekKey, i));

/** The instant a PT day starts (DST-safe: read off the wallet's own bounds at that day's midday). */
export function dayStart(day: string): Date {
  return ptDayBounds(new Date(parse(day) + 20 * 3_600_000)).start;
}

/** A week as instants, [start, end). */
export function weekBounds(weekKey: string): { start: Date; end: Date } {
  return { start: dayStart(weekKey), end: dayStart(addDays(weekKey, 7)) };
}

/** The last n PT days ending today, today first. */
export function lastDays(at: Date | number, n: number): string[] {
  const today = dayOf(at);
  return Array.from({ length: n }, (_, i) => addDays(today, -i));
}
