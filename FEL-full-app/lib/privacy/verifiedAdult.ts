// lib/privacy/verifiedAdult.ts — TEEN-WRITE-BLOCK (2026-09-29): "verified 18+" from a year of birth, and nothing else.
//
// Pure and import-free ON PURPOSE: lib/health/intake.ts (which client components import for its copy and its pure
// answer checks) takes this rule too, so it must not drag next/server or a database type into a browser bundle.
// lib/privacy/scanSaveGate.ts re-exports it beside the gates that read the year from the database.
//
// Only the year is stored, so a year gap of exactly 18 may still be a 17-year-old: that is NOT verified 18+ (Cyber's
// PRIVACY-CORE-SCAN-GAPS.md GAP 1 fix 1). assumption: (FE PM can loosen) the boundary is `thisYear - dobYear > 18`;
// loosening it to >= 18 is the one line below.

/** The earliest birth year taken as real; anything before it is a typo or a placeholder, not a verified age. */
const EARLIEST_BIRTH_YEAR = 1900;

/**
 * Verified 18+ from a year of birth. True ONLY for a finite integer year, >= 1900, not in the future, whose gap to this
 * calendar year is MORE than 18. Missing, null, NaN, a fraction, < 1900 or a future year → false.
 */
export function verifiedAdult(dobYear: number | null | undefined, now: Date = new Date()): boolean {
  if (typeof dobYear !== 'number' || !Number.isInteger(dobYear)) return false;
  const thisYear = now.getFullYear();
  if (dobYear < EARLIEST_BIRTH_YEAR || dobYear > thisYear) return false;
  return thisYear - dobYear > 18;
}
