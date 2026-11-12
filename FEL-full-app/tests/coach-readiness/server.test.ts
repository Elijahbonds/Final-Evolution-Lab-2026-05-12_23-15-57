// COACH-READINESS: the server half over an in-memory database (tests/helpers/fakeReadinessDb.ts) — the gates (adults
// only, the movement-save opt-in, the coach_view grant), the alert firing once per day, the coach's rule per athlete and
// per team, Today's ease, and the weekly draft seeing the signal. The routes run for real (next-auth and the database mocked).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { fakeReadinessDb, seedAthlete, seedCheck, type FakeReadinessDb } from '@/tests/helpers/fakeReadinessDb';

const h = vi.hoisted(() => ({ db: null as unknown as FakeReadinessDb, user: null as string | null }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : (h.db as unknown as Record<string | symbol, unknown>)[p]) }) }));
vi.mock('@/lib/camp/server', () => ({ currentUserId: async () => h.user, bad: (error: string, status = 400) => Response.json({ error }, { status }) }));

import { GET as athleteGET, POST as athletePOST, DELETE as athleteDELETE } from '@/app/api/readiness/check/route';
import { GET as coachGET, PUT as coachPUT, PATCH as coachPATCH } from '@/app/api/coach/readiness/route';
import { resetReadinessProbe } from '@/lib/coach/readiness/store';
import { resetGroupsProbe } from '@/lib/groups/store';
import { draftFacts, todayReadiness, type ReadinessDb } from '@/lib/coach/readiness/server';
import { draftForClient } from '@/lib/coach/weeklyDraft/rules';
import { adult } from '@/tests/helpers/weeklyDraftFixtures';

const NOW = '2026-10-25T15:00:00Z';
const TODAY = '2026-10-25';
const body = (o: Record<string, unknown> = {}) => ({ day: TODAY, bestCm: 40, meanCm: 39, teCm: 1.4, jumps: 3, poseHz: 60, feel: null, ...o });
const req = (url: string, method: string, json?: unknown) => new NextRequest(`http://fel.test${url}`, { method, ...(json === undefined ? {} : { body: JSON.stringify(json), headers: { 'content-type': 'application/json' } }) });
async function call(fn: (r: NextRequest) => Promise<Response>, url: string, method: string, json?: unknown) {
  const r = await fn(req(url, method, json));
  return { status: r.status, json: await r.json() as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const post = (json: unknown) => call(athletePOST, '/api/readiness/check', 'POST', json);
const weekOfNormal = (id: string) => { for (let d = 1; d <= 6; d++) seedCheck(h.db, id, d, 40 + ((d % 3) - 1) * 0.4, { meanCm: 39 + ((d % 3) - 1) * 0.3 }); };

beforeEach(() => {
  vi.useFakeTimers({ now: Date.parse(NOW), toFake: ['Date'] });
  h.db = fakeReadinessDb({ now: NOW });
  h.user = 'ath';
  resetReadinessProbe();
  resetGroupsProbe();
});

describe('who may check, and whose numbers are kept', () => {
  it('a teen (and a blank birth year) gets no check at all: adults only (owner call), and nothing is written', async () => {
    seedAthlete(h.db, 'ath', { coaches: ['c1'], dobYear: new Date().getFullYear() - 15 });
    expect((await call(athleteGET, `/api/readiness/check?day=${TODAY}`, 'GET')).json).toEqual({ ok: false, error: 'adults_only' });
    const r = await post(body());
    expect(r).toMatchObject({ status: 403, json: { error: 'scan_save_adults_only', saved: false } });
    h.db.users[0].dobYear = null;
    expect((await call(athleteGET, `/api/readiness/check?day=${TODAY}`, 'GET')).json.error).toBe('adults_only');
    expect(h.db.checks).toEqual([]);
  });

  it('an adult who has not opted in: the check runs, kept on the phone; the server refuses the save', async () => {
    seedAthlete(h.db, 'ath', { optIn: false });
    expect((await call(athleteGET, `/api/readiness/check?day=${TODAY}`, 'GET')).json).toMatchObject({ ok: true, canSave: false, kept: 'device', history: null });
    expect((await post(body())).status).toBe(403);
    expect(h.db.checks).toEqual([]);
  });

  it('before the pending SQL: the context says device, the save answers 503, nothing 500s', async () => {
    h.db.tables = false;
    seedAthlete(h.db, 'ath');
    expect((await call(athleteGET, `/api/readiness/check?day=${TODAY}`, 'GET')).json).toMatchObject({ ok: true, canSave: true, ready: false, kept: 'device' });
    expect(await post(body())).toMatchObject({ status: 503, json: { error: 'readiness_not_ready' } });
    expect((await call(coachGET, '/api/coach/readiness', 'GET')).json).toEqual({ available: false });
  });

  it('refuses numbers that are not a day\'s check (another day, impossible heights, one jump)', async () => {
    seedAthlete(h.db, 'ath');
    expect((await post(body({ day: '2026-09-01' }))).json.error).toBe('not_today');
    expect((await post(body({ bestCm: 200 }))).json.error).toBe('bad_height');
    expect((await post(body({ meanCm: 45 }))).json.error).toBe('bad_height');
    expect((await post(body({ jumps: 1 }))).json.error).toBe('bad_jumps');
    expect((await post(body({ feel: 7 }))).json.error).toBe('bad_feel');
  });
});

describe('a Low day under the coach\'s rule', () => {
  it('fires the coach\'s alert ONCE per day; the day\'s first check stands', async () => {
    seedAthlete(h.db, 'ath', { coaches: ['c1'] });
    weekOfNormal('ath');
    const first = await post(body({ bestCm: 36, meanCm: 35 }));   // 10 % down
    expect(first.status).toBe(200);
    expect(first.json).toMatchObject({ saved: true, first: true, view: { band: 'low', reason: 'low_drop', coachTold: true } });
    expect(first.json.view.next).toMatch(/eased.*has been told/);
    const again = await post(body({ bestCm: 30, meanCm: 29 }));
    expect(again.json).toMatchObject({ saved: true, first: false, view: { band: 'low', bestCm: 36 } });
    expect(h.db.alerts).toHaveLength(1);
    expect(h.db.alerts[0]).toMatchObject({ coachId: 'c1', athleteId: 'ath', day: TODAY, action: 'ease', reason: 'low_drop' });
    // the board, opened twice, still one alert
    h.user = 'c1';
    const b1 = await call(coachGET, '/api/coach/readiness', 'GET');
    const b2 = await call(coachGET, '/api/coach/readiness', 'GET');
    expect(b1.json.alerts).toHaveLength(1);
    expect(b2.json.alerts).toHaveLength(1);
    expect(b1.json.alerts[0].line).toMatch(/jump check read Low: down 10%.*eased automatically/);
    // dismissed
    expect((await call(coachPATCH, '/api/coach/readiness', 'PATCH', { id: h.db.alerts[0].id })).status).toBe(200);
    expect((await call(coachPATCH, '/api/coach/readiness', 'PATCH', { id: h.db.alerts[0].id })).status).toBe(404);
  });

  it('no coach_view grant: the coach is not told and sees nothing about them; the athlete reads why', async () => {
    seedAthlete(h.db, 'ath', { coaches: ['c1'], share: false });
    weekOfNormal('ath');
    const r = await post(body({ bestCm: 36, meanCm: 35 }));
    expect(r.json.view).toMatchObject({ band: 'low', coachTold: false });
    expect(r.json.view.next).toMatch(/not told: you have not shared readiness/);
    expect(h.db.alerts).toEqual([]);
    h.user = 'c1';
    const b = await call(coachGET, '/api/coach/readiness', 'GET');
    expect(b.json.alerts).toEqual([]);
    expect(b.json.latest).toEqual([]);
    expect(b.json.athletes[0]).toMatchObject({ id: 'ath', shares: false });
  });

  it('a normal day fires nothing; noise never alerts', async () => {
    seedAthlete(h.db, 'ath', { coaches: ['c1'] });
    weekOfNormal('ath');
    const r = await post(body({ bestCm: 39.4, meanCm: 38.5 }));
    expect(r.json.view.band).toBe('normal');
    expect(h.db.alerts).toEqual([]);
  });

  it('the coach\'s own rule: "tell me only" alerts with action tell and leaves Today as written', async () => {
    seedAthlete(h.db, 'ath', { coaches: ['c1'] });
    weekOfNormal('ath');
    h.user = 'c1';
    expect((await call(coachPUT, '/api/coach/readiness', 'PUT', { scope: 'athlete', scopeId: 'ath', kind: 'drop_pct', dropPct: 8, action: 'tell' })).status).toBe(200);
    h.user = 'ath';
    const r = await post(body({ bestCm: 36, meanCm: 35 }));
    expect(r.json.view).toMatchObject({ band: 'low', ease: false });
    expect(h.db.alerts[0].action).toBe('tell');
    const t = await todayReadiness(h.db as unknown as ReadinessDb, 'ath', 'c1', new Date(NOW));
    expect(t).toMatchObject({ band: 'low', ease: false, coachTold: true });
  });

  it('a stricter coach rule (12 %) reads the same 10 % day as a real dip, not Low', async () => {
    seedAthlete(h.db, 'ath', { coaches: ['c1'] });
    weekOfNormal('ath');
    h.db.rules.push({ id: 'r1', coachId: 'c1', scope: 'athlete', scopeId: 'ath', kind: 'drop_pct', dropPct: 12, action: 'ease', updatedAt: new Date() });
    const r = await post(body({ bestCm: 36, meanCm: 35 }));
    expect(r.json.view).toMatchObject({ band: 'normal', reason: 'dip_small' });
    expect(h.db.alerts).toEqual([]);
  });

  it('a solo athlete (no coach): the band and a gentle suggestion, nothing forced', async () => {
    seedAthlete(h.db, 'ath');
    weekOfNormal('ath');
    const r = await post(body({ bestCm: 36, meanCm: 35 }));
    expect(r.json.view).toMatchObject({ band: 'low', solo: true });
    expect(r.json.view.next).toMatch(/A good day to take it easier/);
    expect(h.db.alerts).toEqual([]);
  });

  it('the athlete deletes their history: checks and alerts go', async () => {
    seedAthlete(h.db, 'ath', { coaches: ['c1'] });
    weekOfNormal('ath');
    await post(body({ bestCm: 36, meanCm: 35 }));
    expect((await call(athleteDELETE as unknown as (r: NextRequest) => Promise<Response>, '/api/readiness/check', 'DELETE')).json).toEqual({ deleted: true });
    expect(h.db.checks).toEqual([]);
    expect(h.db.alerts).toEqual([]);
  });
});

describe('the coach\'s rules', () => {
  it('per athlete only for the live roster; per team only for a team the coach runs (not a squad, not someone else\'s)', async () => {
    seedAthlete(h.db, 'ath', { coaches: ['c1'] });
    seedAthlete(h.db, 'other');
    h.db.groups.push(
      { id: 'team1', kind: 'team', ownerId: 'c1', name: 'Varsity', members: [{ userId: 'c1', role: 'owner' }, { userId: 'ath', role: 'member' }] },
      { id: 'squad1', kind: 'squad', ownerId: 'c1', name: 'Swift Owls', members: [{ userId: 'c1', role: 'owner' }] },
      { id: 'team2', kind: 'team', ownerId: 'c9', name: 'Theirs', members: [{ userId: 'c9', role: 'owner' }] },
    );
    h.user = 'c1';
    const put = (j: unknown) => call(coachPUT, '/api/coach/readiness', 'PUT', j);
    expect((await put({ scope: 'athlete', scopeId: 'other', kind: 'drop_pct', dropPct: 6, action: 'ease' })).json.error).toBe('not_your_athlete');
    expect((await put({ scope: 'team', scopeId: 'squad1', kind: 'drop_pct', dropPct: 6, action: 'ease' })).json.error).toBe('not_your_team');
    expect((await put({ scope: 'team', scopeId: 'team2', kind: 'drop_pct', dropPct: 6, action: 'ease' })).json.error).toBe('not_your_team');
    expect((await put({ scope: 'team', scopeId: 'team1', kind: 'drop_pct', dropPct: 1, action: 'ease' })).json.error).toBe('bad_drop_pct');
    expect((await put({ scope: 'team', scopeId: 'team1', kind: 'low_twice', dropPct: 6, action: 'ease' })).status).toBe(200);
    const b = await call(coachGET, '/api/coach/readiness', 'GET');
    expect(b.json.teams).toEqual([{ id: 'team1', name: 'Varsity', rule: { kind: 'low_twice', dropPct: 6, action: 'ease' } }]);
    expect(b.json.defaultRule).toMatchObject({ kind: 'drop_pct', dropPct: 5, action: 'ease' });
    // the team's rule applies to its member: one Low-looking day alone is not "twice in a row"
    h.user = 'ath';
    weekOfNormal('ath');
    expect((await post(body({ bestCm: 36, meanCm: 35 }))).json.view).toMatchObject({ band: 'normal', reason: 'dip_small' });
    // the athlete's own rule beats the team's; clearing it goes back to the team's
    h.user = 'c1';
    expect((await put({ scope: 'athlete', scopeId: 'ath', kind: 'drop_pct', dropPct: 5, action: 'tell' })).status).toBe(200);
    expect((await call(athleteGET, `/api/readiness/check?day=${TODAY}`, 'GET')).json).toBeDefined();
    expect((await put({ scope: 'athlete', scopeId: 'ath', clear: true })).json).toEqual({ ok: true, rule: null });
  });
});

describe('Today and the weekly draft see the signal', () => {
  it('todayReadiness: today\'s saved Low check under the coach\'s current rule; none today = null', async () => {
    seedAthlete(h.db, 'ath', { coaches: ['c1'] });
    expect(await todayReadiness(h.db as unknown as ReadinessDb, 'ath', 'c1', new Date(NOW))).toBeNull();
    weekOfNormal('ath');
    await post(body({ bestCm: 36, meanCm: 35 }));
    expect(await todayReadiness(h.db as unknown as ReadinessDb, 'ath', 'c1', new Date(NOW))).toMatchObject({ band: 'low', ease: true, coachTold: true, shared: true, day: TODAY });
    expect(await todayReadiness(h.db as unknown as ReadinessDb, 'ath', 'not-my-coach', new Date(NOW))).toBeNull();
    // 20 hours later it is not today's any more
    expect(await todayReadiness(h.db as unknown as ReadinessDb, 'ath', 'c1', new Date(Date.parse(NOW) + 20 * 3_600_000))).toBeNull();
  });

  it('draftFacts → the weekly draft: two Low checks in a week drafts a lighter week, said with the check\'s words', async () => {
    seedAthlete(h.db, 'ath', { coaches: ['c1'] });
    seedCheck(h.db, 'ath', 1, 36, { band: 'low' });
    seedCheck(h.db, 'ath', 3, 35.5, { band: 'low' });
    seedCheck(h.db, 'ath', 4, 40, { band: 'normal' });
    seedCheck(h.db, 'ath', 12, 34, { band: 'low' });   // outside the week
    const f = await draftFacts(h.db, ['ath'], Date.parse(NOW));
    expect(f.get('ath')).toEqual({ lowDays: 2, days: 3 });
    const draft = draftForClient(adult({ jumpReadiness: f.get('ath') }));
    const deload = draft.changes.find((c) => c.kind === 'deload');
    expect(deload?.reason).toContain('Their daily jump check read Low on 2 of their last 3 checks.');
    expect(deload?.sensitive).toBe(true);
    expect(draft.context).toContain('Daily jump check: Low on 2 of their last 3 checks.');
    // one Low check is not a pattern
    expect(draftForClient(adult({ jumpReadiness: { lowDays: 1, days: 3 } })).changes.some((c) => c.kind === 'deload')).toBe(false);
  });
});
