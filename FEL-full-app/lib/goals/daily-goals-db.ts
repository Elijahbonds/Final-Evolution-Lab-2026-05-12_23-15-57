// DAILY GOALS, from the day's GameSession rows (owner decision 2026-10-06; the rules are in ./daily-goals.ts).
//
// ONE read: the user's rows since 00:00 UTC, oldest first — `where { userId, createdAt >= dayStart }`, which the
// existing @@index([userId, createdAt]) on GameSession serves. No schema change, nothing written.
//
// FLOOR-ONLY runs do not count (Prove It: modeScoreRules payFloorOnly). They are paid the played floor and add no season
// XP (app/api/sessions: `season = floorOnly ? null : …`), so a goal they completed would be a goal whose season XP was
// never paid — and could never be paid later either, since it would already be done.

import { utcDayStart } from '@/lib/economy-caps';
import { canonicalModeKey } from '@/lib/game-data';
import { MODE_SCORE_RULES } from '@/lib/sessions/modeScoreRules';
import { completedBy, goalStates, utcDayKey, type GoalRun, type GoalState } from './daily-goals';

/** Structural, so the app's client and a session run's transaction both fit (and a test's fake). */
export interface GoalsDb {
  gameSession: {
    findMany(args: {
      where: { userId: string; createdAt: { gte: Date } };
      select: { id: true; mode: true; won: true };
      orderBy: { createdAt: 'asc' };
      take: number;
    }): Promise<Array<{ id: string; mode: string; won: boolean }>>;
  };
}

/** A day's rows past this many are not read (no honest day comes near it: the run rate limit and the daily caps). */
export const GOAL_ROWS_MAX = 500;

export function floorOnlyMode(mode: string): boolean {
  const rule = MODE_SCORE_RULES[canonicalModeKey(mode)];
  return Boolean(rule && rule.payFloorOnly === true);
}

export interface DailyGoals {
  day: string;
  /** When these goals end (the next 00:00 UTC), ISO. */
  resetsAt: string;
  goals: GoalState[];
  /** The goals the run named by `thisRunSessionId` completed (empty without one). */
  completedNow: string[];
}

/**
 * Today's goals for a user, and which of them the session `thisRunSessionId` (already written, in `db`'s view) just
 * completed. Throws what the read throws: inside a session run's transaction a failed read must fail the run, as
 * isFirstOfDayMode's does, rather than pay a season XP figure that was never checked.
 */
export async function dailyGoals(db: GoalsDb, userId: string, now: Date = new Date(), thisRunSessionId?: string | null): Promise<DailyGoals> {
  const start = utcDayStart(now);
  const rows = await db.gameSession.findMany({
    where: { userId, createdAt: { gte: start } },
    select: { id: true, mode: true, won: true },
    orderBy: { createdAt: 'asc' },
    take: GOAL_ROWS_MAX,
  });
  const runs: GoalRun[] = rows.filter((r) => !floorOnlyMode(r.mode)).map((r) => ({ id: r.id, mode: canonicalModeKey(r.mode), won: Boolean(r.won) }));
  const day = utcDayKey(now.getTime());
  return {
    day,
    resetsAt: new Date(start.getTime() + 86_400_000).toISOString(),
    goals: goalStates(day, runs),
    completedNow: completedBy(day, runs, thisRunSessionId ?? null),
  };
}
