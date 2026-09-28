// POST /api/mirror/screen, GET /api/coach/prescribe and GET /api/prq/export, run for real (MIRROR-COACH P1 review,
// 2026-09-25). Only the session, the database and the wallet's grant are stand-ins.
//
// WHY. The screen route is four steps — resultsForScreen, scoreScreen, decideScreenReward, storedScreen — and each was
// tested alone, while the baseline harness (lib/mirror/fixtures/measure.ts) re-implemented the route instead of calling
// it and skipped resultsForScreen. A change that stored the raw `b.results`, or paid on the raw count, would have kept
// every test green. These post to the route and read what it stored, what it paid and what it said; then read the
// stored rows back through the coach's route and the athlete's export.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
const m = vi.hoisted(() => ({
  session: { user: { id: 'athlete-1' } } as unknown,
  db: { workoutScan: [] as Row[], coachClient: [] as Row[], coachingProgram: [] as Row[], programExercise: [] as Row[], prqEntry: [] as Row[], gameSession: [] as Row[] },
  grants: [] as unknown[],
  clock: 0,
}));

const match = (row: Row, where: Row = {}) => Object.entries(where).every(([k, v]) => v === null ? row[k] == null : row[k] === v);
function table(name: keyof typeof m.db) {
  const rows = () => m.db[name];
  const sorted = (a: Row = {}) => {
    let r = rows().filter((x) => match(x, a.where));
    if (a.orderBy?.createdAt) r = [...r].sort((x, y) => (x.createdAt.getTime() - y.createdAt.getTime()) * (a.orderBy.createdAt === 'desc' ? -1 : 1));
    if (typeof a.take === 'number') r = r.slice(0, a.take);
    return a.select ? r.map((x) => Object.fromEntries(Object.keys(a.select).map((k) => [k, x[k]]))) : r;
  };
  return {
    findMany: async (a?: Row) => sorted(a),
    findFirst: async (a?: Row) => sorted(a)[0] ?? null,
    create: async (a: Row) => { const row = { id: `${name}-${rows().length + 1}`, createdAt: new Date(1_750_000_000_000 + ++m.clock * 1000), ...JSON.parse(JSON.stringify(a.data)) }; rows().push(row); return row; },
  };
}
vi.mock('next-auth', () => ({ getServerSession: async () => m.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => (m.session as { user?: { id?: string } } | null)?.user?.id ?? null,
  bad: (error: string, status: number) => new Response(JSON.stringify({ error }), { status }),
}));
vi.mock('@/lib/wallet/wallet-service', () => ({
  grantServerReward: vi.fn(async (_db: unknown, args: unknown) => { m.grants.push(args); return { granted: { shards: 25 } }; }),
}));
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
import { POST as screenPOST } from '@/app/api/mirror/screen/route';
import { GET as prescribeGET } from '@/app/api/coach/prescribe/route';
import { GET as exportGET } from '@/app/api/prq/export/route';
import { MIRROR_SCREEN_KIND, NOT_GRADED_LINE, checkSlots, scoreScreen, type CheckResult } from './screen';
import { LEGACY_SCREEN_NOTE, storedScreen } from './screenStore';

const post = async (body: unknown) => {
  const res = await screenPOST(new NextRequest('http://fel.test/api/mirror/screen', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
  return { status: res.status, json: await res.json() as Row };
};
const stored = () => m.db.workoutScan.filter((r) => r.kind === MIRROR_SCREEN_KIND);
const r = (checkId: string, grade: CheckResult['grade'], side?: 'left' | 'right'): CheckResult =>
  side ? { checkId, grade, side, source: 'camera' } : { checkId, grade, source: 'camera' };
/** Every slot of the modified screen, stable unless overridden. */
const allModified = (over: CheckResult[] = []): CheckResult[] => [...checkSlots('modified')].flatMap(([id, n]) =>
  n === 2 ? [over.find((o) => o.checkId === id && o.side === 'left') ?? r(id, 'stable', 'left'), over.find((o) => o.checkId === id && o.side === 'right') ?? r(id, 'stable', 'right')]
    : [over.find((o) => o.checkId === id) ?? r(id, 'stable')]);

beforeEach(() => {
  m.session = { user: { id: 'athlete-1' } };
  for (const k of Object.keys(m.db) as (keyof typeof m.db)[]) m.db[k] = [];
  m.grants = [];
});

describe('POST /api/mirror/screen, for real', () => {
  it('(a) an empty screen is stored ungraded with no score, pays nothing, and answers with the not-graded line', async () => {
    const { status, json } = await post({ screenId: 'scr-1', screen: 'modified', results: [] });
    expect(status).toBe(200);
    expect(json).toMatchObject({ graded: false, paid: false, awarded: 0, message: NOT_GRADED_LINE });
    expect(json.summary.score).toBeNull();
    expect(m.grants).toEqual([]);
    expect(stored()).toHaveLength(1);
    expect(stored()[0].metrics).toMatchObject({ screenId: 'scr-1', screen: 'modified', graded: false, results: [] });
    expect(stored()[0].metrics.summary).toMatchObject({ score: null, triage: 'notGraded', headline: NOT_GRADED_LINE });
  });

  it('(b) a "modified" post carrying a full-only pelvicTilt result is scored, paid and stored without it', async () => {
    const results = [...allModified(), { checkId: 'pelvicTilt', grade: 'fail', source: 'coach' }];
    const { json } = await post({ screenId: 'scr-2', screen: 'modified', results });
    const row = stored()[0].metrics;
    expect(row.results.map((x: CheckResult) => x.checkId)).not.toContain('pelvicTilt');
    expect(row.results).toHaveLength(8);
    expect(json.summary).toMatchObject({ movementFlags: 0, score: 100, triage: 'proceed', ranAll: true });
    expect(json.paid).toBe(true);
    expect(m.grants).toHaveLength(1);
    expect(m.grants[0]).toMatchObject({ playerId: 'athlete-1', idempotencyKey: 'screen:athlete-1:scr-2' });
  });

  it('(c) a legacy-shaped body (provisional: true, no results) gets the not-graded line, not the step-back line', async () => {
    const { json } = await post({ screenId: 'scr-3', screen: 'full', provisional: true });
    expect(json.message).toBe(NOT_GRADED_LINE);
    expect(json.message).not.toMatch(/step back|run it again/i);
    expect(json.paid).toBe(false);
  });

  it('(d) a retried screenId writes one row, and pays once (the grant is keyed on it)', async () => {
    const body = { screenId: 'scr-4', screen: 'modified', results: allModified() };
    await post(body);
    await post(body);
    expect(stored()).toHaveLength(1);
    expect(new Set(m.grants.map((g) => (g as Row).idempotencyKey)).size).toBe(1);
  });

  it('three copies of one check with a made-up grade: not graded, not paid, not "Nothing flagged" (was: graded, 100, paid)', async () => {
    const junk = [0, 1, 2].map(() => ({ checkId: 'hipLevel', grade: 'whatever', source: 'camera' }));
    const { json } = await post({ screenId: 'scr-5', screen: 'modified', results: junk });
    expect(json.graded).toBe(false);
    expect(json.paid).toBe(false);
    expect(JSON.stringify(json)).not.toMatch(/Nothing flagged/);
    expect(stored()[0].metrics.results).toEqual([]);
  });

  it('three copies of one REAL check are one check: stored once, a partial screen, and not paid', async () => {
    const { json } = await post({ screenId: 'scr-6', screen: 'modified', results: [0, 1, 2].map(() => r('hipLevel', 'stable')) });
    expect(stored()[0].metrics.results).toEqual([r('hipLevel', 'stable')]);
    expect(json.summary).toMatchObject({ graded: true, score: null, triage: 'partial', ranAll: false });
    expect(json.paid).toBe(false);
  });

  it('a "full" claim over only the modified stations is stored as the modified screen', async () => {
    await post({ screenId: 'scr-7', screen: 'full', results: allModified() });
    expect(stored()[0].metrics.screen).toBe('modified');
    expect(stored()[0].metrics.summary.screen).toBe('modified');
  });

  it('asks who you are first', async () => {
    m.session = null;
    expect((await post({ screenId: 'x', results: [] })).status).toBe(401);
    expect(stored()).toEqual([]);
  });
});

describe('GET /api/coach/prescribe on the rows the screen route stores', () => {
  const asCoach = async () => {
    m.session = { user: { id: 'coach-1' } };
    const res = await prescribeGET(new NextRequest('http://fel.test/api/coach/prescribe?clientId=athlete-1'));
    return await res.json() as Row;
  };
  beforeEach(() => {
    m.db.coachClient = [{ id: 'cc1', coachId: 'coach-1', clientId: 'athlete-1', endedAt: null }];
    m.db.programExercise = [{ id: 'pe1', coachId: 'coach-1', name: 'Clamshell', category: 'hips' }];
  });

  it('a GRADED screen with a fail still drafts correctives (the panel works for real screens)', async () => {
    await post({ screenId: 'g1', screen: 'modified', results: allModified([r('kneeWindow', 'fail', 'left')]) });
    const draft = await asCoach();
    expect(draft.prescriptions.length).toBeGreaterThan(0);
    expect(draft.prescriptions[0].findingId).toBe('kneeWindow');
    expect(draft.reason).toBeUndefined();
    expect(draft.headline).toMatch(/Knee window failed on the left side/);
    expect(draft.complete).toBe(true);
  });

  it('a complete, all-stable screen is "clear_screen"; a partial one is "partial_screen" (was: no reason, read as clear)', async () => {
    await post({ screenId: 'c1', screen: 'modified', results: allModified() });
    expect(await asCoach()).toMatchObject({ prescriptions: [], reason: 'clear_screen', complete: true });
    m.db.workoutScan = [];
    m.session = { user: { id: 'athlete-1' } };
    await post({ screenId: 'p1', screen: 'modified', results: [r('heelLine', 'stable')] });
    expect(await asCoach()).toMatchObject({ prescriptions: [], reason: 'partial_screen', complete: false });
  });

  it('an ungraded run after a graded one does not hide it: the draft stands, and the newer run is named', async () => {
    await post({ screenId: 'g2', screen: 'modified', results: allModified([r('hipLevel', 'fail', 'right')]) });
    m.session = { user: { id: 'athlete-1' } };
    await post({ screenId: 'u2', screen: 'modified', results: [] });
    const draft = await asCoach();
    expect(draft.prescriptions.length).toBeGreaterThan(0);
    expect(draft.newerRunAt).toBeTruthy();
    expect(new Date(draft.screenAt).getTime()).toBeLessThan(new Date(draft.newerRunAt).getTime());
  });

  it('only ungraded runs: "ungraded_screen"; none at all: "no_screen"', async () => {
    expect(await asCoach()).toMatchObject({ reason: 'no_screen' });
    m.session = { user: { id: 'athlete-1' } };
    await post({ screenId: 'u3', screen: 'modified', results: [] });
    expect(await asCoach()).toMatchObject({ prescriptions: [], reason: 'ungraded_screen' });
  });

  it('a legacy row (redFlags only, stored before 2026-09-25) with a graded fail still drafts', async () => {
    const results = [r('kneeWindow', 'fail', 'left')];
    const { movementFlags: _a, graded: _b, ...legacySummary } = scoreScreen('modified', results);
    void _a; void _b;
    m.db.workoutScan.push({ id: 'old', userId: 'athlete-1', kind: MIRROR_SCREEN_KIND, createdAt: new Date(1_700_000_000_000), metrics: { screenId: 'old', screen: 'full', results, summary: legacySummary } });
    const draft = await asCoach();
    expect(draft.prescriptions[0]).toMatchObject({ findingId: 'kneeWindow' });
    expect(draft.complete).toBe(false);
  });
});

describe('GET /api/prq/export on a legacy screen row', () => {
  it('shows it as not graded, with the note — never "score 100 / Nothing flagged / Train normally"', async () => {
    const legacy = storedScreen('old-9', 'full', [], scoreScreen('full', []));
    const { graded: _g, ...noGradedKey } = legacy;
    void _g;
    m.db.workoutScan.push({ id: 'w9', userId: 'athlete-1', kind: MIRROR_SCREEN_KIND, createdAt: new Date(1_700_000_000_000), avatarSpec: null,
      metrics: { ...noGradedKey, summary: { ...legacy.summary, score: 100, triage: 'proceed', headline: 'Nothing flagged. That is a platform you can load.', programming: ['Train normally.'] } } });
    m.db.workoutScan.push({ id: 'w10', userId: 'athlete-1', kind: 'mirror_dunk', createdAt: new Date(1_700_000_001_000), avatarSpec: null, metrics: { verticalCm: 61 } });
    const res = await exportGET();
    const body = JSON.parse(await res.text()) as Row;
    const screen = body.movementHistory.find((x: Row) => x.id === 'w9');
    expect(screen.metrics).toMatchObject({ graded: false, screen: 'modified', note: LEGACY_SCREEN_NOTE });
    expect(screen.metrics.summary).toMatchObject({ score: null, triage: 'notGraded' });
    expect(JSON.stringify(screen)).not.toMatch(/Nothing flagged|Train normally/);
    expect(body.movementHistory.find((x: Row) => x.id === 'w10').metrics).toEqual({ verticalCm: 61 });
  });
});
