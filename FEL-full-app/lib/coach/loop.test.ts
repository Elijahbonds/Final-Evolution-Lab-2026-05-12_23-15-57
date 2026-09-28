import { describe, expect, it } from 'vitest';
import { accessRole, leadingNumber, mergeSpecUpdate, needsReview, nextSession, orderedSessions, progressSeries, specInputFromRow, validateExerciseSpec, validateLog, validateMessage, type CleanExerciseSpec, type ProgramTree } from './loop';
import { STRUCTURE_DEFAULTS } from './structure';

const tree: ProgramTree = {
  id: 'p1', name: 'Vertical block', coachId: 'coach', clientId: 'client',
  blocks: [
    { id: 'b2', order: 2, label: 'Week 2', targetDate: null, sessions: [{ id: 's3', order: 1, label: 'Day 1', exercises: [] }] },
    { id: 'b1', order: 1, label: 'Week 1', targetDate: null, sessions: [
      { id: 's2', order: 2, label: 'Day 2', exercises: [] }, { id: 's1', order: 1, label: 'Day 1', exercises: [] },
    ] },
  ],
};

describe('the coaching loop — order, today, roles', () => {
  it('orders sessions by block then session regardless of input order', () => {
    expect(orderedSessions(tree).map((x) => x.session.id)).toEqual(['s1', 's2', 's3']);
  });
  it('today is the first session not completed; null when the program is done', () => {
    expect(nextSession(tree, [])?.session.id).toBe('s1');
    expect(nextSession(tree, ['s1'])?.session.id).toBe('s2');
    expect(nextSession(tree, ['s1', 's2'])).toMatchObject({ index: 2, total: 3 });
    expect(nextSession(tree, ['s1', 's2', 's3'])).toBeNull();
  });
  it('knows the coach from the client from a stranger', () => {
    expect(accessRole(tree, 'coach')).toBe('coach'); expect(accessRole(tree, 'client')).toBe('client'); expect(accessRole(tree, 'x')).toBeNull();
  });
});

describe('logs and prescriptions are clamped, never trusted', () => {
  it('a log needs its exercise and clamps sets/RPE, keeps notes short, accepts only http(s) video', () => {
    expect(validateLog({})).toEqual({ ok: false, error: 'session_exercise_required' });
    const r = validateLog({ sessionExerciseId: 'se1', actualSets: 99, actualReps: '8,9,10', actualLoad: '225 lbs', rpe: '12', clientNote: 'x'.repeat(600), videoUrl: 'javascript:alert(1)' });
    expect(r.ok && r.log).toMatchObject({ actualSets: 20, rpe: 10, actualLoad: '225 lbs', videoUrl: null });
    expect(r.ok && r.log.clientNote?.length).toBe(500);
    expect(validateLog({ sessionExerciseId: 'se1', videoUrl: 'https://fel.local/v/1.mp4' })).toMatchObject({ ok: true, log: { videoUrl: 'https://fel.local/v/1.mp4', actualSets: null } });
  });
  it('a prescription needs its exercise, defaults sensibly and checks the tempo format', () => {
    expect(validateExerciseSpec({})).toEqual({ ok: false, error: 'exercise_required' });
    // MIRROR-COACH P2: the structure fields ride along at their schema defaults when nothing is sent
    expect(validateExerciseSpec({ exerciseId: 'e1' })).toEqual({ ok: true, spec: { exerciseId: 'e1', sets: 3, reps: '8-10', load: 'RPE7', tempo: '3-1-1-0', restSeconds: 90, coachNote: null, ...STRUCTURE_DEFAULTS } });
    expect(validateExerciseSpec({ exerciseId: 'e1', tempo: 'slow' })).toEqual({ ok: false, error: 'tempo_format' });
    expect(validateExerciseSpec({ exerciseId: 'e1', sets: 0, restSeconds: 9999 })).toMatchObject({ ok: true, spec: { sets: 1, restSeconds: 600 } });
  });
  it('a prescription carries its structure, refuses a bad structure value, and gives a timed dose its seconds as reps', () => {
    const r = validateExerciseSpec({ exerciseId: 'e1', section: 'finish', supersetGroup: 'b', workSeconds: 40, holdSeconds: 5, setupCues: ['crush-handle'], effortBand: 'drive' });
    expect(r).toMatchObject({ ok: true, spec: { section: 'finish', isKeySet: false, supersetGroup: 'B', workSeconds: 40, holdSeconds: 5, setupCues: ['crush-handle'], effortBand: 'drive', reps: '40 s' } });
    expect(validateExerciseSpec({ exerciseId: 'e1', workSeconds: 40, reps: '40 s each side' })).toMatchObject({ ok: true, spec: { reps: '40 s each side' } });
    // a reps text that does not state the timer's seconds is replaced, so no reader shows "3×8-10" for a 40 s carry
    expect(validateExerciseSpec({ exerciseId: 'e1', workSeconds: 40, reps: '8-10' })).toMatchObject({ ok: true, spec: { reps: '40 s' } });
    // FLIPPED IN THE P2 REVIEW (2026-09-26): the text after the seconds survives a new timer ("each side" is half the
    // work per set if it is lost); only the seconds are re-stated
    expect(validateExerciseSpec({ exerciseId: 'e1', workSeconds: 40, reps: '30 s each side' })).toMatchObject({ ok: true, spec: { reps: '40 s each side' } });
    expect(validateExerciseSpec({ exerciseId: 'e1', workSeconds: 40, reps: '30s per arm' })).toMatchObject({ ok: true, spec: { reps: '40 s per arm' } });
    // a load the coach cleared is no load; one never sent is still the schema's default
    expect(validateExerciseSpec({ exerciseId: 'e1', load: '' })).toMatchObject({ ok: true, spec: { load: '' } });
    expect(validateExerciseSpec({ exerciseId: 'e1', load: null })).toMatchObject({ ok: true, spec: { load: '' } });
    expect(validateExerciseSpec({ exerciseId: 'e1' })).toMatchObject({ ok: true, spec: { load: 'RPE7' } });
    expect(validateExerciseSpec({ exerciseId: 'e1', section: 'warmup' })).toEqual({ ok: false, error: 'section_unknown' });
    expect(validateExerciseSpec({ exerciseId: 'e1', section: 'prep', isKeySet: true })).toEqual({ ok: false, error: 'key_set_outside_key' });
    expect(validateExerciseSpec({ exerciseId: 'e1', effortBand: 'max' })).toEqual({ ok: false, error: 'effort_band_unknown' });
  });
  it('an edit changes only what it sends (it used to reset every field it left out to the default)', () => {
    const row: CleanExerciseSpec = { exerciseId: 'e1', sets: 4, reps: '5', load: '100kg', tempo: '2-0-1-0', restSeconds: 150, coachNote: 'Own the bottom.',
      section: 'key', isKeySet: true, supersetGroup: null, workSeconds: null, holdSeconds: 2, setupCues: ['wall-behind'], effortBand: 'surge' };
    expect(validateExerciseSpec(specInputFromRow(row))).toEqual({ ok: true, spec: row });
    const v = validateExerciseSpec(mergeSpecUpdate(row, { action: 'update', sessionExerciseId: 'se1', sets: 5 }));
    expect(v).toEqual({ ok: true, spec: { ...row, sets: 5 } });
    // the old behaviour, for the record: the body alone loses the reps, load, tempo, rest, note and all structure
    expect(validateExerciseSpec({ exerciseId: 'e1', sets: 5 })).toMatchObject({ ok: true, spec: { reps: '8-10', load: 'RPE7', coachNote: null, isKeySet: false } });
  });
  it('an edit that moves the key set out of Key clears the flag; turning a timer on or off re-derives untyped reps', () => {
    const row: CleanExerciseSpec = { exerciseId: 'e1', sets: 3, reps: '8', load: 'RPE7', tempo: '3-1-1-0', restSeconds: 90, coachNote: null, ...STRUCTURE_DEFAULTS, isKeySet: true };
    expect(validateExerciseSpec(mergeSpecUpdate(row, { section: 'assist' }))).toMatchObject({ ok: true, spec: { section: 'assist', isKeySet: false } });
    expect(validateExerciseSpec(mergeSpecUpdate(row, { section: 'assist', isKeySet: true }))).toEqual({ ok: false, error: 'key_set_outside_key' });
    const timed = validateExerciseSpec(mergeSpecUpdate(row, { workSeconds: 45 }));
    expect(timed).toMatchObject({ ok: true, spec: { workSeconds: 45, reps: '45 s' } });
    const back = validateExerciseSpec(mergeSpecUpdate({ ...row, workSeconds: 45, reps: '45 s' }, { workSeconds: null }));
    expect(back).toMatchObject({ ok: true, spec: { workSeconds: null, reps: '8-10' } });
    // a coach's own reps text on a timed row is theirs: turning the timer off keeps it
    expect(validateExerciseSpec(mergeSpecUpdate({ ...row, workSeconds: 30, reps: '30 s each side' }, { workSeconds: null }))).toMatchObject({ ok: true, spec: { reps: '30 s each side' } });
  });
  it('messages are trimmed and bounded', () => {
    expect(validateMessage('  hi ')).toBe('hi'); expect(validateMessage('')).toBeNull(); expect(validateMessage('a'.repeat(3000))?.length).toBe(2000);
  });
});

describe('progress and review', () => {
  it('reads the leading number of a load or reps string', () => {
    expect(leadingNumber('225 lbs')).toBe(225); expect(leadingNumber('8-10')).toBe(8); expect(leadingNumber('RPE7')).toBeNull(); expect(leadingNumber(null)).toBeNull();
  });
  it('builds a per-exercise series from completed logs only, oldest first', () => {
    const s = progressSeries([
      { exerciseName: 'Squat', completedAt: '2026-09-06T10:00:00Z', actualLoad: '225', actualReps: '5', rpe: 8 },
      { exerciseName: 'Squat', completedAt: '2026-09-01T10:00:00Z', actualLoad: '205', actualReps: '5', rpe: 7 },
      { exerciseName: 'Squat', completedAt: null, actualLoad: '999', actualReps: '1', rpe: 10 },
    ]);
    expect(s.Squat.map((p) => p.load)).toEqual([205, 225]);
  });
  it('counts completed sessions with an uncommented log', () => {
    expect(needsReview([
      { completedAt: '2026-09-06', logs: [{ coachComment: 'nice' }, { coachComment: null }] },
      { completedAt: '2026-09-06', logs: [{ coachComment: 'ok' }] },
      { completedAt: null, logs: [{ coachComment: null }] },
    ])).toBe(1);
  });
});
