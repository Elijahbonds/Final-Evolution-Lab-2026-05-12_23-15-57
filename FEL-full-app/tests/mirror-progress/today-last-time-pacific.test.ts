// MIRROR-TZ (2026-10-08): the Pacific-time regression run for Today serves "last time" from the athlete's own
// completed logs (the harness and expectations are today-last-time.test.ts's, copied so that file stays byte-for-byte
// unchanged). Today's "Last time: 3×8 @ 60 kg" failed on the Mac mini in Pacific time and passed with TZ=UTC — the
// zone was a coincidence (two back-to-back saves tied on completedAt in the same millisecond, and the stable sort in
// lib/coach/loop.ts progressSeries left the OLDEST tied log last). The zone is pinned here so CI (UTC) runs the same
// scenarios, plus the frozen-clock tie itself.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => { process.env.TZ = 'America/Los_Angeles'; });

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
import { GET as todayGET } from '@/app/api/coach/me/today/route';
import { POST as logPOST } from '@/app/api/coach/me/log/route';
import { catalogueRow, newTodayStore, seedProgram } from '@/lib/coach/todayMemoryDb';
import { lastTimeLine } from '@/lib/coach/loop';
import type { TodayPayload } from '@/lib/coach/todayServer';

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

describe('the zone pin', () => {
  it('TZ is America/Los_Angeles before anything reads a date', () => {
    // 2026-10-08T04:40:00.000Z is 9:40 PM PT on Oct 7 (already Oct 8 in UTC): both reads prove the pin holds.
    const d = new Date('2026-10-08T04:40:00.000Z');
    expect(d.getTimezoneOffset()).toBe(420);
    expect(d.getDate()).toBe(7);
  });
});

describe('Today serves "last time" in Pacific time', () => {
  beforeEach(() => seed(1990));

  it('(a) the NEWEST completed log wins, across the program\'s days (real clock)', async () => {
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

  it('(b) the NEWEST completed log wins when both saves share one completedAt (frozen clock)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-08T04:40:00.000Z') });
    try {
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
    } finally {
      vi.useRealTimers();
    }
  });

  it('(c) the newest instant wins across a Pacific midnight', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-08T06:30:00.000Z') }); // 11:30 PM PT Oct 7
    try {
      await done(S[0], [{ sessionExerciseId: SE[0][0], sets: [{ reps: 8, weight: 60 }, { reps: 8, weight: 60 }, { reps: 8, weight: 60 }] }]);
      vi.setSystemTime(new Date('2026-10-08T07:30:00.000Z')); // 12:30 AM PT Oct 8
      await done(S[1], [{ sessionExerciseId: SE[1][0], sets: [{ reps: 8, weight: 62.5 }, { reps: 8, weight: 62.5 }, { reps: 7, weight: 62.5 }] }]);
      const p = await today();
      expect(p.today!.session.label).toBe('Day 3');
      const [goblet] = p.today!.session.exercises;
      expect(lastTimeLine(p.today!.lastTime![goblet.id])).toBe('Last time: 3 sets: 8, 8, 7 @ 62.5 kg');
    } finally {
      vi.useRealTimers();
    }
  });
});
