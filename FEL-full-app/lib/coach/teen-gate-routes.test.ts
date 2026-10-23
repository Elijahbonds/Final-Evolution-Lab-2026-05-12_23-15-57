// THE TEEN GATE, run through the real routes (coach-loop P1, 2026-10-20).
//
// The platform roadmap (§1.2, "Finding: teens on a roster") read the code and flagged, as an assumption, that a 13–17
// account could join a coach's roster and save training logs with no guardian consent. This file is the measurement:
// written first and run against the unmodified routes, where the join and the log both answered 200 for a
// 15-year-old with no consent on file (the gap was real), and kept as the guard that it stays closed.
//
// The owner's rule (ATHLETES, 2026-10-20): teens save TRAINING data with guardian consent. Under-13s never (Terms §2:
// no account under 13). A blank birth year reads as a minor (decision #20), so it is asked for before anything is
// written. Only the session and the database are stand-ins.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  user: null as string | null,
  spy: null as any,
  store: null as unknown as import('./todayMemoryDb').TodayStore,
  useStore: 'spy' as 'spy' | 'today',
}));

// COACH-LOOP P1 (owner 2026-10-23): a teen's consent counts only if it was asked under the coach-training wording, which
// is not live yet (lib/coach/coachConsent.ts, null = every teen fails closed). This suite stands after go-live.
const cc = vi.hoisted(() => ({ since: new Date('2026-01-01') as Date | null }));
vi.mock('@/lib/coach/coachConsent', async (orig) => (await import('@/tests/helpers/coachConsent')).coachConsentAt(await orig(), () => cc.since));
vi.mock('next-auth', () => ({ getServerSession: async () => (h.user ? { user: { id: h.user } } : null) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.user,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', async () => {
  const { todayMemoryDb } = await import('./todayMemoryDb');
  const { spyPrisma } = await import('@/tests/helpers/writeSpyDb');
  return {
    prisma: new Proxy({}, {
      get: (_t, k) => (h.useStore === 'today'
        ? (todayMemoryDb(h.store) as Record<string | symbol, unknown>)[k]
        : spyPrisma(h.spy)[k]),
    }),
  };
});

import { NextRequest } from 'next/server';
import { POST as joinPOST } from '@/app/api/coach/invite/[token]/route';
import { POST as logPOST } from '@/app/api/coach/me/log/route';
import { POST as cooldownPOST } from '@/app/api/coach/me/cooldown/route';
import { newSpyDb, seedAcceptedGuardian, seedUser, writesOf, THIS_YEAR } from '@/tests/helpers/writeSpyDb';
import { catalogueRow, newTodayStore, seedProgram } from './todayMemoryDb';

const TOKEN = 'tok-flyer';

function seedInvite() {
  (h.spy.tables.user ??= []).push({ id: 'coach-1', name: 'Coach One', email: 'coach@fel.test', dobYear: 1985 });
  (h.spy.tables.coachInvite ??= []).push({
    id: 'inv-1', token: TOKEN, coachId: 'coach-1', use: 'many', closedAt: null,
    expiresAt: new Date(Date.now() + 86_400_000), joined: 0, createdAt: new Date(), coach: { name: 'Coach One' },
  });
}

async function join(as: string) {
  h.user = as;
  const res = await joinPOST(new Request(`http://fel.test/api/coach/invite/${TOKEN}`, { method: 'POST' }), { params: { token: TOKEN } });
  return { status: res.status, json: await res.json() as Record<string, unknown> };
}

describe('joining a roster (POST /api/coach/invite/[token])', () => {
  beforeEach(() => { h.useStore = 'spy'; h.spy = newSpyDb(); seedInvite(); cc.since = new Date('2026-01-01'); });

  it('TODAY (owner 2026-10-23): the coach-training wording is not live, so an accepted old consent does not let a teen join', async () => {
    cc.since = null;
    seedUser(h.spy, 'teen', THIS_YEAR - 15);
    seedAcceptedGuardian(h.spy, 'teen', THIS_YEAR - 15);
    const r = await join('teen');
    expect(r.status).toBe(403);
    expect(r.json).toMatchObject({ error: 'guardian_consent_required', href: null });
    expect(writesOf(h.spy)).toEqual([]);
  });

  it('after go-live, a consent requested before that day (the camp-plan wording) does not count', async () => {
    seedUser(h.spy, 'teen', THIS_YEAR - 15);
    seedAcceptedGuardian(h.spy, 'teen', THIS_YEAR - 15);
    cc.since = new Date(Date.now() + 86_400_000);
    expect((await join('teen')).json.error).toBe('guardian_consent_required');
  });

  it('a 15-year-old with no guardian consent is refused, and nothing is written', async () => {
    seedUser(h.spy, 'teen', THIS_YEAR - 15);
    const r = await join('teen');
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('guardian_consent_required');
    expect(writesOf(h.spy)).toEqual([]);
  });

  it('the same 15-year-old joins once a guardian has accepted (403 then 200)', async () => {
    seedUser(h.spy, 'teen', THIS_YEAR - 15);
    expect((await join('teen')).status).toBe(403);
    seedAcceptedGuardian(h.spy, 'teen', THIS_YEAR - 15);
    const r = await join('teen');
    expect(r.status).toBe(200);
    expect(r.json.result).toBe('joined');
    expect(writesOf(h.spy)).toContain('coachClient.create');
  });

  it('a revoked consent does not count', async () => {
    seedUser(h.spy, 'teen', THIS_YEAR - 16);
    seedAcceptedGuardian(h.spy, 'teen', THIS_YEAR - 16);
    h.spy.tables.guardianConsent[0].revokedAt = new Date();
    expect((await join('teen')).json.error).toBe('guardian_consent_required');
  });

  it('an under-13 is refused even with an accepted consent', async () => {
    seedUser(h.spy, 'kid', THIS_YEAR - 12);
    seedAcceptedGuardian(h.spy, 'kid', THIS_YEAR - 12);
    const r = await join('kid');
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('under_13');
    expect(writesOf(h.spy)).toEqual([]);
  });

  it('a blank birth year is asked for first (blank reads as a minor, decision #20)', async () => {
    seedUser(h.spy, 'blank', null);
    const r = await join('blank');
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('age_required');
    expect(writesOf(h.spy)).toEqual([]);
  });

  it('an adult joins as before', async () => {
    seedUser(h.spy, 'adult', 1990);
    const r = await join('adult');
    expect(r.status).toBe(200);
    expect(r.json.result).toBe('joined');
  });

  it('the refusal never names the guardian, the email or the birth year', async () => {
    seedUser(h.spy, 'teen', THIS_YEAR - 15);
    const body = JSON.stringify((await join('teen')).json);
    expect(body).not.toMatch(/@|A Parent|\d{4}/);
  });
});

describe('saving training (POST /api/coach/me/log, POST /api/coach/me/cooldown)', () => {
  let PID = '', S1 = '', SE = '';
  beforeEach(() => {
    cc.since = new Date('2026-01-01');
    h.useStore = 'today';
    h.store = newTodayStore();
    h.store.user.push({ id: 'coach-1', name: 'Coach One', email: 'c1@x.test', dobYear: 1985 });
    h.store.pe.push(catalogueRow({ id: 'pe-goblet', coachId: 'coach-1', name: 'Goblet Squat' }));
  });
  const seedFor = (clientId: string, dobYear: number | null) => {
    h.store.user.push({ id: clientId, name: clientId, email: `${clientId}@x.test`, dobYear });
    const ids = seedProgram(h.store, { coachId: 'coach-1', clientId, name: 'Base block', blockLabel: 'Week 1', sessions: [{ order: 1, label: 'Day 1', exercises: [{ exerciseId: 'pe-goblet' }] }] });
    PID = ids.programId; [S1] = ids.sessionIds; SE = ids.exerciseIds[0][0];
  };
  const accept = (menteeId: string, menteeBirthYear: number) => {
    (h.store.guardianConsent ??= []).push({ id: `gc-${menteeId}`, menteeId, menteeBirthYear, requestedAt: new Date('2026-09-01'), acceptedAt: new Date('2026-09-02'), revokedAt: null });
  };
  const log = async (as: string) => {
    h.user = as;
    const res = await logPOST(new NextRequest('http://fel.test/api/coach/me/log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ programId: PID, sessionId: S1, logs: [{ sessionExerciseId: SE, actualSets: 3, actualReps: '8' }] }) }));
    return { status: res.status, json: await res.json() as Record<string, unknown> };
  };
  const cooldown = async (as: string) => {
    h.user = as;
    const res = await cooldownPOST(new NextRequest('http://fel.test/api/coach/me/cooldown', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ programId: PID, sessionId: S1 }) }));
    return { status: res.status, json: await res.json() as Record<string, unknown> };
  };

  it('a 15-year-old with no consent cannot save a set log; nothing is written', async () => {
    seedFor('teen', THIS_YEAR - 15);
    const r = await log('teen');
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('guardian_consent_required');
    expect(h.store.log).toEqual([]);
    expect(h.store.cs).toEqual([]);
  });

  it('with an accepted consent the same log saves (403 then 200)', async () => {
    seedFor('teen', THIS_YEAR - 15);
    expect((await log('teen')).status).toBe(403);
    accept('teen', THIS_YEAR - 15);
    expect((await log('teen')).status).toBe(200);
    expect(h.store.log.length).toBe(1);
  });

  it('TODAY (owner 2026-10-23): with the coach-training wording not live, an accepted old consent saves nothing', async () => {
    cc.since = null;
    seedFor('teen', THIS_YEAR - 15);
    accept('teen', THIS_YEAR - 15);
    const r = await log('teen');
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('guardian_consent_required');
    expect(h.store.log).toEqual([]);
  });

  it('an under-13 never saves, consent or not', async () => {
    seedFor('kid', THIS_YEAR - 11);
    accept('kid', THIS_YEAR - 11);
    const r = await log('kid');
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('under_13');
    expect(h.store.log).toEqual([]);
  });

  it('a blank birth year is asked for first', async () => {
    seedFor('blank', null);
    expect((await log('blank')).json.error).toBe('age_required');
  });

  it('a blank account year with an accepted consent reads the consent\'s birth year', async () => {
    seedFor('blank', null);
    accept('blank', THIS_YEAR - 15);
    expect((await log('blank')).status).toBe(200);
  });

  it('the cool-down tap is training data too', async () => {
    seedFor('teen', THIS_YEAR - 14);
    const r = await cooldown('teen');
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('guardian_consent_required');
    expect(h.store.cs).toEqual([]);
  });

  it('an adult saves as before', async () => {
    seedFor('adult', 1990);
    expect((await log('adult')).status).toBe(200);
  });
});
