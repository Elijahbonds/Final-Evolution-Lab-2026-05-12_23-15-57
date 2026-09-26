// The breath station's questions and the coach's stations (MIRROR-COACH P3, 2026-09-25). The breath station had no
// input at all: the runner held eight seconds and moved on, and nothing asked what the athlete felt.
import { describe, expect, it } from 'vitest';
import { FULL_SCREEN, MODIFIED_SCREEN, scoreScreen, type CheckResult } from './screen';
import {
  ANSWER_LABEL, COACH_CHECK_LINE, SELF_REPORT_ANSWERS, SELF_REPORT_NOTE, SELF_REPORT_QUESTIONS, answerLine, coachChecksFor,
  selfReportAnswersFor, selfReportChecksFor, selfReportQuestionsFor,
} from './selfReport';
import { screenText } from '@/lib/share/screen';

describe('what the screen asks, and whose checks the rest are', () => {
  it('every self-report check has a question, and every question belongs to a self-report check', () => {
    const selfIds = new Set([...MODIFIED_SCREEN, ...FULL_SCREEN].flatMap((s) => s.checks).filter((c) => c.source === 'selfReport').map((c) => c.id));
    expect([...selfIds]).toEqual(['ribAngle']);
    for (const id of selfIds) expect(SELF_REPORT_QUESTIONS.some((q) => q.checkId === id), id).toBe(true);
    for (const q of SELF_REPORT_QUESTIONS) expect(selfIds.has(q.checkId), q.id).toBe(true);
    expect(new Set(SELF_REPORT_QUESTIONS.map((q) => q.id)).size).toBe(SELF_REPORT_QUESTIONS.length);
  });

  it('both screens ask the breath questions; only the full one names coach checks', () => {
    expect(selfReportQuestionsFor('modified').map((q) => q.id)).toEqual(['lowerRibsWiden', 'neckShouldersLift']);
    expect(selfReportQuestionsFor('full')).toEqual(selfReportQuestionsFor('modified'));
    expect(selfReportChecksFor('modified').map((c) => c.id)).toEqual(['ribAngle']);
    expect(coachChecksFor('modified')).toEqual([]);
    expect(coachChecksFor('full').map((c) => c.id)).toEqual(['pelvicTilt', 'thoracicRotation']);
  });

  it('"Not sure" is an answer, beside yes and no', () => {
    expect(SELF_REPORT_ANSWERS).toEqual(['yes', 'no', 'notSure']);
    expect(ANSWER_LABEL.notSure).toBe('Not sure');
  });

  it('the breath station cue puts the hands where the questions ask, and says the questions come at the end', () => {
    const breath = MODIFIED_SCREEN.find((s) => s.id === 'breath')!;
    expect(breath.cue).toMatch(/hands on the sides of your lower ribs/i);
    expect(breath.cue).toMatch(/questions .* at the end/i);
    expect(breath.cue).not.toMatch(/stand up straight|shoulders back|chin up|chest out|tuck your/i);   // never a posture cue
  });
});

describe('the words: plain, no claims, nothing a camera measured', () => {
  const lines = [
    ...SELF_REPORT_QUESTIONS.map((q) => q.text), SELF_REPORT_NOTE, COACH_CHECK_LINE,
    ...SELF_REPORT_QUESTIONS.flatMap((q) => SELF_REPORT_ANSWERS.map((a) => answerLine({ questionId: q.id, checkId: q.checkId, answer: a }))),
  ];
  it('passes FEL\'s claims screen (no condition, no treatment, no guarantee — lib/share/screen.ts)', () => {
    for (const l of lines) expect(screenText(l), l).toEqual([]);
  });
  it('never says a camera saw it, never grades, never scores, never says dysfunction / injury / risk', () => {
    for (const l of lines) {
      expect(l).not.toMatch(/camera (saw|measured|read)|estimated|dysfunction|injur|risk|diagnos|flare/i);
    }
    expect(SELF_REPORT_NOTE).toMatch(/not graded/i);
    expect(SELF_REPORT_NOTE).toMatch(/never change your score/i);
    expect(COACH_CHECK_LINE).toMatch(/^Your coach checks this\. Not graded, not scored\.$/);
  });
  it('reads an answer back as what they said, not as a verdict', () => {
    expect(answerLine({ questionId: 'neckShouldersLift', checkId: 'ribAngle', answer: 'notSure' }))
      .toBe('When you breathed in, did your shoulders or neck lift? You said: not sure.');
  });
});

describe('selfReportAnswersFor: only answers the screen asked, one per question', () => {
  it('keeps real answers in question order, the LAST answer to a question winning', () => {
    const got = selfReportAnswersFor('modified', [
      { questionId: 'neckShouldersLift', answer: 'yes' },
      { questionId: 'lowerRibsWiden', answer: 'no' },
      { questionId: 'neckShouldersLift', answer: 'notSure' },
    ]);
    expect(got).toEqual([
      { questionId: 'lowerRibsWiden', checkId: 'ribAngle', answer: 'no' },
      { questionId: 'neckShouldersLift', checkId: 'ribAngle', answer: 'notSure' },
    ]);
  });

  it('drops junk, unknown questions and answers that are not answers — never throws', () => {
    expect(selfReportAnswersFor('modified', [
      null, 7, 'yes', { questionId: 'lowerRibsWiden', answer: 'maybe' }, { questionId: 'pelvicTilt', answer: 'yes' },
      { questionId: 'lowerRibsWiden' }, { answer: 'yes' }, { questionId: 'lowerRibsWiden', answer: 'yes', grade: 'fail' },
    ])).toEqual([{ questionId: 'lowerRibsWiden', checkId: 'ribAngle', answer: 'yes' }]);
    for (const junk of [undefined, null, {}, 'x', 3]) expect(selfReportAnswersFor('full', junk)).toEqual([]);
  });
});

describe('an answer never changes a scored number', () => {
  it('the same camera results score the same whatever the athlete answered — answers are not results', () => {
    const cam: CheckResult[] = [{ checkId: 'hipLevel', grade: 'stable', source: 'camera' }];
    const answered = selfReportAnswersFor('modified', [{ questionId: 'lowerRibsWiden', answer: 'no' }, { questionId: 'neckShouldersLift', answer: 'yes' }]);
    // even pushed into the results list, an answer is dropped before scoring
    expect(scoreScreen('modified', [...cam, ...(answered as unknown as CheckResult[])])).toEqual(scoreScreen('modified', cam));
  });
});
