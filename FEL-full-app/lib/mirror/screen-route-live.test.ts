// The P3 live proof's own screen, through the real route (MIRROR-COACH P3 live proof, 2026-09-26).
//
// WHY. The live proof ran a Modified screen in the served harness on the lane's dev server (:3131). That server's
// database is offline and it has no session, so the harness's POST answered 401 at the real route and was carried by
// /dev/mirror-coach-p3-screen, which runs the route's library pipeline but not the route file itself. This test closes
// that gap: it posts THE BODY THE BROWSER SENT (lib/mirror/fixtures/p3LiveModifiedPost.json, captured unedited by
// scripts/probes/_mirror-p3-proof-live.mts) through app/api/mirror/screen/route.ts and app/api/coach/prescribe/route.ts
// with only the session, the database and the wallet's grant as stand-ins (the same stand-ins as screen-route.test.ts),
// and pins what the SERVER makes of it: the grades it re-decides, the score it computes, what it pays, the provisional
// rule at two readable checks, the answers kept without moving a scored number, and the coach's draft into Prep.
//
// What the body holds (the phone's grades): heel line pass; front stack — knee window FLAGGED on the left (0.67 hip
// half-widths inside the line), hip level and shoulder height pass; head float UNREADABLE, reason wrongView (0 of 301
// frames readable); both single-leg stances pass. Synthetic bodies, not a person. (That wrongView came from the facing
// test on a side-on body whose face and feet were unseen; since the P3 follow-up, 2026-09-28, the phone says
// 'faceFeetUnseen' for it — and since its review, 'lowVisibility' when the face and feet were in the shot but dim, which on
// a frame the framing check passed they nearly always are. The body below is the captured one, unedited, so it keeps the
// reason it was sent with.)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
const m = vi.hoisted(() => ({
  session: { user: { id: 'athlete-1' } } as unknown,
  db: { workoutScan: [] as Row[], coachClient: [] as Row[], coachingProgram: [] as Row[], programExercise: [] as Row[], prqEntry: [] as Row[], gameSession: [] as Row[], user: [] as Row[] },
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
    findUnique: async (a?: Row) => sorted(a)[0] ?? null,
    create: async (a: Row) => { const row = { id: `${name}-${rows().length + 1}`, createdAt: new Date(1_750_000_000_000 + ++m.clock * 1000), ...JSON.parse(JSON.stringify(a.data)) }; rows().push(row); return row; },
    update: async (a: Row) => {
      const row = rows().find((x) => x.id === a.where.id);
      if (!row) throw new Error('P2025');
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
import { MIRROR_SCREEN_KIND, notReadLines, scoreLine } from './screen';
import { regradeFromSummary } from './stationGraders';
import { ENDED_EARLY_LINE } from './screenReward';

const LIVE = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/p3LiveModifiedPost.json', import.meta.url)), 'utf8')) as Row;
const GRADES = LIVE.grades as Row[];
const only = (ids: string[]) => GRADES.filter((g) => ids.includes(g.checkId));

const send = (method: 'POST' | 'PATCH') => async (body: unknown) => {
  const req = new NextRequest('http://fel.test/api/mirror/screen', { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  const res = await (method === 'POST' ? screenPOST : screenPATCH)(req);
  return { status: res.status, json: await res.json() as Row };
};
const post = send('POST');
const patch = send('PATCH');
const stored = () => m.db.workoutScan.filter((r) => r.kind === MIRROR_SCREEN_KIND);

beforeEach(() => {
  m.session = { user: { id: 'athlete-1' } };
  for (const k of Object.keys(m.db) as (keyof typeof m.db)[]) m.db[k] = [];
  m.db.user = [{ id: 'athlete-1', dobYear: 1990 }];
  m.grants = [];
});

describe('the live proof\'s captured body is what the proof says it is', () => {
  it('seven camera grades from the served runner, each one re-decided by the server as the phone decided it', () => {
    expect(LIVE.screen).toBe('modified');
    expect(GRADES.map((g) => `${g.checkId}:${g.status}${g.side ? `:${g.side}` : ''}`)).toEqual([
      'heelLine:pass', 'kneeWindow:flag:left', 'hipLevel:pass', 'shoulderLevel:pass', 'headFloat:unreadable', 'singleLeg:pass:left', 'singleLeg:pass:right',
    ]);
    for (const g of GRADES) expect(regradeFromSummary(g)?.status, `${g.checkId} ${g.side ?? ''}`).toBe(g.status);
    expect(GRADES.find((g) => g.checkId === 'headFloat')).toMatchObject({ reason: 'wrongView', readableFrames: 0, value: null });
  });
});

describe('POST /api/mirror/screen on the live body (the server\'s score)', () => {
  it('graded by the server: 1 movement flag (one-sided, left knee), Score 78 from the 5 of 6 checks read (head float not read), paid', async () => {
    const { status, json } = await post(LIVE);
    expect(status).toBe(200);
    expect(json).toMatchObject({ graded: true, provisional: false, readableCameraChecks: 5, dropped: 0, paid: true, awarded: 25, screenId: LIVE.screenId });
    // CHANGED ON PURPOSE in the MIRROR-COACH P3 follow-up (2026-09-28) — owner decision #31, the proof's row 6. This pinned
    // `score: null` ("Score —" beside "Shards are in your wallet"): only a screen that ran every camera check had a score.
    // The server now scores over the checks it read — 100 − 22 for the one-sided knee flag — and says it over 5 of 6,
    // the same 5 as readableCameraChecks; the head float is listed as not read. Triage, headline and pay are unchanged.
    expect(json.summary).toMatchObject({
      score: 78, readCount: 5, totalCount: 6, notRead: ['Head float'],
      ranAll: false, movementFlags: 1, asymmetries: 1, triage: 'addressFirst', notMeasured: ['Head float'],
      headline: 'Knee window was flagged for a closer look on the left knee. One side off and one side fine matters more than both being mildly off.',
    });
    expect(scoreLine(json.summary)).toBe('Score 78 · from 5 of 6 checks read');
    expect(notReadLines(json.summary)).toEqual(['Head float · not read']);
    expect(json.summary.readCount).toBe(json.readableCameraChecks);
    expect(json.message).toBe('Screen logged. Shards are in your wallet.');
    const row = stored()[0].metrics;
    expect(row.summary).toMatchObject({ score: 78, readCount: 5, totalCount: 6 });
    expect(row).toMatchObject({ gradedBy: 'server', provisional: false, screen: 'modified' });
    expect(row.camera.map((c: Row) => `${c.checkId}:${c.status}:${c.view}`)).toEqual([
      'heelLine:pass:back', 'kneeWindow:flag:front', 'hipLevel:pass:front', 'shoulderLevel:pass:front', 'headFloat:unreadable:side', 'singleLeg:pass:front', 'singleLeg:pass:front',
    ]);
    // an unreadable check is no result at all: 6 results (both legs), none for head float
    expect(row.results.map((r: Row) => r.checkId)).toEqual(['heelLine', 'kneeWindow', 'hipLevel', 'shoulderLevel', 'singleLeg', 'singleLeg']);
    expect(m.grants).toHaveLength(1);
  });

  it('the provisional rule: the same body cut to TWO readable checks (heel line + knee window, two stations) is stored, provisional, not paid', async () => {
    const two = await post({ ...LIVE, screenId: 'live-two', grades: only(['heelLine', 'kneeWindow']) });
    expect(two.json).toMatchObject({ graded: true, provisional: true, readableCameraChecks: 2, paid: false, awarded: 0 });
    expect(two.json.message).toBe('The camera read 2 checks (Heel line, Knee window) — not enough to count as a screen, so it pays nothing this time.');
    expect(stored()[0].metrics).toMatchObject({ provisional: true, gradedBy: 'server' });
    expect(m.grants).toEqual([]);
    // three readable from two stations is a screen; three from the front stack alone is not
    expect((await post({ ...LIVE, screenId: 'live-three', grades: only(['heelLine', 'kneeWindow', 'hipLevel']) })).json).toMatchObject({ provisional: false, readableCameraChecks: 3, paid: true });
    expect((await post({ ...LIVE, screenId: 'live-front', grades: only(['kneeWindow', 'hipLevel', 'shoulderLevel']) })).json).toMatchObject({ provisional: true, readableCameraChecks: 3, paid: false });
  });

  it('the knee flag posted as a pass is refused (422): nothing stored, nothing paid', async () => {
    const { status, json } = await post({ ...LIVE, screenId: 'live-lie', grades: GRADES.map((g) => (g.checkId === 'kneeWindow' ? { ...g, status: 'pass' } : g)) });
    expect(status).toBe(422);
    expect(json.refused).toEqual([{ checkId: 'kneeWindow', claimed: 'pass', expected: 'flag', reason: 'status_does_not_follow' }]);
    expect(stored()).toEqual([]);
    expect(m.grants).toEqual([]);
  });
});

describe('PATCH + the coach\'s draft on the live screen', () => {
  it('the answers tapped in the live proof (Yes; Not sure) are kept and move no scored number; nothing is paid for them', async () => {
    await post(LIVE);
    const before = JSON.parse(JSON.stringify(stored()[0].metrics));
    const grants = m.grants.length;
    const r = await patch({ screenId: LIVE.screenId, answers: [{ questionId: 'lowerRibsWiden', answer: 'yes' }, { questionId: 'neckShouldersLift', answer: 'notSure' }] });
    expect(r.status).toBe(200);
    expect(r.json.selfReport).toEqual([
      { questionId: 'lowerRibsWiden', checkId: 'ribAngle', answer: 'yes' },
      { questionId: 'neckShouldersLift', checkId: 'ribAngle', answer: 'notSure' },
    ]);
    const { selfReport: _s, ...rest } = stored()[0].metrics;
    void _s;
    expect(rest).toEqual(before);
    expect(m.grants.length).toBe(grants);
  });

  it('three groups for the coach — camera (knee flag + FIX + block; head float to run again), answers withheld, no hands-on checks on a modified screen — and the knee corrective drafted into Prep', async () => {
    await post(LIVE);
    await patch({ screenId: LIVE.screenId, answers: [{ questionId: 'lowerRibsWiden', answer: 'yes' }] });
    m.session = { user: { id: 'coach-1' } };
    m.db.coachClient = [{ id: 'cc1', coachId: 'coach-1', clientId: 'athlete-1', endedAt: null }];
    m.db.programExercise = [
      { id: 'pe-hip9090', coachId: 'coach-1', name: 'Hip Circles (90/90)', category: 'mobility', pattern: 'mobility', skillLayer: 'joints', defaultTempo: '0-0-0-0' },
      { id: 'pe-goblet', coachId: 'coach-1', name: 'Goblet squat', category: 'lower-body', pattern: 'squat', skillLayer: 'strength', defaultTempo: '3-1-1-0' },
    ];
    const d = await (await prescribeGET(new NextRequest('http://fel.test/api/coach/prescribe?clientId=athlete-1'))).json() as Row;
    expect(d).toMatchObject({ serverGraded: true, provisional: false, complete: false, retests: 1 });
    // owner decision #31 on the coach's side too (P3 follow-up, 2026-09-28): the same score and the same count
    expect(d).toMatchObject({ score: 78, readCount: 5, totalCount: 6 });
    const cam = Object.fromEntries(d.review.camera.map((r: Row) => [`${r.checkId}${r.side ? `:${r.side}` : ''}`, r.status]));
    expect(cam).toMatchObject({ heelLine: 'pass', 'kneeWindow:left': 'flag', hipLevel: 'pass', shoulderLevel: 'pass', headFloat: 'retest' });
    const knee = d.review.camera.find((r: Row) => r.checkId === 'kneeWindow');
    expect(knee.fix).toMatch(/^Hip external-rotation and glute-medius work/);
    expect(knee.block).toMatchObject({ title: 'Ask the hips to lead the hinge' });
    expect(d.review.answers.map((a: Row) => a.said)).toEqual([ANSWERS_WITHHELD, ANSWERS_WITHHELD]);
    expect(d.review.coachChecks).toEqual([]);
    expect(d.prescriptions).toHaveLength(1);
    expect(d.prescriptions[0]).toMatchObject({ findingId: 'kneeWindow', side: 'left', section: 'prep', matchedBy: 'tags', exercise: { id: 'pe-hip9090' } });
  });
});

// ── MIRROR-COACH P3 follow-up review (2026-09-28): End after two stations paid the full screen ──────────────────────────
// The follow-up made End post what was read so far. Heels + the front stack (~26 s of holds) read 4 checks from 2
// stations — the owner's bar (decision #31) — and paid MOVEMENT_SCREEN_COMPLETED with "Screen logged. Shards are in your
// wallet." At 42c5e8a0 End posted nothing, so only a screen that reached its last station was ever paid. Whether an
// ended screen pays is the owner's call; until then an ENDED post pays only when every camera station was attempted.
describe('an ended screen (End pressed): kept and scored; paid only when every camera station was attempted', () => {
  const HEELS_AND_FRONT = GRADES.filter((g) => g.stationId === 'heels' || g.stationId === 'frontStack');

  it('End after heels + front stack: stored (ended), scored over what was read, NOT paid — and the retried id is answered from the row, unpaid', async () => {
    const { status, json } = await post({ ...LIVE, screenId: 'live-ended-two', grades: HEELS_AND_FRONT, ended: true });
    expect(status).toBe(200);
    expect(json).toMatchObject({ graded: true, provisional: false, readableCameraChecks: 4, paid: false, awarded: 0 });
    expect(json.message).toBe(ENDED_EARLY_LINE);                            // on the follow-up: "Screen logged. Shards are in your wallet."
    expect(scoreLine(json.summary)).toBe('Score 78 · from 4 of 6 checks read');
    expect(m.grants).toEqual([]);
    expect(stored()[0].metrics).toMatchObject({ ended: true, provisional: false, gradedBy: 'server' });
    // a retry of the same id — even one that drops the mark — is the stored screen's answer: no pay
    const again = await post({ ...LIVE, screenId: 'live-ended-two', grades: HEELS_AND_FRONT });
    expect(again.json).toMatchObject({ alreadyStored: true, paid: false, message: ENDED_EARLY_LINE });
    expect(m.grants).toEqual([]);
    expect(stored()).toHaveLength(1);
  });

  it('the bar itself is unchanged: the same two stations NOT marked ended pay as before (decision #31: >= 3 checks from >= 2 stations)', async () => {
    const { json } = await post({ ...LIVE, screenId: 'live-two-stations', grades: HEELS_AND_FRONT });
    expect(json).toMatchObject({ provisional: false, readableCameraChecks: 4, paid: true, awarded: 25 });
    expect(stored()[0].metrics.ended).toBeUndefined();
  });

  it('End during the last station\'s retest (every camera station attempted, one not read) pays like a screen run to the end', async () => {
    const { json } = await post({ ...LIVE, screenId: 'live-ended-late', ended: true });
    expect(json).toMatchObject({ provisional: false, readableCameraChecks: 5, paid: true, awarded: 25 });
    expect(json.message).toBe('Screen logged. Shards are in your wallet.');
    expect(stored()[0].metrics).toMatchObject({ ended: true });
  });
});
