// lib/age/ageRules.ts — AGE-HELPERS-CONSOLIDATE, option (a) (owner GO, 2026-10-04).
//
// ONE MODULE, TWO NAMED RULES, ZERO BEHAVIOUR CHANGE. This file does not pick a winner between the two
// "is this person 18+" boundaries documented in ~/Claude/_observe/AGE-HELPERS-DIVERGENCE.txt — they answer two
// different product questions on the same User.dobYear column, confirmed as intentional by the owner (not a bug to
// silently unify):
//
//   STRICT rule — `isVerifiedAdultStrict` — thisYear - dobYear > 18 (MORE than 18; a birth-year-only person must be
//   certain to have turned 19 this calendar year). Used wherever the cost of being wrong is a minor's privacy or
//   health data: lib/privacy/verifiedAdult.ts, lib/mirror/screenCorrectives.ts youthGateFor, lib/coach/taxonomy.ts
//   youthRules, lib/workout/plan-revision.ts planAudience, lib/mirror/youth.ts isMinorForMirror.
//
//   AT-LEAST-18 rule — `isAdultAtLeast18` — thisYear - dobYear >= 18 (adult already at an exact 18-year gap, no
//   extra buffer year). Used for the creator card and guardian-consent surfaces: lib/creator/cardProgression-server.ts
//   isAdult, lib/camp/certification.ts needsGuardianConsent, lib/consent/guardianGate.ts needsGuardian.
//
// Pure and import-free ON PURPOSE (same reason lib/privacy/verifiedAdult.ts was: lib/health/intake.ts and other
// client components import this rule's result transitively, so it must not drag next/server or a database type into
// a browser bundle).
//
// THIS FILE DOES NOT CHANGE ANY CALL SITE'S GUARD CLAUSES. The five Group-A files and three Group-B files each kept
// their own "what counts as an unknown/invalid year" guard (a real, if minor, divergence in its own right — see
// AGE-HELPERS-DIVERGENCE.txt's "secondary, lower-stakes divergence" note) and still do; only the shared threshold
// arithmetic — the actual `> 18` and `>= 18` lines — now lives in one place. `isVerifiedAdultStrict` and
// `isAdultAtLeast18` below are the two FULL canonical checks (guard included) for the two files that already were
// the fullest, most-guarded implementation of each rule (lib/privacy/verifiedAdult.ts and
// lib/creator/cardProgression-server.ts isAdult); every other file re-exports or thinly wraps one of these two, or
// (where its own guard clause differs) calls the matching raw boundary function below and keeps its own guard.

/** The earliest birth year taken as real; anything before it is a typo or a placeholder, not a verified age. */
const EARLIEST_BIRTH_YEAR = 1900;

/**
 * Raw STRICT boundary: true when the gap from `dobYear` to `now`'s year is MORE than 18. No guard clause — the
 * caller is responsible for validating `dobYear` first. Exported so the Group A helpers that keep their own
 * (slightly looser) guard clauses can still share this one threshold line instead of each re-typing `> 18`.
 */
export function gapExceedsEighteenYears(dobYear: number, now: Date = new Date()): boolean {
  return now.getFullYear() - dobYear > 18;
}

/**
 * Raw AT-LEAST-18 boundary: true when the gap from `dobYear` to `now`'s year is 18 OR MORE. No guard clause — the
 * caller is responsible for validating `dobYear` first. Exported so the Group B helpers that keep their own guard
 * clauses can still share this one threshold line instead of each re-typing `>= 18`.
 */
export function gapAtLeastEighteenYears(dobYear: number, now: Date = new Date()): boolean {
  return now.getFullYear() - dobYear >= 18;
}

/**
 * Raw UNDER-18 boundary: true when the gap from `dobYear` to `now`'s year is LESS than 18. No guard clause. This is
 * NOT simply `!gapAtLeastEighteenYears(...)` — for a NaN `dobYear` every numeric comparison is false, so `< 18` and
 * `!(>= 18)` disagree (`NaN < 18` is false; `!(NaN >= 18)` is true). lib/consent/guardianGate.ts's `needsGuardian`
 * relies on the `< 18` form specifically (its own guard only catches `== null`, not NaN), so this raw helper exists
 * to let it share the threshold line without changing that frozen behaviour.
 */
export function gapUnderEighteenYears(dobYear: number, now: Date = new Date()): boolean {
  return now.getFullYear() - dobYear < 18;
}

/**
 * STRICT verified-adult rule (Group A): true ONLY for a finite integer year, >= 1900, not in the future, whose gap
 * to this calendar year is MORE than 18. Missing, null, NaN, a fraction, < 1900 or a future year → false. This is
 * the canonical check for privacy / health-write / scan-save surfaces (lib/privacy/verifiedAdult.ts re-exports this
 * verbatim) — a year gap of exactly 18 may still be a 17-year-old, so it is NOT treated as verified 18+.
 */
export function isVerifiedAdultStrict(dobYear: number | null | undefined, now: Date = new Date()): boolean {
  if (typeof dobYear !== 'number' || !Number.isInteger(dobYear)) return false;
  const thisYear = now.getFullYear();
  if (dobYear < EARLIEST_BIRTH_YEAR || dobYear > thisYear) return false;
  return gapExceedsEighteenYears(dobYear, now);
}

/**
 * AT-LEAST-18 adult rule (Group B): true once the gap to this calendar year is 18 or more (adult already at an
 * exact-18 gap — no "must be 19" buffer). A missing/falsy `dobYear` (including 0) → false. This is the canonical
 * check for the creator card and guardian-consent surfaces (lib/creator/cardProgression-server.ts isAdult
 * re-exports this verbatim).
 */
export function isAdultAtLeast18(dobYear: number | null | undefined, now: Date = new Date()): boolean {
  if (!dobYear) return false;
  return gapAtLeastEighteenYears(dobYear, now);
}

// ── FULL-DATE RULE (FN-BOX-1b, 2026-10-19) ─────────────────────────────────────────────────────────────────────────────
//
// A birth year alone cannot tell a 17-year-old from an 18-year-old in the year they turn 18, so the strict year rule
// refuses that whole year. With a full date of birth (User.dob, prisma/pending/2026-10-19-user-dob.sql) the answer is
// exact: `isAdult18` is true from the 18th birthday on. Dates are calendar dates, 'YYYY-MM-DD' — no time, no zone. The
// birth date is read as written (a Date is read in UTC, which is how Postgres DATE comes back through Prisma); `now` is
// read on the local calendar, the same clock `now.getFullYear()` reads for the year rules above.

/** A calendar date. month is 1–12. */
export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const isLeapYear = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

const daysInMonth = (y: number, m: number): number => (m === 2 ? (isLeapYear(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31);

const compareDates = (a: CalendarDate, b: CalendarDate): number => a.year - b.year || a.month - b.month || a.day - b.day;

/** The local calendar date of `now`. */
function todayOf(now: Date): CalendarDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/**
 * A real calendar date from integer parts, year >= 1900, or null (Feb 30, month 13, a fraction, NaN …). No "is it in
 * the future" check: that is the caller's (it depends on `now`).
 */
export function calendarDate(year: unknown, month: unknown, day: unknown): CalendarDate | null {
  if (![year, month, day].every((n) => typeof n === 'number' && Number.isInteger(n))) return null;
  const [y, m, d] = [year, month, day] as number[];
  if (y < EARLIEST_BIRTH_YEAR || y > 9999 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { year: y, month: m, day: d };
}

/** 'YYYY-MM-DD' (or a Date, read in UTC) as a real calendar date, else null. Anything else is null. */
export function parseBirthDate(dob: unknown): CalendarDate | null {
  if (dob instanceof Date) {
    if (!Number.isFinite(dob.getTime())) return null;
    return calendarDate(dob.getUTCFullYear(), dob.getUTCMonth() + 1, dob.getUTCDate());
  }
  if (typeof dob !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  return m ? calendarDate(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

/** The date as 'YYYY-MM-DD'. */
export function formatBirthDate(d: CalendarDate): string {
  return `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

/** True when the date is after `now`'s local calendar date (born tomorrow is not a birth date). */
export function isFutureBirthDate(d: CalendarDate, now: Date = new Date()): boolean {
  return compareDates(d, todayOf(now)) > 0;
}

/**
 * FULL-DATE adult rule: true ONLY when the person has had their 18th birthday on or before `now`'s calendar date. A
 * Feb 29 birth has its birthday on Mar 1 in a year with no Feb 29 (so is still refused on Feb 28). An invalid date, a
 * year before 1900, or a date after today → false.
 */
export function isAdult18(dob: string | Date | null | undefined, now: Date = new Date()): boolean {
  const birth = parseBirthDate(dob);
  if (!birth || isFutureBirthDate(birth, now)) return false;
  const year = birth.year + 18;
  const leapDayInPlainYear = birth.month === 2 && birth.day === 29 && !isLeapYear(year);
  const eighteenth: CalendarDate = leapDayInPlainYear ? { year, month: 3, day: 1 } : { year, month: birth.month, day: birth.day };
  return compareDates(todayOf(now), eighteenth) >= 0;
}
