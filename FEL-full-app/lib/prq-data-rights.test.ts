// Profile's data rights (review D5, 2026-09-24): the export hands over, and the delete erases, the movement history
// (every WorkoutScan row) beside the PRQ entries. Against a fake client; the routes' wiring is checked statically,
// the way lib/api/routeContract.test.ts reads route files.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectPrqExport, erasePrqData, eraseHealthData, erasureReason, MOVEMENT_HISTORY_SELECT } from './prq-data-rights';
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
    healthIntake: [
      { id: 'hi1', userId: 'u1', version: '2026-09-29', answers: {}, redFlags: [], birthYear: null, consentedAt: t('20'), clearedAt: null, createdAt: t('20') },
      { id: 'hi9', userId: 'other', version: '2026-09-29', answers: {}, redFlags: [], birthYear: null, consentedAt: t('20'), clearedAt: null, createdAt: t('20') },
    ] as Row[],
    painCheckIn: [
      { id: 'pc1', userId: 'u1', exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 2, kind: 'after', acute: [], note: null, decision: 'continue', createdAt: t('21') },
      { id: 'pc2', userId: 'u1', exerciseName: 'Deadlift', bodyArea: 'low_back', score: 6, kind: 'next_morning', acute: [], note: null, decision: 'step_down_flag_coach', createdAt: t('22') },
      { id: 'pc9', userId: 'other', exerciseName: 'Row', bodyArea: 'shoulder', score: 1, kind: 'after', acute: [], note: null, decision: 'continue', createdAt: t('21') },
    ] as Row[],
    healthConsent: [
      { id: 'hc1', userId: 'u1', scope: 'health_data', coachId: null, grantedAt: t('20'), revokedAt: null },
      { id: 'hc9', userId: 'other', scope: 'health_data', coachId: null, grantedAt: t('20'), revokedAt: null },
    ] as Row[],
  };
  const calls: string[] = [];
  const table = (name: 'prqEntry' | 'gameSession' | 'workoutScan' | 'healthIntake' | 'painCheckIn' | 'healthConsent') => ({
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
  const db = {
    prqEntry: table('prqEntry'), gameSession: table('gameSession'), workoutScan: table('workoutScan'),
    healthIntake: table('healthIntake'), painCheckIn: table('painCheckIn'), healthConsent: table('healthConsent'),
  };
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

// MIRROR-COACH P5 (2026-09-29): Privacy §5 promises the health intake, every pain check-in and the consent ledger
// itself all ride along on the SAME export/erase promise as the PRQ/movement history above — "everything you told
// FEL", not everything except the newest three tables.
describe('the export hands over the health data too', () => {
  it('every HealthIntake, PainCheckIn and HealthConsent row of the user\'s, nobody else\'s', async () => {
    const f = fakeDb();
    const out = await collectPrqExport(f.db, 'u1', new Date('2026-09-24T00:00:00.000Z'));
    expect(out.healthIntakes.map((r: Row) => r.id)).toEqual(['hi1']);
    expect(out.painCheckIns.map((r: Row) => r.id).sort()).toEqual(['pc1', 'pc2']);
    expect(out.healthConsents.map((r: Row) => r.id)).toEqual(['hc1']);
    for (const bad of ['hi9', 'pc9', 'hc9']) {
      expect(JSON.stringify(out)).not.toContain(bad);
    }
  });
});

describe('eraseHealthData: the narrow health-only erase (Health data settings)', () => {
  it('deletes only the three health tables, of this user only, and never a PRQ entry or a movement-history row', async () => {
    const f = fakeDb();
    const erased = await eraseHealthData(f.db, 'u1');
    expect(erased).toEqual({ healthIntakes: 1, painCheckIns: 2, healthConsents: 1 });
    expect(f.store.healthIntake.map((r) => r.id)).toEqual(['hi9']);
    expect(f.store.painCheckIn.map((r) => r.id)).toEqual(['pc9']);
    expect(f.store.healthConsent.map((r) => r.id)).toEqual(['hc9']);
    // untouched: this is the whole point of keeping it separate from erasePrqData
    expect(f.store.prqEntry).toHaveLength(3);
    expect(f.store.workoutScan).toHaveLength(KINDS.length + 1);
  });

  it('is idempotent', async () => {
    const f = fakeDb();
    await eraseHealthData(f.db, 'u1');
    expect(await eraseHealthData(f.db, 'u1')).toEqual({ healthIntakes: 0, painCheckIns: 0, healthConsents: 0 });
  });
});

describe('the delete erases the movement history too', () => {
  it('deletes the PRQ entries, every WorkoutScan row and the health data too; nobody else\'s, and not a bought plan', async () => {
    const f = fakeDb();
    const erased = await erasePrqData(f.db, 'u1');
    expect(erased).toEqual({ prqEntries: 2, movementHistory: KINDS.length, healthIntakes: 1, painCheckIns: 2, healthConsents: 1 });
    expect(f.store.prqEntry.map((r) => r.id)).toEqual(['p9']);
    expect(f.store.workoutScan.map((r) => r.id)).toEqual(['w9']);
    expect(f.store.healthIntake.map((r) => r.id)).toEqual(['hi9']);
    expect(f.store.painCheckIn.map((r) => r.id)).toEqual(['pc9']);
    expect(f.store.healthConsent.map((r) => r.id)).toEqual(['hc9']);
    expect(f.store.workoutPlan).toHaveLength(1);                      // WorkoutPlan.scanId is SetNull: plans stay
    expect(f.calls).toEqual([
      'prqEntry.deleteMany', 'workoutScan.deleteMany',
      'healthIntake.deleteMany', 'painCheckIn.deleteMany', 'healthConsent.deleteMany',
    ]);
  });

  it('is idempotent, and says so', async () => {
    const f = fakeDb();
    await erasePrqData(f.db, 'u1');
    expect(await erasePrqData(f.db, 'u1')).toEqual({
      prqEntries: 0, movementHistory: 0, healthIntakes: 0, painCheckIns: 0, healthConsents: 0,
    });
  });

  it('the ledger line names every count, PRQ and health together', () => {
    expect(erasureReason({ prqEntries: 2, movementHistory: 7, healthIntakes: 1, painCheckIns: 3, healthConsents: 0 }))
      .toBe('PRQ data erasure: 2 entries, 7 movement history rows and 4 health records deleted');
    // singular "record" at exactly one, and the zero case reads cleanly too
    expect(erasureReason({ prqEntries: 0, movementHistory: 0, healthIntakes: 1, painCheckIns: 0, healthConsents: 0 }))
      .toBe('PRQ data erasure: 0 entries, 0 movement history rows and 1 health record deleted');
    expect(erasureReason({ prqEntries: 0, movementHistory: 0, healthIntakes: 0, painCheckIns: 0, healthConsents: 0 }))
      .toBe('PRQ data erasure: 0 entries, 0 movement history rows and 0 health records deleted');
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
