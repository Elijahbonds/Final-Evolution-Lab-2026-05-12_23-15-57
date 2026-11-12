// CHALLENGES-2: the name a challenge link shows to whoever opens it. Strangers open these links.
//
// THE RULE, from the progress card's share rules (lib/progress-card, PR #432) and profile v2's visibility
// (lib/profile-v2/visibility.ts, "teens private"):
//   · Under 18, or an unknown age (the verifiedAdult rule: User.dobYear from the database, a year gap of more than 18):
//     no name, ever. The link reads "A friend".
//   · A verified adult: no name unless they tick "Put my name on it" at the share (showName). Off by default.
//   · A guest has no account and no known age: no name.
//   · No face, ever: a challenge carries no photo or avatar.
// The client's own `athleteTag` is never stamped into a link (it could carry a teen's name); the server decides here.

import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import { ANON_TAG } from './challenge-terms';

export interface IdentityDb {
  user: { findUnique(a: { where: { id: string }; select: { name: true; dobYear: true } }): Promise<{ name: string | null; dobYear: number | null } | null> };
}

/** The tag to sign into a link this user mints: their first name only when they are a verified adult AND chose it. */
export async function challengeTagFor(db: IdentityDb, userId: string | null | undefined, showName: boolean, now: Date = new Date()): Promise<string> {
  if (!userId || !showName) return ANON_TAG;
  let row: { name: string | null; dobYear: number | null } | null = null;
  try {
    row = await db.user.findUnique({ where: { id: userId }, select: { name: true, dobYear: true } });
  } catch {
    return ANON_TAG;
  }
  if (!row || !verifiedAdult(row.dobYear ?? null, now)) return ANON_TAG;
  return firstName(row.name) ?? ANON_TAG;
}

/** The first word of a display name, letters/digits/'-'/'.' only, at most 16 characters (the payload's tag cap). */
export function firstName(name: string | null | undefined): string | null {
  const word = (name ?? '').trim().split(/\s+/)[0] ?? '';
  const clean = word.replace(/[^\p{L}\p{N}.'-]/gu, '').slice(0, 16);
  if (!clean || clean.toUpperCase() === ANON_TAG) return null;
  return clean;
}
