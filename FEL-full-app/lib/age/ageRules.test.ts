// lib/age/ageRules.test.ts — AGE-HELPERS-CONSOLIDATE (2026-10-04, option (a)) equivalence coverage.
//
// WHAT THIS FILE PROVES. Each "reference*" function below is a frozen COPY of the ORIGINAL implementation each
// helper had before the consolidation (see ~/Claude/_observe/AGE-HELPERS-INVENTORY.txt and
// AGE-HELPERS-DIVERGENCE.txt for the file:line this was copied from). The tests assert that every current helper —
// both the two new canonical rules in this module and every old call-site wrapper that now delegates to them —
// still returns EXACTLY what its reference copy returns, for every case the inventory flagged plus the
// gap-exactly-18 boundary that is the whole reason the two rules are named separately instead of unified.
import { describe, expect, it } from 'vitest';
import {
  gapAtLeastEighteenYears,
  gapExceedsEighteenYears,
  isAdultAtLeast18,
  isVerifiedAdultStrict,
} from './ageRules';
import { calendarDate, formatBirthDate, isAdult18, isFutureBirthDate, parseBirthDate } from './ageRules';
import { verifiedAdult } from '../privacy/verifiedAdult';
import { youthGateFor } from '../mirror/screenCorrectives';
import { isMinorForMirror } from '../mirror/youth';
import { youthRules } from '../coach/taxonomy';
import { planAudience } from '../workout/plan-revision';
import { isAdult } from '../creator/cardProgression-server';
import { needsGuardianConsent } from '../camp/certification';
import { needsGuardian } from '../consent/guardianGate';

const NOW = new Date('2026-10-04T00:00:00Z'); // thisYear = 2026, matching the inventory's own worked example

// ── frozen reference copies (ORIGINAL pre-consolidation bodies) ────────────────────────────────────────────────────

/** Reference copy of the original lib/privacy/verifiedAdult.ts (Group A, strict `> 18`). */
function referenceVerifiedAdultStrict(dobYear: number | null | undefined, now: Date): boolean {
  const EARLIEST_BIRTH_YEAR = 1900;
  if (typeof dobYear !== 'number' || !Number.isInteger(dobYear)) return false;
  const thisYear = now.getFullYear();
  if (dobYear < EARLIEST_BIRTH_YEAR || dobYear > thisYear) return false;
  return thisYear - dobYear > 18;
}

/** Reference copy of the original lib/mirror/screenCorrectives.ts youthGateFor (Group A). */
function referenceYouthGateFor(dobYear: number | null | undefined, now: Date): 'minor' | 'unknownAge' | null {
  if (typeof dobYear !== 'number' || !Number.isFinite(dobYear) || dobYear < 1900) return 'unknownAge';
  return now.getFullYear() - dobYear > 18 ? null : 'minor';
}

/** Reference copy of the original lib/coach/taxonomy.ts youthRules (Group A). */
function referenceYouthRules(dobYear: number | null | undefined, now: Date): boolean {
  if (typeof dobYear !== 'number' || !Number.isFinite(dobYear) || dobYear < 1900) return true;
  return !(now.getFullYear() - dobYear > 18);
}

/** Reference copy of the original lib/workout/plan-revision.ts planAudience (Group A). */
function referencePlanAudience(dobYear: number | null | undefined, now: Date): 'adult' | 'youth' {
  if (typeof dobYear !== 'number' || !Number.isFinite(dobYear) || dobYear < 1900) return 'youth';
  return now.getFullYear() - dobYear > 18 ? 'adult' : 'youth';
}

/** Reference copy of the original lib/creator/cardProgression-server.ts isAdult (Group B, `>= 18`). */
function referenceIsAdult(dobYear: number | null | undefined, now: Date): boolean {
  if (!dobYear) return false;
  return now.getFullYear() - dobYear >= 18;
}

/** Reference copy of the original lib/camp/certification.ts needsGuardianConsent (Group B). */
function referenceNeedsGuardianConsent(birthYear: number | null | undefined, now: Date): boolean {
  if (!birthYear) return true;
  return now.getFullYear() - birthYear < 18;
}

/** Reference copy of the original lib/consent/guardianGate.ts needsGuardian (Group B, `== null`-only guard). */
function referenceNeedsGuardian(dobYear: number | null | undefined, now: Date): boolean {
  if (dobYear == null) return true;
  return now.getFullYear() - dobYear < 18;
}

// ── the inputs every reference/current pair is checked against ─────────────────────────────────────────────────────
// Required by the task: gap exactly 18, unknown (null/undefined/NaN/0), ages/gaps 13/17/19, plus the inventory's
// other edge cases (12, 14, a future year, a pre-1900 year, a non-integer year).
const thisYear = NOW.getFullYear(); // 2026
const CASES: Array<number | null | undefined> = [
  thisYear - 18, // gap exactly 18 (2008) — THE case the two rules disagree on
  thisYear - 19, // gap 19 — strictly adult under both rules
  thisYear - 17, // gap 17 — minor under both rules
  thisYear - 13, // gap 13
  thisYear - 14, // gap 14
  thisYear - 12, // gap 12
  null,
  undefined,
  NaN,
  0,
  1899, // just under the earliest-birth-year guard
  1900, // exactly the earliest-birth-year guard
  thisYear + 1, // a future year
  1995.5, // a non-integer year
];

describe('isVerifiedAdultStrict (Group A, `> 18`) matches the frozen lib/privacy/verifiedAdult.ts reference', () => {
  it.each(CASES)('dobYear=%s', (dobYear) => {
    expect(isVerifiedAdultStrict(dobYear, NOW)).toBe(referenceVerifiedAdultStrict(dobYear, NOW));
  });

  it('gap exactly 18 is NOT strict-adult', () => {
    expect(isVerifiedAdultStrict(thisYear - 18, NOW)).toBe(false);
  });
});

describe('isAdultAtLeast18 (Group B, `>= 18`) matches the frozen lib/creator/cardProgression-server.ts reference', () => {
  it.each(CASES)('dobYear=%s', (dobYear) => {
    expect(isAdultAtLeast18(dobYear, NOW)).toBe(referenceIsAdult(dobYear, NOW));
  });

  it('gap exactly 18 IS at-least-18 adult', () => {
    expect(isAdultAtLeast18(thisYear - 18, NOW)).toBe(true);
  });
});

describe('the gap-exactly-18 case: the two rules disagree on purpose', () => {
  it('strict (> 18) says minor, at-least-18 (>= 18) says adult, for the same dobYear', () => {
    const dobYear = thisYear - 18;
    expect(isVerifiedAdultStrict(dobYear, NOW)).toBe(false);
    expect(isAdultAtLeast18(dobYear, NOW)).toBe(true);
  });
});

describe('raw boundary helpers agree with the full canonical rules whenever dobYear is already a valid number', () => {
  it.each([thisYear - 18, thisYear - 19, thisYear - 17, thisYear - 13, 1990])('dobYear=%s', (dobYear) => {
    expect(gapExceedsEighteenYears(dobYear, NOW)).toBe(thisYear - dobYear > 18);
    expect(gapAtLeastEighteenYears(dobYear, NOW)).toBe(thisYear - dobYear >= 18);
  });
});

// ── every existing call-site wrapper: same input, same output as its frozen pre-consolidation reference ───────────

describe('lib/privacy/verifiedAdult.ts verifiedAdult — unchanged behaviour after re-export', () => {
  it.each(CASES)('dobYear=%s', (dobYear) => {
    expect(verifiedAdult(dobYear, NOW)).toBe(referenceVerifiedAdultStrict(dobYear, NOW));
  });
});

describe('lib/mirror/screenCorrectives.ts youthGateFor — unchanged behaviour', () => {
  it.each(CASES)('dobYear=%s', (dobYear) => {
    expect(youthGateFor(dobYear, NOW)).toBe(referenceYouthGateFor(dobYear, NOW));
  });
});

describe('lib/mirror/youth.ts isMinorForMirror — unchanged behaviour (wraps youthGateFor)', () => {
  it.each(CASES)('dobYear=%s', (dobYear) => {
    expect(isMinorForMirror(dobYear, NOW)).toBe(referenceYouthGateFor(dobYear, NOW) !== null);
  });
});

describe('lib/coach/taxonomy.ts youthRules — unchanged behaviour', () => {
  it.each(CASES)('dobYear=%s', (dobYear) => {
    expect(youthRules(dobYear, NOW)).toBe(referenceYouthRules(dobYear, NOW));
  });
});

describe('lib/workout/plan-revision.ts planAudience — unchanged behaviour', () => {
  it.each(CASES)('dobYear=%s', (dobYear) => {
    expect(planAudience(dobYear, NOW)).toBe(referencePlanAudience(dobYear, NOW));
  });
});

describe('lib/creator/cardProgression-server.ts isAdult — unchanged behaviour after re-export', () => {
  it.each(CASES)('dobYear=%s', (dobYear) => {
    expect(isAdult(dobYear, NOW)).toBe(referenceIsAdult(dobYear, NOW));
  });
});

describe('lib/camp/certification.ts needsGuardianConsent — unchanged behaviour', () => {
  it.each(CASES)('birthYear=%s', (birthYear) => {
    expect(needsGuardianConsent(birthYear, NOW)).toBe(referenceNeedsGuardianConsent(birthYear, NOW));
  });
});

describe('lib/consent/guardianGate.ts needsGuardian — unchanged behaviour, INCLUDING its own `== null`-only guard', () => {
  it.each(CASES)('dobYear=%s', (dobYear) => {
    expect(needsGuardian(dobYear, NOW)).toBe(referenceNeedsGuardian(dobYear, NOW));
  });

  it('dobYear=0 and NaN fall through to arithmetic here (unlike isAdultAtLeast18\'s `!dobYear` guard) — frozen quirk, not touched', () => {
    // 0 and NaN are NOT `== null`, so the original code (and this wrapper) computes `thisYear - dobYear < 18`
    // rather than short-circuiting the way isAdultAtLeast18 / needsGuardianConsent do. This is a pre-existing,
    // narrower divergence inside Group B itself (not introduced by this consolidation) — preserved exactly.
    expect(needsGuardian(0, NOW)).toBe(false);
    expect(needsGuardian(NaN, NOW)).toBe(false);
  });
});

// ── FN-BOX-1b (2026-10-19): the full-date rule ─────────────────────────────────────────────────────────────────────────
// Local-clock instants: isAdult18 reads `now` on the local calendar, like the year rules read now.getFullYear().
describe('isAdult18 — 18 from the 18th birthday on, by calendar date', () => {
  const ON = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

  it('the day before the 18th birthday is refused; the birthday itself and after are allowed', () => {
    expect(isAdult18('2008-10-20', ON(2026, 10, 19))).toBe(false);
    expect(isAdult18('2008-10-19', ON(2026, 10, 19))).toBe(true);
    expect(isAdult18('2008-10-18', ON(2026, 10, 19))).toBe(true);
    expect(isAdult18('2008-10-19', ON(2026, 10, 19, 0))).toBe(true);          // the first instant of the birthday
    expect(isAdult18('2008-10-20', new Date(2026, 9, 19, 23, 59, 59, 999))).toBe(false);   // its last instant before
    expect(isAdult18('2008-01-01', ON(2026, 1, 1, 0))).toBe(true);
    expect(isAdult18('2008-12-31', ON(2026, 12, 30))).toBe(false);
    expect(isAdult18('2008-12-31', ON(2026, 12, 31))).toBe(true);
  });

  it('more than 18, or 17 by any margin', () => {
    expect(isAdult18('1990-06-15', ON(2026, 10, 19))).toBe(true);
    expect(isAdult18('2009-01-01', ON(2026, 10, 19))).toBe(false);
    expect(isAdult18('2011-05-05', ON(2026, 10, 19))).toBe(false);
  });

  it('a Feb 29 birth turns 18 on Mar 1 (birth year + 18 is never a leap year), so is refused on Feb 28', () => {
    // born 2008-02-29 → 18 in 2026 (not leap): refused on Feb 28, allowed on Mar 1
    expect(isAdult18('2008-02-29', ON(2026, 2, 28))).toBe(false);
    expect(isAdult18('2008-02-29', new Date(2026, 1, 28, 23, 59, 59, 999))).toBe(false);
    expect(isAdult18('2008-02-29', ON(2026, 3, 1, 0))).toBe(true);
    // born 2012-02-29 → 18 in 2030 (not leap): the same
    expect(isAdult18('2012-02-29', ON(2030, 2, 28))).toBe(false);
    expect(isAdult18('2012-02-29', ON(2030, 3, 1))).toBe(true);
    // born 2014-02-29 does not exist (2014 is not leap) → invalid → false
    expect(isAdult18('2014-02-29', ON(2040, 1, 1))).toBe(false);
    // born 1996-02-29 → 18 in 2014 (not leap): the same
    expect(isAdult18('1996-02-29', ON(2014, 2, 28))).toBe(false);
    expect(isAdult18('1996-02-29', ON(2014, 3, 1))).toBe(true);
    // an 18th year that IS leap: born 1986-02-28 → 2004-02-28, a plain date check (and Feb 29 is not involved)
    expect(isAdult18('1986-02-28', ON(2004, 2, 27))).toBe(false);
    expect(isAdult18('1986-02-28', ON(2004, 2, 28))).toBe(true);
  });

  it('invalid dates are false', () => {
    const now = ON(2026, 10, 19);
    for (const bad of ['', '2008', '2008-13-01', '2008-00-10', '2008-02-30', '2008-04-31', '2008-10-00', '2008-1-5',
      '08-10-19', '2008/10/19', '1899-12-31', ' 2008-10-19', '2008-10-19T00:00:00Z', 'not a date']) {
      expect(isAdult18(bad, now), bad).toBe(false);
    }
    for (const bad of [null, undefined, new Date(NaN)]) expect(isAdult18(bad as never, now)).toBe(false);
    expect(isAdult18(20081019 as never, now)).toBe(false);
  });

  it('future dates are false (born after today, even far after)', () => {
    const now = ON(2026, 10, 19);
    expect(isAdult18('2026-10-20', now)).toBe(false);
    expect(isAdult18('2099-01-01', now)).toBe(false);
    expect(isAdult18('2026-10-19', now)).toBe(false);   // born today: 0, not 18
  });

  it('a Date is read as a calendar date in UTC (how a Postgres DATE comes back)', () => {
    expect(isAdult18(new Date('2008-10-19T00:00:00Z'), ON(2026, 10, 19))).toBe(true);
    expect(isAdult18(new Date('2008-10-20T00:00:00Z'), ON(2026, 10, 19))).toBe(false);
  });

  it('parseBirthDate / calendarDate / formatBirthDate round-trip real dates and refuse the rest', () => {
    expect(parseBirthDate('2008-02-29')).toEqual({ year: 2008, month: 2, day: 29 });
    expect(parseBirthDate('2007-02-29')).toBeNull();
    expect(calendarDate(2000, 2, 29)).toEqual({ year: 2000, month: 2, day: 29 });
    expect(calendarDate(1900, 2, 29)).toBeNull();          // 1900 is not leap
    expect(calendarDate(2008, 10, 1.5)).toBeNull();
    expect(calendarDate('2008', 10, 1)).toBeNull();
    expect(formatBirthDate({ year: 2008, month: 3, day: 1 })).toBe('2008-03-01');
    expect(isFutureBirthDate({ year: 2026, month: 10, day: 20 }, ON(2026, 10, 19))).toBe(true);
    expect(isFutureBirthDate({ year: 2026, month: 10, day: 19 }, ON(2026, 10, 19))).toBe(false);
  });

  it('is never looser than the strict year rule where the year rule says yes, and never says yes before 18', () => {
    // every day of 2026 for a 2007 birth (the strict rule allows all year) is allowed by the full date too
    for (let m = 1; m <= 12; m++) expect(isAdult18(`2007-${String(m).padStart(2, '0')}-15`, ON(2026, 1, 1))).toBe(true);
    // the strict rule's refused year: a 2008 birth is allowed from its birthday, refused before it
    for (let m = 2; m <= 12; m++) {
      const dob = `2008-${String(m).padStart(2, '0')}-01`;
      expect(isAdult18(dob, ON(2026, m - 1, 28)), dob).toBe(false);
      expect(isAdult18(dob, ON(2026, m, 1)), dob).toBe(true);
    }
  });
});
