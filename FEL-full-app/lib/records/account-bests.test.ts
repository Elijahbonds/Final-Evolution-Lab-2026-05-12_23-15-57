// PERSONAL BESTS ON THE ACCOUNT (owner decision 2026-10-06): verified adults get their best from their own session
// records; a teen, an unknown age or a failed age read stays on the device — and not one session row is read for them.
import { describe, expect, it } from 'vitest';
import { cleanMode, cleanSessionId, readAccountBest, type BestsDb } from './account-bests';

const NOW = new Date(Date.UTC(2026, 9, 6, 12));

function fakeDb(dobYear: number | null | 'throw', agg = { _max: { score: 640 as number | null }, _count: { _all: 9 } }) {
  const reads: unknown[] = [];
  const db: BestsDb = {
    user: {
      findUnique: async () => {
        if (dobYear === 'throw') throw new Error('db down');
        return { dobYear };
      },
    },
    gameSession: { aggregate: async (a) => { reads.push(a); return agg; } },
  };
  return { db, reads };
}

describe('readAccountBest', () => {
  it('a verified adult: the best and the run count in the mode, with the card\'s own run left out', async () => {
    const { db, reads } = fakeDb(1990);
    expect(await readAccountBest(db, 'u1', 'golf', 'sess9', NOW)).toEqual({ scope: 'account', mode: 'golf', best: 640, runs: 9 });
    expect(reads).toEqual([{ where: { userId: 'u1', mode: 'golf', NOT: { id: 'sess9' } }, _max: { score: true }, _count: { _all: true } }]);
  });

  it('no exclusion asked: every row in the mode', async () => {
    const { db, reads } = fakeDb(1990);
    await readAccountBest(db, 'u1', 'golf', null, NOW);
    expect(reads).toEqual([{ where: { userId: 'u1', mode: 'golf' }, _max: { score: true }, _count: { _all: true } }]);
  });

  it('a teen stays on the device, and none of their session rows is read', async () => {
    for (const dob of [2010, 2008]) {
      const { db, reads } = fakeDb(dob);
      expect(await readAccountBest(db, 'u1', 'golf', null, NOW)).toEqual({ scope: 'device' });
      expect(reads).toEqual([]);
    }
  });

  it('a year gap of exactly 18 may still be 17: not verified, device only', async () => {
    const { db, reads } = fakeDb(2008);
    expect(await readAccountBest(db, 'u1', 'golf', null, NOW)).toEqual({ scope: 'device' });
    expect(reads).toEqual([]);
  });

  it('an unknown age or a failed age read is not an adult', async () => {
    for (const dob of [null, 'throw'] as const) {
      const { db, reads } = fakeDb(dob);
      expect(await readAccountBest(db, 'u1', 'golf', null, NOW)).toEqual({ scope: 'device' });
      expect(reads).toEqual([]);
    }
  });

  it('an adult with no runs in the mode: no best', async () => {
    const { db } = fakeDb(1990, { _max: { score: null }, _count: { _all: 0 } });
    expect(await readAccountBest(db, 'u1', 'golf', null, NOW)).toEqual({ scope: 'account', mode: 'golf', best: null, runs: 0 });
  });

  it('the query string is checked: a plain mode key and session id, nothing else', () => {
    expect(cleanMode('threePoint')).toBe('threePoint');
    expect(cleanMode('a b')).toBeNull();
    expect(cleanMode('x'.repeat(65))).toBeNull();
    expect(cleanMode(null)).toBeNull();
    expect(cleanSessionId('clx9abc_1')).toBe('clx9abc_1');
    expect(cleanSessionId('1;drop')).toBeNull();
  });
});
