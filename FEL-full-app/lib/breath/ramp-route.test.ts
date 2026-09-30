// MIRROR-COACH P7 (2026-09-29): app/api/breath/ramp, run for real over the in-memory Today store (lib/coach/
// todayMemoryDb.ts — the same store P2's and P6's Today route tests use) plus the four health/breath tables it reads.
// Only the session and the database are stand-ins; the lane's database is offline on purpose and :3131 was down.
//
// What this proves: THE SERVER DECIDES AND THE CLIENT NEVER DOES — GET says whether to offer the breath for one set,
// POST re-runs every gate on fresh rows before it writes one BreathLog use, and nothing a client adds to the body (an
// `eligible: true`, empty `reasons`) changes the answer. Each gate is walked through the route once (the pure gate has
// its own exhaustive file, rampGate.test.ts); the use counts against FEL's weekly limit on the next request; the week
// rolls; a set logged through the REAL /api/coach/me/log route closes the breath for that set; and two racing POSTs
// never leave two uses.
//
// MIRROR-COACH P7 FIX (2026-09-29, review), held here through the route: a clean re-take no longer erases an earlier
// lasting "yes" (intake_history); and the exact race interleaving the review described — A stamps first but commits
// late — now leaves one use, where it used to leave two.
// MIRROR-COACH-ERASE (2026-09-30, owner 07:53 PT): erasing health data (the REAL lib/prq-data-rights.ts eraseHealthData)
// keeps the consent ledger. A grant already a full window old stays old enough, and opting straight back in (the REAL
// lib/health/intake.ts submitIntake) writes no new consent row. BreathLog rows are still deleted, so the rolling count
// can clear. The owner dropped the post-erase restart of the 7-day hold.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const h = vi.hoisted(() => {
  type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const state = {
    user: 'client-1' as string | null,
    store: null as unknown as import('@/lib/coach/todayMemoryDb').TodayStore,
    consents: [] as R[], pain: [] as R[], readiness: [] as R[], breath: [] as R[],
    reads: [] as string[], seq: 0,
    /** BreathLog ids a read cannot see yet (an insert that has not committed) — the race test's interleaving. */
    hidden: new Set<string>(),
    /** Runs inside breathLog.create after the row is written and before the insert "commits" (returns). */
    onCreate: null as null | ((row: R) => Promise<void>),
  };
  const pick = (r: R, select?: R) => (select ? Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, r[k]])) : { ...r });
  const time = (v: unknown) => (v instanceof Date ? v.getTime() : Date.parse(String(v)));
  /** BreathLog columns a write may name (prisma/schema.prisma model BreathLog, less id). */
  const BREATH_WRITABLE = ['userId', 'kind', 'sessionId', 'seconds', 'createdAt'];
  const extra = () => ({
    healthConsent: {
      findMany: async (a: R) => { state.reads.push('healthConsent'); return state.consents.filter((c) => c.userId === a.where.userId && (!a.where.scope || c.scope === a.where.scope)).map((c) => pick(c, a.select)); },
    },
    painCheckIn: {
      findMany: async (a: R) => { state.reads.push('painCheckIn'); return state.pain.filter((p) => p.userId === a.where.userId && time(p.createdAt) >= time(a.where.createdAt.gte)).map((p) => pick(p, a.select)); },
    },
    readinessCheckIn: {
      findMany: async (a: R) => { state.reads.push('readinessCheckIn'); return state.readiness.filter((r) => r.userId === a.where.userId && a.where.date.in.includes(r.date)).map((r) => pick(r, a.select)); },
    },
    breathLog: {
      findMany: async (a: R) => state.breath
        .filter((b) => !state.hidden.has(b.id))
        .filter((b) => b.userId === a.where.userId && (!a.where.kind || b.kind === a.where.kind) && (!a.where.createdAt || time(b.createdAt) >= time(a.where.createdAt.gte)))
        .sort((x, y) => time(x.createdAt) - time(y.createdAt) || (x.id < y.id ? -1 : 1))
        .map((b) => pick(b, a.select)),
      create: async (a: R) => {
        for (const k of Object.keys(a.data)) if (!BREATH_WRITABLE.includes(k)) throw new Error(`Invalid \`prisma.breathLog.create\` invocation: Unknown argument \`${k}\`.`);
        // the schema default: the database's own insert time
        const row = { id: `bl-${String(++state.seq).padStart(3, '0')}`, sessionId: null, seconds: null, createdAt: new Date(), ...a.data };
        state.breath.push(row);
        if (state.onCreate) { const hook = state.onCreate; state.onCreate = null; await hook(row); }
        return pick(row, a.select);
      },
      delete: async (a: R) => {
        const i = state.breath.findIndex((b) => b.id === a.where.id);
        if (i < 0) throw Object.assign(new Error('Record to delete does not exist.'), { code: 'P2025' });
        return state.breath.splice(i, 1)[0];
      },
    },
  });
  return { state, extra };
});

vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.state.user,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', async () => {
  const { todayMemoryDb } = await import('@/lib/coach/todayMemoryDb');
  return {
    prisma: new Proxy({}, {
      get: (_t, k) => {
        if (k === 'then') return undefined;
        const db = { ...todayMemoryDb(h.state.store), ...h.extra() } as Record<string | symbol, unknown>;
        // anything else (a wallet, a PRQ entry, a game session) is a bug in this route's premise
        if (!(k in db)) throw new Error(`the ramp route touched prisma.${String(k)}`);
        // every intake read is recorded by method: loadToday's findFirst (P5's Today read) vs the ramp's own findMany
        if (k === 'healthIntake') {
          const t = db[k] as Record<string, (...x: unknown[]) => unknown>;
          return Object.fromEntries(Object.entries(t).map(([m, fn]) => [m, (...x: unknown[]) => { h.state.reads.push(`healthIntake.${m}`); return fn(...x); }]));
        }
        return db[k];
      },
    }),
  };
});

import { NextRequest } from 'next/server';
import { GET as rampGET, POST as rampPOST } from '@/app/api/breath/ramp/route';
import { POST as logPOST } from '@/app/api/coach/me/log/route';
import { catalogueRow, newTodayStore, seedProgram } from '@/lib/coach/todayMemoryDb';
import { INTAKE_IDS, INTAKE_VERSION, submitIntake } from '@/lib/health/intake';
import { eraseHealthData } from '@/lib/prq-data-rights';
import { RAMP_LIMIT, RAMP_MUST_ANSWER_NO, RAMP_PACER, RAMP_REFUSED_COPY } from './rampGate';

const NOW = new Date('2026-09-29T15:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
let PID = '', S1 = '', KEY = '', ASSIST = '', OTHER_KEY = '';

const get = async (sessionExerciseId: string | null, as: string | null = 'client-1', extra = '') => {
  h.state.user = as;
  const q = sessionExerciseId === null ? '' : `?sessionExerciseId=${encodeURIComponent(sessionExerciseId)}`;
  const res = await rampGET(new NextRequest(`http://fel.test/api/breath/ramp${q}${extra}`));
  return { status: res.status, json: await res.json() as Row };
};
const post = async (body: unknown, as: string | null = 'client-1') => {
  h.state.user = as;
  const req = new NextRequest('http://fel.test/api/breath/ramp', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  const res = await rampPOST(req);
  return { status: res.status, json: await res.json() as Row };
};
const logSets = async (body: Row, as = 'client-1') => {
  h.state.user = as;
  const res = await logPOST(new NextRequest('http://fel.test/api/coach/me/log', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
  return { status: res.status, json: await res.json() as Row };
};
const rows = () => h.state.breath;

const CLEAN = Object.fromEntries(RAMP_MUST_ANSWER_NO.map((id) => [id, false]));
const intake = (userId: string, over: Row = {}) => ({
  id: `hi-${userId}-${h.state.store.healthIntake.length + 1}`, userId, version: INTAKE_VERSION, answers: { ...CLEAN }, redFlags: [], birthYear: 1990,
  consentedAt: daysAgo(9), clearedAt: null, createdAt: daysAgo(9), ...over,
});
const grant = (userId: string, over: Row = {}) => ({ userId, scope: 'health_data', coachId: null, grantedAt: daysAgo(9), revokedAt: null, ...over });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  h.state.store = newTodayStore();
  Object.assign(h.state, { user: 'client-1', consents: [], pain: [], readiness: [], breath: [], reads: [], seq: 0, hidden: new Set<string>(), onCreate: null });
  const s = h.state.store;
  s.user.push(
    { id: 'coach-1', name: 'Coach One', email: 'c1@x.test' },
    { id: 'client-1', name: 'Sam', email: 'sam@x.test', dobYear: 1990 },
    { id: 'client-2', name: 'Ria', email: 'ria@x.test', dobYear: 1992 },
  );
  s.pe.push(
    catalogueRow({ id: 'pe-dl', coachId: 'coach-1', name: 'Trap Bar Deadlift', pattern: 'hinge' }),
    catalogueRow({ id: 'pe-row', coachId: 'coach-1', name: 'Half-kneeling Row', pattern: 'pull' }),
  );
  const ids = seedProgram(s, {
    coachId: 'coach-1', clientId: 'client-1', name: 'Base block', blockLabel: 'Week 1',
    sessions: [
      { order: 1, label: 'Day 1', exercises: [{ exerciseId: 'pe-dl', section: 'key', isKeySet: true, sets: 3, reps: '5' }, { exerciseId: 'pe-row', section: 'assist' }] },
      { order: 2, label: 'Day 2', exercises: [{ exerciseId: 'pe-dl', section: 'key', isKeySet: true }] },
    ],
  });
  PID = ids.programId; S1 = ids.sessionIds[0]; [KEY, ASSIST] = ids.exerciseIds[0];
  // someone else's program, with its own key set
  OTHER_KEY = seedProgram(s, { coachId: 'coach-1', clientId: 'client-2', name: 'Ria block', blockLabel: 'Week 1', sessions: [{ order: 1, label: 'Day 1', exercises: [{ exerciseId: 'pe-dl', section: 'key', isKeySet: true }] }] }).exerciseIds[0][0];
  // client-1: an adult, consented, a clean current intake — fully eligible
  s.healthIntake.push(intake('client-1'));
  h.state.consents.push(grant('client-1'));
});
afterEach(() => { vi.useRealTimers(); });

describe('auth and request shape', () => {
  it('401 with no session, on both verbs; nothing written', async () => {
    expect((await get(KEY, null)).status).toBe(401);
    expect((await post({ sessionExerciseId: KEY }, null)).status).toBe(401);
    expect(rows()).toHaveLength(0);
  });
  it('400 without an exercise id, or with a body that is not JSON', async () => {
    expect(await get(null)).toMatchObject({ status: 400, json: { error: 'session_exercise_required' } });
    expect(await post({})).toMatchObject({ status: 400, json: { error: 'session_exercise_required' } });
    expect((await post('{not json')).status).toBe(400);
    expect(rows()).toHaveLength(0);
  });
});

describe('an eligible adult: the server says yes, logs the use, and the next request counts it', () => {
  it('GET offers it (the pacer, the limit, both uses left) and writes nothing', async () => {
    const r = await get(KEY);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ eligible: true, reasons: [], usesLeft: 2, pacer: RAMP_PACER, limit: { ...RAMP_LIMIT } });
    expect(rows()).toHaveLength(0);
  });

  it('POST starts it: one BreathLog use — this athlete, kind ramp, this session, no seconds — and the pacer to run', async () => {
    const r = await post({ sessionExerciseId: KEY });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ started: true, usesLeft: 1, pacer: RAMP_PACER });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ id: r.json.logId, userId: 'client-1', kind: 'ramp', sessionId: S1, seconds: null });
    expect(rows()[0].createdAt).toEqual(NOW);
  });

  it('the use counts at once: GET for the same set now says no (one per session, a day apart), and a second POST is refused', async () => {
    await post({ sessionExerciseId: KEY });
    const g = await get(KEY);
    expect(g.json).toMatchObject({ eligible: false, usesLeft: 1, pacer: null });
    expect(g.json.reasons).toEqual(['this_session', 'too_soon']);
    const again = await post({ sessionExerciseId: KEY });
    expect(again).toMatchObject({ status: 403, json: { error: 'ramp_not_allowed', reasons: ['this_session', 'too_soon'] } });
    expect(rows()).toHaveLength(1);
  });

  it('nothing in either answer is a score, points, coins or a streak', async () => {
    const keys = [...Object.keys((await get(KEY)).json), ...Object.keys((await post({ sessionExerciseId: KEY })).json)];
    for (const k of keys) expect(k, k).not.toMatch(/score|point|coin|shard|streak|reward|prq|xp/i);
  });
});

describe('the client never decides', () => {
  it('a body that claims eligibility changes nothing: a minor is refused and nothing is written', async () => {
    h.state.store.user.find((u) => u.id === 'client-1')!.dobYear = 2012;
    const r = await post({ sessionExerciseId: KEY, eligible: true, reasons: [], force: true, dobYear: 1990, usesLeft: 2 });
    expect(r).toMatchObject({ status: 403, json: { error: 'ramp_not_allowed' } });
    expect(r.json.reasons).toEqual(['minor']);
    expect(rows()).toHaveLength(0);
  });
  it('not the key set, not on today\'s session, or another athlete\'s key set: refused, by the server\'s own read of Today', async () => {
    expect((await post({ sessionExerciseId: ASSIST })).json.reasons).toEqual(['not_key_set']);
    expect((await post({ sessionExerciseId: 'se-nope' })).json.reasons).toEqual(['not_today']);
    expect((await post({ sessionExerciseId: OTHER_KEY })).json.reasons).toEqual(['not_today']);
    expect(rows()).toHaveLength(0);
  });
  it('a ?date= on the request is not read: a low check-in on any plausible today holds it back', async () => {
    h.state.readiness.push({ userId: 'client-1', date: '2026-09-29', sleep: 1, soreness: 5, energy: 1, mood: 2 });
    for (const q of ['', '&date=2026-09-30', '&date=2026-09-28']) {
      expect((await get(KEY, 'client-1', q)).json.reasons, q).toEqual(['readiness_low']);
    }
  });
});

describe('each gate, through the route', () => {
  it('age: a blank birth year and a minor are refused (decision #6, #20)', async () => {
    const u = h.state.store.user.find((x) => x.id === 'client-1')!;
    u.dobYear = null;
    expect((await get(KEY)).json).toMatchObject({ eligible: false, reasons: ['age_unknown'] });
    u.dobYear = 2010;
    expect((await get(KEY)).json).toMatchObject({ eligible: false, reasons: ['minor'] });
    expect((await post({ sessionExerciseId: KEY })).status).toBe(403);
    expect(rows()).toHaveLength(0);
  });

  it('consent: none, or withdrawn → no; POST is 412; and the pain and readiness rows are never even read', async () => {
    h.state.consents = [];
    h.state.pain.push({ userId: 'client-1', exerciseName: 'X', bodyArea: 'knee', decision: 'stop_see_clinician', createdAt: daysAgo(1) });
    expect((await get(KEY)).json).toMatchObject({ eligible: false, reasons: ['no_health_consent'] });
    expect(await post({ sessionExerciseId: KEY })).toMatchObject({ status: 412, json: { error: 'health_data_consent_required' } });
    h.state.consents = [grant('client-1', { revokedAt: daysAgo(1) })];
    expect((await get(KEY)).json.reasons).toEqual(['no_health_consent']);
    expect(h.state.reads).not.toContain('painCheckIn');
    expect(h.state.reads).not.toContain('readinessCheckIn');
    // MIRROR-COACH P7 FIX (2026-09-29): said honestly — the newest intake IS read, by loadToday (P5's own Today
    // hard-stop read, made whether or not the ramp is asked about); the ramp's own intake-history read is not made
    expect(h.state.reads).toContain('healthIntake.findFirst');
    expect(h.state.reads).not.toContain('healthIntake.findMany');
    expect(rows()).toHaveLength(0);
  });

  it('the intake: missing, a red flag (even cleared), a blocking "yes", a skipped blocking question', async () => {
    const s = h.state.store;
    s.healthIntake = [];
    expect((await get(KEY)).json.reasons).toEqual(['intake_missing']);
    s.healthIntake = [intake('client-1', { redFlags: [INTAKE_IDS.heartOrBpCondition], answers: { ...CLEAN, [INTAKE_IDS.heartOrBpCondition]: true }, clearedAt: daysAgo(1) })];
    expect((await get(KEY)).json.reasons).toEqual(['red_flag', 'intake_answer']);
    s.healthIntake = [intake('client-1', { answers: { ...CLEAN, [INTAKE_IDS.pregnancyOrPostpartum]: true } })];
    expect((await get(KEY)).json.reasons).toEqual(['intake_answer']);
    const skipped = { ...CLEAN }; delete (skipped as Row)[INTAKE_IDS.dizzinessFaintingChestPain];
    s.healthIntake = [intake('client-1', { answers: skipped })];
    expect((await get(KEY)).json.reasons).toEqual(['intake_unanswered']);
    // a clean re-take after a SKIP opens it again (a skip is not a lasting answer)
    s.healthIntake.push(intake('client-1', { createdAt: daysAgo(1) }));
    expect((await get(KEY)).json.eligible).toBe(true);
  });

  // MIRROR-COACH P7 FIX (2026-09-29, review): this used to assert the opposite — "a clean re-take opens it again" after
  // a heart-or-blood-pressure "yes". The question is "Has a doctor EVER told you…"; a minute-later "no" is not news.
  it('a clean re-take does NOT erase an earlier lasting "yes" or a red flag inside the year (intake_history); a pregnancy "yes" does resolve', async () => {
    const s = h.state.store;
    for (const id of [INTAKE_IDS.heartOrBpCondition, INTAKE_IDS.dizzinessFaintingChestPain, INTAKE_IDS.heartRateOrBalanceMedicine]) {
      const flags = id === INTAKE_IDS.heartRateOrBalanceMedicine ? [] : [id];
      s.healthIntake = [intake('client-1', { answers: { ...CLEAN, [id]: true }, redFlags: flags, createdAt: daysAgo(9) }), intake('client-1', { createdAt: daysAgo(0.01) })];
      expect((await get(KEY)).json, id).toMatchObject({ eligible: false, reasons: ['intake_history'] });
      expect((await post({ sessionExerciseId: KEY })).status, id).toBe(403);
    }
    s.healthIntake = [intake('client-1', { answers: { ...CLEAN, [INTAKE_IDS.pregnancyOrPostpartum]: true }, createdAt: daysAgo(90) }), intake('client-1', { createdAt: daysAgo(1) })];
    expect((await get(KEY)).json.eligible).toBe(true);
    // a lasting "yes" over a year old has aged out with the intake's own yearly clock
    s.healthIntake = [intake('client-1', { answers: { ...CLEAN, [INTAKE_IDS.heartOrBpCondition]: true }, redFlags: [INTAKE_IDS.heartOrBpCondition], createdAt: daysAgo(400) }), intake('client-1', { createdAt: daysAgo(1) })];
    expect((await get(KEY)).json.eligible).toBe(true);
    expect(h.state.reads).toContain('healthIntake.findMany');
    expect(rows()).toHaveLength(0);   // every POST above was refused, so nothing was logged
  });

  it("today's pain: a stored step-down in the lookback holds it back; a 'continue' does not", async () => {
    h.state.pain.push({ userId: 'client-1', exerciseName: 'Trap Bar Deadlift', bodyArea: 'low_back', decision: 'continue', createdAt: daysAgo(1) });
    expect((await get(KEY)).json.eligible).toBe(true);
    h.state.pain.push({ userId: 'client-1', exerciseName: 'Split Squat', bodyArea: 'knee', decision: 'step_down_flag_coach', createdAt: daysAgo(2) });
    expect((await get(KEY)).json.reasons).toEqual(['pain_today']);
  });

  it("today's readiness: an 'ok' check-in is fine, a 'low' one holds it back", async () => {
    h.state.readiness.push({ userId: 'client-1', date: '2026-09-29', sleep: 4, soreness: 2, energy: 4, mood: 4 });
    expect((await get(KEY)).json.eligible).toBe(true);
    h.state.readiness[0].sleep = 1;
    expect((await get(KEY)).json.reasons).toEqual(['readiness_low']);
  });

  it('an off day never offers it, even on a set a coach flagged', async () => {
    const s = h.state.store;
    s.program = s.program.filter((p) => p.clientId !== 'client-1');
    const off = seedProgram(s, { coachId: 'coach-1', clientId: 'client-1', name: 'Recovery', blockLabel: 'Week 1', sessions: [{ order: 1, label: 'Off day', kind: 'recovery', exercises: [{ exerciseId: 'pe-row', section: 'key', isKeySet: true }] }] });
    expect((await get(off.exerciseIds[0][0])).json.reasons).toEqual(['off_day']);
  });

  it('mid-set: once a set of the key set is logged (through the real Today log route), the breath is closed for that set', async () => {
    expect((await get(KEY)).json.eligible).toBe(true);
    const saved = await logSets({ programId: PID, sessionId: S1, logs: [{ sessionExerciseId: KEY, sets: [{ reps: '5', weight: '100', unit: 'kg' }, {}, {}] }] });
    expect(saved.status).toBe(200);
    expect((await get(KEY)).json.reasons).toEqual(['set_started']);
    expect(await post({ sessionExerciseId: KEY })).toMatchObject({ status: 403, json: { reasons: ['set_started'] } });
    expect(rows()).toHaveLength(0);
  });

  it("an empty save (the card sends every exercise on Save) is not a start", async () => {
    expect((await logSets({ programId: PID, sessionId: S1, logs: [{ sessionExerciseId: KEY, sets: [{}, {}, {}] }] })).status).toBe(200);
    expect((await get(KEY)).json.eligible).toBe(true);
  });
});

describe("FEL's weekly limit, counted from the log", () => {
  it('two uses in the rolling week: refused; a day and a half later the older one has rolled out', async () => {
    h.state.breath.push(
      { id: 'bl-old', userId: 'client-1', kind: 'ramp', sessionId: 'past-a', seconds: null, createdAt: daysAgo(6) },
      { id: 'bl-mid', userId: 'client-1', kind: 'ramp', sessionId: 'past-b', seconds: null, createdAt: daysAgo(2) },
      // another athlete's uses never count against this one
      { id: 'bl-x', userId: 'client-2', kind: 'ramp', sessionId: 'x', seconds: null, createdAt: daysAgo(1) },
    );
    expect(await post({ sessionExerciseId: KEY })).toMatchObject({ status: 403, json: { reasons: ['weekly_limit'] } });
    expect((await get(KEY)).json).toMatchObject({ eligible: false, usesLeft: 0 });
    vi.setSystemTime(new Date(NOW.getTime() + 1.5 * 86_400_000));
    expect((await get(KEY)).json).toMatchObject({ eligible: true, usesLeft: 1 });
    expect((await post({ sessionExerciseId: KEY })).json).toMatchObject({ started: true, usesLeft: 0 });
    expect(rows().filter((r) => r.userId === 'client-1')).toHaveLength(3);
  });

  // MIRROR-COACH-ERASE (2026-09-30, owner 07:53 PT): erase keeps the consent ledger. A grant already a full window
  // old stays old enough, re-taking the intake writes no new row, and the deleted BreathLog rows clear the rolling
  // count. The fake has no healthConsent.deleteMany: if eraseHealthData calls one, this throws.
  it('erase health data + re-take the intake: the kept grant is still old enough, and no consent row is created', async () => {
    const s = h.state.store;
    const before = structuredClone(h.state.consents);
    expect(before).toHaveLength(1);
    // Monday and Tuesday's uses — the rolling week is full until the log is deleted
    h.state.breath.push(
      { id: 'bl-mon', userId: 'client-1', kind: 'ramp', sessionId: 'past-mon', seconds: null, createdAt: daysAgo(2) },
      { id: 'bl-tue', userId: 'client-1', kind: 'ramp', sessionId: 'past-tue', seconds: null, createdAt: daysAgo(1.2) },
    );
    expect((await get(KEY)).json).toMatchObject({ eligible: false, reasons: ['weekly_limit'] });
    const byUser = <T extends Row>(rows: T[], userId: string) => rows.filter((r) => r.userId !== userId);
    const eraseDb = {
      healthIntake: { deleteMany: async (a: Row) => { const n = s.healthIntake.filter((r) => r.userId === a.where.userId).length; s.healthIntake = byUser(s.healthIntake, a.where.userId); return { count: n }; } },
      painCheckIn: { deleteMany: async (a: Row) => { const n = h.state.pain.filter((r) => r.userId === a.where.userId).length; h.state.pain = byUser(h.state.pain, a.where.userId); return { count: n }; } },
      readinessCheckIn: { deleteMany: async (a: Row) => { const n = h.state.readiness.filter((r) => r.userId === a.where.userId).length; h.state.readiness = byUser(h.state.readiness, a.where.userId); return { count: n }; } },
      breathLog: { deleteMany: async (a: Row) => { const n = h.state.breath.filter((r) => r.userId === a.where.userId).length; h.state.breath = byUser(h.state.breath, a.where.userId); return { count: n }; } },
    };
    expect(await eraseHealthData(eraseDb as never, 'client-1')).toMatchObject({ breathLogs: 2, healthConsents: 0, healthIntakes: 1 });
    expect(h.state.consents).toEqual(before);
    const creates: Row[] = [];
    const intakeDb = {
      user: { findUnique: async (a: Row) => s.user.find((u) => u.id === a.where.id) ?? null, update: async () => ({}) },
      guardianConsent: { findMany: async () => [] },
      healthConsent: {
        findFirst: async (a: Row) => h.state.consents.find((c) => c.userId === a.where.userId && c.scope === a.where.scope && !c.revokedAt) ?? null,
        create: async (a: Row) => { const c = { coachId: null, revokedAt: null, ...a.data }; creates.push(c); h.state.consents.push(c); return c; },
      },
      healthIntake: { create: async (a: Row) => { const r = { id: `hi-re-${s.healthIntake.length}`, clearedAt: null, createdAt: new Date(), ...a.data }; s.healthIntake.push(r); return r; } },
    };
    await submitIntake(intakeDb as never, { userId: 'client-1', consent: true, rawAnswers: { ...CLEAN, [INTAKE_IDS.birthYear]: 1990 } });
    expect(creates).toEqual([]);
    expect(h.state.consents).toEqual(before);
    expect(rows().filter((r) => r.userId === 'client-1')).toHaveLength(0);
    const offered = await get(KEY);
    expect(offered.json.reasons).not.toContain('consent_new');
    expect(offered.json).toMatchObject({ eligible: true, usesLeft: 2 });
  });

  it('withdraw and re-grant (no erase) keeps the old ledger rows, so it waits for nothing', async () => {
    h.state.consents = [grant('client-1', { revokedAt: daysAgo(2) }), grant('client-1', { grantedAt: daysAgo(1) })];
    expect((await get(KEY)).json.eligible).toBe(true);
  });

  // MIRROR-COACH P7 FIX (2026-09-29, review): was "leave exactly ONE use: the later backs its own row out". Whoever sees a
  // conflicting use now backs out (rampGate.ts rampRaceReasons), so two racers can both back out — never both stay.
  it('two POSTs racing each other past the gate never leave two uses; every 200 is a row that stayed, every backed-out racer says raced', async () => {
    const [a, b] = await Promise.all([post({ sessionExerciseId: KEY }), post({ sessionExerciseId: KEY })]);
    const won = [a, b].filter((r) => r.status === 200);
    expect(rows().length).toBeLessThanOrEqual(1);
    expect(won.map((r) => r.json.logId)).toEqual(rows().map((r) => r.id));
    for (const r of [a, b].filter((x) => x.status !== 200)) expect(r.json.reasons[0], JSON.stringify(r.json)).toBe('raced');
    // if both backed out, the athlete's retry is answered on a clean log
    if (!won.length) expect((await post({ sessionExerciseId: KEY })).status).toBe(200);
  });

  it("the review's interleaving through the route: A stamps first but commits late, B never sees A — ONE use stays (it used to be two)", async () => {
    // A writes its row (bl-001) and, before its insert "commits", B runs its whole POST unable to see it
    const racer: { b: { status: number; json: Row } | null } = { b: null };
    h.state.onCreate = async (rowA) => {
      h.state.hidden.add(rowA.id);
      racer.b = await post({ sessionExerciseId: KEY });
      h.state.hidden.delete(rowA.id);
    };
    const aResult = await post({ sessionExerciseId: KEY });
    expect(racer.b).toMatchObject({ status: 200, json: { started: true } });   // B saw nothing and kept its use
    expect(aResult).toMatchObject({ status: 403, json: { error: 'ramp_not_allowed', reasons: ['raced', 'this_session', 'too_soon'] } });
    expect(rows()).toHaveLength(1);
    expect(rows()[0].id).toBe(racer.b?.json.logId);
    expect(RAMP_REFUSED_COPY.raced).toBeTruthy();
  });
});
