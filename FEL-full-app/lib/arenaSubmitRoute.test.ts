// HOTFIX (2026-09-24): the stake routes, run for real with auth and the database mocked (no DATABASE_URL, no network).
// What is proven: a refused score writes NOTHING (no score, no event, no ghost, no settlement); a good one is written; a
// Flight Night card is stored only when it adds up and only on a Flight Night duel; the house rival is held to the same
// ceiling; the dark competition engine refuses the same way and will not lock money on a mode it cannot bound; the weekly
// ladder (which pays Lab Credits) is held to its mode's ceiling; and a duel never shows the opponent's score to beat.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ tx: null as unknown, userLookups: 0, db: {} as Record<string, any> }));

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'u1' } })) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/flags', () => ({ isRealMoneyCompetitionEnabled: () => true, FEATURE_DISABLED: { error: 'feature_disabled' } }));
vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => unknown) => fn(h.tx),
    get user() { return h.db.user ?? { findUnique: async () => { h.userLookups++; return null; } }; },
    get ladderSeason() { return h.db.ladderSeason; },
    get ladderEntry() { return h.db.ladderEntry; },
    get competitionMatch() { return h.db.competitionMatch; },
    get matchEvent() { return h.db.matchEvent; },
  },
}));
// the LC book itself is covered elsewhere; here only the decision to settle matters
vi.mock('@/lib/arena', async (orig) => ({
  ...(await orig<typeof import('@/lib/arena')>()),
  arenaPayWinner: vi.fn(async () => ({ payout: 90, rake: 10 })),
  arenaRefund: vi.fn(async () => 0),
}));

import { emptyCard, addAttempt, forWire, type DunkAttempt } from './mp/dunkCard';

interface Writes { updates: Record<string, unknown>[]; events: { eventType: string; payload: Record<string, unknown> }[] }
function fakeTx(match: Record<string, unknown>): Writes {
  const writes: Writes = { updates: [], events: [] };
  h.tx = {
    competitionMatch: {
      findUnique: async () => ({ ...match }),
      update: async ({ data }: { data: Record<string, unknown> }) => { writes.updates.push(data); Object.assign(match, data); return { ...match }; },
    },
    matchEvent: {
      findFirst: async () => null,
      create: async ({ data }: { data: { eventType: string; payload: string } }) => { writes.events.push({ eventType: data.eventType, payload: JSON.parse(data.payload) }); },
    },
    gameSession: { findMany: async () => [] },
  };
  return writes;
}

const arenaMatch = (over: Record<string, unknown> = {}) => ({
  id: 'm1', currency: 'LC', status: 'ACTIVE', matchType: 'H2H', mode: 'hoops1v1', seed: 'seed-1', createdAt: new Date('2026-09-01'),
  player1Id: 'u1', player2Id: 'u2', player1Score: null, player2Score: null, entryFeeCents: 50, rakePercent: 10, ...over,
});

async function arenaPost(body: unknown) {
  const { POST } = await import('@/app/api/arena/submit-score/route');
  const res = await POST(new Request('http://fel.local/api/arena/submit-score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never);
  return { status: res.status, json: await res.json() as Record<string, unknown> };
}

const attempt = (round: number, judges: number[], total: number): DunkAttempt => ({ round, style: 'POWER', prop: 'NO PROP', finish: 'dunk_finish', label: 'TOMAHAWK', judges, total, made: true });
const card = forWire([attempt(1, [9, 9, 9], 46), attempt(1, [8, 8, 8], 41), attempt(2, [10, 10, 10], 60), attempt(2, [7, 8, 7], 38)].reduce(addAttempt, emptyCard()));

describe('POST /api/arena/submit-score', () => {
  beforeEach(() => { h.tx = null; });

  it('refuses a score above the mode ceiling with a 422 and the reason, and writes nothing', async () => {
    const writes = fakeTx(arenaMatch());
    const r = await arenaPost({ matchId: 'm1', score: 999_999 });
    expect(r.status).toBe(422);
    expect(r.json.error).toBe('SCORE_ABOVE_CEILING');
    expect(String(r.json.detail)).toContain('13');
    expect(writes.updates).toHaveLength(0);
    expect(writes.events).toHaveLength(0);
  });

  it('records a score the mode can produce, exactly as before', async () => {
    const writes = fakeTx(arenaMatch());
    const r = await arenaPost({ matchId: 'm1', score: 11 });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, settled: false });
    expect(writes.updates[0]).toMatchObject({ player1Score: 11 });
    expect(writes.events[0]).toMatchObject({ eventType: 'SCORE_SUBMITTED', payload: { player: 'p1', score: 11 } });
  });

  it('stores a Flight Night card that adds up, with the score', async () => {
    const writes = fakeTx(arenaMatch({ mode: 'dunkContest' }));
    const r = await arenaPost({ matchId: 'm1', score: card.total, card });
    expect(r.status).toBe(200);
    expect((writes.events[0].payload.card as { total: number }).total).toBe(card.total);
  });

  it('refuses a Flight Night score that is not its card\'s total — no score, no card, no event', async () => {
    const writes = fakeTx(arenaMatch({ mode: 'dunkContest' }));
    const r = await arenaPost({ matchId: 'm1', score: card.total + 20, card });
    expect(r.status).toBe(422);
    expect(r.json.error).toBe('SCORE_CARD_MISMATCH');
    expect(writes.updates).toHaveLength(0);
    expect(writes.events).toHaveLength(0);
  });

  it('refuses a forged card total even when the score matches the forgery', async () => {
    fakeTx(arenaMatch({ mode: 'dunkContest' }));
    const r = await arenaPost({ matchId: 'm1', score: 230, card: { ...card, total: 230 } });
    expect(r).toMatchObject({ status: 422, json: { error: 'CARD_TOTAL_MISMATCH' } });
  });

  it('does not store a dunk card on a duel that is not Flight Night', async () => {
    const writes = fakeTx(arenaMatch());
    const r = await arenaPost({ matchId: 'm1', score: 11, card });
    expect(r.status).toBe(200);
    expect(writes.events[0].payload.card).toBeUndefined();
  });

  it('holds the house rival to the ceiling: a cold-start tennis draw (~21) posts 4, the most a match can end on', async () => {
    const writes = fakeTx(arenaMatch({ mode: 'tennis', matchType: 'GHOST_DUEL' }));
    const r = await arenaPost({ matchId: 'm1', score: 3 });
    expect(r.status).toBe(200);
    const ghost = writes.events.find((e) => e.eventType === 'GHOST_SCORED')!;
    expect(ghost.payload.score).toBe(4);
    expect(Number(ghost.payload.drawnAboveCeiling)).toBeGreaterThan(4);
    expect(r.json).toMatchObject({ settled: true, p1Score: 3, p2Score: 4 });
  });

  it('a refused ghost-duel score draws no house score and settles nothing', async () => {
    const writes = fakeTx(arenaMatch({ mode: 'threePoint', matchType: 'GHOST_DUEL' }));
    const r = await arenaPost({ matchId: 'm1', score: 31 });
    expect(r.status).toBe(422);
    expect(writes.events.find((e) => e.eventType === 'GHOST_SCORED')).toBeUndefined();
    expect(writes.updates).toHaveLength(0);
  });
});

describe('the dark competition engine', () => {
  beforeEach(() => { h.tx = null; h.userLookups = 0; });

  const compMatch = (over: Record<string, unknown> = {}) => ({
    id: 'c1', status: 'ACTIVE', mode: 'skateboard', expiresAt: null, player1Id: 'u1', player2Id: 'u2', player1Score: null, player2Score: null, ...over,
  });
  async function compPost(path: 'submit-score' | 'create', body: unknown) {
    const mod = path === 'create' ? await import('@/app/api/competition/create/route') : await import('@/app/api/competition/submit-score/route');
    const res = await mod.POST(new Request(`http://fel.local/api/competition/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never);
    return { status: res.status, json: await res.json() as Record<string, unknown> };
  }

  it('submit-score refuses a board run above its ceiling (the key CompetitionBridge sends), writing nothing', async () => {
    const writes = fakeTx(compMatch());
    const r = await compPost('submit-score', { matchId: 'c1', score: 999_999_999 });
    expect(r.status).toBe(422);
    expect(r.json.code).toBe('SCORE_ABOVE_CEILING');
    expect(writes.updates).toHaveLength(0);
    expect(writes.events).toHaveLength(0);
  });

  it('submit-score records a run the mode can produce', async () => {
    const writes = fakeTx(compMatch());
    const r = await compPost('submit-score', { matchId: 'c1', score: 1800 });
    expect(r.status).toBe(200);
    expect(writes.updates[0]).toMatchObject({ player1Score: 1800 });
  });

  it('submit-score refuses a match on a mode with no ceiling', async () => {
    fakeTx(compMatch({ mode: 'freestyle-anything' }));
    const r = await compPost('submit-score', { matchId: 'c1', score: 1 });
    expect(r).toMatchObject({ status: 422, json: { code: 'NO_SCORE_CEILING' } });
  });

  it('create will not lock an entry fee on a mode it cannot bound, and lets a bounded one through to eligibility', async () => {
    const bad = await compPost('create', { mode: 'freestyle-anything', entryFeeCents: 500 });
    expect(bad).toMatchObject({ status: 400, json: { error: 'NO_SCORE_CEILING' } });
    expect(h.userLookups).toBe(0);
    const ok = await compPost('create', { mode: 'skateboard', entryFeeCents: 500 });
    expect(ok.status).toBe(404);          // past the ceiling gate: the (mocked) user lookup finds nobody
    expect(h.userLookups).toBe(1);
  });
});

describe('POST /api/ladder/enter (the weekly dunk ladder pays Lab Credits)', () => {
  const writes: string[] = [];
  beforeEach(() => {
    writes.length = 0;
    h.db = {
      ladderSeason: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => { writes.push('season'); return { id: 's1', finalized: false, ...data }; },
      },
      ladderEntry: {
        upsert: async ({ create }: { create: Record<string, unknown> }) => { writes.push('entry'); return { id: 'e1', attempts: 1, bestScore: create.bestScore }; },
        update: async () => { writes.push('best'); return {}; },
      },
    };
  });
  async function ladderPost(body: unknown) {
    const { POST } = await import('@/app/api/ladder/enter/route');
    const res = await POST(new Request('http://fel.local/api/ladder/enter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never);
    return { status: res.status, json: await res.json() as Record<string, unknown> };
  }

  it('refuses a score no Flight Night can reach, before anything is written — not even the week\'s season', async () => {
    const r = await ladderPost({ score: 241 });
    expect(r.status).toBe(422);
    expect(r.json.error).toBe('SCORE_ABOVE_CEILING');
    expect(writes).toEqual([]);
    expect((await ladderPost({ score: 5_000_000 })).status).toBe(422);
  });

  it('records a score a night can produce, exactly as before', async () => {
    const r = await ladderPost({ score: 212 });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ bestScore: 212, attempts: 1 });
    expect(writes).toEqual(['season', 'entry']);
  });

  it('refuses a negative score; a missing one still enters as 0, as it always did', async () => {
    expect((await ladderPost({ score: -3 })).status).toBe(400);
    expect((await ladderPost({ score: Number.NaN })).status).toBe(200);   // JSON has no NaN: it arrives as null → 0
    expect(writes).toEqual(['season', 'entry']);
  });
});

describe('the opponent\'s score is not shown before your own run (low finding: the number to beat)', () => {
  const match = (over: Record<string, unknown> = {}) => ({
    id: 'm1', currency: 'LC', status: 'ACTIVE', matchType: 'H2H', mode: 'hoops1v1', seed: 's', entryFeeCents: 50, rakePercent: 10,
    player1Id: 'u2', player2Id: 'u1', player1Score: 12, player2Score: null, winnerId: null, updatedAt: new Date('2026-09-24'), createdAt: new Date('2026-09-24'), ...over,
  });
  function db(m: Record<string, unknown>) {
    h.db = {
      competitionMatch: { findUnique: async () => m, findMany: async ({ where }: { where: { status?: string } }) => (where.status === 'WAITING' ? [] : [m]) },
      matchEvent: { findMany: async () => [] },
      user: { findMany: async () => [{ id: 'u2', name: 'Rival' }] },
    };
  }
  async function detail() {
    const { GET } = await import('@/app/api/arena/[matchId]/route');
    const res = await GET(new Request('http://fel.local/api/arena/m1') as never, { params: { matchId: 'm1' } });
    return await res.json() as Record<string, unknown>;
  }
  async function list() {
    const { GET } = await import('@/app/api/arena/list/route');
    const res = await GET();
    return ((await res.json()) as { mine: Record<string, unknown>[] }).mine[0];
  }

  it('while you can still post, says THAT they posted but not what', async () => {
    db(match());
    for (const d of [await detail(), await list()]) {
      expect(d).toMatchObject({ oppScore: null, oppSubmitted: true, myScore: null, mySubmitted: false });
    }
  });

  it('shows it once both are in, and once the duel no longer takes scores', async () => {
    db(match({ player2Score: 9, status: 'SETTLED', winnerId: 'u2' }));
    expect(await detail()).toMatchObject({ oppScore: 12, myScore: 9 });
    expect(await list()).toMatchObject({ oppScore: 12, myScore: 9 });
    db(match({ status: 'EXPIRED' }));
    expect(await detail()).toMatchObject({ oppScore: 12, myScore: null });
    expect(await list()).toMatchObject({ oppScore: 12 });
  });

  it('an opponent who has not posted is simply not in yet', async () => {
    db(match({ player1Score: null }));
    expect(await detail()).toMatchObject({ oppScore: null, oppSubmitted: false });
  });
});
