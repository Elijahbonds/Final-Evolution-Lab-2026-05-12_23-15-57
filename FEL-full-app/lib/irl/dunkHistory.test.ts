// The Mirror's dunk history read (review D4, 2026-09-24): the newest rows, one helper for GET and POST, and the
// all-time answers kept. Against a fake client that honours orderBy / take the way Prisma does.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DUNK_ATTEMPTS_RETURNED, DUNK_HISTORY_ROWS, attemptFromRow, loadDunkHistory } from './dunkHistory';
import { readProgress } from './dunkProgress';

const DAY = 86_400_000;
const NOW = new Date('2026-09-24T18:00:00.000Z');
type Stored = { userId: string; kind: string; metrics: Record<string, unknown>; createdAt: Date };

function fakeDb(rows: Stored[], fail = false) {
  const asked: unknown[] = [];
  const db = {
    workoutScan: {
      findMany: async (args: { where: { userId: string; kind: string }; orderBy: { createdAt: 'asc' | 'desc' }; take: number }) => {
        asked.push(args);
        if (fail) throw new Error('connection reset');
        const dir = args.orderBy.createdAt === 'asc' ? 1 : -1;
        return rows
          .filter((r) => r.userId === args.where.userId && r.kind === args.where.kind)
          .sort((a, b) => dir * (a.createdAt.getTime() - b.createdAt.getTime()))
          .slice(0, args.take)
          .map((r) => ({ metrics: r.metrics, createdAt: r.createdAt }));
      },
    },
  };
  return { db: db as never, asked, find: db.workoutScan.findMany };
}

/** `n` dunks at `cm`, one every 6 hours, the newest `newestDaysAgo` days back. */
function dunks(n: number, cm: number, newestDaysAgo: number, family = 'TWO-HAND JAM'): Stored[] {
  return Array.from({ length: n }, (_, i) => ({
    userId: 'u1', kind: 'dunk', metrics: { verticalCm: cm, flightTimeMs: 600, family },
    createdAt: new Date(NOW.getTime() - newestDaysAgo * DAY - (n - 1 - i) * DAY / 4),
  }));
}

describe('loadDunkHistory: the newest rows, oldest first', () => {
  it('past the old 500-row window, today\'s dunk is in the history: the best, the trend and the streak move', async () => {
    const old = dunks(1200, 40, 2);                                        // 300 days of 40 cm, ending two days ago
    const today: Stored = { userId: 'u1', kind: 'dunk', metrics: { verticalCm: 61, flightTimeMs: 705, family: 'WINDMILL' }, createdAt: NOW };
    const f = fakeDb([...old, today]);

    const attempts = await loadDunkHistory(f.db, 'u1');
    expect(attempts.at(-1)!.at).toBe(NOW.toISOString());                 // oldest first, the newest last
    const p = readProgress(attempts, NOW);
    expect(p.best!.verticalCm).toBe(61);
    expect(p.newBest).toBe(true);
    expect(p.trend.at(-1)!.day).toBe('2026-09-24');

    // control: the read both handlers made before (the OLDEST 500) never sees it
    const before = (await f.find({ where: { userId: 'u1', kind: 'dunk' }, orderBy: { createdAt: 'asc' }, take: 500 })).map(attemptFromRow);
    const stale = readProgress(before, NOW);
    expect(stale.best!.verticalCm).toBe(40);
    expect(stale.streakDays).toBe(0);
    expect(stale.trend.at(-1)!.day < '2026-09-24').toBe(true);
  });

  it('asks for the NEWEST rows, a wide window, the user\'s dunks only', async () => {
    const f = fakeDb([]);
    await loadDunkHistory(f.db, 'u1');
    expect(f.asked[0]).toEqual({
      where: { userId: 'u1', kind: 'dunk' }, orderBy: { createdAt: 'desc' },
      select: { metrics: true, createdAt: true }, take: DUNK_HISTORY_ROWS,
    });
    expect(DUNK_HISTORY_ROWS).toBeGreaterThanOrEqual(2000);
  });

  it('an old all-time best and an old landed rung stay in the window after hundreds more sessions', async () => {
    // the peak and the windmill were early; then ~1500 ordinary dunks (and 4-12 a session is the real rate)
    const peak: Stored = { userId: 'u1', kind: 'dunk', metrics: { verticalCm: 88, flightTimeMs: 847, family: 'WINDMILL', made: true }, createdAt: new Date(NOW.getTime() - 400 * DAY) };
    const f = fakeDb([peak, ...dunks(1500, 45, 0)]);
    const p = readProgress(await loadDunkHistory(f.db, 'u1'), NOW);
    expect(p.best!.verticalCm).toBe(88);
    expect(p.previousBest!.verticalCm).toBe(88);
    expect(p.newBest).toBe(false);
    expect(p.landed).toContain('WINDMILL');
  });

  it('past the window it is the OLDEST rows that leave, never the newest', async () => {
    const f = fakeDb(dunks(DUNK_HISTORY_ROWS + 50, 50, 0));
    const attempts = await loadDunkHistory(f.db, 'u1');
    expect(attempts).toHaveLength(DUNK_HISTORY_ROWS);
    expect(attempts.at(-1)!.at).toBe(NOW.toISOString());
  });

  it('another user\'s dunks and other kinds of row are not in it', async () => {
    const f = fakeDb([
      ...dunks(3, 50, 0),
      { userId: 'other', kind: 'dunk', metrics: { verticalCm: 99, flightTimeMs: 900 }, createdAt: NOW },
      { userId: 'u1', kind: 'jump', metrics: { reads: { heightCm: 70 } }, createdAt: NOW },
    ]);
    expect(await loadDunkHistory(f.db, 'u1')).toHaveLength(3);
  });

  it('a failed read is an empty history, not an error (the page opens on nothing)', async () => {
    const f = fakeDb(dunks(3, 50, 0), true);
    await expect(loadDunkHistory(f.db, 'u1')).resolves.toEqual([]);
  });
});

describe('attemptFromRow: one mapping for GET and POST', () => {
  const at = new Date('2026-09-20T10:00:00.000Z');

  it('keeps the grades and the outcome (POST used to drop difficulty / execution / style)', () => {
    expect(attemptFromRow({ metrics: { verticalCm: 62.4, flightTimeMs: 713, family: 'TOMAHAWK', difficulty: 7, execution: 8.5, style: 6, made: false }, createdAt: at }))
      .toEqual({ at: at.toISOString(), verticalCm: 62.4, flightTimeMs: 713, family: 'TOMAHAWK', difficulty: 7, execution: 8.5, style: 6, made: false });
  });

  it('an unknown family is an ATTEMPT; a missing grade or outcome is left out, not invented', () => {
    const a = attemptFromRow({ metrics: { verticalCm: 50, flightTimeMs: 640, family: 'SCORPION' }, createdAt: at });
    expect(a.family).toBe('ATTEMPT');
    for (const k of ['difficulty', 'execution', 'style', 'made']) expect(a).not.toHaveProperty(k);
  });

  it('a row with no height reads 0 and readProgress drops it: it never counts as a 0 cm dunk', () => {
    const a = attemptFromRow({ metrics: { verticalCm: null, flightTimeMs: null }, createdAt: at });
    expect(a.verticalCm).toBe(0);
    expect(readProgress([a], at).attempts).toBe(0);
    expect(attemptFromRow({ metrics: null, createdAt: at }).verticalCm).toBe(0);
  });
});

describe('the route reads through the helper (static, like lib/api/routeContract.test.ts)', () => {
  it('GET and POST both call loadDunkHistory, and nothing reads the oldest rows any more', () => {
    const route = readFileSync(join(__dirname, '../../app/api/mirror/dunks/route.ts'), 'utf8');
    expect(route.match(/loadDunkHistory\(prisma, userId\)/g)).toHaveLength(2);
    expect(route).not.toMatch(/createdAt: 'asc'/);
    expect(route).not.toMatch(/workoutScan\.findMany/);
    expect(route).toMatch(/attempts\.slice\(-DUNK_ATTEMPTS_RETURNED\)/);
    expect(DUNK_ATTEMPTS_RETURNED).toBeLessThanOrEqual(DUNK_HISTORY_ROWS);
  });
});
