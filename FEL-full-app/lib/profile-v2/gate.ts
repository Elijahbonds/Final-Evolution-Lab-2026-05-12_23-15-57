// PROFILE V2: the existing age and opt-in gates, as a Prisma `where`, so the profile reads everything in ONE batch.
//
// The rules are not new. They are lib/privacy/verifiedAdult (User.dobYear, a year gap of MORE than 18; unknown → not an
// adult) and lib/privacy/scanSaveGate canSaveScanNumbers (verified adult AND a live `jump_numbers` ScanSaveOptIn: scope
// jump_numbers, granted, not revoked). What is new is WHERE they run: inside the query, as a relation filter on the
// row's own user, so the database returns no row for an account the gate refuses. That keeps the page free of a
// read-the-age-then-read-the-rows waterfall without reading a minor's rows first and dropping them after.
//
// The JS rule still runs on the answer (profileGates below, from the same batch's user and opt-in rows): a row the
// database returned is used only if BOTH agree. gate.test.ts holds the year boundary to verifiedAdult for every year.

import { verifiedAdult } from '@/lib/privacy/verifiedAdult';

/** lib/age/ageRules.ts's floor: a year before this is a typo or a placeholder, not a verified age. */
const EARLIEST_BIRTH_YEAR = 1900;

/** The live opt-in, as lib/privacy/scanSaveOptIn.ts reads it. */
export const SCAN_SAVE_SCOPE = 'jump_numbers';

/**
 * A User `where` that matches exactly the verified adults (isVerifiedAdultStrict): an integer year from 1900 whose gap
 * to this calendar year is more than 18, i.e. dobYear <= thisYear - 19. A null year matches nothing.
 */
export function verifiedAdultUserWhere(now: Date = new Date()) {
  return { dobYear: { gte: EARLIEST_BIRTH_YEAR, lte: now.getFullYear() - 19 } };
}

/** A User `where` for canSaveScanNumbers: a verified adult with a live jump_numbers opt-in. */
export function scanSaveUserWhere(now: Date = new Date()) {
  return {
    ...verifiedAdultUserWhere(now),
    scanSaveOptIn: { is: { scope: SCAN_SAVE_SCOPE, granted: true, revokedAt: null } },
  };
}

export interface OptInRow { scope: string; granted: boolean; revokedAt: Date | string | null }

export interface ProfileGates {
  /** verifiedAdult(dobYear). */
  adult: boolean;
  /** canSaveScanNumbers: adult AND a live opt-in. */
  canSaveScan: boolean;
  /** Under 18 or unknown age: everything teen-safe applies. */
  minorOrUnknown: boolean;
}

/** The same two gates in JS, from the batch's own rows. */
export function profileGates(dobYear: number | null | undefined, optIn: OptInRow | null | undefined, now: Date = new Date()): ProfileGates {
  const adult = verifiedAdult(dobYear ?? null, now);
  const live = !!optIn && optIn.scope === SCAN_SAVE_SCOPE && optIn.granted === true && optIn.revokedAt == null;
  return { adult, canSaveScan: adult && live, minorOrUnknown: !adult };
}
