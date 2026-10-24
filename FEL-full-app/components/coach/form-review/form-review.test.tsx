// COACH-VIDEO-REVIEW (2026-10-24): the form-review pieces, server-rendered (the interactive flow is measured on the
// esbuild + Playwright rig: scripts/probes/_coach-form-review-probe.mts).
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FilmSetLink } from './film-set-link';
import { PoseReplay, faultJoints } from './pose-replay';
import { reviewCountLine } from './review-count';
import { RecordSet, submissionBody } from './record-set';
import { FormReviewQueue } from './review-queue';
import { buildSubmission } from '@/lib/coach/formReview/payload';
import { readSet } from '@/lib/coach/formReview/reader';
import { flagsFor, scoreReps } from '@/lib/coach/formReview/score';
import { chain } from '@/tests/helpers/formReviewSets';

const ex = (name: string, pattern: string | null) => ({ id: 'slot1', name, coaching: { pattern: pattern ? { id: pattern } : null } });

describe('the Today link', () => {
  it('shows on an exercise the camera can read, to this slot', () => {
    const html = renderToStaticMarkup(createElement(FilmSetLink, { exercise: ex('Goblet squat', 'squat') }));
    expect(html).toContain('href="/coach/form-review?slot=slot1"');
    expect(html).toContain('data-film-set="squat"');
  });
  it('is absent on one it cannot (a bench press, a carry)', () => {
    expect(renderToStaticMarkup(createElement(FilmSetLink, { exercise: ex('Bench press', 'push') }))).toBe('');
    expect(renderToStaticMarkup(createElement(FilmSetLink, { exercise: ex('Farmer carry', 'carry') }))).toBe('');
  });
});

describe('the replay', () => {
  it('rings the knee on its side, both knees for both, the heels for a heel lift', () => {
    expect(faultJoints('kneeValgus', 'left')).toEqual([23, 25, 27]);
    expect(faultJoints('kneeValgus', 'both')).toEqual([23, 25, 27, 24, 26, 28]);
    expect(faultJoints('heelRise', null)).toEqual([29, 30]);
  });
  it('says so when no track was kept, and never pretends a video exists', () => {
    const html = renderToStaticMarkup(createElement(PoseReplay, { tracks: [], aspect: 1, rep: { n: 4, label: 'Rep 4', fault: null, side: null } }));
    expect(html).toContain('data-replay-missing');
    const frames = chain(['squat_clean', 'squat_knee_in_left']);
    const reps = scoreReps('squat', readSet('squat', frames));
    const sub = buildSubmission({ programId: 'p', sessionExerciseId: null, movement: 'squat', aspect: 4 / 3, frames, reps, flags: flagsFor('squat', reps) });
    const shown = renderToStaticMarkup(createElement(PoseReplay, { tracks: sub.tracks, aspect: sub.aspect, rep: { n: 2, label: 'Rep 2 (flagged)', fault: 'kneeValgus', side: 'left' }, best: { n: 1, label: 'Rep 1 (best)', fault: null, side: null } }));
    expect(shown.match(/<canvas/g)).toHaveLength(2);
    expect(shown).toContain('no video was sent');
    expect(shown).not.toContain('<video');
  });
});

describe('the record screen and the queue, first paint', () => {
  it('the record screen opens on the setup line and the camera button, nothing sent yet', () => {
    const html = renderToStaticMarkup(createElement(RecordSet, { ctx: { programId: 'p1', sessionExerciseId: 's1', exerciseName: 'Goblet squat', movement: 'squat', ready: true, send: { ok: true } } }));
    expect(html).toContain('Goblet squat');
    expect(html).toContain('data-record-start');
    expect(html).toContain('Nothing is recorded to a file');
    expect(html).not.toContain('<video');
  });
  it('the body the page posts is the JSON of the pose-only submission, nothing else', () => {
    const frames = chain(['squat_clean']);
    const reps = scoreReps('squat', readSet('squat', frames));
    const sub = buildSubmission({ programId: 'p', sessionExerciseId: null, movement: 'squat', aspect: 1, frames, reps, flags: [] });
    expect(JSON.parse(submissionBody(sub))).toEqual(sub);
  });
  it('the queue renders nothing until its data arrives (it never blocks the Clients tab)', () => {
    expect(renderToStaticMarkup(createElement(FormReviewQueue, {}))).toBe('');
  });
  it('the attention board line', () => {
    expect(reviewCountLine(1)).toBe('1 filmed set to review — the flagged rep first');
    expect(reviewCountLine(3)).toBe('3 filmed sets to review — the flagged rep first');
  });
});
