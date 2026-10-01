// The account-settings download: the caller's own Mirror assessments (WorkoutScan rows, via collectPrqExport),
// Mirror sessions, and profile, plus the health and movement bundle Profile already exports.
//
// The user id is the signed-in session's. This function has no other way to choose a person.
// profile is an allow-list: password, KYC, and every other User column are not copied.

import type { Prisma } from '@/public/_prisma/client';
import { collectPrqExport } from '@/lib/prq-data-rights';

type Db = Pick<
  Prisma.TransactionClient,
  | 'prqEntry' | 'gameSession' | 'workoutScan'
  | 'healthIntake' | 'painCheckIn' | 'healthConsent' | 'readinessCheckIn' | 'breathLog'
  | 'user' | 'playerProfile' | 'mirrorSession'
>;

/** Columns a person may download about their own account. password is not one of them. */
export const PROFILE_SELECT = { id: true, email: true, name: true, createdAt: true, dobYear: true } as const;

type ProfileRow = {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
  dobYear: number | null;
};

/** Copy only PROFILE_SELECT. A row that also carries a password does not put it in the result. */
export function publicProfile(row: ProfileRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.createdAt,
    dobYear: row.dobYear,
  };
}

/** JSON fields for "Download my data". `userId` is the signed-in user and the only filter. */
export async function collectAccountExport(db: Db, userId: string, now?: Date) {
  const [base, user, playerProfile, mirrorSessions] = await Promise.all([
    collectPrqExport(db, userId, now),
    db.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT }),
    db.playerProfile.findUnique({ where: { userId } }),
    db.mirrorSession.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
  ]);
  return {
    ...base,
    profile: publicProfile(user),
    playerProfile,
    mirrorSessions,
  };
}
