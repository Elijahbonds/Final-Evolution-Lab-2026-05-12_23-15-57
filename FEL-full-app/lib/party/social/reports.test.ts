// PARTY-PRIVACY (2026-10-13; owner: party reports are kept 12 months, then deleted automatically).
// Same shape as the creator inquiries' retention (lib/creator/inquiryStore.test.ts): the delete runs after every saved
// report, with the retention constant as its only parameter, and it is a no-op while the table does not exist.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PARTY_REPORT_RETENTION_DAYS,
  PURGE_SQL,
  purgeExpiredPartyReports,
  resetPartyReportProbe,
  storePartyReport,
} from './reports';
import type { RawDb } from '@/lib/coach/pendingSchema';

const SLIP = { reporterUid: 'uid-me', reportedUid: 'uid-bad', reportedName: 'BO', code: 'ABC234', reason: 'harassment', at: 1_700_000_000_000 };

function fakeDb(opts: { tableThere: boolean; failPurge?: boolean; failInsert?: boolean }) {
  const executed: Array<{ sql: string; values: unknown[] }> = [];
  const db: RawDb = {
    $queryRawUnsafe: (async () => (opts.tableThere ? [{ ok: 1 }] : [])) as RawDb['$queryRawUnsafe'],
    $executeRawUnsafe: async (sql: string, ...values: unknown[]) => {
      executed.push({ sql, values });
      if (opts.failInsert && sql.startsWith('INSERT')) throw new Error('insert failed');
      if (opts.failPurge && sql.startsWith('DELETE')) throw new Error('purge failed');
      return 1;
    },
  };
  return { db, executed };
}

beforeEach(() => {
  resetPartyReportProbe();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('party report retention', () => {
  it('is 365 days (12 months), deleting by createdAt with the constant as the only parameter', () => {
    expect(PARTY_REPORT_RETENTION_DAYS).toBe(365);
    expect(PURGE_SQL).toContain('DELETE FROM "PartyReport"');
    expect(PURGE_SQL).toContain('"createdAt" <');
    expect(PURGE_SQL).toContain('make_interval(days => $1::int)');
    expect(PURGE_SQL).not.toMatch(/\d{3}/); // no number baked into the statement: the constant is the one place
  });

  it('a saved report is followed by the purge, with 365 as its parameter', async () => {
    const { db, executed } = fakeDb({ tableThere: true });
    expect(await storePartyReport(db, SLIP)).toBe('stored');
    expect(executed).toHaveLength(2);
    expect(executed[0].sql.startsWith('INSERT INTO "PartyReport"')).toBe(true);
    expect(executed[1]).toEqual({ sql: PURGE_SQL, values: [365] });
  });

  it('a failed purge never fails the save (best effort)', async () => {
    const { db } = fakeDb({ tableThere: true, failPurge: true });
    expect(await storePartyReport(db, SLIP)).toBe('stored');
  });

  it('no table yet: the purge is a no-op that runs no DELETE and does not throw', async () => {
    const { db, executed } = fakeDb({ tableThere: false });
    expect(await purgeExpiredPartyReports(db)).toBe(false);
    expect(executed).toEqual([]);
    expect(await storePartyReport(db, SLIP)).toBe('not_available');
    expect(executed).toEqual([]);
  });

  it('with the table there, purgeExpiredPartyReports on its own runs the delete', async () => {
    const { db, executed } = fakeDb({ tableThere: true });
    expect(await purgeExpiredPartyReports(db)).toBe(true);
    expect(executed).toEqual([{ sql: PURGE_SQL, values: [365] }]);
  });

  it('a failed insert does not purge (nothing was saved)', async () => {
    const { db, executed } = fakeDb({ tableThere: true, failInsert: true });
    expect(await storePartyReport(db, SLIP)).toBe('failed');
    expect(executed.some((e) => e.sql.startsWith('DELETE'))).toBe(false);
  });

  it('the pending SQL states the same period and indexes createdAt (so no column or index was added)', () => {
    const sql = readFileSync('prisma/pending/2026-10-13-party-report.sql', 'utf8');
    expect(sql).toContain('make_interval(days => 365)');
    expect(sql).toContain('CREATE INDEX "PartyReport_createdAt_idx" ON "PartyReport"("createdAt")');
    expect(sql).not.toContain('nothing deletes them automatically');
  });
});
