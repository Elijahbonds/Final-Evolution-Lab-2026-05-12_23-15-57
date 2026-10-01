// MIRROR-COACH P8 (2026-09-29): the protocol gate as the COACH sees it — GET /api/coach/programs/:id/gates, run for
// real over the in-memory Today store (lib/coach/todayMemoryDb.ts). Only the session and the database are stand-ins.
//
// What this proves: the coach sees, under every gated item of the program (and only those), what the client's Today
// does with it right now — as written, the easier step instead, or held — and why; a youth item they assigned reads as
// open because they assigned it, with the other checks still named as applying; the client's health reasons are named
// only with the client's live coach_view grant for THIS coach (a grant to another coach, or a revoked one, is not it);
// the client, a stranger and a signed-out caller get nothing; a program with no gated item reads no health table.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ user: 'coach-1' as string | null, store: null as unknown as import('./todayMemoryDb').TodayStore, reads: [] as string[] }));

vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.user,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', async () => {
  const { todayMemoryDb } = await import('./todayMemoryDb');
  return {
    prisma: new Proxy({}, {
      get: (_t, k) => {
        const d = (todayMemoryDb(h.store) as Record<string | symbol, any>)[k]; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (!d || typeof d !== 'object') return d;
        return new Proxy(d, { get: (dd, m) => (typeof dd[m] === 'function' ? (...a: unknown[]) => { h.reads.push(`${String(k)}.${String(m)}`); return dd[m](...a); } : dd[m]) });
      },
    }),
  };
});

import { GET as gatesGET } from '@/app/api/coach/programs/[id]/gates/route';
import { catalogueRow, newTodayStore, seedProgram } from './todayMemoryDb';
import { INTAKE_IDS, INTAKE_VERSION } from '../health/intake';
import { bandOf } from '../assess/thresholds';
import { ASSESSMENT_KIND } from '../assess/prqWrite';
import { COACH_OPEN_LINE, COACH_OPEN_YOUTH_LINE, COACH_WHY, COACH_WHY_PRIVATE, type CoachGateView } from './protocolGate';

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
let PID = '';
let SE: string[][] = [];

async function gates(as: string | null = 'coach-1', id = PID) {
  h.user = as;
  h.reads = [];
  const res = await gatesGET(new Request(`http://fel.test/api/coach/programs/${id}/gates`), { params: Promise.resolve({ id }) });
  return { status: res.status, json: await res.json() as { gates?: Record<string, CoachGateView>; error?: string } };
}

const cleanAnswers = () => ({
  [INTAKE_IDS.currentPain]: false, [INTAKE_IDS.recentInjuryOrSurgery]: false, [INTAKE_IDS.dizzinessFaintingChestPain]: false,
  [INTAKE_IDS.heartOrBpCondition]: false, [INTAKE_IDS.pregnancyOrPostpartum]: false, [INTAKE_IDS.heartRateOrBalanceMedicine]: false,
  [INTAKE_IDS.clinicianToldToAvoid]: false,
});
const consent = (scope = 'health_data', coachId: string | null = null, revokedAt: Date | null = null) =>
  h.store.healthConsent!.push({ userId: 'client-1', scope, coachId, grantedAt: ago(30), revokedAt });
const FLEX = bandOf('t5.landingFlex'), VALGUS = bandOf('t5.landingValgus');
const allClear = () => {
  consent();
  h.store.healthIntake.push({ id: 'hi-1', userId: 'client-1', version: INTAKE_VERSION, createdAt: ago(10), answers: cleanAnswers(), redFlags: [], clearedAt: null });
  h.store.workoutScan!.push({ id: 'ws-1', userId: 'client-1', kind: ASSESSMENT_KIND, createdAt: ago(3), metrics: { tests: [{ id: 'T5', status: 'scored', confidence: 0.9,
    sides: { both: { repsValid: 3, metrics: { landingFlex: FLEX.good, landingValgusLeft: VALGUS.good, landingValgusRight: VALGUS.good }, faults: [] } } }] } });
};
const stepDown = () => h.store.painCheckIn!.push({ userId: 'client-1', exerciseName: 'Goblet Squat', bodyArea: 'knee', decision: 'step_down_flag_coach', createdAt: ago(1) });

beforeEach(() => {
  h.store = newTodayStore();
  h.store.user.push({ id: 'coach-1', name: 'Coach One' }, { id: 'coach-2', name: 'Coach Two' }, { id: 'client-1', name: 'Sam', dobYear: 1990 }, { id: 'stranger', name: 'X' });
  h.store.fac!.push({ userId: 'coach-1', certificationStatus: 'certified' });
  h.store.pe.push(
    catalogueRow({ id: 'pe-goblet', coachId: 'coach-1', name: 'Goblet Squat', skillLayer: 'strength' }),
    catalogueRow({ id: 'pe-drop', coachId: 'coach-1', name: 'Depth Drop to Vertical', regressionOfId: 'pe-boxsquat' }),
    catalogueRow({ id: 'pe-boxsquat', coachId: 'coach-1', name: 'Box Squat' }),
    catalogueRow({ id: 'pe-pogo', coachId: 'coach-1', name: 'Pogo hops', category: 'plyometric' }),
  );
  const ids = seedProgram(h.store, {
    coachId: 'coach-1', clientId: 'client-1', name: 'Power block', blockLabel: 'Week 1',
    sessions: [
      { order: 1, label: 'Day 1', exercises: [{ exerciseId: 'pe-pogo', section: 'prime' }, { exerciseId: 'pe-drop', section: 'key' }, { exerciseId: 'pe-goblet', section: 'assist' }] },
      { order: 2, label: 'Day 2', exercises: [{ exerciseId: 'pe-goblet' }] },
    ],
  });
  PID = ids.programId; SE = ids.exerciseIds;
});

describe('GET /api/coach/programs/:id/gates', () => {
  it('only the gated items, keyed by slot: the easier step instead, or held, and why', async () => {
    const { status, json } = await gates();
    expect(status).toBe(200);
    expect(Object.keys(json.gates!).sort()).toEqual([SE[0][0], SE[0][1]].sort());
    expect(json.gates![SE[0][1]]).toEqual({
      state: 'swap', to: { id: 'pe-boxsquat', name: 'Box Squat' },
      line: `For this client today, Today shows Box Squat instead: ${COACH_WHY.no_health_consent}; ${COACH_WHY.landing_never}.`,
    });
    expect(json.gates![SE[0][0]]).toMatchObject({ state: 'hold', to: null });
    expect(json.gates![SE[0][0]].line).toContain('no ungated easier step');
  });

  it('every check passing: open', async () => {
    allClear();
    const { json } = await gates();
    expect(json.gates![SE[0][1]]).toEqual({ state: 'open', line: COACH_OPEN_LINE, to: null });
  });

  it('a youth item the coach assigned: open because they assigned it', async () => {
    allClear();
    h.store.user.find((u) => u.id === 'client-1')!.dobYear = new Date().getFullYear() - 14;
    expect((await gates()).json.gates![SE[0][1]]).toEqual({ state: 'open_youth', line: COACH_OPEN_YOUTH_LINE, to: null });
  });

  it("the client's pain reason: generic WITHOUT their coach_view grant for this coach, named with it", async () => {
    allClear(); stepDown();
    expect((await gates()).json.gates![SE[0][1]].line).toContain(COACH_WHY_PRIVATE);
    consent('coach_view', 'coach-2');                    // a grant to ANOTHER coach is not this coach's
    expect((await gates()).json.gates![SE[0][1]].line).toContain(COACH_WHY_PRIVATE);
    consent('coach_view', 'coach-1', ago(1));            // a revoked grant is not a grant
    expect((await gates()).json.gates![SE[0][1]].line).toContain(COACH_WHY_PRIVATE);
    consent('coach_view', 'coach-1');
    const line = (await gates()).json.gates![SE[0][1]].line;
    expect(line).toContain(COACH_WHY.pain_today);
    expect(line).not.toContain(COACH_WHY_PRIVATE);
  });

  it('who may read it: the coach only', async () => {
    expect((await gates('client-1')).status).toBe(403);
    expect((await gates('stranger')).status).toBe(404);
    expect((await gates(null)).status).toBe(401);
    expect((await gates('coach-1', 'nope')).status).toBe(404);
  });

  it('a program with no gated item: nothing, and no health table read', async () => {
    h.store.se = h.store.se.filter((e) => e.exerciseId === 'pe-goblet');
    const { json } = await gates();
    expect(json.gates).toEqual({});
    for (const t of ['healthConsent', 'healthIntake', 'painCheckIn', 'workoutScan']) expect(h.reads.some((r) => r.startsWith(`${t}.`))).toBe(false);
  });
});

