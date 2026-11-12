// lib/auth/accountStatus.ts — ACCOUNT-DELETE (owner decision 3, 2026-10-25): "sign out everywhere immediately" when an
// account is erased.
//
// HOW SESSIONS WORK HERE. NextAuth with `session.strategy: 'jwt'` (lib/auth.ts): the session is a signed cookie
// (`__session`), not a database row, so there is nothing to delete — the PrismaAdapter is configured but a JWT session
// never writes the Session table. Every getServerSession (and /api/auth/session) runs lib/auth.ts's `jwt` callback, so
// that callback is the one place every route's idea of "signed in" passes through. It ends an erased account's session
// by returning an empty token, and the `session` callback turns that into "no session" (getServerSession → null).
//
// WHAT "ERASED" IS. The erase leaves the `User` row as a placeholder whose email is `erased-<id>@erased.invalid`
// (lib/data-rights/tombstone.ts). That is the mark — no new column, no schema change. A token whose account row is gone
// altogether is ended the same way.
//
// COST. The `jwt` callback already read the User row every 5 minutes per token (the role refresh). The account check
// rides the same read (one query: role + email). To end a session within seconds rather than 5 minutes, this module
// remembers per server instance when each account was last seen alive, and asks again after ACCOUNT_STATUS_TTL_MS:
// at most one small primary-key read per account per instance per 30 s, and none at all for an account read in the
// last 30 s. An erased account is remembered for good (an erase is permanent), so its leftover tokens cost no read.
//
// IMMEDIATE, WHERE. The instance that ran the erase marks it at once (markAccountErased), and the delete response clears
// the browser's cookie. Another instance (the hosted function runs several) sees it at its next check: within
// ACCOUNT_STATUS_TTL_MS. FAIL OPEN on a database error, as the role refresh already does (lib/auth.ts: a blink must not
// sign everyone out) — the next request asks again.

/** How long an "alive" answer is trusted on one instance before the row is read again (new, flagged). */
export const ACCOUNT_STATUS_TTL_MS = 30_000;

/** Bound on the alive map, so a busy instance cannot grow it without limit. */
const MAX_ALIVE = 10_000;

const erased = new Set<string>();
const aliveUntil = new Map<string, number>();

/** This instance knows the account is erased (it ran the erase, or read the placeholder). */
export function isKnownErased(userId: string): boolean {
  return erased.has(userId);
}

/** Was the account seen alive recently enough that no read is needed? */
export function aliveIsFresh(userId: string, now: number = Date.now()): boolean {
  const until = aliveUntil.get(userId);
  return until !== undefined && until > now;
}

export function noteAlive(userId: string, now: number = Date.now()): void {
  if (aliveUntil.size >= MAX_ALIVE) {
    for (const [id, until] of aliveUntil) if (until <= now) aliveUntil.delete(id);
    if (aliveUntil.size >= MAX_ALIVE) aliveUntil.clear();
  }
  aliveUntil.set(userId, now + ACCOUNT_STATUS_TTL_MS);
}

/** End every session of this account on this instance, now. Called by the erase route after it commits. */
export function markAccountErased(userId: string): void {
  erased.add(userId);
  aliveUntil.delete(userId);
}

/** Tests only. */
export function resetAccountStatus(): void {
  erased.clear();
  aliveUntil.clear();
}
