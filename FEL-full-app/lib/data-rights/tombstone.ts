// lib/data-rights/tombstone.ts — ACCOUNT-DELETE (2026-10-25): how an erased account's `User` row is recognised.
//
// The account erase (./rights.ts TOMBSTONE) keeps the `User` row as an anonymous placeholder (owner decision 1 of
// docs/DATA-RIGHTS.md §3) and sets its email to `erased-<id>@erased.invalid`. That email is the one durable mark the
// row carries, so the sign-in check (lib/auth.ts) and the session check (lib/auth/accountStatus.ts) read it here, from
// the same constant the erase writes. Pure and import-free: lib/auth.ts loads it on every request.
//
// The match is EXACT, on the row's own id: a person who signs up as `anything@erased.invalid` is an ordinary account,
// and nobody can sign up as `erased-<their id>@erased.invalid` because the id does not exist until the row does.

export const TOMBSTONE_EMAIL_DOMAIN = 'erased.invalid';

/** The email an erased account's row carries. Must equal the SQL expression in ./rights.ts TOMBSTONE.email. */
export function tombstoneEmail(userId: string): string {
  return `erased-${userId}@${TOMBSTONE_EMAIL_DOMAIN}`;
}

/** Is this the placeholder row of an erased account? */
export function isTombstoneEmail(userId: string, email: string | null | undefined): boolean {
  return typeof email === 'string' && email.toLowerCase() === tombstoneEmail(userId).toLowerCase();
}
