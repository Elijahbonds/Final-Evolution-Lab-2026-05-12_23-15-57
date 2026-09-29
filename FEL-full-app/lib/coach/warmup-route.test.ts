// GET /api/coach/me/warmup, run for real over a fake client (MIRROR-COACH P6, 2026-09-29). The lane's database is
// offline on purpose, so this is the proof the route reads the right rows for the signed-in athlete only: the birth
// year (blank = youth), the screen area from the newest GRADED screen (the coach draft's pick), the stored pain decision
// (which gates the jumps even after a consent withdrawal — the P6 review's fix, warmupServer.ts
// PAIN_GATE_OUTLIVES_WITHDRAWAL), and the intake hard stop.
// It writes nothing. The stored screens are made the way the screen route makes them (lib/mirror/screenClaims.ts
// decideScreenPost → storedScreen), the same recipe as lib/coach/mirrorToProgram.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const h = vi.hoisted(() => ({
  user: 'athlete-1' as string | null,
  db: {
    users: [] as Row[], intakes: [] as Row[], scans: [] as Row[], consents: [] as Row[], pain: [] as Row[],
    calls: [] as { model: string; op: string; args: Row }[],
  },
}));

vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.user,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));

/** Just the reads loadWarmupContext makes, filtered the way it filters (userId, kind, createdAt ≥, newest first). */
function fakeDb() {
  const d = h.db;
  const log = (model: string, op: string, args: Row) => d.calls.push({ model, op, args });
  const newest = (a: Row, b: Row) => +new Date(b.createdAt) - +new Date(a.createdAt);
  return {
    user: { findUnique: async (args: Row) => { log('user', 'findUnique', args); const u = d.users.find((x) => x.id === args.where.id); return u ? { dobYear: u.dobYear } : null; } },
    healthIntake: { findFirst: async (args: Row) => { log('healthIntake', 'findFirst', args); return d.intakes.filter((x) => x.userId === args.where.userId).sort(newest)[0] ?? null; } },
    workoutScan: {
      findMany: async (args: Row) => {
        log('workoutScan', 'findMany', args);
        return d.scans.filter((x) => x.userId === args.where.userId && x.kind === args.where.kind).sort(newest).slice(0, args.take).map((x) => ({ metrics: x.metrics, createdAt: x.createdAt }));
      },
    },
    healthConsent: { findMany: async (args: Row) => { log('healthConsent', 'findMany', args); return d.consents.filter((x) => x.userId === args.where.userId); } },
    painCheckIn: {
      findMany: async (args: Row) => {
        log('painCheckIn', 'findMany', args);
        return d.pain.filter((x) => x.userId === args.where.userId && x.createdAt >= args.where.createdAt.gte).sort(newest);
      },
    },
  };
}
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, k) => (fakeDb() as Record<string | symbol, unknown>)[k] }) }));

import { GET } from '@/app/api/coach/me/warmup/route';
import { loadWarmupContext, zoneFromScreens, type WarmupDb } from './warmupServer';
import { generateWarmup, type WarmupContext } from './warmup';
import { ZONE_WORDS } from './warmupContent';
import { decideScreenPost } from '@/lib/mirror/screenClaims';
import { scoreScreen } from '@/lib/mirror/screen';
import { storedScreen } from '@/lib/mirror/screenStore';
import { regradeFromSummary } from '@/lib/mirror/stationGraders';
import { readFileSync } from 'node:fs';

// ── screens, made the way the route makes them (mirrorToProgram.test.ts's recipe) ───────────────────────────────────
const PASS = {
  heelLine: { checkId: 'heelLine', value: 2, bySide: { left: 2, right: 1 }, unit: 'deg', frames: 360, readableFrames: 360, uncertainty: 0.5, spread: 4, stationId: 'heels' },
  kneeWindow: { checkId: 'kneeWindow', value: 0.05, bySide: { left: 0.05, right: 0.02 }, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.01, spread: 0.1, stationId: 'frontStack' },
  hipLevel: { checkId: 'hipLevel', value: 0.01, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.005, spread: 0.02, stationId: 'frontStack' },
  shoulderLevel: { checkId: 'shoulderLevel', value: -0.01, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.005, spread: 0.02, stationId: 'frontStack' },
  headFloat: { checkId: 'headFloat', value: 0.02, unit: 'ratio', frames: 300, readableFrames: 300, uncertainty: 0.005, spread: 0.02, stationId: 'profile' },
  singleLegL: { checkId: 'singleLeg', value: 0.03, unit: 'px-norm', frames: 900, readableFrames: 900, uncertainty: 0.01, spread: null, touchDowns: 0, stanceSec: 28, side: 'left', stationId: 'wobbleL' },
  singleLegR: { checkId: 'singleLeg', value: 0.04, unit: 'px-norm', frames: 900, readableFrames: 900, uncertainty: 0.01, spread: null, touchDowns: 0, stanceSec: 28, side: 'right', stationId: 'wobbleR' },
} as const;
type Key = keyof typeof PASS;
const KEYS = Object.keys(PASS) as Key[];
const FLAG: Record<Key, Record<string, unknown>> = {
  heelLine: { value: 14, bySide: { left: 14, right: 2 } }, kneeWindow: { value: 0.7, bySide: { left: 0.7, right: 0.05 } },
  hipLevel: { value: -0.12 }, shoulderLevel: { value: 0.1 }, headFloat: { value: 0.2 }, singleLegL: { touchDowns: 2 }, singleLegR: { value: 0.2 },
};
const claim = (k: Key, over: Record<string, unknown> = {}) => { const body = { ...PASS[k], ...over }; return { ...body, status: regradeFromSummary(body)!.status }; };
type Over = Partial<Record<Key, Record<string, unknown> | 'absent'>>;
function screenRow(over: Over = {}) {
  const checks = KEYS.filter((k) => over[k] !== 'absent').map((k) => claim(k, (over[k] as Record<string, unknown>) ?? {}));
  const d = decideScreenPost({ screenId: `s-${Math.random().toString(36).slice(2)}`, screen: 'modified', checks, answers: [] }, 'athlete-1');
  if (!d.ok) throw new Error(`the route refused the test's screen: ${JSON.stringify(d.body)}`);
  return JSON.parse(JSON.stringify(storedScreen(d.screenId, d.screen, d.outcome.results, d.summary, { camera: d.outcome.camera, provisional: d.outcome.provisional })));
}

const NOW = new Date();
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const ADULT = NOW.getFullYear() - 30, MINOR = NOW.getFullYear() - 15;

async function get(as: string | null = 'athlete-1'): Promise<{ status: number; json: WarmupContext & { error?: string } }> {
  h.user = as;
  const res = await GET();
  return { status: res.status, json: await res.json() };
}

beforeEach(() => {
  h.db.users = [{ id: 'athlete-1', dobYear: ADULT }, { id: 'athlete-2', dobYear: ADULT }];
  h.db.intakes = []; h.db.scans = []; h.db.consents = []; h.db.pain = []; h.db.calls = [];
});

describe('GET /api/coach/me/warmup', () => {
  it('401 with no session, and reads nothing', async () => {
    const r = await get(null);
    expect(r.status).toBe(401);
    expect(h.db.calls).toEqual([]);
  });

  it('an adult with nothing on file: no area, no pain reading, not youth, not stopped', async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ isYouth: false, painDecision: null, zone: null, screen: 'none', screenAt: null, hardStopped: false });
  });

  it('youth from the birth year — and a blank birth year is youth (decision #20)', async () => {
    h.db.users[0].dobYear = MINOR;
    expect((await get()).json.isYouth).toBe(true);
    h.db.users[0].dobYear = null;
    expect((await get()).json.isYouth).toBe(true);
    h.db.users = [];
    expect((await get()).json.isYouth).toBe(true);
  });

  it('the screen area comes from the newest graded screen, and only the athlete\'s own', async () => {
    h.db.scans.push(
      { userId: 'athlete-1', kind: 'mirror_screen', createdAt: ago(48), metrics: screenRow({ heelLine: FLAG.heelLine }) },
      { userId: 'athlete-1', kind: 'mirror_screen', createdAt: ago(2), metrics: screenRow({ hipLevel: FLAG.hipLevel, singleLegR: FLAG.singleLegR }) },
      { userId: 'athlete-2', kind: 'mirror_screen', createdAt: ago(1), metrics: screenRow({ shoulderLevel: FLAG.shoulderLevel }) },
      { userId: 'athlete-1', kind: 'movement_screen', createdAt: ago(1), metrics: { junk: true } },
    );
    const r = await get();
    expect(r.json.screen).toBe('flagged');
    expect(r.json.zone).toEqual({ id: 'lumbo_pelvic', words: ZONE_WORDS.lumbo_pelvic, checks: ['hipLevel', 'singleLeg'] });
    expect(r.json.screenAt).toBe(ago(2).toISOString());
    const q = h.db.calls.find((c) => c.model === 'workoutScan')!.args;
    expect(q.where).toEqual({ userId: 'athlete-1', kind: 'mirror_screen' });
    expect(q.take).toBe(20);
  });

  it('a newer run that read too little does not hide the full screen before it; a clear screen is "clear"', async () => {
    const thin = screenRow({ hipLevel: FLAG.hipLevel, heelLine: 'absent', kneeWindow: 'absent', shoulderLevel: 'absent', headFloat: 'absent', singleLegL: 'absent', singleLegR: 'absent' });
    h.db.scans.push(
      { userId: 'athlete-1', kind: 'mirror_screen', createdAt: ago(1), metrics: thin },
      { userId: 'athlete-1', kind: 'mirror_screen', createdAt: ago(30), metrics: screenRow({ kneeWindow: FLAG.kneeWindow }) },
    );
    expect((await get()).json.zone!.id).toBe('posterior_chain');
    h.db.scans = [{ userId: 'athlete-1', kind: 'mirror_screen', createdAt: ago(3), metrics: screenRow({}) }];
    expect((await get()).json).toMatchObject({ zone: null, screen: 'clear' });
  });

  it('a run that graded nothing is "ungraded", never clear', () => {
    const empty = storedScreen('empty', 'modified', [], scoreScreen('modified', []));
    expect(zoneFromScreens([{ metrics: empty, createdAt: ago(1) }])).toEqual({ zone: null, screen: 'ungraded', screenAt: null });
    expect(zoneFromScreens([{ metrics: { junk: true }, createdAt: ago(1) }])).toEqual({ zone: null, screen: 'none', screenAt: null });
    expect(zoneFromScreens([])).toEqual({ zone: null, screen: 'none', screenAt: null });
  });

  // MIRROR-COACH P6 FIX (2026-09-29, code review; owner decisions #15 "stop sooner" + rule (b)): this test used to pin
  // the OPPOSITE — "a withdrawn grant: still not read" — so withdrawing consent switched the pain gate off and gave the
  // jumps back, while the intake hard stop (read with no consent check) kept working. Now the stored decision gates the
  // jumps whatever the consent state (warmupServer.ts PAIN_GATE_OUTLIVES_WITHDRAWAL, the owner's call to flip).
  it('a stored step-down or stop gates the jumps whatever the consent state now is, and is never re-decided', async () => {
    const { PAIN_GATE_OUTLIVES_WITHDRAWAL } = await import('./warmupServer');
    expect(PAIN_GATE_OUTLIVES_WITHDRAWAL).toBe(true);
    h.db.pain.push({ userId: 'athlete-1', exerciseName: 'Goblet squat', bodyArea: 'knee', decision: 'step_down_flag_coach', createdAt: ago(20) });
    // a live grant: read, the stored decision as it was
    h.db.consents.push({ userId: 'athlete-1', scope: 'health_data', coachId: null, grantedAt: ago(100), revokedAt: null });
    expect((await get()).json.painDecision).toBe('step_down_flag_coach');
    const q = h.db.calls.find((c) => c.model === 'painCheckIn')!.args;
    expect(q.where.userId).toBe('athlete-1');
    expect(+NOW - +q.where.createdAt.gte).toBeGreaterThanOrEqual(7 * 86_400_000 - 5_000);
    // THE CASE: withdrawn on Tuesday, not erased — the step-down still keeps the jumps and the primer out
    h.db.consents[0].revokedAt = ago(10);
    const ctx = (await get()).json as WarmupContext;
    expect(ctx.painDecision).toBe('step_down_flag_coach');
    const plan = generateWarmup({ pattern: 'squat', weakestZone: null, minutes: 14, isYouth: ctx.isYouth, painDecision: ctx.painDecision, readiness: null });
    expect(plan.steps.some((s) => s.impact)).toBe(false);
    expect(plan.steps.some((s) => s.kind === 'primer')).toBe(false);
    // and an acute stop the same way (the review's Monday "pop")
    h.db.pain.push({ userId: 'athlete-1', exerciseName: 'Box jump', bodyArea: 'ankle', decision: 'stop_see_clinician', createdAt: ago(30) });
    expect((await get()).json.painDecision).toBe('stop_see_clinician');
    // an erase deletes the rows, and the gate ends with them
    h.db.pain = [];
    expect((await get()).json.painDecision).toBeNull();
  });

  it('only the stored decision and what keys it are read — never the score or a note — and a coach_view grant changes nothing', async () => {
    h.db.pain.push({ userId: 'athlete-1', exerciseName: 'Row', bodyArea: 'shoulder', decision: 'stop_see_clinician', createdAt: ago(3) });
    h.db.consents.push({ userId: 'athlete-1', scope: 'coach_view', coachId: 'coach-1', grantedAt: ago(10), revokedAt: null });
    const body = (await get()).json as Record<string, unknown>;
    expect(body.painDecision).toBe('stop_see_clinician');
    const q = h.db.calls.find((c) => c.model === 'painCheckIn')!.args;
    expect(Object.keys(q.select).sort()).toEqual(['bodyArea', 'createdAt', 'decision', 'exerciseName']);
    expect(JSON.stringify(body)).not.toMatch(/Row|shoulder|score|note/);
  });

  it('the intake hard stop comes through (Today shows its own card; no warm-up is offered)', async () => {
    h.db.intakes.push({ userId: 'athlete-1', redFlags: ['chest_pain'], clearedAt: null, createdAt: ago(5) });
    expect((await get()).json.hardStopped).toBe(true);
    h.db.intakes[0].clearedAt = ago(1);
    expect((await get()).json.hardStopped).toBe(false);
  });

  it('it only reads: every call is a find', async () => {
    h.db.consents.push({ userId: 'athlete-1', scope: 'health_data', coachId: null, grantedAt: ago(40), revokedAt: null });
    await get();
    expect(h.db.calls.every((c) => c.op.startsWith('find'))).toBe(true);
    const src = readFileSync('lib/coach/warmupServer.ts', 'utf8');
    expect(src).not.toMatch(/\.(create|update|upsert|delete)(Many)?\(/);
  });
});

describe('end to end: the context → the plan', () => {
  it('a minor on a flagged-heel screen with a settled check-in gets a foot stretch and no jumps', async () => {
    h.db.users[0].dobYear = MINOR;
    h.db.scans.push({ userId: 'athlete-1', kind: 'mirror_screen', createdAt: ago(5), metrics: screenRow({ heelLine: FLAG.heelLine }) });
    h.db.consents.push({ userId: 'athlete-1', scope: 'health_data', coachId: null, grantedAt: ago(40), revokedAt: null });
    h.db.pain.push({ userId: 'athlete-1', exerciseName: 'Squat', bodyArea: 'knee', decision: 'continue', createdAt: ago(20) });
    const ctx = await loadWarmupContext(fakeDb() as unknown as WarmupDb, 'athlete-1', NOW);
    const plan = generateWarmup({ pattern: 'squat', weakestZone: ctx.zone?.id ?? null, minutes: 10, isYouth: ctx.isYouth, painDecision: ctx.painDecision, readiness: null, screen: ctx.screen });
    expect(plan.steps.find((s) => s.kind === 'rock_hold')!.id).toBe('ankle-rock');
    expect(plan.steps.some((s) => s.impact)).toBe(false);
    expect(plan.steps.find((s) => s.kind === 'primer')!.id).toBe('fast-squat-primer');
  });
});
