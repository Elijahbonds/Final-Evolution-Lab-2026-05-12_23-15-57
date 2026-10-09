// DAILY GOALS from the day's GameSession rows (owner decision 2026-10-06): one indexed read, today only, floor-only runs
// left out, and the run that just landed credited with exactly the goals it completed.
import { describe, expect, it } from 'vitest';
import { dailyGoals, floorOnlyMode, type GoalsDb } from './daily-goals-db';
import { goalsFor } from './daily-goals';

type Row = { id: string; mode: string; won: boolean; createdAt: Date; userId: string };

function fakeDb(rows: Row[]) {
  const calls: unknown[] = [];
  const db: GoalsDb = {
    gameSession: {
      findMany: async (a) => {
        calls.push(a);
        return rows
          .filter((r) => r.userId === a.where.userId && r.createdAt.getTime() >= a.where.createdAt.gte.getTime())
          .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())
          .slice(0, a.take)
          .map(({ id, mode, won }) => ({ id, mode, won }));
      },
    },
  };
  return { db, calls };
}

const NOW = new Date(Date.UTC(2026, 9, 6, 18, 0));
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 6, h, m));
const day = '2026-10-06';
const runsGoal = goalsFor(day).find((g) => g.kind === 'runs')!;   // 2026-10-06 holds runs-3 (winRow-2, wins-2, runs-3)

describe('dailyGoals', () => {
  it('reads the user\'s rows since 00:00 UTC, oldest first, through the [userId, createdAt] index', async () => {
    const { db, calls } = fakeDb([]);
    await dailyGoals(db, 'u1', NOW);
    expect(calls).toEqual([{
      where: { userId: 'u1', createdAt: { gte: new Date(Date.UTC(2026, 9, 6)) } },
      select: { id: true, mode: true, won: true },
      orderBy: { createdAt: 'asc' },
      take: 500,
    }]);
  });

  it('today\'s goals, with yesterday\'s runs and other players\' runs left out', async () => {
    const { db } = fakeDb([
      { id: 'y1', userId: 'u1', mode: 'golf', won: true, createdAt: new Date(Date.UTC(2026, 9, 5, 23, 59)) },
      { id: 'o1', userId: 'u2', mode: 'golf', won: true, createdAt: at(9) },
      { id: 't1', userId: 'u1', mode: 'golf', won: true, createdAt: at(9) },
    ]);
    const g = await dailyGoals(db, 'u1', NOW);
    expect(g.day).toBe(day);
    expect(g.resetsAt).toBe('2026-10-07T00:00:00.000Z');
    expect(g.goals.map((x) => x.id)).toEqual(goalsFor(day).map((x) => x.id));
    expect(g.goals.find((x) => x.kind === 'wins')!.progress).toBe(1);
    expect(g.goals.find((x) => x.id === runsGoal.id)!.progress).toBe(1);
  });

  it('a floor-only run (Prove It) moves no goal — it pays no season XP, so a goal it finished could never be paid', async () => {
    expect(floorOnlyMode('dunkduel')).toBe(true);
    expect(floorOnlyMode('golf')).toBe(false);
    const { db } = fakeDb(Array.from({ length: 6 }, (_, i) => ({ id: `d${i}`, userId: 'u1', mode: 'dunkduel', won: true, createdAt: at(10, i) })));
    const g = await dailyGoals(db, 'u1', NOW, 'd5');
    expect(g.goals.every((x) => x.progress === 0)).toBe(true);
    expect(g.completedNow).toEqual([]);
  });

  it('the run that takes a goal over its target is credited with it, and only that run', async () => {
    const rows: Row[] = [];
    const credited: string[][] = [];
    for (let i = 0; i < runsGoal.target + 2; i++) {
      rows.push({ id: `s${i}`, userId: 'u1', mode: 'golf', won: false, createdAt: at(11, i) });
      const { db } = fakeDb(rows);
      credited.push((await dailyGoals(db, 'u1', NOW, `s${i}`)).completedNow.filter((id) => id === runsGoal.id));
    }
    expect(credited.findIndex((c) => c.length > 0)).toBe(runsGoal.target - 1);
    expect(credited.flat()).toEqual([runsGoal.id]);
  });
});
