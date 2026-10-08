// MIRROR-PROGRESS (2026-10-07; plan Phase 4): Today's "Last time: 3×8 @ 60 kg" — the athlete's own newest completed log of
// the same exercise (lib/coach/loop.ts progressSeries → lastTimeLine), served with Today (lib/coach/todayServer.ts) and
// drawn on each exercise card (today-view.tsx). The real routes over the in-memory database that refuses a column the
// schema does not have (lib/coach/todayMemoryDb.ts); the view mounted with Phase 1's hooks rig.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importOriginal) => (await import('@/tests/helpers/hookRuntime')).hookedReact(await importOriginal()));

const h = vi.hoisted(() => ({ user: 'client-1' as string | null, store: null as unknown as import('@/lib/coach/todayMemoryDb').TodayStore }));
vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.user,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', async () => {
  const { todayMemoryDb } = await import('@/lib/coach/todayMemoryDb');
  return { prisma: new Proxy({}, { get: (_t, k) => (todayMemoryDb(h.store) as Record<string | symbol, unknown>)[k] }) };
});

import { NextRequest } from 'next/server';
import type { ReactNode } from 'react';
import { GET as todayGET } from '@/app/api/coach/me/today/route';
import { POST as logPOST } from '@/app/api/coach/me/log/route';
import { catalogueRow, newTodayStore, seedProgram } from '@/lib/coach/todayMemoryDb';
import { lastTimeLine, progressSeries, type ProgressPoint } from '@/lib/coach/loop';
import type { TodayPayload } from '@/lib/coach/todayServer';
import { TodayView } from '@/app/coach/_components/today-view';
import { mount } from '@/tests/helpers/hookRuntime';
import { findAll } from '@/tests/helpers/driveRender';

const THIS_YEAR = new Date().getFullYear();
let PID = '', S: string[] = [], SE: string[][] = [];

async function today(): Promise<TodayPayload> {
  h.user = 'client-1';
  return (await todayGET()).json();
}
async function done(sessionId: string, logs: { sessionExerciseId: string; sets: { reps: number; weight: number; unit?: 'kg' | 'lb' }[] }[]) {
  h.user = 'client-1';
  const body = {
    programId: PID, sessionId, complete: true,
    logs: logs.map((l) => ({ sessionExerciseId: l.sessionExerciseId, sets: l.sets.map((s) => ({ reps: s.reps, weight: s.weight, unit: s.unit ?? 'kg' })) })),
  };
  const res = await logPOST(new NextRequest('http://fel.test/api/coach/me/log', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
  expect(res.status).toBe(200);
}
const writes = () => ({ cs: h.store.cs.length, log: h.store.log.length, setLog: h.store.setLog.length });

function seed(dobYear: number | null) {
  h.store = newTodayStore();
  h.store.user.push({ id: 'coach-1', name: 'Coach One', email: 'c1@x.test' }, { id: 'client-1', name: 'Sam', email: 'sam@x.test', dobYear });
  h.store.pe.push(
    catalogueRow({ id: 'pe-goblet', coachId: 'coach-1', name: 'Goblet Squat' }),
    catalogueRow({ id: 'pe-row', coachId: 'coach-1', name: 'Half-kneeling Row' }),
  );
  const ids = seedProgram(h.store, {
    coachId: 'coach-1', clientId: 'client-1', name: 'Base block', blockLabel: 'Week 1',
    sessions: [
      { order: 1, label: 'Day 1', exercises: [{ exerciseId: 'pe-goblet', sets: 3, reps: '8' }] },
      { order: 2, label: 'Day 2', exercises: [{ exerciseId: 'pe-goblet', sets: 3, reps: '8' }, { exerciseId: 'pe-row', sets: 3, reps: '10' }] },
      { order: 3, label: 'Day 3', exercises: [{ exerciseId: 'pe-goblet', sets: 3, reps: '8' }, { exerciseId: 'pe-row', sets: 3, reps: '10' }] },
    ],
  });
  PID = ids.programId; S = ids.sessionIds; SE = ids.exerciseIds;
}

describe('lastTimeLine', () => {
  const pt = (p: Partial<ProgressPoint>): ProgressPoint => ({ at: '2026-10-01', load: null, reps: null, rpe: null, sets: null, repsText: null, loadText: null, ...p });
  it('3×8 @ 60 kg; uneven sets listed; a range kept', () => {
    expect(lastTimeLine(pt({ sets: 3, repsText: '8,8,8', loadText: '60 kg' }))).toBe('Last time: 3×8 @ 60 kg');
    expect(lastTimeLine(pt({ sets: 3, repsText: '8,8,6', loadText: '60–62.5 kg' }))).toBe('Last time: 3 sets: 8, 8, 6 @ 60–62.5 kg');
    expect(lastTimeLine(pt({ sets: 3, repsText: '30s,30s,30s', loadText: '24 kg' }))).toBe('Last time: 3×30s @ 24 kg');
  });
  it('in the unit the card shows', () => {
    expect(lastTimeLine(pt({ sets: 3, repsText: '5,5,5', loadText: '61.235 kg' }), 'lb')).toBe('Last time: 3×5 @ 135 lb');
    expect(lastTimeLine(pt({ sets: 1, repsText: '5', loadText: '225 lbs' }), 'kg')).toBe('Last time: 1×5 @ 102.06 kg');
  });
  it('an old free-text row: what it can say, and nothing it cannot ("RPE7" is not a load; a number with no unit stays bare)', () => {
    expect(lastTimeLine(pt({ sets: 3, repsText: '8-10', loadText: 'RPE7' }))).toBe('Last time: 3×8-10');
    expect(lastTimeLine(pt({ sets: null, repsText: '10', loadText: '135' }))).toBe('Last time: 10 reps @ 135');
    expect(lastTimeLine(pt({ sets: 3, repsText: null, loadText: '0 kg' }))).toBe('Last time: 3 sets');
    expect(lastTimeLine(pt({}))).toBeNull();
    expect(lastTimeLine(null)).toBeNull();
  });
  it('progressSeries carries what the line reads (sets, the reps and load as logged), the chart\'s numbers unchanged', () => {
    const s = progressSeries([{ exerciseName: 'x', completedAt: '2026-10-01T00:00:00Z', actualSets: 3, actualReps: '8,8,8', actualLoad: '60 kg', rpe: 7 }]);
    expect(s.x[0]).toEqual({ at: '2026-10-01T00:00:00Z', load: 60, reps: 8, rpe: 7, sets: 3, repsText: '8,8,8', loadText: '60 kg' });
  });
});

describe('Today serves "last time" from the athlete\'s own completed logs', () => {
  beforeEach(() => seed(1990));

  it('nothing done yet: no line', async () => {
    const p = await today();
    expect(p.today!.session.label).toBe('Day 1');
    expect(p.today!.lastTime).toEqual({});
  });

  it('after Day 1: Day 2\'s goblet squat reads Day 1\'s sets; the row, never done, has no line', async () => {
    await done(S[0], [{ sessionExerciseId: SE[0][0], sets: [{ reps: 8, weight: 60 }, { reps: 8, weight: 60 }, { reps: 8, weight: 60 }] }]);
    const p = await today();
    expect(p.today!.session.label).toBe('Day 2');
    const [goblet, row] = p.today!.session.exercises;
    expect(lastTimeLine(p.today!.lastTime![goblet.id])).toBe('Last time: 3×8 @ 60 kg');
    expect(p.today!.lastTime![row.id]).toBeUndefined();
  });

  it('the NEWEST completed log wins, across the program\'s days (matched by the catalogue row, not the slot)', async () => {
    await done(S[0], [{ sessionExerciseId: SE[0][0], sets: [{ reps: 8, weight: 60 }, { reps: 8, weight: 60 }, { reps: 8, weight: 60 }] }]);
    await done(S[1], [
      { sessionExerciseId: SE[1][0], sets: [{ reps: 8, weight: 62.5 }, { reps: 8, weight: 62.5 }, { reps: 7, weight: 62.5 }] },
      { sessionExerciseId: SE[1][1], sets: [{ reps: 10, weight: 30, unit: 'lb' }, { reps: 10, weight: 30, unit: 'lb' }] },
    ]);
    const p = await today();
    expect(p.today!.session.label).toBe('Day 3');
    const [goblet, row] = p.today!.session.exercises;
    expect(lastTimeLine(p.today!.lastTime![goblet.id])).toBe('Last time: 3 sets: 8, 8, 7 @ 62.5 kg');
    expect(lastTimeLine(p.today!.lastTime![row.id], 'lb')).toBe('Last time: 2×10 @ 30 lb');
  });

  it('a saved-but-not-finished session is not "last time", and a Done with nothing typed is not either', async () => {
    h.user = 'client-1';
    await logPOST(new NextRequest('http://fel.test/api/coach/me/log', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ programId: PID, sessionId: S[0], complete: false, logs: [{ sessionExerciseId: SE[0][0], sets: [{ reps: 8, weight: 60, unit: 'kg' }] }] }) }));
    expect((await today()).today!.lastTime).toEqual({});
    await done(S[0], [{ sessionExerciseId: SE[0][0], sets: [] }]);
    // the earlier save's sets were replaced by an empty list: nothing logged, so no line
    const p = await today();
    expect(p.today!.session.label).toBe('Day 2');
    expect(p.today!.lastTime).toEqual({});
  });
});

describe('a coached minor: their own log read back, nothing new written', () => {
  it('a 15-year-old sees the same line, and reading Today writes nothing', async () => {
    seed(THIS_YEAR - 15);
    await done(S[0], [{ sessionExerciseId: SE[0][0], sets: [{ reps: 8, weight: 20 }, { reps: 8, weight: 20 }, { reps: 8, weight: 20 }] }]);
    const before = writes();
    const p = await today();
    expect(lastTimeLine(p.today!.lastTime![p.today!.session.exercises[0].id])).toBe('Last time: 3×8 @ 20 kg');
    expect(writes()).toEqual(before);
  });
});

describe('the card draws it (today-view.tsx), in the unit it shows', () => {
  it('each exercise card is handed its line; one never done gets none', async () => {
    seed(1990);
    await done(S[0], [{ sessionExerciseId: SE[0][0], sets: [{ reps: 8, weight: 60 }, { reps: 8, weight: 60 }, { reps: 8, weight: 60 }] }]);
    const payload = await today();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => payload })));
    // one api object for every render (a fresh literal each render would re-run the view's load effect forever)
    const api = { today: '/today', log: '/log', messages: null };
    const m = mount(() => TodayView({ api }));
    for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
    const cards = findAll(m.tree as ReactNode, (el) => !!(el.props as { e?: { id?: string } }).e?.id && 'lastTime' in el.props);
    expect(cards.map((c) => (c.props as { lastTime: string | null }).lastTime)).toEqual(['Last time: 3×8 @ 60 kg', null]);
    m.unmount();
    vi.unstubAllGlobals();
  });
});
