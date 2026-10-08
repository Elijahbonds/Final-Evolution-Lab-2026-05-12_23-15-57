// MIRROR-COACH P6 (2026-09-29): app/api/health/readiness's routes, run for real over a fake Prisma client — the same
// vi.mock pattern lib/health/pain-route.test.ts uses (app/ is out of vitest's include list; only the session and the
// database are stand-ins here). What this proves: the consent gate is server-side and runs before any write, a minor
// needs a guardian, one row per athlete per day (a second answer edits it), only today can be written, a skip stores
// nothing, and the response carries nothing a scoring path could pick up.
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Row {
  id: string; userId: string; date: string;
  sleep: number | null; soreness: number | null; energy: number | null; mood: number | null;
  createdAt: Date; updatedAt: Date;
}
interface GuardianRow { menteeId: string; requestedAt: Date; acceptedAt: Date | null; revokedAt: Date | null }
interface HealthConsentRow { userId: string; scope: string; coachId: string | null; grantedAt: Date; revokedAt: Date | null }

const h = vi.hoisted(() => ({
  user: 'client-1' as string | null,
  rows: [] as Row[],
  users: {} as Record<string, { dobYear: number | null }>,
  guardian: [] as GuardianRow[],
  healthConsents: [] as HealthConsentRow[],
  writes: [] as string[],
  clock: 0,
  nextId: 1,
}));

const pick = (r: Row, select?: Record<string, boolean>) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, (r as unknown as Record<string, unknown>)[k]])) : r);

vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.user,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));

vi.mock('@/lib/db', () => {
  const client = {
    readinessCheckIn: {
      findUnique: async ({ where, select }: { where: { userId_date: { userId: string; date: string } }; select?: Record<string, boolean> }) => {
        const r = h.rows.find((x) => x.userId === where.userId_date.userId && x.date === where.userId_date.date);
        return r ? pick(r, select) : null;
      },
      upsert: async ({ where, create, update, select }: {
        where: { userId_date: { userId: string; date: string } };
        create: Omit<Row, 'id' | 'createdAt' | 'updatedAt'>; update: Partial<Row>; select?: Record<string, boolean>;
      }) => {
        h.writes.push('upsert');
        const at = new Date(Date.UTC(2026, 8, 29, 8, 0, h.clock++));
        const r = h.rows.find((x) => x.userId === where.userId_date.userId && x.date === where.userId_date.date);
        if (r) { Object.assign(r, update, { updatedAt: at }); return pick(r, select); }
        const row: Row = { id: `rc${h.nextId++}`, createdAt: at, updatedAt: at, ...create };
        h.rows.push(row);
        return pick(row, select);
      },
      deleteMany: async ({ where }: { where: { userId: string; date: string } }) => {
        h.writes.push('deleteMany');
        const before = h.rows.length;
        h.rows = h.rows.filter((x) => !(x.userId === where.userId && x.date === where.date));
        return { count: before - h.rows.length };
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => (h.users[where.id] ? { dobYear: h.users[where.id].dobYear } : null),
    },
    guardianConsent: {
      findMany: async ({ where }: { where: { menteeId: string } }) => h.guardian.filter((c) => c.menteeId === where.menteeId),
    },
    healthConsent: {
      findMany: async ({ where }: { where: { userId: string; scope: string } }) =>
        h.healthConsents.filter((c) => c.userId === where.userId && c.scope === where.scope),
    },
  };
  // anything else the route touches is a bug in this test's premise — e.g. a PRQ, wallet or session table
  return {
    prisma: new Proxy(client, {
      get: (t, prop) => {
        if (prop === 'then') return undefined;
        if (!(prop in t)) throw new Error(`the readiness route touched prisma.${String(prop)}`);
        return (t as Record<string | symbol, unknown>)[prop];
      },
    }),
  };
});

import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/health/readiness/route';
import { localDayKey, READINESS_SUGGESTION, READINESS_EXTRA_WARMUP_MINUTES } from './readiness';

const TODAY = localDayKey(new Date());

async function get(date: string | null = TODAY) {
  const url = date === null ? 'http://fel.test/api/health/readiness' : `http://fel.test/api/health/readiness?date=${encodeURIComponent(date)}`;
  const res = await GET(new NextRequest(url));
  return { status: res.status, json: await res.json() };
}
async function post(body: unknown) {
  const req = body === '__bad_json__'
    ? new NextRequest('http://fel.test/api/health/readiness', { method: 'POST', body: '{not json', headers: { 'content-type': 'application/json' } })
    : new NextRequest('http://fel.test/api/health/readiness', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  const res = await POST(req);
  return { status: res.status, json: await res.json() };
}

const GRANT: HealthConsentRow = { userId: 'client-1', scope: 'health_data', coachId: null, grantedAt: new Date('2026-09-01'), revokedAt: null };

beforeEach(() => {
  h.user = 'client-1';
  h.rows = [];
  h.users = { 'client-1': { dobYear: 1990 } };
  h.guardian = [];
  h.healthConsents = [{ ...GRANT }];
  h.writes = [];
  h.clock = 0;
  h.nextId = 1;
});

describe('auth and the day', () => {
  it('401s with no session, on both verbs', async () => {
    h.user = null;
    expect((await get()).status).toBe(401);
    expect((await post({ date: TODAY, sleep: 3 })).status).toBe(401);
  });

  it('refuses a missing, malformed or non-today date — "editable that day" means only today can be written', async () => {
    expect((await get(null)).json).toEqual({ error: 'not_today' });
    expect((await get('yesterday')).status).toBe(400);
    const r = await post({ date: '2020-01-01', sleep: 3 });
    expect(r).toEqual({ status: 400, json: { error: 'not_today' } });
    expect(h.writes).toEqual([]);
  });

  it('400s on bad JSON and on an answer off the scale, naming it, writing nothing', async () => {
    expect((await post('__bad_json__')).json).toEqual({ error: 'invalid_json' });
    const r = await post({ date: TODAY, sleep: 9, mood: 3 });
    expect(r).toEqual({ status: 400, json: { error: 'invalid_answers', details: ['sleep'] } });
    expect(h.writes).toEqual([]);
  });
});

describe('consent gate — server-side, before any write (P5’s lesson)', () => {
  it('no health_data consent → 412 health_data_consent_required and nothing stored', async () => {
    h.healthConsents = [];
    const r = await post({ date: TODAY, sleep: 2, energy: 2 });
    expect(r).toEqual({ status: 412, json: { error: 'health_data_consent_required' } });
    expect(h.rows).toEqual([]);
    expect(h.writes).toEqual([]);
  });

  it('a REVOKED health_data grant is the same as none', async () => {
    h.healthConsents = [{ ...GRANT, revokedAt: new Date('2026-09-20') }];
    expect((await post({ date: TODAY, mood: 4 })).status).toBe(412);
    expect(h.rows).toEqual([]);
  });

  it('a coach_view grant alone does not count as health_data consent', async () => {
    h.healthConsents = [{ ...GRANT, scope: 'coach_view', coachId: 'coach-1' }];
    expect((await post({ date: TODAY, mood: 4 })).json.error).toBe('health_data_consent_required');
  });

  // TEEN-WRITE-BLOCK (2026-09-29; Elijah: health data saves ONLY for a verified adult, the parent-consent path is gone).
  // Before: "health_data is checked FIRST: a minor with no consent at all hears about consent" (412
  // health_data_consent_required). After: the AGE is checked first, so that minor gets 403 health_data_adults_only; an
  // adult with no consent still gets the 412 (the tests above).
  it('the AGE is checked first: a minor with no consent at all gets 403 health_data_adults_only', async () => {
    h.healthConsents = [];
    h.users['client-1'] = { dobYear: 2012 };
    expect(await post({ date: TODAY, mood: 4 })).toEqual({ status: 403, json: { error: 'health_data_adults_only', saved: false } });
    expect(h.writes).toEqual([]);
  });

  // TEEN-WRITE-BLOCK: before → 412 guardian_consent_required for a minor or a blank birth year with consent; after → 403
  // health_data_adults_only for both (unknown age is not an adult), nothing stored.
  it('a minor (or a blank birth year) with consent → 403 health_data_adults_only, nothing stored', async () => {
    for (const dobYear of [2012, null]) {
      h.users['client-1'] = { dobYear };
      const r = await post({ date: TODAY, sleep: 3 });
      expect(r).toEqual({ status: 403, json: { error: 'health_data_adults_only', saved: false } });
    }
    expect(h.rows).toEqual([]);
    expect(h.writes).toEqual([]);
  });

  // TEEN-WRITE-BLOCK: before → "a minor with an accepted guardian consent can check in" (200, one row). After → the
  // parent's yes no longer unlocks a health write: 403, nothing stored. Flipped, not deleted.
  it('a minor with an accepted guardian consent can NOT check in any more — 403, nothing stored', async () => {
    h.users['client-1'] = { dobYear: 2012 };
    h.guardian = [{ menteeId: 'client-1', requestedAt: new Date('2026-09-10'), acceptedAt: new Date('2026-09-11'), revokedAt: null }];
    expect(await post({ date: TODAY, sleep: 3 })).toEqual({ status: 403, json: { error: 'health_data_adults_only', saved: false } });
    expect(h.rows).toHaveLength(0);
    expect(h.writes).toEqual([]);
  });

  it('GET with no consent reads "nothing stored, usual warm-up" — even when an older row exists (no processing after withdrawal)', async () => {
    h.rows = [{ id: 'old', userId: 'client-1', date: TODAY, sleep: 1, soreness: 5, energy: 1, mood: 1, createdAt: new Date(), updatedAt: new Date() }];
    h.healthConsents = [{ ...GRANT, revokedAt: new Date('2026-09-20') }];
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.json.checkIn).toBeNull();
    expect(r.json.read.level).toBe('skip');
    expect(r.json.healthDataConsent).toBe(false);
  });
});

describe('one per day, editable that day', () => {
  it('saves today’s check-in and hands back its read', async () => {
    const r = await post({ date: TODAY, sleep: 2, soreness: 4, energy: 3, mood: 3 });
    expect(r.status).toBe(200);
    expect(r.json.checkIn).toMatchObject({ date: TODAY, sleep: 2, soreness: 4, energy: 3, mood: 3 });
    expect(r.json.read).toMatchObject({
      level: 'low', extraWarmupMinutes: READINESS_EXTRA_WARMUP_MINUTES.low, suggestion: READINESS_SUGGESTION.low,
    });
    // MIRROR-COACH P6 FIX: the read carries no minutes figure (it was wrong wherever FEL's warm-up is not the one run)
    expect(r.json.read).not.toHaveProperty('warmupMinutes');
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0]).toMatchObject({ userId: 'client-1', date: TODAY });
  });

  it('a second answer the same day EDITS the one row (never a second row); createdAt stays, updatedAt moves', async () => {
    await post({ date: TODAY, sleep: 2, soreness: 4, energy: 2, mood: 3 });
    const created = h.rows[0].createdAt;
    const r = await post({ date: TODAY, sleep: 4, soreness: 2, energy: 4, mood: 4 });
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0]).toMatchObject({ sleep: 4, soreness: 2, energy: 4, mood: 4, createdAt: created });
    expect(h.rows[0].updatedAt.getTime()).toBeGreaterThan(created.getTime());
    expect(r.json.read.level).toBe('ok');
  });

  it('an edit that leaves an item blank clears THAT item (the day holds what was last sent, not a merge)', async () => {
    await post({ date: TODAY, sleep: 2, soreness: 4, energy: 2, mood: 3 });
    await post({ date: TODAY, energy: 4 });
    expect(h.rows[0]).toMatchObject({ sleep: null, soreness: null, energy: 4, mood: null });
  });

  it('GET reads today’s row back', async () => {
    await post({ date: TODAY, mood: 1 });
    const r = await get();
    expect(r.json).toMatchObject({ date: TODAY, checkIn: { mood: 1 }, read: { level: 'low' }, healthDataConsent: true, guardianOk: true });
  });

  it('another athlete’s row for the same day is never read or edited', async () => {
    h.rows = [{ id: 'x', userId: 'someone-else', date: TODAY, sleep: 5, soreness: 1, energy: 5, mood: 5, createdAt: new Date(), updatedAt: new Date() }];
    expect((await get()).json.checkIn).toBeNull();
    await post({ date: TODAY, sleep: 1 });
    expect(h.rows.find((r) => r.userId === 'someone-else')).toMatchObject({ sleep: 5 });
    expect(h.rows).toHaveLength(2);
  });
});

describe('skip', () => {
  it('a fresh skip (all four blank) stores nothing and needs no consent', async () => {
    h.healthConsents = [];
    const r = await post({ date: TODAY });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ checkIn: null, read: { level: 'skip', extraWarmupMinutes: 0 } });
    expect(h.rows).toEqual([]);
    expect(h.writes).not.toContain('upsert');
  });

  it('clearing a saved day removes that day’s row — only that one', async () => {
    await post({ date: TODAY, sleep: 2 });
    h.rows.push({ id: 'other-day', userId: 'client-1', date: '2026-01-01', sleep: 3, soreness: null, energy: null, mood: null, createdAt: new Date(), updatedAt: new Date() });
    await post({ date: TODAY, sleep: null, soreness: null, energy: null, mood: null });
    expect(h.rows.map((r) => r.id)).toEqual(['other-day']);
  });
});

describe('never scored — what the response carries', () => {
  it('no score, PRQ, XP, shards, credits, streak or reward field ever comes back', async () => {
    const r = await post({ date: TODAY, sleep: 1, soreness: 5, energy: 1, mood: 1, score: 100, prq: 90, shards: 50 });
    const keys = JSON.stringify(r.json).toLowerCase();
    for (const bad of ['score', 'prq', 'xp', 'shard', 'credit', 'streak', 'reward', 'payout', 'wallet']) expect(keys, bad).not.toContain(`"${bad}`);
    // and the extra fields sent along were dropped, not stored
    expect(Object.keys(h.rows[0]).sort()).toEqual(['createdAt', 'date', 'energy', 'id', 'mood', 'sleep', 'soreness', 'updatedAt', 'userId']);
  });
});
