// DUNK-FLAGSHIP Phase 5: "only verified adult jumps can personalise it". GET /api/dunk/verified-jump answers the caller's VERIFIED
// best countermovement jump (hands on hips) — the saved Quick Screen read through lib/jump/seam.ts — and only for a verified 18+
// account that opted in, checked at READ time. The rows are written by the real POST /api/mirror/assessment (session and
// database stand-ins only, as tests/jump-pro/verified-save.test.ts does).
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
const m = vi.hoisted(() => ({
  session: { user: { id: 'athlete-1' } } as unknown,
  db: { workoutScan: [] as Row[], prqEntry: [] as Row[], user: [] as Row[], guardianConsent: [] as Row[] },
  clock: 0,
  optedIn: true,
}));
const matches = (row: Row, where: Row = {}) => Object.entries(where).every(([k, v]) => (v === null ? row[k] == null : row[k] === v));
const pick = (r: Row, select?: Row) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, r[k]])) : r);
function table(name: keyof typeof m.db) {
  const rows = () => m.db[name];
  const query = (a: Row = {}) => {
    let r = rows().filter((x) => matches(x, a.where));
    if (typeof a.take === 'number') r = r.slice(0, a.take);
    return r.map((x) => pick(x, a.select));
  };
  return {
    findMany: async (a?: Row) => query(a),
    findFirst: async (a?: Row) => query(a)[0] ?? null,
    findUnique: async (a: Row) => { const r = rows().find((x) => matches(x, a.where)); return r ? pick(r, a.select) : null; },
    create: async (a: Row) => {
      const row = { id: `${name}-${rows().length + 1}`, createdAt: new Date(1_790_000_000_000 + ++m.clock * 1000), ...JSON.parse(JSON.stringify(a.data)) };
      rows().push(row);
      return pick(row, a.select);
    },
    update: async (a: Row) => { const row = rows().find((x) => matches(x, a.where))!; Object.assign(row, JSON.parse(JSON.stringify(a.data))); return row; },
  };
}
vi.mock('@/lib/privacy/scanSaveOptIn', () => ({ scanSaveOptIn: async () => m.optedIn }));
vi.mock('next-auth', () => ({ getServerSession: async () => m.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then') return undefined;
      if (!(prop in m.db)) throw new Error(`the route touched prisma.${String(prop)}`);
      return table(prop as keyof typeof m.db);
    },
  }),
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/mirror/assessment/route';
import { GET } from '@/app/api/dunk/verified-jump/route';
import { bestVerifiedJumpCm } from '@/lib/dunk/verifiedJump';
import { personalFullRiseM, riseToPower } from '@/lib/babylon/core/DunkFlagship';
import { toRecord, validateRecord, type AssessmentRecord } from '@/lib/assess/prqWrite';
import type { T5Extra, TestResult } from '@/lib/assess/scoring';
import { gradeT5 } from '@/lib/assess/graders/t5-cmj';
import { buildTake, filmTake } from '@/lib/jump/ballistic';
import { calibrateTake } from '@/lib/jump/bench';

/** A clean jump check at 60 fps: three good jumps, hands on hips, landing tall (the bench's ground truth). */
function cleanT5(): TestResult & { t5: T5Extra } {
  const take = buildTake([0.38, 0.4, 0.39].map((h) => ({ trial: { heightM: h } })), { leadS: 3.2 });
  const { frames } = filmTake(take, { fps: 60, seed: 2 });
  const cal = calibrateTake(frames)!;
  return gradeT5(frames, { calibration: cal, aspect: 4 / 3, poseHz: 60, cameraFps: 60 });
}
const T5 = cleanT5();
const device = { class: 'mobile' as const, model: 'lite' as const, poseHz: 60, cameraFps: 60, width: 720, height: 1280 };
const record = (t5: TestResult = T5): AssessmentRecord => toRecord({ assessmentId: 'assessment-jump-0001', mode: 'quick', measuredAt: new Date(), device, takeoffLeg: null, tests: [t5], mqs: null });
const post = async (body: unknown) => {
  const res = await POST(new NextRequest('http://fel.test/api/mirror/assessment', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
  return { status: res.status, json: (await res.json()) as Row };
};
const get = async () => { const res = await GET(); return { status: res.status, json: (await res.json()) as Row }; };

beforeEach(() => {
  m.session = { user: { id: 'athlete-1' } };
  for (const k of Object.keys(m.db) as (keyof typeof m.db)[]) m.db[k] = [];
  m.db.user.push({ id: 'athlete-1', dobYear: 1995 });
  m.optedIn = true;
});

describe('GET /api/dunk/verified-jump — the verified adult jump, nobody else\'s and nothing else', () => {
  it('a verified, opted-in adult with a clean saved jump check reads its verified best (cm)', async () => {
    expect((await post(record())).status).toBe(200);
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.json.verified).toBe(true);
    expect(r.json.heightCm).toBeGreaterThan(30);
    expect(r.json.heightCm).toBeLessThan(50);   // the bench's three jumps were 38–40 cm
    expect(Object.keys(r.json).sort()).toEqual(['heightCm', 'verified']);
  });

  it('a saved row whose jumps do not verify (heights and flights only: framesOnly) personalises nothing', async () => {
    const rec = record();
    for (const j of rec.tests[0].t5!.jumps) { delete j.method; delete j.heightSdCm; delete j.quality; }
    expect((await post(rec)).status).toBe(200);
    expect((await get()).json).toEqual({ verified: false, heightCm: null });
  });

  it('the gate is read NOW: a row saved while the account qualified answers nothing once it does not (a teen, or opted out)', async () => {
    expect((await post(record())).status).toBe(200);
    m.db.user[0].dobYear = new Date().getFullYear() - 15;
    expect((await get()).json).toEqual({ verified: false, heightCm: null });
    m.db.user[0].dobYear = 1995; m.optedIn = false;
    expect((await get()).json).toEqual({ verified: false, heightCm: null });
  });

  it('no session: 401; a failing database: not verified (never a 500, never a number)', async () => {
    m.session = null;
    expect((await get()).status).toBe(401);
    m.session = { user: { id: 'athlete-1' } };
    const real = m.db.workoutScan; Object.defineProperty(m.db, 'workoutScan', { get() { throw new Error('db down'); }, configurable: true });
    expect((await get()).json).toEqual({ verified: false, heightCm: null });
    Object.defineProperty(m.db, 'workoutScan', { value: real, writable: true, configurable: true });
  });

  it('the pure read takes the best VERIFIED jump only, and the mapping it feeds is clamped and monotonic', () => {
    expect(bestVerifiedJumpCm([])).toBeNull();
    expect(bestVerifiedJumpCm([null, { tests: 'x' }, { tests: [{ id: 'T5', t5: { jumps: [] } }] }])).toBeNull();
    expect(bestVerifiedJumpCm([{ tests: [{ id: 'T5', t5: T5.t5 }] }])).toBeGreaterThan(30);
    expect(personalFullRiseM(null)).toBeNull();
    expect(personalFullRiseM(10)).toBe(0.25);
    expect(personalFullRiseM(150)).toBe(0.95);
    expect(personalFullRiseM(50)).toBe(0.5);
    const fixed = [0.3, 0.5, 0.7].map((r) => riseToPower(r, 0.7));
    expect(fixed[0]).toBeLessThan(fixed[1]); expect(fixed[1]).toBeLessThan(fixed[2]); expect(fixed[2]).toBe(1);
    expect(riseToPower(0.5, personalFullRiseM(50)!)).toBe(1);   // personalised: your best jump is a full take-off
  });
});
