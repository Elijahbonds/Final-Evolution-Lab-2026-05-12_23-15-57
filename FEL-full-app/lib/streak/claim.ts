// lib/streak/claim.ts — the day's streak step, CLAIMED (STREAK-CLAIM-RACE, #277 / #292).
//
// Moved here UNCHANGED from app/api/sessions/route.ts (DAILY-DRILL, 2026-10-24): a route file may export only its HTTP
// handlers, and the daily drill's claim (lib/daily-drill/claim.ts) must take the streak day by the SAME conditional write
// the play path does, not a copy of it. The rule and its tests (lib/sessions-route.test.ts, the 'profile:active' step)
// are the route's; this file only gives the function an importable home.
import type { StreakProfile, StreakStep } from '@/lib/session-payout';

/**
 * The one table call the claim makes, structurally: the sessions route hands in a transaction of the client under
 * public/_prisma and the daily drill one of lib/generated/prisma (PRISMA-PUBLIC is mid-move), and the two generated
 * TransactionClient types are not assignable to each other although the calls are the same.
 */
export interface StreakClaimTx {
  playerProfile: { updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }> };
}

/**
 * STREAK-CLAIM-RACE (merge review 2026-09-28; owner sign-off 2026-10-14): a play session's streak step, CLAIMED inside the
 * run's paying transaction and conditional on the profile this request read. The step was decided from a read taken
 * before the transaction and written back unconditionally, and the ledger's key is per run, so N runs finishing at once
 * each paid the day's streak Lab Credits (measured: due, two finishes paid 20 + 20; owed, three finishes after one
 * creation paid 35 LC each). Returns whether this run won the claim; a run that did not pays no streak share.
 *   due    conditional on the lastStreakAt it read: every writer that opens a streak day (a play here, a creation session
 *          in app/api/sessions/route.ts) moves lastStreakAt, so one claim per day wins. Not on lastActiveAt — a lesson writes that
 *          (lib/knowledge/server/learnRoutes.ts, app/api/education/complete/route.ts), and it must not cost a run the day.
 *          Writes streakDays, and lastStreakAt and lastActiveAt from one stamp.
 *   owed   conditional on both: the creation-opened day (lastActiveAt < lastStreakAt) is still unpaid. Writes only
 *          lastActiveAt, which closes the debt.
 *   lost   writes nothing — not even lastActiveAt: a run that lost to a creation opening the day would erase the
 *          creation's owed LC, which the next run pays.
 *   neither  no streakDays or lastStreakAt (writing back what it read was itself a lost update — it could undo another
 *          run's claim and open the day again), and lastActiveAt only moves forward: an older stamp written under a
 *          newer due claim's lastStreakAt would read as a creation-opened day and pay its LC again.
 */
export async function claimPlayStreak(tx: StreakClaimTx, userId: string, seen: StreakProfile | null | undefined, step: StreakStep, stamp: Date): Promise<boolean> {
  const lastStreakAt = seen?.lastStreakAt == null ? null : new Date(seen.lastStreakAt);
  const lastActiveAt = seen?.lastActiveAt == null ? null : new Date(seen.lastActiveAt);
  if (step.due || step.owed) {
    // both columns are NOT NULL (@default(now())): a read without them is no row state to claim against
    if (!lastStreakAt || (step.owed && !lastActiveAt)) return false;
    const r = step.due
      ? await tx.playerProfile.updateMany({ where: { userId, lastStreakAt }, data: { streakDays: step.streakDays, lastStreakAt: stamp, lastActiveAt: stamp } })
      : await tx.playerProfile.updateMany({ where: { userId, lastStreakAt, lastActiveAt: lastActiveAt as Date }, data: { lastActiveAt: stamp } });
    return r.count > 0;
  }
  await tx.playerProfile.updateMany({ where: { userId, lastActiveAt: { lt: stamp } }, data: { lastActiveAt: stamp } });
  return false;
}
