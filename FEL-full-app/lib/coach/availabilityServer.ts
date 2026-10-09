// lib/coach/availabilityServer.ts — COACH-AI Phase 8 (2026-10-07): CoachAvailability, read and written with raw SQL.
//
// THE TABLE IS NOT ON PRODUCTION YET: it arrives with prisma/pending/2026-10-07-coach-ai-2-coach-availability.sql,
// which the owner applies. Until then (and in CI) every read answers `available: false` and the route's write answers
// 503 availability_unavailable — never a 500 (lib/coach/pendingSchema.ts has the why and the probe).
//
// A NEW TABLE, NOT COLUMNS ON CoachClient. CoachClient is read on many coach pages through the generated client; once
// the owner regenerates it, a column missing in production would 500 every one of those reads (the reason AB-04 kept
// SessionBooking unchanged). A separate table touches no existing read.
//
// The rules (who sees it, how long it is kept, no free text) are in ./availability.ts.
import { logPendingFailure, pendingProbe, type RawDb } from './pendingSchema';
import { availabilityExpired, effectiveAvailability, mostCareful, type Availability, type AvailabilityRow, type AvailabilityView } from './availability';

export type { RawDb };

const probe = pendingProbe('coach_availability', `SELECT 1 AS "ok" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'CoachAvailability' LIMIT 1`);

/** Tests only. */
export function resetAvailabilityProbe(): void {
  probe.reset();
}

export function availabilityReady(db: RawDb, now: number = Date.now()): Promise<boolean> {
  return probe.ready(db, now);
}

// Only rows whose coaching relationship is live: an ended CoachClient hides the status from both sides.
const FOR_COACH_SQL =
  `SELECT a."clientId" AS "clientId", a."status" AS "status", a."returnBy" AS "returnBy" FROM "CoachAvailability" a ` +
  `JOIN "CoachClient" c ON c."coachId" = a."coachId" AND c."clientId" = a."clientId" WHERE a."coachId" = $1 AND c."endedAt" IS NULL`;
const FOR_ATHLETE_SQL =
  `SELECT a."status" AS "status", a."returnBy" AS "returnBy" FROM "CoachAvailability" a ` +
  `JOIN "CoachClient" c ON c."coachId" = a."coachId" AND c."clientId" = a."clientId" WHERE a."clientId" = $1 AND c."endedAt" IS NULL`;
const PURGE_EXPIRED_SQL = `DELETE FROM "CoachAvailability" WHERE "coachId" = $1 AND "returnBy" IS NOT NULL AND "returnBy" < $2`;
const UPSERT_SQL =
  `INSERT INTO "CoachAvailability" ("coachId", "clientId", "status", "returnBy", "setAt") VALUES ($1, $2, $3, $4, (NOW() AT TIME ZONE 'UTC')) ` +
  `ON CONFLICT ("coachId", "clientId") DO UPDATE SET "status" = EXCLUDED."status", "returnBy" = EXCLUDED."returnBy", "setAt" = EXCLUDED."setAt"`;
const CLEAR_SQL = `DELETE FROM "CoachAvailability" WHERE "coachId" = $1 AND "clientId" = $2`;

export type CoachAvailabilityMap = { available: false } | { available: true; byClient: Record<string, AvailabilityView> };

/**
 * Every live status this coach has set, as it reads today (Full is left out: it is the default). Expired rows are
 * deleted here, so a status is kept no longer than its return day (+ the coach's next look).
 */
export async function availabilityForCoach(db: RawDb, coachId: string, today: string, now: number = Date.now()): Promise<CoachAvailabilityMap> {
  if (!(await probe.ready(db, now))) return { available: false };
  try {
    const rows = await db.$queryRawUnsafe<(AvailabilityRow & { clientId: string })[]>(FOR_COACH_SQL, coachId);
    const byClient: Record<string, AvailabilityView> = {};
    let expired = false;
    for (const r of rows) {
      if (availabilityExpired(r, today)) { expired = true; continue; }
      byClient[r.clientId] = effectiveAvailability(r, today);
    }
    if (expired) await db.$executeRawUnsafe(PURGE_EXPIRED_SQL, coachId, today).catch((e: unknown) => logPendingFailure('coach_availability_purge_failed', e));
    return { available: true, byClient };
  } catch (e) {
    probe.fail('coach_availability_read_failed', e, now);
    return { available: false };
  }
}

/** What the athlete sees about themselves: the most careful live status any of their coaches set, or Full. */
export async function availabilityForAthlete(db: RawDb, clientId: string, today: string, now: number = Date.now()): Promise<{ available: false } | ({ available: true } & AvailabilityView)> {
  if (!(await probe.ready(db, now))) return { available: false };
  try {
    const rows = await db.$queryRawUnsafe<AvailabilityRow[]>(FOR_ATHLETE_SQL, clientId);
    return { available: true, ...mostCareful(rows.map((r) => effectiveAvailability(r, today))) };
  } catch (e) {
    probe.fail('coach_availability_read_failed', e, now);
    return { available: false };
  }
}

/**
 * Set one athlete's status for this coach. Full deletes the row (nothing is kept for a fully available athlete). The
 * caller has checked the live CoachClient link and validated the input (./availability.ts parseAvailabilityInput).
 * Resolves false when the table is not there or the write failed.
 */
export async function setAvailability(db: RawDb, coachId: string, clientId: string, status: Availability, returnBy: string | null, now: number = Date.now()): Promise<boolean> {
  if (!(await probe.ready(db, now))) return false;
  try {
    if (status === 'full') await db.$executeRawUnsafe(CLEAR_SQL, coachId, clientId);
    else await db.$executeRawUnsafe(UPSERT_SQL, coachId, clientId, status, returnBy);
    return true;
  } catch (e) {
    probe.fail('coach_availability_write_failed', e, now);
    return false;
  }
}
