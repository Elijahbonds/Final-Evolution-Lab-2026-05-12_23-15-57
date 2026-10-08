// DAILY GOALS → SEASON XP (owner decision 2026-10-06): addSeasonXp feeds SeasonPassCore.sessionXp's questsDone with the
// goals THIS session completed — read from the day's rows in the run's own transaction — and nothing else.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: async () => {} }));
vi.mock('@/lib/ledger', () => ({ postLc: async () => {} }));
vi.mock('@/lib/prq-recovery', () => ({ settleRecoveryFor: async () => {} }));

import { addSeasonXp } from './season-service';
import { QUEST_SEASON_XP, SeasonPassCore } from './season-pass-core';
import { goalsFor, utcDayKey } from '@/lib/goals/daily-goals';

type Row = { id: string; mode: string; won: boolean; createdAt: Date };

function fakeTx(rows: Row[]) {
  const progress = { userId: 'u1', seasonId: 's1', xp: 0, tier: 0, hasPro: false, claimedFree: [], claimedPro: [] };
  const writes: Array<Record<string, unknown>> = [];
  const tx = {
    season: { findFirst: async () => ({ id: 's1', key: 'test-season', name: 'Test', theme: null, tiers: 50, startsAt: new Date(0), endsAt: new Date(Date.now() + 864e5), active: true }) },
    passProgress: {
      findUnique: async () => progress,
      create: async () => progress,
      update: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); return { ...progress, ...data }; },
    },
    gameSession: {
      count: async ({ where }: { where: { mode: string } }) => rows.filter((r) => r.mode === where.mode).length,
      findMany: async () => rows.map(({ id, mode, won }) => ({ id, mode, won })),
    },
  };
  return { tx, writes };
}

// a fixed day, so the goals are known: 2026-10-06 holds winRow-2, wins-2, runs-3 (one play goal; losses move no other)
const NOW = new Date(Date.UTC(2026, 9, 6, 18, 0));
vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
const today = utcDayKey(NOW.getTime());
const runsGoal = goalsFor(today).find((g) => g.kind === 'runs')!;
// a day's rows that take the play goal exactly to its target on the last row, every run a loss in its own new mode
// (losses move no win goal; `runs` and `modes` both count one per row here)
const rowsUpTo = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, mode: ['golf', 'dance', 'soccer', 'football', 'tennis'][i], won: false, createdAt: new Date() }));

describe('addSeasonXp × the daily goals', () => {
  it('the session that completes a goal gets QUEST_SEASON_XP on top of its own season XP, and says which goal', async () => {
    const rows = rowsUpTo(runsGoal.target);
    const { tx } = fakeTx(rows);
    const r = await addSeasonXp({ userId: 'u1', mode: rows[rows.length - 1].mode, score: 100, won: false, sessionId: rows[rows.length - 1].id }, { db: tx as never, deferTierRewards: true });
    const plain = SeasonPassCore.sessionXp({ score: 100, won: false, firstOfDayMode: true });
    expect(r!.goals.completedNow).toContain(runsGoal.id);
    expect(r!.gained).toBe(plain + r!.goals.completedNow.length * QUEST_SEASON_XP);
    expect(r!.goals.completedNow.length).toBeGreaterThanOrEqual(1);
  });

  it('the session before it completes nothing and is paid its plain season XP', async () => {
    const rows = rowsUpTo(runsGoal.target - 1);
    const { tx } = fakeTx(rows);
    const r = await addSeasonXp({ userId: 'u1', mode: rows[rows.length - 1].mode, score: 100, won: false, sessionId: rows[rows.length - 1].id }, { db: tx as never, deferTierRewards: true });
    expect(r!.goals.completedNow).toEqual([]);
    expect(r!.gained).toBe(SeasonPassCore.sessionXp({ score: 100, won: false, firstOfDayMode: true }));
  });

  it('without the session id nothing is credited (the goals are still read for the card)', async () => {
    const rows = rowsUpTo(runsGoal.target);
    const { tx } = fakeTx(rows);
    const r = await addSeasonXp({ userId: 'u1', mode: rows[rows.length - 1].mode, score: 100, won: false }, { db: tx as never, deferTierRewards: true });
    expect(r!.goals.completedNow).toEqual([]);
    expect(r!.goals.goals).toHaveLength(3);
    expect(r!.gained).toBe(SeasonPassCore.sessionXp({ score: 100, won: false, firstOfDayMode: true }));
  });

  it('QUEST_SEASON_XP is the TUNED 100, and sessionXp reads it (no stray 200)', () => {
    expect(QUEST_SEASON_XP).toBe(100);
    expect(SeasonPassCore.sessionXp({ questsDone: 2 }) - SeasonPassCore.sessionXp({})).toBe(200);
    expect(SeasonPassCore.sessionXp({ questsDone: NaN })).toBe(SeasonPassCore.sessionXp({}));
    expect(SeasonPassCore.sessionXp({ questsDone: -3 })).toBe(SeasonPassCore.sessionXp({}));
  });
});
