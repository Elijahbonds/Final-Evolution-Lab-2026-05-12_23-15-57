// SAFETY lane (SAF-01, 2026-10-25): a guardian's WITHDRAW closes what their yes unlocked — measured through the real
// routes, one per gate that reads the consent: a roster join (lib/coach/teenGate.ts), a set log (the same gate, on a
// write), a squad join (lib/groups/gates.ts) and the combine (lib/combine/gate.ts). Each runs 403 → 200 → 403 (the
// combine: held → testable → held): no consent, then an accepted one, then the guardian's withdraw link through
// POST /api/consent/withdraw, then the same request again. Only the session and the database are stand-ins; the
// GuardianConsent rows live in ONE table both the gate and the withdraw route read (tests/helpers/consentTable.ts).
//
// The go-live dates are null today (every teen fails closed); these tests stand in the world after the owner sets them
// (tests/helpers/coachConsent.ts for coach training; the squads date injected the same way).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consentTable, acceptedConsent, type ConsentRow } from '@/tests/helpers/consentTable';

const h = vi.hoisted(() => ({
  user: null as string | null,
  db: null as any,
  consents: null as any,
}));
const cc = vi.hoisted(() => ({ since: new Date('2026-01-01') as Date | null, squads: new Date('2026-01-01') as Date | null }));

vi.mock('@/lib/coach/coachConsent', async (orig) => (await import('@/tests/helpers/coachConsent')).coachConsentAt(await orig(), () => cc.since));
vi.mock('@/lib/groups/gates', async (orig) => {
  const real = await orig<typeof import('@/lib/groups/gates')>();
  return { ...real, groupGate: (k: any, i: any, n?: Date) => real.groupGate(k, i, n, cc.squads) };
});
vi.mock('next-auth', () => ({ getServerSession: async () => (h.user ? { user: { id: h.user } } : null) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.user,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, { get: (_t, k) => (k === 'then' ? undefined : k === 'guardianConsent' ? h.consents.model : h.db[k]) }),
}));

import { NextRequest } from 'next/server';
import { POST as withdrawPOST } from '@/app/api/consent/withdraw/route';
import { POST as joinRosterPOST } from '@/app/api/coach/invite/[token]/route';
import { POST as logPOST } from '@/app/api/coach/me/log/route';
import { POST as groupsCreate } from '@/app/api/groups/route';
import { POST as groupsJoin } from '@/app/api/groups/join/route';
import { GET as combineGET } from '@/app/api/coach/combine/route';
import { withdrawToken } from '@/lib/consent/withdraw';
import { newSpyDb, seedUser, spyPrisma, THIS_YEAR } from '@/tests/helpers/writeSpyDb';
import { catalogueRow, newTodayStore, seedProgram, todayMemoryDb } from '@/lib/coach/todayMemoryDb';
import { fakeGroupsDb, YEARS } from '@/tests/helpers/fakeGroupsDb';
import { fakeCombineDb } from '@/tests/helpers/fakeCombineDb';
import { resetGroupsProbe } from '@/lib/groups/store';
import { resetRateLimitMemory } from '@/lib/rate-limit';

const SECRET = 'test-secret-withdraw';

beforeEach(() => {
  vi.stubEnv('NEXTAUTH_SECRET', SECRET);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  resetRateLimitMemory();
  cc.since = new Date('2026-01-01');
  cc.squads = new Date('2026-01-01');
  h.consents = consentTable([]);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const grant = (menteeId: string, year: number, o: Partial<ConsentRow> = {}) => {
  const row = acceptedConsent(menteeId, year, o);
  h.consents.rows.push(row);
  return row;
};

async function withdraw(consentId: string) {
  const res = await withdrawPOST(new Request('http://fel.test/api/consent/withdraw', { method: 'POST', body: JSON.stringify({ token: withdrawToken(consentId, SECRET) }) }));
  return { status: res.status, json: await res.json() as Record<string, unknown> };
}

describe('POST /api/consent/withdraw', () => {
  beforeEach(() => { h.db = {}; });

  it('sets revokedAt on the consent (and this guardian\'s other open ones for the athlete), never deletes a row', async () => {
    const a = grant('teen', THIS_YEAR - 15);
    const older = grant('teen', THIS_YEAR - 15, { id: 'gc-old', requestedAt: new Date('2026-08-01') });
    const otherGuardian = grant('teen', THIS_YEAR - 15, { id: 'gc-other', guardianEmail: 'sam@example.test' });
    const otherAthlete = grant('sib', THIS_YEAR - 14);
    const r = await withdraw(a.id);
    expect(r).toEqual({ status: 200, json: { withdrawn: true } });
    expect(a.revokedAt).toBeInstanceOf(Date);
    expect(older.revokedAt).toBeInstanceOf(Date);
    expect(otherGuardian.revokedAt).toBeNull();
    expect(otherAthlete.revokedAt).toBeNull();
    expect(h.consents.rows).toHaveLength(4);
    expect(h.consents.calls).not.toContain('delete');
  });

  it('is single use: a second tap answers already and writes nothing', async () => {
    const a = grant('teen', THIS_YEAR - 15);
    await withdraw(a.id);
    const first = a.revokedAt;
    h.consents.calls.length = 0;
    const r = await withdraw(a.id);
    expect(r.json).toEqual({ withdrawn: true, already: true });
    expect(h.consents.calls).toEqual(['findUnique']);
    expect(a.revokedAt).toBe(first);
  });

  it('an edited, unsigned or foreign-key token is the same 404, and touches nothing', async () => {
    const a = grant('teen', THIS_YEAR - 15);
    const good = withdrawToken(a.id, SECRET)!;
    for (const token of [good.slice(0, -2) + 'xx', a.id, `${a.id}.`, withdrawToken(a.id, 'another-secret'), withdrawToken('gc-nobody', SECRET), 42]) {
      const res = await withdrawPOST(new Request('http://x', { method: 'POST', body: JSON.stringify({ token }) }));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not_found' });
    }
    expect(a.revokedAt).toBeNull();
  });

  it('with no secret configured there is no link and no withdraw (off, never weakly on)', async () => {
    const a = grant('teen', THIS_YEAR - 15);
    const token = withdrawToken(a.id, SECRET);
    vi.stubEnv('NEXTAUTH_SECRET', '');
    expect(withdrawToken(a.id)).toBeNull();
    const res = await withdrawPOST(new Request('http://x', { method: 'POST', body: JSON.stringify({ token }) }));
    expect(res.status).toBe(404);
  });
});

describe('ROSTERS: POST /api/coach/invite/[token] — 403, 200, withdraw, 403', () => {
  const TOKEN = 'tok-flyer';
  it('a teen joins a roster only while the guardian\'s yes stands', async () => {
    const spy = newSpyDb();
    h.db = spyPrisma(spy);
    const invite = (id: string, token: string, coachId: string) => ({ id, token, coachId, use: 'many', closedAt: null, expiresAt: new Date(Date.now() + 86_400_000), joined: 0, createdAt: new Date(), coach: { name: coachId } });
    (spy.tables.user ??= []).push({ id: 'coach-1', name: 'Coach One', email: 'coach@fel.test', dobYear: 1985 }, { id: 'coach-2', name: 'Coach Two', email: 'c2@fel.test', dobYear: 1980 });
    (spy.tables.coachInvite ??= []).push(invite('inv-1', TOKEN, 'coach-1'), invite('inv-2', 'tok-two', 'coach-2'));
    seedUser(spy, 'teen', THIS_YEAR - 15);
    const join = async (token: string) => { h.user = 'teen'; const r = await joinRosterPOST(new Request(`http://fel.test/api/coach/invite/${token}`, { method: 'POST' }), { params: { token } }); return { status: r.status, json: await r.json() }; };

    expect((await join(TOKEN)).status).toBe(403);
    const c = grant('teen', THIS_YEAR - 15);
    expect((await join(TOKEN)).status).toBe(200);
    expect((await withdraw(c.id)).status).toBe(200);
    // a NEW join after the withdraw (another coach's roster) is refused, and nothing is written for it
    const before = (spy.tables.coachClient ?? []).length;
    const after = await join('tok-two');
    expect(after.status).toBe(403);
    expect(after.json.error).toBe('guardian_consent_required');
    expect((spy.tables.coachClient ?? []).length).toBe(before);
  });

  it('TODAY (dates null) the same teen is refused before and after: the withdraw changes nothing that was open', async () => {
    cc.since = null;
    const spy = newSpyDb();
    h.db = spyPrisma(spy);
    (spy.tables.coachInvite ??= []).push({ id: 'inv-1', token: TOKEN, coachId: 'coach-1', use: 'many', closedAt: null, expiresAt: new Date(Date.now() + 86_400_000), joined: 0, createdAt: new Date(), coach: { name: 'Coach One' } });
    seedUser(spy, 'teen', THIS_YEAR - 15);
    grant('teen', THIS_YEAR - 15);
    h.user = 'teen';
    const r = await joinRosterPOST(new Request(`http://fel.test/api/coach/invite/${TOKEN}`, { method: 'POST' }), { params: { token: TOKEN } });
    expect(r.status).toBe(403);
  });
});

describe('SET LOGS: POST /api/coach/me/log — 403, 200, withdraw, 403', () => {
  it('a rostered teen saves sets only while the guardian\'s yes stands', async () => {
    const store = newTodayStore();
    h.db = todayMemoryDb(store);
    store.user.push({ id: 'coach-1', name: 'Coach One', email: 'c1@x.test', dobYear: 1985 });
    store.pe.push(catalogueRow({ id: 'pe-goblet', coachId: 'coach-1', name: 'Goblet Squat' }));
    store.user.push({ id: 'teen', name: 'teen', email: 'teen@x.test', dobYear: THIS_YEAR - 15 });
    const ids = seedProgram(store, { coachId: 'coach-1', clientId: 'teen', name: 'Base block', blockLabel: 'Week 1', sessions: [{ order: 1, label: 'Day 1', exercises: [{ exerciseId: 'pe-goblet' }] }] });
    const log = async () => {
      h.user = 'teen';
      const res = await logPOST(new NextRequest('http://fel.test/api/coach/me/log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ programId: ids.programId, sessionId: ids.sessionIds[0], logs: [{ sessionExerciseId: ids.exerciseIds[0][0], actualSets: 3, actualReps: '8' }] }) }));
      return { status: res.status, json: await res.json() as Record<string, unknown> };
    };

    expect((await log()).status).toBe(403);
    const c = grant('teen', THIS_YEAR - 15);
    expect((await log()).status).toBe(200);
    const saved = store.log.length;
    expect((await withdraw(c.id)).status).toBe(200);
    const after = await log();
    expect(after.status).toBe(403);
    expect(after.json.error).toBe('guardian_consent_required');
    expect(store.log.length).toBe(saved);   // nothing new written after the withdraw
  });
});

describe('SQUADS: POST /api/groups/join — 403, 200, withdraw, 403', () => {
  it('a teen joins a squad only while the guardian\'s yes stands', async () => {
    resetGroupsProbe();
    const f = fakeGroupsDb({ users: [{ id: 'ada', name: 'Ada', dobYear: YEARS.adult }, { id: 'tess', name: 'Tess', dobYear: YEARS.teen }] });
    h.db = f.db;
    h.user = 'ada';
    const made = await groupsCreate(new NextRequest('http://x/api/groups', { method: 'POST', body: JSON.stringify({ kind: 'squad', name: 'Swift Falcons', color: 'cyan' }) }));
    expect(made.status).toBe(201);
    const token = String(f.state.groups[0].inviteToken);
    const join = async () => { h.user = 'tess'; const r = await groupsJoin(new NextRequest('http://x/api/groups/join', { method: 'POST', body: JSON.stringify({ token }) })); return { status: r.status, json: await r.json() }; };

    expect((await join()).status).toBe(403);
    const c = grant('tess', YEARS.teen);
    const ok = await join();
    expect(ok.status).toBe(200);
    expect(ok.json.result).toBe('joined');
    // leave, so the next join is a new one the gate rules on
    f.state.members = f.state.members.filter((m) => m.userId !== 'tess');
    expect((await withdraw(c.id)).status).toBe(200);
    const after = await join();
    expect(after.status).toBe(403);
    expect(after.json.error).toBe('guardian_consent_required');
  });
});

describe('COMBINE: GET /api/coach/combine — held, testable, withdraw, held', () => {
  it('a rostered teen is testable at the combine only while the guardian\'s yes stands', async () => {
    const f = fakeCombineDb({ tables: true });
    h.db = f;
    f.users.push({ id: 'coach-1', name: 'Coach', dobYear: 1985 } as any, { id: 'teen', name: 'Teen Athlete', dobYear: THIS_YEAR - 15 } as any);
    f.links.push({ coachId: 'coach-1', clientId: 'teen', endedAt: null } as any);
    const access = async () => {
      h.user = 'coach-1';
      const body = await (await combineGET()).json();
      return body.athletes.find((a: { id: string }) => a.id === 'teen')?.access;
    };

    expect((await access())).toMatchObject({ testable: false, held: 'guardian_consent_required' });
    const c = grant('teen', THIS_YEAR - 15);
    expect((await access())).toMatchObject({ testable: true, held: null });
    expect((await withdraw(c.id)).status).toBe(200);
    expect((await access())).toMatchObject({ testable: false, held: 'guardian_consent_required' });
  });
});

describe('the old camp-plan consent still fails after go-live (owner 2026-10-23, "ask guardians again")', () => {
  it('a consent requested before the go-live day opens no gate', async () => {
    cc.since = new Date(Date.now() + 86_400_000);
    cc.squads = new Date(Date.now() + 86_400_000);
    const f = fakeCombineDb({ tables: true });
    h.db = f;
    f.users.push({ id: 'coach-1', name: 'Coach', dobYear: 1985 } as any, { id: 'teen', name: 'Teen Athlete', dobYear: THIS_YEAR - 15 } as any);
    f.links.push({ coachId: 'coach-1', clientId: 'teen', endedAt: null } as any);
    grant('teen', THIS_YEAR - 15);
    h.user = 'coach-1';
    const body = await (await combineGET()).json();
    expect(body.athletes.find((a: { id: string }) => a.id === 'teen').access).toMatchObject({ testable: false });
  });
});
