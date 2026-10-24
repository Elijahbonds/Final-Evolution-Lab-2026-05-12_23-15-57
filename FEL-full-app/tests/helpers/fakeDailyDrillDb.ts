// DAILY-DRILL test double: the few tables the claim touches, with the two database behaviours its race safety stands on —
//   · SELECT … FOR UPDATE on a PlayerProfile row holds that row until the transaction ends (a per-user lock here);
//   · WalletLedgerEntry.idempotencyKey is unique (a second insert of a key throws, as Postgres' unique index does).
// Every call yields to the event loop first, so concurrent claims really interleave. A transaction's writes are undone
// if it throws. The real Postgres run of the same race is the lane's probe (docs/DAILY-DRILL.md, "Measured").
import type { ApplyLcArgs, ApplyLcResult } from '@/lib/wallet/wallet-service';
import { WalletError } from '@/lib/wallet/wallet-service';

export interface FakeProfile { streakDays: number; lastStreakAt: Date; lastActiveAt: Date }
export interface FakeEntry { key: string; playerId: string; delta: number; metadata: Record<string, unknown> }

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export function fakeDailyDrillDb(profiles: Record<string, FakeProfile>) {
  const ledger = new Map<string, FakeEntry>();
  const locks = new Map<string, Promise<void>>();
  const log: string[] = [];
  /** Each open transaction's lock releases, run when it ends. */
  const releases = new Map<Set<string>, (() => void)[]>();

  const matches = (row: Record<string, unknown>, where: Record<string, unknown>): boolean => {
    for (const [k, v] of Object.entries(where)) {
      if (k === 'userId') continue;
      const have = row[k];
      if (v && typeof v === 'object' && !(v instanceof Date) && 'lt' in (v as object)) {
        if (!(have instanceof Date) || !(have.getTime() < ((v as { lt: Date }).lt).getTime())) return false;
      } else if (v instanceof Date) {
        if (!(have instanceof Date) || have.getTime() !== v.getTime()) return false;
      } else if (have !== v) return false;
    }
    return true;
  };

  function client(undo: (() => void)[] | null, held: Set<string>) {
    return {
      async $queryRawUnsafe(sql: string, userId: string) {
        await tick();
        if (!/FOR UPDATE/.test(sql)) return [];
        if (held.has(userId)) return [{}];
        // wait for whoever holds the row, then hold it until this transaction ends
        while (locks.has(userId)) await locks.get(userId);
        let release!: () => void;
        locks.set(userId, new Promise<void>((r) => { release = r; }));
        held.add(userId);
        releases.get(held)!.push(() => { locks.delete(userId); release(); });
        log.push(`lock:${userId}`);
        return [{}];
      },
      playerProfile: {
        async updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }) {
          await tick();
          const id = a.where.userId as string;
          const row = profiles[id] as unknown as Record<string, unknown> | undefined;
          if (!row || !matches(row, a.where)) return { count: 0 };
          const before = { ...row };
          Object.assign(row, a.data);
          undo?.push(() => { Object.assign(row, before); });
          log.push(`streak:${id}:${Object.keys(a.data).join(',')}`);
          return { count: 1 };
        },
      },
      walletLedgerEntry: {
        async findUnique(a: { where: { idempotencyKey: string } }) {
          await tick();
          const e = ledger.get(a.where.idempotencyKey);
          return e ? { delta: BigInt(e.delta), metadata: e.metadata } : null;
        },
      },
    };
  }
  /** The wallet's mover, as far as the claim relies on it: a known key replays (or aborts with rejectReplay); a new
   *  key is inserted, and an insert of a key that exists throws like the unique index. */
  async function applyLc(tx: unknown, a: ApplyLcArgs): Promise<ApplyLcResult> {
    await tick();
    const t = tx as { __undo?: (() => void)[] };
    const prior = ledger.get(a.idempotencyKey);
    if (prior) {
      if (a.rejectReplay) throw new WalletError('REPLAYED_KEY', `lc movement already recorded: ${a.idempotencyKey}`);
      return { entryId: prior.key, delta: prior.delta, balanceAfter: 0, replayed: true };
    }
    await tick();
    if (ledger.has(a.idempotencyKey)) throw Object.assign(new Error('Unique constraint failed on idempotencyKey'), { code: 'P2002' });
    ledger.set(a.idempotencyKey, { key: a.idempotencyKey, playerId: a.playerId, delta: a.delta, metadata: a.metadata ?? {} });
    t.__undo?.push(() => { ledger.delete(a.idempotencyKey); });
    log.push(`lc:${a.idempotencyKey}:${a.delta}`);
    return { entryId: a.idempotencyKey, delta: a.delta, balanceAfter: a.delta, replayed: false };
  }

  const db = {
    ...client(null, new Set()),
    async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const undo: (() => void)[] = [];
      const held = new Set<string>();
      releases.set(held, []);
      const tx = Object.assign(client(undo, held), { __undo: undo });
      try {
        return await fn(tx);
      } catch (e) {
        for (const u of undo.reverse()) u();
        throw e;
      } finally {
        for (const r of releases.get(held)!) r();
        releases.delete(held);
      }
    },
  };
  return { db, ledger, profiles, log, applyLc };
}
