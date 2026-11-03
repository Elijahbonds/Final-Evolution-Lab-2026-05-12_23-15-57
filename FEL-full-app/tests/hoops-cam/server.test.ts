// BBS-04: the routes for real (next-auth and the database mocked) over an in-memory database (tests/helpers/fakeHoopsDb.ts)
// — the movement-save gate on POST (a teen and an adult who has not opted in are refused, nothing written), the pending-SQL
// fallback (dark: nothing 500s before the table exists), numbers only on the way in, the coach's charts behind the roster +
// coach_view + adult + opt-in gates, the team panel behind "share measured", and not-your-team → 403.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { seedAthlete } from '@/tests/helpers/fakeReadinessDb';
import { fakeHoopsDb, seedShots, type FakeHoopsDb } from '@/tests/helpers/fakeHoopsDb';

const h = vi.hoisted(() => ({ db: null as unknown as FakeHoopsDb, user: null as string | null }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : (h.db as unknown as Record<string | symbol, unknown>)[p]) }) }));
vi.mock('@/lib/camp/server', () => ({ currentUserId: async () => h.user, bad: (error: string, status = 400) => Response.json({ error }, { status }) }));

import { POST as athletePOST, DELETE as athleteDELETE } from '@/app/api/hoops-cam/sessions/route';
import { GET as coachGET } from '@/app/api/coach/shots/route';
import { resetHoopsProbe } from '@/lib/hoops-cam/store';
import { resetVbtProbe } from '@/lib/vbt/store';
import { resetReadinessProbe } from '@/lib/coach/readiness/store';
import { resetGroupsProbe } from '@/lib/groups/store';
import { serverKeeps, type HoopsDb } from '@/lib/hoops-cam/server';

const NOW = '2026-11-03T15:00:00Z';
const AT = Date.parse('2026-11-03T14:00:00Z');
const session = (o: Record<string, unknown> = {}) => ({
  kind: 'shots', day: '2026-11-03', at: AT, placement: 'left_wing',
  shots: [{ t: 1000, made: true, fixed: false, x: 1.2, z: 4 }, { t: 6000, made: false, fixed: true, x: null, z: null }], ...o,
});
const req = (url: string, method: string, json?: unknown) => new NextRequest(`http://fel.test${url}`, { method, ...(json === undefined ? {} : { body: JSON.stringify(json), headers: { 'content-type': 'application/json' } }) });
async function call(fn: (r: NextRequest) => Promise<Response>, url: string, method: string, json?: unknown) {
  const r = await fn(req(url, method, json));
  return { status: r.status, json: await r.json() as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const post = (json: unknown) => call(athletePOST as never, '/api/hoops-cam/sessions', 'POST', json);
const coach = (q = '') => call(coachGET as never, `/api/coach/shots${q}`, 'GET');

beforeEach(() => {
  vi.useFakeTimers({ now: Date.parse(NOW), toFake: ['Date'] });
  h.db = fakeHoopsDb({ now: NOW });
  h.user = 'ath';
  resetHoopsProbe(); resetVbtProbe(); resetReadinessProbe(); resetGroupsProbe();
});

describe('the athlete', () => {
  it('a teen, and an adult who has not opted in, are refused at the movement-save gate: nothing written', async () => {
    seedAthlete(h.db, 'ath', { dobYear: 2026 - 15 });
    const t = await post(session());
    expect(t.status).toBe(403);
    expect(t.json.error).toBe('scan_save_adults_only');
    h.db.users[0].dobYear = 1990;
    h.db.optIns.length = 0;
    expect((await post(session())).status).toBe(403);
    expect(h.db.sessions).toHaveLength(0);
    expect(h.db.log.filter((q) => q.includes('HoopsCamSession'))).toEqual([]);
  });

  it('before the SQL is applied: POST and DELETE answer 503, the page is told the server does not keep it, nothing 500s', async () => {
    h.db.hoopsTable = false;
    seedAthlete(h.db, 'ath');
    expect(await post(session())).toEqual({ status: 503, json: { error: 'hoopscam_not_ready', saved: false } });
    expect((await call(athleteDELETE as never, '/api/hoops-cam/sessions', 'DELETE')).status).toBe(503);
    expect(await serverKeeps(h.db as unknown as HoopsDb, true)).toBe(false);
  });

  it('a verified adult who opted in: the session is kept, numbers only, and DELETE takes it all back', async () => {
    seedAthlete(h.db, 'ath');
    expect(await serverKeeps(h.db as unknown as HoopsDb, true)).toBe(true);
    expect(await serverKeeps(h.db as unknown as HoopsDb, false)).toBe(false);
    const p = await post({ ...session(), frame: 'data:image/png;base64,AAAA', landmarks: [[0.1, 0.2]] });
    expect(p.status).toBe(200);
    expect(h.db.sessions).toHaveLength(1);
    // what is stored is cleanSession's output: anything else in the body is dropped
    expect(Object.keys(h.db.sessions[0].data).sort()).toEqual(['at', 'day', 'kind', 'placement', 'shots']);
    expect(Object.keys(h.db.sessions[0].data.shots[0]).sort()).toEqual(['fixed', 'made', 't', 'x', 'z']);
    expect(JSON.stringify(h.db.sessions[0])).not.toMatch(/data:image|landmarks/);
    expect((await call(athleteDELETE as never, '/api/hoops-cam/sessions', 'DELETE')).json).toEqual({ deleted: true });
    expect(h.db.sessions).toHaveLength(0);
  });

  it('a bad or empty session is refused', async () => {
    seedAthlete(h.db, 'ath');
    expect((await post({ kind: 'shots', day: 'today' })).status).toBe(400);
    expect((await post(session({ shots: [] }))).json.error).toBe('empty_session');
    expect((await post(null)).status).toBe(400);
    expect(h.db.sessions).toHaveLength(0);
  });

  it('signed out: 401', async () => {
    h.user = null;
    expect((await post(session())).status).toBe(401);
    expect((await coach()).status).toBe(401);
  });
});

describe('the coach', () => {
  beforeEach(() => {
    seedAthlete(h.db, 'ath', { coaches: ['c1'], name: 'Maya Okafor' });                 // shares
    seedAthlete(h.db, 'quiet', { coaches: ['c1'], share: false, name: 'Quiet Q' });     // no coach_view grant
    seedAthlete(h.db, 'teen', { coaches: ['c1'], dobYear: 2026 - 16, name: 'Teen T' });
    seedAthlete(h.db, 'noopt', { coaches: ['c1'], optIn: false, name: 'No Opt' });
    for (const id of ['ath', 'quiet', 'teen', 'noopt']) seedShots(h.db, id, 1, { made: 4, missed: 6 });
    seedShots(h.db, 'ath', 3, { made: 2, missed: 0, x: null, z: null });
    seedShots(h.db, 'ath', 40, { made: 9, missed: 0 });                                  // outside the 28 days
    h.user = 'c1';
  });

  it('before the SQL: dark (available false) for the roster and the team', async () => {
    h.db.hoopsTable = false;
    expect((await coach()).json).toEqual({ available: false });
    expect((await coach('?team=g1')).json).toEqual({ available: false });
  });

  it('a chart only for athletes who share, are adults and opted in; the rest are a name and nothing else', async () => {
    const b = (await coach()).json;
    expect(b.available).toBe(true);
    const by = Object.fromEntries(b.athletes.map((a: { id: string }) => [a.id, a]));
    expect(by.ath.shares).toBe(true);
    expect(by.ath.shots).toMatchObject({ sessions: 2, total: { made: 6, taken: 12 }, noSpot: 2 });
    expect(by.ath.shots.dots).toHaveLength(10);
    expect(by.ath.shots.trend.map((d: { day: string }) => d.day)).toEqual(['2026-10-31', '2026-11-02']);
    for (const id of ['quiet', 'teen', 'noopt']) { expect(by[id].shares, id).toBe(false); expect(by[id].shots, id).toBeNull(); }
  });

  it('the team panel: only members who are adults, can save and share measured; the rest counted; not the coach\'s team → 403', async () => {
    h.db.groups.push({ id: 'g1', kind: 'team', ownerId: 'c1', name: 'Varsity', members: [{ userId: 'c1', role: 'owner' }, { userId: 'ath', role: 'member' }, { userId: 'teen', role: 'member' }, { userId: 'quiet', role: 'member' }, { userId: 'noopt', role: 'member' }] });
    h.db.share = { g1: { ath: true, teen: true, quiet: false, noopt: true } };
    const t = (await coach('?team=g1')).json;
    expect(t.available).toBe(true);
    expect(t.members.map((m: { id: string }) => m.id)).toEqual(['ath']);
    expect(t.members[0]).toMatchObject({ name: 'Maya', shots: { total: { made: 6, taken: 12 } } });
    expect(t.hidden).toBe(3);
    expect((await coach('?team=nope')).status).toBe(403);
    h.user = 'ath';
    expect((await coach('?team=g1')).status).toBe(403);
  });

  it('a squad is not a team: 403', async () => {
    h.db.groups.push({ id: 's1', kind: 'squad', ownerId: 'c1', name: 'Friends', members: [{ userId: 'c1', role: 'owner' }, { userId: 'ath', role: 'member' }] });
    expect((await coach('?team=s1')).status).toBe(403);
  });
});
