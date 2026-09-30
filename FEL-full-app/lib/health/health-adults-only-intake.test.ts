// TEEN-WRITE-BLOCK (2026-09-29; FE PM 19:19 PT, HEALTH WRITES a and f): POST /api/health/intake — the intake submit and
// the self-attested clearance — write health data ONLY for a verified 18+ account (the database's User.dobYear).
// Unknown age, 15, and 17 with a parent's accepted GuardianConsent get 403 health_data_adults_only and NOTHING is
// written: no intake, no clearance, no health_data grant, no dobYear. Run for real over the write-spy client.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ userId: null as string | null, prisma: null as any }));
vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.userId,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.prisma[p]) }) }));

import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/health/intake/route';
import { INTAKE_VERSION } from './intake';
import {
  HEALTH_ADULT, HEALTH_REFUSED_CASES, THIS_YEAR, argsOf, callsOn, newSpyDb, seedUser, spyPrisma, writesOf, type AgeCase, type SpyDb,
} from '@/tests/helpers/writeSpyDb';

const UID = 'athlete-intake-1';
const REFUSED = { status: 403, json: { error: 'health_data_adults_only', saved: false } };
/** Every yes/no answered "no"; birth_year skipped (an adult's is already on file). */
const ANSWERS = {
  current_pain: false, recent_injury_or_surgery: false, dizziness_fainting_chest_pain: false, heart_or_bp_condition: false,
  pregnancy_or_postpartum: false, heart_rate_or_balance_medicine: false, clinician_told_to_avoid: false,
};
let db: SpyDb;

function as(c: AgeCase) {
  db = newSpyDb();
  c.seed(db, UID);
  h.prisma = spyPrisma(db);
}
async function post(body: unknown) {
  const req = new NextRequest('http://fel.test/api/health/intake', {
    method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json' },
  });
  const res = await POST(req);
  return { status: res.status, json: await res.json() };
}
const flaggedIntake = () => ({
  id: 'intake-1', userId: UID, version: INTAKE_VERSION, answers: { ...ANSWERS, heart_or_bp_condition: true },
  redFlags: ['heart_or_bp_condition'], birthYear: null, consentedAt: new Date('2026-09-20T00:00:00Z'), clearedAt: null,
  createdAt: new Date('2026-09-20T00:00:00Z'),
});

beforeEach(() => { h.userId = UID; });

describe('a) intake submit', () => {
  it.each(HEALTH_REFUSED_CASES.map((c) => [c.id, c] as const))('%s → 403, zero writes, and the guardian row is never read', async (_id, c) => {
    as(c);
    expect(await post({ answers: ANSWERS, consent: true })).toEqual(REFUSED);
    expect(writesOf(db)).toEqual([]);
    expect(db.calls.map((x) => x.op)).toEqual(['user.findUnique']);
    expect(callsOn(db, 'guardianConsent')).toEqual([]);
    expect(db.tables.healthIntake ?? []).toEqual([]);
  });

  it('a blank dobYear whose OWN birth_year answer says 1990 is still refused: the answer is never trusted', async () => {
    as(HEALTH_REFUSED_CASES[0]);
    expect(await post({ answers: { ...ANSWERS, birth_year: 1990 }, consent: true })).toEqual(REFUSED);
    expect(writesOf(db)).toEqual([]);
    expect(db.tables.user[0].dobYear).toBeNull();
  });

  it('the adult: exactly today\'s writes (the health_data grant and the intake, in one transaction) and today\'s answer', async () => {
    as(HEALTH_ADULT);
    const r = await post({ answers: ANSWERS, consent: true });
    expect(r.status).toBe(200);
    expect(Object.keys(r.json).sort()).toEqual(['hardStopped', 'intake', 'redFlagCopy']);
    expect(Object.keys(r.json.intake).sort()).toEqual(['birthYear', 'consentedAt', 'id', 'redFlags', 'version']);
    expect(r.json).toMatchObject({ hardStopped: false, redFlagCopy: null, intake: { redFlags: [], birthYear: null, version: INTAKE_VERSION } });
    expect(writesOf(db)).toEqual(['$transaction', 'healthConsent.create', 'healthIntake.create']);
    expect(argsOf(db, 'healthConsent.create')[0].data).toMatchObject({ userId: UID, scope: 'health_data' });
  });

  it.each([...HEALTH_REFUSED_CASES, HEALTH_ADULT].map((c) => [c.id, c] as const))('%s: bad JSON is still a 400, and 401 stays 401', async (_id, c) => {
    as(c);
    expect(await post('{not json')).toEqual({ status: 400, json: { error: 'invalid_json' } });
    h.userId = null;
    expect((await post({ answers: ANSWERS, consent: true })).status).toBe(401);
    expect(writesOf(db)).toEqual([]);
  });

  // TEEN-WRITE-BLOCK-2 (FE PM 23:05 PT): the guardian allowance inside submitIntake is removed, and with it the route's 412
  // mapping. A minor's birth_year answer (what used to trip it) now gets 403 for the three refused users and, for the
  // adult on file, is just an answer: the DB's year decides (assumption: the ruling's "DB dobYear only" includes this).
  it.each([...HEALTH_REFUSED_CASES, HEALTH_ADULT].map((c) => [c.id, c] as const))('%s: no 412 guardian_consent_required is ever answered', async (_id, c) => {
    for (const answers of [ANSWERS, { ...ANSWERS, birth_year: THIS_YEAR - 14 }]) {
      as(c);
      const r = await post({ answers, consent: true });
      expect(r.status).not.toBe(412);
      expect(r.json.error).not.toBe('guardian_consent_required');
      expect(r.status).toBe(c === HEALTH_ADULT ? 200 : 403);
      expect(callsOn(db, 'guardianConsent')).toEqual([]);
    }
  });
});

describe('f) intake clear ("I checked with a clinician")', () => {
  it.each(HEALTH_REFUSED_CASES.map((c) => [c.id, c] as const))('%s → 403, and the intake is not cleared', async (_id, c) => {
    as(c);
    db.tables.healthIntake = [flaggedIntake()];
    expect(await post({ action: 'clear', intakeId: 'intake-1' })).toEqual(REFUSED);
    expect(writesOf(db)).toEqual([]);
    expect(db.tables.healthIntake[0].clearedAt).toBeNull();
  });

  it('the adult: today\'s one update and today\'s answer', async () => {
    as(HEALTH_ADULT);
    db.tables.healthIntake = [flaggedIntake()];
    const r = await post({ action: 'clear', intakeId: 'intake-1' });
    expect(r.status).toBe(200);
    expect(Object.keys(r.json)).toEqual(['intake']);
    expect(Object.keys(r.json.intake).sort()).toEqual(['clearedAt', 'id']);
    expect(writesOf(db)).toEqual(['healthIntake.update']);
  });

  it.each([...HEALTH_REFUSED_CASES, HEALTH_ADULT].map((c) => [c.id, c] as const))('%s: a clear with no intake id is still a 400', async (_id, c) => {
    as(c);
    expect(await post({ action: 'clear' })).toEqual({ status: 400, json: { error: 'missing_intake_id' } });
    expect(writesOf(db)).toEqual([]);
  });
});

describe('GET /api/health/intake is a read and is unchanged', () => {
  it('a 15-year-old still gets the questions and their status', async () => {
    as(HEALTH_REFUSED_CASES[1]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).questions.length).toBeGreaterThan(0);
    expect(writesOf(db)).toEqual([]);
  });

  it('control: the seeded 15-year-old really is 15 in the database', () => {
    as(HEALTH_REFUSED_CASES[1]);
    expect(new Date().getFullYear() - db.tables.user[0].dobYear).toBe(15);
    seedUser(db, 'other', 1990);
    expect(db.tables.user).toHaveLength(2);
  });
});
