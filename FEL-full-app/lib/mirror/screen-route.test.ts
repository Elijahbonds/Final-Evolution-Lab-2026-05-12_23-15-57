// POST + PATCH /api/mirror/screen, GET /api/coach/prescribe and GET /api/prq/export, run for real (MIRROR-COACH P1
// review, 2026-09-25; the server's re-check and the answers, MIRROR-COACH P3, 2026-09-25). Only the session, the
// database and the wallet's grant are stand-ins.
//
// WHY. The screen route is a pipeline — the claims re-check, scoreScreen, decideScreenReward, storedScreen — and each
// step was tested alone, while the baseline harness (lib/mirror/fixtures/measure.ts) re-implemented the route instead of
// calling it. A change that stored the raw body, or paid on the raw count, would have kept every unit test green. These
// post to the route and read what it stored, what it paid and what it said; then read the stored rows back through the
// coach's route and the athlete's export.
//
// P3: the client posts the GRADER'S SUMMARY per camera check (lib/mirror/screenClaims.ts claimFromGrade); the grades are
// the server's own. The `claim` helper below writes a summary whose numbers give the status it says (checked against
// the real stationGraders.regradeFromSummary in the first test), and one test grades the lane's landmark fixtures with
// the real graders and posts what the phone would.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
const m = vi.hoisted(() => ({
  session: { user: { id: 'athlete-1' } } as unknown,
  db: { workoutScan: [] as Row[], coachClient: [] as Row[], coachingProgram: [] as Row[], programExercise: [] as Row[], prqEntry: [] as Row[], gameSession: [] as Row[], user: [] as Row[] },
  grants: [] as unknown[],
  updates: 0,
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
    findUnique: async (a?: Row) => sorted(a)[0] ?? null,
    create: async (a: Row) => { const row = { id: `${name}-${rows().length + 1}`, createdAt: new Date(1_750_000_000_000 + ++m.clock * 1000), ...JSON.parse(JSON.stringify(a.data)) }; rows().push(row); return row; },
    update: async (a: Row) => {
      const row = rows().find((x) => x.id === a.where.id);
      if (!row) throw new Error('P2025');
      m.updates += 1;
      Object.assign(row, JSON.parse(JSON.stringify(a.data)));
      return row;
    },
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
import { PATCH as screenPATCH, POST as screenPOST } from '@/app/api/mirror/screen/route';
import { GET as prescribeGET } from '@/app/api/coach/prescribe/route';
import { ANSWERS_WITHHELD } from '@/lib/coach/mirrorToProgram';
import { GET as exportGET } from '@/app/api/prq/export/route';
import { MIRROR_SCREEN_KIND, NOT_GRADED_LINE, NOT_READ_LINE, scoreScreen, screenFor } from './screen';
import { LEGACY_SCREEN_NOTE, isServerGradedScreen, storedScreen } from './screenStore';
import { SCREEN_REFUSED_LINE, claimFromGrade, type CameraCheckClaim } from './screenClaims';
import { gradeScreenStation, regradeFromSummary } from './stationGraders';
import { readFixture } from './fixtures/load';
import { toAdapterFrames } from './fixtures/index';
import { stationFixture } from './fixtures/measure';

const send = (method: 'POST' | 'PATCH') => async (body: unknown) => {
  const req = new NextRequest('http://fel.test/api/mirror/screen', { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  const res = await (method === 'POST' ? screenPOST : screenPATCH)(req);
  return { status: res.status, json: await res.json() as Row };
};
const post = send('POST');
const patch = send('PATCH');
const stored = () => m.db.workoutScan.filter((r) => r.kind === MIRROR_SCREEN_KIND);

// ── the claims the phone would post ─────────────────────────────────────────────────────────────────────────────────

type Claim = CameraCheckClaim;
/** A readable, passing summary per camera slot: numbers well inside each check's line, a full hold of readable frames. */
const PASS = {
  heelLine: { checkId: 'heelLine', status: 'pass', value: 2, bySide: { left: 2, right: 1 }, unit: 'deg', frames: 360, readableFrames: 360, uncertainty: 0.5, spread: 4, stationId: 'heels', view: 'back' },
  kneeWindow: { checkId: 'kneeWindow', status: 'pass', value: 0.05, bySide: { left: 0.05, right: 0.02 }, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.01, spread: 0.1, stationId: 'frontStack', view: 'front' },
  hipLevel: { checkId: 'hipLevel', status: 'pass', value: 0.01, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.005, spread: 0.02, stationId: 'frontStack', view: 'front' },
  shoulderLevel: { checkId: 'shoulderLevel', status: 'pass', value: -0.01, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.005, spread: 0.02, stationId: 'frontStack', view: 'front' },
  headFloat: { checkId: 'headFloat', status: 'pass', value: 0.02, unit: 'ratio', frames: 300, readableFrames: 300, uncertainty: 0.005, spread: 0.02, stationId: 'profile', view: 'side' },
  singleLegL: { checkId: 'singleLeg', status: 'pass', value: 0.03, unit: 'px-norm', frames: 900, readableFrames: 900, uncertainty: 0.01, spread: null, touchDowns: 0, stanceSec: 28, side: 'left', stationId: 'wobbleL', view: 'front' },
  singleLegR: { checkId: 'singleLeg', status: 'pass', value: 0.04, unit: 'px-norm', frames: 900, readableFrames: 900, uncertainty: 0.01, spread: null, touchDowns: 0, stanceSec: 28, side: 'right', stationId: 'wobbleR', view: 'front' },
} satisfies Record<string, Claim>;
type Key = keyof typeof PASS;
const KEYS = Object.keys(PASS) as Key[];
const claim = (key: Key, over: Partial<Claim> = {}): Claim => ({ ...(PASS[key] as Claim), ...over });
/** Every camera slot, passing unless replaced (by key). */
const allClaims = (over: Partial<Record<Key, Claim>> = {}): Claim[] => KEYS.map((k) => over[k] ?? claim(k));
/** An unreadable summary the phone would post for a check it could not read. */
const unreadable = (key: Key): Claim => claim(key, { status: 'unreadable', value: null, readableFrames: 3, uncertainty: null, spread: null, reason: 'tooFewFrames', bySide: undefined });

beforeEach(() => {
  m.session = { user: { id: 'athlete-1' } };
  for (const k of Object.keys(m.db) as (keyof typeof m.db)[]) m.db[k] = [];
  // an adult athlete (P3 review: the coach's draft applies youth rules by birth year — none on file is youth)
  m.db.user = [{ id: 'athlete-1', dobYear: 1990 }];
  m.grants = [];
  m.updates = 0;
});

describe('the test\'s own claims are what the graders would say (so the tests below test the route)', () => {
  it('every PASS claim re-decides as pass, and the flag variants as flag', () => {
    for (const k of KEYS) expect(regradeFromSummary(PASS[k])?.status, k).toBe('pass');
    expect(regradeFromSummary(claim('hipLevel', { value: 0.12 }))?.status).toBe('flag');
    expect(regradeFromSummary(claim('singleLegL', { touchDowns: 2 }))?.status).toBe('flag');
    expect(regradeFromSummary(unreadable('hipLevel'))?.status).toBe('unreadable');
  });
});

describe('POST: the server re-decides every grade (MIRROR-COACH P3)', () => {
  it('the phone\'s own grades of the lane\'s fixture bodies, posted as the harness posts them, come back graded, scored and paid', async () => {
    const checks = screenFor('modified').flatMap((st) => {
      const f = toAdapterFrames(readFixture(stationFixture(st)));
      const dt = f[1].timestampMs - f[0].timestampMs;
      const frames = Array.from({ length: Math.round((st.holdSec * 1000) / dt) }, (_, i) => ({ ...f[i % f.length], timestampMs: i * dt }));
      return gradeScreenStation(st, frames, { aspect: 640 / 480 }).map((g) => claimFromGrade(g, st.view));
    });
    expect(checks).toHaveLength(7);
    const { status, json } = await post({ screenId: 'fx-1', screen: 'modified', checks });
    expect(status).toBe(200);
    expect(json).toMatchObject({ graded: true, provisional: false, readableCameraChecks: 6, paid: true, awarded: 25, screenId: 'fx-1' });
    expect(json.summary).toMatchObject({ score: 100, movementFlags: 0, triage: 'proceed', ranAll: true, notScored: ['Rib angle and breath'] });
    const row = stored()[0].metrics;
    expect(row).toMatchObject({ gradedBy: 'server', graded: true, provisional: false });
    expect(row.camera).toHaveLength(7);
    expect(row.camera.every((c: Row) => c.status === 'pass' && c.claimed === 'pass')).toBe(true);
  });

  it('the harness\'s own body — the runner\'s grades (no view: each names its station) beside its CheckResults — is read from the grades', async () => {
    const grades = screenFor('modified').flatMap((st) => {
      const f = toAdapterFrames(readFixture(stationFixture(st)));
      const dt = f[1].timestampMs - f[0].timestampMs;
      const frames = Array.from({ length: Math.round((st.holdSec * 1000) / dt) }, (_, i) => ({ ...f[i % f.length], timestampMs: i * dt }));
      return gradeScreenStation(st, frames, { aspect: 640 / 480 });
    });
    // the client's CheckResults say every check failed; the server never reads them when the grades are there
    const results = grades.map((g) => ({ checkId: g.checkId, grade: 'fail', source: 'camera', ...(g.side ? { side: g.side } : {}) }));
    const { json } = await post({ screenId: 'fx-2', screen: 'modified', results, grades });
    expect(json).toMatchObject({ graded: true, readableCameraChecks: 6, paid: true, dropped: 0 });
    expect(json.summary).toMatchObject({ movementFlags: 0, score: 100 });
    expect(stored()[0].metrics.camera.map((c: Row) => c.view)).toEqual(['back', 'front', 'front', 'front', 'side', 'front', 'front']);
    // a grade naming a station that does not ask its check is dropped (the heels station does not read the hips)
    const misfiled = { ...grades.find((g) => g.checkId === 'hipLevel')!, stationId: 'heels' };
    expect((await post({ screenId: 'fx-3', screen: 'modified', grades: [misfiled] })).json).toMatchObject({ dropped: 1, graded: false });
  });

  it('the SERVER\'s grades are stored — the client\'s note and a flag\'s side are re-derived, never read', async () => {
    const lying = claim('hipLevel', { status: 'flag', value: 0.12, side: 'right', note: 'Your right hip read higher.' });
    const { status, json } = await post({ screenId: 's-1', screen: 'modified', checks: allClaims({ hipLevel: lying }) });
    expect(status).toBe(200);
    expect(json.summary).toMatchObject({ graded: true, movementFlags: 1, asymmetries: 1, ranAll: true, triage: 'addressFirst' });
    // +0.12 = the LEFT hip higher (stationGraders' sign); the posted 'right' is not what gets stored
    expect(json.summary.headline).toBe('Hip level was flagged for a closer look: the left hip read higher.');
    const row = stored()[0].metrics;
    expect(row.results.find((r: Row) => r.checkId === 'hipLevel')).toMatchObject({ grade: 'fail', side: 'left', source: 'camera' });
    const hip = row.camera.find((c: Row) => c.checkId === 'hipLevel');
    expect(hip).toMatchObject({ status: 'flag', claimed: 'flag', side: 'left', value: 0.12 });
    expect(hip.note).toMatch(/^Your left hip read higher/);
    expect(isServerGradedScreen(row)).toBe(true);
    expect(json.paid).toBe(true);
  });

  it('REFUSES (422) a status that does not follow from its own value — nothing stored, nothing paid', async () => {
    const overTheLine = claim('hipLevel', { status: 'pass', value: 0.2 });
    const { status, json } = await post({ screenId: 's-2', screen: 'modified', checks: allClaims({ hipLevel: overTheLine }) });
    expect(status).toBe(422);
    expect(json).toMatchObject({ error: 'status_does_not_follow', message: SCREEN_REFUSED_LINE });
    expect(json.refused).toEqual([{ checkId: 'hipLevel', claimed: 'pass', expected: 'flag', reason: 'status_does_not_follow' }]);
    expect(stored()).toEqual([]);
    expect(m.grants).toEqual([]);
    // the other way too: a "flag" the numbers do not give
    const flagOnNothing = claim('headFloat', { status: 'flag', value: 0.01 });
    expect((await post({ screenId: 's-2b', screen: 'modified', checks: allClaims({ headFloat: flagOnNothing }) })).status).toBe(422);
    // and touch-downs that make the single-leg stance a flag cannot be posted as a pass
    expect((await post({ screenId: 's-2c', screen: 'modified', checks: allClaims({ singleLegR: claim('singleLegR', { touchDowns: 3 }) }) })).status).toBe(422);
    expect(stored()).toEqual([]);
  });

  it('REFUSES a "pass" on fewer readable frames than the table\'s minimum', async () => {
    const thin = claim('shoulderLevel', { readableFrames: 12 });
    const { status, json } = await post({ screenId: 's-3', screen: 'modified', checks: allClaims({ shoulderLevel: thin }) });
    expect(status).toBe(422);
    expect(json.refused).toEqual([{ checkId: 'shoulderLevel', claimed: 'pass', expected: 'unreadable', reason: 'too_few_frames_for_pass' }]);
    // 30 of 420 is under half the hold (the table's minReadableShare): refused too
    expect((await post({ screenId: 's-3b', screen: 'modified', checks: allClaims({ shoulderLevel: claim('shoulderLevel', { readableFrames: 30 }) }) })).status).toBe(422);
    expect(stored()).toEqual([]);
  });

  it('REFUSES a pass from the wrong view; the same claim posted as unreadable is kept, unread', async () => {
    const fromFront = claim('headFloat', { view: 'front' });
    expect((await post({ screenId: 's-4', screen: 'modified', checks: allClaims({ headFloat: fromFront }) })).json.refused)
      .toEqual([{ checkId: 'headFloat', claimed: 'pass', expected: 'unreadable', reason: 'status_does_not_follow' }]);
    const { status, json } = await post({ screenId: 's-4b', screen: 'modified', checks: allClaims({ headFloat: { ...fromFront, status: 'unreadable' } }) });
    expect(status).toBe(200);
    expect(json.summary.notMeasured).toEqual(['Head float']);
    expect(json.summary.score).toBeNull();                    // partial: a camera check was not read
    expect(stored()[0].metrics.camera.find((c: Row) => c.checkId === 'headFloat')).toMatchObject({ status: 'unreadable', value: null, claimed: 'unreadable' });
  });

  it('a check the phone gave up on is kept as unreadable even when its numbers would read — and never scores', async () => {
    const gaveUp = claim('kneeWindow', { status: 'unreadable' });
    const { json } = await post({ screenId: 's-5', screen: 'modified', checks: allClaims({ kneeWindow: gaveUp }) });
    const knee = stored()[0].metrics.camera.find((c: Row) => c.checkId === 'kneeWindow');
    expect(knee).toMatchObject({ status: 'unreadable', claimed: 'unreadable', value: null });
    expect(knee).not.toHaveProperty('bySide');
    expect(stored()[0].metrics.results.map((r: Row) => r.checkId)).not.toContain('kneeWindow');
    expect(json.summary.notMeasured).toEqual(['Knee window']);
  });
});

describe('POST: provisional under three readable camera checks, and only camera checks pay', () => {
  it('two readable camera checks: stored, provisional, NOT paid; three: paid', async () => {
    const two = [claim('hipLevel'), claim('shoulderLevel'), unreadable('heelLine'), unreadable('kneeWindow'), unreadable('headFloat'), unreadable('singleLegL'), unreadable('singleLegR')];
    const a = await post({ screenId: 'p-2', screen: 'modified', checks: two });
    expect(a.status).toBe(200);
    expect(a.json).toMatchObject({ graded: true, provisional: true, readableCameraChecks: 2, paid: false, awarded: 0 });
    // P3 review (2026-09-26): what was read and why the rest was not — never "step back and run it again"
    expect(a.json.message).toBe('The camera read 2 checks (Hip level, Shoulder height), all at one station — not enough to count as a screen, so it pays nothing this time. Most of the rest: too few clear frames (3 of the 180 it needs). Hold still in the shot for the whole count.');
    expect(a.json.message).not.toMatch(/step back/i);
    expect(stored()[0].metrics).toMatchObject({ provisional: true, gradedBy: 'server' });
    expect(m.grants).toEqual([]);

    const three = [claim('hipLevel'), claim('shoulderLevel'), claim('headFloat'), unreadable('heelLine'), unreadable('kneeWindow'), unreadable('singleLegL'), unreadable('singleLegR')];
    const b = await post({ screenId: 'p-3', screen: 'modified', checks: three });
    expect(b.json).toMatchObject({ provisional: false, readableCameraChecks: 3, paid: true });
    expect(m.grants).toHaveLength(1);
    expect(m.grants[0]).toMatchObject({ idempotencyKey: 'screen:athlete-1:p-3', metadata: { readableCameraChecks: 3 } });
  });

  // MIRROR-COACH P3 review (2026-09-26): the front stack carries three camera checks, so one station read alone was paid
  // and stored as current data
  it('one station is not a screen: the front stack alone comes back provisional, unpaid, and not current data', async () => {
    const front = [claim('kneeWindow'), claim('hipLevel'), claim('shoulderLevel'), unreadable('heelLine'), unreadable('headFloat'), unreadable('singleLegL'), unreadable('singleLegR')];
    const { json } = await post({ screenId: 'fs-1', screen: 'modified', checks: front });
    expect(json).toMatchObject({ readableCameraChecks: 3, provisional: true, paid: false, awarded: 0 });
    expect(json.message).toMatch(/all at one station — not enough to count as a screen/);
    expect(m.grants).toEqual([]);
    expect(stored()[0].metrics).toMatchObject({ provisional: true, gradedBy: 'server' });
    const { isScanEquivalentScreen } = await import('@/lib/coach/attention');
    expect(isScanEquivalentScreen(stored()[0].metrics)).toBe(false);
  });

  it('both legs of the single-leg stance are ONE readable check (two passing legs + one other = provisional)', async () => {
    const { json } = await post({ screenId: 'p-legs', screen: 'modified', checks: [claim('singleLegL'), claim('singleLegR'), claim('hipLevel')] });
    expect(json).toMatchObject({ readableCameraChecks: 2, provisional: true, paid: false });
  });

  it('nothing readable: the not-read line with the reason, stored ungraded, not paid, no retry prompt', async () => {
    const { json } = await post({ screenId: 'p-0', screen: 'modified', checks: KEYS.map(unreadable) });
    expect(json).toMatchObject({ graded: false, paid: false });
    // P3 review: the camera tried — "Not graded yet" (a grader to come) is for a screen with no grades at all
    expect(json.message).toMatch(/^The camera could not read any of this screen's checks, so it does not count and pays nothing\. Most of the rest: too few clear frames/);
    expect(json.message).not.toMatch(/step back|not graded yet/i);
    expect(json.summary.headline).toBe(NOT_READ_LINE);
    expect(stored()[0].metrics).toMatchObject({ graded: false, results: [], provisional: true });
    expect(stored()[0].metrics.camera).toHaveLength(7);
  });

  it('self-report answers never pay and never change a scored number', async () => {
    const answers = [{ questionId: 'lowerRibsWiden', answer: 'no' }, { questionId: 'neckShouldersLift', answer: 'yes' }];
    const two = [claim('hipLevel'), claim('shoulderLevel')];
    const without = await post({ screenId: 'sr-1', screen: 'modified', checks: two });
    const withAnswers = await post({ screenId: 'sr-2', screen: 'modified', checks: two, answers });
    expect(withAnswers.json.summary).toEqual(without.json.summary);
    expect(withAnswers.json).toMatchObject({ paid: false, provisional: true, readableCameraChecks: 2 });
    expect(stored()[1].metrics.selfReport).toEqual([
      { questionId: 'lowerRibsWiden', checkId: 'ribAngle', answer: 'no' },
      { questionId: 'neckShouldersLift', checkId: 'ribAngle', answer: 'yes' },
    ]);
    // a breath "check" dressed as a camera claim is not a camera check: dropped, not counted, not paid
    const dressed = [...two, { checkId: 'ribAngle', status: 'pass', value: 0, unit: 'ratio', frames: 240, readableFrames: 240, view: 'front', uncertainty: 0, spread: 0 }];
    const d = await post({ screenId: 'sr-3', screen: 'modified', checks: dressed });
    expect(d.json).toMatchObject({ readableCameraChecks: 2, paid: false, dropped: 1 });
    expect(m.grants).toEqual([]);
  });

  it('a coach check posted by the athlete\'s device is not scored either', async () => {
    const coach = { checkId: 'pelvicTilt', status: 'pass', value: 0, unit: 'ratio', frames: 300, readableFrames: 300, view: 'side' };
    const { json } = await post({ screenId: 'c-1', screen: 'full', checks: [claim('hipLevel'), claim('shoulderLevel'), coach] });
    expect(json).toMatchObject({ readableCameraChecks: 2, paid: false, dropped: 1 });
    expect(json.summary.notScored).toEqual(['Rib angle and breath', 'Pelvic tilt (hands on the hip points)', 'Seated rotation, each side']);
  });
});

describe('POST: duplicates, foreign checks, junk and bare grades are dropped', () => {
  it('a duplicate check: the FIRST is kept — a later "pass" cannot replace a flag', async () => {
    const flag = claim('hipLevel', { status: 'flag', value: 0.12 });
    const { json } = await post({ screenId: 'd-1', screen: 'modified', checks: [...allClaims({ hipLevel: flag }), claim('hipLevel'), claim('singleLegL', { value: 0.05 })] });
    expect(json.dropped).toBe(2);
    expect(json.summary.movementFlags).toBe(1);
    const row = stored()[0].metrics;
    expect(row.camera.filter((c: Row) => c.checkId === 'hipLevel')).toHaveLength(1);
    expect(row.camera.filter((c: Row) => c.checkId === 'singleLeg').map((c: Row) => [c.side, c.value])).toEqual([['left', 0.03], ['right', 0.04]]);
  });

  it('a check the claimed variant does not have is dropped; a single-leg claim whose station names the other leg is dropped', async () => {
    const wrongLeg = claim('singleLegL', { side: 'right' });              // stationId wobbleL, side right
    const foreign = { checkId: 'thoracicRotation', status: 'pass', value: 0, unit: 'deg', frames: 1, readableFrames: 1, view: 'front' };
    const { json } = await post({ screenId: 'd-2', screen: 'modified', checks: [claim('hipLevel'), foreign, wrongLeg, { checkId: 'madeUp', status: 'pass' }] });
    expect(json.dropped).toBe(3);
    expect(stored()[0].metrics.camera.map((c: Row) => c.checkId)).toEqual(['hipLevel']);
  });

  it('the pre-P3 shape — bare grades, three copies, made-up grades — is not graded and not paid (was: graded, 100, paid)', async () => {
    const bare = [{ checkId: 'hipLevel', grade: 'stable', source: 'camera' }, { checkId: 'heelLine', grade: 'stable', source: 'camera' }, { checkId: 'headFloat', grade: 'stable', source: 'camera' }];
    const a = await post({ screenId: 'j-1', screen: 'modified', results: bare });
    expect(a.json).toMatchObject({ graded: false, paid: false, dropped: 3 });
    expect(JSON.stringify(a.json)).not.toMatch(/Nothing flagged/);
    const junk = [0, 1, 2].map(() => ({ checkId: 'hipLevel', grade: 'whatever', source: 'camera' }));
    expect((await post({ screenId: 'j-2', screen: 'modified', results: junk })).json).toMatchObject({ graded: false, paid: false });
    expect(stored().map((r) => r.metrics.results)).toEqual([[], []]);
    expect(m.grants).toEqual([]);
  });

  it('three copies of one REAL claim are one check: stored once, a partial screen, not paid', async () => {
    const { json } = await post({ screenId: 'j-3', screen: 'modified', checks: [claim('hipLevel'), claim('hipLevel'), claim('hipLevel')] });
    expect(stored()[0].metrics.results).toEqual([{ checkId: 'hipLevel', grade: 'stable', source: 'camera', detail: expect.stringMatching(/estimated$/) }]);
    expect(json.summary).toMatchObject({ graded: true, score: null, triage: 'partial', ranAll: false });
    expect(json).toMatchObject({ paid: false, dropped: 2 });
  });

  it('malformed numbers are dropped, never thrown on', async () => {
    const bad = [
      claim('hipLevel', { unit: 'deg' }), claim('shoulderLevel', { readableFrames: 500 }), claim('headFloat', { value: 'big' as unknown as number }),
      claim('kneeWindow', { bySide: undefined }), { ...claim('heelLine'), status: 'great' }, null, 'x', 7,
    ];
    const { status, json } = await post({ screenId: 'j-4', screen: 'modified', checks: bad });
    expect(status).toBe(200);
    expect(json).toMatchObject({ graded: false, paid: false, dropped: 8 });
    // a pass with no value (NaN travels as null in JSON) is not malformed, it is a status its numbers do not give
    expect((await post({ screenId: 'j-5', screen: 'modified', checks: [claim('headFloat', { value: null })] })).status).toBe(422);
  });
});

describe('POST: the rest of the P1 contract still holds', () => {
  it('(a) an empty screen is stored ungraded with no score, pays nothing, and answers with the not-graded line', async () => {
    const { status, json } = await post({ screenId: 'scr-1', screen: 'modified', checks: [] });
    expect(status).toBe(200);
    expect(json).toMatchObject({ graded: false, paid: false, awarded: 0, message: NOT_GRADED_LINE, screenId: 'scr-1' });
    expect(json.summary.score).toBeNull();
    expect(stored()[0].metrics).toMatchObject({ screenId: 'scr-1', screen: 'modified', graded: false, results: [] });
    expect(stored()[0].metrics.summary).toMatchObject({ score: null, triage: 'notGraded', headline: NOT_GRADED_LINE });
  });

  it('(c) a legacy-shaped body (provisional: true, no results) gets the not-graded line, not the step-back line', async () => {
    const { json } = await post({ screenId: 'scr-3', screen: 'full', provisional: true });
    expect(json.message).toBe(NOT_GRADED_LINE);
    expect(json.message).not.toMatch(/step back|run it again/i);
    expect(json.paid).toBe(false);
  });

  it('a client that says provisional: false cannot make a two-check screen pay (the server counts)', async () => {
    const { json } = await post({ screenId: 'scr-3b', screen: 'modified', provisional: false, checks: [claim('hipLevel'), claim('shoulderLevel')] });
    expect(json.paid).toBe(false);
  });

  it('(d) a retried screenId writes one row, and pays once (the grant is keyed on it)', async () => {
    const body = { screenId: 'scr-4', screen: 'modified', checks: allClaims() };
    await post(body);
    await post(body);
    expect(stored()).toHaveLength(1);
    expect(new Set(m.grants.map((g) => (g as Row).idempotencyKey)).size).toBe(1);
  });

  // MIRROR-COACH P3 review (2026-09-26): the dedupe compared only the NEWEST row and re-decided pay from the new body
  it('(e) a provisional screen re-posted with more checks is answered from its stored row: not paid, not stored again', async () => {
    const thin = await post({ screenId: 'up-1', screen: 'modified', checks: [claim('hipLevel'), claim('shoulderLevel')] });
    expect(thin.json).toMatchObject({ provisional: true, paid: false });
    const upgraded = await post({ screenId: 'up-1', screen: 'modified', checks: allClaims() });
    expect(upgraded.json).toMatchObject({ provisional: true, paid: false, awarded: 0, alreadyStored: true, readableCameraChecks: 2, screenId: 'up-1' });
    expect(stored()).toHaveLength(1);
    expect(stored()[0].metrics.provisional).toBe(true);
    expect(m.grants).toEqual([]);
  });

  it('(f) an OLD screen re-posted after a newer one is not stored again as the newest', async () => {
    const flagged = allClaims({ hipLevel: claim('hipLevel', { status: 'flag', value: -0.12 }) });
    await post({ screenId: 'old-a', screen: 'modified', checks: flagged });
    await post({ screenId: 'new-b', screen: 'modified', checks: allClaims() });
    const replay = await post({ screenId: 'old-a', screen: 'modified', checks: flagged });
    expect(replay.json).toMatchObject({ alreadyStored: true, paid: true, screenId: 'old-a' });
    expect(stored().map((r) => r.metrics.screenId)).toEqual(['old-a', 'new-b']);
    // the replay's grant is the same idempotent key as the first post's: one screen, paid once
    expect(new Set(m.grants.map((g) => (g as Row).idempotencyKey))).toEqual(new Set(['screen:athlete-1:old-a', 'screen:athlete-1:new-b']));
  });

  it('a "full" screen is stored as full, and scores exactly as the modified one over the same camera checks', async () => {
    const full = await post({ screenId: 'scr-7', screen: 'full', checks: allClaims() });
    const mod = await post({ screenId: 'scr-8', screen: 'modified', checks: allClaims() });
    expect(stored()[0].metrics.screen).toBe('full');
    expect({ ...full.json.summary, screen: '', notScored: [] }).toEqual({ ...mod.json.summary, screen: '', notScored: [] });
  });

  it('asks who you are first', async () => {
    m.session = null;
    expect((await post({ screenId: 'x', checks: [] })).status).toBe(401);
    expect((await patch({ screenId: 'x', answers: [] })).status).toBe(401);
    expect(stored()).toEqual([]);
  });
});

describe('PATCH: the breath answers are kept on the screen, and nothing else moves', () => {
  it('merges answers into the athlete\'s own screen — results, summary, graded and provisional untouched, nothing paid', async () => {
    await post({ screenId: 'a-1', screen: 'modified', checks: allClaims() });
    const grantsBefore = m.grants.length;
    const before = JSON.parse(JSON.stringify(stored()[0].metrics));
    const one = await patch({ screenId: 'a-1', answers: [{ questionId: 'lowerRibsWiden', answer: 'notSure' }] });
    expect(one.status).toBe(200);
    expect(one.json.selfReport).toEqual([{ questionId: 'lowerRibsWiden', checkId: 'ribAngle', answer: 'notSure' }]);
    const two = await patch({ screenId: 'a-1', answers: [{ questionId: 'neckShouldersLift', answer: 'no' }, { questionId: 'lowerRibsWiden', answer: 'yes' }] });
    expect(two.json.selfReport).toEqual([
      { questionId: 'lowerRibsWiden', checkId: 'ribAngle', answer: 'yes' },
      { questionId: 'neckShouldersLift', checkId: 'ribAngle', answer: 'no' },
    ]);
    const { selfReport: _s, ...rest } = stored()[0].metrics;
    void _s;
    expect(rest).toEqual(before);
    expect(m.grants.length).toBe(grantsBefore);
    expect(m.updates).toBe(2);
  });

  it('404 for a screen that is not the caller\'s; 400 for no real answer; 400 without an id', async () => {
    await post({ screenId: 'a-2', screen: 'modified', checks: allClaims() });
    m.session = { user: { id: 'someone-else' } };
    expect((await patch({ screenId: 'a-2', answers: [{ questionId: 'lowerRibsWiden', answer: 'yes' }] })).status).toBe(404);
    m.session = { user: { id: 'athlete-1' } };
    expect((await patch({ screenId: 'nope', answers: [{ questionId: 'lowerRibsWiden', answer: 'yes' }] })).status).toBe(404);
    expect((await patch({ screenId: 'a-2', answers: [{ questionId: 'lowerRibsWiden', answer: 'maybe' }, { questionId: 'pelvicTilt', answer: 'yes' }] })).status).toBe(400);
    expect((await patch({ answers: [] })).status).toBe(400);
    expect(m.updates).toBe(0);
  });

  it('answers go onto an ungraded screen too (the run happened), and it stays ungraded', async () => {
    await post({ screenId: 'a-3', screen: 'modified', checks: [] });
    const { status } = await patch({ screenId: 'a-3', answers: [{ questionId: 'neckShouldersLift', answer: 'yes' }] });
    expect(status).toBe(200);
    expect(stored()[0].metrics).toMatchObject({ graded: false, results: [], summary: { score: null, triage: 'notGraded' } });
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

  it('a GRADED screen with a server flag drafts correctives', async () => {
    const knee = claim('kneeWindow', { status: 'flag', value: 0.7, bySide: { left: 0.7, right: 0.05 } });
    await post({ screenId: 'g1', screen: 'modified', checks: allClaims({ kneeWindow: knee }) });
    const draft = await asCoach();
    expect(draft.prescriptions.length).toBeGreaterThan(0);
    expect(draft.prescriptions[0].findingId).toBe('kneeWindow');
    expect(draft.reason).toBeUndefined();
    expect(draft.headline).toMatch(/Knee window was flagged for a closer look on the left knee/);
    expect(draft.complete).toBe(true);
  });

  it('a complete, all-pass screen is "clear_screen"; a partial one is "partial_screen"', async () => {
    await post({ screenId: 'c1', screen: 'modified', checks: allClaims() });
    expect(await asCoach()).toMatchObject({ prescriptions: [], reason: 'clear_screen', complete: true });
    m.db.workoutScan = [];
    m.session = { user: { id: 'athlete-1' } };
    await post({ screenId: 'p1', screen: 'modified', checks: [claim('heelLine')] });
    expect(await asCoach()).toMatchObject({ prescriptions: [], reason: 'partial_screen', complete: false });
  });

  it('an ungraded run after a graded one does not hide it: the draft stands, and the newer run is named', async () => {
    await post({ screenId: 'g2', screen: 'modified', checks: allClaims({ hipLevel: claim('hipLevel', { status: 'flag', value: -0.12 }) }) });
    m.session = { user: { id: 'athlete-1' } };
    await post({ screenId: 'u2', screen: 'modified', checks: [] });
    const draft = await asCoach();
    expect(draft.prescriptions.length).toBeGreaterThan(0);
    expect(draft.newerRunAt).toBeTruthy();
    expect(new Date(draft.screenAt).getTime()).toBeLessThan(new Date(draft.newerRunAt).getTime());
  });

  it('only ungraded runs: "ungraded_screen"; none at all: "no_screen"', async () => {
    expect(await asCoach()).toMatchObject({ reason: 'no_screen' });
    m.session = { user: { id: 'athlete-1' } };
    await post({ screenId: 'u3', screen: 'modified', checks: [] });
    expect(await asCoach()).toMatchObject({ prescriptions: [], reason: 'ungraded_screen' });
  });

  it('OLD ROWS stored with empty results stay readable as "not graded", and a newer graded screen reads past them', async () => {
    const legacy = storedScreen('old-empty', 'full', [], scoreScreen('full', []));
    const { graded: _g, ...noGradedKey } = legacy;
    void _g;
    m.db.workoutScan.push({ id: 'old', userId: 'athlete-1', kind: MIRROR_SCREEN_KIND, createdAt: new Date(1_700_000_000_000), metrics: { ...noGradedKey, summary: { ...legacy.summary, score: 100, triage: 'proceed' } } });
    expect(await asCoach()).toMatchObject({ prescriptions: [], reason: 'ungraded_screen' });
    m.session = { user: { id: 'athlete-1' } };
    await post({ screenId: 'new-1', screen: 'modified', checks: allClaims() });
    expect(await asCoach()).toMatchObject({ reason: 'clear_screen', complete: true });
  });

  it('a legacy row (redFlags only, stored before 2026-09-25) with a camera fail still drafts', async () => {
    const results = [{ checkId: 'kneeWindow', grade: 'fail' as const, side: 'left' as const, source: 'camera' as const }];
    const { movementFlags: _a, graded: _b, ...legacySummary } = scoreScreen('modified', results);
    void _a; void _b;
    m.db.workoutScan.push({ id: 'old', userId: 'athlete-1', kind: MIRROR_SCREEN_KIND, createdAt: new Date(1_700_000_000_000), metrics: { screenId: 'old', screen: 'full', results, summary: legacySummary } });
    const draft = await asCoach();
    expect(draft.prescriptions[0]).toMatchObject({ findingId: 'kneeWindow' });
    expect(draft.complete).toBe(false);
  });
});

// MIRROR-COACH P3 review (2026-09-26): who may read the draft, a youth client's draft, the answers behind consent, and a run
// the camera tried and read nothing of
describe('GET /api/coach/prescribe — the review\'s cases', () => {
  const asCoach = async (coach = 'coach-1') => {
    m.session = { user: { id: coach } };
    const res = await prescribeGET(new NextRequest('http://fel.test/api/coach/prescribe?clientId=athlete-1'));
    return { status: res.status, json: await res.json() as Row };
  };
  const asAthlete = () => { m.session = { user: { id: 'athlete-1' } }; };

  it('a coach with only a program row (made without the client), or an ENDED link, gets 403 and reads nothing', async () => {
    asAthlete();
    await post({ screenId: 'auth-1', screen: 'modified', checks: allClaims({ hipLevel: claim('hipLevel', { status: 'flag', value: -0.12 }) }) });
    m.db.coachingProgram = [{ id: 'prog-b', coachId: 'coach-b', clientId: 'athlete-1', isActive: true }];
    expect(await asCoach('coach-b')).toMatchObject({ status: 403, json: { error: 'not_your_client' } });
    m.db.coachClient = [{ id: 'cc-old', coachId: 'coach-c', clientId: 'athlete-1', endedAt: new Date(1_750_000_000_000) }];
    m.db.coachingProgram.push({ id: 'prog-c', coachId: 'coach-c', clientId: 'athlete-1', isActive: true });
    expect(await asCoach('coach-c')).toMatchObject({ status: 403, json: { error: 'not_your_client' } });
    m.db.coachClient.push({ id: 'cc1', coachId: 'coach-1', clientId: 'athlete-1', endedAt: null });
    expect((await asCoach('coach-1')).status).toBe(200);
  });

  it('the breath answers are withheld from the coach until the client consents (owner decision #4)', async () => {
    m.db.coachClient = [{ id: 'cc1', coachId: 'coach-1', clientId: 'athlete-1', endedAt: null }];
    asAthlete();
    await post({ screenId: 'ans-1', screen: 'modified', checks: allClaims(), answers: [{ questionId: 'lowerRibsWiden', answer: 'no' }, { questionId: 'neckShouldersLift', answer: 'yes' }] });
    expect(stored()[0].metrics.selfReport).toHaveLength(2);           // kept on the athlete's own row, as before
    const { json } = await asCoach();
    expect(json.review.answersWithheld).toBe(true);
    expect(json.review.answers.map((a: Row) => a.answer)).toEqual([null, null]);
    expect(JSON.stringify(json)).not.toMatch(/They said/);
  });

  it('a youth client (no birth year on file): no written blocks, pin rows not offered, and the draft says why', async () => {
    m.db.user = [{ id: 'athlete-1', dobYear: null }];
    m.db.coachClient = [{ id: 'cc1', coachId: 'coach-1', clientId: 'athlete-1', endedAt: null }];
    m.db.programExercise = [
      { id: 'pe-pin', coachId: 'coach-1', name: 'Calf pin and stretch', category: 'mobility', pattern: null, skillLayer: 'joints', defaultTempo: null },
      { id: 'pe-raise', coachId: 'coach-1', name: 'Slow calf raise', category: 'mobility', pattern: null, skillLayer: 'joints', defaultTempo: null },
    ];
    asAthlete();
    await post({ screenId: 'y-1', screen: 'modified', checks: allClaims({ heelLine: claim('heelLine', { status: 'flag', value: 14, bySide: { left: 14, right: 2 } }), hipLevel: claim('hipLevel', { status: 'flag', value: -0.12 }) }) });
    const { json } = await asCoach();
    expect(json).toMatchObject({ youth: 'unknownAge', pinRowsSkipped: 1 });
    expect(json.youthNote).toMatch(/youth rules apply/);
    const heel = json.prescriptions.find((p: Row) => p.findingId === 'heelLine');
    expect(heel.exercise).toMatchObject({ id: 'pe-raise' });       // not the pin
    expect(json.prescriptions.every((p: Row) => p.block === null)).toBe(true);
    expect(json.review.camera.every((r: Row) => r.block === null)).toBe(true);
    // an adult client: the pin row may be offered, and the blocks are there
    m.db.user = [{ id: 'athlete-1', dobYear: 1990 }];
    const adult = (await asCoach()).json;
    expect(adult.youth).toBeUndefined();
    expect(adult.prescriptions.find((p: Row) => p.findingId === 'hipLevel').block).toMatchObject({ title: 'Trunk and hip hold' });
  });

  it('a run the camera tried and read nothing of says why ("unread_screen"); a run with no grades stays "ungraded_screen"', async () => {
    m.db.coachClient = [{ id: 'cc1', coachId: 'coach-1', clientId: 'athlete-1', endedAt: null }];
    asAthlete();
    await post({ screenId: 'un-1', screen: 'modified', checks: KEYS.map(unreadable) });
    const { json } = await asCoach();
    expect(json).toMatchObject({ prescriptions: [], reason: 'unread_screen', unread: { why: expect.stringMatching(/^too few clear frames/), hint: 'Hold still in the shot for the whole count.' } });
    m.db.workoutScan = [];
    asAthlete();
    await post({ screenId: 'un-2', screen: 'modified', checks: [] });
    expect((await asCoach()).json).toMatchObject({ reason: 'ungraded_screen' });
  });
});

// MIRROR-COACH P3 (2026-09-26): the coach's prescription from REAL results, through the real route — the catalogue
// matched on its P2 tags, the three groups, retests never clear, and the last GRADED screen when a newer run read nothing.
describe('GET /api/coach/prescribe — the draft from real results (P3)', () => {
  const asCoach = async () => {
    m.session = { user: { id: 'coach-1' } };
    const res = await prescribeGET(new NextRequest('http://fel.test/api/coach/prescribe?clientId=athlete-1'));
    return await res.json() as Row;
  };
  const asAthlete = () => { m.session = { user: { id: 'athlete-1' } }; };
  beforeEach(() => {
    m.db.coachClient = [{ id: 'cc1', coachId: 'coach-1', clientId: 'athlete-1', endedAt: null }];
    m.db.programExercise = [
      { id: 'pe-thrust', coachId: 'coach-1', name: 'Hip thrust', category: 'lower-body', pattern: 'hinge', skillLayer: 'strength', defaultTempo: '2-1-1-0' },
      { id: 'pe-split', coachId: 'coach-1', name: 'Split squat', category: 'lower-body', pattern: 'lunge', skillLayer: 'strength', defaultTempo: '3-1-1-0' },
      { id: 'pe-other', coachId: 'coach-2', name: 'Their split squat', category: 'lower-body', pattern: 'lunge', skillLayer: 'strength', defaultTempo: '3-1-1-0' },
    ];
  });

  it('a flag drafts its FIX line, block and a TAG-matched exercise from THIS coach\'s catalogue, into Prep', async () => {
    asAthlete();
    await post({ screenId: 'r1', screen: 'modified', checks: allClaims({ hipLevel: claim('hipLevel', { status: 'flag', value: -0.12 }) }) });
    const d = await asCoach();
    expect(d.prescriptions).toHaveLength(1);
    expect(d.prescriptions[0]).toMatchObject({
      findingId: 'hipLevel', side: 'right', section: 'prep', matchedBy: 'tags', exercise: { id: 'pe-split' },
      value: '0.12 of a shoulder width, right higher · estimated',
      block: { title: 'Trunk and hip hold', kind: 'activate' },
    });
    expect(d.prescriptions[0].fix).toMatch(/^Single-leg hip work on the low side/);
    expect(d).toMatchObject({ serverGraded: true, provisional: false, complete: true, retests: 0 });
    expect(d.reason).toBeUndefined();
  });

  it('three groups: the camera (a retest for what was not read, never clear), their answers (withheld until they consent), the hands-on checks', async () => {
    asAthlete();
    await post({ screenId: 'r2', screen: 'full', checks: allClaims({ headFloat: unreadable('headFloat') }), answers: [{ questionId: 'lowerRibsWiden', answer: 'yes' }] });
    const d = await asCoach();
    expect(d.prescriptions).toEqual([]);
    expect(d.reason).toBe('partial_screen');
    expect(d.review.camera.find((r: Row) => r.checkId === 'headFloat')).toMatchObject({ status: 'retest', statusLabel: 'Retest', value: null });
    expect(d.review.camera.filter((r: Row) => r.status === 'pass')).toHaveLength(6);
    // P3 review (owner decision #4): the questions, not the answers, until the client consents (phase 5)
    expect(d.review.answers.map((a: Row) => a.said)).toEqual([ANSWERS_WITHHELD, ANSWERS_WITHHELD]);
    expect(d.review.answersWithheld).toBe(true);
    expect(d.review.coachChecks.map((c: Row) => c.checkId)).toEqual(['pelvicTilt', 'thoracicRotation']);
    expect(d.review.note).toBe('This is what the camera saw, not a diagnosis.');
  });

  it('a newer run the camera could not read at all does not hide the graded screen before it', async () => {
    asAthlete();
    await post({ screenId: 'r3', screen: 'modified', checks: allClaims({ kneeWindow: claim('kneeWindow', { status: 'flag', value: 0.7, bySide: { left: 0.7, right: 0.05 } }) }) });
    asAthlete();
    await post({ screenId: 'r4', screen: 'modified', checks: KEYS.map(unreadable) });
    expect(stored().map((r) => r.metrics.graded)).toEqual([true, false]);
    const d = await asCoach();
    expect(d.prescriptions.map((p: Row) => p.findingId)).toEqual(['kneeWindow']);
    expect(d.newerRunAt).toBeTruthy();
    expect(new Date(d.screenAt).getTime()).toBeLessThan(new Date(d.newerRunAt).getTime());
  });
});

describe('GET /api/prq/export', () => {
  it('shows a legacy row as not graded, with the note — never "score 100 / Nothing flagged / Train normally"', async () => {
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

  it('a P3 row exports as stored: the server\'s grades, the camera evidence, the answers', async () => {
    await post({ screenId: 'e-1', screen: 'modified', checks: allClaims(), answers: [{ questionId: 'lowerRibsWiden', answer: 'yes' }] });
    const res = await exportGET();
    const body = JSON.parse(await res.text()) as Row;
    const screen = body.movementHistory.find((x: Row) => x.metrics?.screenId === 'e-1');
    expect(screen.metrics).toMatchObject({ gradedBy: 'server', graded: true, selfReport: [{ questionId: 'lowerRibsWiden', answer: 'yes' }] });
    expect(screen.metrics.camera).toHaveLength(7);
    expect(screen.metrics).not.toHaveProperty('note');
  });
});
