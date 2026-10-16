// TIER-SERVER (QA top-5 #5): repro `/play/onevone?arena=<id>&tier=rookie` played the staked duel against a ROOKIE. The tier
// is now recorded by the server at the start, kept through the finish, and read only from there when a duel settles.
import { describe, expect, it } from 'vitest';
import { serverTierFor, runTierOf, keepTier, finishTierRefusal, startResult, STAKED_TIER } from './runTier';
import { startRun, closeRun, storedResult, RUN_STATUS } from './sessionRuns';
import { readDuelRun } from '../arena-duel-run';

const eligible = { payoutEligible: true, reason: null } as never;
function fakeDb() {
  const rows: Record<string, any> = {};
  return {
    rows,
    sessionRun: {
      updateMany: async ({ where, data }: any) => {
        const hits = Object.values(rows).filter((r: any) => (!where.id || r.id === where.id) && (!where.status || r.status === where.status) && (!where.userId || r.userId === where.userId));
        for (const r of hits) Object.assign(r, data);
        return { count: where.id ? hits.length : hits.length };
      },
      create: async ({ data }: any) => { const r = { id: `run${Object.keys(rows).length + 1}`, ...data }; rows[r.id] = r; return r; },
      findUnique: async ({ where }: any) => rows[where.id] ?? null,
    },
  };
}

describe('the tier the server records at the start', () => {
  it('a staked start that asks for ROOKIE is recorded PRO: the client\'s tier is ignored', () => {
    expect(serverTierFor({ mode: 'hoops1v1', arenaMatchId: 'm1', tier: 'rookie' })).toEqual({ tier: 'pro', staked: true });
    expect(serverTierFor({ mode: 'hoops1v1', mp: 'ABC234', tier: 'rookie' })).toEqual({ tier: 'pro', staked: true });
    expect(serverTierFor({ mode: 'hoops1v1', c: 'xyz', tier: 'elite' })).toEqual({ tier: 'pro', staked: true });
  });
  it('a free-play start keeps the player\'s pick; nonsense is no tier', () => {
    expect(serverTierFor({ mode: 'hoops1v1', tier: 'rookie' })).toEqual({ tier: 'rookie', staked: false });
    expect(serverTierFor({ mode: 'hoops1v1', tier: 'god' })).toEqual({ tier: null, staked: false });
  });
  it('startRun writes it into the run\'s result JSON, which reads as no stored answer yet', async () => {
    const db = fakeDb();
    const r = await startRun(db as never, { userId: 'u1', mode: 'hoops1v1', eligibility: eligible, tier: serverTierFor({ arenaMatchId: 'm1', tier: 'rookie' }) });
    const row = db.rows[r.runId];
    expect(runTierOf(row)).toEqual({ tier: 'pro', staked: true });
    expect(storedResult(row)).toBeNull();
  });
});

describe('the finish cannot overwrite it', () => {
  it('closing a run carries the start\'s tier into the stored answer, whatever the answer says', async () => {
    const db = fakeDb();
    const r = await startRun(db as never, { userId: 'u1', mode: 'hoops1v1', eligibility: eligible, tier: startResult({ tier: 'pro', staked: true }) });
    await closeRun(db as never, r.runId, { status: RUN_STATUS.recorded, result: { status: 200, body: { ok: true }, tier: 'rookie', staked: false } as never });
    expect(runTierOf(db.rows[r.runId])).toEqual({ tier: 'pro', staked: true });
    expect(storedResult(db.rows[r.runId])).toMatchObject({ status: 200, body: { ok: true } });
  });
  it('keepTier always takes the run\'s copy', () => {
    expect(keepTier({ status: 200, body: {}, tier: 'rookie' }, { result: { tier: 'pro', staked: true } })).toMatchObject({ tier: 'pro', staked: true });
  });
  it('a staked run whose finish claims ROOKIE is refused TIER_MISMATCH; the server\'s own tier, or none, passes', () => {
    const staked = { result: { tier: STAKED_TIER, staked: true } };
    expect(finishTierRefusal(staked, 'rookie')).toBe('TIER_MISMATCH');
    expect(finishTierRefusal(staked, 'pro')).toBeNull();
    expect(finishTierRefusal(staked, undefined)).toBeNull();
    expect(finishTierRefusal({ result: { tier: 'rookie', staked: false } }, 'elite')).toBeNull();   // free play: not staked
  });
});

describe('a duel settles only on the server\'s copy', () => {
  const match = { id: 'm1', mode: 'hoops1v1', createdAt: new Date('2026-09-01') };
  const tx = (result: unknown) => ({
    $queryRaw: async () => [],
    sessionRun: { findUnique: async () => ({ id: 'r1', userId: 'u1', mode: 'hoops1v1', status: 'paid', score: 11, startedAt: new Date('2026-09-02'), result }) },
    matchEvent: { findFirst: async () => null },
  });
  it('a run started as free play (or at ROOKIE) cannot settle a duel: 422 RUN_NOT_STAKED', async () => {
    for (const result of [null, { tier: 'rookie', staked: false }, { tier: 'rookie', staked: true }, { tier: 'pro', staked: false }]) {
      const v = await readDuelRun(tx(result), { runId: 'r1', userId: 'u1', match, postedScore: 11 });
      expect(v, JSON.stringify(result)).toMatchObject({ ok: false, code: 'RUN_NOT_STAKED', status: 422 });
    }
  });
  it('a run the server started staked at PRO settles', async () => {
    const v = await readDuelRun(tx({ tier: 'pro', staked: true, status: 200, body: {} }), { runId: 'r1', userId: 'u1', match, postedScore: 11 });
    expect(v).toEqual({ ok: true, runId: 'r1', score: 11 });
  });
});
