// Who a coach may write a program for (owner-approved 2026-10-06, the safety fix for coach email enumeration).
//
// POST /api/coach/programs looked up ANY account by email (or id) and answered 404 client_not_found when there was
// none, so a certified coach could learn which emails have an FEL account. Now a coach can only name an athlete on
// their LIVE roster (a CoachClient row for this coach, not ended — the athlete joined through an invite). One query
// answers it, and an email that is not on the roster gets the same 404 whether or not an account exists behind it.
// POST /api/coach/programs/duplicate had the same hole by id (it wrote a program for any user id, and an unknown id
// failed differently from a real one); it now copies onto roster athletes only and skips everyone else alike.
//
// Pure: the routes hand these to Prisma.

/** The one refusal for an athlete who is not on this coach's live roster — account or no account. */
export const NOT_ON_ROSTER = 'client_not_on_roster';

/** The CoachClient filter for "this coach's live roster, the athlete named by `lookup`" (an email, any case; or a user id). */
export function rosterLookupWhere(coachId: string, lookup: string) {
  const l = lookup.trim();
  return l.includes('@')
    ? { coachId, endedAt: null, client: { email: { equals: l, mode: 'insensitive' as const } } }
    : { coachId, endedAt: null, clientId: l };
}

/** The CoachClient filter for "which of these ids are on this coach's live roster". */
export function rosterIdsWhere(coachId: string, clientIds: readonly string[]) {
  return { coachId, endedAt: null, clientId: { in: [...clientIds] } };
}
