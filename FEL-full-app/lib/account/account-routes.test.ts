// GET /api/account/export and POST /api/account/health-erase, run against a stand-in database.
// The session is the only user id either route accepts.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;

const m = vi.hoisted(() => {
  type StoreName = 'prqEntry' | 'gameSession' | 'workoutScan' | 'healthIntake' | 'painCheckIn' | 'healthConsent' | 'readinessCheckIn' | 'breathLog' | 'mirrorSession' | 'playerProfile' | 'user';
  const t = (d: string) => new Date(`2026-09-${d}T12:00:00.000Z`);
  const blank = (): Record<StoreName, Row[]> => ({
    prqEntry: [
      { id: 'p1', userId: 'u1', attribute: 'power', value: 1, measuredAt: t('20') },
      { id: 'p9', userId: 'other', attribute: 'power', value: 2, measuredAt: t('20') },
    ],
    gameSession: [],
    workoutScan: [
      { id: 'assess-1', userId: 'u1', kind: 'mirror_assessment', metrics: { assessmentId: 'a1' }, avatarSpec: null, createdAt: t('18') },
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
      { id: 'hc1', userId: 'u1', grantedAt: t('20') },
      { id: 'hc9', userId: 'other', grantedAt: t('20') },
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
  });
  const state: {
    session: { user?: { id?: string } } | null;
    store: Record<StoreName, Row[]>;
    blank: typeof blank;
    prisma: any;
  } = {
    session: null,
    store: blank(),
    blank,
    prisma: null,
  };
  const rows = (name: StoreName, where?: Row) => state.store[name].filter((r) => {
    if (!where) return true;
    if (where.userId != null && r.userId !== where.userId) return false;
    if (where.id != null && r.id !== where.id) return false;
    return true;
  });
  const table = (name: StoreName) => ({
    findMany: async (args?: Row) => {
      const found = rows(name, args?.where);
      if (!args?.select) return found;
      return found.map((r) => Object.fromEntries(Object.keys(args.select).map((k) => [k, r[k]])));
    },
    findUnique: async (args?: Row) => {
      const found = rows(name, args?.where)[0] ?? null;
      if (!found || !args?.select) return found;
      return Object.fromEntries(Object.keys(args.select).map((k) => [k, found[k]]));
    },
    deleteMany: async (args: Row) => {
      const before = state.store[name].length;
      state.store[name] = state.store[name].filter((r) => r.userId !== args.where.userId);
      return { count: before - state.store[name].length };
    },
  });
  const prisma = {
    $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
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
    user: table('user'),
  };
  state.prisma = prisma;
  return state;
});

vi.mock('next-auth', () => ({ getServerSession: async () => m.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: m.prisma }));

import { GET as exportGET } from '@/app/api/account/export/route';
import { POST as erasePOST } from '@/app/api/account/health-erase/route';

beforeEach(() => {
  m.session = null;
  m.store = m.blank();
});

describe('GET /api/account/export', () => {
  it('unauthenticated calls get 401', async () => {
    const res = await exportGET();
    expect(res.status).toBe(401);
    expect(m.store.healthIntake).toHaveLength(2);
  });

  it('returns only the caller\'s data and ignores any other user id', async () => {
    m.session = { user: { id: 'u1' } };
    const res = await exportGET();
    expect(res.status).toBe(200);
    const body = JSON.parse(await res.text());
    expect(body.profile).toMatchObject({ id: 'u1', email: 'ada@fel.test' });
    expect(body.profile).not.toHaveProperty('password');
    expect(body.movementHistory.map((r: Row) => r.id)).toEqual(['assess-1']);
    expect(body.mirrorSessions.map((r: Row) => r.id)).toEqual(['ms1']);
    expect(body.playerProfile.id).toBe('pp1');
    const json = JSON.stringify(body);
    expect(json).not.toContain('secret-ada');
    expect(json).not.toContain('secret-bea');
    expect(json).not.toContain('assess-9');
    expect(json).not.toContain('bea@fel.test');
    expect(res.headers.get('Content-Disposition')).toMatch(/fel-account-export-/);
  });
});

describe('POST /api/account/health-erase', () => {
  it('unauthenticated calls get 401 and delete nothing', async () => {
    const res = await erasePOST();
    expect(res.status).toBe(401);
    expect(m.store.healthIntake.map((r) => r.id).sort()).toEqual(['hi1', 'hi9']);
  });

  it('removes only the caller\'s health rows and nothing of another user', async () => {
    m.session = { user: { id: 'u1' } };
    const res = await erasePOST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.erased).toMatchObject({ healthIntakes: 1, painCheckIns: 1, healthConsents: 0, readinessCheckIns: 1, breathLogs: 1 });
    expect(m.store.healthIntake.map((r) => r.id)).toEqual(['hi9']);
    expect(m.store.painCheckIn.map((r) => r.id)).toEqual(['pc9']);
    expect(m.store.readinessCheckIn.map((r) => r.id)).toEqual(['rc9']);
    expect(m.store.breathLog.map((r) => r.id)).toEqual(['bl9']);
    expect(m.store.healthConsent.map((r) => r.id).sort()).toEqual(['hc1', 'hc9']);
    expect(m.store.workoutScan.map((r) => r.id).sort()).toEqual(['assess-1', 'assess-9']);
    expect(m.store.mirrorSession.map((r) => r.id).sort()).toEqual(['ms1', 'ms9']);
    expect(m.store.user.map((r) => r.id).sort()).toEqual(['other', 'u1']);
  });
});
