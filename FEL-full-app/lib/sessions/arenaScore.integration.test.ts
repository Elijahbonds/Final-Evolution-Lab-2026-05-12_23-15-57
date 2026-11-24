// lane/physics-arena (owner 2026-11-24): the Physics Arena's XP path, end to end against a REAL throwaway Postgres — the real start
// and finish route handlers and the real Prisma client; only the signed-in session is mocked (sessionRuns.integration.test.ts's rig).
//
// Opt-in and local-only, exactly as that file: it runs when SESSIONS_IT=1 and DATABASE_URL points at a database on 127.0.0.1 /
// localhost that is not fel_dev or fel (a throwaway one with this schema applied), and is skipped everywhere else — CI included.
//
// What it holds (the coordinator's bar for shipping arena.xpOn ON): a forged play log is refused and pays nothing; a legit win pays
// the XP the formula says, and NO Lab Credits (owner 2026-11-24 c: "NO LC on arena wins"), no wallet coins, no shards.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sessionXp } from '@/lib/session-payout';
import type { ArenaBasket } from './arenaScore';

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
let getOrCreateProfile: (userId: string) => Promise<unknown>;
const TAG = `arena${Date.now().toString(36)}`;
const users: Record<string, string> = {};

async function call(fn: (r: Request) => Promise<Response>, url: string, body: unknown) {
  const res = await fn(new Request(`http://127.0.0.1:3100${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: res.status, body: (await res.json()) as Json };
}
const as = (who: string) => { h.userId = users[who]; };
async function start(mode: string, query = '') {
  const r = await call(startPOST, `/api/sessions/start${query}`, { mode });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body;
}
async function playedFor(runId: string, sec: number) {
  await prisma.sessionRun.update({ where: { id: runId }, data: { startedAt: new Date(Date.now() - sec * 1000) } });
}
const finish = (body: Json) => call(finishPOST, '/api/sessions', body);
async function balances(userId: string) {
  const p = await prisma.playerProfile.findUnique({ where: { userId }, select: { xp: true, shards: true, streakDays: true } });
  const w = await prisma.wallet.findUnique({ where: { playerId: userId }, select: { coins: true, shards: true, lc: true } });
  return { xp: p?.xp ?? 0, shards: p?.shards ?? 0, streak: p?.streakDays ?? 0, coins: Number(w?.coins ?? 0), walletShards: Number(w?.shards ?? 0), lc: Number(w?.lc ?? 0) };
}
const ledgerFor = (runId: string) => prisma.sessionGrant.findMany({ where: { runId }, orderBy: { grantType: 'asc' } });

/** A game the way the arena logs it: 'm' my basket, 'f' his, upper case a shot from past the arc; 3 s of game clock apart. */
function baskets(seq: string): ArenaBasket[] {
  return [...seq].map((c, i) => ({ t: 4 + i * 3, side: c.toLowerCase() === 'm' ? 'me' : 'foe', shot: true, fromM: c === c.toUpperCase() ? 7.3 : 3.9 }));
}
/** 11–4: nine 1s and a 2 of mine, four 1s of his. */
const WIN = baskets('mmfmmfmmMfmfmm');
const winBody = (runId: string, over: Json = {}) => ({
  runId, mode: 'arenaHoops', score: 11, opponentScore: 4, won: true, duration: 120, played: true, stats: { arena: { v: 1, baskets: WIN } }, ...over,
});

describe.skipIf(!RUN)('Physics Arena XP against a real throwaway Postgres (SESSIONS_IT=1)', () => {
  beforeAll(async () => {
    ({ prisma } = await import('@/lib/db'));
    ({ POST: startPOST } = await import('@/app/api/sessions/start/route'));
    ({ POST: finishPOST } = await import('@/app/api/sessions/route'));
    ({ getOrCreateProfile } = await import('@/lib/profile-service'));
    const [{ db }] = await prisma.$queryRawUnsafe('SELECT current_database() AS db');
    expect(db).not.toMatch(/^fel(_dev)?$/);
    for (const who of ['player', 'forger', 'shooter', 'agent']) {
      const u = await prisma.user.create({ data: { email: `${TAG}-${who}@example.test`, password: 'x', role: 'player' } });
      users[who] = u.id;
      await getOrCreateProfile(u.id);
    }
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { email: { startsWith: `${TAG}-` } } });
    await prisma.$disconnect();
  });

  it('a legit 1v1 win pays the formula\'s XP from the REBUILT score, and no Lab Credits, coins or shards', async () => {
    as('player');
    const before = await balances(users.player);
    const run = await start('arenaHoops');
    expect(run).toMatchObject({ payoutEligible: true, reason: null, modeSlug: 'arenaHoops' });
    await playedFor(run.runId, 120);
    const r = await finish(winBody(run.runId));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ ok: true, paid: true, won: true, xp: sessionXp(11, true), credits: 0, coins: 0, shards: 0, walletShards: 0, streakBonus: 0 });
    const after = await balances(users.player);
    expect(after.xp - before.xp).toBe(sessionXp(11, true));
    expect(after.lc - before.lc).toBe(0);
    expect(after.coins - before.coins).toBe(0);
    expect(after.shards - before.shards).toBe(0);
    expect(after.walletShards - before.walletShards).toBe(0);
    expect(after.streak).toBe(before.streak);   // the arena never claims the streak day (so it never spends the day's streak LC)
    const grants = (await ledgerFor(run.runId)).map((g: Json) => g.grantType);
    expect(grants).not.toContain('wallet_lc');
    expect(grants).not.toContain('wallet_coins');
    expect(grants).toContain('xp');
    expect(await prisma.walletLedgerEntry.findFirst({ where: { idempotencyKey: `session-lc:${run.runId}` } })).toBeNull();
    const row = await prisma.gameSession.findFirst({ where: { runId: run.runId } });
    expect(row).toMatchObject({ mode: 'arenaHoops', score: 11, opponentScore: 4, won: true, credits: 0 });
    // the run is paid once: a retry gets the same answer and pays nothing more
    const again = await finish(winBody(run.runId));
    expect(again.body).toMatchObject({ replayed: true });
    expect((await balances(users.player)).xp).toBe(after.xp);
  });

  it('forged logs are refused: SCORE_INVALID with the rule broken, the run closed, nothing paid', async () => {
    as('forger');
    const before = await balances(users.forger);
    const cases: Array<[Json, string]> = [
      [{ score: 12 }, 'arena_score_mismatch'],                                                            // claims more than its log
      [{ won: true, score: 11, opponentScore: 0, stats: { arena: { v: 1, baskets: baskets('m'.repeat(11)).map((b, i) => ({ ...b, t: i * 0.5 })) } } }, 'arena_too_fast'],
      [{ score: 11, opponentScore: 0, stats: { arena: { v: 1, baskets: baskets('m'.repeat(11)).map((b, i) => ({ ...b, t: 300 + i * 3 })) } } }, 'arena_clock'],   // a game longer than the run
      [{ stats: {} }, 'arena_log_missing'],
      [{ score: 13, opponentScore: 0, stats: { arena: { v: 1, baskets: baskets('m'.repeat(13)) } } }, 'arena_after_final'],
    ];
    for (const [over, detail] of cases) {
      const run = await start('arenaHoops');
      await playedFor(run.runId, 120);
      const r = await finish(winBody(run.runId, over));
      expect(r.status, detail).toBe(422);
      expect(r.body, detail).toMatchObject({ ok: false, paid: false, reason: 'SCORE_INVALID', detail });
      expect(await ledgerFor(run.runId), detail).toEqual([]);
      expect(await prisma.sessionRun.findUnique({ where: { id: run.runId } }), detail).toMatchObject({ status: 'rejected', rejectReason: `SCORE_INVALID:${detail}` });
    }
    expect(await balances(users.forger)).toEqual(before);
    expect(await prisma.gameSession.count({ where: { userId: users.forger } })).toBe(0);
  });

  it('the contest pays its rebuilt points (no win), and an agent run is recorded unpaid', async () => {
    as('shooter');
    const run = await start('arenaThreePoint');
    await playedFor(run.runId, 70);
    const shots = Array.from({ length: 25 }, (_, i) => ({ t: 0.5 + i * 1.8 + Math.floor(i / 5) * 0.7 }));
    const makes = [0, 4, 7, 9, 12].map((i) => ({ t: shots[i].t + 1.1, shot: i }));   // 1 + 2 + 1 + 2 + 1
    const r = await finish({ runId: run.runId, mode: 'arenaThreePoint', score: 7, won: true, duration: 70, played: true, stats: { arena: { v: 1, shots, makes } } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ paid: true, won: false, xp: sessionXp(7, false), credits: 0, coins: 0 });

    as('agent');
    const before = await balances(users.agent);
    const a = await start('arenaHoops', '?agent=1');
    expect(a).toMatchObject({ payoutEligible: false, reason: 'AGENT' });
    await playedFor(a.runId, 120);
    const ar = await finish(winBody(a.runId));
    expect(ar.body).toMatchObject({ ok: true, paid: false, reason: 'AGENT', xp: 0 });
    expect(await balances(users.agent)).toEqual(before);
  });
});
