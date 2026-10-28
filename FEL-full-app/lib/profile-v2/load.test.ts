import { describe, it, expect } from 'vitest';
import { recordCheckValues } from '@/lib/mirror/baselines';
import { readProfileRows, loadProfile, type ProfileDb } from './load';

// The page's whole read. Two things are pinned: it is ONE batch (every query is issued before any answers — no
// waterfall), and the gated reads return nothing for an account the gate refuses, decided in the query itself.
const now = new Date('2026-10-24T12:00:00Z');
const day = (n: number) => new Date(now.getTime() - n * 86_400_000);

interface Seed { dobYear: number | null; optIn: boolean }

/** A fake client: answers from small tables, applies `user: { is: … }` the way the database would, logs every call. */
function fakeDb(seed: Seed) {
  const calls: string[] = [];
  let resolved = 0;
  const issuedBeforeFirstAnswer: number[] = [];
  const userOk = (where: any): boolean => {
    const is = where?.user?.is;
    if (!is) return true;
    const y = seed.dobYear;
    if (is.dobYear && (y === null || y < is.dobYear.gte || y > is.dobYear.lte)) return false;
    if (is.scanSaveOptIn && !seed.optIn) return false;
    return true;
  };
  const answer = <T>(name: string, value: T): Promise<T> => {
    calls.push(name);
    return new Promise((res) => setTimeout(() => { if (resolved++ === 0) issuedBeforeFirstAnswer.push(calls.length); res(value); }, 5));
  };
  const scans = [
    { kind: 'dunk', metrics: { verticalCm: 66 }, createdAt: day(1) },
    { kind: 'rescreen', metrics: { jumpBestIn: 24 }, createdAt: day(9) },
  ];
  const db: ProfileDb = {
    user: { findUnique: () => answer('user.findUnique', { name: 'Jordan', dobYear: seed.dobYear, createdAt: day(100) }) },
    playerProfile: { findUnique: () => answer('playerProfile.findUnique', { xp: 1200, streakDays: 3, avatarKey: 'male-athletic', cosmeticAssetId: null }) },
    scanSaveOptIn: { findUnique: () => answer('scanSaveOptIn.findUnique', seed.optIn ? { scope: 'jump_numbers', granted: true, revokedAt: null } : null) },
    prqEntry: { findMany: () => answer('prqEntry.findMany', [{ id: 'e1', attribute: 'power', value: 62, unit: 'score', source: 'camera', measuredAt: day(1) }]) },
    modeMastery: { findMany: () => answer('modeMastery.findMany', [{ mode: 'dunkContest', tier: 2 }]) },
    workoutScan: { findMany: (a: any) => answer('workoutScan.findMany', userOk(a.where) ? scans : []) },
    mirrorSession: { findMany: (a: any) => answer('mirrorSession.findMany', userOk(a.where) ? [{ patternId: 'squat', reps: 8, faultCounts: recordCheckValues({}, { cleanShare: 0.75 }), createdAt: day(2) }] : []) },
    gameSession: {
      groupBy: (a: any) => answer('gameSession.groupBy', userOk(a.where) ? [{ mode: 'dunkContest', _max: { score: 9100 }, _count: { _all: 12 } }] : []),
      aggregate: (a: any) => answer('gameSession.aggregate', userOk(a.where) ? { _max: { score: 4 }, _count: { _all: 2 } } : { _max: { score: null }, _count: { _all: 0 } }),
      findMany: (a: any) => answer('gameSession.findMany', userOk(a.where) ? [{ mode: 'dunkContest', score: 9100, createdAt: day(1) }] : (a.select?.score ? [] : [{ createdAt: day(1) }])),
    },
    mpMatch: { findMany: () => answer('mpMatch.findMany', []) },
    challengeLink: { aggregate: () => answer('challengeLink.aggregate', { _count: { _all: 2 }, _sum: { opened: 5, attempted: 3, beaten: 1 } }) },
    creatorCard: { findFirst: () => answer('creatorCard.findFirst', null) },
    coachClient: { findMany: () => answer('coachClient.findMany', []) },
    credential: { findMany: () => answer('credential.findMany', []) },
    mirrorTriumph: { findMany: () => answer('mirrorTriumph.findMany', []) },
  };
  return { db, calls, issuedBeforeFirstAnswer };
}

describe('readProfileRows', () => {
  it('is one batch: every read is issued before the first one answers', async () => {
    const f = fakeDb({ dobYear: 1990, optIn: true });
    await readProfileRows(f.db, 'u1', now);
    expect(f.calls.length).toBe(17);
    expect(f.issuedBeforeFirstAnswer[0]).toBe(f.calls.length);
  });

  it('an opted-in adult gets their saved jumps, Mirror sets and bests', async () => {
    const rows = await readProfileRows(fakeDb({ dobYear: 1990, optIn: true }).db, 'u1', now);
    expect(rows.jumpScans).toHaveLength(2);
    expect(rows.mirrorSessions).toHaveLength(1);
    expect(rows.bests.find((b) => b.mode === 'dunkContest')).toEqual({ mode: 'dunkContest', best: 9100, runs: 12 });
  });

  it('an adult who has not opted in gets bests but no saved movement numbers', async () => {
    const rows = await readProfileRows(fakeDb({ dobYear: 1990, optIn: false }).db, 'u1', now);
    expect(rows.jumpScans).toEqual([]);
    expect(rows.mirrorSessions).toEqual([]);
    expect(rows.bests.length).toBeGreaterThan(0);
  });

  for (const dobYear of [2010, 2008, null]) {
    it(`a minor or unknown age (${dobYear}) gets no gated row from the database at all`, async () => {
      const rows = await readProfileRows(fakeDb({ dobYear, optIn: true }).db, 'u1', now);
      expect(rows.jumpScans).toEqual([]);
      expect(rows.mirrorSessions).toEqual([]);
      expect(rows.recentScores).toEqual([]);
      expect(rows.bests.every((b) => b.best === null && b.runs === 0)).toBe(true);
    });
  }

  it('a read that throws costs its block, not the page', async () => {
    const f = fakeDb({ dobYear: 1990, optIn: true });
    f.db.mpMatch.findMany = () => Promise.reject(new Error('relation "MpMatch" does not exist'));
    f.db.scanSaveOptIn.findUnique = () => Promise.reject(new Error('missing table'));
    const data = await loadProfile(f.db, 'u1', now);
    expect(data.squad.opponents).toEqual([]);
    expect(data.gates.canSaveScan).toBe(false);   // fails closed: no opt-in read, no saved numbers shown
  });
});
