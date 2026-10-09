// Account settings: the download and the health erase stay on the signed-in user.
// Against a fake client (vitest does not collect app/). The routes are tested in account-routes.test.ts.
import { describe, expect, it } from 'vitest';
import { collectAccountExport, publicProfile } from './exportData';
import { eraseHealthData } from '@/lib/prq-data-rights';

type Row = Record<string, unknown> & { userId?: string; id: string };

function fake() {
  const t = (d: string) => new Date(`2026-09-${d}T12:00:00.000Z`);
  const store: Record<string, Row[]> = {
    prqEntry: [
      { id: 'p1', userId: 'u1', attribute: 'power', value: 28, measuredAt: t('20') },
      { id: 'p9', userId: 'other', attribute: 'power', value: 70, measuredAt: t('21') },
    ],
    gameSession: [
      { id: 'g1', userId: 'u1', mode: 'dunkContest', score: 40, duration: 10, hits: 1, misses: 0, createdAt: t('20') },
      { id: 'g9', userId: 'other', mode: 'dunkContest', score: 9, duration: 10, hits: 0, misses: 1, createdAt: t('20') },
    ],
    workoutScan: [
      { id: 'assess-1', userId: 'u1', kind: 'mirror_assessment', metrics: { assessmentId: 'a1' }, avatarSpec: null, createdAt: t('18') },
      { id: 'screen-1', userId: 'u1', kind: 'mirror_screen', metrics: { screenId: 's1' }, avatarSpec: null, createdAt: t('19') },
      { id: 'assess-9', userId: 'other', kind: 'mirror_assessment', metrics: { assessmentId: 'a9' }, avatarSpec: null, createdAt: t('18') },
    ],
    healthIntake: [
      { id: 'hi1', userId: 'u1', createdAt: t('20') },
      { id: 'hi9', userId: 'other', createdAt: t('20') },
    ],
    painCheckIn: [
      { id: 'pc1', userId: 'u1', createdAt: t('21') },
      { id: 'pc9', userId: 'other', createdAt: t('21') },
    ],
    healthConsent: [
      { id: 'hc1', userId: 'u1', scope: 'health_data', grantedAt: t('20') },
      { id: 'hc9', userId: 'other', scope: 'health_data', grantedAt: t('20') },
    ],
    readinessCheckIn: [
      { id: 'rc1', userId: 'u1', date: '2026-09-21', createdAt: t('21') },
      { id: 'rc9', userId: 'other', date: '2026-09-21', createdAt: t('21') },
    ],
    breathLog: [
      { id: 'bl1', userId: 'u1', kind: 'ramp', createdAt: t('22') },
      { id: 'bl9', userId: 'other', kind: 'ramp', createdAt: t('22') },
    ],
    mirrorSession: [
      { id: 'ms1', userId: 'u1', patternId: 'squat', createdAt: t('19') },
      { id: 'ms9', userId: 'other', patternId: 'hinge', createdAt: t('19') },
    ],
    playerProfile: [
      { id: 'pp1', userId: 'u1', strength: 40 },
      { id: 'pp9', userId: 'other', strength: 99 },
    ],
    user: [
      { id: 'u1', email: 'ada@fel.test', name: 'Ada', createdAt: t('01'), dobYear: 1990, password: 'secret-ada' },
      { id: 'other', email: 'bea@fel.test', name: 'Bea', createdAt: t('01'), dobYear: 1985, password: 'secret-bea' },
    ],
  };

  const rowsOf = (name: string, where?: { userId?: string; id?: string }) =>
    store[name].filter((r) => {
      if (where?.userId && r.userId !== where.userId) return false;
      if (where?.id && r.id !== where.id) return false;
      return true;
    });

  const table = (name: string) => ({
    findMany: async (args?: { where?: { userId?: string } }) => rowsOf(name, args?.where),
    findUnique: async (args?: { where?: { userId?: string; id?: string } }) => rowsOf(name, args?.where)[0] ?? null,
    deleteMany: async (args: { where: { userId: string } }) => {
      const before = store[name].length;
      store[name] = store[name].filter((r) => r.userId !== args.where.userId);
      return { count: before - store[name].length };
    },
  });

  const db = {
    prqEntry: table('prqEntry'),
    gameSession: table('gameSession'),
    workoutScan: table('workoutScan'),
    healthIntake: table('healthIntake'),
    painCheckIn: table('painCheckIn'),
    healthConsent: table('healthConsent'),
    readinessCheckIn: table('readinessCheckIn'),
    breathLog: table('breathLog'),
    mirrorSession: table('mirrorSession'),
    playerProfile: table('playerProfile'),
    // The fake returns the password column on purpose. The export must not copy it.
    user: table('user'),
  };
  return { db: db as never, store };
}

describe('collectAccountExport', () => {
  it('returns only the caller\'s Mirror assessment, Mirror session, and profile', async () => {
    const f = fake();
    const out = await collectAccountExport(f.db, 'u1', new Date('2026-09-30T00:00:00.000Z'));
    expect(out.movementHistory.map((r) => r.id).sort()).toEqual(['assess-1', 'screen-1']);
    expect(out.movementHistory.map((r) => r.kind)).toContain('mirror_assessment');
    expect(out.mirrorSessions.map((r) => (r as Row).id)).toEqual(['ms1']);
    expect(out.playerProfile).toMatchObject({ id: 'pp1', userId: 'u1' });
    expect(out.profile).toMatchObject({ id: 'u1', email: 'ada@fel.test', name: 'Ada', dobYear: 1990 });
    const json = JSON.stringify(out);
    for (const leaked of ['assess-9', 'ms9', 'pp9', 'p9', 'g9', 'hi9', 'pc9', 'hc9', 'rc9', 'bl9', 'bea@fel.test', 'secret-ada', 'secret-bea']) {
      expect(json, leaked).not.toContain(leaked);
    }
    expect(out.profile && Object.keys(out.profile).sort()).toEqual(['createdAt', 'dobYear', 'email', 'id', 'name']);
  });

  it('publicProfile drops a password even when the row has one', () => {
    const row = publicProfile({
      id: 'u1', email: 'ada@fel.test', name: 'Ada', createdAt: new Date('2026-09-01T00:00:00.000Z'), dobYear: 1990, password: 'secret-ada',
    } as never);
    expect(row).not.toHaveProperty('password');
    expect(JSON.stringify(row)).not.toContain('secret-ada');
  });
});

describe('eraseHealthData for account settings', () => {
  it('removes only the caller\'s health rows and nothing of another user', async () => {
    const f = fake();
    const erased = await eraseHealthData(f.db, 'u1');
    expect(erased).toEqual({ healthIntakes: 1, painCheckIns: 1, healthConsents: 0, readinessCheckIns: 1, breathLogs: 1 });
    expect(f.store.healthIntake.map((r) => r.id)).toEqual(['hi9']);
    expect(f.store.painCheckIn.map((r) => r.id)).toEqual(['pc9']);
    expect(f.store.readinessCheckIn.map((r) => r.id)).toEqual(['rc9']);
    expect(f.store.breathLog.map((r) => r.id)).toEqual(['bl9']);
    // Consent records stay, for both people. Mirror assessments and sessions stay, including the caller's.
    expect(f.store.healthConsent.map((r) => r.id).sort()).toEqual(['hc1', 'hc9']);
    expect(f.store.workoutScan.map((r) => r.id).sort()).toEqual(['assess-1', 'assess-9', 'screen-1']);
    expect(f.store.mirrorSession.map((r) => r.id).sort()).toEqual(['ms1', 'ms9']);
    expect(f.store.prqEntry.map((r) => r.id).sort()).toEqual(['p1', 'p9']);
    expect(f.store.playerProfile.map((r) => r.id).sort()).toEqual(['pp1', 'pp9']);
  });
});
