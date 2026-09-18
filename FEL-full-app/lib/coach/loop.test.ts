import { describe, expect, it } from 'vitest';
import { accessRole, leadingNumber, needsReview, nextSession, orderedSessions, progressSeries, validateExerciseSpec, validateLog, validateMessage, type ProgramTree } from './loop';

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
    expect(validateExerciseSpec({ exerciseId: 'e1' })).toEqual({ ok: true, spec: { exerciseId: 'e1', sets: 3, reps: '8-10', load: 'RPE7', tempo: '3-1-1-0', restSeconds: 90, coachNote: null } });
    expect(validateExerciseSpec({ exerciseId: 'e1', tempo: 'slow' })).toEqual({ ok: false, error: 'tempo_format' });
    expect(validateExerciseSpec({ exerciseId: 'e1', sets: 0, restSeconds: 9999 })).toMatchObject({ ok: true, spec: { sets: 1, restSeconds: 600 } });
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
