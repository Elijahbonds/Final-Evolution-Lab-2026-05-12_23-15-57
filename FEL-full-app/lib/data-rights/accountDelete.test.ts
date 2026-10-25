// ACCOUNT-DELETE: the one account erase (./accountDelete.ts) that the in-app route and the operator's script share.
// The stand-in models just enough: the User row (locked, then made a placeholder), the CreditLedger event rows, the
// wallet. What every registry statement does to real rows is ./accountErase.integration.test.ts's job.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ERASE_EVENT_DEDUPE_KEY, ERASE_TX_OPTIONS, NoSuchAccountError, eraseAccountNow, eraseAuditLine, txRunner, type EraseTx, type TxRunner,
} from './accountDelete';
import { tombstoneEmail, isTombstoneEmail } from './tombstone';
import { TOMBSTONE } from './rights';

type Ledger = { userId: string; dedupeKey: string; amount: number; reason: string; balanceAfter: number };

function world(users: Record<string, string> = { u1: 'ada@fel.test', u2: 'bea@fel.test' }) {
  const state = { users: new Map(Object.entries(users)), ledger: [] as Ledger[], sql: [] as string[], locks: [] as string[] };
  const tx: EraseTx = {
    async $queryRawUnsafe<T>(sql: string, ...args: unknown[]): Promise<T> {
      state.sql.push(sql);
      if (sql.includes('information_schema.columns')) {
        const userCols = ['id', ...Object.keys(TOMBSTONE)];
        return [...userCols.map((c) => ({ table_name: 'User', column_name: c })),
          ...['id', 'userId', 'dedupeKey'].map((c) => ({ table_name: 'CreditLedger', column_name: c })),
          ...['id', 'playerId', 'lc'].map((c) => ({ table_name: 'Wallet', column_name: c }))] as T;
      }
      if (sql.includes('FOR UPDATE')) {
        state.locks.push(String(args[0]));
        const e = state.users.get(String(args[0]));
        return (e === undefined ? [] : [{ email: e }]) as T;
      }
      if (sql.includes('FROM "CreditLedger" WHERE "userId" = $1 AND "dedupeKey" = $2')) {
        return state.ledger.filter((l) => l.userId === args[0] && l.dedupeKey === args[1]).map(() => ({ '?column?': 1 })) as T;
      }
      if (sql.includes('SELECT "lc" FROM "Wallet"')) return [{ lc: BigInt(40) }] as T;
      if (sql.startsWith('SELECT count(*)')) return [{ n: 1 }] as T;
      return [] as T;
    },
    async $executeRawUnsafe(sql: string, ...args: unknown[]) {
      state.sql.push(sql);
      if (sql.startsWith('UPDATE "User"')) {
        const id = String(args[0]);
        if (state.users.has(id)) state.users.set(id, tombstoneEmail(id));
        return 1;
      }
      return 0;
    },
    creditLedger: {
      async create({ data }) {
        if (state.ledger.some((l) => l.userId === data.userId && l.dedupeKey === data.dedupeKey)) throw new Error('unique violation');
        state.ledger.push(data);
        return data;
      },
    },
  };
  // one transaction at a time, like the row lock makes two erases of one account
  let chain: Promise<unknown> = Promise.resolve();
  const runs = { n: 0 };
  const run: TxRunner = <T,>(fn: (t: EraseTx) => Promise<T>) => {
    runs.n += 1;
    const p = chain.then(() => fn(tx));
    chain = p.catch(() => undefined);
    return p;
  };
  return { state, run, runs };
}

describe('eraseAccountNow — the shared account erase', () => {
  it('locks the account row first, in one transaction, then leaves a placeholder', async () => {
    const w = world();
    const o = await eraseAccountNow(w.run, 'u1', 'in-app');
    expect(w.runs.n).toBe(1);
    expect(w.state.sql[0]).toBe('SELECT "email" FROM "User" WHERE "id" = $1 FOR UPDATE');
    expect(w.state.locks).toEqual(['u1']);
    expect(isTombstoneEmail('u1', w.state.users.get('u1'))).toBe(true);
    expect(w.state.users.get('u2')).toBe('bea@fel.test');
    expect(o.alreadyErased).toBe(false);
    expect(o.source).toBe('in-app');
  });

  it('records ONE audit event: amount 0, counts and source only — no email, no name', async () => {
    const w = world();
    await eraseAccountNow(w.run, 'u1', 'in-app');
    expect(w.state.ledger).toHaveLength(1);
    const e = w.state.ledger[0];
    expect(e).toMatchObject({ userId: 'u1', amount: 0, dedupeKey: ERASE_EVENT_DEDUPE_KEY, balanceAfter: 40 });
    expect(e.reason).toMatch(/^Account erasure: \d+ rows deleted, \d+ rows anonymised, \d+ rows kept under retention rules \(in-app\)$/);
    expect(e.reason).not.toContain('ada');
    expect(e.reason).not.toContain('@');
  });

  it('a retry is idempotent: it sweeps again, says alreadyErased, and records no second event', async () => {
    const w = world();
    await eraseAccountNow(w.run, 'u1', 'in-app');
    const again = await eraseAccountNow(w.run, 'u1', 'in-app');
    expect(again.alreadyErased).toBe(true);
    expect(w.state.ledger).toHaveLength(1);
    expect(again.erasure.lines.length).toBeGreaterThan(0);   // the sweep ran
  });

  it('two at once (a double tap): queued on the lock, one event, the second reads as a retry', async () => {
    const w = world();
    const [a, b] = await Promise.all([eraseAccountNow(w.run, 'u1', 'in-app'), eraseAccountNow(w.run, 'u1', 'in-app')]);
    expect([a.alreadyErased, b.alreadyErased].sort()).toEqual([false, true]);
    expect(w.state.ledger).toHaveLength(1);
  });

  it('the operator and the app share the event: an operator erase after an in-app one records nothing new', async () => {
    const w = world();
    await eraseAccountNow(w.run, 'u1', 'in-app');
    const op = await eraseAccountNow(w.run, 'u1', 'operator');
    expect(op.alreadyErased).toBe(true);
    expect(w.state.ledger).toHaveLength(1);
  });

  it('no such account: throws, and writes nothing', async () => {
    const w = world();
    await expect(eraseAccountNow(w.run, 'nobody', 'in-app')).rejects.toBeInstanceOf(NoSuchAccountError);
    expect(w.state.ledger).toEqual([]);
    expect(w.state.sql.some((s) => s.startsWith('DELETE') || s.startsWith('UPDATE'))).toBe(false);
  });

  it('the audit log line carries no id', async () => {
    const w = world();
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const o = await eraseAccountNow(w.run, 'u1', 'in-app');
    expect(log).toHaveBeenCalledWith(eraseAuditLine(o));
    expect(String(log.mock.calls[0][0])).not.toContain('u1');
    expect(String(log.mock.calls[0][0])).toContain('source=in-app');
    log.mockRestore();
  });

  it('txRunner runs the function in ONE prisma.$transaction with the erase limits', async () => {
    const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>, opts: unknown) => { void opts; return fn('TX'); });
    const out = await txRunner({ $transaction })(async (tx) => `ran on ${String(tx)}`);
    expect(out).toBe('ran on TX');
    expect($transaction).toHaveBeenCalledTimes(1);
    expect($transaction.mock.calls[0][1]).toEqual(ERASE_TX_OPTIONS);
  });
});

describe('the placeholder mark', () => {
  it('the SQL the erase writes and the check the session reads agree', () => {
    expect(TOMBSTONE.email).toBe(`'erased-' || "id" || '@erased.invalid'`);
    expect(tombstoneEmail('abc')).toBe('erased-abc@erased.invalid');
  });

  it('an ordinary account on the same domain is not a placeholder; only its own id matches', () => {
    expect(isTombstoneEmail('u1', 'someone@erased.invalid')).toBe(false);
    expect(isTombstoneEmail('u1', tombstoneEmail('u2'))).toBe(false);
    expect(isTombstoneEmail('u1', null)).toBe(false);
    expect(isTombstoneEmail('u1', tombstoneEmail('u1').toUpperCase())).toBe(true);
  });
});

describe('one erase, two callers (static)', () => {
  const root = join(__dirname, '../..');
  it('the operator script and the in-app route both call eraseAccountNow, and neither runs eraseAccount itself', () => {
    for (const f of ['scripts/erase-account.ts', 'app/api/account/delete/route.ts']) {
      const src = readFileSync(join(root, f), 'utf8');
      expect(src, f).toMatch(/import \{[^}]*\beraseAccountNow\b[^}]*\} from '@\/lib\/data-rights\/accountDelete'/);
      expect(src, f).toMatch(/eraseAccountNow\(txRunner\(/);
      expect(src, f).not.toMatch(/\beraseAccount\(/);
    }
  });
});
