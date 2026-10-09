// TEEN-WRITE-BLOCK (2026-09-29), GAP 1 row 1h: POST /api/v1/camp/sessions keeps the facilitator's session record as
// today, but the MENTEE's PRQ and movement deltas are written only when the mentee is a verified 18+ account that has
// opted in. The facilitator's age and opt-in never count. Run for real over the write-spy client.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ userId: null as string | null, prisma: null as any }));
vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.userId,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
  requirePaidFacilitator: async () => null,
}));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.prisma[p]) }) }));
vi.mock('@/lib/privacy/scanSaveOptIn', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/privacy/scanSaveOptIn')>();
  return { scanSaveOptIn: vi.fn(real.scanSaveOptIn) };
});

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/v1/camp/sessions/route';
import { scanSaveOptIn } from '@/lib/privacy/scanSaveOptIn';
import { defaultMetrics } from '@/lib/workout/movement-screen';
import {
  OPTED_IN_ADULT, REFUSED_SCAN_CASES, THIS_YEAR, argsOf, callsOn, newSpyDb, seedUser, spyPrisma, writesOf, type AgeCase, type SpyDb,
} from '@/tests/helpers/writeSpyDb';

const FAC = 'facilitator-1';
const MENTEE = 'mentee-1';
const optIn = vi.mocked(scanSaveOptIn);
const realOptIn = optIn.getMockImplementation()!;
let db: SpyDb;

/** A facilitated plan with the mentee's numbers on file: a PRQ entry before and after the plan locked, two screens, a game. */
function world(mentee: AgeCase, facilitatorYear: number | null = 1985) {
  db = newSpyDb();
  seedUser(db, FAC, facilitatorYear);
  mentee.seed(db, MENTEE);
  db.tables.goalPlan = [{
    id: 'plan-1', menteeId: MENTEE, facilitatorUserId: FAC, facilitatorId: 'fp-1', status: 'active',
    lockedAt: new Date('2026-09-10T00:00:00Z'), createdAt: new Date('2026-09-01T00:00:00Z'),
  }];
  db.tables.campSession = [];
  db.tables.prqEntry = [
    { id: 'p1', userId: MENTEE, attribute: 'speed', value: 50, measuredAt: new Date('2026-09-05T00:00:00Z') },
    { id: 'p2', userId: MENTEE, attribute: 'speed', value: 60, measuredAt: new Date('2026-09-20T00:00:00Z') },
  ];
  db.tables.workoutScan = [
    { id: 's1', userId: MENTEE, kind: 'movement_screen', metrics: { ...defaultMetrics(), jumpHeightCm: 30 }, createdAt: new Date('2026-09-11T00:00:00Z') },
    { id: 's2', userId: MENTEE, kind: 'movement_screen', metrics: { ...defaultMetrics(), jumpHeightCm: 60 }, createdAt: new Date('2026-09-21T00:00:00Z') },
  ];
  db.tables.gameSession = [{ id: 'g1', userId: MENTEE, createdAt: new Date('2026-09-15T00:00:00Z'), won: false }];
  h.prisma = spyPrisma(db);
}
async function post(body: unknown) {
  const req = new NextRequest('http://fel.test/api/v1/camp/sessions', {
    method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json' },
  });
  const res = await POST(req);
  return { status: res.status, json: await res.json() };
}
const BODY = { goalPlanId: 'plan-1', moduleKeys: ['speed/start'], notes: 'good session' };

beforeEach(() => { h.userId = FAC; optIn.mockImplementation(realOptIn); });

describe('POST /api/v1/camp/sessions — the record saves; the mentee\'s numbers only for a verified, opted-in adult', () => {
  it.each(REFUSED_SCAN_CASES.map((c) => [c.id, c] as const))('mentee %s → the record is created with no prqDelta or movementDelta, and nothing else is written', async (_id, c) => {
    world(c);
    const r = await post(BODY);
    expect(r.status).toBe(200);
    expect(r.json.deltasSaved).toBe(false);
    expect(r.json.gamesAttached).toBe(1);
    expect(writesOf(db)).toEqual(['campSession.create']);
    const data = argsOf(db, 'campSession.create')[0].data;
    expect(data.prqDelta).toBeUndefined();
    expect(data.movementDelta).toBeUndefined();
    expect(data).toMatchObject({ goalPlanId: 'plan-1', facilitatorId: 'fp-1', menteeId: MENTEE, moduleKeys: ['speed/start'], gameSessionIds: ['g1'], notes: 'good session' });
    expect(db.tables.campSession[0].prqDelta ?? null).toBeNull();
    // the mentee's PRQ and screens are not even read when they can't be kept
    expect(callsOn(db, 'prqEntry')).toEqual([]);
    expect(callsOn(db, 'workoutScan')).toEqual([]);
    // the gate asked about the MENTEE, never the facilitator
    expect(argsOf(db, 'user.findUnique').map((a) => a.where.id)).toEqual([MENTEE]);
  });

  it('mentee 18+ OPTED IN (positive control): today\'s one write, deltas included, and today\'s answer', async () => {
    world(OPTED_IN_ADULT);
    optIn.mockImplementation(async () => true);
    const r = await post(BODY);
    expect(r.status).toBe(200);
    expect(Object.keys(r.json).sort()).toEqual(['gamesAttached', 'session']);
    expect(writesOf(db)).toEqual(['campSession.create']);
    const data = argsOf(db, 'campSession.create')[0].data;
    expect(data.prqDelta).toEqual({ speed: 10 });
    // the power pillar is jumpHeightCm / 75 × 100: 30 cm → 40, 60 cm → 80 (lib/workout/movement-screen.ts analyzeMovement)
    expect(Object.values(data.movementDelta as Record<string, number>)).toContain(40);
  });

  it('an opted-in ADULT facilitator does not make a 15-year-old mentee\'s numbers savable', async () => {
    world(REFUSED_SCAN_CASES.find((c) => c.id === '15')!, 1985);
    optIn.mockImplementation(async () => true);
    const r = await post(BODY);
    expect(r.json.deltasSaved).toBe(false);
    expect(argsOf(db, 'campSession.create')[0].data.prqDelta).toBeUndefined();
  });

  it('an unknown-age facilitator does not stop an opted-in adult mentee\'s numbers', async () => {
    world(OPTED_IN_ADULT, null);
    optIn.mockImplementation(async () => true);
    const r = await post(BODY);
    expect(r.json.deltasSaved).toBeUndefined();
    expect(argsOf(db, 'campSession.create')[0].data.prqDelta).toEqual({ speed: 10 });
  });

  it.each([...REFUSED_SCAN_CASES, OPTED_IN_ADULT].map((c) => [c.id, c] as const))('mentee %s: a bad request still gets its 4xx, and nothing is written', async (_id, c) => {
    world(c);
    expect(await post('{not json')).toEqual({ status: 400, json: { error: 'invalid_json' } });
    expect(await post({ goalPlanId: 'nope' })).toEqual({ status: 404, json: { error: 'not_found' } });
    expect(writesOf(db)).toEqual([]);
  });

  it('a 17-year-old mentee WITH an accepted GuardianConsent: the parent\'s yes is never read', async () => {
    world(REFUSED_SCAN_CASES.find((c) => c.id.startsWith('17'))!);
    optIn.mockImplementation(async () => true);
    await post(BODY);
    expect(callsOn(db, 'guardianConsent')).toEqual([]);
    expect(argsOf(db, 'campSession.create')[0].data.movementDelta).toBeUndefined();
    expect(THIS_YEAR - (db.tables.user.find((u) => u.id === MENTEE)!.dobYear as number)).toBe(17);
  });
});
