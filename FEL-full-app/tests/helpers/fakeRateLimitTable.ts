// Test-only (RATE-LIMIT-WIRE, 2026-10-16): the rate_limits table as lib/rate-limits/store.ts uses it, in memory.
//
// It answers exactly the two statements the store sends (HIT_SQL, SWEEP_SQL) with the semantics they have in Postgres:
// one row per bucket; a hit opens the window, counts into it, or — once the window has closed — opens the next one in the
// same row; the clock is the DATABASE's (`clock`), not the caller's. Any other statement throws, so a route that starts
// sending different SQL fails loudly here. lib/rate-limits/store.integration.test.ts runs the same statements on a real
// Postgres. `missing: true` answers as Postgres does before the pending SQL is applied (42P01 undefined_table).
import { HIT_SQL, SWEEP_SQL } from '@/lib/rate-limits/store';

export interface FakeRateLimitTable {
  rows: Map<string, { hits: number; resetAt: number }>;
  /** Every statement and its values, in order. */
  calls: Array<{ sql: string; values: unknown[] }>;
  /** The database's clock (ms). Tests move it forward. */
  clock: number;
  /** Answer as if the table did not exist yet. */
  missing: boolean;
  $queryRawUnsafe<T = unknown>(sql: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(sql: string, ...values: unknown[]): Promise<number>;
}

const undefinedTable = () =>
  Object.assign(new Error('relation "rate_limits" does not exist'), { name: 'PrismaClientKnownRequestError', code: 'P2010', meta: { code: '42P01' } });

export function fakeRateLimitTable(clock = Date.UTC(2026, 9, 16, 12, 0, 0)): FakeRateLimitTable {
  const t: FakeRateLimitTable = {
    rows: new Map(),
    calls: [],
    clock,
    missing: false,
    async $queryRawUnsafe<T>(sql: string, ...values: unknown[]): Promise<T> {
      t.calls.push({ sql, values });
      if (t.missing) throw undefinedTable();
      if (sql !== HIT_SQL) throw new Error(`fakeRateLimitTable: unexpected query ${sql.slice(0, 80)}`);
      const [bucket, windowMs] = values as [string, number];
      if (typeof bucket !== 'string' || !Number.isInteger(windowMs)) throw new Error('fakeRateLimitTable: bad values');
      const row = t.rows.get(bucket);
      if (!row || row.resetAt <= t.clock) t.rows.set(bucket, { hits: 1, resetAt: t.clock + windowMs });
      else row.hits += 1;
      const now = t.rows.get(bucket)!;
      return [{ hits: now.hits, retryAfterSec: Math.max(1, Math.ceil((now.resetAt - t.clock) / 1000)) }] as T;
    },
    async $executeRawUnsafe(sql: string, ...values: unknown[]): Promise<number> {
      t.calls.push({ sql, values });
      if (t.missing) throw undefinedTable();
      if (sql !== SWEEP_SQL) throw new Error(`fakeRateLimitTable: unexpected statement ${sql.slice(0, 80)}`);
      let n = 0;
      for (const [k, r] of t.rows) if (r.resetAt < t.clock - 60 * 60_000) { t.rows.delete(k); n += 1; }
      return n;
    },
  };
  return t;
}

/** The hit statements sent so far (the sweep left out). */
export function hitsSent(t: FakeRateLimitTable): Array<{ sql: string; values: unknown[] }> {
  return t.calls.filter((c) => c.sql === HIT_SQL);
}
