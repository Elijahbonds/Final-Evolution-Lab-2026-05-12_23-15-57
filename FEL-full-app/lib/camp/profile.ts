// The composed "Shared Profile" read-model (gap report §2 / G6): PRQ,
// movement signature, credentials, performance history and resiliency, read
// from the four sources that already exist. No new tables; pure helpers for
// the deltas so the session record and the profile agree.
import { prisma } from '@/lib/db';
import { recoveryAsOf } from '@/lib/prq-recovery';
import { countsInVector } from '@/lib/prq-entries';
import { analyzeMovement } from '@/lib/workout/movement-screen';
import { computeResiliency, type SessionOutcome } from './resiliency';
import { certificationStatusFor } from './certification';

export const PRQ_ATTRS = ['strength', 'speed', 'endurance', 'agility', 'power', 'flexibility', 'recovery', 'mental'] as const;

// the pure helpers live in ./deltas so they can be unit-tested without Prisma
export { latestPerAttribute, prqDelta, numericDelta, toOutcomes, vouchedPrq } from './deltas';
import { latestPerAttribute, prqDelta, numericDelta, toOutcomes, vouchedPrq } from './deltas';

function safeAnalyze(metrics: unknown): unknown {
  try { return analyzeMovement(metrics as never); } catch { return null; }
}

/**
 * The most games composeProfile reads. `history.sessions` is a count of THESE rows, so it stops at this number: a
 * reader that shows it as a total says "60+" at the cap (the coach's roster does, MIRROR-COACH P2, 2026-09-25).
 */
export const HISTORY_GAMES_TAKE = 60;

export async function composeProfile(userId: string, since: Date | null = null) {
  const [profile, entries, scans, games, creds, fac] = await Promise.all([
    prisma.playerProfile.findUnique({ where: { userId } }),
    prisma.prqEntry.findMany({ where: { userId }, orderBy: { measuredAt: 'asc' } }),
    prisma.workoutScan.findMany({ where: { userId, kind: 'movement_screen' }, orderBy: { createdAt: 'desc' }, take: 2 }),
    prisma.gameSession.findMany({ where: { userId, ...(since ? { createdAt: { gte: since } } : {}) }, orderBy: { createdAt: 'desc' }, take: HISTORY_GAMES_TAKE }),
    prisma.credential.findMany({ where: { userId } }),
    prisma.facilitatorProfile.findUnique({ where: { userId } }),
  ]);
  // MIRROR-COACH P9 fix (2026-09-30): a game's copy of recovery (a 'drillResult' recovery row — trivia's, from before
  // P9) is not a measurement of it any more; the same read the traceable PRQ makes (lib/prq-entries.ts countsInVector)
  const measuredRows = entries.filter(countsInVector);
  const prqNow = latestPerAttribute(measuredRows, null);
  const vouched = vouchedPrq(measuredRows);
  const prqThen = since ? latestPerAttribute(measuredRows, since) : {};
  const latestScan = scans[0] ? safeAnalyze(scans[0].metrics) : null;
  const prevScan = scans[1] ? safeAnalyze(scans[1].metrics) : null;
  return {
    prq: {
      // MIRROR-COACH P9 fix (2026-09-30): recovery as of now — its half-life runs only inside a settle, and this read
      // is direct, so a coach saw an idle client's old recovery indefinitely (lib/prq-recovery.ts recoveryAsOf, pure)
      card: profile ? Object.fromEntries(PRQ_ATTRS.map((k) => [k, (recoveryAsOf(profile) as unknown as Record<string, number>)[k]])) : null,
      measured: prqNow,
      // what a verified shield may stand on: `measured` without the camera estimates, and the newest of those
      vouched: vouched.values,
      vouchedAt: vouched.newestAt,
      delta: since ? prqDelta(prqThen, prqNow) : null,
      entries: entries.length,
    },
    movement: { latest: latestScan, latestAt: scans[0]?.createdAt ?? null, delta: latestScan && prevScan ? numericDelta(prevScan, latestScan) : null },
    credentials: certificationStatusFor(creds, fac?.revokedAt ?? null),
    history: {
      sessions: games.length,
      wins: games.filter((g) => g.won).length,
      byMode: games.reduce<Record<string, number>>((acc, g) => { acc[g.mode] = (acc[g.mode] ?? 0) + 1; return acc; }, {}),
      recent: games.slice(0, 10).map((g) => ({ id: g.id, mode: g.mode, score: g.score, won: g.won, at: g.createdAt })),
    },
    resiliency: computeResiliency(toOutcomes(games)),
  };
}
