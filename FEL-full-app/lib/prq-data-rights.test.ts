// Profile's data rights (review D5, 2026-09-24): the export hands over, and the delete erases, the movement history
// (every WorkoutScan row) beside the PRQ entries. Against a fake client; the routes' wiring is checked statically,
// the way lib/api/routeContract.test.ts reads route files.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectPrqExport, erasePrqData, erasureReason, MOVEMENT_HISTORY_SELECT } from './prq-data-rights';
import { FORM_SCAN_KINDS, DUNK_SCAN_KIND } from './move/formSummary';

type Row = Record<string, unknown> & { userId: string };

/** Every kind a WorkoutScan row has been written with: the movement screen, the Mirror's, and the form reads. */
const KINDS = ['movement_screen', 'mirror_screen', DUNK_SCAN_KIND, ...Object.values(FORM_SCAN_KINDS)];

function fakeDb() {
  const t = (d: string) => new Date(`2026-09-${d}T12:00:00.000Z`);
  const store = {
    prqEntry: [
      { id: 'p1', userId: 'u1', attribute: 'power', value: 28, source: 'camera', measuredAt: t('20') },
      { id: 'p2', userId: 'u1', attribute: 'speed', value: 55, source: 'drillResult', measuredAt: t('21') },
      { id: 'p9', userId: 'other', attribute: 'power', value: 70, source: 'manual', measuredAt: t('21') },
    ] as Row[],
    gameSession: [
      { id: 'g1', userId: 'u1', mode: 'dunkContest', score: 40, duration: 90, hits: 3, misses: 1, createdAt: t('20'), won: true },
    ] as Row[],
    workoutScan: [
      ...KINDS.map((kind, i) => ({ id: `w${i}`, userId: 'u1', kind, metrics: { n: i }, avatarSpec: null, createdAt: t(String(10 + i)) })),
      { id: 'w9', userId: 'other', kind: 'dunk', metrics: { verticalCm: 70 }, avatarSpec: null, createdAt: t('22') },
    ] as Row[],
    workoutPlan: [{ id: 'plan1', userId: 'u1', scanId: 'w0' }] as Row[],
  };
  const calls: string[] = [];
  const table = (name: 'prqEntry' | 'gameSession' | 'workoutScan') => ({
    findMany: async ({ where, select }: { where: { userId: string }; select?: Record<string, true> }) => {
      calls.push(`${name}.findMany`);
      const rows = store[name].filter((r) => r.userId === where.userId);
      return select ? rows.map((r) => Object.fromEntries(Object.keys(select).map((k) => [k, r[k]]))) : rows;
    },
    deleteMany: async ({ where }: { where: { userId: string } }) => {
      calls.push(`${name}.deleteMany`);
      const before = store[name].length;
      store[name] = store[name].filter((r) => r.userId !== where.userId);
      return { count: before - store[name].length };
    },
  });
  const db = { prqEntry: table('prqEntry'), gameSession: table('gameSession'), workoutScan: table('workoutScan') };
  return { db: db as never, store, calls };
}

describe('the export hands over the movement history', () => {
  it('every WorkoutScan row of the user\'s, of every kind (form reads, Mirror dunks, screens), beside the PRQ entries', async () => {
    const f = fakeDb();
    const out = await collectPrqExport(f.db, 'u1', new Date('2026-09-24T00:00:00.000Z'));
    expect(out.exportedAt).toBe('2026-09-24T00:00:00.000Z');
    expect(out.prqEntries.map((r: Row) => r.id)).toEqual(['p1', 'p2']);
    expect(out.gameSessions).toHaveLength(1);
    expect(out.movementHistory.map((r: Row) => r.kind).sort()).toEqual([...KINDS].sort());
    for (const k of ['jump', 'dunk', 'shot_form', 'strike_form', 'board_form']) expect(out.movementHistory.map((r: Row) => r.kind)).toContain(k);
    // another user's row never rides along
    expect(out.movementHistory.map((r: Row) => r.id)).not.toContain('w9');
    // each row carries its numbers and when, nothing else
    expect(Object.keys(out.movementHistory[0]).sort()).toEqual(Object.keys(MOVEMENT_HISTORY_SELECT).sort());
    expect(f.calls).toContain('workoutScan.findMany');
  });
});

describe('the delete erases the movement history too', () => {
  it('deletes the PRQ entries and every WorkoutScan row of the user\'s; nobody else\'s, and not a bought plan', async () => {
    const f = fakeDb();
    const erased = await erasePrqData(f.db, 'u1');
    expect(erased).toEqual({ prqEntries: 2, movementHistory: KINDS.length });
    expect(f.store.prqEntry.map((r) => r.id)).toEqual(['p9']);
    expect(f.store.workoutScan.map((r) => r.id)).toEqual(['w9']);
    expect(f.store.workoutPlan).toHaveLength(1);                      // WorkoutPlan.scanId is SetNull: plans stay
    expect(f.calls).toEqual(['prqEntry.deleteMany', 'workoutScan.deleteMany']);
  });

  it('is idempotent, and says so', async () => {
    const f = fakeDb();
    await erasePrqData(f.db, 'u1');
    expect(await erasePrqData(f.db, 'u1')).toEqual({ prqEntries: 0, movementHistory: 0 });
  });

  it('the ledger line names both counts', () => {
    expect(erasureReason({ prqEntries: 2, movementHistory: 7 })).toBe('PRQ data erasure: 2 entries and 7 movement history rows deleted');
  });
});

describe('the routes and the Profile panel are wired that way (static)', () => {
  const root = join(__dirname, '..');
  const read = (p: string) => readFileSync(join(root, p), 'utf8');

  it('export and delete go through the helper; the delete runs in one transaction', () => {
    expect(read('app/api/prq/export/route.ts')).toMatch(/collectPrqExport\(prisma, userId\)/);
    const del = read('app/api/prq/delete/route.ts');
    expect(del).toMatch(/prisma\.\$transaction\(\(tx\) => erasePrqData\(tx, userId\)\)/);
    expect(del).not.toMatch(/workoutPlan/);
  });

  it('the Profile panel calls both routes and its delete copy names the movement history', () => {
    const view = read('components/profile-view.tsx');
    expect(view).toMatch(/'\/api\/prq\/export'/);
    expect(view).toMatch(/'\/api\/prq\/delete'/);
    expect(view).toMatch(/DELETE PRQ \+ MOVEMENT HISTORY/);
    expect(view).toMatch(/movement history/);
  });
});
