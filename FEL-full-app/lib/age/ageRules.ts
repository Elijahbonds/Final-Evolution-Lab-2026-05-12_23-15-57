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
