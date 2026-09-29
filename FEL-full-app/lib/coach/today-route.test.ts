// The client's Today routes, run for real (MIRROR-COACH P2, 2026-09-25): GET /api/coach/me/today and POST
// /api/coach/me/log over an in-memory database that refuses a column the schema does not have (lib/coach/
// todayMemoryDb.ts). Only the session and the database are stand-ins.
//
// The trip: a coach's session in every section, with a key set, a superset, timed items and a catalogue written out
// in full, reaches the client with its coaching; the client logs per set in pounds; the sets land in kilograms and the
// per-exercise columns are derived from them; a bad set is refused with nothing written; an old client's log and an
// old row still save and read as before.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

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
import { GET as inboxGET } from '@/app/api/coach/inbox/route';
import { EXERCISE_LOG_WRITABLE, SET_LOG_WRITABLE, catalogueRow, newTodayStore, seedProgram } from './todayMemoryDb';
import { logLines } from './setLog';
import type { TodayPayload } from './todayServer';

type Row = Record<string, any>;
let PID = '', S1 = '', S2 = '', SE: string[][] = [];

async function today(as = 'client-1') {
  h.user = as;
  const res = await todayGET();
  return { status: res.status, json: await res.json() as TodayPayload };
}
async function log(body: Row, as = 'client-1') {
  h.user = as;
  const res = await logPOST(new NextRequest('http://fel.test/api/coach/me/log', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
  return { status: res.status, json: await res.json() as Row };
}
const exOf = (p: TodayPayload, name: string) => p.today!.session.exercises.find((e) => e.name === name)!;

beforeEach(() => {
  h.store = newTodayStore();
  h.store.user.push({ id: 'coach-1', name: 'Coach One', email: 'c1@x.test' }, { id: 'client-1', name: 'Sam', email: 'sam@x.test' });
  h.store.pe.push(
    catalogueRow({ id: 'pe-goblet', coachId: 'coach-1', name: 'Goblet Squat', pattern: 'squat', braceMode: 'set', equipment: ['kettlebell'], demoVideoUrl: 'https://video.example/goblet-squat.mp4',
      primaryCues: ['Elbows inside the knees', 'Spread the floor', 'Chest proud'], commonFaults: [{ fault: 'Knees drift in', correctionCue: 'Push the knees out over the toes' }], regressionOfId: 'pe-box' }),
    catalogueRow({ id: 'pe-box', coachId: 'coach-1', name: 'Box Squat' }),
    catalogueRow({ id: 'pe-split', coachId: 'coach-1', name: 'Split Squat', regressionOfId: 'pe-theirs' }),
    catalogueRow({ id: 'pe-row', coachId: 'coach-1', name: 'Half-kneeling Row' }),
    catalogueRow({ id: 'pe-carry', coachId: 'coach-1', name: 'Suitcase Carry' }),
    catalogueRow({ id: 'pe-flow', coachId: 'coach-1', name: '90/90 Hip Switch' }),
    catalogueRow({ id: 'pe-theirs', coachId: 'coach-2', name: 'Their Private Drill' }),
  );
  const ids = seedProgram(h.store, {
    coachId: 'coach-1', clientId: 'client-1', name: 'Base block', blockLabel: 'Week 1',
    sessions: [
      { order: 1, label: 'Day 1', exercises: [{ exerciseId: 'pe-goblet' }] },
      { order: 2, label: 'Day 2', exercises: [
        // added in the order a coach happens to add them, not running order
        { exerciseId: 'pe-goblet', section: 'key', isKeySet: true, sets: 4, reps: '5', load: 'RPE8', effortBand: 'surge', setupCues: ['tripod-down'] },
        { exerciseId: 'pe-split', section: 'assist', supersetGroup: 'A', sets: 3, reps: '8 each' },
        { exerciseId: 'pe-row', section: 'assist', supersetGroup: 'A', sets: 3, reps: '10 each', holdSeconds: 2 },
        { exerciseId: 'pe-carry', section: 'finish', sets: 3, reps: '30 s', workSeconds: 30, load: '24kg', restSeconds: 60 },
        { exerciseId: 'pe-flow', section: 'prep', sets: 2, reps: '6 each side', load: 'body', holdSeconds: 5, restSeconds: 0 },
      ] },
    ],
  });
  PID = ids.programId; [S1, S2] = ids.sessionIds; SE = ids.exerciseIds;
  // Day 1 done, logged the OLD way (one free-text row), with a coach comment — dated well before any real save, so
  // the inbox's newest-first order does not depend on the wall clock
  const at = new Date('2026-01-10T18:00:00Z');
  h.store.cs.push({ id: 'cs1', programId: PID, sessionId: S1, clientId: 'client-1', completedAt: at, createdAt: at, updatedAt: at });
  h.store.log.push({ id: 'log-old', clientSessionId: 'cs1', sessionExerciseId: SE[0][0], actualSets: 3, actualReps: '8,8,8', actualLoad: '24kg', rpe: 7, clientNote: null, videoUrl: null,
    coachComment: 'Good depth.', coachCommentAt: new Date('2026-01-11T08:00:00Z'), completedAt: at, createdAt: at, updatedAt: at });
});

describe('GET /api/coach/me/today: the read model', () => {
  it('today is the first session not done, in running order, and each card carries the catalogue\'s coaching', async () => {
    const { status, json } = await today();
    expect(status).toBe(200);
    expect(json.today!.index).toBe(1);
    expect(json.today!.session.exercises.map((e) => `${e.section}:${e.name}`)).toEqual([
      'prep:90/90 Hip Switch', 'key:Goblet Squat', 'assist:Split Squat', 'assist:Half-kneeling Row', 'finish:Suitcase Carry',
    ]);
    const g = exOf(json, 'Goblet Squat');
    expect(g.coaching).toMatchObject({
      cues: ['Elbows inside the knees', 'Spread the floor', 'Chest proud'],
      faults: [{ fault: 'Knees drift in', fix: 'Push the knees out over the toes' }],
      demo: { kind: 'file', src: 'https://video.example/goblet-squat.mp4' },
      easier: { id: 'pe-box', name: 'Box Squat' },
      pattern: { id: 'squat', label: 'Squat' }, brace: { id: 'set', label: 'Set brace' }, equipment: ['kettlebell'],
      setup: [{ id: 'tripod-down', text: 'Heel, big toe, little toe: press all three into the floor.' }],
      band: { id: 'surge', label: 'Surge' },
    });
    expect(g).toMatchObject({ isKeySet: true, dose: '4 × 5 @ RPE8 · Surge' });
    expect(exOf(json, 'Suitcase Carry').timers.map((t) => t.kind)).toEqual(['work', 'rest']);
    expect(exOf(json, '90/90 Hip Switch').timers.map((t) => t.kind)).toEqual(['hold']);
    // the block is the block's own fields, not the whole block tree it used to send for one label
    expect(Object.keys(json.today!.block).sort()).toEqual(['id', 'label', 'order', 'targetDate']);
    expect(json.recentComments).toEqual([{ exercise: 'Goblet Squat', comment: 'Good depth.', at: '2026-01-11T08:00:00.000Z' }]);
  });

  it('an easier-version link to ANOTHER coach\'s row is not named on the client\'s card', async () => {
    const { json } = await today();
    expect(exOf(json, 'Split Squat').coaching.easier).toBeNull();
    expect(JSON.stringify(json)).not.toContain('Their Private Drill');
  });

  it('a stranger, or a client with nothing active, gets nothing', async () => {
    expect((await today('someone-else')).json).toEqual({ program: null, today: null, open: null, recentComments: [] });
    h.user = null;
    expect((await todayGET()).status).toBe(401);
  });
});

describe('POST /api/coach/me/log: per-set logging', () => {
  const carry = () => SE[1][3], goblet = () => SE[1][0], split = () => SE[1][1];

  it('sets typed in pounds land in kilograms; the per-exercise columns are derived; Today reads them back per set', async () => {
    const r = await log({ programId: PID, sessionId: S2, logs: [
      { sessionExerciseId: goblet(), sets: [{ reps: '5', weight: '135', unit: 'lb', rir: 2, effort: 8 }, { reps: '5', weight: '135', unit: 'lb', rir: 1, effort: 9 }, { reps: '', weight: '' }], clientNote: 'Last set slowed down.' },
      { sessionExerciseId: carry(), sets: [{ workSeconds: '30', weight: '24', unit: 'kg' }, { workSeconds: 22, weight: 24, unit: 'kg' }] },
    ] });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const g = h.store.log.find((l) => l.sessionExerciseId === goblet())!;
    expect(g).toMatchObject({ actualSets: 2, actualReps: '5,5', actualLoad: '61.2 kg', rpe: 9, clientNote: 'Last set slowed down.' });
    expect(h.store.setLog.filter((s) => s.exerciseLogId === g.id).map((s) => [s.setIndex, s.reps, s.weightKg, s.rir, s.effort])).toEqual([[0, 5, 61.235, 2, 8], [1, 5, 61.235, 1, 9]]);
    const c = h.store.log.find((l) => l.sessionExerciseId === carry())!;
    expect(c).toMatchObject({ actualSets: 2, actualReps: '30s,22s', actualLoad: '24 kg', rpe: null });

    const back = (await today()).json;
    const open = back.open!.logs.find((l) => l.sessionExerciseId === goblet())!;
    expect(open.setLogs.map((s) => s.weightKg)).toEqual([61.235, 61.235]);
    expect(logLines(open, 'lb').lines).toEqual(['Set 1 · 5 reps · 135 lb · 2 left · effort 8 (Surge)', 'Set 2 · 5 reps · 135 lb · 1 left · effort 9 (Surge)']);
  });

  it('a re-save replaces the list: a cleared set goes, the rest are updated in place (one row per set index)', async () => {
    await log({ programId: PID, sessionId: S2, logs: [{ sessionExerciseId: goblet(), sets: [{ reps: 5, weight: 60 }, { reps: 5, weight: 62.5 }, { reps: 4, weight: 65 }] }] });
    const id = h.store.log.find((l) => l.sessionExerciseId === goblet())!.id;
    const firstIds = h.store.setLog.filter((s) => s.exerciseLogId === id).map((s) => s.id);
    await log({ programId: PID, sessionId: S2, logs: [{ sessionExerciseId: goblet(), sets: [{ reps: 5, weight: 60 }, { reps: 6, weight: 62.5 }] }] });
    const now = h.store.setLog.filter((s) => s.exerciseLogId === id).sort((a, b) => a.setIndex - b.setIndex);
    expect(now.map((s) => [s.setIndex, s.reps, s.weightKg])).toEqual([[0, 5, 60], [1, 6, 62.5]]);
    expect(now.map((s) => s.id)).toEqual(firstIds.slice(0, 2));
    expect(h.store.log.find((l) => l.id === id)).toMatchObject({ actualSets: 2, actualReps: '5,6', actualLoad: '60–62.5 kg' });
  });

  it('a set out of range is refused with its own error and row, and NOTHING is written (not even the valid exercises)', async () => {
    const before = JSON.stringify([h.store.cs, h.store.log, h.store.setLog]);
    const bad = await log({ programId: PID, sessionId: S2, logs: [
      { sessionExerciseId: carry(), sets: [{ workSeconds: 30 }] },
      { sessionExerciseId: goblet(), sets: [{ reps: 5, rir: 2 }, { reps: 5, rir: 7 }] },
    ] });
    expect(bad).toEqual({ status: 400, json: { error: 'rir_range', sessionExerciseId: goblet(), set: 2 } });
    for (const [row, error] of [[{ effort: 11 }, 'effort_range'], [{ weight: 600 }, 'weight_range'], [{ weight: 60, unit: 'st' }, 'unit_unknown'], [{ reps: 250 }, 'reps_range'], [{ workSeconds: 0 }, 'work_seconds_range']] as const) {
      expect((await log({ programId: PID, sessionId: S2, logs: [{ sessionExerciseId: goblet(), sets: [row] }] })).json.error).toBe(error);
    }
    expect(JSON.stringify([h.store.cs, h.store.log, h.store.setLog])).toBe(before);
  });

  it('an OLD client (no `sets`) still saves its typed columns exactly as before — the /training step-through posts this shape', async () => {
    const r = await log({ programId: PID, sessionId: S2, logs: [{ sessionExerciseId: goblet(), actualSets: 3, actualReps: '8,8,8', actualLoad: '225 lbs', rpe: '12', clientNote: 'ok' }] });
    expect(r.status).toBe(200);
    expect(h.store.log.find((l) => l.sessionExerciseId === goblet())).toMatchObject({ actualSets: 3, actualReps: '8,8,8', actualLoad: '225 lbs', rpe: 10, clientNote: 'ok' });
    expect(h.store.setLog).toEqual([]);
  });

  it('an old row survives an untouched new card, and is replaced once the client logs sets on it', async () => {
    // started on an old card: a free-text row on the split squat
    await log({ programId: PID, sessionId: S2, logs: [{ sessionExerciseId: split(), actualSets: 3, actualReps: '8,8,8', actualLoad: '24kg', rpe: 7 }] });
    let open = (await today()).json.open!.logs.find((l) => l.sessionExerciseId === split())!;
    expect(logLines(open)).toEqual({ kind: 'legacy', lines: ['3×8,8,8 @ 24kg · RPE 7'] });
    // the new card sends [] for it (the client never touched it) with a note: the old numbers stay
    await log({ programId: PID, sessionId: S2, logs: [{ sessionExerciseId: split(), sets: [], clientNote: 'left knee felt off on set 3' }] });
    open = (await today()).json.open!.logs.find((l) => l.sessionExerciseId === split())!;
    expect(open).toMatchObject({ actualSets: 3, actualReps: '8,8,8', actualLoad: '24kg', rpe: 7, clientNote: 'left knee felt off on set 3' });
    // …and once sets are logged, they are the record
    await log({ programId: PID, sessionId: S2, logs: [{ sessionExerciseId: split(), sets: [{ reps: 8, weight: 20 }] }] });
    open = (await today()).json.open!.logs.find((l) => l.sessionExerciseId === split())!;
    expect(logLines(open).kind).toBe('sets');
    expect(open).toMatchObject({ actualSets: 1, actualReps: '8', actualLoad: '20 kg', rpe: null });
  });

  it('Done stamps the session and every log, and Today moves on — here to "program complete", naming the program', async () => {
    const r = await log({ programId: PID, sessionId: S2, complete: true, logs: [{ sessionExerciseId: goblet(), sets: [{ reps: 5, weight: 60, effort: 8 }] }] });
    expect(r.status).toBe(200);
    expect(r.json.clientSession.completedAt).toBeTruthy();
    expect(r.json.clientSession.exerciseLogs[0].setLogs).toHaveLength(1);
    // it answered { program: null } here too, so the client who just finished read "No active program yet"
    expect((await today()).json).toEqual({ program: { id: PID, name: 'Base block', coachName: 'Coach One' }, today: null, open: null, recentComments: [] });
  });

  // MIRROR-COACH P2 review (2026-09-26): Today sends EVERY exercise on Save; an untouched one used to create an empty
  // ExerciseLog, which the coach's boards counted as logged work and the builder refused to remove.
  it('an untouched exercise writes no row; a note-only entry writes its note (and nothing reads it as training)', async () => {
    const r = await log({ programId: PID, sessionId: S2, logs: [
      { sessionExerciseId: goblet(), sets: [{ reps: '', weight: '' }], clientNote: 'Knee felt tight warming up.' },
      { sessionExerciseId: split(), sets: [{ reps: '', weight: '' }, { reps: '', weight: '' }] },
      { sessionExerciseId: carry(), sets: [] },
    ] });
    expect(r.status).toBe(200);
    const rows = h.store.log.filter((l) => l.clientSessionId !== 'cs1');
    expect(rows.map((l) => [l.sessionExerciseId, l.clientNote])).toEqual([[goblet(), 'Knee felt tight warming up.']]);
    expect(h.store.setLog).toEqual([]);
    const { logHasWork, logHasContent } = await import('./setLog');
    expect([logHasWork({ ...rows[0], setLogs: [] }), logHasContent({ ...rows[0], setLogs: [] })]).toEqual([false, true]);
  });

  it('Done still writes a row per exercise, the untouched ones too (the completion is on each)', async () => {
    await log({ programId: PID, sessionId: S2, complete: true, logs: [{ sessionExerciseId: goblet(), sets: [{ reps: 5, weight: 60 }] }, { sessionExerciseId: split(), sets: [] }] });
    expect(h.store.log.filter((l) => l.clientSessionId !== 'cs1').map((l) => l.sessionExerciseId).sort()).toEqual([goblet(), split()].sort());
  });

  it('an active program with NO sessions is not "program complete": Today falls through to no program', async () => {
    // the client's only active program was saved with no sessions (a camp plan with no milestones)
    h.store.program.forEach((p) => { if (p.id === PID) p.isActive = false; });
    const empty = seedProgram(h.store, { coachId: 'coach-1', clientId: 'client-1', name: 'Empty plan', blockLabel: 'W', sessions: [] });
    expect(empty.sessionIds).toEqual([]);
    expect((await today()).json).toEqual({ program: null, today: null, open: null, recentComments: [] });
    // …and beside a FINISHED program, the finished one is named, never the empty one
    h.store.program.forEach((p) => { if (p.id === PID) p.isActive = true; });
    h.store.cs.push({ id: 'cs2', programId: PID, sessionId: S2, clientId: 'client-1', completedAt: new Date(), createdAt: new Date(), updatedAt: new Date() });
    h.store.program.sort((a, b) => (a.id === empty.programId ? -1 : b.id === empty.programId ? 1 : 0));
    expect((await today()).json.program).toMatchObject({ id: PID, name: 'Base block' });
  });

  it('only the program\'s client may log, only into this program\'s session', async () => {
    expect((await log({ programId: PID, sessionId: S2, logs: [] }, 'coach-1')).status).toBe(403);
    expect((await log({ programId: PID, sessionId: 'nope', logs: [] })).json.error).toBe('session_not_found');
    expect((await log({ programId: PID, sessionId: S2, logs: [{ sessionExerciseId: SE[0][0], sets: [] }] })).json.error).toBe('exercise_not_in_session');
    h.user = 'client-1';
    expect((await logPOST(new NextRequest('http://fel.test/api/coach/me/log', { method: 'POST', body: '[1]' }))).status).toBe(400);
  });
});

describe('the coach\'s inbox reads both kinds of log', () => {
  it('an old row reads as it always did (no set lines); a per-set log reads as its derived line plus one line per set', async () => {
    const r = await log({ programId: PID, sessionId: S2, complete: true, logs: [
      { sessionExerciseId: SE[1][0], sets: [{ reps: 5, weight: 60, rir: 2, effort: 8 }, { reps: 5, weight: 62.5, rir: 1, effort: 9 }] },
    ] });
    expect(r.status).toBe(200);
    h.user = 'coach-1';
    const res = await inboxGET();
    const inbox = await res.json() as { items: { session: string; logs: Row[] }[]; needsReview: number };
    expect(inbox.items.map((i) => i.session)).toEqual(['Week 1 · Day 2', 'Week 1 · Day 1']);
    const [fresh] = inbox.items[0].logs;
    expect(fresh).toMatchObject({ exercise: 'Goblet Squat', actualSets: 2, actualReps: '5,5', actualLoad: '60–62.5 kg', rpe: 9,
      setLines: ['Set 1 · 5 reps · 60 kg · 2 left · effort 8 (Surge)', 'Set 2 · 5 reps · 62.5 kg · 1 left · effort 9 (Surge)'] });
    // P2 review (2026-09-26): the prescription reads as the client's dose line, and the Clients tab lists the set lines
    // under the row (they reached the API and were never shown), calling the summary's number the TOP effort
    expect(fresh.prescribed).toBe('4 × 5 @ RPE8 · Surge');
    const view = readFileSync(new URL('../../app/coach/_components/clients-view.tsx', import.meta.url), 'utf8');
    expect(view).toContain('{l.setLines.map((line, k) => <li key={k}>{line}</li>)}');
    expect(view).toContain("{l.setLines?.length ? 'top effort' : 'RPE'}");
    // the old free-text row: the same columns the Clients tab has always printed, and no set lines
    expect(inbox.items[1].logs[0]).toMatchObject({ actualSets: 3, actualReps: '8,8,8', actualLoad: '24kg', rpe: 7, setLines: [], coachComment: 'Good depth.' });
    expect(logLines(inbox.items[1].logs[0] as never).lines).toEqual(['3×8,8,8 @ 24kg · RPE 7']);
    expect(inbox.needsReview).toBe(1);
  });
});

describe('the in-memory database speaks the schema', () => {
  // the model's scalar columns, read out of prisma/schema.prisma (less the ids and timestamps the database assigns)
  const columns = (model: string) => {
    const m = new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, 'm').exec(readFileSync('prisma/schema.prisma', 'utf8'));
    if (!m) throw new Error(`model ${model} is not in the schema`);
    return m[1].split('\n').map((l) => l.trim()).filter((l) => /^\w+\s+(String|Int|Float|Boolean|DateTime|Json)\b/.test(l)).map((l) => l.split(/\s+/)[0])
      .filter((c) => !['id', 'createdAt', 'updatedAt'].includes(c)).sort();
  };
  it('ExerciseLog and SetLog writes may name exactly the schema\'s columns', () => {
    expect([...EXERCISE_LOG_WRITABLE].sort()).toEqual(columns('ExerciseLog'));
    expect([...SET_LOG_WRITABLE].sort()).toEqual(columns('SetLog'));
  });
});
