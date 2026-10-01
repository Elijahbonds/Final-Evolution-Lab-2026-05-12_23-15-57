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
import { houseBeatFor, houseTap, judgeHouseSet, HOUSE_SET_MAX, type HouseTap } from './babylon/music/houseBeat';
import { MUSIC_ATTEMPT_START, MUSIC_ATTEMPT_FINISH } from './arena-music';

interface Writes { updates: Record<string, unknown>[]; events: { eventType: string; payload: Record<string, unknown> }[] }
/** MUSIC-SUITE P6: a MatchEvent row already in the database before the request (a music attempt's start / finish). */
interface StoredEvent { matchId: string; userId: string | null; eventType: string; payload: string; createdAt: Date; seq: number }
function fakeTx(match: Record<string, unknown>, stored: StoredEvent[] = []): Writes {
  const writes: Writes = { updates: [], events: [] };
  h.tx = {
    competitionMatch: {
      findUnique: async () => ({ ...match }),
      update: async ({ data }: { data: Record<string, unknown> }) => { writes.updates.push(data); Object.assign(match, data); return { ...match }; },
    },
    matchEvent: {
      findFirst: async () => null,
      create: async ({ data }: { data: { eventType: string; payload: string } }) => { writes.events.push({ eventType: data.eventType, payload: JSON.parse(data.payload) }); },
      // MUSIC-SUITE P6: lib/arena-music.ts readMusicAttempt's read of the player's attempt rows
      findMany: async ({ where }: { where: { matchId: string; userId: string; eventType: { in: string[] } } }) => stored
        .filter((e) => e.matchId === where.matchId && e.userId === where.userId && where.eventType.in.includes(e.eventType))
        .sort((a, b) => a.seq - b.seq),
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

  it('holds the house rival to the ceiling: a cold-start tennis draw (~21) posts 6, the most a match can end on', async () => {
    const writes = fakeTx(arenaMatch({ mode: 'tennis', matchType: 'GHOST_DUEL' }));
    const r = await arenaPost({ matchId: 'm1', score: 3 });
    expect(r.status).toBe(200);
    const ghost = writes.events.find((e) => e.eventType === 'GHOST_SCORED')!;
    expect(ghost.payload.score).toBe(6);
    expect(Number(ghost.payload.drawnAboveCeiling)).toBeGreaterThan(6);
    expect(r.json).toMatchObject({ settled: true, p1Score: 3, p2Score: 6 });
  });

  it('a refused ghost-duel score draws no house score and settles nothing', async () => {
    const writes = fakeTx(arenaMatch({ mode: 'threePoint', matchType: 'GHOST_DUEL' }));
    const r = await arenaPost({ matchId: 'm1', score: 31 });
    expect(r.status).toBe(422);
    expect(writes.events.find((e) => e.eventType === 'GHOST_SCORED')).toBeUndefined();
    expect(writes.updates).toHaveLength(0);
  });
});

// MUSIC-SUITE P6 (2026-09-26, owner decision #12): a music duel's score is the server's rejudge of the player's one
// recorded attempt on the duel's house beat. What is proven: no attempt, no score (409, nothing written); a finished
// attempt's score must be exactly judgeHouseSet on its stored taps (else 422 SCORE_MISMATCH, nothing written); a set
// started and never finished submits 0 and nothing else (the reload rule, #29); the other player's attempt is not mine;
// the house rival of a music quick match is held to the house-beat ceiling; and every other mode is untouched (above).
describe('POST /api/arena/submit-score — a music duel', () => {
  beforeEach(() => { h.tx = null; });

  const musicMatch = (over: Record<string, unknown> = {}) => arenaMatch({ id: 'mm1', mode: 'music', ...over });
  let seq = 0;
  const row = (userId: string, eventType: string, payload: Record<string, unknown> = {}): StoredEvent =>
    ({ matchId: 'mm1', userId, eventType, payload: JSON.stringify(payload), createdAt: new Date('2026-09-26T10:00:00Z'), seq: seq++ });
  /** Every `every`-th note of mm1's house beat tapped dead on, and what the server makes of it. */
  const setOf = (every: number): { taps: HouseTap[]; score: number } => {
    const beat = houseBeatFor('mm1');
    const taps = beat.notes.filter((_, i) => i % every === 0).map((n) => houseTap(n.lane, n.t));
    return { taps, score: judgeHouseSet(beat, taps).score };
  };
  const played = (userId: string, taps: HouseTap[]) => [row(userId, MUSIC_ATTEMPT_START), row(userId, MUSIC_ATTEMPT_FINISH, { taps })];

  it('records a finished attempt\'s score when it is exactly the rejudge, and says so in the event', async () => {
    const { taps, score } = setOf(2);
    expect(score).toBeGreaterThan(0);
    const writes = fakeTx(musicMatch(), played('u1', taps));
    const r = await arenaPost({ matchId: 'mm1', score });
    expect(r.status).toBe(200);
    expect(writes.updates[0]).toMatchObject({ player1Score: score });
    expect(writes.events[0]).toMatchObject({ eventType: 'SCORE_SUBMITTED', payload: { player: 'p1', score, rejudged: true, taps: taps.length } });
    expect(writes.events[0].payload.forfeit).toBeUndefined();
  });

  it('refuses any other number — one point off, a perfect set\'s maximum, zero — 422 SCORE_MISMATCH, nothing written', async () => {
    const { taps, score } = setOf(3);
    for (const posted of [score + 1, score - 50, HOUSE_SET_MAX, 0]) {
      const writes = fakeTx(musicMatch(), played('u1', taps));
      const r = await arenaPost({ matchId: 'mm1', score: posted });
      expect(r.status, String(posted)).toBe(422);
      expect(r.json.error).toBe('SCORE_MISMATCH');
      expect(String(r.json.detail)).toContain(`(${score})`);
      expect(writes.updates).toHaveLength(0);
      expect(writes.events).toHaveLength(0);
    }
  });

  it('with no attempt at all: 409 NO_ATTEMPT, nothing written, no ghost drawn — even a score of 0', async () => {
    for (const posted of [0, 5000]) {
      const writes = fakeTx(musicMatch({ matchType: 'GHOST_DUEL' }));
      const r = await arenaPost({ matchId: 'mm1', score: posted });
      expect(r.status).toBe(409);
      expect(r.json.error).toBe('NO_ATTEMPT');
      expect(writes.updates).toHaveLength(0);
      expect(writes.events).toHaveLength(0);
    }
  });

  it('a set started and never finished (a reload after the count-in) submits 0 — and only 0', async () => {
    const refused = fakeTx(musicMatch(), [row('u1', MUSIC_ATTEMPT_START)]);
    const bad = await arenaPost({ matchId: 'mm1', score: 12_000 });
    expect(bad).toMatchObject({ status: 422, json: { error: 'SCORE_MISMATCH' } });
    expect(refused.updates).toHaveLength(0);
    const writes = fakeTx(musicMatch(), [row('u1', MUSIC_ATTEMPT_START)]);
    const r = await arenaPost({ matchId: 'mm1', score: 0 });
    expect(r.status).toBe(200);
    expect(writes.updates[0]).toMatchObject({ player1Score: 0 });
    expect(writes.events[0]).toMatchObject({ eventType: 'SCORE_SUBMITTED', payload: { score: 0, rejudged: true, forfeit: 'unfinished_attempt' } });
  });

  it('the opponent\'s attempt is not mine: their finished set leaves me with no attempt', async () => {
    const { taps, score } = setOf(2);
    fakeTx(musicMatch(), played('u2', taps));
    expect(await arenaPost({ matchId: 'mm1', score })).toMatchObject({ status: 409, json: { error: 'NO_ATTEMPT' } });
  });

  it('the first finish counts when a race wrote two, and a duel stored as "musicAcademy" is rejudged the same way', async () => {
    const good = setOf(2), other = setOf(4);
    const rows = [row('u1', MUSIC_ATTEMPT_START), row('u1', MUSIC_ATTEMPT_FINISH, { taps: good.taps }), row('u1', MUSIC_ATTEMPT_FINISH, { taps: other.taps })];
    fakeTx(musicMatch({ mode: 'musicAcademy' }), rows);
    expect(await arenaPost({ matchId: 'mm1', score: other.score })).toMatchObject({ status: 422, json: { error: 'SCORE_MISMATCH' } });
    fakeTx(musicMatch({ mode: 'musicAcademy' }), rows);
    expect((await arenaPost({ matchId: 'mm1', score: good.score })).status).toBe(200);
  });

  it('a music quick match: the house rival is drawn (baseline, no rejudged history) and held to the house-beat ceiling', async () => {
    const { taps, score } = setOf(2);
    const writes = fakeTx(musicMatch({ matchType: 'GHOST_DUEL', player2Id: 'house' }), played('u1', taps));
    (h.tx as { competitionMatch: Record<string, unknown> }).competitionMatch.findMany = async () => [];   // no past duels
    const r = await arenaPost({ matchId: 'mm1', score });
    expect(r.status).toBe(200);
    const ghost = writes.events.find((e) => e.eventType === 'GHOST_SCORED')!;
    expect(ghost.payload).toMatchObject({ bandSource: 'baseline', bandCenter: 12_000 });   // (P6 fix pass: 5,000 → 12,000)
    expect(Number(ghost.payload.score)).toBeLessThanOrEqual(HOUSE_SET_MAX);
    expect(r.json).toMatchObject({ settled: true });
  });

  it('a score above the house-beat ceiling is refused as such, whatever the attempt', async () => {
    fakeTx(musicMatch(), [row('u1', MUSIC_ATTEMPT_START)]);
    expect(await arenaPost({ matchId: 'mm1', score: HOUSE_SET_MAX + 1 })).toMatchObject({ status: 422, json: { error: 'SCORE_ABOVE_CEILING' } });
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

  // MUSIC-SUITE P6: this engine records no attempt, so it has no rejudge to give — a music score can never settle here
  // (arena-score-integrity REJUDGED_STAKE_MODES). The engine is dark (REAL_MONEY_COMPETITION).
  it('submit-score refuses a music score it cannot rejudge: 422 SCORE_NOT_REJUDGED, nothing written', async () => {
    const writes = fakeTx(compMatch({ mode: 'music' }));
    const r = await compPost('submit-score', { matchId: 'c1', score: 1000 });
    expect(r).toMatchObject({ status: 422, json: { code: 'SCORE_NOT_REJUDGED' } });
    expect(writes.updates).toHaveLength(0);
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
