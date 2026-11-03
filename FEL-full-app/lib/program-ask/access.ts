// lib/program-ask/access.ts — PROGRAM-ASK (2026-11-02): free or FEL Pro — NOT DECIDED HERE. An owner call.
//
// The brief: "Don't decide. Build it behind a flag defaulting to whatever signature programs do for the free week." The
// signature programs give week 1 free and every later week with an active FEL Pro (lib/signature/access.ts FREE_WEEKS,
// weekAccess), so the default here is exactly that, through the same function. The other setting opens every week to
// everyone. Nothing here charges, prices or links to a checkout; the locked week shows the signature programs' own
// owner-approved line (lib/signature/copy.ts FREE_WEEK_LINE).
//
// Pure. Client-safe.
import { FREE_WEEKS, weekAccess, type WeekAccess } from '@/lib/signature/access';

export type ProgramAskAccess = 'like-signature' | 'all-free';

/** OWNER CALL (flagged in the lane report): the default follows the signature programs' free week. */
export const PROGRAM_ASK_ACCESS: ProgramAskAccess = 'like-signature';

export { FREE_WEEKS };

export function programWeekAccess(week: number, hasPro: boolean, mode: ProgramAskAccess = PROGRAM_ASK_ACCESS): WeekAccess {
  return mode === 'all-free' ? 'free' : weekAccess(week, { hasPro });
}
