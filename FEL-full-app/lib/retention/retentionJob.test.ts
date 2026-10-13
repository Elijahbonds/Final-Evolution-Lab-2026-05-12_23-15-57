// The daily retention cleanup (owner, 2026-10-13): party reports and creator inquiries are deleted after 12 months.
// The route is secret-protected (503 with no secret configured, 401 wrong/missing, run on the right one), returns counts
// only, is a no-op when the tables are missing, and is idempotent. The 365-day cutoff and the constant-time compare are
// pinned so that a mutation of either fails here (see the mutation notes in the commit body).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DAY_MS, fakeRetentionDb, type FakeRetentionDb } from '../../tests/helpers/fakeRetentionDb';

const cryptoSpy = vi.hoisted(() => ({ calls: [] as { a: number; b: number }[] }));
vi.mock('node:crypto', async (importActual) => {
  const actual = await importActual<typeof import('node:crypto')>();
  return {
    ...actual,
    default: actual,
    timingSafeEqual: (a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView) => {
      cryptoSpy.calls.push({ a: a.byteLength, b: b.byteLength });
      return actual.timingSafeEqual(a, b);
    },
  };
});

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/lib/db', () => ({ get prisma() { return h.db; } }));

import { POST } from '@/app/api/cron/retention/route';
import { RETENTION_SECRET_HEADER, runRetentionCleanup, verifyRetentionSecret } from '@/lib/retention/retentionJob';
import { PARTY_REPORT_RETENTION_DAYS, PURGE_SQL as PARTY_PURGE_SQL, resetPartyReportProbe } from '@/lib/party/social/reports';
import { INQUIRY_RETENTION_DAYS, PURGE_SQL as INQUIRY_PURGE_SQL, resetInquiryProbe } from '@/lib/creator/inquiryStore';

const SECRET = 'correct-horse-battery-staple-retention';
const NOW = Date.UTC(2026, 9, 14, 3, 17, 0);
let db: FakeRetentionDb;
let savedSecret: string | undefined;

function call(headers: Record<string, string> = {}) {
  return POST(new NextRequest('http://localhost/api/cron/retention', { method: 'POST', headers }));
}
const authed = () => call({ [RETENTION_SECRET_HEADER]: SECRET });

beforeEach(() => {
  savedSecret = process.env.RETENTION_CRON_SECRET;
  process.env.RETENTION_CRON_SECRET = SECRET;
  resetPartyReportProbe();
  resetInquiryProbe();
  cryptoSpy.calls.length = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  db = fakeRetentionDb({ now: NOW, partyReportAges: [10, 364, 366, 800], inquiryAges: [1, 364.5, 366, 2000] });
  h.db = db;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  if (savedSecret === undefined) delete process.env.RETENTION_CRON_SECRET;
  else process.env.RETENTION_CRON_SECRET = savedSecret;
  vi.restoreAllMocks();
});

describe('POST /api/cron/retention: the secret (fail closed)', () => {
  it('no secret configured -> 503, nothing runs, even with a header', async () => {
    delete process.env.RETENTION_CRON_SECRET;
    for (const headers of [{}, { [RETENTION_SECRET_HEADER]: SECRET }, { [RETENTION_SECRET_HEADER]: '' }]) {
      const res = await call(headers);
      expect(res.status).toBe(503);
    }
    expect(db.executed).toEqual([]);
  });

  it('an empty configured secret is "not configured" too (503), and an empty header never matches it', async () => {
    process.env.RETENTION_CRON_SECRET = '';
    expect((await call({ [RETENTION_SECRET_HEADER]: '' })).status).toBe(503);
    expect(db.executed).toEqual([]);
  });

  it('missing header -> 401, nothing runs', async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(db.executed).toEqual([]);
  });

  it.each(['wrong', SECRET + 'x', SECRET.slice(0, -1), SECRET.toUpperCase()])('wrong secret %j -> 401, nothing runs', async (bad) => {
    const res = await call({ [RETENTION_SECRET_HEADER]: bad });
    expect(res.status).toBe(401);
    expect(db.executed).toEqual([]);
    expect(db.rows.PartyReport).toHaveLength(4);
  });

  it('a session cookie or bearer token is not a secret: only the header counts', async () => {
    const res = await call({ authorization: `Bearer ${SECRET}`, cookie: 'next-auth.session-token=abc' });
    expect(res.status).toBe(401);
  });
});

describe('verifyRetentionSecret is a constant-time compare', () => {
  it('uses timingSafeEqual on equal-length digests, whatever the lengths presented (a plain === would skip it)', () => {
    expect(verifyRetentionSecret(SECRET, SECRET)).toBe(true);
    expect(cryptoSpy.calls.length).toBe(1);
    expect(verifyRetentionSecret('x', SECRET)).toBe(false);
    expect(verifyRetentionSecret(SECRET + SECRET + SECRET, SECRET)).toBe(false);
    expect(cryptoSpy.calls.length).toBe(3);
    for (const c of cryptoSpy.calls) {
      expect(c.a).toBe(c.b);   // never compares unequal lengths (that would throw, or leak)
      expect(c.a).toBe(32);    // sha-256 digests
    }
  });

  it('empty / missing / non-string presented or secret never matches', () => {
    expect(verifyRetentionSecret('', '')).toBe(false);
    expect(verifyRetentionSecret(null, SECRET)).toBe(false);
    expect(verifyRetentionSecret(undefined, SECRET)).toBe(false);
    expect(verifyRetentionSecret(SECRET, undefined)).toBe(false);
    expect(verifyRetentionSecret(SECRET, '')).toBe(false);
    expect(verifyRetentionSecret(123 as unknown as string, SECRET)).toBe(false);
  });
});

describe('POST /api/cron/retention: the right secret runs both purges', () => {
  it('deletes what is past 12 months in both tables, keeps the rest, and answers counts only', async () => {
    const res = await authed();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const json = await res.json();
    expect(json).toEqual({
      ok: true,
      partyReportsDeleted: 2,
      creatorInquiriesDeleted: 2,
      partyReports: 'purged',
      creatorInquiries: 'purged',
    });
    // both purges ran, with the real statements
    expect(db.executed.map((e) => e.sql).sort()).toEqual([INQUIRY_PURGE_SQL, PARTY_PURGE_SQL].sort());
    // survivors: 364 days and younger
    expect(db.rows.PartyReport.map((r) => r.id)).toEqual(['r-0', 'r-1']);
    expect(db.rows.CreatorInquiry.map((r) => r.id)).toEqual(['q-0', 'q-1']);
  });

  it('never returns row contents: only numbers and fixed state words', async () => {
    const json = await (await authed()).json();
    expect(Object.keys(json).sort()).toEqual(['creatorInquiries', 'creatorInquiriesDeleted', 'ok', 'partyReports', 'partyReportsDeleted']);
    expect(JSON.stringify(json)).not.toMatch(/r-\d|q-\d|@|PartyReport|CreatorInquiry/);
  });

  it('is idempotent: a second run deletes nothing more', async () => {
    await authed();
    const again = await (await authed()).json();
    expect(again).toMatchObject({ ok: true, partyReportsDeleted: 0, creatorInquiriesDeleted: 0 });
    expect(db.rows.PartyReport).toHaveLength(2);
  });
});

describe('the 12-month cutoff is 365 days', () => {
  it('both retention constants are 365 and are what the purges are called with', async () => {
    expect(PARTY_REPORT_RETENTION_DAYS).toBe(365);
    expect(INQUIRY_RETENTION_DAYS).toBe(365);
    await authed();
    expect(db.executed.map((e) => e.params)).toEqual([[365], [365]]);
  });

  it('a row 364 days old stays; a row 366 days old goes (a 30- or 400-day cutoff changes the survivors)', async () => {
    const edge = fakeRetentionDb({ now: NOW, partyReportAges: [364, 366], inquiryAges: [364, 366] });
    h.db = edge;
    await authed();
    expect(edge.rows.PartyReport.map((r) => Math.round((NOW - r.createdAt) / DAY_MS))).toEqual([364]);
    expect(edge.rows.CreatorInquiry.map((r) => Math.round((NOW - r.createdAt) / DAY_MS))).toEqual([364]);
  });
});

describe('missing tables: a no-op with zero counts', () => {
  it('neither table exists -> 200, zero counts, no DELETE issued', async () => {
    const none = fakeRetentionDb({ now: NOW, partyReportAges: [900], inquiryAges: [900], present: [] });
    h.db = none;
    const res = await authed();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true, partyReportsDeleted: 0, creatorInquiriesDeleted: 0, partyReports: 'unavailable', creatorInquiries: 'unavailable',
    });
    expect(none.executed).toEqual([]);
  });

  it('one table missing: the other still purges', async () => {
    const some = fakeRetentionDb({ now: NOW, partyReportAges: [900], inquiryAges: [900], present: ['CreatorInquiry'] });
    h.db = some;
    const json = await (await authed()).json();
    expect(json).toEqual({
      ok: true, partyReportsDeleted: 0, creatorInquiriesDeleted: 1, partyReports: 'unavailable', creatorInquiries: 'purged',
    });
  });

  it('a table dropped between the probe and the delete reads as unavailable, not as an error', async () => {
    const flaky = fakeRetentionDb({ now: NOW, partyReportAges: [900], inquiryAges: [] });
    const realQuery = flaky.$queryRawUnsafe.bind(flaky);
    flaky.$queryRawUnsafe = (async (sql: string, ...v: unknown[]) => {
      const r = await realQuery(sql, ...v);
      flaky.present.delete('PartyReport');   // gone right after the probe said yes
      return r;
    }) as typeof flaky.$queryRawUnsafe;
    h.db = flaky;
    const res = await authed();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, partyReports: 'unavailable', partyReportsDeleted: 0 });
  });
});

describe('a real database error', () => {
  it('500 { ok: false } with counts only; the other purge still ran', async () => {
    db.breakDelete.add('PartyReport');
    const res = await authed();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toEqual({
      ok: false, partyReportsDeleted: 0, creatorInquiriesDeleted: 2, partyReports: 'failed', creatorInquiries: 'purged',
    });
    expect(JSON.stringify(json)).not.toMatch(/connection|08006/);
  });

  it('runRetentionCleanup never throws', async () => {
    const boom = { $queryRawUnsafe: async () => { throw new Error('down'); }, $executeRawUnsafe: async () => { throw new Error('down'); } };
    const s = await runRetentionCleanup(boom as never, NOW);
    expect(s).toMatchObject({ ok: true, partyReports: 'unavailable', creatorInquiries: 'unavailable' });
  });
});
