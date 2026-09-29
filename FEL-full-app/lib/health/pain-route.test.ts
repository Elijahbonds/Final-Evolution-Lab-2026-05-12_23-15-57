// MIRROR-COACH P5 (2026-09-29): app/api/health/pain's routes, run for real over a fake Prisma client — the same
// vi.mock pattern lib/coach/today-route.test.ts uses to test a route file vitest cannot otherwise collect (app/ is
// out of vitest's include list; only the session and the database are stand-ins here).
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Row {
  id: string;
  userId: string;
  programExerciseId: string | null;
  exerciseName: string;
  bodyArea: string;
  score: number;
  kind: string;
  acute: string[];
  note: string | null;
  decision: string;
  createdAt: Date;
}
interface IntakeRow { userId: string; redFlags: string[]; clearedAt: Date | null; createdAt: Date }
interface PeRow { id: string; coachId: string; name: string; regressionOfId: string | null }
interface ConsentRow { menteeId: string; requestedAt: Date; acceptedAt: Date | null; revokedAt: Date | null }
interface HealthConsentRow { userId: string; scope: string; coachId: string | null; grantedAt: Date; revokedAt: Date | null }

const h = vi.hoisted(() => ({
  user: 'client-1' as string | null,
  rows: [] as Row[],
  intakes: [] as IntakeRow[],
  users: {} as Record<string, { dobYear: number | null }>,
  pe: [] as PeRow[],
  // MIRROR-COACH P5 (2026-09-29), owner decision #6: the route now gates on guardian consent for a minor before it
  // ever reaches submitPainCheckIn. Empty by default — every test here except the minor one below uses the default
  // adult fixture (dobYear 1990), which lib/consent/guardianGate.ts's canUse() never even reads this for.
  consents: [] as ConsentRow[],
  // MIRROR-COACH P5 FIX (2026-09-29, code review) — Finding "PainCheckIn health data is written with zero consent
  // enforcement": beforeEach seeds an ACTIVE 'health_data' grant for 'client-1' by default, the same as a returning
  // athlete who already opted in via the Mirror's intake — every test in this file that is not ABOUT the health-data
  // gate itself uses this default so it keeps testing what it always tested. The gate's own describe block below
  // overrides this to `[]` to prove the gate is real.
  healthConsents: [] as HealthConsentRow[],
  nextId: 1,
}));

vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.user,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));

vi.mock('@/lib/db', () => {
  const client = {
    painCheckIn: {
      findMany: async ({ where }: { where: { userId: string; createdAt?: { gte: Date } } }) =>
        h.rows
          .filter((r) => r.userId === where.userId && (!where.createdAt || r.createdAt >= where.createdAt.gte))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      findFirst: async ({ where }: { where: { userId: string; exerciseName: string; bodyArea: string } }) => {
        const rows = h.rows.filter((r) => r.userId === where.userId && r.exerciseName === where.exerciseName && r.bodyArea === where.bodyArea);
        if (!rows.length) return null;
        return [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      },
      create: async ({ data }: { data: Omit<Row, 'id'> }) => {
        const row: Row = { id: `pc${h.nextId++}`, ...data };
        h.rows.push(row);
        return row;
      },
    },
    healthIntake: {
      findFirst: async ({ where }: { where: { userId: string } }) => {
        const rows = h.intakes.filter((r) => r.userId === where.userId);
        if (!rows.length) return null;
        return [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => (h.users[where.id] ? { dobYear: h.users[where.id].dobYear } : null),
    },
    programExercise: {
      findUnique: async ({ where }: { where: { id: string } }) => h.pe.find((p) => p.id === where.id) ?? null,
      findFirst: async ({ where }: { where: { id: string; coachId: string } }) => h.pe.find((p) => p.id === where.id && p.coachId === where.coachId) ?? null,
    },
    guardianConsent: {
      findMany: async ({ where }: { where: { menteeId: string } }) => h.consents.filter((c) => c.menteeId === where.menteeId),
    },
    healthConsent: {
      findMany: async ({ where }: { where: { userId: string; scope: string } }) =>
        h.healthConsents.filter((c) => c.userId === where.userId && c.scope === where.scope),
    },
    $transaction: async (cb: (tx: unknown) => unknown) => cb(client),
  };
  return { prisma: client };
});

import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/health/pain/route';

async function get() {
  const res = await GET();
  return { status: res.status, json: await res.json() };
}
async function post(body: unknown) {
  const req = body === '__bad_json__'
    ? new NextRequest('http://fel.test/api/health/pain', { method: 'POST', body: '{not json', headers: { 'content-type': 'application/json' } })
    : new NextRequest('http://fel.test/api/health/pain', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  const res = await POST(req);
  return { status: res.status, json: await res.json() };
}

beforeEach(() => {
  h.user = 'client-1';
  h.rows = [];
  h.intakes = [];
  h.users = { 'client-1': { dobYear: 1990 } };
  h.pe = [];
  h.consents = [];
  h.healthConsents = [{ userId: 'client-1', scope: 'health_data', coachId: null, grantedAt: new Date('2026-09-01'), revokedAt: null }];
  h.nextId = 1;
});

describe('GET /api/health/pain', () => {
  it('401s with no session', async () => {
    h.user = null;
    const { status, json } = await get();
    expect(status).toBe(401);
    expect(json.error).toBe('unauthorized');
  });

  it('no history -> no pending follow-ups', async () => {
    const { status, json } = await get();
    expect(status).toBe(200);
    expect(json.pendingFollowUps).toEqual([]);
  });

  it('a flagged reading from yesterday surfaces as a pending follow-up', async () => {
    // MIRROR-COACH P6 (2026-09-29, found by the review-fix gate at 20:13 UTC): the fixture was "20 hours ago", which is
    // YESTERDAY only while the UTC clock reads before 20:00 — pendingNextMorningFollowUps (lib/health/pain.ts) compares
    // UTC days — so this failed every evening from 1 pm PDT. The fixture is now 4 h before today's UTC midnight: always
    // yesterday. Same assertion; only the clock-dependent fixture changed. (The UTC-day rule itself is P5's, noted in
    // the P6 report: an athlete west of UTC who logs in the evening gets the follow-up the same evening.)
    const todayUtc = new Date(); todayUtc.setUTCHours(0, 0, 0, 0);
    h.rows.push({
      id: 'seed', userId: 'client-1', programExerciseId: null, exerciseName: 'Goblet Squat', bodyArea: 'knee',
      score: 6, kind: 'after', acute: [], note: null, decision: 'step_down_flag_coach', createdAt: new Date(todayUtc.getTime() - 4 * 3_600_000),
    });
    const { json } = await get();
    expect(json.pendingFollowUps).toHaveLength(1);
    expect(json.pendingFollowUps[0].exerciseName).toBe('Goblet Squat');
  });

  it('only this athlete\'s own rows are read, never another client\'s', async () => {
    h.rows.push({
      id: 'other', userId: 'client-2', programExerciseId: null, exerciseName: 'Bench Press', bodyArea: 'shoulder',
      score: 7, kind: 'after', acute: [], note: null, decision: 'step_down_flag_coach', createdAt: new Date(Date.now() - 20 * 3_600_000),
    });
    const { json } = await get();
    expect(json.pendingFollowUps).toEqual([]);
  });
});

describe('POST /api/health/pain', () => {
  it('401s with no session', async () => {
    h.user = null;
    const { status } = await post({ exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 3, kind: 'after' });
    expect(status).toBe(401);
  });

  it('invalid JSON body -> 400 invalid_json', async () => {
    const { status, json } = await post('__bad_json__');
    expect(status).toBe(400);
    expect(json.error).toBe('invalid_json');
  });

  it('an out-of-range score is refused with the field named, and nothing is written', async () => {
    const { status, json } = await post({ exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 15, kind: 'after' });
    expect(status).toBe(400);
    expect(json.error).toBe('invalid_check_in');
    expect(json.details).toContain('score: expected an integer 0-10');
    expect(h.rows).toHaveLength(0);
  });

  it('an unknown bodyArea id is refused', async () => {
    const { status, json } = await post({ exerciseName: 'Goblet Squat', bodyArea: 'left_pinky', score: 3, kind: 'after' });
    expect(status).toBe(400);
    expect(json.details).toContain('bodyArea: unknown id');
  });

  it('a valid submission is stored and answered in plain words', async () => {
    const { status, json } = await post({ exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 6, kind: 'after' });
    expect(status).toBe(200);
    expect(json.decision).toBe('step_down_flag_coach');
    expect(json.copy).toMatch(/step down/i);
    expect(json.stop).toBe(true);
    expect(json.hardStop).toBe(false);
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0].userId).toBe('client-1');
  });

  it('an acute event stops for a clinician', async () => {
    const { json } = await post({ exerciseName: 'Box Jump', bodyArea: 'ankle_foot', score: 2, kind: 'after', acute: ['pop'] });
    expect(json.decision).toBe('stop_see_clinician');
    expect(json.hardStop).toBe(true);
    expect(json.copy).not.toMatch(/diagnos/i);
  });

  it('a minor with any pain event stops and tells an adult (once a guardian has already accepted)', async () => {
    h.users['client-1'] = { dobYear: 2015 };
    h.consents.push({ menteeId: 'client-1', requestedAt: new Date('2026-09-01'), acceptedAt: new Date('2026-09-02'), revokedAt: null });
    const { json } = await post({ exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 1, kind: 'after' });
    expect(json.decision).toBe('stop_tell_adult');
  });

  it('a minor with NO accepted guardian consent is refused before the pain rule ever runs (owner decision #6)', async () => {
    h.users['client-1'] = { dobYear: 2015 };
    const { status, json } = await post({ exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 1, kind: 'after' });
    expect(status).toBe(412);
    expect(json.error).toBe('guardian_consent_required');
    expect(h.rows).toHaveLength(0); // nothing written — the gate is in front of submitPainCheckIn, not after it
  });

  it('a minor whose guardian consent was withdrawn is refused, even though one was once accepted', async () => {
    h.users['client-1'] = { dobYear: 2015 };
    h.consents.push({ menteeId: 'client-1', requestedAt: new Date('2026-09-01'), acceptedAt: new Date('2026-09-02'), revokedAt: new Date('2026-09-10') });
    const { status, json } = await post({ exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 0, kind: 'after' });
    expect(status).toBe(412);
    expect(json.error).toBe('guardian_consent_required');
  });

  // MIRROR-COACH P5 FIX (2026-09-29, code review): this test used to read "even with zero consents on file" and ran
  // with NO healthConsent table in the fake DB at all — which meant it was, unintentionally, also the proof of the
  // bug this same phase shipped (see the health-data describe block below): a pain check-in was stored for a user
  // who had never consented to health-data collection at all. The title and fixture now say precisely what this
  // test is actually about — zero GUARDIAN consents — because the default `beforeEach` above seeds an active
  // health_data grant, the same as a returning athlete who already opted in through the Mirror's intake.
  it('an adult is never asked for a guardian, even with zero GUARDIAN consents on file', async () => {
    expect(h.consents).toEqual([]); // the thing this test is actually proving is not gated on
    const { status } = await post({ exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 0, kind: 'after' });
    expect(status).toBe(200);
  });

  // MIRROR-COACH P5 FIX (2026-09-29, code review) — Finding "PainCheckIn health data is written with zero consent
  // enforcement": app/api/health/pain/route.ts's POST now checks lib/health/consent.ts activeHealthDataConsent
  // BEFORE the guardian check, and before submitPainCheckIn ever runs.
  describe('health-data consent (owner decision #4: opt-in before ANY of this is stored)', () => {
    it('no health_data consent on file at all -> 412, and nothing is written', async () => {
      h.healthConsents = [];
      const { status, json } = await post({ exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 3, kind: 'after' });
      expect(status).toBe(412);
      expect(json.error).toBe('health_data_consent_required');
      expect(h.rows).toHaveLength(0);
    });

    it('a REVOKED health_data consent is treated the same as none at all', async () => {
      h.healthConsents = [{ userId: 'client-1', scope: 'health_data', coachId: null, grantedAt: new Date('2026-09-01'), revokedAt: new Date('2026-09-10') }];
      const { status, json } = await post({ exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 3, kind: 'after' });
      expect(status).toBe(412);
      expect(json.error).toBe('health_data_consent_required');
    });

    it('a `coach_view`-scope grant (not `health_data`) does not satisfy this check — the scope must match exactly', async () => {
      h.healthConsents = [{ userId: 'client-1', scope: 'coach_view', coachId: 'coach-1', grantedAt: new Date('2026-09-01'), revokedAt: null }];
      const { status, json } = await post({ exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 3, kind: 'after' });
      expect(status).toBe(412);
      expect(json.error).toBe('health_data_consent_required');
    });

    it('an ACTIVE grant lets a valid submission through, same as before this fix', async () => {
      h.healthConsents = [{ userId: 'client-1', scope: 'health_data', coachId: null, grantedAt: new Date('2026-09-01'), revokedAt: null }];
      const { status, json } = await post({ exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 3, kind: 'after' });
      expect(status).toBe(200);
      expect(json.decision).toBe('continue');
      expect(h.rows).toHaveLength(1);
    });

    it('checked BEFORE the guardian check: a minor with no health_data consent gets health_data_consent_required, not guardian_consent_required', async () => {
      h.users['client-1'] = { dobYear: 2015 };
      h.healthConsents = [];
      h.consents = []; // also no guardian consent — proves which check fires first
      const { status, json } = await post({ exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 3, kind: 'after' });
      expect(status).toBe(412);
      expect(json.error).toBe('health_data_consent_required');
    });

    it('a minor WITH health_data consent but no guardian consent still falls through to the guardian check', async () => {
      h.users['client-1'] = { dobYear: 2015 };
      h.healthConsents = [{ userId: 'client-1', scope: 'health_data', coachId: null, grantedAt: new Date('2026-09-01'), revokedAt: null }];
      h.consents = [];
      const { status, json } = await post({ exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 3, kind: 'after' });
      expect(status).toBe(412);
      expect(json.error).toBe('guardian_consent_required');
    });
  });

  it('a settled next-morning reading resolves the easier variation by NAME from the coach\'s own catalogue link', async () => {
    h.pe.push({ id: 'pe-goblet', coachId: 'coach-1', name: 'Goblet Squat', regressionOfId: 'pe-easy' });
    h.pe.push({ id: 'pe-easy', coachId: 'coach-1', name: 'Bodyweight Squat', regressionOfId: null });
    h.rows.push({
      id: 'seed', userId: 'client-1', programExerciseId: 'pe-goblet', exerciseName: 'Goblet Squat', bodyArea: 'knee',
      score: 6, kind: 'after', acute: [], note: null, decision: 'step_down_flag_coach', createdAt: new Date(Date.now() - 20 * 3_600_000),
    });
    const { json } = await post({ programExerciseId: 'pe-goblet', exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 2, kind: 'next_morning' });
    expect(json.decision).toBe('easier_variation');
    expect(json.easierVariationName).toBe('Bodyweight Squat');
  });

  it('never resolves an easier-variation name from a DIFFERENT coach\'s catalogue row, even with a matching id', async () => {
    h.pe.push({ id: 'pe-goblet', coachId: 'coach-1', name: 'Goblet Squat', regressionOfId: 'pe-easy' });
    h.pe.push({ id: 'pe-easy', coachId: 'coach-2', name: 'Someone Else\'s Row', regressionOfId: null });
    h.rows.push({
      id: 'seed', userId: 'client-1', programExerciseId: 'pe-goblet', exerciseName: 'Goblet Squat', bodyArea: 'knee',
      score: 6, kind: 'after', acute: [], note: null, decision: 'step_down_flag_coach', createdAt: new Date(Date.now() - 20 * 3_600_000),
    });
    const { json } = await post({ programExerciseId: 'pe-goblet', exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 2, kind: 'next_morning' });
    expect(json.decision).toBe('easier_variation');
    expect(json.easierVariationName).toBeNull();
  });

  it('no easierVariationName lookup at all when the decision is not easier_variation (no unnecessary reads)', async () => {
    const spy = vi.spyOn(await import('@/lib/db').then((m) => m.prisma.programExercise), 'findUnique');
    await post({ exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 6, kind: 'after' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
