// lib/health/intake.ts — MIRROR-COACH P5 (2026-09-29): the pre-participation health intake.
//
// FEL's OWN QUESTIONS, PLAIN WORDS (IP RULE). Every prompt here is written for this app, not lifted from the book —
// the book is cited once, by title, as further reading in Education (owner decision #25) and nowhere else. The
// question SET below (current pain / recent injury or surgery / dizziness-fainting-or-chest-pain-with-effort / a
// doctor-mentioned heart or blood-pressure condition / pregnancy or postpartum / heart-rate-or-balance medicine /
// anything a clinician said to avoid / birth year) is the phase-5 contract's own list.
//
// WHICH ANSWERS ARE RED FLAGS. The contract says "some answers are RED FLAGS"; it does not enumerate which, so this
// is the one real judgement call in the file — documented as an assumption rather than buried in an if-statement.
//
//   assumption: only the three classic exertion/cardiac-warning-sign questions are red flags —
//   dizziness/fainting/chest pain WITH EFFORT, a doctor-mentioned heart or blood-pressure condition, and anything a
//   clinician explicitly said to avoid. These are the standard PAR-Q-style "stop and ask a professional first"
//   signals: activity-triggered cardiac symptoms, a diagnosed cardiovascular condition, and a professional's own
//   explicit instruction — none of which this app is positioned to weigh against.
//
//   Deliberately NOT red flags, each for a stated reason: `current_pain` (that is the pain check-in loop's job —
//   lib/health/painRule.ts decides per exercise, not a one-time intake); `recent_injury_or_surgery` (informational,
//   used to keep an early session cautious, not a blanket stop — plenty of healed injuries need no gate at all, and
//   this app has no way to tell which); `pregnancy_or_postpartum` (never a stop by itself — flagging it as a problem
//   would be both wrong and unkind; it is recorded so later guidance can be sensible, never to block); and
//   `heart_rate_or_balance_medicine` (relevant context for some game modes, not grounds on its own to hard-stop
//   everything). A real clinician review (decision #15 — skipped on purpose, for now) is the place to revisit this
//   exact list; keeping it in one array with one boolean each is what makes that review possible at all.
//
// HONESTY RULE. A red flag never names a condition and never diagnoses — RED_FLAG_COPY says what to do
// ("check with a clinician"), not what might be wrong. No question here reads any camera signal; this file has
// nothing to do with what the Mirror's 33 landmarks can or can't measure.
//
// RE-ASKED YEARLY (version field). `needsIntake()` is true for a stale `version` OR an intake older than a year —
// either one re-opens the flow, so a birthday into adulthood or a changed question set is never stuck behind a
// year-old answer.

import type { Prisma } from '@/public/_prisma/client';
import { needsGuardian, guardianStatus, type GuardianConsentLike } from '../consent/guardianGate';

export const INTAKE_VERSION = '2026-09-29';
export const INTAKE_REASK_DAYS = 365;

export type IntakeAnswerValue = boolean | number | null;
/** Raw answers as stored/submitted: keyed by IntakeQuestion.id. A question the athlete skipped is simply absent
 *  (never written as `false` — "no" and "skipped" are different answers, and only "no" is informative). */
export type IntakeAnswers = Record<string, IntakeAnswerValue>;

export interface IntakeQuestion {
  id: string;
  prompt: string;
  /** One line of context shown under the prompt, when the question needs it. */
  help?: string;
  type: 'yes_no' | 'birth_year';
  /** Every question is skippable except the consent screen itself, which isn't one of these (owner: consent +
   *  birth year may be skipped; a skipped birth year reads as "prefer not to say" -> youth rules, decision #20). */
  skippable: true;
  /** Called only with a non-null, defined answer. True means this specific answer is a red flag. */
  isRedFlag?: (value: IntakeAnswerValue) => boolean;
}

const yesIsRedFlag = (v: IntakeAnswerValue) => v === true;

export const INTAKE_QUESTIONS: readonly IntakeQuestion[] = [
  {
    id: 'current_pain',
    prompt: 'Do you have any pain right now, even mild, that started before today?',
    type: 'yes_no',
    skippable: true,
    // Not a red flag — see the file header. Handled per exercise by the pain check-in loop instead.
  },
  {
    id: 'recent_injury_or_surgery',
    prompt: 'Any injury or surgery in the last 3 months?',
    type: 'yes_no',
    skippable: true,
  },
  {
    id: 'dizziness_fainting_chest_pain',
    prompt: 'Does physical effort ever bring on dizziness, fainting, or chest pain?',
    help: 'Meaning during or right after exercise, not any other time.',
    type: 'yes_no',
    skippable: true,
    isRedFlag: yesIsRedFlag,
  },
  {
    id: 'heart_or_bp_condition',
    prompt: 'Has a doctor ever told you about a heart or blood-pressure condition?',
    type: 'yes_no',
    skippable: true,
    isRedFlag: yesIsRedFlag,
  },
  {
    id: 'pregnancy_or_postpartum',
    prompt: 'Are you currently pregnant, or within about 3 months postpartum?',
    type: 'yes_no',
    skippable: true,
  },
  {
    id: 'heart_rate_or_balance_medicine',
    prompt: 'Do you take any medicine that affects your heart rate or your balance?',
    type: 'yes_no',
    skippable: true,
  },
  {
    id: 'clinician_told_to_avoid',
    prompt: 'Has a clinician told you to avoid any particular exercise or movement?',
    type: 'yes_no',
    skippable: true,
    isRedFlag: yesIsRedFlag,
  },
  {
    id: 'birth_year',
    prompt: 'What year were you born?',
    help: "Prefer not to say is fine — we'll use the more careful youth rules until you tell us.",
    type: 'birth_year',
    skippable: true,
  },
] as const;

const QUESTIONS_BY_ID = new Map(INTAKE_QUESTIONS.map((q) => [q.id, q]));
export const RED_FLAG_QUESTION_IDS: readonly string[] = INTAKE_QUESTIONS.filter((q) => q.isRedFlag).map((q) => q.id);

/** The question set with `isRedFlag` stripped — a function isn't JSON-serializable, and a route/UI never needs to
 *  know WHICH answer is a red flag, only what to ask and how (which answer that turns out to be stays server-side,
 *  decided by redFlagsFor once the answers come back). */
export interface PublicIntakeQuestion {
  id: string;
  prompt: string;
  help?: string;
  type: 'yes_no' | 'birth_year';
  skippable: true;
}

export const PUBLIC_INTAKE_QUESTIONS: readonly PublicIntakeQuestion[] = INTAKE_QUESTIONS.map(
  ({ id, prompt, help, type, skippable }) => ({ id, prompt, help, type, skippable }),
);

/** What the consent screen shown BEFORE any question says (owner decision #4/#18): what's stored, why, who sees it,
 *  how to erase it. FEL's own words, opt-in only — nothing here is implied consent or a pre-checked box. */
export const HEALTH_DATA_CONSENT_COPY = {
  title: 'Before we ask anything health-related',
  bullets: [
    'What we store: your answers here, plus any pain check-ins you log during training.',
    "Why: so training can be told to ease up or stop when it should, and never further than that.",
    'Who sees it: only you, unless you separately let a specific coach view it — that choice is always yours and can be turned off.',
    'It is never sold, never used for ads, never scored, never paid, and never shown in anything you share with a link.',
    'You can export or erase this data at any time from your account settings.',
  ],
} as const;

/** Shown whenever a red-flag answer hard-stops the Mirror, pain check-ins and training features. Never a diagnosis —
 *  it names no condition and says only what to do next. */
export const RED_FLAG_COPY = 'Check with a clinician before training. Come back and tick cleared when you have.';

export class IntakeValidationError extends Error {
  constructor(
    public readonly code: string,
    public readonly details: readonly string[] = [],
  ) {
    super(code);
    this.name = 'IntakeValidationError';
  }
}

/** assumption: a plausible human birth year — old enough to exclude typos like "22", young enough to exclude a
 *  future year. 120 years is a generous, round upper age bound. */
export function isValidBirthYear(year: number, now: Date = new Date()): boolean {
  return Number.isInteger(year) && year >= now.getFullYear() - 120 && year <= now.getFullYear();
}

/**
 * Validate + sanitize a raw answers payload against INTAKE_QUESTIONS. Unknown keys are dropped silently (never
 * stored — the schema's `answers` Json column holds exactly this app's own question ids). A recognized key with the
 * wrong type for its question is an error, not a silent drop: a malformed submission should fail loudly rather than
 * store a question as "skipped" when the athlete actually answered it.
 */
export function validateIntakeAnswers(raw: unknown, now: Date = new Date()): { answers: IntakeAnswers; errors: string[] } {
  const answers: IntakeAnswers = {};
  const errors: string[] = [];
  if (raw === null || typeof raw !== 'object') {
    return { answers, errors: ['answers must be an object'] };
  }
  const record = raw as Record<string, unknown>;
  for (const q of INTAKE_QUESTIONS) {
    const value = record[q.id];
    if (value === undefined || value === null) continue; // skipped
    if (q.type === 'yes_no') {
      if (typeof value !== 'boolean') { errors.push(`${q.id}: expected boolean`); continue; }
      answers[q.id] = value;
    } else {
      const year = typeof value === 'number' ? value : NaN;
      if (!isValidBirthYear(year, now)) { errors.push(`${q.id}: expected a plausible birth year`); continue; }
      answers[q.id] = year;
    }
  }
  return { answers, errors };
}

/** The red-flag question ids whose answer in `answers` reads as a red flag. Pure and total: same answers, same
 *  list, every time — this is the function HealthIntake.redFlags is a stored snapshot of. */
export function redFlagsFor(answers: IntakeAnswers): string[] {
  const flags: string[] = [];
  for (const id of RED_FLAG_QUESTION_IDS) {
    const q = QUESTIONS_BY_ID.get(id);
    const value = answers[id];
    if (q?.isRedFlag && value !== undefined && value !== null && q.isRedFlag(value)) flags.push(id);
  }
  return flags;
}

/** The birth year to write, from an already-validated answers object. Null when skipped/declined — which reads as
 *  a minor until answered (owner decision #20; enforced by lib/mirror/youth.ts isMinorForMirror, not here). */
export function birthYearFrom(answers: IntakeAnswers): number | null {
  const v = answers.birth_year;
  return typeof v === 'number' ? v : null;
}

/** True while a red-flag intake is still blocking the Mirror, pain check-ins and training features — non-empty
 *  redFlags and no self-attested clearedAt yet. */
export function isHardStopped(intake: { redFlags: readonly string[]; clearedAt?: Date | null } | null | undefined): boolean {
  return !!intake && intake.redFlags.length > 0 && !intake.clearedAt;
}

/** True when this athlete needs to (re-)take the intake: none on file, a stale question-set version, or one over a
 *  year old (re-asked yearly, per the contract). */
export function needsIntake(
  latest: { version: string; createdAt: Date } | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!latest) return true;
  if (latest.version !== INTAKE_VERSION) return true;
  const ageDays = (now.getTime() - latest.createdAt.getTime()) / (24 * 60 * 60 * 1000);
  return ageDays > INTAKE_REASK_DAYS;
}

// ---------------------------------------------------------------------------------------------------------------
// DB-TOUCHING FUNCTIONS — kept out of the route file so they can be tested against a fake client (vitest does not
// collect app/; see lib/prq-data-rights.ts for the same pattern).
// ---------------------------------------------------------------------------------------------------------------

type IntakeDb = Pick<Prisma.TransactionClient, 'healthIntake' | 'healthConsent' | 'user' | 'guardianConsent'>;

/** Grant (or return the already-active) 'health_data' consent for a user. Idempotent: granting twice while already
 *  active writes nothing new. A revoked grant is NOT reactivated by this — a fresh row is created instead, so the
 *  revoke is never silently undone by the next intake submission. */
export async function grantHealthDataConsent(
  db: Pick<Prisma.TransactionClient, 'healthConsent'>,
  userId: string,
  now: Date = new Date(),
) {
  const active = await db.healthConsent.findFirst({ where: { userId, scope: 'health_data', revokedAt: null } });
  if (active) return active;
  return db.healthConsent.create({ data: { userId, scope: 'health_data', grantedAt: now } });
}

export interface SubmitIntakeInput {
  userId: string;
  /** Raw, unvalidated answers as received from the client. */
  rawAnswers: unknown;
  /** Opt-in consent for THIS submission (owner decision #4) — required, never implied. */
  consent: boolean;
  now?: Date;
}

/**
 * Validate, consent-gate and store one intake. Runs the 'health_data' consent grant, writes User.dobYear only when
 * it was blank (decision #20 — an existing dobYear is never overwritten by an intake), and stores the row with a
 * SNAPSHOT of redFlagsFor's answer (see the model doc in schema.prisma for why it's a snapshot, not a live compute).
 *
 * Throws IntakeValidationError('consent_required') or ('invalid_answers', details) rather than writing a partial or
 * unconsented row — there is no partial success here.
 *
 * MIRROR-COACH P5 FIX (2026-09-29, code review) — Finding "A minor's full health intake (including cardiac/red-flag
 * answers) is collected before any guardian consent exists": this used to grant health_data consent, write dobYear
 * and create the full HealthIntake row (all eight answers, including the three red-flag questions) from nothing but
 * the athlete's OWN consent tick — GuardianConsentGate only sat in front of the Mirror SESSION afterward, so a
 * minor's complete intake, red flags included, was already persisted before a parent or guardian was ever asked.
 * That contradicted lib/policies.ts's own Privacy §5 text shipped in this same phase: "If you are under 18 … a
 * parent or guardian has to give that consent before any of it is collected."
 *
 * THE FIX holds the ENTIRE submission — nothing is written, not even the health_data consent grant or dobYear — when
 * the effective birth year (this submission's answer, or the existing User.dobYear when the question was skipped
 * because it is already on file) reads as needing a guardian (lib/consent/guardianGate.ts needsGuardian — decision
 * #20's own "blank = minor" rule) and no GuardianConsent for this athlete has been accepted yet. The client
 * (app/play/mirror/_components/health-intake-gate.tsx) shows the same guardian-ask screen the Mirror session itself
 * gates behind and re-asks the intake once that clears — a few quick yes/no taps again, not a lost answer, since
 * nothing from the held attempt was ever kept.
 *
 * A returning ADULT who skips the birth_year question (it is already on file) is unaffected: `effectiveDobYear`
 * falls back to the existing User.dobYear, so this never mistakes "already answered, not asked again" for "blank".
 */
export async function submitIntake(db: IntakeDb, input: SubmitIntakeInput) {
  if (input.consent !== true) throw new IntakeValidationError('consent_required');
  const now = input.now ?? new Date();
  const { answers, errors } = validateIntakeAnswers(input.rawAnswers, now);
  if (errors.length > 0) throw new IntakeValidationError('invalid_answers', errors);

  const birthYear = birthYearFrom(answers);
  const user = await db.user.findUnique({ where: { id: input.userId }, select: { dobYear: true } });
  const effectiveDobYear = birthYear ?? user?.dobYear ?? null;

  if (needsGuardian(effectiveDobYear, now)) {
    const guardianRows = await db.guardianConsent.findMany({
      where: { menteeId: input.userId },
      select: { requestedAt: true, acceptedAt: true, revokedAt: true },
    });
    if (guardianStatus(guardianRows as GuardianConsentLike[]) !== 'accepted') {
      throw new IntakeValidationError('guardian_consent_required');
    }
  }

  await grantHealthDataConsent(db, input.userId, now);

  if (birthYear !== null && user && user.dobYear == null) {
    await db.user.update({ where: { id: input.userId }, data: { dobYear: birthYear } });
  }

  const redFlags = redFlagsFor(answers);
  const intake = await db.healthIntake.create({
    data: {
      userId: input.userId,
      version: INTAKE_VERSION,
      answers: answers as Prisma.InputJsonValue,
      redFlags,
      birthYear,
      consentedAt: now,
    },
  });

  return { intake, hardStopped: isHardStopped(intake) };
}

/** The newest intake on file for a user, or null. */
export async function latestIntake(db: Pick<Prisma.TransactionClient, 'healthIntake'>, userId: string) {
  return db.healthIntake.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
}

/**
 * Self-attested clearance: "I checked with a clinician." Never verified by FEL, never a diagnosis — just a dated
 * tick that lifts the hard stop. Idempotent (clearing an already-cleared intake returns it unchanged) and scoped to
 * the calling user's own row (a clearedAt on somebody else's intake is refused, not silently ignored).
 */
export async function clearIntake(
  db: Pick<Prisma.TransactionClient, 'healthIntake'>,
  opts: { userId: string; intakeId: string; now?: Date },
) {
  const intake = await db.healthIntake.findUnique({ where: { id: opts.intakeId } });
  if (!intake || intake.userId !== opts.userId) throw new IntakeValidationError('not_found');
  if (intake.clearedAt) return intake;
  return db.healthIntake.update({ where: { id: opts.intakeId }, data: { clearedAt: opts.now ?? new Date() } });
}
