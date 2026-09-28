// The program builder's save and load routes, run for real (MIRROR-COACH P2, 2026-09-25). Only the session and the
// database are stand-ins, and the database refuses a column the schema does not have — the way Prisma would — so a
// spec that carried a field SessionExercise lacks fails here, not in production.
//
// The trip: a coach builds a session with every section, a key set, a superset and timed items through
// POST /api/coach/programs/:id/exercises; GET /api/coach/programs/:id loads it back; the builder's own draft of each
// loaded exercise saves back unchanged; and POST /api/coach/programs/duplicate copies all of it to another athlete.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
// the store is swapped per test; the mocked client reads whichever one is current (lib/coach/builderMemoryDb.ts)
const h = vi.hoisted(() => ({ user: 'coach-1' as string | null, store: null as unknown as import('./builderMemoryDb').BuilderStore }));

vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.user,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', async () => {
  const { builderMemoryDb } = await import('./builderMemoryDb');
  return { prisma: new Proxy({}, { get: (_t, k) => (builderMemoryDb(h.store) as Record<string | symbol, unknown>)[k] }) };
});

import { NextRequest } from 'next/server';
import { POST as builderPOST } from '@/app/api/coach/programs/[id]/exercises/route';
import { GET as programGET } from '@/app/api/coach/programs/[id]/route';
import { POST as duplicatePOST } from '@/app/api/coach/programs/duplicate/route';
import { createProgram, newBuilderStore } from './builderMemoryDb';
import { bodyFromDraft, draftFromExercise } from './builder';
import type { ProgramTree, TreeExercise } from './loop';

const req = (url: string, body?: unknown) => new NextRequest(`http://fel.test${url}`, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
async function build(body: Row, as = 'coach-1', programId = PID) {
  h.user = as;
  const res = await builderPOST(req(`/api/coach/programs/${programId}/exercises`, body), ctx(programId));
  return { status: res.status, json: await res.json() as Row };
}
async function load(as = 'coach-1', programId = PID) {
  h.user = as;
  const res = await programGET(req(`/api/coach/programs/${programId}`), ctx(programId));
  return { status: res.status, json: await res.json() as { program: { tree: ProgramTree; role: string }; warnings: Record<string, unknown[]>; error?: string } };
}
const session = (t: ProgramTree, sid = SID) => t.blocks.flatMap((b) => b.sessions).find((x) => x.id === sid)!;
/** A TreeExercise minus what the database assigns (id, order), for comparing prescriptions. */
const rx = (e: TreeExercise) => { const { id: _i, order: _o, ...rest } = e; return rest; };

let PID = '', SID = '';
beforeEach(() => {
  h.store = newBuilderStore();
  h.store.fac = [{ userId: 'coach-1', certificationStatus: 'certified' }, { userId: 'coach-2', certificationStatus: 'certified' }];
  h.store.pe = [
    { id: 'pe-flow', coachId: 'coach-1', name: '90/90 hip switch', category: 'mobility' },
    { id: 'pe-pogo', coachId: 'coach-1', name: 'Pogo hops', category: 'plyometric' },
    { id: 'pe-tbdl', coachId: 'coach-1', name: 'Trap-bar deadlift', category: 'lower-body' },
    { id: 'pe-split', coachId: 'coach-1', name: 'Split squat', category: 'lower-body' },
    { id: 'pe-row', coachId: 'coach-1', name: 'Half-kneeling row', category: 'upper-pull' },
    { id: 'pe-carry', coachId: 'coach-1', name: 'Suitcase carry', category: 'conditioning' },
    { id: 'pe-breath', coachId: 'coach-1', name: 'Crocodile breathing', category: 'breath' },
    { id: 'pe-theirs', coachId: 'coach-2', name: 'Their private drill', category: 'general' },
  ];
  const p = createProgram(h.store, { coachId: 'coach-1', clientId: 'client-1', name: 'Base block', startDate: new Date('2026-09-28'), blocks: { create: [{ order: 1, label: 'Week 1', sessions: { create: [{ order: 1, label: 'Day 1' }, { order: 2, label: 'Day 2' }] } }] } });
  PID = p.id;
  SID = h.store.session[0].id;
});

/** The session a coach writes, in the order they happen to add it (not running order). */
const PLAN: Row[] = [
  { exerciseId: 'pe-tbdl', section: 'key', isKeySet: true, sets: 4, reps: '5', load: 'RPE8', tempo: '2-1-1-0', restSeconds: 150, effortBand: 'surge', setupCues: ['tripod-down', 'wall-behind'], coachNote: 'Push the floor.' },
  { exerciseId: 'pe-split', section: 'assist', supersetGroup: 'A', sets: 3, reps: '8 each', load: 'RPE7', effortBand: 'drive', setupCues: ['front-heel'] },
  { exerciseId: 'pe-row', section: 'assist', supersetGroup: 'A', sets: 3, reps: '10 each', load: 'RPE7', holdSeconds: 2, setupCues: ['elbows-to-pockets'] },
  { exerciseId: 'pe-flow', section: 'prep', sets: 2, reps: '6 each side', load: 'body', holdSeconds: 3, effortBand: 'idle' },
  { exerciseId: 'pe-carry', section: 'finish', sets: 3, workSeconds: 30, load: '24kg', setupCues: ['crush-handle', 'grow-tall'] },
  { exerciseId: 'pe-pogo', section: 'prime', sets: 2, reps: '10', load: 'body', effortBand: 'cruise', setupCues: ['quiet-landing'] },
  { exerciseId: 'pe-breath', section: 'cooldown', sets: 1, reps: '120 s of long exhales', workSeconds: 120, load: 'body', setupCues: ['long-exhale'] },
];

async function buildPlan() {
  for (const p of PLAN) {
    const r = await build({ action: 'add', sessionId: SID, ...p });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
  }
}

describe('save → load: a structured session round-trips through the builder routes', () => {
  it('every field the coach set comes back, in running order, with no warnings', async () => {
    await buildPlan();
    const { status, json } = await load();
    expect(status).toBe(200);
    expect(json.program.role).toBe('coach');
    const ex = session(json.program.tree).exercises;
    expect(ex.map((e) => [e.section, e.name])).toEqual([
      ['prep', '90/90 hip switch'], ['prime', 'Pogo hops'], ['key', 'Trap-bar deadlift'], ['assist', 'Split squat'], ['assist', 'Half-kneeling row'],
      ['finish', 'Suitcase carry'], ['cooldown', 'Crocodile breathing'],
    ]);
    for (const sent of PLAN) {
      const got = ex.find((e) => e.exerciseId === sent.exerciseId)!;
      const { exerciseId: _x, ...fields } = sent;
      expect(got, sent.exerciseId).toMatchObject(fields);
    }
    // the defaults filled in where the coach sent nothing
    const carry = ex.find((e) => e.exerciseId === 'pe-carry')!;
    expect(carry).toMatchObject({ reps: '30 s', workSeconds: 30, holdSeconds: null, isKeySet: false, supersetGroup: null, effortBand: null, tempo: '3-1-1-0', restSeconds: 90 });
    expect(ex.filter((e) => e.isKeySet).map((e) => e.name)).toEqual(['Trap-bar deadlift']);
    expect(json.warnings).toEqual({});
  });

  it('the builder\'s draft of each loaded exercise saves back unchanged (a no-op edit is a no-op)', async () => {
    await buildPlan();
    const before = session((await load()).json.program.tree).exercises;
    for (const e of before) {
      const r = await build({ action: 'update', sessionExerciseId: e.id, ...bodyFromDraft(draftFromExercise(e)) });
      expect(r.status, `${e.name}: ${JSON.stringify(r.json)}`).toBe(200);
    }
    const after = session((await load()).json.program.tree).exercises;
    expect(after).toEqual(before);
  });

  it('the client loads the same tree (no builder warnings); a stranger gets 404; signed out gets 401', async () => {
    await buildPlan();
    const coach = await load();
    const client = await load('client-1');
    expect(client.status).toBe(200);
    expect(client.json.program.role).toBe('client');
    expect(client.json.program.tree).toEqual(coach.json.program.tree);
    expect((await load('someone-else')).status).toBe(404);
    h.user = null;
    expect((await programGET(req(`/api/coach/programs/${PID}`), ctx(PID))).status).toBe(401);
  });

  it('the load names the builder\'s warnings per session', async () => {
    await build({ action: 'add', sessionId: SID, exerciseId: 'pe-split', section: 'assist', supersetGroup: 'B' });
    const { json } = await load();
    expect(json.warnings).toEqual({ [SID]: [{ kind: 'superset_alone', group: 'B' }] });
  });
});

describe('the builder route\'s rules', () => {
  it('one key set per session: marking a second clears the first', async () => {
    await build({ action: 'add', sessionId: SID, exerciseId: 'pe-tbdl', isKeySet: true });
    const r = await build({ action: 'add', sessionId: SID, exerciseId: 'pe-split', isKeySet: true });
    const ex = session(r.json.tree as ProgramTree).exercises;
    expect(ex.filter((e) => e.isKeySet).map((e) => e.exerciseId)).toEqual(['pe-split']);
    const first = ex.find((e) => e.exerciseId === 'pe-tbdl')!;
    const back = await build({ action: 'update', sessionExerciseId: first.id, isKeySet: true });
    expect(session(back.json.tree as ProgramTree).exercises.filter((e) => e.isKeySet).map((e) => e.exerciseId)).toEqual(['pe-tbdl']);
    // the other session is untouched
    const other = h.store.session[1].id;
    await build({ action: 'add', sessionId: other, exerciseId: 'pe-row', isKeySet: true });
    expect(h.store.se.filter((e) => e.isKeySet).length).toBe(2);
  });

  it('an update changes only what it sends', async () => {
    await buildPlan();
    const key = h.store.se.find((e) => e.exerciseId === 'pe-tbdl')!;
    const before = rx(session((await load()).json.program.tree).exercises.find((e) => e.id === key.id)!);
    const r = await build({ action: 'update', sessionExerciseId: key.id, sets: 5 });
    expect(r.status).toBe(200);
    expect(rx(session(r.json.tree as ProgramTree).exercises.find((e) => e.id === key.id)!)).toEqual({ ...before, sets: 5 });
  });

  it('moving the key set out of Key clears its flag; moves stay inside a section', async () => {
    await buildPlan();
    const key = h.store.se.find((e) => e.exerciseId === 'pe-tbdl')!;
    const r = await build({ action: 'update', sessionExerciseId: key.id, section: 'assist' });
    expect(session(r.json.tree as ProgramTree).exercises.find((e) => e.id === key.id)).toMatchObject({ section: 'assist', isKeySet: false });

    const row = h.store.se.find((e) => e.exerciseId === 'pe-row')!;
    const up = await build({ action: 'move', sessionExerciseId: row.id, direction: 'up' });
    const assist = session(up.json.tree as ProgramTree).exercises.filter((e) => e.section === 'assist').map((e) => e.exerciseId);
    expect(assist.indexOf('pe-row')).toBeLessThan(assist.indexOf('pe-split'));
    const flow = h.store.se.find((e) => e.exerciseId === 'pe-flow')!;
    const before = JSON.stringify(h.store.se);
    expect((await build({ action: 'move', sessionExerciseId: flow.id, direction: 'up' })).status).toBe(200);   // already first
    expect(JSON.stringify(h.store.se)).toBe(before);
    expect((await build({ action: 'move', sessionExerciseId: flow.id, direction: 'sideways' })).json).toEqual({ error: 'direction_required' });
  });

  it('refuses a bad structure value with the field\'s own error and writes nothing', async () => {
    for (const [body, error] of [
      [{ section: 'warmup' }, 'section_unknown'], [{ section: 'prep', isKeySet: true }, 'key_set_outside_key'], [{ supersetGroup: 'AB' }, 'superset_group_format'],
      [{ workSeconds: 0 }, 'work_seconds_range'], [{ holdSeconds: 9000 }, 'hold_seconds_range'], [{ setupCues: ['Chest up!'] }, 'setup_cue_unknown'],
      [{ setupCues: ['tripod-down', 'wall-behind', 'light-punch', 'floor-away'] }, 'setup_cues_too_many'], [{ effortBand: 'max' }, 'effort_band_unknown'],
    ] as [Row, string][]) {
      const r = await build({ action: 'add', sessionId: SID, exerciseId: 'pe-tbdl', ...body });
      expect([r.status, r.json.error]).toEqual([400, error]);
    }
    expect(h.store.se).toEqual([]);
  });

  it('prescribes only the coach\'s own catalogue (another coach\'s private row reads as not found)', async () => {
    const r = await build({ action: 'add', sessionId: SID, exerciseId: 'pe-theirs' });
    expect([r.status, r.json.error]).toEqual([404, 'exercise_not_found']);
    await build({ action: 'add', sessionId: SID, exerciseId: 'pe-tbdl' });
    const mine = h.store.se[0];
    const swap = await build({ action: 'update', sessionExerciseId: mine.id, exerciseId: 'pe-theirs' });
    expect([swap.status, swap.json.error]).toEqual([404, 'exercise_not_found']);
    expect(h.store.se[0].exerciseId).toBe('pe-tbdl');
    // and only the program's own coach may build it
    expect((await build({ action: 'add', sessionId: SID, exerciseId: 'pe-theirs' }, 'coach-2')).status).toBe(403);
  });

  it('removing an exercise the client already logged says so (409) instead of a 500, and keeps it', async () => {
    await build({ action: 'add', sessionId: SID, exerciseId: 'pe-tbdl' });
    await build({ action: 'add', sessionId: SID, exerciseId: 'pe-row' });
    const [logged, fresh] = h.store.se;
    h.store.log.push({ id: 'log-1', sessionExerciseId: logged.id, setLogs: [{ id: 'set-1' }] });
    expect(await build({ action: 'remove', sessionExerciseId: logged.id })).toEqual({ status: 409, json: { error: 'exercise_logged' } });
    expect(h.store.se.map((e) => e.id)).toContain(logged.id);
    expect((await build({ action: 'remove', sessionExerciseId: fresh.id })).status).toBe(200);
    expect(h.store.se.map((e) => e.id)).toEqual([logged.id]);
  });

  // MIRROR-COACH P2 review (2026-09-26): Today's Save wrote an EMPTY ExerciseLog for every untouched exercise, and the
  // builder then refused to remove it ("Your athlete has already logged this one"). An empty row no longer holds it.
  it('an EMPTY log (the old untouched-exercise row) does not block removal: the row is cleared and the exercise goes', async () => {
    await build({ action: 'add', sessionId: SID, exerciseId: 'pe-tbdl' });
    const [se] = h.store.se;
    h.store.log.push({ id: 'log-empty', sessionExerciseId: se.id, actualSets: null, actualReps: null, actualLoad: null, rpe: null, clientNote: null, videoUrl: null });
    expect((await build({ action: 'remove', sessionExerciseId: se.id })).status).toBe(200);
    expect([h.store.se.length, h.store.log.length]).toEqual([0, 0]);
  });

  it('each kind of content keeps it: a typed number, a note, a video, the coach\'s comment', async () => {
    for (const content of [{ actualReps: '8,8' }, { clientNote: 'felt good' }, { videoUrl: 'https://v.test/1' }, { coachComment: 'Nice depth' }, { rpe: 7 }]) {
      h.store = newBuilderStore();
      h.store.fac = [{ userId: 'coach-1', certificationStatus: 'certified' }];
      h.store.pe = [{ id: 'pe-tbdl', coachId: 'coach-1', name: 'Trap-bar deadlift', category: 'lower-body' }];
      const p = createProgram(h.store, { coachId: 'coach-1', clientId: 'client-1', name: 'B', blocks: { create: [{ order: 1, label: 'W1', sessions: { create: [{ order: 1, label: 'D1' }] } }] } });
      await build({ action: 'add', sessionId: h.store.session[0].id, exerciseId: 'pe-tbdl' }, 'coach-1', p.id);
      h.store.log.push({ id: 'log-x', sessionExerciseId: h.store.se[0].id, ...content });
      expect((await build({ action: 'remove', sessionExerciseId: h.store.se[0].id }, 'coach-1', p.id)).json, JSON.stringify(content)).toEqual({ error: 'exercise_logged' });
    }
  });
});

describe('duplicate carries the structure', () => {
  it('a copied program arrives with its sections, key set, supersets, timers, cues and bands', async () => {
    await buildPlan();
    h.user = 'coach-1';
    const res = await duplicatePOST(req('/api/coach/programs/duplicate', { programId: PID, clientIds: ['client-2'], startDate: '2026-10-05T00:00:00.000Z' }));
    expect(res.status).toBe(201);
    const { created } = await res.json() as { created: { clientId: string; programId: string }[] };
    const src = session((await load()).json.program.tree).exercises.map(rx);
    const copy = (await load('coach-1', created[0].programId)).json.program.tree;
    expect(copy.clientId).toBe('client-2');
    expect(copy.blocks[0].sessions[0].exercises.map(rx)).toEqual(src);
  });
});

describe('the stand-in database is as strict as the real one where it matters', () => {
  it('refuses a SessionExercise column the schema does not have, and knows every one it does', async () => {
    const { builderMemoryDb, SESSION_EXERCISE_DEFAULTS, SESSION_EXERCISE_WRITABLE } = await import('./builderMemoryDb');
    const db = builderMemoryDb(h.store);
    await expect(db.sessionExercise.create({ data: { sessionId: SID, exerciseId: 'pe-tbdl', order: 1, intensity: 'high' } })).rejects.toThrow(/Unknown argument `intensity`/);
    // every defaulted column the stand-in fills is a real, writable column
    for (const k of Object.keys(SESSION_EXERCISE_DEFAULTS)) expect(SESSION_EXERCISE_WRITABLE.has(k), k).toBe(true);
  });
});

// MIRROR-COACH P2 review (2026-09-26), owner decisions #6 and #20: Full throttle is adults-only, and a blank birth year is
// youth rules. P2 recorded the rule and deferred the gate to P5, while the band already reached the client's Today.
describe('the youth gate on adults-only bands', () => {
  it('Full throttle is refused for a client with no birth year or under 18, and allowed for an adult', async () => {
    const ok = async () => (await build({ action: 'add', sessionId: SID, exerciseId: 'pe-tbdl', effortBand: 'full' }));
    expect(await ok()).toEqual({ status: 400, json: { error: 'effort_band_adults_only' } });           // no birth year
    h.store.user = [{ id: 'client-1', dobYear: new Date().getFullYear() - 15 }];
    expect((await ok()).json).toEqual({ error: 'effort_band_adults_only' });                            // 15
    h.store.user = [{ id: 'client-1', dobYear: new Date().getFullYear() - 18 }];
    expect((await ok()).json).toEqual({ error: 'effort_band_adults_only' });                            // may still be 17
    h.store.user = [{ id: 'client-1', dobYear: 1990 }];
    expect((await ok()).status).toBe(200);
    // every youth-allowed band is fine for a youth client
    h.store.user = [];
    for (const b of ['idle', 'cruise', 'drive', 'surge']) expect((await build({ action: 'add', sessionId: SID, exerciseId: 'pe-row', effortBand: b })).status, b).toBe(200);
  });

  it('an edit to Full throttle is refused for a youth client; an edit that leaves a saved band alone is not', async () => {
    await build({ action: 'add', sessionId: SID, exerciseId: 'pe-tbdl', effortBand: 'surge' });
    const id = h.store.se[0].id;
    expect((await build({ action: 'update', sessionExerciseId: id, effortBand: 'full' })).json).toEqual({ error: 'effort_band_adults_only' });
    // a row saved with Full throttle before the gate: other edits still save (Today drops the band for a youth client)
    h.store.se[0].effortBand = 'full';
    expect((await build({ action: 'update', sessionExerciseId: id, sets: 4 })).status).toBe(200);
  });
});
