// ECONOMY-SESSIONS-HARDEN (2026-09-28): the run, against a REAL Postgres — the acceptance checks as tests.
//
// Opt-in and local-only: it runs when SESSIONS_IT=1 and DATABASE_URL points at a database on 127.0.0.1 / localhost that is
// not fel_dev or fel (a throwaway one with this schema applied), and is skipped everywhere else — CI included. It drives
// the real route handlers (start, finish, the wallet earn) and the real Prisma client; only the signed-in session is mocked.
// What a mock cannot show, this does: the conditional claim really serialises two finishes of one run, the unique ledger
// key really refuses a second grant, and every row one payout writes carries the same Postgres transaction id (xmin).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const DB_URL = process.env.DATABASE_URL ?? '';
const LOCAL_DB = /^postgres(?:ql)?:\/\/[^/]*@(?:127\.0\.0\.1|localhost)(?::\d+)?\/(?!fel_dev(?:[?]|$)|fel(?:[?]|$))[\w-]+(?:\?.*)?$/.test(DB_URL);
const RUN = process.env.SESSIONS_IT === '1' && LOCAL_DB;

const h = vi.hoisted(() => ({ userId: '' }));
vi.mock('next-auth', () => ({ getServerSession: async () => (h.userId ? { user: { id: h.userId } } : null) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

type Json = Record<string, any>;
let prisma: any;
let startPOST: (req: Request) => Promise<Response>;
let finishPOST: (req: Request) => Promise<Response>;
let earnPOST: (req: any) => Promise<Response>;
let getOrCreateProfile: (userId: string) => Promise<unknown>;
const TAG = `it${Date.now().toString(36)}`;
const users: Record<string, string> = {};

async function call(fn: (r: Request) => Promise<Response>, url: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fn(new Request(`http://127.0.0.1:3100${url}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }));
  return { status: res.status, body: (await res.json()) as Json };
}
const as = (who: string) => { h.userId = users[who]; };
async function start(mode: string, o: { query?: string; body?: Json; headers?: Record<string, string> } = {}) {
  const r = await call(startPOST, `/api/sessions/start${o.query ?? ''}`, { mode, ...(o.body ?? {}) }, o.headers);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body;
}
/** The server's clock is the only duration: move the run's start back as if it had been played for `sec` seconds. */
async function playedFor(runId: string, sec: number) {
  await prisma.sessionRun.update({ where: { id: runId }, data: { startedAt: new Date(Date.now() - sec * 1000) } });
}
const finish = (body: Json) => call(finishPOST, '/api/sessions', body);
async function balances(userId: string) {
  const p = await prisma.playerProfile.findUnique({ where: { userId }, select: { xp: true, shards: true } });
  const w = await prisma.wallet.findUnique({ where: { playerId: userId }, select: { coins: true, shards: true, lc: true } });
  return { xp: p?.xp ?? 0, shards: p?.shards ?? 0, coins: Number(w?.coins ?? 0), walletShards: Number(w?.shards ?? 0), lc: Number(w?.lc ?? 0) };
}
const ledgerFor = (runId: string) => prisma.sessionGrant.findMany({ where: { runId }, orderBy: { grantType: 'asc' } });
const walletRowsFor = (runId: string) => prisma.walletLedgerEntry.findMany({ where: { idempotencyKey: { startsWith: `run:${runId}:` } } });
async function xmin(table: string, id: string): Promise<string> {
  const rows = await prisma.$queryRawUnsafe(`SELECT xmin::text AS x FROM "${table}" WHERE id = $1`, id);
  return rows[0]?.x;
}
const BB = { mode: 'brainBrawl', score: 549, opponentScore: 0, won: true, duration: 43, played: true, stats: { players: 1, claims: 3, rounds: 5, best: 549 } };

describe.skipIf(!RUN)('ECONOMY-SESSIONS-HARDEN against a real throwaway Postgres (SESSIONS_IT=1)', () => {
  beforeAll(async () => {
    ({ prisma } = await import('@/lib/db'));
    ({ POST: startPOST } = await import('@/app/api/sessions/start/route'));
    ({ POST: finishPOST } = await import('@/app/api/sessions/route'));
    ({ POST: earnPOST } = await import('@/app/api/v1/wallet/earn/route'));
    ({ getOrCreateProfile } = await import('@/lib/profile-service'));
    // the database this touches, said out loud before anything is written
    const [{ db }] = await prisma.$queryRawUnsafe('SELECT current_database() AS db');
    expect(db).not.toMatch(/^fel(_dev)?$/);
    for (const who of ['player', 'twin', 'agent', 'tester', 'listed', 'daily']) {
      const u = await prisma.user.create({ data: { email: `${TAG}-${who}@example.test`, password: 'x', role: who === 'tester' ? 'test' : 'player' } });
      users[who] = u.id;
      await getOrCreateProfile(u.id);
    }
    // an active season, so season XP is paid (and filed) inside the run's transaction
    await prisma.season.upsert({
      where: { key: 'IT-SEASON' }, update: { active: true },
      create: { key: 'IT-SEASON', name: 'Integration', tiers: 50, startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 30 * 86_400_000), active: true },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { email: { startsWith: `${TAG}-` } } });
    await prisma.season.deleteMany({ where: { key: 'IT-SEASON' } });
    await prisma.$disconnect();
  });

  it('check 8: one eligible run pays once — XP, profile shards, LC, wallet coins and won shards, season XP, mastery — all in ONE transaction', async () => {
    as('player');
    const before = await balances(users.player);
    const run = await start('brainBrawl');
    expect(run).toMatchObject({ payoutEligible: true, reason: null, modeSlug: 'brainBrawl' });
    await playedFor(run.runId, 43);
    const r = await finish({ ...BB, runId: run.runId });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, paid: true, replayed: false, runId: run.runId, won: true });
    const after = await balances(users.player);
    expect(after.xp - before.xp).toBe(r.body.xp);
    expect(after.shards - before.shards).toBe(r.body.shards);
    expect(after.coins - before.coins).toBe(r.body.coins);
    expect(after.walletShards - before.walletShards).toBe(r.body.walletShards);
    expect(after.lc - before.lc).toBe(r.body.credits);
    expect(r.body.coins).toBeGreaterThan(0);
    expect(r.body.season).toMatchObject({ gained: expect.any(Number) });

    const ledger = await ledgerFor(run.runId);
    expect(ledger.map((g: Json) => g.grantType)).toEqual(['mastery', 'prq', 'season_xp', 'shards', 'wallet_coins', 'wallet_lc', 'wallet_shards', 'xp']);
    expect(ledger.find((g: Json) => g.grantType === 'xp').amount).toBe(r.body.xp);
    expect(ledger.find((g: Json) => g.grantType === 'wallet_coins').amount).toBe(r.body.coins);
    expect(ledger.find((g: Json) => g.grantType === 'season_xp').amount).toBe(r.body.season.gained);
    const walletRows = await walletRowsFor(run.runId);
    expect(walletRows.map((w: Json) => w.idempotencyKey).sort()).toEqual([`run:${run.runId}:coins`, `run:${run.runId}:lc`, `run:${run.runId}:won`]);

    // the same Postgres transaction wrote every one of them: the ledger, the wallet rows, the balances, the session and the run
    const tx = await xmin('SessionRun', run.runId);
    const session = await prisma.gameSession.findFirst({ where: { userId: users.player }, orderBy: { createdAt: 'desc' } });
    const profile = await prisma.playerProfile.findUnique({ where: { userId: users.player } });
    const wallet = await prisma.wallet.findUnique({ where: { playerId: users.player } });
    const pass = await prisma.passProgress.findFirst({ where: { userId: users.player } });
    const mastery = await prisma.modeMastery.findFirst({ where: { userId: users.player, mode: 'brainBrawl' } });
    for (const [table, id] of [
      ...ledger.map((g: Json) => ['SessionGrant', g.id]), ...walletRows.map((w: Json) => ['WalletLedgerEntry', w.id]),
      ['GameSession', session.id], ['PlayerProfile', profile.id], ['Wallet', wallet.id], ['PassProgress', pass.id], ['ModeMastery', mastery.id],
    ] as Array<[string, string]>) {
      expect(await xmin(table, id), `${table} ${id}`).toBe(tx);
    }
    expect(await prisma.sessionRun.findUnique({ where: { id: run.runId } })).toMatchObject({ status: 'paid', score: 549, sessionId: session.id });
  });

  it('check 3 / QA "duplicate run key pays once": the same runId again answers the stored payload with replayed: true, and nothing moves', async () => {
    as('player');
    const run = await start('brainBrawl');
    await playedFor(run.runId, 43);
    const first = await finish({ ...BB, runId: run.runId });
    const mid = await balances(users.player);
    const rows = (await ledgerFor(run.runId)).length;
    const second = await finish({ ...BB, runId: run.runId });
    const greedy = await finish({ ...BB, score: 4000, runId: run.runId });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ ...first.body, replayed: true });
    expect(greedy.body).toEqual({ ...first.body, replayed: true });
    expect(await balances(users.player)).toEqual(mid);
    expect((await ledgerFor(run.runId)).length).toBe(rows);
    expect(await prisma.gameSession.count({ where: { userId: users.player } })).toBe(2);
  });

  it('QA "two tabs don\'t pay twice": two finishes of one run at the same moment — one pays, one replays, balances move once', async () => {
    as('twin');
    const before = await balances(users.twin);
    const run = await start('brainBrawl');
    await playedFor(run.runId, 43);
    const [a, b] = await Promise.all([finish({ ...BB, runId: run.runId }), finish({ ...BB, runId: run.runId })]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.replayed, b.body.replayed].sort()).toEqual([false, true]);
    const paid = a.body.replayed ? b.body : a.body;
    const after = await balances(users.twin);
    expect(after.xp - before.xp).toBe(paid.xp);
    expect(after.coins - before.coins).toBe(paid.coins);
    expect(await prisma.gameSession.count({ where: { userId: users.twin } })).toBe(1);
    expect((await walletRowsFor(run.runId)).length).toBe(3);
  });

  it('check 1 / QA "impossible score is rejected": SCORE_INVALID, the run closed, no ledger row, no balance change', async () => {
    as('player');
    const before = await balances(users.player);
    const run = await start('brainBrawl');
    await playedFor(run.runId, 43);
    const r = await finish({ ...BB, score: 10_000_000, runId: run.runId });
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ ok: false, paid: false, reason: 'SCORE_INVALID', detail: 'above_max_score', limit: 4500 });
    expect(await ledgerFor(run.runId)).toEqual([]);
    expect(await balances(users.player)).toEqual(before);
    expect(await prisma.sessionRun.findUnique({ where: { id: run.runId } })).toMatchObject({ status: 'rejected', rejectReason: 'SCORE_INVALID:above_max_score' });
    const events = await prisma.analyticsEvent.findMany({ where: { name: 'session_rejected', userId: users.player } });
    expect(events.some((e: Json) => e.props?.reason === 'SCORE_INVALID')).toBe(true);
  });

  it('check 2: a run shorter than minDurationMs is rejected (the server\'s clock, whatever the client says)', async () => {
    as('player');
    const run = await start('brainBrawl');                      // finished straight away: ~0 s on the server's clock
    const r = await finish({ ...BB, duration: 600, runId: run.runId });
    expect(r.body).toMatchObject({ reason: 'SCORE_INVALID', detail: 'too_short' });
    expect(await ledgerFor(run.runId)).toEqual([]);
  });

  it('QA "a missing key is rejected": no runId is RUN_MISSING, a made-up one RUN_UNKNOWN; nothing written', async () => {
    as('player');
    const before = await balances(users.player);
    const sessions = await prisma.gameSession.count({ where: { userId: users.player } });
    expect((await finish({ ...BB })).body).toMatchObject({ reason: 'RUN_MISSING' });
    expect((await finish({ ...BB, runId: 'cm0000000000000000000000' })).status).toBe(404);
    expect(await balances(users.player)).toEqual(before);
    expect(await prisma.gameSession.count({ where: { userId: users.player } })).toBe(sessions);
  });

  it('check 4: XP / shard / coin fields in the request are ignored', async () => {
    as('player');
    const before = await balances(users.player);
    const run = await start('brainBrawl');
    await playedFor(run.runId, 43);
    const r = await finish({ ...BB, runId: run.runId, xp: 999_999, shards: 99_999, coins: 50_000, credits: 10_000, walletShards: 500 });
    const after = await balances(users.player);
    expect(r.body.xp).toBeLessThan(2000);
    expect(after.xp - before.xp).toBe(r.body.xp);
    expect(after.coins - before.coins).toBe(r.body.coins);
    expect(r.body.coins).toBeLessThanOrEqual(400);                // MODE_SESSION_COMPLETED's maxGrant
  });

  it('check 5: an ?agent=1 run and a playtest run record the score with paid: false and no ledger rows', async () => {
    as('agent');
    const before = await balances(users.agent);
    for (const o of [{ query: '?agent=1' }, { body: { playtest: true } }, { headers: { referer: 'http://127.0.0.1:3100/play/brain-brawl?agent=1' } }]) {
      const run = await start('brainBrawl', o);
      expect(run.payoutEligible, JSON.stringify(o)).toBe(false);
      await playedFor(run.runId, 43);
      const r = await finish({ ...BB, runId: run.runId, playtest: false, payoutEligible: true });
      expect(r.body, JSON.stringify(o)).toMatchObject({ ok: true, paid: false, score: 549, sessionId: null, xp: 0, coins: 0 });
      expect(await ledgerFor(run.runId)).toEqual([]);
      expect(await prisma.sessionRun.findUnique({ where: { id: run.runId } })).toMatchObject({ status: 'recorded', score: 549, payoutEligible: false });
    }
    expect(await balances(users.agent)).toEqual(before);
    expect(await prisma.gameSession.count({ where: { userId: users.agent } })).toBe(0);
    expect(await prisma.passProgress.count({ where: { userId: users.agent } })).toBe(0);
  });

  it('check 6: a test-allowlist account (User.role, or FEL_TEST_ACCOUNTS) gets paid: false', async () => {
    as('tester');
    const run = await start('brainBrawl');
    expect(run).toMatchObject({ payoutEligible: false, reason: 'TEST_ACCOUNT' });
    await playedFor(run.runId, 43);
    expect((await finish({ ...BB, runId: run.runId })).body).toMatchObject({ paid: false, reason: 'TEST_ACCOUNT' });
    expect(await ledgerFor(run.runId)).toEqual([]);
    as('listed');
    process.env.FEL_TEST_ACCOUNTS = `${TAG}-listed@example.test`;
    try {
      expect(await start('brainBrawl')).toMatchObject({ payoutEligible: false, reason: 'TEST_ACCOUNT' });
    } finally {
      delete process.env.FEL_TEST_ACCOUNTS;
    }
  });

  it('an expired run is RUN_EXPIRED and never pays', async () => {
    as('player');
    const run = await start('brainBrawl');
    await prisma.sessionRun.update({ where: { id: run.runId }, data: { startedAt: new Date(Date.now() - 3_600_000), expiresAt: new Date(Date.now() - 1000) } });
    expect((await finish({ ...BB, runId: run.runId })).body).toMatchObject({ reason: 'RUN_EXPIRED' });
    expect(await ledgerFor(run.runId)).toEqual([]);
  });

  it('the wallet earn refuses the session events the run pays now (a run cannot be paid again from there)', async () => {
    as('player');
    const before = await balances(users.player);
    const r = await call(earnPOST, '/api/v1/wallet/earn', { idempotency_key: `sess:${TAG}:complete`, event_type: 'mode_session_completed', payload: { mode: 'brainBrawl', run_id: 'x', score: 549 } });
    expect(r.body).toMatchObject({ rejected: 'paid_by_session_run', granted: { coins: 0, shards: 0 } });
    expect(await balances(users.player)).toEqual(before);
  });

  it('ADDENDUM: the daily reward credits the balance exactly once; its replay says replayed and credits nothing', async () => {
    as('daily');
    const key = `daily_first_session:2026-09-28:${users.daily}`;
    const before = await balances(users.daily);
    const first = await call(earnPOST, '/api/v1/wallet/earn', { idempotency_key: key, event_type: 'daily_first_session', payload: { day: '2026-09-28', source: 'wallet-chip' } });
    expect(first.body).toMatchObject({ granted: { coins: 100 }, replayed: false, already_claimed: false, rejected: null });
    const mid = await balances(users.daily);
    expect(mid.coins - before.coins).toBe(100);
    // a second tab / a fresh browser sends the same key: the original grant comes back, marked, and the balance stays
    const again = await call(earnPOST, '/api/v1/wallet/earn', { idempotency_key: key, event_type: 'daily_first_session', payload: { day: '2026-09-28', source: 'wallet-chip' } });
    // PM note (QA acceptance #5): already claimed says so, with granted 0 — never "granted 100" on an unchanged balance
    expect(again.body).toMatchObject({ granted: { coins: 0, shards: 0 }, replayed: true, already_claimed: true, rejected: null, balances: { coins: mid.coins } });
    expect(await balances(users.daily)).toEqual(mid);
    // DAILY-KEY-HOTFIX: the server files the claim under its own day key, never the client's, so the day's claim is
    // counted by its reason: one row for this player, whatever key was sent
    expect(await prisma.walletLedgerEntry.count({ where: { wallet: { playerId: users.daily }, reasonCode: 'DAILY_FIRST_SESSION' } })).toBe(1);
  });
});
