// JUMP-PRO 2 (2026-10-25; found by teams-squads, PR #441): a saved assessment kept only each jump's height and flight,
// so lib/jump/seam.ts could not verify any stored jump ("framesOnly") and the verified-jump board stayed empty. The
// record now keeps the verified rule's three facts (method, heightSdCm, quality) for the opted-in adults the route
// saves at all. This file runs the real POST /api/mirror/assessment (session and database stand-ins only, as
// lib/assess/assessment-route.test.ts does) and reads the stored row back through the seam teams-squads imports.
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
import { toRecord, validateRecord, type AssessmentRecord } from '@/lib/assess/prqWrite';
import type { T5Extra, TestResult } from '@/lib/assess/scoring';
import { gradeT5 } from '@/lib/assess/graders/t5-cmj';
import { buildTake, filmTake } from '@/lib/jump/ballistic';
import { calibrateTake } from '@/lib/jump/bench';
import { jumpRecords } from '@/lib/jump/seam';

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
/** What teams-squads reads (lib/groups/server.ts): the stored T5 as a T5Extra, through the seam. */
const storedRecords = () => m.db.workoutScan.flatMap((s) => (s.metrics.tests as Row[]).filter((t) => t.id === 'T5' && t.t5).flatMap((t) => jumpRecords(t.t5 as T5Extra, { source: 'live' })));

beforeEach(() => {
  m.session = { user: { id: 'athlete-1' } };
  for (const k of Object.keys(m.db) as (keyof typeof m.db)[]) m.db[k] = [];
  m.db.user.push({ id: 'athlete-1', dobYear: 1995 });
  m.optedIn = true;
});

describe('a saved, cleanly re-timed jump reads back as verified (lib/jump/seam.ts)', () => {
  it('positive control: in memory, the clean 60 fps jump check verifies', () => {
    const [cmj] = jumpRecords(T5.t5, { source: 'live' });
    expect(cmj).toMatchObject({ type: 'cmj', verified: true, blocks: [] });
  });

  it('the record carries method, heightSdCm and the quality flags, and the route\'s strict check accepts them', () => {
    const rec = record();
    const j = rec.tests[0].t5!.jumps.find((x) => x.valid)!;
    expect(j).toMatchObject({ method: 'refined', heightSdCm: expect.any(Number), quality: { flags: expect.any(Array), clean: expect.any(Boolean) } });
    expect(validateRecord(JSON.parse(JSON.stringify(rec)))).toMatchObject({ ok: true });
  });

  it('opted-in adult: POST, then the stored row through the seam is the same verified record as in memory', async () => {
    const r = await post(record());
    expect(r.status).toBe(200);
    expect(m.db.workoutScan).toHaveLength(1);
    const back = storedRecords();
    const mem = jumpRecords(T5.t5, { source: 'live' });
    expect(back.find((x) => x.type === 'cmj')).toEqual(mem.find((x) => x.type === 'cmj'));
    expect(back.find((x) => x.type === 'cmj')).toMatchObject({ verified: true, blocks: [] });
  });

  it('a record as saved before (heights and flights only) still saves, and does not verify (framesOnly)', async () => {
    const rec = record();
    for (const j of rec.tests[0].t5!.jumps) { delete j.method; delete j.heightSdCm; delete j.quality; }
    expect((await post(rec)).status).toBe(200);
    expect(storedRecords().find((x) => x.type === 'cmj')).toMatchObject({ verified: false, blocks: expect.arrayContaining(['framesOnly']) });
  });

  it('not opted in (or a teen: the same gate): 403 and nothing at all is stored', async () => {
    m.optedIn = false;
    expect((await post(record())).status).toBe(403);
    m.optedIn = true;
    m.db.user[0].dobYear = new Date().getFullYear() - 15;
    expect((await post(record())).status).toBe(403);
    expect(m.db.workoutScan).toEqual([]);
  });

  it('the three facts are checked as strictly as the rest: an unknown flag, a method or an SD out of range is refused', () => {
    const bad = (f: (j: Row) => void) => { const rec = JSON.parse(JSON.stringify(record())); f(rec.tests[0].t5.jumps[0]); return validateRecord(rec).ok; };
    expect(bad((j) => { j.quality.flags = ['verified']; })).toBe(false);
    expect(bad((j) => { j.quality.extra = 1; })).toBe(false);
    expect(bad((j) => { j.method = 'forcePlate'; })).toBe(false);
    expect(bad((j) => { j.heightSdCm = 99; })).toBe(false);
    expect(bad((j) => { j.verified = true; })).toBe(false);
  });
});
