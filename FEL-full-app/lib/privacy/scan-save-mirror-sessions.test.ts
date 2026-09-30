// TEEN-WRITE-BLOCK-2 (FE PM 23:05 PT), GAP 1 row 1b: POST /api/mirror/sessions keeps a session summary only for a verified
// 18+ account that has opted in; everyone else gets 403 and nothing is written. ADULTS ARE REFUSED TOO until
// PRIVACY-CORE/AB-04 adds the opt-in; the opted-in adult (the opt-in vi.mocked true) is the positive control. Run for real
// over the write-spy client; only the session and the database are stand-ins.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ session: null as unknown, prisma: null as any }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.prisma[p]) }) }));
vi.mock('@/lib/privacy/scanSaveOptIn', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/privacy/scanSaveOptIn')>();
  return { scanSaveOptIn: vi.fn(real.scanSaveOptIn) };
});

import { NextRequest } from 'next/server';
import { POST as sessionsPOST } from '@/app/api/mirror/sessions/route';
import { scanSaveOptIn } from '@/lib/privacy/scanSaveOptIn';
import { OPTED_IN_ADULT, REFUSED_SCAN_CASES, argsOf, callsOn, newSpyDb, spyPrisma, writesOf, type AgeCase, type SpyDb } from '@/tests/helpers/writeSpyDb';

const UID = 'athlete-mirror-1';
const optIn = vi.mocked(scanSaveOptIn);
const realOptIn = optIn.getMockImplementation()!;
const REFUSED = { status: 403, json: { error: 'scan_save_adults_only', saved: false } };
const SUMMARY = {
  patternId: 'splitStancePress', startedAtMs: 1_790_000_000_000, durationMs: 60_000, reps: 12, avgTempoMs: 2100, avgFrameMs: 33,
  timeInStableMs: { knee: 40_000 }, faultCounts: { knee: 2 }, checkValues: { 'hipHike:right': 0.12 },
};
let db: SpyDb;

/** The user as the case seeds them, plus one session already on file (so "unchanged" means something). */
function as(c: AgeCase, optedIn = false) {
  db = newSpyDb();
  c.seed(db, UID);
  db.tables.mirrorSession = [{ id: 'ms-old', userId: UID, patternId: 'splitStancePress', durationMs: 50_000, reps: 10, createdAt: new Date('2026-09-01T00:00:00Z') }];
  h.prisma = spyPrisma(db);
  optIn.mockImplementation(optedIn ? async () => true : realOptIn);
}
/** Every non-empty table as it stands (a read makes an empty one in the spy), to prove a refusal changed nothing. */
const snapshot = () => JSON.stringify(Object.fromEntries(Object.entries(db.tables).filter(([, rows]) => rows.length > 0)));
async function post(body: unknown) {
  const req = new NextRequest('http://fel.test/api/mirror/sessions', {
    method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json' },
  });
  const res = await sessionsPOST(req);
  return { status: res.status, json: await res.json() };
}
const CASES = REFUSED_SCAN_CASES.map((c) => [c.id, c] as const);
const ALL = [...REFUSED_SCAN_CASES, OPTED_IN_ADULT].map((c) => [c.id, c] as const);

beforeEach(() => { h.session = { user: { id: UID } }; });

describe('1b POST /api/mirror/sessions', () => {
  it.each(CASES)('%s → 403, zero mirrorSession writes, the table unchanged', async (_id, c) => {
    as(c);
    const before = snapshot();
    expect(await post(SUMMARY)).toEqual(REFUSED);
    expect(writesOf(db)).toEqual([]);
    expect(db.calls.map((x) => x.op)).toEqual(['user.findUnique']);
    expect(callsOn(db, 'guardianConsent')).toEqual([]);
    expect(snapshot()).toBe(before);
  });

  it('18+ OPTED IN (positive control): today\'s one row and today\'s answer', async () => {
    as(OPTED_IN_ADULT, true);
    const r = await post(SUMMARY);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ id: expect.any(String), saved: true });
    expect(writesOf(db)).toEqual(['mirrorSession.create']);
    expect(argsOf(db, 'mirrorSession.create')[0].data).toMatchObject({ userId: UID, patternId: 'splitStancePress', reps: 12 });
  });

  it.each(ALL)('%s: a bad body is still a 400 and a too-short session still skipped, before the age is read', async (_id, c) => {
    as(c, c === OPTED_IN_ADULT);
    expect(await post('{nope')).toEqual({ status: 400, json: { error: 'bad_json' } });
    expect((await post({ durationMs: 60_000 })).status).toBe(400);
    expect(await post({ ...SUMMARY, durationMs: 1000 })).toEqual({ status: 200, json: { skipped: 'too_short' } });
    expect(writesOf(db)).toEqual([]);
    expect(callsOn(db, 'user')).toEqual([]);
  });

  it('signed out: 401, and the gate reads nothing', async () => {
    as(REFUSED_SCAN_CASES.find((c) => c.id === '15')!);
    h.session = null;
    expect(await post(SUMMARY)).toEqual({ status: 401, json: { error: 'unauthorized' } });
    expect(db.calls).toEqual([]);
  });
});
