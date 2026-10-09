// POST/GET /api/mirror/assessment, run for real (the pattern of lib/mirror/screen-route.test.ts): only the session and
// the database are stand-ins. createPrqEntry, getLatestPrqVector and computeTraceablePrq are the real ones.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
const m = vi.hoisted(() => ({
  session: { user: { id: 'athlete-1' } } as unknown,
  db: { workoutScan: [] as Row[], prqEntry: [] as Row[], user: [] as Row[], guardianConsent: [] as Row[] },
  clock: 0,
  /** TEEN-WRITE-BLOCK-2: the save gate's opt-in (lib/privacy/scanSaveOptIn, false for everyone until PRIVACY-CORE/AB-04). */
  optedIn: true,
}));

const matches = (row: Row, where: Row = {}) => Object.entries(where).every(([k, v]) => {
  if (v && typeof v === 'object' && !(v instanceof Date) && 'not' in v) return (v as { not: unknown }).not === null ? row[k] != null : row[k] !== (v as { not: unknown }).not;
  return v === null ? row[k] == null : row[k] === v;
});
const pick = (r: Row, select?: Row) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, r[k]])) : r);
function table(name: keyof typeof m.db) {
  const rows = () => m.db[name];
  const query = (a: Row = {}) => {
    let r = rows().filter((x) => matches(x, a.where));
    const [[key, dir] = []] = Object.entries(a.orderBy ?? {});
    if (key) r = [...r].sort((x, y) => (new Date(x[key]).getTime() - new Date(y[key]).getTime()) * (dir === 'desc' ? -1 : 1));
    if (typeof a.take === 'number') r = r.slice(0, a.take);
    return r.map((x) => pick(x, a.select));
  };
  return {
    findMany: async (a?: Row) => query(a),
    findFirst: async (a?: Row) => query(a)[0] ?? null,
    findUnique: async (a: Row) => { const r = rows().find((x) => matches(x, a.where)); return r ? pick(r, a.select) : null; },
    create: async (a: Row) => {
      const row = { id: `${name}-${rows().length + 1}`, createdAt: new Date(1_790_000_000_000 + ++m.clock * 1000), ...JSON.parse(JSON.stringify(a.data)) };
      if (a.data.measuredAt instanceof Date) row.measuredAt = a.data.measuredAt;
      rows().push(row);
      return pick(row, a.select);
    },
    update: async (a: Row) => {
      const row = rows().find((x) => matches(x, a.where));
      if (!row) throw new Error(`no ${name} row to update`);
      Object.assign(row, JSON.parse(JSON.stringify(a.data)));
      return row;
    },
  };
}
// TEEN-WRITE-BLOCK-2 (FE PM 23:05 PT): athlete-1 (1995) is an OPTED-IN ADULT, which is what this file has always saved as;
// who the save gate refuses is lib/privacy/scan-save-assessment.test.ts's.
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
import { GET, POST } from '@/app/api/mirror/assessment/route';
import { computeTraceablePrq } from '@/lib/prq-entries';
import { PRQ_ATTRS, prqScore } from '@/lib/prq';
import { readFixture } from '@/lib/mirror/fixtures/load';
import { toPoseFrames } from '@/lib/mirror/fixtures';
import { quickCapture, replay } from './replay';
import { mediaIn, prqWritesFor, toRecord, type AssessmentRecord } from './prqWrite';
import type { TestResult } from './scoring';

const SESSION = replay(quickCapture({ t1Front: 'squat_knee_in_left', t2: { right: { tibiaMax: 36 } } }, (n) => toPoseFrames(readFixture(n))));
const device = { class: 'desktop' as const, model: 'full' as const, poseHz: 30, cameraFps: 30, width: 1280, height: 720 };
const record = (o: { id?: string; tests?: TestResult[] } = {}): AssessmentRecord => toRecord({
  assessmentId: o.id ?? 'assessment-0001', mode: 'quick', measuredAt: new Date(), device, takeoffLeg: 'left',
  tests: o.tests ?? SESSION.tests, mqs: SESSION.mqs,
});
const post = async (body: unknown, raw = false) => {
  const res = await POST(new NextRequest('http://fel.test/api/mirror/assessment', { method: 'POST', body: raw ? (body as string) : JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
  return { status: res.status, json: await res.json() as Row };
};
const scans = () => m.db.workoutScan.filter((r) => r.kind === 'mirror_assessment');
const entries = () => m.db.prqEntry;

beforeEach(() => {
  m.session = { user: { id: 'athlete-1' } };
  for (const k of Object.keys(m.db) as (keyof typeof m.db)[]) m.db[k] = [];
  m.db.user.push({ id: 'athlete-1', dobYear: 1995 });
  m.optedIn = true;
});

describe('the PRQ formula is untouched (fixed inputs, pinned before this lane)', () => {
  it('prqScore is the mean of the eight axes, 1 dp', () => {
    expect(prqScore({ strength: 70, speed: 55, endurance: 40, agility: 62, power: 48, flexibility: 51, recovery: 66, mental: 73 })).toBe(58.1);
    expect(prqScore({ power: 80 })).toBe(10);
    expect(prqScore(null)).toBe(0);
  });

  it('computeTraceablePrq averages the latest entry per MEASURED axis only', async () => {
    const at = (d: number) => new Date(Date.UTC(2026, 8, d));
    m.db.prqEntry.push(
      { id: 'a', userId: 'u', attribute: 'strength', value: 60, unit: 'score', source: 'manual', measuredAt: at(1) },
      { id: 'b', userId: 'u', attribute: 'strength', value: 70, unit: 'score', source: 'manual', measuredAt: at(5) },
      { id: 'c', userId: 'u', attribute: 'power', value: 45, unit: 'score', source: 'camera', measuredAt: at(3) },
    );
    const { prisma } = await import('@/lib/db');
    expect(await computeTraceablePrq(prisma as never, 'u')).toEqual({ score: 57.5, measured: 2, total: 8 });
    expect(await computeTraceablePrq(prisma as never, 'nobody')).toEqual({ score: 0, measured: 0, total: 8 });
  });
});

describe('POST /api/mirror/assessment', () => {
  it('401 when signed out, and nothing written', async () => {
    m.session = null;
    const { status } = await post(record());
    expect(status).toBe(401);
    expect(scans()).toEqual([]);
    expect(entries()).toEqual([]);
  });

  it('REFUSES A PAYLOAD CARRYING AN IMAGE, A BLOB, A DATA URL OR LANDMARKS, and writes nothing', async () => {
    const rec = record() as unknown as Row;
    for (const smuggle of [
      { ...rec, image: 'x' },
      { ...rec, blob: {} },
      { ...rec, tests: [{ ...rec.tests[0], snapshot: [[0.1, 0.2, 0, 1]] }, ...rec.tests.slice(1)] },
      { ...rec, device: { ...rec.device, class: 'data:image/png;base64,AAAA' } },
      { ...rec, tests: [{ ...rec.tests[0], sides: { both: { ...rec.tests[0].sides.both, landmarks: [] } } }] },
    ]) {
      const { status, json } = await post(smuggle);
      expect(status).toBe(400);
      expect(json.error).toBe('media_not_accepted');
    }
    expect(scans()).toEqual([]);
    expect(entries()).toEqual([]);
  });

  it('refuses an oversized body (413), bad JSON and an unknown field (400)', async () => {
    expect((await post('x'.repeat(40 * 1024), true)).status).toBe(413);
    expect((await post('{nope', true)).status).toBe(400);
    const r = await post({ ...record(), extra: 1 });
    expect(r).toMatchObject({ status: 400, json: { error: 'invalid_record' } });
    expect(scans()).toEqual([]);
  });

  it('saves the record, writes power and flexibility as CAMERA entries carrying the scan id, and answers before → after', async () => {
    const { status, json } = await post(record());
    expect(status).toBe(200);
    expect(json.saved).toBe(true);
    expect(json.program).toMatchObject({ v: 1, lane: 'correctives', topFlag: 'ohs.kneeCave', priorities: ['ohs.kneeCave', 'ktw.shinAngle'] });
    expect(scans()).toHaveLength(1);
    const scan = scans()[0];
    expect(entries().map((e) => e.attribute).sort()).toEqual(['flexibility', 'power']);
    for (const e of entries()) {
      expect(e).toMatchObject({ userId: 'athlete-1', source: 'camera', unit: 'score', sessionId: scan.id });
    }
    const want = prqWritesFor(record());
    for (const w of want) expect(entries().find((e) => e.attribute === w.axis)!.value).toBe(w.value);
    expect(json.writes.map((w: Row) => w.entryId).sort()).toEqual(entries().map((e) => e.id).sort());
    expect(json.prqBefore).toMatchObject({ score: 0, measured: 0 });
    expect(json.prqAfter).toMatchObject({ measured: 2, total: 8 });
  });

  it('AFTER A REPLAYED SCREEN, PRQ IS THE HAND-COMPUTED MEAN OF THE LATEST ENTRIES; UNMEASURED AXES STAY ABSENT, NEVER 50', async () => {
    m.db.prqEntry.push({ id: 'old', userId: 'athlete-1', attribute: 'strength', value: 70, unit: 'score', source: 'manual', measuredAt: new Date(Date.now() - 86_400_000) });
    const { json } = await post(record());
    const power = entries().find((e) => e.attribute === 'power')!.value, flex = entries().find((e) => e.attribute === 'flexibility')!.value;
    const hand = Math.round(((70 + power + flex) / 3) * 10) / 10;
    expect(json.prqAfter).toMatchObject({ score: hand, measured: 3, total: 8 });
    const { prisma } = await import('@/lib/db');
    expect(await computeTraceablePrq(prisma as never, 'athlete-1')).toEqual({ score: hand, measured: 3, total: 8 });
    const written = new Set(entries().map((e) => e.attribute));
    for (const axis of PRQ_ATTRS.filter((a) => !['strength', 'power', 'flexibility'].includes(a))) expect(written.has(axis), axis).toBe(false);
    expect(json.writes.find((w: Row) => w.axis === 'power').before).toBeNull();
  });

  it('AN AXIS THAT DID NOT SCORE WRITES NOTHING', async () => {
    const unscored = SESSION.tests.map((t) => (t.id === 'T2' || t.id === 'T5' ? { ...t, status: 'notScored' as const, confidence: 0.4, sides: {}, score100: null, score03: null, t5: undefined } : t));
    const { status, json } = await post(record({ tests: unscored as TestResult[] }));
    expect(status).toBe(200);
    expect(entries()).toEqual([]);
    expect(json.writes).toEqual([]);
    expect(json.prqAfter).toEqual(json.prqBefore);
    expect(scans()).toHaveLength(1);
  });

  it('MQS IS STORED BESIDE PRQ, NEVER AS A PRQ ENTRY', async () => {
    await post(record());
    const stored = scans()[0].metrics;
    expect(stored.mqs).toBe(SESSION.mqs!.value);
    expect(stored.mqsLabel).toBe('Quick');
    for (const e of entries()) expect(['power', 'flexibility']).toContain(e.attribute);
  });

  it('stores the spec §9 shape, numbers only', async () => {
    await post(record());
    const s = scans()[0].metrics;
    expect(s).toMatchObject({ version: 1, protocolVersion: 'jump-screen-1.0', thresholdsVersion: 'jump-screen-0.2-proposed', mode: 'quick', takeoffLeg: 'left' });
    expect(s.program).toMatchObject({
      v: 1, thresholdsVersion: 'jump-screen-0.2-proposed', complete: true, clean: false,
      lane: 'correctives', topFlag: 'ohs.kneeCave', priorities: ['ohs.kneeCave', 'ktw.shinAngle'],
    });
    expect(s.program.checks).toHaveLength(14);
    expect(s.program.checks.find((c: Row) => c.id === 'ohs.kneeCave')).toEqual({ id: 'ohs.kneeCave', band: 'red' });
    expect(s.program.checks.find((c: Row) => c.id === 'ktw.shinAngle')).toEqual({ id: 'ktw.shinAngle', band: 'yellow' });
    expect(s.device).toEqual(device);
    expect(s.tests.map((t: Row) => t.id)).toEqual(['T1', 'T2', 'T3', 'T5']);
    expect(s.prqWrites.every((w: Row) => typeof w.entryId === 'string')).toBe(true);
    // the row keeps each write's reason sentence (the inbound cap on string length is for what a client sends)
    for (const w of s.prqWrites) expect(w.reason).toMatch(/^[^:]*\d[^]*$/);
    expect(mediaIn({ ...s, prqWrites: s.prqWrites.map(({ reason: _r, ...w }: Row) => w) })).toBeNull();
    expect(JSON.stringify(s)).not.toMatch(/data:|base64/);
  });

  it('is idempotent per assessmentId: a retry writes nothing new', async () => {
    await post(record({ id: 'retry-00001' }));
    const again = await post(record({ id: 'retry-00001' }));
    expect(again.json).toMatchObject({ saved: true, idempotent: true });
    expect(again.json.program).toMatchObject({ lane: 'correctives', topFlag: 'ohs.kneeCave' });
    expect(scans()).toHaveLength(1);
    expect(entries()).toHaveLength(2);
    await post(record({ id: 'another-0002' }));
    expect(scans()).toHaveLength(2);
  });

  it('a screen stopped for pain is not saved (422)', async () => {
    const pain = SESSION.tests.map((t) => (t.id === 'T3' ? { ...t, status: 'painStop' as const, score03: 0 as const } : t));
    const { status, json } = await post(record({ tests: pain as TestResult[] }));
    expect(status).toBe(422);
    expect(json).toMatchObject({ error: 'pain_stop', saved: false });
    expect(scans()).toEqual([]);
    expect(entries()).toEqual([]);
  });

  // TEEN-WRITE-BLOCK-2 (FE PM 23:05 PT): the parent path is removed. Before → 'MINORS FAIL CLOSED: no known age and no
  // accepted guardian consent saves nothing (412)': unknown age 412; 14 with a pending consent 412; then, once the consent
  // was ACCEPTED, 200 and one scan. After → all three are 403 scan_save_adults_only with nothing written, the accepted
  // consent included (only a verified, opted-in adult saves). Flipped, not deleted.
  it('MINORS FAIL CLOSED, the parent path gone: unknown age, 14 pending, 14 with an ACCEPTED guardian consent all get 403 and save nothing', async () => {
    const refused = { status: 403, json: { error: 'scan_save_adults_only', saved: false } };
    m.db.user = [{ id: 'athlete-1', dobYear: null }];
    expect(await post(record())).toEqual(refused);
    m.db.user = [{ id: 'athlete-1', dobYear: new Date().getFullYear() - 14 }];
    m.db.guardianConsent = [{ id: 'g1', menteeId: 'athlete-1', menteeBirthYear: new Date().getFullYear() - 14, acceptedAt: null, revokedAt: null }];
    expect(await post(record())).toEqual(refused);
    expect(scans()).toEqual([]);
    m.db.guardianConsent[0].acceptedAt = new Date();
    expect(await post(record())).toEqual(refused);   // before: 200 and one scan
    expect(scans()).toEqual([]);
    expect(entries()).toEqual([]);
  });
});

describe('GET /api/mirror/assessment', () => {
  it('401 signed out', async () => {
    m.session = null;
    expect((await GET()).status).toBe(401);
  });

  it('the latest assessment and the traceable PRQ', async () => {
    await post(record({ id: 'first-00001' }));
    await post(record({ id: 'second-0002' }));
    const json = await (await GET()).json() as Row;
    expect(json.assessment.metrics.assessmentId).toBe('second-0002');
    expect(json.prq).toMatchObject({ measured: 2, total: 8 });
  });
});
