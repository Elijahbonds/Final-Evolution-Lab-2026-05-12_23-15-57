// THE MISSING SPINE: PRISMA ROWS → SharedProfile (2026-09-13).
//
// Every consumer in the coaching layer takes a `SharedProfile` — the gate, the dashboard, the triage board,
// the assignment, the card projection, the store preview — and until now nothing produced one from the
// database. They were all fed by tests. This is the one place that reads the real rows, so there is exactly
// one answer to "what does the platform think about this athlete" rather than one per surface.
//
// THE PART THAT NEEDED A DECISION: WHERE THE HISTORY COMES FROM.
//
// `snapshotFrom` turns measurements into ONE snapshot as of a moment. A trajectory needs several, and there
// is no table of historical snapshots — there are only timestamped measurements. So the history is
// RECONSTRUCTED: at each date on which something was measured, build the snapshot that was true then, from
// the readings that existed then.
//
// That is more honest than the alternatives and worth stating, because it is not obvious:
//
//   · Storing a snapshot row on every scan would drift from the measurements the moment the scoring changes,
//     and then two surfaces disagree about the same past.
//   · Interpolating a value for every week produces a smooth line that was never measured, which is exactly
//     the "we cannot tell" → "no change" conflation the whole layer exists to avoid.
//
// Reconstructing means every point on the trajectory is a day something was actually measured. A gap in the
// line is a gap in the measuring, which is true and useful.
//
// FRESHNESS IS NOT DECIDED HERE. Snapshots are built regardless of age and each carries its own `at`; the
// gate's `maxScanAgeDays` and the card's clock decide what an old reading is worth. A loader that silently
// dropped old readings would take that judgement away from the surfaces that are supposed to make it.

import 'server-only';
import type { PrismaClient } from '@/lib/generated/prisma';
import { snapshotFrom } from './scanToSnapshot';
import {
  emptyProfile, type SharedProfile, type ScanRecord, type PRQSnapshot, type AcademyProgress,
  type PerformanceEntry,
} from './sharedProfile';

type Db = PrismaClient;

/** How far back to read. Two years of measurements is a trajectory; ten is a filing cabinet. */
export const HISTORY_DAYS = 730;
/** Sessions read for the performance history — a coach reading form, not an archive. */
export const HISTORY_SESSIONS = 120;

/** Day-granularity key, so three measurements on one morning make one point rather than three. */
function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Rebuild the snapshot series from timestamped measurements.
 *
 * One snapshot per day that had a measurement, each built only from readings that existed on that day, so a
 * point on the line is never informed by the future. Oldest first.
 */
export function snapshotSeries(scans: readonly ScanRecord[]): PRQSnapshot[] {
  const days = [...new Set(scans.map((s) => dayKey(s.measuredAt)))].sort();
  const out: PRQSnapshot[] = [];
  for (const day of days) {
    // end of that day, so a reading taken at 18:00 counts toward its own day
    const asOf = Date.parse(`${day}T23:59:59.999Z`);
    const upTo = scans.filter((s) => Date.parse(s.measuredAt) <= asOf);
    // maxAgeDays is deliberately wide here: this is reconstructing what was true THEN, and the freshness
    // judgement belongs to the surfaces reading the result, not to the loader
    const snap = snapshotFrom(upTo, { now: asOf, maxAgeDays: HISTORY_DAYS });
    if (snap) out.push(snap);
  }
  return out;
}

/**
 * Load one athlete's canonical profile.
 *
 * Returns an empty profile rather than null for an athlete with no data: "this person exists and has not
 * been measured" is a real state every consumer already handles, and null would make each of them invent
 * their own answer for it.
 */
export async function loadSharedProfile(db: Db, userId: string, now: number = Date.now()): Promise<SharedProfile> {
  const since = new Date(now - HISTORY_DAYS * 86_400_000);

  const [user, entries, creds, games, card] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true } }),
    db.prqEntry.findMany({
      where: { userId, measuredAt: { gte: since } },
      orderBy: { measuredAt: 'asc' },
      select: { attribute: true, value: true, unit: true, source: true, measuredAt: true, sessionId: true },
    }),
    db.credential.findMany({
      where: { userId },
      select: { trackKey: true, moduleKey: true, curriculumVersion: true, passed: true, score: true, earnedAt: true },
    }),
    db.gameSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_SESSIONS,
      select: { mode: true, score: true, won: true, createdAt: true },
    }),
    db.creatorCard.findFirst({
      where: { ownerId: userId },
      select: { slug: true, displayName: true, mode: true, rarity: true, prq: true },
    }),
  ]);

  const profile = emptyProfile(userId, user?.name ?? '');

  const scans: ScanRecord[] = entries.map((e) => ({
    attribute: e.attribute,
    value: e.value,
    unit: e.unit ?? '',
    source: e.source ?? 'manual',
    measuredAt: e.measuredAt.toISOString(),
    ...(e.sessionId ? { sessionId: e.sessionId } : {}),
  }));

  profile.scans = scans.slice().reverse();                 // the type documents newest first
  profile.prq = snapshotSeries(scans);

  profile.academy = creds.map((c): AcademyProgress => ({
    trackKey: c.trackKey,
    moduleKey: c.moduleKey,
    completedAt: c.earnedAt.toISOString(),
    score: c.score,
    passed: c.passed,
    ...(c.curriculumVersion ? { curriculumVersion: c.curriculumVersion } : {}),
  }));

  profile.history = games.map((g): PerformanceEntry => ({
    modeId: g.mode,
    score: g.score,
    at: g.createdAt.toISOString(),
    outcome: g.won ? 'won' : 'lost',
  }));

  if (card) {
    profile.cards = [{
      slug: card.slug, displayName: card.displayName, mode: card.mode, rarity: card.rarity, prq: card.prq,
    }];
  }

  profile.assembledAt = new Date(now).toISOString();
  return profile;
}
