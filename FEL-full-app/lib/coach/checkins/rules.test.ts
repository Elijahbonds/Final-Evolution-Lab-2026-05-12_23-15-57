// COACH-PARITY (2026-10-26): the check-in form, checked; who is asked what; answers checked and read back over time.
import { describe, expect, it } from 'vitest';
import { answerText, cleanAnswers, cleanForm, formLine, history, isDue, periodFor, questionsFor, series, weeksAnswered } from './rules';
import type { AnswerRow, CheckinQuestion } from './types';

const ON = { healthEnabled: true };
const OFF = { healthEnabled: false };
const Q = (over: Partial<CheckinQuestion> & Pick<CheckinQuestion, 'kind' | 'prompt'>): CheckinQuestion => ({ id: 'q1', topic: 'training', ...over });

describe('cleanForm', () => {
  const base = { title: 'Weekly check-in', cadence: 'weekly', questions: [
    { kind: 'scale', prompt: 'How hard was training this week?' },
    { kind: 'yesno', prompt: 'Did you do every session?' },
    { kind: 'number', prompt: 'How many free throws did you make?', unit: 'shots' },
    { kind: 'choice', prompt: 'Best session?', choices: ['Mon', 'Wed', 'Fri'] },
    { kind: 'text', prompt: 'Anything else for me?' },
  ] };

  it('a training form passes with ids q1… and every topic training', () => {
    const r = cleanForm(base, OFF);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.form.questions.map((q) => [q.id, q.kind, q.topic])).toEqual([['q1', 'scale', 'training'], ['q2', 'yesno', 'training'], ['q3', 'number', 'training'], ['q4', 'choice', 'training'], ['q5', 'text', 'training']]);
    expect(r.form.questions[2].unit).toBe('shots');
    expect(r.form.questions[3].choices).toEqual(['Mon', 'Wed', 'Fri']);
  });

  it('an edited form keeps the ids it was given, so its answers stay lined up', () => {
    const r = cleanForm({ ...base, questions: [{ id: 'q4', kind: 'yesno', prompt: 'Did you stretch?' }, { kind: 'yesno', prompt: 'New one?' }] }, OFF);
    expect(r.ok && r.form.questions.map((q) => q.id)).toEqual(['q4', 'q2']);
  });

  it('a pain question is refused, pointing at the pain check; the pain check alone is a form', () => {
    expect(cleanForm({ ...base, questions: [{ kind: 'scale', prompt: 'Knee pain 1-10' }] }, ON)).toEqual({ ok: false, error: 'question_is_pain', at: 0 });
    const r = cleanForm({ title: 'Pain check', cadence: 'weekly', painCheck: true, questions: [] }, OFF);
    expect(r.ok && r.form).toEqual({ title: 'Pain check', cadence: 'weekly', painCheck: true, questions: [] });
  });

  it('a health question needs the switch; with it on, the words make it health even when marked training', () => {
    const sleep = { title: 'W', cadence: 'weekly', questions: [{ kind: 'scale', prompt: 'How did you sleep?', topic: 'training' }] };
    expect(cleanForm(sleep, OFF)).toEqual({ ok: false, error: 'health_off', at: 0 });
    const r = cleanForm(sleep, ON);
    expect(r.ok && r.form.questions[0].topic).toBe('health');
    const w = cleanForm({ title: 'W', cadence: 'once', questions: [{ kind: 'number', prompt: 'Body weight', unit: 'kg' }] }, ON);
    expect(w.ok && w.form.questions[0]).toMatchObject({ topic: 'health', bodyOrDiet: true, unit: 'kg' });
  });

  it.each([
    [{ ...base, title: '  ' }, 'title_required'],
    [{ ...base, cadence: 'daily' }, 'cadence'],
    [{ ...base, questions: [] }, 'no_questions'],
    [{ ...base, questions: Array.from({ length: 13 }, () => ({ kind: 'yesno', prompt: 'Done?' })) }, 'too_many_questions'],
    [{ ...base, questions: [{ kind: 'photo', prompt: 'Front photo' }] }, 'question_kind'],
    [{ ...base, questions: [{ kind: 'yesno', prompt: '' }] }, 'prompt_required'],
    [{ ...base, questions: [{ kind: 'choice', prompt: 'Pick', choices: ['One'] }] }, 'choices'],
    [{ ...base, questions: [{ kind: 'choice', prompt: 'Pick', choices: ['A', 'a'] }] }, 'choices'],
    [{ ...base, questions: [{ kind: 'number', prompt: 'Count', unit: '<b>' }] }, 'unit'],
  ])('refuses %#: %s', (body, error) => expect(cleanForm(body, ON)).toMatchObject({ ok: false, error }));

  it('formLine', () => {
    expect(formLine({ cadence: 'weekly', questions: [Q({ kind: 'yesno', prompt: 'x' })], painCheck: true })).toBe('Weekly · 1 question · pain check');
    expect(formLine({ cadence: 'once', questions: [], painCheck: false })).toBe('One-off · 0 questions');
  });
});

describe('questionsFor', () => {
  const qs: CheckinQuestion[] = [
    Q({ id: 'q1', kind: 'scale', prompt: 'Effort' }), Q({ id: 'q2', kind: 'text', prompt: 'Notes' }),
    Q({ id: 'q3', kind: 'scale', prompt: 'Sleep', topic: 'health' }), Q({ id: 'q4', kind: 'number', prompt: 'Weight', topic: 'health', bodyOrDiet: true }),
  ];
  it('a teen: training only, no free text', () => {
    expect(questionsFor(qs, { band: 'teen', healthShown: false, healthConsent: false })).toEqual({ training: [qs[0]], health: [] });
    // even if something upstream said "shown", a teen never gets health
    expect(questionsFor(qs, { band: 'teen', healthShown: true, healthConsent: true }).health).toEqual([]);
  });
  it('an adult: training and text; health only when shown', () => {
    expect(questionsFor(qs, { band: 'adult', healthShown: false, healthConsent: false })).toEqual({ training: [qs[0], qs[1]], health: [] });
    expect(questionsFor(qs, { band: 'adult', healthShown: true, healthConsent: false }).health).toEqual([qs[2], qs[3]]);
  });
});

describe('cleanAnswers', () => {
  const qs: CheckinQuestion[] = [
    Q({ id: 'q1', kind: 'scale', prompt: 'a' }), Q({ id: 'q2', kind: 'yesno', prompt: 'b' }), Q({ id: 'q3', kind: 'number', prompt: 'c' }),
    Q({ id: 'q4', kind: 'choice', prompt: 'd', choices: ['Mon', 'Wed'] }), Q({ id: 'q5', kind: 'text', prompt: 'e' }),
  ];
  it('keeps valid answers, drops unknown ids, leaves skipped ones out', () => {
    expect(cleanAnswers(qs, { q1: 7, q2: false, q3: 12.345, q4: 'Wed', q5: '  felt  strong ', zz: 'x' })).toEqual({ ok: true, answers: { q1: 7, q2: false, q3: 12.35, q4: 'Wed', q5: 'felt strong' } });
    expect(cleanAnswers(qs, { q1: null, q3: '' })).toEqual({ ok: true, answers: {} });
  });
  it.each([[{ q1: 11 }, 'q1'], [{ q1: 6.5 }, 'q1'], [{ q2: 'yes' }, 'q2'], [{ q3: 'ten' }, 'q3'], [{ q4: 'Fri' }, 'q4'], [{ q3: Infinity }, 'q3']])('refuses %j', (a, id) => {
    expect(cleanAnswers(qs, a)).toEqual({ ok: false, error: 'bad_answer', id });
  });
  it('a question this athlete is not asked cannot be answered (it is not in the list)', () => {
    expect(cleanAnswers([qs[0]], { q5: 'sneaked in' })).toEqual({ ok: true, answers: {} });
  });
});

describe('periods and history', () => {
  const wed = new Date('2026-10-28T18:00:00Z');   // a Wednesday; PT week starts Monday 2026-10-26
  it('weekly = the PT week\'s Monday; once = once', () => {
    expect(periodFor('weekly', wed)).toBe('2026-10-26');
    expect(periodFor('once', wed)).toBe('once');
    // Sunday 23:30 PT is still that week; Monday 00:30 PT is the next
    expect(periodFor('weekly', new Date('2026-11-02T07:30:00Z'))).toBe('2026-10-26');
    expect(periodFor('weekly', new Date('2026-11-02T08:30:00Z'))).toBe('2026-11-02');
  });
  it('isDue', () => {
    expect(isDue('weekly', ['2026-10-19'], wed)).toBe(true);
    expect(isDue('weekly', ['2026-10-26'], wed)).toBe(false);
    expect(isDue('once', ['once'], wed)).toBe(false);
  });
  const qs: CheckinQuestion[] = [Q({ id: 'q1', kind: 'scale', prompt: 'Effort' }), Q({ id: 'q2', kind: 'number', prompt: 'Sleep h', topic: 'health', unit: 'h' })];
  const row = (period: string, q1: number, q2: number | null): AnswerRow => ({ id: period, formId: 'f', coachId: 'c', athleteId: 'a', period, answers: { q1 }, health: q2 == null ? null : { q2 }, createdAt: '', updatedAt: '' });
  const rows = [row('2026-10-12', 6, 7), row('2026-10-26', 8, 6.5), row('2026-10-19', 7, null)];
  it('history: newest first; health columns ABSENT without the coach-view rule', () => {
    const without = history(qs, rows, false);
    expect(without.columns.map((c) => c.id)).toEqual(['q1']);
    expect(without.rows.map((r) => [r.period, r.cells])).toEqual([['2026-10-26', { q1: '8/10' }], ['2026-10-19', { q1: '7/10' }], ['2026-10-12', { q1: '6/10' }]]);
    expect(JSON.stringify(without)).not.toContain('6.5');
    const withH = history(qs, rows, true);
    expect(withH.rows[0].cells).toEqual({ q1: '8/10', q2: '6.5 h' });
    expect(withH.rows[1].cells.q2).toBe('–');
    expect(series(qs[0], withH.rows)).toEqual([{ period: '2026-10-12', value: 6 }, { period: '2026-10-19', value: 7 }, { period: '2026-10-26', value: 8 }]);
  });
  it('answerText', () => {
    expect(answerText(Q({ kind: 'yesno', prompt: '' }), true)).toBe('Yes');
    expect(answerText(Q({ kind: 'choice', prompt: '' }), 'Mon')).toBe('Mon');
    expect(answerText(Q({ kind: 'scale', prompt: '' }), undefined)).toBe('–');
  });
  it('weeksAnswered: of the last 4 weeks, fewer when the form is newer', () => {
    expect(weeksAnswered(rows, wed)).toEqual({ answered: 3, of: 4 });
    expect(weeksAnswered(rows, wed, 4, Date.parse('2026-10-20T12:00:00Z'))).toEqual({ answered: 2, of: 2 });
  });
});
