// DAILY-DRILL — the reads: one parallel batch, profile v2's gates inside the queries, the window ending at the start of
// the PT day, and every read failing soft (the card never breaks /train).
import { describe, expect, it } from 'vitest';
import { DRILL_READ_CAP, dailyDrillKey, drillCredit, loadDailyDrill, readDrillRows } from './load';
import { ptDayBounds } from '@/lib/wallet/dailyKey';
import { SKILL_WINDOW_DAYS } from './skills';
import { FALLBACK_WARMUP_CONTEXT, type WarmupContext } from '@/lib/coach/warmup';
import { NOW } from '@/tests/helpers/dailyDrillRows';

const U = 'user_load_1';
const { unavailable: _u, ...READ } = FALLBACK_WARMUP_CONTEXT;
const OPEN_CTX: WarmupContext = { ...READ, isYouth: false, hardStopped: false, painDecision: null, jumpGate: { closed: false, why: '', href: null } };

function spyDb(fail = false) {
  const calls: { table: string; op: string; args: any }[] = [];
  const op = (table: string, name: string, out: unknown) => async (args: unknown) => {
    calls.push({ table, op: name, args });
    if (fail) throw new Error('table missing');
    return out;
  };
  const db = {
    user: { findUnique: op('user', 'findUnique', { dobYear: 1994 }) },
    scanSaveOptIn: { findUnique: op('scanSaveOptIn', 'findUnique', null) },
    workoutScan: { findMany: op('workoutScan', 'findMany', []) },
    mirrorSession: { findMany: op('mirrorSession', 'findMany', []) },
    prqEntry: { findMany: op('prqEntry', 'findMany', []) },
    playerProfile: { findUnique: op('playerProfile', 'findUnique', null) },
    walletLedgerEntry: { findUnique: op('walletLedgerEntry', 'findUnique', null) },
    rewardRule: { findUnique: op('rewardRule', 'findUnique', null) },
  };
  return { db, calls };
}

describe('readDrillRows', () => {
  it('nine reads, one batch; the account rows gated by profile v2\'s opt-in where, inside the query', async () => {
    const { db, calls } = spyDb();
    await readDrillRows(db, U, NOW);
    expect(calls).toHaveLength(9);
    const scans = calls.filter((c) => c.table === 'workoutScan' || c.table === 'mirrorSession');
    expect(scans).toHaveLength(3);
    for (const c of scans) {
      expect(c.args.where.user.is.scanSaveOptIn.is).toEqual({ scope: 'jump_numbers', granted: true, revokedAt: null });
      expect(c.args.where.user.is.dobYear.lte).toBe(NOW.getFullYear() - 19);
    }
    expect(calls.find((c) => c.table === 'workoutScan' && c.args.where.kind === 'shot_form')!.args.take).toBe(DRILL_READ_CAP.shots);
  });

  it('the window is the four weeks before the start of the PT day: nothing from today is read', async () => {
    const { db, calls } = spyDb();
    await readDrillRows(db, U, NOW);
    const { start } = ptDayBounds(NOW);
    for (const c of calls.filter((x) => x.table === 'workoutScan' || x.table === 'mirrorSession')) {
      expect(c.args.where.createdAt.lt).toEqual(start);
      expect(c.args.where.createdAt.gte).toEqual(new Date(start.getTime() - SKILL_WINDOW_DAYS * 86_400_000));
    }
    const prq = calls.find((c) => c.table === 'prqEntry')!;
    expect(prq.args.where.measuredAt.lt).toEqual(start);
    expect(prq.args.where.unit).toBe('score');
  });

  it('today\'s claim is read by its key: daily_drill:<PT day>:<user>', async () => {
    const { db, calls } = spyDb();
    await readDrillRows(db, U, NOW);
    expect(calls.find((c) => c.table === 'walletLedgerEntry')!.args.where).toEqual({ idempotencyKey: dailyDrillKey(U, '2026-10-24') });
    expect(dailyDrillKey(U, '2026-10-24')).toBe(`daily_drill:2026-10-24:${U}`);
  });

  it('every read fails soft: a broken database is a starter drill with the shipped credit, never a throw', async () => {
    const { db } = spyDb(true);
    const v = await loadDailyDrill(db, U, { warmupContext: async () => { throw new Error('no context'); } }, NOW);
    expect(v.focus).toBe('starter');
    expect(v.credit).toBe(10);
    // the context that could not be read is the careful one: the Wake-Up runs calm
    expect(v.plan!.calm).toBe(true);
  });

  it('the credit is the live RewardRule row when there is one (editable without a deploy)', async () => {
    const row = { reasonCode: 'DAILY_DRILL_COMPLETE', currency: 'lc', formula: 'flat', baseAmount: 25, scaleNum: 0, minGrant: 25, maxGrant: 25, perMinuteCap: 0, perDayCurrencyCap: 0, active: true };
    expect(await drillCredit({ rewardRule: { findUnique: async () => row } })).toBe(25);
    expect(await drillCredit({ rewardRule: { findUnique: async () => ({ ...row, active: false }) } })).toBe(0);
    expect(await drillCredit({})).toBe(10);
  });

  it('an adult with every gate open gets the jumping drill when the pick asks for it', async () => {
    const { db } = spyDb();
    const v = await loadDailyDrill(db, U, { warmupContext: async () => OPEN_CTX }, NOW);
    expect(v.plan!.drillId).toBe('wake-up');
    expect(v.plan!.calm).toBe(false);
  });
});
