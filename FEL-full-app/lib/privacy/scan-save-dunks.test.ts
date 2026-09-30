// TEEN-WRITE-BLOCK (2026-09-29), GAP 1 row 1c: POST /api/mirror/dunks keeps a measured jump ONLY for a verified 18+
// account that has opted in. Run for real over the write-spy client (lib/privacy/fixtures/writeSpyDb.ts); only the
// session and the database are stand-ins.
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
import { GET, POST } from '@/app/api/mirror/dunks/route';
import { scanSaveOptIn } from '@/lib/privacy/scanSaveOptIn';
import { OPTED_IN_ADULT, REFUSED_SCAN_CASES, argsOf, newSpyDb, spyPrisma, writesOf, type AgeCase, type SpyDb } from '@/tests/helpers/writeSpyDb';

const UID = 'athlete-dunk-1';
const optIn = vi.mocked(scanSaveOptIn);
const realOptIn = optIn.getMockImplementation()!;
const JUMP = { verticalCm: 61.2, flightTimeMs: 705, family: 'WINDMILL', difficulty: 3, made: true };
let db: SpyDb;

function as(c: AgeCase, optedIn = false) {
  db = newSpyDb();
  c.seed(db, UID);
  h.prisma = spyPrisma(db);
  optIn.mockImplementation(optedIn ? async () => true : realOptIn);
}
async function post(body: unknown) {
  const req = new NextRequest('http://fel.test/api/mirror/dunks', {
    method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json' },
  });
  const res = await POST(req);
  return { status: res.status, json: await res.json() };
}

beforeEach(() => { h.session = { user: { id: UID } }; });

describe('POST /api/mirror/dunks — refused for everyone but a verified, opted-in adult', () => {
  it.each(REFUSED_SCAN_CASES.map((c) => [c.id, c] as const))('%s → 403 scan_save_adults_only, zero writes', async (_id, c) => {
    as(c);
    const r = await post(JUMP);
    expect(r).toEqual({ status: 403, json: { error: 'scan_save_adults_only', saved: false } });
    expect(writesOf(db)).toEqual([]);
    // refused before the history read too: the one call is the gate's own user read
    expect(db.calls.map((x) => x.op)).toEqual(['user.findUnique']);
  });

  it('18+ OPTED IN (positive control): exactly today\'s one write and today\'s answer', async () => {
    as(OPTED_IN_ADULT, true);
    const r = await post(JUMP);
    expect(r.status).toBe(200);
    expect(Object.keys(r.json)).toEqual(['progress']);
    expect(writesOf(db)).toEqual(['workoutScan.create']);
    expect(argsOf(db, 'workoutScan.create')).toEqual([{
      data: { userId: UID, kind: 'dunk', metrics: { verticalCm: 61.2, flightTimeMs: 705, family: 'WINDMILL', difficulty: 3, made: true } },
    }]);
    expect(r.json.progress).toBeTruthy();
  });

  it.each([...REFUSED_SCAN_CASES, OPTED_IN_ADULT].map((c) => [c.id, c] as const))('%s: a bad body still gets its 400, and nothing is written', async (_id, c) => {
    as(c, c === OPTED_IN_ADULT);
    expect((await post('{not json')).json).toEqual({ error: 'invalid_json' });
    expect(await post({ ...JUMP, verticalCm: 300 })).toEqual({ status: 400, json: { error: 'implausible_vertical' } });
    expect(await post({ ...JUMP, flightTimeMs: 0 })).toEqual({ status: 400, json: { error: 'implausible_flight' } });
    expect(writesOf(db)).toEqual([]);
  });

  it('401 stays 401, before the gate reads anything', async () => {
    as(OPTED_IN_ADULT, true);
    h.session = null;
    expect((await post(JUMP)).status).toBe(401);
    expect(db.calls).toEqual([]);
  });
});

describe('GET /api/mirror/dunks is a read and is unchanged', () => {
  it('a 15-year-old still reads back the history already on file', async () => {
    as(REFUSED_SCAN_CASES.find((c) => c.id === '15')!);
    db.tables.workoutScan = [{ id: 'w1', userId: UID, kind: 'dunk', metrics: { verticalCm: 40, flightTimeMs: 570, family: 'ATTEMPT' }, createdAt: new Date('2026-09-01T00:00:00Z') }];
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).attempts).toHaveLength(1);
    expect(writesOf(db)).toEqual([]);
  });
});
