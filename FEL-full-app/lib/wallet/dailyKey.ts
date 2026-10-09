/**
 * lib/wallet/dailyKey.ts — DAILY-KEY-HOTFIX (2026-09-28): the server's once-a-day key.
 *
 * A daily reward is paid at most once per player per America/Los_Angeles calendar day, and the SERVER builds the key
 * that holds it to that. The client used to build it (components/dual-wallet-chip.tsx), so any new string was a new
 * key and paid again: the eye's a1a1c5f9 item 5b on fel_dev, then +100 on a forged key in production at 3a0f4edf.
 *
 *   wallet daily (daily_first_session):  `${eventType}:${ptDay(now)}:${userId}`   (WalletLedgerEntry.idempotencyKey)
 *   lab-credit streak (daily_streak):     `streak:${ptDay(now)}`   (CreditLedger.dedupeKey, unique per userId)
 *
 * PURE: no DB, no DOM, no network. The wallet chip imports ptDay too, so the day it marks is the day the server keys.
 */

import { DAILY_EVENT_TYPES } from './reward-rules';

/** The day a daily reward belongs to is this zone's calendar day (owner's zone; DST follows the zone). */
export const DAY_TIME_ZONE = 'America/Los_Angeles';

const WALL = new Intl.DateTimeFormat('en-US', {
  timeZone: DAY_TIME_ZONE, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** The wall clock in DAY_TIME_ZONE at `at`, as numbers. */
function wall(at: Date): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  const p: Record<string, number> = {};
  for (const part of WALL.formatToParts(at)) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return { y: p.year, m: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
}

const pad = (v: number) => String(v).padStart(2, '0');

/** The America/Los_Angeles calendar date at `now`, YYYY-MM-DD. */
export function ptDay(now: Date = new Date()): string {
  const w = wall(now);
  return `${w.y}-${pad(w.m)}-${pad(w.d)}`;
}

/** The zone's offset from UTC at the instant `ms` (wall clock minus UTC, in ms; −7 h in PDT, −8 h in PST). */
function offsetAt(ms: number): number {
  const w = wall(new Date(ms));
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant local midnight starts on y-m-d. The clocks change at 02:00 local, so between 00:00 UTC on that date (the
 * afternoon before, locally) and local midnight the offset is the same one, and 00:00 UTC minus it is midnight.
 */
function midnight(y: number, m: number, d: number): Date {
  const utc = Date.UTC(y, m - 1, d);
  return new Date(utc - offsetAt(utc));
}

/** The PT day at `now` and its half-open span [start, end) as instants. 23 h on the spring-forward day, 25 h in the fall. */
export function ptDayBounds(now: Date = new Date()): { day: string; start: Date; end: Date } {
  const w = wall(now);
  return { day: `${w.y}-${pad(w.m)}-${pad(w.d)}`, start: midnight(w.y, w.m, w.d), end: midnight(w.y, w.m, w.d + 1) };
}

/** The ledger key of a daily event type's claim: one per player per PT day. The client's key never replaces it. */
export function dailyKey(eventType: string, userId: string, now: Date = new Date()): string {
  return `${eventType}:${ptDay(now)}:${userId}`;
}

/**
 * Is `key` in a daily event type's key space? Those keys belong to the server's daily path alone: another earn filed
 * under one would sit on a player's future daily key, and their claim that day would be refused on it.
 */
export function isReservedDailyKey(key: string): boolean {
  for (const t of DAILY_EVENT_TYPES) if (key.startsWith(`${t}:`)) return true;
  return false;
}
