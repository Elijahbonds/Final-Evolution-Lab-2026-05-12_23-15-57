// The Postgres inquiry store before and after its pending SQL (prisma/pending/2026-10-13-creator-inquiry.sql): the
// information_schema probe, parameterised statements only, fail closed, and the retention delete.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  INQUIRY_RETENTION_DAYS,
  INSERT_SQL,
  PURGE_SQL,
  inquiriesReady,
  resetInquiryProbe,
  saveInquiry,
  type InquiryRecord,
  type RawDb,
} from './inquiryStore';
import { PROBE_TTL_MS } from '@/lib/coach/pendingSchema';

const RECORD: InquiryRecord = {
  brand: 'Acme Hoops', contactName: 'Sam Rivera', email: 'sam@acme.test', budgetRange: '5k-15k', dates: 'November',
  deliverables: 'Two reels', message: "Hello'; DROP TABLE \"User\"; --", profileSlug: 'elijah-bonds', source: 'team-profile',
};

type Exec = { sql: string; values: unknown[] };

function fakeDb(opts: { tableThere?: boolean; probeThrows?: boolean; insertError?: unknown; purgeThrows?: boolean } = {}) {
  const state = { tableThere: opts.tableThere ?? false };
  const queries: string[] = [];
  const executed: Exec[] = [];
  const db: RawDb = {
    async $queryRawUnsafe(sql: string) {
      queries.push(sql);
      if (opts.probeThrows) throw new Error('connection refused');
      return (state.tableThere ? [{ ok: 1 }] : []) as never;
    },
    async $executeRawUnsafe(sql: string, ...values: unknown[]) {
      executed.push({ sql, values });
      if (sql === INSERT_SQL && opts.insertError) throw opts.insertError;
      if (sql === PURGE_SQL && opts.purgeThrows) throw new Error('purge failed');
      return 1;
    },
  };
  return { db, state, queries, executed };
}

beforeEach(() => resetInquiryProbe());

describe('inquiry store before the table exists (fail closed)', () => {
  it('says unavailable and writes nothing when the table is not there', async () => {
    const f = fakeDb({ tableThere: false });
    expect(await saveInquiry(f.db, RECORD)).toEqual({ ok: false, reason: 'unavailable' });
    expect(f.executed).toEqual([]);
    expect(await inquiriesReady(f.db)).toBe(false);
  });

  it('says unavailable when the probe itself throws (database down), and never throws', async () => {
    const f = fakeDb({ probeThrows: true });
    await expect(saveInquiry(f.db, RECORD)).resolves.toEqual({ ok: false, reason: 'unavailable' });
    expect(f.executed).toEqual([]);
  });

  it('asks again after the TTL, so applying the SQL switches the form on with no deploy', async () => {
    const f = fakeDb({ tableThere: false });
    const t0 = 1_000_000;
    expect(await inquiriesReady(f.db, t0)).toBe(false);
    f.state.tableThere = true;
    expect(await inquiriesReady(f.db, t0 + 1000)).toBe(false); // still cached
    expect(await inquiriesReady(f.db, t0 + PROBE_TTL_MS + 1)).toBe(true);
    expect(f.queries.length).toBe(2);
  });

  it('a table that vanishes after a yes reads as unavailable, not as a lost 201', async () => {
    const f = fakeDb({ tableThere: true, insertError: { code: '42P01', message: 'relation "CreatorInquiry" does not exist' } });
    expect(await saveInquiry(f.db, RECORD)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('any other write error is a failure, not unavailable', async () => {
    const f = fakeDb({ tableThere: true, insertError: new Error('connection reset') });
    expect(await saveInquiry(f.db, RECORD)).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('inquiry store once the table exists', () => {
  it('inserts with parameters only: no request text is ever put into SQL', async () => {
    const f = fakeDb({ tableThere: true });
    const res = await saveInquiry(f.db, RECORD);
    expect(res.ok).toBe(true);
    const insert = f.executed.find((e) => e.sql === INSERT_SQL)!;
    expect(insert.values).toEqual([
      (res as { id: string }).id, RECORD.brand, RECORD.contactName, RECORD.email, RECORD.budgetRange, RECORD.dates,
      RECORD.deliverables, RECORD.message, RECORD.profileSlug, RECORD.source,
    ]);
    for (const e of f.executed) {
      expect(e.sql).not.toContain('DROP');
      expect(e.sql).not.toContain(RECORD.brand);
      expect(e.sql).not.toContain(RECORD.email);
    }
    // 10 placeholders, 10 values; the status is the literal 'NEW'.
    expect(INSERT_SQL.match(/\$\d+/g)).toHaveLength(10);
    expect(INSERT_SQL).toContain("'NEW'");
  });

  it('stores no IP address and no IP hash: there is no column or value for one', async () => {
    expect(INSERT_SQL).not.toMatch(/ip/i);
    expect(readFileSync('prisma/pending/2026-10-13-creator-inquiry.sql', 'utf8').replace(/^--.*$/gm, '')).not.toMatch(/"ip|ipHash/i);
  });

  it('deletes inquiries older than the retention period on every save, and a failed delete does not lose the save', async () => {
    const f = fakeDb({ tableThere: true });
    await saveInquiry(f.db, RECORD);
    const purge = f.executed.find((e) => e.sql === PURGE_SQL)!;
    expect(purge.values).toEqual([INQUIRY_RETENTION_DAYS]);
    expect(INQUIRY_RETENTION_DAYS).toBe(365);
    const g = fakeDb({ tableThere: true, purgeThrows: true });
    expect((await saveInquiry(g.db, RECORD)).ok).toBe(true);
  });
});

describe('the pending SQL file matches the code', () => {
  const sql = readFileSync('prisma/pending/2026-10-13-creator-inquiry.sql', 'utf8');
  const body = sql.replace(/^--.*$/gm, '');

  it('creates the table the code writes, with every column the INSERT names', () => {
    expect(body).toContain('CREATE TABLE "CreatorInquiry"');
    const cols = [...INSERT_SQL.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]).filter((c) => c !== 'CreatorInquiry');
    expect(cols.length).toBe(12);
    for (const c of cols) expect(body, c).toContain(`"${c}"`);
  });

  it('is additive only: no drop, alter or foreign key on an existing table, and no Prisma schema change', () => {
    expect(body).not.toMatch(/\bDROP\b|\bALTER\b|FOREIGN KEY|\bUPDATE\b|\bDELETE\b/i);
    expect(PURGE_SQL).toContain('"CreatorInquiry"');
  });
});
