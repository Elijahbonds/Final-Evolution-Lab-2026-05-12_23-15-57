// CUE-REWRITE (2026-10-27) — test changed: copy rewrite. The flag lines use the canonical fault names now
// (lib/cue-style/names.ts: "Left knee caves in", "Back bends"); every assertion checks what it checked before.
// COACH-VIDEO-REVIEW (2026-10-24): the routes' logic behind every gate, on an in-memory database
// (tests/helpers/fakeFormReviewDb.ts answers the store's statements by name).
import { beforeEach, describe, expect, it } from 'vitest';
import { coachQueue, deleteFormReview, formReviewDetail, mySets, recordContext, replyToFormReview, submitFormReview, type FormReviewDb } from './server';
import { buildSubmission, type FormReviewSubmission } from './payload';
import { readSet } from './reader';
import { flagsFor, scoreReps } from './score';
import { resetFormReviewProbe, TRACKS_KEEP_DAYS } from './store';
import { cueFor } from './movements';
import { chain } from '@/tests/helpers/formReviewSets';
import { fakeDb, fakeWorld, type FakeWorld } from '@/tests/helpers/fakeFormReviewDb';

const frames = chain(['squat_clean', 'squat_knee_in_left', 'squat_clean', 'squat_clean']);
const reps = scoreReps('squat', readSet('squat', frames));
const SUB: FormReviewSubmission = buildSubmission({ programId: 'p1', sessionExerciseId: 's1', movement: 'squat', aspect: 4 / 3, frames, reps, flags: flagsFor('squat', reps) });
const body = (over: Partial<FormReviewSubmission> = {}) => JSON.parse(JSON.stringify({ ...SUB, ...over }));
const bytes = (b: unknown) => JSON.stringify(b).length;

let w: FakeWorld;
let db: FormReviewDb;
beforeEach(() => {
  resetFormReviewProbe();
  w = fakeWorld();
  db = fakeDb(w) as unknown as FormReviewDb;
});
const send = (userId: string, b: unknown = body(), canSave = true) => submitFormReview(db, userId, b, bytes(b), canSave);

describe('the client sends a set', () => {
  it('an opted-in adult on the live roster: stored, with the SERVER\'s scores and flags and only the kept tracks', async () => {
    // the client claims a clean set; the server recomputes from the faults it was sent
    const r = await send('adult');
    expect(r.status).toBe(200);
    expect(r.body.flags).toEqual([expect.objectContaining({ rep: 2, reason: 'Left knee caves in on rep 2', worst: true })]);
    expect(w.rows).toHaveLength(1);
    const row = w.rows[0];
    expect(row).toMatchObject({ clientId: 'adult', coachId: 'coach', programId: 'p1', sessionExerciseId: 's1', exerciseName: 'Goblet squat', movement: 'squat', band: 'adult', reps: 4, flagCount: 1, status: 'unreviewed' });
    expect((row.tracks as { rep: number }[]).map((t) => t.rep).sort()).toEqual([1, 2]);
    expect(+row.tracksDeleteAt - +w.now).toBeGreaterThanOrEqual(TRACKS_KEEP_DAYS * 86_400_000 - 1000);
    expect(JSON.stringify(row)).not.toMatch(/video|image|data:/i);
  });

  it('a body carrying anything but pose data is refused before anything is read or written', async () => {
    const r = await send('adult', { ...body(), video: 'data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAHTEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHGTbuMU6uEEelDZ1OsggEXTbuMU6uEHFO7a1OsggG97AEAAAAAAABZAEAAAAAAAAAA' });
    expect(r).toEqual({ status: 400, body: { error: 'unexpected_field' } });
    expect(w.rows).toHaveLength(0);
  });

  it('an adult who has not opted in to saving movement numbers: 403 with where to turn it on; nothing written', async () => {
    const r = await send('adult', body(), false);
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: 'scan_save_opt_in', href: '/account' });
    expect(w.rows).toHaveLength(0);
  });

  it('a link the coach ended: 403 not_on_roster', async () => {
    w.links = [{ coachId: 'coach', clientId: 'adult', endedAt: new Date() }];
    expect((await send('adult')).body).toMatchObject({ error: 'not_on_roster' });
  });

  it('a 15-year-old: refused — no consent covers coach training today, and the teen path is off even with one', async () => {
    const b = body({ programId: 'p2', sessionExerciseId: 's4' });
    expect((await send('teen', b, false)).body).toMatchObject({ error: 'guardian_consent_required' });
    expect(w.rows).toHaveLength(0);
  });

  it('another athlete\'s program, a slot from another program, or a slot the camera cannot read', async () => {
    expect((await send('teen')).status).toBe(404);                                                   // p1 is adult's
    expect((await send('adult', body({ sessionExerciseId: 's3' }))).status).toBe(404);               // s3 is in p3
    expect((await send('adult', body({ sessionExerciseId: 's2' }))).body).toEqual({ error: 'movement_mismatch' });  // a bench press
  });

  it('before the pending SQL is applied: 503 form_review_not_ready, nothing 500s', async () => {
    w.tableReady = false;
    expect(await send('adult')).toEqual({ status: 503, body: { error: 'form_review_not_ready' } });
  });
});

describe('the coach\'s queue', () => {
  async function seed() {
    await send('adult');
    w.now = new Date(+w.now + 60_000);
    const clean = chain(['squat_clean', 'squat_clean']);
    const cr = scoreReps('squat', readSet('squat', clean));
    const b = JSON.parse(JSON.stringify(buildSubmission({ programId: 'p1', sessionExerciseId: 's1', movement: 'squat', aspect: 1, frames: clean, reps: cr, flags: [] })));
    await send('adult', b);
  }

  it('flagged first among the unreviewed, each with its worst flag, score and the trend for that movement', async () => {
    await seed();
    const r = await coachQueue(db, 'coach', +w.now);
    expect(r.body.available).toBe(true);
    expect(r.body.unreviewed).toBe(2);
    const items = r.body.items as { flags: { reason: string }[]; clientName: string; setScore: number; trend: { line: string } }[];
    expect(items[0].flags[0].reason).toBe('Left knee caves in on rep 2');
    expect(items[0].clientName).toBe('Ana');
    expect(items[0].trend.line).toBe('First reviewed set of this movement.');
    expect(items[1].flags).toEqual([]);
    expect(items[1].trend.line).toBe('Up 9 on the last set.');
  });

  it('a client whose link ended drops out of the coach\'s queue (the client keeps the set)', async () => {
    await seed();
    w.links = w.links.map((l) => (l.clientId === 'adult' ? { ...l, endedAt: new Date() } : l));
    expect((await coachQueue(db, 'coach')).body).toMatchObject({ items: [], unreviewed: 0 });
    expect(((await mySets(db, 'adult')).body.items as unknown[]).length).toBe(2);
  });

  it('another coach sees nothing; before the SQL, available:false', async () => {
    await seed();
    expect((await coachQueue(db, 'other')).body.items).toEqual([]);
    resetFormReviewProbe(); w.tableReady = false;
    expect((await coachQueue(db, 'coach')).body).toEqual({ available: false, items: [], unreviewed: 0 });
  });

  it('keypoint tracks are dropped once their retention date passes; the numbers stay', async () => {
    await send('adult');
    const later = +w.now + (TRACKS_KEEP_DAYS + 1) * 86_400_000;
    await coachQueue(db, 'coach', later);
    expect(w.rows[0].tracks).toBeNull();
    expect(w.rows[0].setScore).not.toBeNull();
  });
});

describe('one set, and the reply', () => {
  let id: string;
  beforeEach(async () => { id = String((await send('adult')).body.id); });

  it('its coach gets the tracks and the presets; its client the tracks only; anyone else 404', async () => {
    const coach = await formReviewDetail(db, 'coach', id);
    expect(coach.status).toBe(200);
    expect((coach.body.review as { tracks: unknown[] }).tracks).toHaveLength(2);
    expect((coach.body.presets as { id: string }[])[0].id).toBe('fault:kneeValgus:cue');
    expect((await formReviewDetail(db, 'adult', id)).body.presets).toEqual([]);
    expect((await formReviewDetail(db, 'teen', id)).status).toBe(404);
    expect((await formReviewDetail(db, 'other', id)).status).toBe(404);
  });

  it('a preset cue and a note go to the program\'s thread, and the set is reviewed — once', async () => {
    const r = await replyToFormReview(db, 'coach', id, { cueId: 'fault:kneeValgus:cue', note: 'Lighter bell.', rep: 2 });
    expect(r.status).toBe(200);
    expect(w.messages).toEqual([expect.objectContaining({ programId: 'p1', authorId: 'coach', body: `Form review · Goblet squat, rep 2 (Left knee caves in)\nCue: ${cueFor('squat', 'kneeValgus')!.cue}\nLighter bell.` })]);
    expect(w.rows[0]).toMatchObject({ status: 'reviewed', replyMessageId: w.messages[0].id });
    expect((await replyToFormReview(db, 'coach', id, { note: 'again' })).status).toBe(409);
    expect(w.messages).toHaveLength(1);
  });

  it('a cue not offered for this set, or nothing at all, is refused', async () => {
    expect((await replyToFormReview(db, 'coach', id, { cueId: 'fault:heelRise:cue' })).body).toEqual({ error: 'bad_cue' });
    expect((await replyToFormReview(db, 'coach', id, { note: '   ' })).body).toEqual({ error: 'reply_required' });
    expect(w.rows[0].status).toBe('unreviewed');
  });

  it('mark reviewed with no message', async () => {
    expect((await replyToFormReview(db, 'coach', id, { markOnly: true })).body).toEqual({ reviewed: true, message: null });
    expect(w.messages).toEqual([]);
    expect(w.rows[0].status).toBe('reviewed');
  });

  it('a thread write that fails puts the set back in the queue', async () => {
    w.failMessage = true;
    expect((await replyToFormReview(db, 'coach', id, { note: 'hi' })).status).toBe(503);
    expect(w.rows[0].status).toBe('unreviewed');
  });

  it('only the set\'s coach replies; only its client deletes', async () => {
    expect((await replyToFormReview(db, 'other', id, { note: 'hi' })).status).toBe(404);
    expect((await deleteFormReview(db, 'coach', id)).status).toBe(404);
    expect((await deleteFormReview(db, 'adult', id)).body).toEqual({ deleted: true });
    expect(w.rows).toEqual([]);
  });
});

describe('the record page\'s context', () => {
  it('a slot names its program; the movement is the exercise\'s; the send gate is read', async () => {
    expect(await recordContext(db, 'adult', { slot: 's1' }, true)).toEqual({
      programId: 'p1', sessionExerciseId: 's1', exerciseName: 'Goblet squat', movement: 'squat', ready: true, send: { ok: true },
    });
    expect((await recordContext(db, 'adult', { slot: 's1' }, false))?.send).toMatchObject({ ok: false, error: 'scan_save_opt_in' });
  });

  it('not the athlete\'s program, a slot the camera cannot read, or a junk id: null (the page 404s)', async () => {
    expect(await recordContext(db, 'teen', { slot: 's1' }, true)).toBeNull();
    expect(await recordContext(db, 'adult', { slot: 's2' }, true)).toBeNull();
    expect(await recordContext(db, 'adult', { slot: "'; DROP TABLE" }, true)).toBeNull();
    expect((await recordContext(db, 'adult', { program: 'p1', movement: 'hinge' }, true))?.exerciseName).toBe('Hip hinge');
  });
});
