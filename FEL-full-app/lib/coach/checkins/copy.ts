// lib/coach/checkins/copy.ts — COACH-PARITY (2026-10-26): what the coach and the athlete read about check-ins.
//
// DRAFTS FOR THE OWNER (docs/COACH-PARITY.md §Draft copy). Every line below marked DRAFT is a privacy or health line: it
// says who sees an answer, or why a question is not asked. None is policy text (lib/policies.ts is not touched); each is
// shown only where the feature it describes is on — the health lines only while COACH_PARITY_HEALTH_ENABLED is on, which
// is the owner's switch to flip after reading them.
import type { FormError } from './rules';

/** Shown under the training questions. A product line: a coach seeing their own form's answers is the feature. */
export const TRAINING_SEEN_LINE = 'Your coach sees these answers.';

/** DRAFT (health): above the health questions. Shown only while COACH_PARITY_HEALTH_ENABLED is on. */
export const HEALTH_SECTION_LINE_DRAFT =
  'These questions are about your health. FEL keeps your answers only if you have said yes to FEL keeping health data, and your coach sees them only if you share your health with them.';

/** DRAFT (health): when an adult has not said yes to health data, instead of the health questions' Save. */
export const HEALTH_CONSENT_NEEDED_DRAFT = 'To answer these, say yes to FEL keeping your health data first. You can still send the rest.';

/** DRAFT (privacy): a teen's form, when the coach's form also holds questions only adults are asked. */
export const TEEN_SKIPPED_LINE_DRAFT = 'Some of your coach’s questions are for adults only, so they are not shown here.';

/** DRAFT (health): the coach's builder, beside the health mark, and on the form summary. */
export const COACH_HEALTH_NOTE_DRAFT =
  'Health questions go to adults only. You see an athlete’s answers only if they share their health with you.';

/** The coach's builder, when the switch is off: why health questions cannot be added yet. */
export const HEALTH_OFF_LINE = 'Health questions (sleep, mood, body weight, food) open when FEL’s wording for them is approved.';

/** The coach's builder: why there is no pain question, and what to use. */
export const PAIN_LINE = 'Pain goes through FEL’s own pain check-in, so it gets the same rules and follow-up everywhere. Tick "Add the pain check" instead.';

export const COMING_SOON_LINE = 'Check-ins are coming soon.';

/** The builder's message for each refusal. */
export const FORM_ERROR_COPY: Record<FormError, string> = {
  title_required: 'Give the check-in a name.',
  cadence: 'Pick weekly or one-off.',
  no_questions: 'Add at least one question (or the pain check).',
  too_many_questions: 'Twelve questions at most. Short check-ins get answered.',
  question_kind: 'Pick a type for every question.',
  prompt_required: 'Every question needs its wording.',
  question_is_pain: PAIN_LINE,
  health_off: HEALTH_OFF_LINE,
  choices: 'A choice question needs 2 to 6 different options.',
  unit: 'Keep the unit to letters, like kg or min.',
};

/** The athlete's Today card. */
export const DUE_LINE = (title: string, coach: string) => `${coach} sent you a check-in: ${title}.`;
export const DONE_LINE = 'Sent. You can change your answers until the week ends.';
export const DONE_ONCE_LINE = 'Sent.';
