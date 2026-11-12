// VBT: the routes for real (next-auth and the database mocked) over an in-memory database (tests/helpers/fakeVbtDb.ts) —
// the youth gate, the movement-save gate on POST, the pending-SQL fallback (nothing 500s before the tables exist), the
// warm-up band read again on the server, the coach's view behind the roster + coach_view + adult + opt-in gates, the team
// view behind "share measured", and zone targets on the coach's own program only.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { seedAthlete } from '@/tests/helpers/fakeReadinessDb';
import { fakeVbtDb, seedSet, type FakeVbtDb } from '@/tests/helpers/fakeVbtDb';

const h = vi.hoisted(() => ({ db: null as unknown as FakeVbtDb, user: null as string | null }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : (h.db as unknown as Record<string | symbol, unknown>)[p]) }) }));
vi.mock('@/lib/camp/server', () => ({ currentUserId: async () => h.user, bad: (error: string, status = 400) => Response.json({ error }, { status }) }));

import { GET as athleteGET, POST as athletePOST, DELETE as athleteDELETE } from '@/app/api/vbt/sets/route';
import { GET as coachGET, PUT as coachPUT } from '@/app/api/coach/vbt/route';
import { resetVbtProbe } from '@/lib/vbt/store';
import { resetReadinessProbe } from '@/lib/coach/readiness/store';
import { resetGroupsProbe } from '@/lib/groups/store';
import { liftFromName } from '@/lib/vbt/server';

const NOW = '2026-10-25T15:00:00Z';
const TODAY = '2026-10-25';
const set = (o: Record<string, unknown> = {}) => ({
  day: TODAY, at: 1, lift: 'back_squat', loadKg: 100, source: 'plate', fps: 60, reps: 3, partials: 0, bestMcv: 0.62, meanMcv: 0.6, lastMcv: 0.58,
  bestPv: 1.0, lossPct: 6.5, stopPct: 20, repMcvs: [0.62, 0.6, 0.58], warmup: false, band: null, ...o,
});
const req = (url: string, method: string, json?: unknown) => new NextRequest(`http://fel.test${url}`, { method, ...(json === undefined ? {} : { body: JSON.stringify(json), headers: { 'content-type': 'application/json' } }) });
async function call(fn: (r: NextRequest) => Promise<Response>, url: string, method: string, json?: unknown) {
  const r = await fn(req(url, method, json));
  return { status: r.status, json: await r.json() as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const get = () => call(athleteGET as never, '/api/vbt/sets', 'GET');
const post = (json: unknown) => call(athletePOST as never, '/api/vbt/sets', 'POST', json);

beforeEach(() => {
  vi.useFakeTimers({ now: Date.parse(NOW), toFake: ['Date'] });
  h.db = fakeVbtDb({ now: NOW });
  h.user = 'ath';
  resetVbtProbe(); resetReadinessProbe(); resetGroupsProbe();
});

describe('the athlete', () => {
  it('youth: under 13 and an unknown age are refused; a teen gets technique speed only, kept nowhere, and POST is refused', async () => {
    seedAthlete(h.db, 'ath', { dobYear: 2026 - 12 });
    expect((await get()).json).toEqual({ ok: false, error: 'under_13' });
    h.db.users[0].dobYear = null;
    expect((await get()).json).toEqual({ ok: false, error: 'age_unknown' });
    h.db.users[0].dobYear = 2026 - 15;
    const teen = (await get()).json;
    expect(teen).toMatchObject({ ok: true, tier: 'teen', canSave: false, kept: 'none', history: null, features: { profile: false, readiness: false, keep: false, medball: false } });
    const p = await post(set());
    expect(p.status).toBe(403);
    expect(p.json.error).toBe('scan_save_adults_only');
    expect(h.db.sets).toHaveLength(0);
  });

  it('an adult who has not opted in keeps sets on the phone; POST is refused', async () => {
    seedAthlete(h.db, 'ath', { optIn: false });
    expect((await get()).json).toMatchObject({ ok: true, tier: 'adult', canSave: false, kept: 'device', history: null });
    expect((await post(set())).status).toBe(403);
  });

  it('before the SQL is applied: GET says device, POST answers 503, nothing 500s', async () => {
    h.db.vbtTables = false;
    seedAthlete(h.db, 'ath');
    expect((await get()).json).toMatchObject({ ok: true, canSave: true, ready: false, kept: 'device', history: null });
    const p = await post(set());
    expect(p.status).toBe(503);
    expect(p.json).toEqual({ error: 'vbt_not_ready', saved: false });
    expect((await call(athleteDELETE as never, '/api/vbt/sets', 'DELETE')).status).toBe(503);
  });

  it('a verified adult who opted in: the set is kept (numbers only) and comes back in the history', async () => {
    seedAthlete(h.db, 'ath');
    const p = await post(set());
    expect(p.status).toBe(200);
    expect(h.db.sets).toHaveLength(1);
    expect(Object.keys(h.db.sets[0]).sort()).toEqual(['band', 'bestMcv', 'bestPv', 'createdAt', 'day', 'fps', 'id', 'lastMcv', 'lift', 'loadKg', 'lossPct', 'meanMcv', 'partials', 'repMcvs', 'reps', 'source', 'stopPct', 'userId', 'warmup']);
    const g = (await get()).json;
    expect(g.kept).toBe('server');
    expect(g.history).toHaveLength(1);
    expect(g.history[0]).toMatchObject({ lift: 'back_squat', loadKg: 100, reps: 3 });
    expect((await post({ ...set(), repMcvs: ['frame'] })).status).toBe(400);
    expect((await post({ ...set(), lift: 'curl' })).status).toBe(400);
    expect((await call(athleteDELETE as never, '/api/vbt/sets', 'DELETE')).json).toEqual({ deleted: true });
    expect(h.db.sets).toHaveLength(0);
  });

  it('a warm-up set\'s band is read again on the server from the saved history (a client "ready" is ignored)', async () => {
    seedAthlete(h.db, 'ath');
    for (const [d, v] of [[1, 0.62], [2, 0.63], [3, 0.61], [4, 0.62]] as const) seedSet(h.db, 'ath', d, { warmup: true, band: 'normal', repMcvs: [v, v - 0.02, v - 0.03] });
    const p = await post(set({ warmup: true, band: 'ready', bestMcv: 0.54, meanMcv: 0.53, lastMcv: 0.52, repMcvs: [0.54, 0.53, 0.52] }));
    expect(p.json).toMatchObject({ saved: true, band: 'low' });
    expect(h.db.sets.find((s) => s.day === TODAY)!.band).toBe('low');
  });

  it('the coach\'s zone targets on the athlete\'s program come with the context', async () => {
    seedAthlete(h.db, 'ath', { coaches: ['c1'] });
    h.db.programs.push({ id: 'p1', coachId: 'c1', clientId: 'ath', name: 'Block', slots: [{ id: 'se1', name: 'Back Squat', sets: 4, reps: '3', load: '80%' }, { id: 'se2', name: 'Plank', sets: 3, reps: '30s', load: 'body' }] });
    h.db.targets.push({ id: 't1', coachId: 'c1', sessionExerciseId: 'se1', zone: 'strength_speed', lossStopPct: 15 });
    const g = (await get()).json;
    expect(g.targets).toEqual([{ sessionExerciseId: 'se1', name: 'Back Squat', lift: 'back_squat', zone: 'strength_speed', lossStopPct: 15 }]);
    expect(g.coaches.map((c: { coachId: string }) => c.coachId)).toEqual(['c1']);
  });
});

describe('the coach', () => {
  beforeEach(() => {
    seedAthlete(h.db, 'ath', { coaches: ['c1'], name: 'Maya Okafor' });                 // shares
    seedAthlete(h.db, 'quiet', { coaches: ['c1'], share: false, name: 'Quiet Q' });     // no coach_view grant
    seedAthlete(h.db, 'teen', { coaches: ['c1'], dobYear: 2026 - 16, name: 'Teen T' });
    seedAthlete(h.db, 'noopt', { coaches: ['c1'], optIn: false, name: 'No Opt' });
    for (const id of ['ath', 'quiet', 'teen', 'noopt']) seedSet(h.db, id, 1);
    h.user = 'c1';
  });

  it('sees reps and velocity loss only for athletes who share, are adults and opted in', async () => {
    const b = (await call(coachGET as never, '/api/coach/vbt', 'GET')).json;
    expect(b.available).toBe(true);
    const by = Object.fromEntries(b.athletes.map((a: { id: string }) => [a.id, a]));
    expect(by.ath.shares).toBe(true);
    expect(by.ath.sets[0]).toMatchObject({ reps: 3, lossPct: 6.5, repMcvs: [0.62, 0.6, 0.58] });
    for (const id of ['quiet', 'teen', 'noopt']) { expect(by[id].shares, id).toBe(false); expect(by[id].sets, id).toEqual([]); }
  });

  it('before the SQL: available false; PUT 503', async () => {
    h.db.vbtTables = false;
    h.db.programs.push({ id: 'p1', coachId: 'c1', clientId: 'ath', name: 'Block', slots: [{ id: 'se1', name: 'Back Squat', sets: 4, reps: '3', load: '80%' }] });
    expect((await call(coachGET as never, '/api/coach/vbt', 'GET')).json).toEqual({ available: false });
    expect((await call(coachPUT as never, '/api/coach/vbt', 'PUT', { sessionExerciseId: 'se1', zone: 'strength_speed' })).status).toBe(503);
  });

  it('sets a zone on its own program slot only; the stop line is clamped; clear removes it', async () => {
    h.db.programs.push({ id: 'p1', coachId: 'c1', clientId: 'ath', name: 'Block', slots: [{ id: 'se1', name: 'Back Squat', sets: 4, reps: '3', load: '80%' }] });
    h.db.programs.push({ id: 'p2', coachId: 'c2', clientId: 'ath', name: 'Other', slots: [{ id: 'se9', name: 'Bench Press', sets: 4, reps: '3', load: '80%' }] });
    const put = (b: unknown) => call(coachPUT as never, '/api/coach/vbt', 'PUT', b);
    expect((await put({ sessionExerciseId: 'se9', zone: 'strength_speed' })).status).toBe(403);
    expect((await put({ sessionExerciseId: 'se1', zone: 'fast' })).status).toBe(400);
    expect((await put({ sessionExerciseId: 'se1', zone: 'strength_speed', lossStopPct: 90 })).json).toMatchObject({ ok: true, target: { zone: 'strength_speed', lossStopPct: 50 } });
    const b = (await call(coachGET as never, '/api/coach/vbt', 'GET')).json;
    expect(b.slots).toEqual([expect.objectContaining({ sessionExerciseId: 'se1', lift: 'back_squat', target: { sessionExerciseId: 'se1', zone: 'strength_speed', lossStopPct: 50 } })]);
    expect((await put({ sessionExerciseId: 'se1', clear: true })).json).toEqual({ ok: true, target: null });
    expect(h.db.targets).toHaveLength(0);
  });

  it('a team view: only members who are adults, can save and share measured; not the coach\'s team → 403', async () => {
    h.db.groups.push({ id: 'g1', kind: 'team', ownerId: 'c1', name: 'Varsity', members: [{ userId: 'c1', role: 'owner' }, { userId: 'ath', role: 'member' }, { userId: 'teen', role: 'member' }, { userId: 'quiet', role: 'member' }] });
    h.db.share = { g1: { ath: true, teen: true, quiet: false } };
    const t = (await call(coachGET as never, '/api/coach/vbt?team=g1', 'GET')).json;
    expect(t.members.map((m: { id: string }) => m.id)).toEqual(['ath']);
    expect(t.hidden).toBe(2);
    h.user = 'ath';
    expect((await call(coachGET as never, '/api/coach/vbt?team=g1', 'GET')).status).toBe(403);
  });
});

describe('a program slot\'s lift from its name', () => {
  it.each([
    ['Back Squat', 'back_squat'], ['Front squat', 'front_squat'], ['Bench Press', 'bench_press'], ['DB Bench Press', 'db_bench_press'],
    ['Conventional Deadlift', 'deadlift'], ['Overhead Press', 'overhead_press'], ['Hang Power Clean', 'hang_power_clean'], ['Power Clean', 'power_clean'],
    ['KB Swing', 'kb_swing'], ['Push-up', 'push_up'], ['Chin-up', 'pull_up'], ['Med ball chest pass', 'mb_chest_pass'], ['Plank', null],
  ])('%s → %s', (name, lift) => expect(liftFromName(name)).toBe(lift));
});
