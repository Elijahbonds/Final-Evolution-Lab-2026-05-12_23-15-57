// The off day on the client's Today, and logged (MIRROR-COACH P6, 2026-09-29): GET /api/coach/me/today and POST
// /api/coach/me/log run for real over the in-memory Today store (lib/coach/todayMemoryDb.ts) — the lane's database is
// offline and :3131 was down.
//
// The trip: a week of Day 1 (done) → an off day (FEL's template, kind 'recovery') → Day 2. Today serves the off day as
// one (its kind, its sections, the week with the off day named); the client logs the walk's minutes and presses Done;
// the result is a COMPLETED COACHED SESSION OF KIND RECOVERY with the walk's seconds in its SetLog — what P9's PRQ
// recovery reads (lib/coach/offDay.ts COMPLETED_OFF_DAY_WHERE) — and Today moves on to Day 2 with the off day ticked.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST_SESSION_BREATH } from '@/lib/breath/presets';
import { pacerLengthSec } from '@/lib/breath/pacer';

const h = vi.hoisted(() => ({ user: 'client-1' as string | null, store: null as unknown as import('./todayMemoryDb').TodayStore }));

vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.user,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', async () => {
  const { todayMemoryDb } = await import('./todayMemoryDb');
  return { prisma: new Proxy({}, { get: (_t, k) => (todayMemoryDb(h.store) as Record<string | symbol, unknown>)[k] }) };
});

import { NextRequest } from 'next/server';
import { GET as todayGET } from '@/app/api/coach/me/today/route';
import { POST as logPOST } from '@/app/api/coach/me/log/route';
import { POST as cooldownPOST } from '@/app/api/coach/me/cooldown/route';
import { catalogueRow, newTodayStore, seedProgram } from './todayMemoryDb';
import { COMPLETED_OFF_DAY_WHERE, OFF_DAY_ITEMS, OFF_DAY_LABEL, OFF_DAY_SEC } from './offDay';
import { logHasWork } from './setLog';
import { needsAutoCooldown, showsGeneratedWarmup } from './cooldown';
import type { TodayPayload } from './todayServer';

type Row = Record<string, any>;
const post = (url: string, body: unknown) => new NextRequest(`http://fel.test${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
async function today() { h.user = 'client-1'; return await (await todayGET()).json() as TodayPayload; }
async function log(body: Row) { h.user = 'client-1'; const r = await logPOST(post('/api/coach/me/log', body)); return { status: r.status, json: await r.json() as Row }; }

/** P9's predicate (COMPLETED_OFF_DAY_WHERE), read over the in-memory rows the way Postgres would run it — including,
 *  since the P6 review, `exerciseLogs: { some: LOGGED_WORK_WHERE }` (lib/coach/setLog.ts logHasWork is the same test). */
const completedOffDays = () => h.store.cs.filter((c) =>
  (COMPLETED_OFF_DAY_WHERE.completedAt.not === null ? c.completedAt !== null : true)
  && h.store.session.find((s) => s.id === c.sessionId)?.kind === COMPLETED_OFF_DAY_WHERE.session.kind
  && ('exerciseLogs' in COMPLETED_OFF_DAY_WHERE
    ? h.store.log.some((l) => l.clientSessionId === c.id && logHasWork({ ...l, setLogs: h.store.setLog.filter((x) => x.exerciseLogId === l.id) }))
    : true));

let PID = '', D1 = '', OFF = '', D2 = '', OFF_SE: string[] = [];
beforeEach(() => {
  h.store = newTodayStore();
  // a youth account (no birth year): the off day is for them too
  h.store.user.push({ id: 'coach-1', name: 'Coach One', email: 'c1@x.test' }, { id: 'client-1', name: 'Sam', email: 'sam@x.test', dobYear: null });
  h.store.pe.push(catalogueRow({ id: 'pe-goblet', coachId: 'coach-1', name: 'Goblet Squat', pattern: 'squat' }));
  for (const i of OFF_DAY_ITEMS) h.store.pe.push(catalogueRow({ id: `pe-${i.key}`, coachId: 'coach-1', ...i.catalogue }));
  const ids = seedProgram(h.store, {
    coachId: 'coach-1', clientId: 'client-1', name: 'Base block', blockLabel: 'Week 1',
    sessions: [
      { order: 1, label: 'Day 1', exercises: [{ exerciseId: 'pe-goblet', isKeySet: true }] },
      { order: 2, label: OFF_DAY_LABEL, kind: 'recovery', exercises: OFF_DAY_ITEMS.map((i) => ({ exerciseId: `pe-${i.key}`, ...i.prescription })) },
      { order: 3, label: 'Day 2', exercises: [{ exerciseId: 'pe-goblet', isKeySet: true }] },
    ],
  });
  PID = ids.programId; [D1, OFF, D2] = ids.sessionIds; OFF_SE = ids.exerciseIds[1];
  const at = new Date('2026-09-27T18:00:00Z');
  h.store.cs.push({ id: 'cs-d1', programId: PID, sessionId: D1, clientId: 'client-1', completedAt: at, cooldownDoneAt: null, createdAt: at, updatedAt: at });
});

describe('the off day on Today', () => {
  it('is served as a recovery session: its kind, a Key walk and a Cool-down, and the week with the off day named', async () => {
    const t = await today();
    expect(t.today!.session).toMatchObject({ id: OFF, label: OFF_DAY_LABEL, kind: 'recovery' });
    expect(t.today!.session.exercises.map((e) => [e.section, e.name])).toEqual(OFF_DAY_ITEMS.map((i) => [i.prescription.section, i.catalogue.name]));
    expect(t.today!.session.exercises[0].dose).toBe('1 × 12 min · Idle');
    expect(t.today!.session.exercises[0].timers).toEqual([{ kind: 'work', seconds: 720, label: 'Work 12:00' }]);
    // MIRROR-COACH P7 FIX (2026-09-29): the 4-6 Recovery Breath carries the one pacer's spec through the real route, so
    // Today's Work timer draws its ring (lib/breath/presets.ts workBreathFor); nothing else on the off day does
    const breath = t.today!.session.exercises.find((e) => e.name === POST_SESSION_BREATH.name)!;
    expect(breath.timers).toEqual([{ kind: 'work', seconds: 180, label: 'Work 3:00' }]);
    expect(breath.breath).toEqual({ ...POST_SESSION_BREATH.spec, from: 0, rounds: 15 });
    expect(pacerLengthSec(breath.breath!)).toBe(breath.workSeconds);
    expect(t.today!.session.exercises.filter((e) => e.breath).map((e) => e.name)).toEqual([POST_SESSION_BREATH.name]);
    expect(t.today!.week).toEqual({ label: 'Week 1', entries: [
      { id: D1, label: 'Day 1', kind: 'training', state: 'done' },
      { id: OFF, label: 'Off day', kind: 'recovery', state: 'today' },
      { id: D2, label: 'Day 2', kind: 'training', state: 'upcoming' },
    ] });
    // Today adds nothing of its own to an off day: no generated warm-up, no automatic cool-down
    expect(showsGeneratedWarmup(t.today!.session.kind)).toBe(false);
    expect(needsAutoCooldown(t.today!.session.exercises, t.today!.session.kind)).toBe(false);
    // a youth client gets the whole off day: Idle is allowed, nothing was dropped
    expect(t.today!.session.exercises.every((e) => e.coaching.band?.id === 'idle')).toBe(true);
  });
});

describe('logged as a coached session of kind recovery', () => {
  it('the walk\'s minutes land in its SetLog, Done completes a recovery ClientSession, and P9\'s predicate counts exactly it', async () => {
    expect(completedOffDays()).toHaveLength(0);
    const walked = 11 * 60 + 40;
    const logs = OFF_SE.map((id, k) => ({ sessionExerciseId: id, sets: k === 0 ? [{ workSeconds: walked }] : [] }));
    const r = await log({ programId: PID, sessionId: OFF, logs, complete: true });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const off = completedOffDays();
    expect(off).toHaveLength(1);
    expect(off[0]).toMatchObject({ programId: PID, sessionId: OFF, clientId: 'client-1' });
    expect(off[0].completedAt).toBeInstanceOf(Date);
    // the walk's seconds, where P9 reads easy-cardio minutes
    const walkLog = h.store.log.find((l) => l.clientSessionId === off[0].id && l.sessionExerciseId === OFF_SE[0])!;
    expect(h.store.setLog.filter((s) => s.exerciseLogId === walkLog.id).map((s) => s.workSeconds)).toEqual([walked]);
    expect(walked).toBeLessThanOrEqual(OFF_DAY_SEC);
    // Day 1 (training) is not an off day
    expect(off.map((c) => c.sessionId)).not.toContain(D1);
  });

  // MIRROR-COACH P6 FIX (2026-09-29, code review): Done with nothing logged moves Today on (a client who rested has to
  // press it), but it is not a completed off day for P9 — no empty tap earns recovery credit.
  it('an off day marked Done with NOTHING logged moves Today on but is not counted as a completed off day', async () => {
    const logs = OFF_SE.map((id) => ({ sessionExerciseId: id, sets: [] }));
    expect((await log({ programId: PID, sessionId: OFF, logs, complete: true })).status).toBe(200);
    expect(h.store.cs.find((c) => c.sessionId === OFF)!.completedAt).toBeInstanceOf(Date);
    expect((await today()).today!.session.id).toBe(D2);
    expect(completedOffDays()).toHaveLength(0);
  });

  it('Today moves on to Day 2 with the off day ticked done; the auto cool-down refuses the off day itself', async () => {
    await log({ programId: PID, sessionId: OFF, logs: [], complete: true });
    const t = await today();
    expect(t.today!.session.id).toBe(D2);
    expect(t.today!.session.kind).toBe('training');
    expect(t.today!.week.entries.map((e) => [e.label, e.state])).toEqual([['Day 1', 'done'], ['Off day', 'done'], ['Day 2', 'today']]);
    h.user = 'client-1';
    const res = await cooldownPOST(post('/api/coach/me/cooldown', { programId: PID, sessionId: OFF }));
    expect([res.status, (await res.json() as Row).error]).toEqual([409, 'recovery_session']);
  });
});
