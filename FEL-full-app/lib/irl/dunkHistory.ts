// dunkHistory — the Mirror's dunk history, read ONE way for GET and POST /api/mirror/dunks (review D4, 2026-09-24).
//
// Both handlers read `orderBy createdAt asc, take 500`: the OLDEST 500 rows. Before movement play only the Mirror
// wrote 'dunk' rows; now every measured jump of a dunk session joins them (lib/move/formSummary scanKindFor, up to
// MAX_FORM_ATTEMPTS a session). Past 500 rows every new dunk fell outside the window, the Mirror's own included: the
// best, newBest and the trend froze, the streak read 0 once the window's last day went stale, and the Mirror spoke a
// stale best out loud. The two copies had drifted too (POST dropped difficulty / execution / style, GET kept them).
//
// So one read: NEWEST first, reversed into the oldest-first order readProgress reads, so the latest dunk is always in
// it. And a WIDE window rather than a recent slice, because readProgress also answers all-time questions (the best,
// previousBest, the landed rungs of the ladder) that must not regress when an old peak ages out of a short window.
//
// Pure apart from the one query: the database client is passed in, so it is tested against a fake one.

import type { Prisma } from '@/public/_prisma/client';
import type { DunkAttempt } from './dunkProgress';
import type { DunkFamily } from './dunkTracker';

/** The families the Mirror stores; anything else is stored, and read back, as 'ATTEMPT'. */
export const MIRROR_FAMILIES: ReadonlySet<DunkFamily> = new Set<DunkFamily>([
  'BETWEEN-THE-LEGS', 'WINDMILL', '360', 'TOMAHAWK', 'ONE-HAND JAM', 'TWO-HAND JAM', 'ATTEMPT',
]);

/**
 * Rows read per request. A dunk session writes a handful of measured jumps (DunkMode.ts: 2 rounds of 2 dunks, plus
 * the misses) and a broken client at most MAX_FORM_ATTEMPTS (40); the Mirror writes one per dunk. 3000 is hundreds of
 * real sessions, 75 even at the cap, and a row is selected as its numbers and a date, so it is still one cheap read.
 * Past it the OLDEST rows leave, never the newest.
 */
export const DUNK_HISTORY_ROWS = 3000;
/** GET hands back the newest this many attempts (the page reads `progress`; the list is the recent history). */
export const DUNK_ATTEMPTS_RETURNED = 500;

type Db = Pick<Prisma.TransactionClient, 'workoutScan'>;

/** One stored row as an attempt. A missing number reads as 0 here, and readProgress drops a 0 cm attempt. */
export function attemptFromRow(r: { metrics: unknown; createdAt: Date }): DunkAttempt {
  const m = (r.metrics ?? {}) as Partial<DunkAttempt>;
  return {
    at: r.createdAt.toISOString(),
    verticalCm: Number(m.verticalCm) || 0,
    flightTimeMs: Number(m.flightTimeMs) || 0,
    family: (MIRROR_FAMILIES.has(m.family as DunkFamily) ? m.family : 'ATTEMPT') as DunkFamily,
    ...(typeof m.difficulty === 'number' ? { difficulty: m.difficulty } : {}),
    ...(typeof m.execution === 'number' ? { execution: m.execution } : {}),
    ...(typeof m.style === 'number' ? { style: m.style } : {}),
    ...(typeof m.made === 'boolean' ? { made: m.made } : {}),
  };
}

/**
 * The user's dunk history, oldest first: the newest DUNK_HISTORY_ROWS rows. A failed read is an empty history, as both
 * handlers had it (the page opens on nothing rather than on an error).
 */
export async function loadDunkHistory(db: Db, userId: string): Promise<DunkAttempt[]> {
  const rows = await db.workoutScan.findMany({
    where: { userId, kind: 'dunk' },
    orderBy: { createdAt: 'desc' },
    select: { metrics: true, createdAt: true },
    take: DUNK_HISTORY_ROWS,
  }).catch(() => []);
  return rows.reverse().map(attemptFromRow);
}
