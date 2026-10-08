// PERSONAL BESTS ON THE ACCOUNT (owner decision, 2026-10-06): "Personal bests on the account for verified adults (teens
// stay per device): derive bests from existing session records (max score per mode for the user) through a small read
// API, merged with the device record; no schema change."
//
// The read behind GET /api/bests. A best is the highest score on the user's GameSession rows in a mode — rows
// app/api/sessions writes only for a run it PAID, so a NO PLAY, an unpaid run or a refused score is never a best.
//
// WHO: a VERIFIED ADULT only — lib/privacy/verifiedAdult (User.dobYear read from the database, a gap of more than 18
// years; an unknown age is not an adult). Anyone else is answered `{ scope: 'device' }` without a single session row
// being read: a teen's bests stay on the device that set them, as they were.
//
// THE QUERY: `aggregate { _max: score, _count } where { userId, mode [, id ≠ exclude] }`. GameSession has
// @@index([userId, createdAt]), which narrows it to the user's own rows; nothing indexes (userId, mode, score), so the
// user's rows in that mode are scanned. A player's whole history is small, so that is fine today — an index would be an
// owner decision (Prisma), and is not needed for this.

import { verifiedAdult } from '@/lib/privacy/verifiedAdult';

export type AccountBestAnswer =
  | { scope: 'device' }
  | { scope: 'account'; mode: string; best: number | null; runs: number };

/** Structural (the app's client and a test's fake both fit). */
export interface BestsDb {
  user: { findUnique(a: { where: { id: string }; select: { dobYear: true } }): Promise<{ dobYear: number | null } | null> };
  gameSession: {
    aggregate(a: {
      where: { userId: string; mode: string; NOT?: { id: string } };
      _max: { score: true };
      _count: { _all: true };
    }): Promise<{ _max: { score: number | null }; _count: { _all: number } }>;
  };
}

/** A mode key as the shell posts it: short, plain characters. Anything else is not asked about. */
export function cleanMode(raw: unknown): string | null {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : null;
}

/** A session id to leave out (the run the card is showing, so its own score is not the "best before" it). */
export function cleanSessionId(raw: unknown): string | null {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : null;
}

/**
 * The user's best in a mode, or `{ scope: 'device' }` when the account is not a verified adult (or its age can't be
 * read). `exclude` leaves one session out. Never throws on the age read; the aggregate's own failure is the caller's.
 */
export async function readAccountBest(db: BestsDb, userId: string, mode: string, exclude: string | null, now: Date = new Date()): Promise<AccountBestAnswer> {
  let dobYear: number | null = null;
  try {
    const row = await db.user.findUnique({ where: { id: userId }, select: { dobYear: true } });
    dobYear = typeof row?.dobYear === 'number' ? row.dobYear : null;
  } catch {
    dobYear = null;
  }
  if (!verifiedAdult(dobYear, now)) return { scope: 'device' };
  const agg = await db.gameSession.aggregate({
    where: { userId, mode, ...(exclude ? { NOT: { id: exclude } } : {}) },
    _max: { score: true },
    _count: { _all: true },
  });
  const best = agg?._max?.score;
  const runs = Number(agg?._count?._all ?? 0);
  return { scope: 'account', mode, best: typeof best === 'number' && Number.isFinite(best) ? best : null, runs: Number.isFinite(runs) ? runs : 0 };
}
