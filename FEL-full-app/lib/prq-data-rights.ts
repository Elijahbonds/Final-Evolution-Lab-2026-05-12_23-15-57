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
// MIRROR-COACH P5 (2026-09-29): HEALTH DATA RIDES ALONG, on the same "everything you told FEL" promise. Privacy §5
// says a full export covers the health intake, pain check-ins and the consent records, and an erase covers the
// intake and pain check-ins — not just the PRQ/movement history this file already carried. A DIFFERENT lane owns the
// actual intake flow and the pain rule (lib/health/intake.ts, lib/health/painRule.ts); this file only reads and
// deletes by userId, the same way it already treats WorkoutScan as "every kind, no interpretation".
//
// TWO ERASE PATHS, ON PURPOSE. `eraseHealthData` is the narrow one: Health data in account settings offers it next
// to "withdraw", and it touches only the health-data tables — Privacy §5 promises that action "never touches a
// workout plan or your PRQ history", so it cannot also be the function behind the existing account-wide "DELETE PRQ
// + MOVEMENT HISTORY" button. `erasePrqData` is the wide one, and now calls the narrow one internally: erasing
// EVERYTHING FEL holds about your training has always meant everything, so health data rides along there too.
//
// MIRROR-COACH-ERASE (2026-09-30, owner 07:53 PT, "No wait and fix"): both erases KEEP every HealthConsent row.
// A live grant stays live. A row with revokedAt set stays, revokedAt and all. That ledger is the proof of what was
// agreed and when it was withdrawn. Erase does not create, re-date, or un-revoke a consent row, and it does not
// restart the Dial-Up Breath's 7-day clock (lib/breath/rampGate.ts consentOldEnough still reads the oldest
// health_data grant).
//
// MIRROR-COACH P6 (2026-09-29): THE DAILY READINESS CHECK-IN RIDES ALONG TOO (schema.prisma ReadinessCheckIn, lib/health
// /readiness.ts). Sleep, soreness, energy and mood are health-adjacent data collected under the same 'health_data'
// consent, so they sit on the same promise: the export hands every row over, and BOTH erases delete them — the narrow
// health-only one (a person erasing "my health data" means the check-ins as much as the pain log) and, through it, the
// account-wide one.
//
// MIRROR-COACH P7 (2026-09-29): THE BREATH LOG RIDES ALONG (schema.prisma BreathLog, lib/breath/rampGate.ts). A row says
// only that a breath from FEL's toolbox was used, for which coached session, and when — no health answer. But its one
// kind today, the adults-only Dial-Up Breath, is written only behind the health gates (consent, a clean intake, today's
// pain and check-in), so a row is a trace of those answers: the export hands every row over, and BOTH erases delete
// them, the narrow health one included.
// MIRROR-COACH P7 FIX (2026-09-29, review): this paragraph used to end "erasing them also resets FEL's weekly count,
// which is harmless — nothing can be dialled up again until the athlete opts back in". Opting back in is one intake POST
// (lib/health/intake.ts submitIntake grants consent), so erase → re-take → dial up was a third use in three days: the
// limit was only as strong as the athlete's willingness to press erase. The gate still needs the OLDEST health-data
// grant FEL holds to be a full limit window old (lib/breath/rampGate.ts RAMP_LIMIT.firstUseAfterDays, consentOldEnough).
// MIRROR-COACH-ERASE (owner 07:53 PT): that clock is NOT restarted by deleting the ledger. The rows stay, so a grant
// already a full window old stays old enough after an erase. BreathLog rows are still deleted, so the rolling use
// count can clear; the owner accepted that. A first opt-in, whose oldest grant is new, still waits the week.
//
// Kept out of the route files so it can be tested against a fake client (vitest does not collect app/).

import type { Prisma } from '@/public/_prisma/client';

type Db = Pick<Prisma.TransactionClient, 'prqEntry' | 'gameSession' | 'workoutScan' | 'healthIntake' | 'painCheckIn' | 'healthConsent' | 'readinessCheckIn' | 'breathLog'>;

/** What a movement-history row carries in an export: its kind, its numbers, and the avatar proportions made from it. */
export const MOVEMENT_HISTORY_SELECT = { id: true, kind: true, metrics: true, avatarSpec: true, createdAt: true } as const;

/** The JSON a Profile export downloads. */
export async function collectPrqExport(db: Db, userId: string, now: Date = new Date()) {
  const [entries, sessions, history, healthIntakes, painCheckIns, healthConsents, readinessCheckIns, breathLogs] = await Promise.all([
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
    // MIRROR-COACH P5: the health intake, in full — it is the person's own answers about their own body, never
    // shown to anyone but them (and a coach with a live coach_view grant) and this export is that same "only you"
    // promise extended to "and you can always take it with you".
    db.healthIntake.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    // every pain check-in, whatever exercise or decision it produced — never scored, never withheld from its owner.
    db.painCheckIn.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    // the consent ledger itself: what was granted, to which coach, and when anything was revoked.
    db.healthConsent.findMany({ where: { userId }, orderBy: { grantedAt: 'desc' } }),
    // MIRROR-COACH P6: every daily readiness check-in, whole — the four answers and the day they were for.
    db.readinessCheckIn.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
    // MIRROR-COACH P7: every breath-toolbox use, whole — its kind, the coached session it was for, when.
    db.breathLog.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
  ]);

  return {
    exportedAt: now.toISOString(),
    userId,
    prqEntries: entries,
    gameSessions: sessions,
    movementHistory: history,
    healthIntakes,
    painCheckIns,
    healthConsents,
    readinessCheckIns,
    breathLogs,
  };
}

export interface HealthErasedCounts {
  /** HealthIntake rows deleted. */
  healthIntakes: number;
  /** PainCheckIn rows deleted. */
  painCheckIns: number;
  /** Always 0. HealthConsent rows are kept (live grants and revoked rows); erase does not delete them. */
  healthConsents: number;
  /** ReadinessCheckIn rows deleted (MIRROR-COACH P6): every daily check-in. */
  readinessCheckIns: number;
  /** BreathLog rows deleted (MIRROR-COACH P7): every breath-toolbox use. */
  breathLogs: number;
}

export interface ErasedCounts extends HealthErasedCounts {
  /** PrqEntry rows deleted. */
  prqEntries: number;
  /** WorkoutScan rows deleted: every movement-history row, of every kind. */
  movementHistory: number;
}

/**
 * Erase ONLY the health data: the intake, every pain check-in, every daily readiness check-in (MIRROR-COACH P6) and
 * every breath-toolbox use (MIRROR-COACH P7). HealthConsent is not touched — live grants and revoked rows stay, as
 * proof of agreement and withdrawal (MIRROR-COACH-ERASE). `healthConsents` in the result is always 0. This is the
 * narrow action Health data in account settings offers next to "withdraw". Idempotent.
 */
export async function eraseHealthData(
  db: Pick<Db, 'healthIntake' | 'painCheckIn' | 'readinessCheckIn' | 'breathLog'>,
  userId: string,
): Promise<HealthErasedCounts> {
  const healthIntakes = await db.healthIntake.deleteMany({ where: { userId } });
  const painCheckIns = await db.painCheckIn.deleteMany({ where: { userId } });
  const readinessCheckIns = await db.readinessCheckIn.deleteMany({ where: { userId } });
  const breathLogs = await db.breathLog.deleteMany({ where: { userId } });
  return {
    healthIntakes: healthIntakes.count, painCheckIns: painCheckIns.count, healthConsents: 0,
    readinessCheckIns: readinessCheckIns.count, breathLogs: breathLogs.count,
  };
}

/**
 * Erase the user's PRQ entries, movement history and health data (intake, pain check-ins, readiness check-ins,
 * breath-toolbox uses). HealthConsent rows are kept. Pass a transaction client, so all of it goes together or not at all. Idempotent: a second call
 * deletes nothing and says so.
 */
export async function erasePrqData(
  db: Pick<Db, 'prqEntry' | 'workoutScan' | 'healthIntake' | 'painCheckIn' | 'readinessCheckIn' | 'breathLog'>,
  userId: string,
): Promise<ErasedCounts> {
  const prq = await db.prqEntry.deleteMany({ where: { userId } });
  const history = await db.workoutScan.deleteMany({ where: { userId } });
  const health = await eraseHealthData(db, userId);
  return { prqEntries: prq.count, movementHistory: history.count, ...health };
}

/** The ledger line for an erasure (the wallet is untouched; the event is recorded). */
export function erasureReason(c: ErasedCounts): string {
  const health = c.healthIntakes + c.painCheckIns + c.healthConsents + c.readinessCheckIns + c.breathLogs;
  return `PRQ data erasure: ${c.prqEntries} entries, ${c.movementHistory} movement history rows and `
    + `${health} health record${health === 1 ? '' : 's'} deleted`;
}
