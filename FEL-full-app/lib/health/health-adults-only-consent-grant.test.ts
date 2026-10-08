// TEEN-WRITE-BLOCK-2 (FE PM 23:05 PT; HEALTH WRITES d and e): the health_data and coach_view GRANTS (POST
// /api/health/consent action 'grant') are health-data writes, taken only from a verified 18+ account (the database's
// User.dobYear). Unknown age, 15, and 17 with a parent's accepted GuardianConsent get 403 health_data_adults_only, no
// HealthConsent row, and the GuardianConsent is never read. Revoke (both scopes) and erase stay open to everyone. Run for
// real over the write-spy client; only the session and the database are stand-ins.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ session: null as unknown, prisma: null as any }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.prisma[p]) }) }));

import { POST } from '@/app/api/health/consent/route';
import {
  HEALTH_ADULT, HEALTH_REFUSED_CASES, argsOf, callsOn, newSpyDb, spyPrisma, writesOf, type AgeCase, type SpyDb,
} from '@/tests/helpers/writeSpyDb';

const UID = 'athlete-grant-1';
const REFUSED = { status: 403, json: { error: 'health_data_adults_only', saved: false } };
const VIEW_KEYS = ['coaches', 'counts', 'healthData'];
let db: SpyDb;

/** The user, an active coach on their roster, and (withHealthData) a live health_data grant: only the age can refuse. */
function as(c: AgeCase, withHealthData = false) {
  db = newSpyDb();
  c.seed(db, UID);
  db.tables.coachClient = [{ id: 'cc1', coachId: 'coach-1', clientId: UID, endedAt: null, coach: { name: 'Coach One', email: 'coach@fel.test' } }];
  db.tables.healthConsent = withHealthData
    ? [{ id: 'hc1', userId: UID, scope: 'health_data', coachId: null, grantedAt: new Date('2026-09-01T00:00:00Z'), revokedAt: null }]
    : [];
  h.prisma = spyPrisma(db);
}
/** Every non-empty table as it stands (a read makes an empty one in the spy), to prove a refusal changed nothing. */
const snapshot = () => JSON.stringify(Object.fromEntries(Object.entries(db.tables).filter(([, rows]) => rows.length > 0)));
async function post(body: unknown) {
  const res = await POST(new Request('http://fel.test/api/health/consent', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
  return { status: res.status, json: await res.json() };
}
const REFUSED_ROWS = HEALTH_REFUSED_CASES.map((c) => [c.id, c] as const);
const ALL_ROWS = [...HEALTH_REFUSED_CASES, HEALTH_ADULT].map((c) => [c.id, c] as const);

beforeEach(() => { h.session = { user: { id: UID } }; });

describe('control: the cases are the ones the brief names', () => {
  it('unknown age, 15 and 17 with an ACCEPTED GuardianConsent are refused; the adult is 1990', () => {
    expect(HEALTH_REFUSED_CASES.map((c) => c.id)).toEqual(['unknown age (dobYear null)', '15', '17 with an accepted GuardianConsent']);
    as(HEALTH_REFUSED_CASES[2]);
    expect(db.tables.guardianConsent).toHaveLength(1);
    expect(db.tables.guardianConsent[0].acceptedAt).toBeInstanceOf(Date);
    expect(HEALTH_ADULT.dobYear).toBe(1990);
  });
});

describe('d) grant health_data', () => {
  it.each(REFUSED_ROWS)('%s → 403, zero HealthConsent writes, GuardianConsent never read', async (_id, c) => {
    as(c);
    const before = snapshot();
    expect(await post({ action: 'grant', scope: 'health_data' })).toEqual(REFUSED);
    expect(writesOf(db)).toEqual([]);
    expect(db.calls.map((x) => x.op)).toEqual(['user.findUnique']);
    expect(callsOn(db, 'guardianConsent')).toEqual([]);
    expect(snapshot()).toBe(before);
  });

  it('the adult: today\'s one row and today\'s view model', async () => {
    as(HEALTH_ADULT);
    const r = await post({ action: 'grant', scope: 'health_data' });
    expect(r.status).toBe(200);
    expect(Object.keys(r.json).sort()).toEqual(VIEW_KEYS);
    expect(writesOf(db)).toEqual(['healthConsent.create']);
    expect(argsOf(db, 'healthConsent.create')[0].data).toMatchObject({ userId: UID, scope: 'health_data' });
    expect(r.json.healthData.granted).toBe(true);
  });

  it('the adult with health_data already on: nothing new written (the idempotent rule is unchanged)', async () => {
    as(HEALTH_ADULT, true);
    const r = await post({ action: 'grant', scope: 'health_data' });
    expect(r.status).toBe(200);
    expect(writesOf(db)).toEqual([]);
  });
});

describe('e) grant coach_view (health_data on, an active coach on the roster)', () => {
  it.each(REFUSED_ROWS)('%s → 403, zero HealthConsent writes, GuardianConsent never read', async (_id, c) => {
    as(c, true);
    const before = snapshot();
    expect(await post({ action: 'grant', scope: 'coach_view', coachId: 'coach-1' })).toEqual(REFUSED);
    expect(writesOf(db)).toEqual([]);
    expect(db.calls.map((x) => x.op)).toEqual(['user.findUnique']);
    expect(callsOn(db, 'guardianConsent')).toEqual([]);
    expect(snapshot()).toBe(before);
  });

  it('the adult: today\'s one coach_view row and today\'s view model', async () => {
    as(HEALTH_ADULT, true);
    const r = await post({ action: 'grant', scope: 'coach_view', coachId: 'coach-1' });
    expect(r.status).toBe(200);
    expect(Object.keys(r.json).sort()).toEqual(VIEW_KEYS);
    expect(writesOf(db)).toEqual(['healthConsent.create']);
    expect(argsOf(db, 'healthConsent.create')[0].data).toMatchObject({ userId: UID, scope: 'coach_view', coachId: 'coach-1' });
    expect(r.json.coaches).toEqual([expect.objectContaining({ coachId: 'coach-1', viewGranted: true })]);
  });
});

describe('revoke and erase stay open to everyone', () => {
  const live = () => [
    { id: 'hc1', userId: UID, scope: 'health_data', coachId: null, grantedAt: new Date('2026-09-01T00:00:00Z'), revokedAt: null },
    { id: 'hc2', userId: UID, scope: 'coach_view', coachId: 'coach-1', grantedAt: new Date('2026-09-02T00:00:00Z'), revokedAt: null },
  ];

  it.each(REFUSED_ROWS)('%s: revoke coach_view → 200, that grant is revoked and health_data is not', async (_id, c) => {
    as(c);
    db.tables.healthConsent = live();
    const r = await post({ action: 'revoke', scope: 'coach_view', coachId: 'coach-1' });
    expect(r.status).toBe(200);
    expect(r.json.error).toBeUndefined();
    expect(writesOf(db)).toEqual(['healthConsent.updateMany']);
    expect(db.tables.healthConsent.find((x) => x.id === 'hc2')!.revokedAt).toBeInstanceOf(Date);
    expect(db.tables.healthConsent.find((x) => x.id === 'hc1')!.revokedAt).toBeNull();
  });

  it.each(REFUSED_ROWS)('%s: revoke health_data → 200, every live grant is revoked', async (_id, c) => {
    as(c);
    db.tables.healthConsent = live();
    const r = await post({ action: 'revoke', scope: 'health_data' });
    expect(r.status).toBe(200);
    expect(writesOf(db)).toEqual(['healthConsent.updateMany', 'healthConsent.updateMany']);
    expect(db.tables.healthConsent.every((x) => x.revokedAt instanceof Date)).toBe(true);
  });

  it.each(REFUSED_ROWS)('%s: erase → 200, the health rows are gone', async (_id, c) => {
    as(c);
    db.tables.healthIntake = [{ id: 'i1', userId: UID, redFlags: [], createdAt: new Date() }];
    db.tables.painCheckIn = [{ id: 'p1', userId: UID, createdAt: new Date() }];
    db.tables.readinessCheckIn = [{ id: 'r1', userId: UID, date: '2026-09-29' }];
    const r = await post({ action: 'erase' });
    expect(r.status).toBe(200);
    expect(writesOf(db)[0]).toBe('$transaction');
    for (const t of ['healthIntake', 'painCheckIn', 'readinessCheckIn']) expect(db.tables[t], t).toEqual([]);
  });
});

describe('the 400s and the 401 are unchanged, and come before the age is read', () => {
  it.each(ALL_ROWS)('%s: bad_action, bad_scope, coach_id_required are still 400s, nothing read or written', async (_id, c) => {
    as(c);
    expect(await post({ action: 'nope' })).toEqual({ status: 400, json: { error: 'bad_action' } });
    expect(await post({ action: 'grant', scope: 'nope' })).toEqual({ status: 400, json: { error: 'bad_scope' } });
    expect(await post({ action: 'grant', scope: 'coach_view' })).toEqual({ status: 400, json: { error: 'coach_id_required' } });
    expect(db.calls).toEqual([]);
  });

  it('signed out: 401, and the gate reads nothing', async () => {
    as(HEALTH_REFUSED_CASES[1]);
    h.session = null;
    expect(await post({ action: 'grant', scope: 'health_data' })).toEqual({ status: 401, json: { error: 'unauthorized' } });
    expect(db.calls).toEqual([]);
  });
});
