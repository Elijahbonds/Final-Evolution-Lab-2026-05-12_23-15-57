// TRY-AGE-PLACEHOLDER-1 (Cyber's B1 ruling, 2026-11-02; Elijah via PM 7:05 PM PT: "Yes, let teens 13-17 use /try through the teen
// path"). Behind TRY_AGE_BANDS_ENABLED (lib/flags.ts, default off: /try keeps the year-only answer it shipped with).
//
// With the flag on, /try's age answer is read from the FULL birth date the age step already asks for (FN-BOX-1b): the adult band
// only on or after the 18th birthday, the teen band only on or after the 13th. Year-only rounding never moves anyone up a band.
// The band (and only the band, never the date) is added to the tab's session lock, fel.screen.sessionAge (lib/screen/store
// lockSessionAge), which only ever tightens: after a blocked or teen answer, a re-pick in the same session cannot reach an older band.
//
//   under-13            → 'blocked': the existing blocked path (the block flag, nothing kept, the parent-Allow path).
//   13-17 / unknown     → 'local':   the existing teen path on /try: the run plays on the phone only (no guest row, no telemetry,
//                                    no challenge post, no claim, no store offer: guest-dunk-shell's `online` stays false).
//   18+                 → 'adult':   the adult path as it is today.
// /try mounts no camera and records nothing, so its teen path has no camera, Record button or saved numbers to switch off.
import { isFutureBirthDate, parseBirthDate, type CalendarDate } from '@/lib/age/ageRules';
import { lockSessionAge, type StorageLike } from '@/lib/screen/store';
import type { AgeBand } from '@/lib/screen/age';

export type TryGate = 'blocked' | 'local' | 'adult';

function isLeapYear(y: number): boolean { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
function todayOf(now: Date): CalendarDate { return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }; }
function onOrAfter(a: CalendarDate, b: CalendarDate): boolean {
  return a.year !== b.year ? a.year > b.year : a.month !== b.month ? a.month > b.month : a.day >= b.day;
}
/** Has the person born on `birth` reached their `years`th birthday by `now`? (A 29 February birthday falls on 1 March in a plain year.) */
export function reachedBirthday(birth: CalendarDate, years: number, now: Date = new Date()): boolean {
  const year = birth.year + years;
  const leap = birth.month === 2 && birth.day === 29 && !isLeapYear(year);
  return onOrAfter(todayOf(now), leap ? { year, month: 3, day: 1 } : { year, month: birth.month, day: birth.day });
}

/** The age band for a full birth date ('YYYY-MM-DD'). Anything unreadable, or a date after today, is 'unknown' (kept as a kid). */
export function tryAgeBand(birthDate: string | null | undefined, now: Date = new Date()): AgeBand {
  const birth = parseBirthDate(birthDate);
  if (!birth || isFutureBirthDate(birth, now)) return 'unknown';
  if (reachedBirthday(birth, 18, now)) return '18+';
  if (reachedBirthday(birth, 13, now)) return '13-17';
  return 'under-13';
}

/** The gate a band opens on /try. */
export function gateForBand(band: AgeBand): TryGate {
  return band === '18+' ? 'adult' : band === 'under-13' ? 'blocked' : 'local';
}

/** Lock this answer into the session (the strictest band the tab has given holds) and return the gate that band opens. */
export function lockTryAge(s: StorageLike | null, band: AgeBand): TryGate {
  return gateForBand(lockSessionAge(s, band));
}

/** The tab's sessionStorage, or null where the browser refuses it (lockSessionAge then keeps the band in the page's memory). */
export function tabStorage(): StorageLike | null {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
}
