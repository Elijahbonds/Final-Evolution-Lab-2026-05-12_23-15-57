// TEEN-WRITE-BLOCK (2026-09-29; FE PM 19:19 PT, HEALTH WRITES b and c): a pain check-in and a readiness check-in are
// written ONLY for a verified 18+ account (the database's User.dobYear), checked BEFORE the health_data consent. Unknown
// age, 15, and 17 with a parent's accepted GuardianConsent — each WITH an active health_data grant, so only the age rule
// can refuse — get 403 health_data_adults_only and nothing is written. The readiness clear stays open to everyone (it
// erases the athlete's own row). Run for real over the write-spy client.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ userId: null as string | null, prisma: null as any }));
vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.userId,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.prisma[p]) }) }));

import { NextRequest } from 'next/server';
import { GET as painGET, POST as painPOST } from '@/app/api/health/pain/route';
import { GET as readinessGET, POST as readinessPOST } from '@/app/api/health/readiness/route';
import { localDayKey } from './readiness';
import {
  HEALTH_ADULT, HEALTH_REFUSED_CASES, argsOf, callsOn, newSpyDb, spyPrisma, writesOf, type AgeCase, type SpyDb,
} from '@/tests/helpers/writeSpyDb';

const UID = 'athlete-health-1';
const REFUSED = { status: 403, json: { error: 'health_data_adults_only', saved: false } };
const TODAY = localDayKey(new Date());
const PAIN = { exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 3, kind: 'after' };
let db: SpyDb;

/** The user, plus an ACTIVE health_data grant for every case (so only the age rule can refuse). */
function as(c: AgeCase) {
  db = newSpyDb();
  c.seed(db, UID);
  db.tables.healthConsent = [{ id: 'hc1', userId: UID, scope: 'health_data', coachId: null, grantedAt: new Date('2026-09-01T00:00:00Z'), revokedAt: null }];
  h.prisma = spyPrisma(db);
}
async function send(handler: (r: NextRequest) => Promise<Response>, path: string, body: unknown) {
  const req = new NextRequest(`http://fel.test${path}`, {
    method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json' },
  });
  const res = await handler(req);
  return { status: res.status, json: await res.json() };
}
const pain = (body: unknown) => send(painPOST, '/api/health/pain', body);
const readiness = (body: unknown) => send(readinessPOST, '/api/health/readiness', body);

beforeEach(() => { h.userId = UID; });

describe('b) POST /api/health/pain', () => {
  it.each(HEALTH_REFUSED_CASES.map((c) => [c.id, c] as const))('%s (with health_data consent) → 403, zero writes, GuardianConsent never read', async (_id, c) => {
    as(c);
    expect(await pain(PAIN)).toEqual(REFUSED);
    expect(writesOf(db)).toEqual([]);
    expect(db.calls.map((x) => x.op)).toEqual(['user.findUnique']);
    expect(callsOn(db, 'guardianConsent')).toEqual([]);
  });

  it('the adult: exactly today\'s writes and today\'s answer', async () => {
    as(HEALTH_ADULT);
    const r = await pain(PAIN);
    expect(r.status).toBe(200);
    expect(Object.keys(r.json).sort()).toEqual(['checkIn', 'copy', 'decision', 'easierVariationName', 'hardStop', 'stop']);
    expect(r.json.decision).toBe('continue');
    expect(writesOf(db)).toEqual(['$transaction', 'painCheckIn.create']);
    expect(argsOf(db, 'painCheckIn.create')[0].data).toMatchObject({ userId: UID, exerciseName: 'Goblet Squat', score: 3 });
    expect(callsOn(db, 'guardianConsent')).toEqual([]);
  });

  it('the adult with no health_data grant still hears about consent (412), after the age check', async () => {
    as(HEALTH_ADULT);
    db.tables.healthConsent = [];
    expect(await pain(PAIN)).toEqual({ status: 412, json: { error: 'health_data_consent_required' } });
    expect(writesOf(db)).toEqual([]);
  });

  it.each([...HEALTH_REFUSED_CASES, HEALTH_ADULT].map((c) => [c.id, c] as const))('%s: bad JSON is still a 400; 401 stays 401', async (_id, c) => {
    as(c);
    expect(await pain('{not json')).toEqual({ status: 400, json: { error: 'invalid_json' } });
    h.userId = null;
    expect((await pain(PAIN)).status).toBe(401);
    expect(writesOf(db)).toEqual([]);
  });

  it('GET (a read) is unchanged for a 15-year-old', async () => {
    as(HEALTH_REFUSED_CASES[1]);
    const res = await painGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pendingFollowUps: [] });
  });
});

describe('c) POST /api/health/readiness', () => {
  it.each(HEALTH_REFUSED_CASES.map((c) => [c.id, c] as const))('%s (with health_data consent) → 403, nothing stored', async (_id, c) => {
    as(c);
    expect(await readiness({ date: TODAY, sleep: 3, energy: 4 })).toEqual(REFUSED);
    expect(writesOf(db)).toEqual([]);
    expect(callsOn(db, 'guardianConsent')).toEqual([]);
    expect(db.tables.readinessCheckIn ?? []).toEqual([]);
  });

  it('the adult: today\'s one upsert and today\'s answer', async () => {
    as(HEALTH_ADULT);
    const r = await readiness({ date: TODAY, sleep: 3, energy: 4 });
    expect(r.status).toBe(200);
    expect(Object.keys(r.json).sort()).toEqual(['checkIn', 'date', 'read']);
    expect(writesOf(db)).toEqual(['readinessCheckIn.upsert']);
    expect(callsOn(db, 'guardianConsent')).toEqual([]);
  });

  it.each([...HEALTH_REFUSED_CASES, HEALTH_ADULT].map((c) => [c.id, c] as const))('%s: the CLEAR (all four blank) stays open — it erases their own row', async (_id, c) => {
    as(c);
    db.tables.readinessCheckIn = [{ id: 'rc1', userId: UID, date: TODAY, sleep: 2, soreness: null, energy: null, mood: null, updatedAt: new Date() }];
    const r = await readiness({ date: TODAY, sleep: null, soreness: null, energy: null, mood: null });
    expect(r.status).toBe(200);
    expect(r.json.checkIn).toBeNull();
    expect(writesOf(db)).toEqual(['readinessCheckIn.deleteMany']);
    expect(db.tables.readinessCheckIn).toEqual([]);
  });

  it.each([...HEALTH_REFUSED_CASES, HEALTH_ADULT].map((c) => [c.id, c] as const))('%s: a bad day or a bad answer is still a 400', async (_id, c) => {
    as(c);
    expect(await readiness({ date: '2020-01-01', sleep: 3 })).toEqual({ status: 400, json: { error: 'not_today' } });
    expect((await readiness({ date: TODAY, sleep: 9 })).status).toBe(400);
    expect(writesOf(db)).toEqual([]);
  });

  it('GET (a read) is unchanged, guardianOk included', async () => {
    as(HEALTH_REFUSED_CASES[2]);
    const res = await readinessGET(new NextRequest(`http://fel.test/api/health/readiness?date=${TODAY}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ date: TODAY, checkIn: null, healthDataConsent: true, guardianOk: true });
  });
});
