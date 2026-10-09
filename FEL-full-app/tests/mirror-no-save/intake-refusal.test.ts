// R-HEALTH-CLIENT (2026-09-30; FE PM 19:31 and 19:46 PT), test a: the intake screen's page-memory rule
// (app/play/mirror/_components/intake-refusal.ts). The red-flag rule is lib/health/intake.ts's, imported: the same answers
// stop here exactly when they would have stopped on the server.
import { describe, expect, it } from 'vitest';
import {
  HEALTH_ADULTS_ONLY, LOCAL_CLEARED, UNKNOWN_LOCAL_STATUS, isAdultsOnlyRefusal, localIntakeOutcome, localIntakeStart,
} from '@/app/play/mirror/_components/intake-refusal';
import { RED_FLAG_COPY, RED_FLAG_QUESTION_IDS, INTAKE_QUESTIONS, redFlagsFor, validateIntakeAnswers } from '@/lib/health/intake';
import { HEALTH_WRITE_REFUSED } from '@/lib/privacy/healthWriteGate';

const ALL_NO = Object.fromEntries(INTAKE_QUESTIONS.filter((q) => q.type === 'yes_no').map((q) => [q.id, false]));

describe('HEALTH_ADULTS_ONLY', () => {
  it('is the code the route refuses a health write with (a literal only because that module imports next/server)', () => {
    expect(HEALTH_ADULTS_ONLY).toBe(HEALTH_WRITE_REFUSED.error);
  });
});

describe('isAdultsOnlyRefusal', () => {
  it('is true for 403 + health_data_adults_only, and only that', () => {
    expect(isAdultsOnlyRefusal(403, { error: 'health_data_adults_only', saved: false })).toBe(true);
    expect(isAdultsOnlyRefusal(403, { error: 'health_data_adults_only' })).toBe(true);
  });

  it.each([
    ['403 with another code', 403, { error: 'scan_save_adults_only' }],
    ['403 with no body', 403, null],
    ['403 with a string body', 403, 'health_data_adults_only'],
    ['412 guardian_consent_required', 412, { error: 'guardian_consent_required' }],
    ['400', 400, { error: 'health_data_adults_only' }],
    ['401', 401, { error: 'unauthorized' }],
    ['500', 500, { error: 'health_data_adults_only' }],
    ['a non-JSON body (undefined after a failed parse)', 403, undefined],
  ])('%s → false', (_n, status, body) => {
    expect(isAdultsOnlyRefusal(status as number, body)).toBe(false);
  });
});

describe('localIntakeOutcome (lib/health/intake.ts\'s rule, in page memory)', () => {
  it('no answers at all → ready_unsaved', () => {
    expect(localIntakeOutcome({})).toEqual({ stage: 'ready_unsaved', redFlags: [] });
  });

  it('every yes/no answered "no" → ready_unsaved', () => {
    expect(localIntakeOutcome(ALL_NO)).toEqual({ stage: 'ready_unsaved', redFlags: [] });
  });

  it('there are red-flag questions to test (control)', () => {
    expect(RED_FLAG_QUESTION_IDS.length).toBeGreaterThan(0);
  });

  it.each(RED_FLAG_QUESTION_IDS.map((id) => [id]))('%s answered as its red flag → stopped_local with RED_FLAG_COPY', (id) => {
    const out = localIntakeOutcome({ ...ALL_NO, [id]: true });
    expect(out).toEqual({ stage: 'stopped_local', redFlags: [id], copy: RED_FLAG_COPY });
  });

  it('a "yes" that is NOT a red flag (current pain) still continues: the rule is the server\'s, not a stricter copy', () => {
    const notFlags = INTAKE_QUESTIONS.filter((q) => q.type === 'yes_no' && !RED_FLAG_QUESTION_IDS.includes(q.id));
    expect(notFlags.length).toBeGreaterThan(0);
    for (const q of notFlags) expect(localIntakeOutcome({ ...ALL_NO, [q.id]: true }).stage).toBe('ready_unsaved');
  });

  it.each([
    ['a yes/no answered with a string', { ...ALL_NO, current_pain: 'yes' }],
    ['an implausible birth year', { ...ALL_NO, birth_year: 22 }],
    ['a future birth year', { ...ALL_NO, birth_year: new Date().getFullYear() + 1 }],
    ['not an object', 'answers'],
    ['null', null],
  ])('invalid answers (%s) → stopped_local (fail closed)', (_n, raw) => {
    const out = localIntakeOutcome(raw);
    expect(out.stage).toBe('stopped_local');
    if (out.stage === 'stopped_local') expect(out.copy).toBe(RED_FLAG_COPY);
  });

  it('its red flags equal redFlagsFor on the same validated answers (one rule, not a copy)', () => {
    const cases: unknown[] = [
      {}, ALL_NO, { ...ALL_NO, heart_or_bp_condition: true }, { ...ALL_NO, dizziness_fainting_chest_pain: true, clinician_told_to_avoid: true },
      { current_pain: true, birth_year: 2010 }, { ...ALL_NO, heart_or_bp_condition: 'yes', clinician_told_to_avoid: true },
      Object.fromEntries(RED_FLAG_QUESTION_IDS.map((id) => [id, true])),
    ];
    for (const raw of cases) expect(localIntakeOutcome(raw).redFlags).toEqual(redFlagsFor(validateIntakeAnswers(raw).answers));
  });

  it('a skipped question (absent or null) is not an answer, so it is never a red flag', () => {
    const skipped = Object.fromEntries(RED_FLAG_QUESTION_IDS.map((id) => [id, null]));
    expect(localIntakeOutcome(skipped)).toEqual({ stage: 'ready_unsaved', redFlags: [] });
  });
});

describe('localIntakeStart / LOCAL_CLEARED', () => {
  it('a stored red flag still stops; a due intake is asked; otherwise straight on', () => {
    expect(localIntakeStart({ intakeDue: true, storedHardStop: true })).toBe('stopped_local');
    expect(localIntakeStart({ intakeDue: false, storedHardStop: true })).toBe('stopped_local');
    expect(localIntakeStart({ intakeDue: true, storedHardStop: false })).toBe('question');
    expect(localIntakeStart({ intakeDue: false, storedHardStop: false })).toBe('ready_unsaved');
  });

  it('an unknown status (no user, a failed read) asks the intake and stops nothing unanswered', () => {
    expect(UNKNOWN_LOCAL_STATUS).toEqual({ intakeDue: true, storedHardStop: false });
    expect(localIntakeStart()).toBe('question');
  });

  it('"mark cleared" in page memory goes on to the Mirror, unsaved', () => {
    expect(LOCAL_CLEARED).toBe('ready_unsaved');
  });
});
