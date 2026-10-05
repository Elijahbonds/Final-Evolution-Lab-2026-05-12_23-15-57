// TEEN-WRITE-BLOCK-2 (FE PM 23:05 PT), GAP 1 row 1d: POST /api/mirror/assessment saves a Quick Screen (its WorkoutScan
// AND its camera PrqEntry rows) only for a verified 18+ account that has opted in. THE PARENT PATH IS REMOVED: a 17-year-old
// WITH an accepted GuardianConsent, whom the old route saved, now gets 403 and no rows, and the route never reads
// GuardianConsent at all; nobody gets the old 412. ADULTS ARE REFUSED TOO until PRIVACY-CORE/AB-04 adds the opt-in; the
// opted-in adult (the opt-in vi.mocked true) is the positive control. Run for real over the write-spy client:
// createPrqEntry, getLatestPrqVector and computeTraceablePrq are the real ones.
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
import { POST } from '@/app/api/mirror/assessment/route';
import { scanSaveOptIn } from '@/lib/privacy/scanSaveOptIn';
import { readFixture } from '@/lib/mirror/fixtures/load';
import { toPoseFrames } from '@/lib/mirror/fixtures';
import { quickCapture, replay } from '@/lib/assess/replay';
import { toRecord, type AssessmentRecord } from '@/lib/assess/prqWrite';
import type { TestResult } from '@/lib/assess/scoring';
import { OPTED_IN_ADULT, REFUSED_SCAN_CASES, callsOn, newSpyDb, refusedGateReads, spyPrisma, writesOf, type AgeCase, type SpyDb } from '@/tests/helpers/writeSpyDb';

const UID = 'athlete-assess-1';
const optIn = vi.mocked(scanSaveOptIn);
const realOptIn = optIn.getMockImplementation()!;
const REFUSED = { status: 403, json: { error: 'scan_save_adults_only', saved: false } };
let db: SpyDb;

const SESSION = replay(quickCapture({ t1Front: 'squat_knee_in_left', t2: { right: { tibiaMax: 36 } } }, (n) => toPoseFrames(readFixture(n))));
const device = { class: 'desktop' as const, model: 'full' as const, poseHz: 30, cameraFps: 30, width: 1280, height: 720 };
const record = (o: { id?: string; tests?: TestResult[] } = {}): AssessmentRecord => toRecord({
  assessmentId: o.id ?? 'assessment-0001', mode: 'quick', measuredAt: new Date(), device, takeoffLeg: 'left',
  tests: o.tests ?? SESSION.tests, mqs: SESSION.mqs,
});

/** The user as the case seeds them, plus a scan and a PRQ entry already on file (so "unchanged" means something). */
function as(c: AgeCase, optedIn = false) {
  db = newSpyDb();
  c.seed(db, UID);
  db.tables.workoutScan = [{ id: 'w-old', userId: UID, kind: 'mirror_assessment', metrics: { assessmentId: 'older-0001' }, createdAt: new Date('2026-09-01T00:00:00Z') }];
  db.tables.prqEntry = [{ id: 'e-old', userId: UID, attribute: 'strength', value: 60, unit: 'score', source: 'manual', sessionId: null, measuredAt: new Date('2026-09-01T00:00:00Z') }];
  h.prisma = spyPrisma(db);
  optIn.mockImplementation(optedIn ? async () => true : realOptIn);
}
/** Every non-empty table as it stands (a read makes an empty one in the spy), to prove a refusal changed nothing. */
const snapshot = () => JSON.stringify(Object.fromEntries(Object.entries(db.tables).filter(([, rows]) => rows.length > 0)));
async function post(body: unknown, raw = false) {
  const res = await POST(new NextRequest('http://fel.test/api/mirror/assessment', {
    method: 'POST', body: raw ? (body as string) : JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }));
  return { status: res.status, json: await res.json() };
}
const CASES = REFUSED_SCAN_CASES.map((c) => [c.id, c] as const);
const ALL = [...REFUSED_SCAN_CASES, OPTED_IN_ADULT].map((c) => [c.id, c] as const);

beforeEach(() => { h.session = { user: { id: UID } }; });

describe('1d POST /api/mirror/assessment', () => {
  it.each(CASES)('%s → 403, zero workoutScan and zero prqEntry writes, GuardianConsent never read', async (_id, c) => {
    as(c);
    const before = snapshot();
    expect(await post(record())).toEqual(REFUSED);
    expect(writesOf(db)).toEqual([]);
    expect(db.calls.map((x) => x.op)).toEqual(refusedGateReads(c.id));
    expect(callsOn(db, 'guardianConsent')).toEqual([]);
    expect(snapshot()).toBe(before);
  });

  it('the 17-year-old WITH an accepted GuardianConsent (the old route saved this one): 403, no rows, the consent never read', async () => {
    const c = REFUSED_SCAN_CASES.find((x) => x.id === '17 with an accepted GuardianConsent')!;
    as(c);
    expect(db.tables.guardianConsent[0].acceptedAt).toBeInstanceOf(Date);
    expect(await post(record())).toEqual(REFUSED);
    expect(db.tables.workoutScan.map((r) => r.id)).toEqual(['w-old']);
    expect(db.tables.prqEntry.map((r) => r.id)).toEqual(['e-old']);
    expect(callsOn(db, 'guardianConsent')).toEqual([]);
  });

  it.each(ALL)('%s: no 412 guardian_consent_required for anyone', async (_id, c) => {
    as(c, c === OPTED_IN_ADULT);
    const r = await post(record());
    expect(r.status).not.toBe(412);
    expect(r.json.error).not.toBe('guardian_consent_required');
  });

  it('18+ OPTED IN (positive control): today\'s scan, one camera PrqEntry per axis, the update, and today\'s answer', async () => {
    as(OPTED_IN_ADULT, true);
    const r = await post(record());
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ saved: true, idempotent: false, assessmentId: 'assessment-0001' });
    expect(Object.keys(r.json).sort()).toEqual(['assessmentId', 'idempotent', 'mqs', 'program', 'prqAfter', 'prqBefore', 'saved', 'scanId', 'writes']);
    expect(r.json.program).toMatchObject({ lane: 'correctives', topFlag: 'ohs.kneeCave', priorities: ['ohs.kneeCave', 'ktw.shinAngle'] });
    expect(writesOf(db)).toEqual(['workoutScan.create', 'prqEntry.create', 'prqEntry.create', 'workoutScan.update']);
    const fresh = db.tables.prqEntry.filter((e) => e.id !== 'e-old');
    expect(fresh.map((e) => e.attribute).sort()).toEqual(['flexibility', 'power']);
    for (const e of fresh) expect(e).toMatchObject({ userId: UID, source: 'camera', sessionId: r.json.scanId });
  });

  it.each(ALL)('%s: 413, 400 (bad JSON, media, unknown field) and 422 (pain) are unchanged, before the age is read', async (_id, c) => {
    as(c, c === OPTED_IN_ADULT);
    expect((await post('x'.repeat(40 * 1024), true)).status).toBe(413);
    expect(await post('{nope', true)).toEqual({ status: 400, json: { error: 'invalid_json', saved: false } });
    expect((await post({ ...record(), image: 'x' })).json).toMatchObject({ error: 'media_not_accepted' });
    expect((await post({ ...record(), extra: 1 })).json).toMatchObject({ error: 'invalid_record' });
    const pain = SESSION.tests.map((t) => (t.id === 'T3' ? { ...t, status: 'painStop' as const, score03: 0 as const } : t));
    expect(await post(record({ tests: pain as TestResult[] }))).toEqual({ status: 422, json: { error: 'pain_stop', saved: false } });
    expect(writesOf(db)).toEqual([]);
    expect(callsOn(db, 'user')).toEqual([]);
  });

  it('signed out: 401, and the gate reads nothing', async () => {
    as(REFUSED_SCAN_CASES.find((c) => c.id === '15')!);
    h.session = null;
    expect(await post(record())).toEqual({ status: 401, json: { error: 'unauthorized', saved: false } });
    expect(db.calls).toEqual([]);
  });
});
