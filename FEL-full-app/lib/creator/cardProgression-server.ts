// THE PROGRESSION BLOCK ON A PUBLIC CARD (2026-09-13).
//
// Wires `projectCard` (build-order item 8) to the one surface that shows it. Until now the projection was
// built and tested but nothing rendered it, so the card still showed only the older PublicStats blocks and
// none of the progression items 1–7 produced.
//
// THE MINOR CHECK IS THE REASON THIS FILE EXISTS RATHER THAN A DIRECT CALL.
//
// `projectCard` takes `minor` and returns null for one — Courts, verbatim: "Accounts flagged under 18 have
// no public presence in this system at all." The canonical `CreatorRecord.minor` lives in the browser, which
// is no use to a server rendering a public page, so the server answer comes from `User.dobYear`.
//
// AN UNKNOWN AGE IS TREATED AS A MINOR, matching `needsGuardianConsent` ("unknown age: be safe"). That is a
// real product cost — an adult who never entered a birth year gets no progression block on their card — and
// it is the right way round: the failure it prevents is a child's training record on a public URL, and the
// failure it causes is a missing panel with a known fix.

import 'server-only';
import type { PrismaClient } from '@/public/_prisma/client';
import { loadSharedProfile } from '../profile/profileServer';
import { PLATFORM_PROTOCOLS } from '../profile/protocol';
import { CURRICULUM_VERSION } from '../curriculum/blueprint';
import { projectCard, type CardProgression } from './cardProgression';

type Db = PrismaClient;

/** Adults only, and unknown counts as not-adult. */
export function isAdult(dobYear: number | null | undefined, now: Date = new Date()): boolean {
  if (!dobYear) return false;
  return now.getFullYear() - dobYear >= 18;
}

/**
 * Build the progression block for a public card.
 *
 * Returns null when there is nothing publishable — a minor, or an athlete with no measured, earned or played
 * history at all. The page renders no panel rather than an empty one: a card with an "Achievements (0)"
 * heading is worse than a card without the heading.
 */
export async function progressionFor(db: Db, ownerId: string, now: number = Date.now()): Promise<CardProgression | null> {
  const user = await db.user.findUnique({ where: { id: ownerId }, select: { dobYear: true } });
  const minor = !isAdult(user?.dobYear, new Date(now));
  if (minor) return null;

  const profile = await loadSharedProfile(db, ownerId, now);
  const card = projectCard(profile, {
    minor,
    catalogue: PLATFORM_PROTOCOLS,
    curriculumVersion: CURRICULUM_VERSION,
    now,
  });

  // nothing to stand behind and nothing earned: no panel at all
  if (!card || (!card.standing && !card.credentials.length && !card.unlocks.length)) return null;
  return card;
}
