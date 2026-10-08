// TEEN-WRITE-BLOCK-2 (FE PM 23:05 PT), GAP 1 row 1a: POST and PATCH /api/mirror/screen keep a screen, and its answers,
// ONLY for a verified 18+ account that has opted in. Refused: 403, no row, no update and NO SHARD REWARD, a retry of a
// screen already on file included (the gate runs before the dedupe read, so grantServerReward never runs). ADULTS ARE
// REFUSED TOO until PRIVACY-CORE/AB-04 adds the opt-in; the opted-in adult (the opt-in vi.mocked true) is the positive
// control. Run for real over the write-spy client; the wallet grant is a spy.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ session: null as unknown, prisma: null as any, grants: [] as unknown[] }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.prisma[p]) }) }));
vi.mock('@/lib/wallet/wallet-service', () => ({
  grantServerReward: async (_db: unknown, args: unknown) => { h.grants.push(args); return { granted: { shards: 25 } }; },
}));
vi.mock('@/lib/privacy/scanSaveOptIn', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/privacy/scanSaveOptIn')>();
  return { scanSaveOptIn: vi.fn(real.scanSaveOptIn) };
});

import { NextRequest } from 'next/server';
import { PATCH, POST } from '@/app/api/mirror/screen/route';
import { scanSaveOptIn } from '@/lib/privacy/scanSaveOptIn';
import { OPTED_IN_ADULT, REFUSED_SCAN_CASES, callsOn, newSpyDb, refusedGateReads, spyPrisma, writesOf, type AgeCase, type Row, type SpyDb } from '@/tests/helpers/writeSpyDb';

const UID = 'athlete-screen-1';
const optIn = vi.mocked(scanSaveOptIn);
const realOptIn = optIn.getMockImplementation()!;
const REFUSED = { status: 403, json: { error: 'scan_save_adults_only', saved: false } };
let db: SpyDb;

/** A readable, passing summary per camera check (lib/mirror/screen-route.test.ts's PASS table): a PAID screen. */
const PASS = [
  { checkId: 'heelLine', status: 'pass', value: 2, bySide: { left: 2, right: 1 }, unit: 'deg', frames: 360, readableFrames: 360, uncertainty: 0.5, spread: 4, stationId: 'heels', view: 'back' },
  { checkId: 'kneeWindow', status: 'pass', value: 0.05, bySide: { left: 0.05, right: 0.02 }, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.01, spread: 0.1, stationId: 'frontStack', view: 'front' },
  { checkId: 'hipLevel', status: 'pass', value: 0.01, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.005, spread: 0.02, stationId: 'frontStack', view: 'front' },
  { checkId: 'shoulderLevel', status: 'pass', value: -0.01, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.005, spread: 0.02, stationId: 'frontStack', view: 'front' },
  { checkId: 'headFloat', status: 'pass', value: 0.02, unit: 'ratio', frames: 300, readableFrames: 300, uncertainty: 0.005, spread: 0.02, stationId: 'profile', view: 'side' },
  { checkId: 'singleLeg', status: 'pass', value: 0.03, unit: 'px-norm', frames: 900, readableFrames: 900, uncertainty: 0.01, spread: null, touchDowns: 0, stanceSec: 28, side: 'left', stationId: 'wobbleL', view: 'front' },
  { checkId: 'singleLeg', status: 'pass', value: 0.04, unit: 'px-norm', frames: 900, readableFrames: 900, uncertainty: 0.01, spread: null, touchDowns: 0, stanceSec: 28, side: 'right', stationId: 'wobbleR', view: 'front' },
];
const SCREEN = { screenId: 'scr-1', screen: 'modified', checks: PASS };
const ANSWERS = { screenId: 'scr-1', answers: [{ questionId: 'lowerRibsWiden', answer: 'yes' }] };

function as(c: AgeCase, optedIn = false) {
  db = newSpyDb();
  c.seed(db, UID);
  h.prisma = spyPrisma(db);
  h.grants = [];
  optIn.mockImplementation(optedIn ? async () => true : realOptIn);
}
/** Every non-empty table as it stands (a read makes an empty one in the spy), to prove a refusal changed nothing. */
const snapshot = () => JSON.stringify(Object.fromEntries(Object.entries(db.tables).filter(([, rows]) => rows.length > 0)));
const send = (handler: typeof POST) => async (body: unknown) => {
  const req = new NextRequest('http://fel.test/api/mirror/screen', {
    method: handler === POST ? 'POST' : 'PATCH', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json' },
  });
  const res = await handler(req);
  return { status: res.status, json: await res.json() };
};
const post = send(POST);
const patch = send(PATCH);
/** The row a PAID screen leaves on file, made by the route itself for the opted-in adult, then handed to `uid`. */
async function storedScreenRow(uid: string): Promise<Row> {
  as(OPTED_IN_ADULT, true);
  expect((await post(SCREEN)).json).toMatchObject({ paid: true, screenId: 'scr-1' });
  return { ...db.tables.workoutScan[0], userId: uid };
}
const CASES = REFUSED_SCAN_CASES.map((c) => [c.id, c] as const);
const ALL = [...REFUSED_SCAN_CASES, OPTED_IN_ADULT].map((c) => [c.id, c] as const);

beforeEach(() => { h.session = { user: { id: UID } }; });

describe('1a POST /api/mirror/screen', () => {
  it.each(CASES)('%s → 403, no row, no reward, nothing read past the age', async (_id, c) => {
    as(c);
    expect(await post(SCREEN)).toEqual(REFUSED);
    expect(writesOf(db)).toEqual([]);
    expect(h.grants).toEqual([]);
    expect(db.calls.map((x) => x.op)).toEqual(refusedGateReads(c.id));
    expect(callsOn(db, 'guardianConsent')).toEqual([]);
  });

  it.each(CASES)('%s: a RETRY of a paid screen already on file → 403, still no reward and nothing written', async (_id, c) => {
    const row = await storedScreenRow(UID);
    as(c);
    db.tables.workoutScan = [row];
    const before = snapshot();
    expect(await post(SCREEN)).toEqual(REFUSED);
    expect(h.grants).toEqual([]);
    expect(writesOf(db)).toEqual([]);
    expect(callsOn(db, 'workoutScan')).toEqual([]);   // the dedupe read never ran
    expect(snapshot()).toBe(before);
  });

  it('18+ OPTED IN (positive control): today\'s one row, today\'s reward, today\'s answer; a retry is answered from the row', async () => {
    as(OPTED_IN_ADULT, true);
    const r = await post(SCREEN);
    expect(r.status).toBe(200);
    expect(Object.keys(r.json).sort()).toEqual(['awarded', 'dropped', 'graded', 'message', 'paid', 'provisional', 'readableCameraChecks', 'screenId', 'summary']);
    expect(r.json).toMatchObject({ graded: true, paid: true, awarded: 25, screenId: 'scr-1' });
    expect(writesOf(db)).toEqual(['workoutScan.create']);
    expect(h.grants).toHaveLength(1);
    const again = await post(SCREEN);
    expect(again.json).toMatchObject({ alreadyStored: true, screenId: 'scr-1' });
    expect(writesOf(db)).toEqual(['workoutScan.create']);
  });

  it.each(ALL)('%s: a bad body still gets its 400, before the age is read, nothing written or paid', async (_id, c) => {
    as(c, c === OPTED_IN_ADULT);
    expect(await post('{not json')).toEqual({ status: 400, json: { error: 'invalid_json' } });
    expect((await post({ screen: 'modified', checks: PASS })).status).toBe(400);
    expect(writesOf(db)).toEqual([]);
    expect(h.grants).toEqual([]);
    expect(callsOn(db, 'user')).toEqual([]);
  });

  it('signed out: 401, and the gate reads nothing', async () => {
    as(REFUSED_SCAN_CASES.find((c) => c.id === '15')!);
    h.session = null;
    expect((await post(SCREEN)).status).toBe(401);
    expect((await patch(ANSWERS)).status).toBe(401);
    expect(db.calls).toEqual([]);
  });
});

describe('1a PATCH /api/mirror/screen (the breath answers)', () => {
  it.each(CASES)('%s → 403, no update, even on their own screen already on file', async (_id, c) => {
    const row = await storedScreenRow(UID);
    as(c);
    db.tables.workoutScan = [row];
    const before = snapshot();
    expect(await patch(ANSWERS)).toEqual(REFUSED);
    expect(writesOf(db)).toEqual([]);
    expect(callsOn(db, 'workoutScan')).toEqual([]);
    expect(snapshot()).toBe(before);
  });

  it('18+ OPTED IN: the answers are kept on the screen, as before; another user\'s screen is still a 404', async () => {
    as(OPTED_IN_ADULT, true);
    await post(SCREEN);
    const r = await patch(ANSWERS);
    expect(r.status).toBe(200);
    expect(Object.keys(r.json).sort()).toEqual(['screenId', 'selfReport']);
    expect(writesOf(db)).toEqual(['workoutScan.create', 'workoutScan.update']);
    expect((await patch({ ...ANSWERS, screenId: 'not-mine' })).status).toBe(404);
  });

  it.each(ALL)('%s: no screen id is still a 400, before the age is read', async (_id, c) => {
    as(c, c === OPTED_IN_ADULT);
    expect(await patch({ answers: [] })).toEqual({ status: 400, json: { error: 'missing_screen_id' } });
    expect(writesOf(db)).toEqual([]);
    expect(callsOn(db, 'user')).toEqual([]);
  });
});
