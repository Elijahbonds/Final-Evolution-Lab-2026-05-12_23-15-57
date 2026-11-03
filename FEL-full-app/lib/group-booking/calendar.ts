// lib/group-booking/calendar.ts — GROUP-BOOKING: dates on the Pacific wall clock. A group meets on calendar days in Los
// Angeles at 5, 6 or 7 pm local time whatever the UTC offset, so every date here is a 'YYYY-MM-DD' Pacific day key and
// every instant is made from (day, hour) by lib/sessions/schedule.ts ptWallClockToUtc, which corrects for DST. The weeks
// across a DST change (2026-11-01, fall back) keep 5 pm at 5 pm: Wed Oct 28 5 pm PDT = 00:00Z, Mon Nov 2 5 pm PST = 01:00Z.
//
// A week is Monday → Sunday on the Pacific calendar (the make-up rule's "same week, or the next").
//
// Pure.
import { ptParts, ptWallClockToUtc } from '@/lib/sessions/schedule';
import { DAY_PAIRS, type DayPair } from './config';

const KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day 'YYYY-MM-DD', or null. */
export function parseDayKey(v: unknown): { y: number; m: number; d: number } | null {
  if (typeof v !== 'string') return null;
  const m = KEY.exec(v);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

const pad = (n: number) => String(n).padStart(2, '0');
const keyOfUtcNoon = (t: Date) => `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;

/** The Pacific calendar day of an instant. */
export function ptDayKey(at: Date): string {
  const p = ptParts(at);
  return `${p.y}-${pad(p.m)}-${pad(p.day)}`;
}

/** Calendar arithmetic on a day key (no clock involved, so DST cannot shift it). */
export function addDays(key: string, n: number): string {
  const p = parseDayKey(key);
  if (!p) throw new Error(`bad day key ${key}`);
  return keyOfUtcNoon(new Date(Date.UTC(p.y, p.m - 1, p.d + n, 12)));
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(key: string): number {
  const p = parseDayKey(key);
  if (!p) throw new Error(`bad day key ${key}`);
  return new Date(Date.UTC(p.y, p.m - 1, p.d, 12)).getUTCDay();
}

/** The Monday that starts this key's week. */
export function mondayOf(key: string): string {
  return addDays(key, -((weekdayOf(key) + 6) % 7));
}

/** The Sunday that ends this key's week. */
export function sundayOf(key: string): string {
  return addDays(mondayOf(key), 6);
}

/** Whole weeks from a's week to b's week (b's Monday − a's Monday, in weeks). */
export function weeksBetween(a: string, b: string): number {
  const pa = parseDayKey(mondayOf(a))!, pb = parseDayKey(mondayOf(b))!;
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / (7 * 86_400_000));
}

/** The UTC instant of hour:00 on this Pacific day. */
export function atPt(key: string, hour: number, minute = 0): Date {
  const p = parseDayKey(key);
  if (!p) throw new Error(`bad day key ${key}`);
  return ptWallClockToUtc(p.y, p.m, p.d, hour, minute);
}

export interface Occurrence {
  /** Pacific day key. */
  date: string;
  /** 1-based week of the group. */
  week: number;
  startsAt: Date;
}

/** Every session of a group: `weeks` weeks from the week of startDate, on its two weekdays, at its hour (PT). */
export function groupSessions(g: { startDate: string; dayPair: DayPair; hour: number; weeks: number }): Occurrence[] {
  const monday = mondayOf(g.startDate);
  const out: Occurrence[] = [];
  for (let w = 0; w < g.weeks; w++) {
    for (const dow of DAY_PAIRS[g.dayPair]) {
      const date = addDays(monday, w * 7 + ((dow + 6) % 7));
      out.push({ date, week: w + 1, startsAt: atPt(date, g.hour) });
    }
  }
  return out;
}

/** The key a seat is counted under: one regular session of a group, or one make-up slot at a gym. */
export const groupSlotKey = (groupId: string, date: string) => `group:${groupId}:${date}`;
export const makeupSlotKey = (gymId: string, date: string, hour: number) => `makeup:${gymId}:${date}:${hour}`;

export interface MakeupSlot { gymId: string; date: string; hour: number; startsAt: Date; slotKey: string }

/** Make-up slots at a gym from `from` to `to` (inclusive day keys): the make-up weekdays × hours (owner: Fri/Sat 5, 6, 7 pm). */
export function makeupSlots(gymId: string, from: string, to: string, days: readonly number[], hours: readonly number[]): MakeupSlot[] {
  const out: MakeupSlot[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!days.includes(weekdayOf(d))) continue;
    for (const hour of hours) out.push({ gymId, date: d, hour, startsAt: atPt(d, hour), slotKey: makeupSlotKey(gymId, d, hour) });
  }
  return out;
}

/** "Mon Nov 2". */
export function dayLabel(key: string): string {
  const p = parseDayKey(key)!;
  return new Date(Date.UTC(p.y, p.m - 1, p.d, 12)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
