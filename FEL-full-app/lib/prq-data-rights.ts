// prq-data-rights — what Profile's YOUR DATA RIGHTS panel hands over and erases (review D5, 2026-09-24).
//
// The privacy policy (lib/policies.ts) says numbers worked out from the camera "may be saved to your history", and
// that export or deletion goes through Profile settings. Profile's panel called /api/prq/export (PrqEntry +
// GameSession) and /api/prq/delete (PrqEntry), and neither touched WorkoutScan: the movement history was neither
// handed over nor erased. That history is the movement screen, the Mirror's dunks and screens, and since movement
// play every session's form reads ('jump' / 'dunk' / 'shot_form' / 'strike_form' / 'board_form', lib/move/formWrite).
// Both routes now cover EVERY WorkoutScan row the user has, whatever its kind, so a kind added later is covered too.
//
// A bought workout plan is NOT erased with it. WorkoutPlan.scanId is onDelete SetNull (schema.prisma), so a plan
// outlives the scan it was built from, and a purchase is not "measurement data". The /workout page's own DELETE
// (/api/v1/workout/scan) is the one that also clears plans; Profile does not send anyone there.
//
// Kept out of the route files so it can be tested against a fake client (vitest does not collect app/).

import type { Prisma } from '@/public/_prisma/client';

type Db = Pick<Prisma.TransactionClient, 'prqEntry' | 'gameSession' | 'workoutScan'>;

/** What a movement-history row carries in an export: its kind, its numbers, and the avatar proportions made from it. */
export const MOVEMENT_HISTORY_SELECT = { id: true, kind: true, metrics: true, avatarSpec: true, createdAt: true } as const;

/** The JSON a Profile export downloads. */
export async function collectPrqExport(db: Db, userId: string, now: Date = new Date()) {
  const [entries, sessions, history] = await Promise.all([
    db.prqEntry.findMany({
      where: { userId },
      orderBy: { measuredAt: 'desc' },
    }),
    db.gameSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        mode: true,
        score: true,
        duration: true,
        hits: true,
        misses: true,
        createdAt: true,
      },
    }),
    // every kind: the export is "what you hold about me", not "what the PRQ page shows"
    db.workoutScan.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: MOVEMENT_HISTORY_SELECT,
    }),
  ]);

  return {
    exportedAt: now.toISOString(),
    userId,
    prqEntries: entries,
    gameSessions: sessions,
    movementHistory: history,
  };
}

export interface ErasedCounts {
  /** PrqEntry rows deleted. */
  prqEntries: number;
  /** WorkoutScan rows deleted: every movement-history row, of every kind. */
  movementHistory: number;
}

/**
 * Erase the user's PRQ entries and movement history. Pass a transaction client, so the two go together or not at all.
 * Idempotent: a second call deletes nothing and says so.
 */
export async function erasePrqData(db: Pick<Db, 'prqEntry' | 'workoutScan'>, userId: string): Promise<ErasedCounts> {
  const prq = await db.prqEntry.deleteMany({ where: { userId } });
  const history = await db.workoutScan.deleteMany({ where: { userId } });
  return { prqEntries: prq.count, movementHistory: history.count };
}

/** The ledger line for an erasure (the wallet is untouched; the event is recorded). */
export function erasureReason(c: ErasedCounts): string {
  return `PRQ data erasure: ${c.prqEntries} entries and ${c.movementHistory} movement history rows deleted`;
}
