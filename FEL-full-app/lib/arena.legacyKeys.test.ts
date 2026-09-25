// A DUEL STORED UNDER THE OLD KEY STILL PLAYS (HOTFIX 2026-09-24).
//
// The Academy's arena key moved from 'musicAcademy' to 'music', the key its sessions are saved under. A CompetitionMatch
// written before that still says 'musicAcademy'. Read raw, the lobby lists it under that raw key with a '#' PLAY link.
// Its stake stays locked, because nothing expires an arena duel. Its ghost draw also finds no sessions and falls back
// to the default baseline of 100 on a 5000-point scale. These tests run the real route handlers against an in-memory
// stand-in for the database; nothing here opens a connection. They check that an old row reads as a music duel
// everywhere, and that a new duel is stored under the new key even when an old client posts the old one.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = 'user-1';
const HOUSE = 'house-1';

type Row = Record<string, any>;
const db = {
  matches: [] as Row[],
  sessions: [] as Array<{ userId: string; mode: string; score: number; createdAt: Date }>,
  created: [] as Row[],
  sessionQueries: [] as Row[],
  events: [] as Array<{ type: string; payload: Row }>,
};

const matchesWhere = (where: Row): Row[] => db.matches.filter((m) => {
  if (where.status && m.status !== where.status) return false;
  if (where.player1Id?.not && m.player1Id === where.player1Id.not) return false;
  if (where.OR) return where.OR.some((c: Row) => Object.entries(c).every(([k, v]) => m[k] === v));
  return true;
});

const tx = {
  competitionMatch: {
    findUnique: async ({ where }: Row) => db.matches.find((m) => m.id === where.id) ?? null,
    update: async ({ where, data }: Row) => { const m = db.matches.find((x) => x.id === where.id)!; Object.assign(m, data); return m; },
    create: async ({ data }: Row) => { const m = { id: `m-${db.created.length + 1}`, ...data, createdAt: new Date() }; db.created.push(m); return m; },
  },
  gameSession: {
    findMany: async (args: Row) => {
      db.sessionQueries.push(args.where);
      const { where } = args;
      return db.sessions
        .filter((s) => s.mode === where.mode && (!where.userId || s.userId === where.userId) && s.createdAt < where.createdAt.lt)
        .map((s) => ({ score: s.score }));
    },
  },
};

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: USER } })) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/wallet/wallet-service', () => ({
  applyLc: vi.fn(async () => ({ balanceAfter: 0 })),
  getOrCreateWallet: vi.fn(async () => ({})),
  WalletError: class WalletError extends Error { code = ''; },
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    competitionMatch: {
      findMany: async ({ where }: Row) => matchesWhere(where),
      findUnique: async ({ where }: Row) => db.matches.find((m) => m.id === where.id) ?? null,
    },
    user: { findMany: async () => [{ id: USER, name: 'You' }, { id: HOUSE, name: 'House' }] },
    matchEvent: { findMany: async () => [] },
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));
// The house roster is find-or-create against the user table; here every rival is one house account. The pick itself
// (pickHouseRival) and the rival draw are the real ones.
vi.mock('@/lib/arena-rivals', async (importOriginal) => {
  const real = await importOriginal<typeof import('./arena-rivals')>();
  return { ...real, ensureHouseRivals: vi.fn(async () => new Map(real.HOUSE_RIVALS.map((r) => [r.key, HOUSE]))) };
});
// The LC movements and the event log have their own tests; here they only record what they were asked to do.
vi.mock('@/lib/arena', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./arena')>()),
  arenaLockEntry: vi.fn(async () => 0),
  arenaPayWinner: vi.fn(async () => ({ payout: 0, rake: 0 })),
  arenaRefund: vi.fn(async () => 0),
  appendMatchEvent: vi.fn(async (_db: unknown, _id: string, type: string, _u: unknown, payload: Row = {}) => { db.events.push({ type, payload }); }),
}));

import { GET as listGET } from '../app/api/arena/list/route';
import { GET as matchGET } from '../app/api/arena/[matchId]/route';
import { POST as submitPOST } from '../app/api/arena/submit-score/route';
import { POST as createPOST } from '../app/api/arena/create/route';
import { POST as quickPOST } from '../app/api/arena/quick-match/route';
import { POST as joinPOST } from '../app/api/arena/join/route';
import { recordServerEvent } from '@/lib/analytics-server';
import { ARENA_SCORE_BASELINES, RIVAL_BAND } from './arena-rivals';

const post = (body: unknown) => new Request('http://local.test/api/arena', { method: 'POST', body: JSON.stringify(body) }) as any;
const legacyMatch = (over: Row = {}): Row => ({
  id: 'legacy-1', mode: 'musicAcademy', currency: 'LC', status: 'WAITING', matchType: 'SCORE_DUEL',
  entryFeeCents: 50, rakePercent: 10, seed: 'legacy-seed', player1Id: 'someone-else', player2Id: null,
  player1Score: null, player2Score: null, winnerId: null, createdAt: new Date('2026-09-20T00:00:00Z'),
  updatedAt: new Date('2026-09-20T00:00:00Z'), ...over,
});

beforeEach(() => {
  db.matches = []; db.sessions = []; db.created = []; db.sessionQueries = []; db.events = [];
  vi.mocked(recordServerEvent).mockClear();
});

describe('an arena duel stored as "musicAcademy"', () => {
  it('lists as a music duel with a working PLAY link, in the open lobby and in my duels', async () => {
    db.matches = [legacyMatch(), legacyMatch({ id: 'legacy-2', player1Id: USER, player2Id: HOUSE, status: 'ACTIVE' })];
    const body = await (await listGET()).json();
    expect(body.open).toHaveLength(1);
    expect(body.mine).toHaveLength(1);
    for (const row of [body.open[0], body.mine[0]]) {
      expect(row.mode).toBe('music');
      expect(row.name).toBe('Groove Academy');
      expect(row.href).toBe('/play/music');
    }
  });

  it('opens as a music duel on its own page', async () => {
    db.matches = [legacyMatch({ player1Id: USER, player2Id: HOUSE, status: 'ACTIVE' })];
    const body = await (await matchGET(post({}), { params: { matchId: 'legacy-1' } })).json();
    expect(body).toMatchObject({ mode: 'music', name: 'Groove Academy', href: '/play/music' });
  });

  it("draws its house rival from the player's MUSIC sessions", async () => {
    db.matches = [legacyMatch({ matchType: 'GHOST_DUEL', status: 'ACTIVE', player1Id: USER, player2Id: HOUSE })];
    db.sessions = [
      { userId: USER, mode: 'music', score: 4200, createdAt: new Date('2026-09-19T00:00:00Z') },
      { userId: USER, mode: 'music', score: 4400, createdAt: new Date('2026-09-18T00:00:00Z') },
    ];
    const res = await submitPOST(post({ matchId: 'legacy-1', score: 4000 }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.settled).toBe(true);
    expect(db.sessionQueries.map((w) => w.mode)).toEqual(['music', 'music']);
    const ghost = db.events.find((e) => e.type === 'GHOST_SCORED')!.payload;
    expect(ghost.bandSource).toBe('player-history');
    expect(ghost.bandCenter).toBe(4300);
  });

  it('with no sessions yet, draws off the music baseline, not the default 100', async () => {
    db.matches = [legacyMatch({ matchType: 'GHOST_DUEL', status: 'ACTIVE', player1Id: USER, player2Id: HOUSE })];
    await submitPOST(post({ matchId: 'legacy-1', score: 10 }));
    const ghost = db.events.find((e) => e.type === 'GHOST_SCORED')!.payload;
    expect(ghost.bandSource).toBe('baseline');
    expect(ghost.bandCenter).toBe(ARENA_SCORE_BASELINES.music);
    expect(ghost.score).toBeGreaterThanOrEqual(Math.floor(ARENA_SCORE_BASELINES.music * (1 - RIVAL_BAND)));
  });
});

describe('a new duel', () => {
  it('is stored under the session key even when an old client posts "musicAcademy"', async () => {
    const res = await createPOST(post({ mode: 'musicAcademy', feeLc: 50 }));
    expect(res.status).toBe(200);
    expect(db.created).toHaveLength(1);
    expect(db.created[0].mode).toBe('music');
    expect((await res.json()).mode).toBe('music');
  });

  it('is stored as posted when the client posts the current key, and an unknown key is still refused', async () => {
    await createPOST(post({ mode: 'music', feeLc: 50 }));
    expect(db.created[0].mode).toBe('music');
    const bad = await createPOST(post({ mode: 'notAMode', feeLc: 50 }));
    expect(bad.status).toBe(400);
    expect(db.created).toHaveLength(1);
  });
});

// HOTFIX (2026-09-24): quick-match got the same normalisation as create, and it is the path that makes GHOST_DUEL rows,
// the rows the ghost draw reads. Join was the one arena route still answering with the raw stored key.
describe('a quick match', () => {
  it('is stored, logged and answered under the session key when an old client posts "musicAcademy"', async () => {
    const res = await quickPOST(post({ mode: 'musicAcademy', feeLc: 50 }));
    expect(res.status).toBe(200);
    expect(db.created).toHaveLength(1);
    expect(db.created[0]).toMatchObject({ mode: 'music', matchType: 'GHOST_DUEL', status: 'ACTIVE', player1Id: USER, player2Id: HOUSE });
    expect(db.events.find((e) => e.type === 'CREATED')!.payload.mode).toBe('music');
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, mode: 'music', href: '/play/music' });
  });

  it("then settles against a rival drawn from the player's music sessions", async () => {
    await quickPOST(post({ mode: 'musicAcademy', feeLc: 50 }));
    db.matches = db.created.map((m) => ({ ...m, player1Score: null, player2Score: null, createdAt: new Date('2026-09-20T00:00:00Z') }));
    db.sessions = [{ userId: USER, mode: 'music', score: 4800, createdAt: new Date('2026-09-19T00:00:00Z') }];
    const res = await submitPOST(post({ matchId: db.matches[0].id, score: 4000 }));
    expect(res.status).toBe(200);
    expect(db.sessionQueries.map((w) => w.mode)).toEqual(['music', 'music']);
    expect(db.events.find((e) => e.type === 'GHOST_SCORED')!.payload).toMatchObject({ bandSource: 'player-history', bandCenter: 4800 });
  });

  it('refuses an unknown mode and stores nothing', async () => {
    const res = await quickPOST(post({ mode: 'notAMode', feeLc: 50 }));
    expect(res.status).toBe(400);
    expect(db.created).toHaveLength(0);
  });
});

describe('joining a duel stored as "musicAcademy"', () => {
  it('answers and logs it as a music duel', async () => {
    db.matches = [legacyMatch()];
    const res = await joinPOST(post({ matchId: 'legacy-1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, mode: 'music', status: 'ACTIVE' });
    const joined = vi.mocked(recordServerEvent).mock.calls.map((c) => c[0] as { name: string; props: Row }).find((e) => e.name === 'arena_match_joined')!;
    expect(joined.props.mode).toBe('music');
    expect(db.matches[0].mode).toBe('musicAcademy');   // the stored row is read through the alias, never rewritten
  });
});
