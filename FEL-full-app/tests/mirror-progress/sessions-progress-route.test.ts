// MIRROR-PROGRESS (plan Phase 4, 2026-10-07): POST /api/mirror/sessions carries the squat's and the lunge's per-check
// `checkValues` (plan item #5) and, asked, answers with the last 3 saved values of that pattern ("vs your last 3") — for
// a verified 18+ account that opted in ONLY. Everyone else is refused before anything of theirs is read: their history
// stays on their own phone (owner decision 1). Run for real over the write-spy client; only the session and the database
// are stand-ins (the same rig as lib/privacy/scan-save-mirror-sessions.test.ts).
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
import { POST } from '@/app/api/mirror/sessions/route';
import { scanSaveOptIn } from '@/lib/privacy/scanSaveOptIn';
import { readCheckValues, recordCheckValues } from '@/lib/mirror/baselines';
import { squatReading } from '@/lib/mirror/progressReading';
import { OPTED_IN_ADULT, REFUSED_SCAN_CASES, argsOf, callsOn, newSpyDb, refusedGateReads, spyPrisma, writesOf, type AgeCase, type SpyDb } from '@/tests/helpers/writeSpyDb';

const UID = 'athlete-progress-1';
const optIn = vi.mocked(scanSaveOptIn);
const realOptIn = optIn.getMockImplementation()!;
const REFUSED = { status: 403, json: { error: 'scan_save_adults_only', saved: false } };
const zones = { posterior_chain: 0, lat_rhomboid: 1, upper_traps: 0, rib_thoracic: 0, lumbo_pelvic: 0 };
const SQUAT_CHECKS = squatReading([[], [], ['heelRise'], [], [], [], ['shallow'], []], (f) => f)!.checkValues;
const SQUAT = {
  patternId: 'squat', startedAtMs: 1_790_000_000_000, durationMs: 60_000, reps: 8, avgTempoMs: 2100, avgFrameMs: 33,
  timeInStableMs: zones, faultCounts: zones, checkValues: SQUAT_CHECKS, recent: true,
};
let db: SpyDb;
let t = 0;
const at = () => new Date(Date.UTC(2026, 9, 1) + (t += 60_000));

function row(patternId: string, faultCounts: unknown, reps = 8, userId = UID) {
  return { id: `ms-${t}`, userId, patternId, reps, durationMs: 60_000, faultCounts, timeInStableMs: {}, createdAt: at() };
}

function as(c: AgeCase, optedIn = false, history: unknown[] = []) {
  db = newSpyDb();
  c.seed(db, UID);
  db.tables.mirrorSession = history as any[];
  h.prisma = spyPrisma(db);
  optIn.mockImplementation(optedIn ? async () => true : realOptIn);
}
const snapshot = () => JSON.stringify(Object.fromEntries(Object.entries(db.tables).filter(([, rows]) => rows.length > 0)));
async function post(body: unknown) {
  const req = new NextRequest('http://fel.test/api/mirror/sessions', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  const res = await POST(req);
  return { status: res.status, json: await res.json() };
}

beforeEach(() => { h.session = { user: { id: UID } }; t = 0; });

describe('refused (a minor, no birth year, an adult who has not opted in): nothing written, nothing of theirs read', () => {
  it.each(REFUSED_SCAN_CASES.map((c) => [c.id, c] as const))('%s → 403; no mirrorSession read or write, even asked for "recent"', async (_id, c) => {
    as(c, false, [row('squat', recordCheckValues({}, { cleanShare: 0.5 }))]);
    const before = snapshot();
    expect(await post(SQUAT)).toEqual(REFUSED);
    expect(writesOf(db)).toEqual([]);
    expect(callsOn(db, 'mirrorSession')).toEqual([]);
    expect(db.calls.map((x) => x.op)).toEqual(refusedGateReads(c.id));
    expect(snapshot()).toBe(before);
  });
});

describe('18+ opted in', () => {
  it('the squat\'s per-check values are stored with the session (inside faultCounts, the zone counts untouched)', async () => {
    as(OPTED_IN_ADULT, true);
    const r = await post(SQUAT);
    expect(r.status).toBe(200);
    expect(writesOf(db)).toEqual(['mirrorSession.create']);
    const data = argsOf(db, 'mirrorSession.create')[0].data;
    expect(data).toMatchObject({ userId: UID, patternId: 'squat', reps: 8 });
    expect(data.faultCounts.lat_rhomboid).toBe(1);
    expect(readCheckValues(data.faultCounts)).toEqual({ cleanShare: 0.75, heelRise: 0.125, shallow: 0.125, reps: 8 });
  });

  it('"recent": the last 3 readable values of THIS pattern, oldest first, read before the new row is written', async () => {
    as(OPTED_IN_ADULT, true, [
      row('squat', recordCheckValues({}, { cleanShare: 0.25 })),          // the 4th newest squat: not read
      row('squat', recordCheckValues({}, { cleanShare: 0.5 })),
      row('lunge', recordCheckValues({}, { cleanShare: 0.99 })),          // another pattern
      row('split-stance-press-row', { lat_rhomboid: 4 }),                  // another pattern
      row('squat', recordCheckValues({}, { cleanShare: 0.625 })),
      row('squat', { lat_rhomboid: 2 }),                                   // a squat saved without values (too short to read): skipped
      row('squat', recordCheckValues({}, { cleanShare: 0.875 })),
      row('squat', recordCheckValues({}, { cleanShare: 0.1 }), 8, 'someone-else'),
    ]);
    const r = await post(SQUAT);
    expect(r.json).toEqual({ id: expect.any(String), saved: true, recent: { values: [0.5, 0.625, 0.875] } });
    // the read came first, then the write — so the set just done is never compared with itself
    expect(db.calls.map((c) => c.op).filter((op) => op.startsWith('mirrorSession'))).toEqual(['mirrorSession.findMany', 'mirrorSession.create']);
  });

  it('the press/row compares from the columns it has always stored (older sessions count too)', async () => {
    as(OPTED_IN_ADULT, true, [row('split-stance-press-row', { lat_rhomboid: 4, upper_traps: 4 })]);
    const r = await post({ ...SQUAT, patternId: 'split-stance-press-row', checkValues: undefined });
    expect(r.json.recent).toEqual({ values: [1] });
  });

  it('without "recent", the answer is exactly as before', async () => {
    as(OPTED_IN_ADULT, true, [row('squat', recordCheckValues({}, { cleanShare: 0.5 }))]);
    const { recent: _drop, ...plain } = SQUAT;
    expect((await post(plain)).json).toEqual({ id: expect.any(String), saved: true });
    expect(callsOn(db, 'mirrorSession')).toEqual(['mirrorSession.create']);
  });

  it('a failed history read answers recent: null — and the session still saves', async () => {
    as(OPTED_IN_ADULT, true);
    const real = h.prisma;
    h.prisma = new Proxy({}, { get: (_t, p) => (p === 'mirrorSession'
      ? { findMany: async () => { throw new Error('db down'); }, create: real.mirrorSession.create }
      : real[p as string]) });
    const r = await post(SQUAT);
    expect(r.json).toEqual({ id: expect.any(String), saved: true, recent: null });
    expect(writesOf(db)).toEqual(['mirrorSession.create']);
  });

  it('checkValues that are not a pattern\'s readings (too many keys, a long key, a non-number) are not stored; the session is', async () => {
    as(OPTED_IN_ADULT, true);
    const many = Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`k${i}`, i]));
    for (const checkValues of [many, { ['x'.repeat(65)]: 1 }, { cleanShare: 'high' }, [1, 2]]) {
      await post({ ...SQUAT, checkValues });
    }
    const rows = argsOf(db, 'mirrorSession.create');
    expect(rows).toHaveLength(4);
    for (const a of rows) expect(readCheckValues(a.data.faultCounts)).toBeNull();
  });
});
