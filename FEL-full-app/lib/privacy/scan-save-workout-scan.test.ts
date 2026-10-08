// TEEN-WRITE-BLOCK-2 (FE PM 23:05 PT), GAP 1 row 1e: POST /api/v1/workout/scan keeps a scan only for a verified 18+
// account that has opted in. ADULTS ARE REFUSED TOO until PRIVACY-CORE/AB-04 adds the opt-in (lib/privacy/scanSaveOptIn
// answers false for everyone), so today nobody's scan is saved; the opted-in adult (the opt-in vi.mocked true) is the
// positive control. GET (a read) and DELETE (the user's own erase) are unchanged. Run for real over the write-spy client.
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
import { DELETE as scanDELETE, GET as scanGET, POST as scanPOST } from '@/app/api/v1/workout/scan/route';
import { scanSaveOptIn } from '@/lib/privacy/scanSaveOptIn';
import { OPTED_IN_ADULT, REFUSED_SCAN_CASES, argsOf, callsOn, newSpyDb, spyPrisma, writesOf, type AgeCase, type SpyDb } from '@/tests/helpers/writeSpyDb';

const UID = 'athlete-scan-1';
const optIn = vi.mocked(scanSaveOptIn);
const realOptIn = optIn.getMockImplementation()!;
const REFUSED = { status: 403, json: { error: 'scan_save_adults_only', saved: false } };
let db: SpyDb;

/** The user as the case seeds them, plus one scan already on file (so "unchanged" means something). */
function as(c: AgeCase, optedIn = false) {
  db = newSpyDb();
  c.seed(db, UID);
  db.tables.workoutScan = [{ id: 'w-old', userId: UID, kind: 'movement_screen', metrics: { depth: 0.5 }, createdAt: new Date('2026-09-01T00:00:00Z') }];
  h.prisma = spyPrisma(db);
  optIn.mockImplementation(optedIn ? async () => true : realOptIn);
}
/** Every non-empty table as it stands (a read makes an empty one in the spy), to prove a refusal changed nothing. */
const snapshot = () => JSON.stringify(Object.fromEntries(Object.entries(db.tables).filter(([, rows]) => rows.length > 0)));
async function post(body: unknown) {
  const req = new NextRequest('http://fel.test/api/v1/workout/scan', {
    method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json' },
  });
  const res = await scanPOST(req);
  return { status: res.status, json: await res.json() };
}
const CASES = REFUSED_SCAN_CASES.map((c) => [c.id, c] as const);
const ALL = [...REFUSED_SCAN_CASES, OPTED_IN_ADULT].map((c) => [c.id, c] as const);
const by = (id: string) => REFUSED_SCAN_CASES.find((c) => c.id === id)!;

beforeEach(() => { h.session = { user: { id: UID } }; });

describe('1e POST /api/v1/workout/scan', () => {
  it('control: the refused cases include unknown, 15, 17 with an accepted GuardianConsent, and the 1990 adult NOT opted in', () => {
    for (const id of ['unknown age (dobYear null)', '15', '17 with an accepted GuardianConsent', '18+ not opted in (1990)']) expect(by(id), id).toBeTruthy();
  });

  it.each(CASES)('%s → 403, zero workoutScan writes, the table unchanged', async (_id, c) => {
    as(c);
    const before = snapshot();
    expect(await post({ kind: 'movement_screen', metrics: {} })).toEqual(REFUSED);
    expect(await post({ metrics: {} })).toEqual(REFUSED);   // no kind at all is the same save
    expect(writesOf(db)).toEqual([]);
    expect(callsOn(db, 'guardianConsent')).toEqual([]);
    expect(snapshot()).toBe(before);
  });

  it('the 1990 adult NOT opted in is refused too: adults wait for PRIVACY-CORE/AB-04\'s opt-in', async () => {
    as(by('18+ not opted in (1990)'));
    expect(await post({ kind: 'movement_screen', metrics: {} })).toEqual(REFUSED);
    expect(optIn).toHaveBeenLastCalledWith(expect.anything(), UID);
    expect(writesOf(db)).toEqual([]);
  });

  it('18+ OPTED IN (positive control): exactly one workoutScan.create and today\'s answer', async () => {
    as(OPTED_IN_ADULT, true);
    const r = await post({ kind: 'movement_screen', metrics: {} });
    expect(r.status).toBe(200);
    expect(Object.keys(r.json).sort()).toEqual(['analysis', 'avatarSpec', 'scanId']);
    expect(writesOf(db)).toEqual(['workoutScan.create']);
    expect(argsOf(db, 'workoutScan.create')[0].data).toMatchObject({ userId: UID, kind: 'movement_screen' });
  });

  it.each(ALL)('%s: a kind the route does not own is still a 400, before the age is read', async (_id, c) => {
    as(c, c === OPTED_IN_ADULT);
    expect(await post({ kind: 'mirror_screen', metrics: {} })).toEqual({ status: 400, json: { error: 'kind_not_allowed' } });
    expect(writesOf(db)).toEqual([]);
    expect(callsOn(db, 'user')).toEqual([]);
  });

  it('signed out: 401, and the gate reads nothing', async () => {
    as(by('15'));
    h.session = null;
    expect(await post({ kind: 'movement_screen', metrics: {} })).toEqual({ status: 401, json: { error: 'unauthorized' } });
    expect(db.calls).toEqual([]);
  });
});

describe('GET and DELETE are unchanged', () => {
  it('GET is a read: a 15-year-old still sees the scans on file (REACH-FREEZE reads it)', async () => {
    as(by('15'));
    const res = await scanGET();
    expect(res.status).toBe(200);
    expect((await res.json()).scans).toHaveLength(1);
    expect(writesOf(db)).toEqual([]);
  });

  it('DELETE is the user\'s own erase: a 15-year-old can still clear their scans and plans', async () => {
    as(by('15'));
    db.tables.workoutPlan = [{ id: 'p1', userId: UID }];
    const res = await scanDELETE();
    expect(res.status).toBe(200);
    expect(db.tables.workoutScan).toEqual([]);
    expect(db.tables.workoutPlan).toEqual([]);
  });
});
