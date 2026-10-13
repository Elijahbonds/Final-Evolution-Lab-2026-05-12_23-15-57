// Test-only: an in-memory stand-in for the two retention tables behind the RawDb seam (lib/coach/pendingSchema.ts).
// It reads the DAYS parameter the code passes ($1) and deletes rows older than that, so a wrong cutoff changes what is
// left. It never sees real SQL semantics beyond that, which is the point: the number is what the tests pin.
import type { RawDb } from '@/lib/coach/pendingSchema';

export const DAY_MS = 86_400_000;
export type RetentionTable = 'PartyReport' | 'CreatorInquiry';

export interface FakeRetentionDb extends RawDb {
  rows: Record<RetentionTable, { id: string; createdAt: number }[]>;
  /** Every statement text passed to $executeRawUnsafe, with its parameters. */
  executed: { sql: string; params: unknown[] }[];
  /** Tables that exist (the pending SQL applied). */
  present: Set<RetentionTable>;
  /** Tables whose DELETE throws a non-schema error. */
  breakDelete: Set<RetentionTable>;
}

/** `ages` are row ages in days at `now`. */
export function fakeRetentionDb(opts: {
  now: number;
  partyReportAges?: number[];
  inquiryAges?: number[];
  present?: RetentionTable[];
}): FakeRetentionDb {
  const mk = (ages: number[] = [], p: string) => ages.map((d, i) => ({ id: `${p}-${i}`, createdAt: opts.now - d * DAY_MS }));
  const db: FakeRetentionDb = {
    rows: { PartyReport: mk(opts.partyReportAges, 'r'), CreatorInquiry: mk(opts.inquiryAges, 'q') },
    executed: [],
    present: new Set(opts.present ?? ['PartyReport', 'CreatorInquiry']),
    breakDelete: new Set(),
    async $queryRawUnsafe(sql: string) {
      const t = (['PartyReport', 'CreatorInquiry'] as const).find((n) => sql.includes(`table_name = '${n}'`));
      return (t && db.present.has(t) ? [{ ok: 1 }] : []) as never;
    },
    async $executeRawUnsafe(sql: string, ...params: unknown[]) {
      db.executed.push({ sql, params });
      const t = (['PartyReport', 'CreatorInquiry'] as const).find((n) => sql.startsWith(`DELETE FROM "${n}"`));
      if (!t) throw new Error('unexpected statement');
      if (!db.present.has(t)) throw Object.assign(new Error(`relation "${t}" does not exist`), { code: '42P01' });
      if (db.breakDelete.has(t)) throw Object.assign(new Error('connection reset'), { code: '08006' });
      const cutoff = opts.now - Number(params[0]) * DAY_MS;
      const before = db.rows[t].length;
      db.rows[t] = db.rows[t].filter((r) => r.createdAt >= cutoff);
      return before - db.rows[t].length;
    },
  };
  return db;
}
