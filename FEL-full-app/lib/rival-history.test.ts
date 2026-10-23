// BASEBALL-GHOST (owner decision, 2026-10-23: "ignore old scores"). Every derby night saved before #403 sits under
// 'baseball' with a score in the hundreds; three-inning Baseball's most is 27. The arena ghost (both its reads) and a
// friend challenge's best score skip 'baseball' sessions created before BASEBALL_INNINGS_SINCE; with none left the ghost
// falls to the baseline of 19. 'derby' reads all of its history.
//
// The fake database below applies the `where` it is handed (mode, userId, createdAt lt/gte, AND) rather than returning a
// canned answer, so taking the cutoff out of lib/arena-ghost.ts or lib/mp/service.ts turns these red.
import { describe, expect, it } from 'vitest';
import { BASEBALL_INNINGS_SINCE, RIVAL_HISTORY_SINCE, rivalHistorySince } from './rival-history';
import { drawHouseScore } from './arena-ghost';
import { ARENA_SCORE_BASELINES, RIVAL_BAND } from './arena-rivals';
import { bestScoreFor } from './mp/service';

interface Row { id: string; userId: string; mode: string; score: number; createdAt: Date }

const CUTOFF = new Date(BASEBALL_INNINGS_SINCE);
const at = (hoursFromCutoff: number) => new Date(CUTOFF.getTime() + hoursFromCutoff * 3_600_000);

function matchesDate(v: Date, f: any): boolean {
  if (f == null) return true;
  if (f.lt && !(v < f.lt)) return false;
  if (f.gte && !(v >= f.gte)) return false;
  return true;
}

function matches(r: Row, where: any): boolean {
  if (!where) return true;
  if (where.userId !== undefined && r.userId !== where.userId) return false;
  if (where.mode !== undefined) {
    const ok = typeof where.mode === 'string' ? r.mode === where.mode : (where.mode.in as string[]).includes(r.mode);
    if (!ok) return false;
  }
  if (!matchesDate(r.createdAt, where.createdAt)) return false;
  if (where.AND && !(where.AND as any[]).every((w) => matches(r, w))) return false;
  return true;
}

function fakeDb(rows: Row[]) {
  const findMany = async ({ where, orderBy, take }: any) => {
    let out = rows.filter((r) => matches(r, where));
    if (orderBy?.createdAt === 'desc') out = out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (orderBy?.score === 'desc') out = out.sort((a, b) => b.score - a.score);
    return (take ? out.slice(0, take) : out).map((r) => ({ score: r.score }));
  };
  return {
    gameSession: {
      findMany,
      findFirst: async (a: any) => (await findMany({ ...a, take: 1 }))[0] ?? null,
    },
    competitionMatch: { findMany: async () => [] },
  };
}

let n = 0;
const row = (userId: string, mode: string, score: number, createdAt: Date): Row => ({ id: `s${n++}`, userId, mode, score, createdAt });

// The derby nights everyone saved under 'baseball' before #403: a player's own and the population's.
const derbyNightsUnderBaseball = [
  ...[280, 310, 295, 330, 260].map((s, i) => row('me', 'baseball', s, at(-24 - i))),
  ...[300, 240, 350, 410, 275, 290].map((s, i) => row(`other${i}`, 'baseball', s, at(-48 - i))),
];

const BASEBALL_CEILING = 27;
const duelAt = (h: number, seed = 'seed-a') => ({ mode: 'baseball', seed, createdAt: at(h) });
const baseline = ARENA_SCORE_BASELINES.baseball;
const bandOf = (c: number) => [Math.round(c * (1 - RIVAL_BAND)), Math.round(c * (1 + RIVAL_BAND))];

describe('BASEBALL_INNINGS_SINCE', () => {
  it('is the hour after #403 merged (2026-10-23T23:32:06Z), and only baseball has a cutoff', () => {
    expect(BASEBALL_INNINGS_SINCE).toBe('2026-10-24T00:00:00Z');
    expect(Object.keys(RIVAL_HISTORY_SINCE)).toEqual(['baseball']);
    expect(rivalHistorySince('baseball')?.toISOString()).toBe('2026-10-24T00:00:00.000Z');
    expect(rivalHistorySince('derby')).toBeNull();
    expect(rivalHistorySince('music')).toBeNull();
  });
  it('the fallback it relies on is the three-inning baseline, 19', () => {
    expect(baseline).toBe(19);
  });
});

describe('arena ghost (drawHouseScore) — baseball', () => {
  it('ignores sessions from before the cutoff: only derby nights on record → the baseline of 19', async () => {
    const tx = fakeDb(derbyNightsUnderBaseball);
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const { score, draw } = await drawHouseScore(tx, duelAt(2, seed), 'me', BASEBALL_CEILING);
      expect(draw.source).toBe('baseline');
      expect(draw.center).toBe(19);
      const [lo, hi] = bandOf(19);
      expect(score).toBeGreaterThanOrEqual(lo);
      expect(score).toBeLessThanOrEqual(hi);
      expect(score).toBeLessThan(BASEBALL_CEILING);   // a rival a player can beat, not a 27 to tie
    }
  });

  it("uses the player's own sessions from after the cutoff, and none from before", async () => {
    const mine = [8, 12, 14, 10, 16].map((s, i) => row('me', 'baseball', s, at(1 + i * 0.1)));
    const tx = fakeDb([...derbyNightsUnderBaseball, ...mine]);
    const { draw } = await drawHouseScore(tx, duelAt(3), 'me', BASEBALL_CEILING);
    expect(draw.source).toBe('player-history');
    expect(draw.center).toBe(12);
  });

  it("with no own sessions after the cutoff, uses the population's from after it", async () => {
    const theirs = [18, 20, 22].map((s, i) => row(`p${i}`, 'baseball', s, at(1 + i * 0.1)));
    const tx = fakeDb([...derbyNightsUnderBaseball, ...theirs]);
    const { draw } = await drawHouseScore(tx, duelAt(3), 'me', BASEBALL_CEILING);
    expect(draw.source).toBe('population');
    expect(draw.center).toBe(20);
  });

  it('a session exactly at the cutoff counts; one a second before does not', async () => {
    const tx = fakeDb([row('me', 'baseball', 9, CUTOFF), row('me', 'baseball', 300, new Date(CUTOFF.getTime() - 1000))]);
    const { draw } = await drawHouseScore(tx, duelAt(1), 'me', BASEBALL_CEILING);
    expect(draw.source).toBe('player-history');
    expect(draw.center).toBe(9);
  });

  it('still reads only sessions from before the duel opened', async () => {
    const tx = fakeDb([row('me', 'baseball', 11, at(1)), row('me', 'baseball', 25, at(5))]);
    const { draw } = await drawHouseScore(tx, duelAt(3), 'me', BASEBALL_CEILING);
    expect(draw.center).toBe(11);
  });

  it('an empty history falls back to 19', async () => {
    const { draw } = await drawHouseScore(fakeDb([]), duelAt(1), 'me', BASEBALL_CEILING);
    expect(draw.source).toBe('baseline');
    expect(draw.center).toBe(19);
  });
});

describe('arena ghost (drawHouseScore) — derby is unaffected', () => {
  it('reads derby sessions from before the baseball cutoff', async () => {
    const derby = [280, 300, 320].map((s, i) => row('me', 'derby', s, at(-30 - i)));
    const tx = fakeDb([...derbyNightsUnderBaseball, ...derby]);
    const { draw } = await drawHouseScore(tx, { mode: 'derby', seed: 's', createdAt: at(2) }, 'me', Infinity);
    expect(draw.source).toBe('player-history');
    expect(draw.center).toBe(300);
  });
  it("derby's population read is not cut either", async () => {
    const derby = [200, 260, 320].map((s, i) => row(`d${i}`, 'derby', s, at(-30 - i)));
    const { draw } = await drawHouseScore(fakeDb(derby), { mode: 'derby', seed: 's', createdAt: at(2) }, 'me', Infinity);
    expect(draw.source).toBe('population');
    expect(draw.center).toBe(260);
  });
});

describe('friend challenge score (bestScoreFor)', () => {
  const prisma = (rows: Row[]) => fakeDb(rows) as any;
  it('a baseball best skips the derby nights from before the cutoff', async () => {
    const db = prisma([...derbyNightsUnderBaseball, row('me', 'baseball', 17, at(1)), row('me', 'baseball', 21, at(2))]);
    expect(await bestScoreFor(db, 'me', 'baseball')).toBe(21);
  });
  it('none after the cutoff is 0, as with no runs', async () => {
    expect(await bestScoreFor(prisma(derbyNightsUnderBaseball), 'me', 'baseball')).toBe(0);
  });
  it('derby keeps its whole history', async () => {
    const db = prisma([...derbyNightsUnderBaseball, row('me', 'derby', 333, at(-40)), row('me', 'derby', 290, at(3))]);
    expect(await bestScoreFor(db, 'me', 'derby')).toBe(333);
  });
});
