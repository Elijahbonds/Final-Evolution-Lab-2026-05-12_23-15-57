// lib/health/pain.ts — MIRROR-COACH P5 (2026-09-29): the pain check-in loop.
//
// WHAT THIS FILE IS. lib/health/painRule.ts holds the rule and its copy; this file is everything around it —
// validating a raw submission, assembling the rule's four inputs (trend, standing red flags, isMinor) from the
// database, storing the row, picking which of an athlete's earlier check-ins need a next-morning follow-up, and
// building the coach's own (consent-gated) view of a flag. Kept apart from the route so it stays testable against a
// fake Prisma client — vitest does not collect app/, same pattern as lib/health/intake.ts and lib/prq-data-rights.ts.
//
// NEVER SCORED, NEVER RE-DECIDED. This module calls painRule.ts's decide() exactly once per submission and stores
// exactly what it returned; it does not add a second opinion, and nothing here feeds PRQ, a payout or a streak
// (decision #4/#12 — see painRule.ts's own header for why that is a hard rule, not an oversight).
import type { Prisma } from '@/public/_prisma/client';
import { isMinorForMirror } from '../mirror/youth';
import {
  ACUTE_EVENT_IDS,
  BODY_AREA_IDS,
  decide,
  isHardStop,
  isStopOutcome,
  PAIN_DECISION_COPY,
  type AcuteEventId,
  type BodyAreaId,
  type PainCheckInKind,
  type PainDecision,
  type PainTrend,
} from './painRule';

export class PainValidationError extends Error {
  constructor(
    public readonly code: string,
    public readonly details: readonly string[] = [],
  ) {
    super(code);
    this.name = 'PainValidationError';
  }
}

const KINDS: readonly PainCheckInKind[] = ['during', 'after', 'next_morning'];

// ---------------------------------------------------------------------------------------------------------------
// VALIDATION
// ---------------------------------------------------------------------------------------------------------------

export interface RawPainCheckIn {
  programExerciseId?: unknown;
  exerciseName?: unknown;
  bodyArea?: unknown;
  score?: unknown;
  kind?: unknown;
  acute?: unknown;
  note?: unknown;
}

export interface ValidatedPainCheckIn {
  programExerciseId: string | null;
  exerciseName: string;
  bodyArea: BodyAreaId;
  score: number;
  kind: PainCheckInKind;
  acute: AcuteEventId[];
  note: string | null;
}

/**
 * Validate + sanitize a raw check-in payload. Throws PainValidationError('invalid_check_in', details) rather than
 * guessing at a missing or malformed field — a malformed submission fails loudly and stores nothing, same as
 * lib/health/intake.ts's validateIntakeAnswers.
 */
export function validatePainCheckIn(raw: RawPainCheckIn): ValidatedPainCheckIn {
  const errors: string[] = [];

  const exerciseName = typeof raw.exerciseName === 'string' ? raw.exerciseName.trim() : '';
  if (!exerciseName) errors.push('exerciseName: required');

  const bodyArea = typeof raw.bodyArea === 'string' ? raw.bodyArea : '';
  if (!BODY_AREA_IDS.includes(bodyArea as BodyAreaId)) errors.push('bodyArea: unknown id');

  const score = typeof raw.score === 'number' ? raw.score : NaN;
  if (!Number.isInteger(score) || score < 0 || score > 10) errors.push('score: expected an integer 0-10');

  const kind = typeof raw.kind === 'string' ? raw.kind : '';
  if (!KINDS.includes(kind as PainCheckInKind)) errors.push('kind: expected during | after | next_morning');

  const acuteRaw = Array.isArray(raw.acute) ? raw.acute : [];
  const acute = acuteRaw.filter((a): a is AcuteEventId => typeof a === 'string' && ACUTE_EVENT_IDS.includes(a as AcuteEventId));
  if (acuteRaw.length !== acute.length) errors.push('acute: unknown event id');

  const note = typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim().slice(0, 500) : null;
  const programExerciseId = typeof raw.programExerciseId === 'string' && raw.programExerciseId ? raw.programExerciseId : null;

  if (errors.length) throw new PainValidationError('invalid_check_in', errors);

  return { programExerciseId, exerciseName, bodyArea: bodyArea as BodyAreaId, score, kind: kind as PainCheckInKind, acute, note };
}

// ---------------------------------------------------------------------------------------------------------------
// TREND
// ---------------------------------------------------------------------------------------------------------------

export interface PriorCheckIn {
  score: number;
  createdAt: Date;
}

/**
 * How this score compares with the athlete's own most recent PRIOR check-in for the SAME exercise + body area —
 * the only comparison painRule.ts's decide() reads (its 'next_morning' branch). No prior check-in (a first-time
 * report, or a different exercise/area) reads as 'unknown', which decide() treats as neutral, never as trending up.
 */
export function trendFrom(score: number, prior: PriorCheckIn | null): PainTrend {
  if (!prior) return 'unknown';
  if (score > prior.score) return 'up';
  if (score < prior.score) return 'down';
  return 'flat';
}

// ---------------------------------------------------------------------------------------------------------------
// SUBMIT
// ---------------------------------------------------------------------------------------------------------------

type PainDb = Pick<Prisma.TransactionClient, 'painCheckIn' | 'healthIntake' | 'user'>;

export interface SubmitPainCheckInInput {
  userId: string;
  raw: RawPainCheckIn;
  now?: Date;
}

export interface SubmitPainCheckInResult {
  checkIn: { id: string; decision: PainDecision; createdAt: Date };
  decision: PainDecision;
  copy: string;
  /** True for every outcome that means "put this exercise down right now" (painRule.ts isStopOutcome). */
  stop: boolean;
  /** True only for the two outcomes that hand this off to a person — a clinician or an adult (isHardStop). */
  hardStop: boolean;
}

/**
 * Validate, decide and store one pain check-in. Assembles decide()'s four inputs, here and nowhere else:
 *  - `trend`: this score against the athlete's own last check-in for the same exercise + body area (trendFrom).
 *  - `redFlags`: the athlete's STANDING intake red flags, but ONLY while still hard-stopped by them — defense in
 *     depth (see painRule.ts's own doc on this field); the primary gate is the intake gate in front of a session
 *     (app/play/mirror/_components/health-intake-gate.tsx), not this route.
 *  - `isMinor`: lib/mirror/youth.ts isMinorForMirror(User.dobYear) — the one age gate the whole app shares.
 */
export async function submitPainCheckIn(db: PainDb, input: SubmitPainCheckInInput): Promise<SubmitPainCheckInResult> {
  const v = validatePainCheckIn(input.raw);
  const now = input.now ?? new Date();

  const [prior, intake, user] = await Promise.all([
    db.painCheckIn.findFirst({
      where: { userId: input.userId, exerciseName: v.exerciseName, bodyArea: v.bodyArea },
      orderBy: { createdAt: 'desc' },
      select: { score: true, createdAt: true },
    }),
    db.healthIntake.findFirst({
      where: { userId: input.userId },
      orderBy: { createdAt: 'desc' },
      select: { redFlags: true, clearedAt: true },
    }),
    db.user.findUnique({ where: { id: input.userId }, select: { dobYear: true } }),
  ]);

  const trend = trendFrom(v.score, prior);
  // Only while STILL hard-stopped by them (a cleared intake's red flags no longer force every future check-in to
  // 'stop_see_clinician' — clearedAt is the athlete's own dated "I checked", and re-litigating it on every set would
  // make the clearance pointless).
  const standingRedFlags = intake && intake.redFlags.length > 0 && !intake.clearedAt ? intake.redFlags : [];
  const isMinor = isMinorForMirror(user?.dobYear ?? null, now);

  const decision = decide({ score: v.score, kind: v.kind, trend, acute: v.acute, redFlags: standingRedFlags, isMinor });

  const checkIn = await db.painCheckIn.create({
    data: {
      userId: input.userId,
      programExerciseId: v.programExerciseId,
      exerciseName: v.exerciseName,
      bodyArea: v.bodyArea,
      score: v.score,
      kind: v.kind,
      acute: v.acute,
      note: v.note,
      decision,
      createdAt: now,
    },
    select: { id: true, decision: true, createdAt: true },
  });

  return {
    // `decision` (the Prisma schema's `String` column) is re-typed here to the PainDecision this function itself
    // just wrote — decide()'s return type is the only source of truth for what that string can be.
    checkIn: { id: checkIn.id, decision, createdAt: checkIn.createdAt },
    decision,
    copy: PAIN_DECISION_COPY[decision],
    stop: isStopOutcome(decision),
    hardStop: isHardStop(decision),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// NEXT-MORNING FOLLOW-UP
// ---------------------------------------------------------------------------------------------------------------

/** One PainCheckIn row, as history-reading callers (the route, the coach flag) need it. */
export interface PainCheckInHistoryRow {
  id: string;
  exerciseName: string;
  bodyArea: string;
  programExerciseId: string | null;
  score: number;
  kind: PainCheckInKind;
  decision: PainDecision;
  createdAt: Date;
}

export interface PendingFollowUp {
  exerciseName: string;
  bodyArea: string;
  programExerciseId: string | null;
  /** Yesterday's (or earlier) score this follow-up is asking about. */
  score: number;
  decision: PainDecision;
  createdAt: Date;
}

const utcDay = (d: Date): number => Math.floor(d.getTime() / 86_400_000);

/**
 * Yesterday's (or any earlier, un-followed-up) flagged exercises: the most recent during/after check-in per
 * exercise + body area that reported real pain (score > 0), was not logged TODAY, has not already had a
 * next_morning follow-up since, and did not already escalate to a person. An acute-event or standing-red-flag stop
 * (stop_see_clinician) and a minor's stop (stop_tell_adult) are excluded — those already routed the athlete to a
 * clinician or an adult, and asking again in-app the next day adds nothing (painRule.ts isHardStop). A tolerable
 * 'continue' outcome IS included: painRule.ts's own file header says a during/after 'continue' is exactly the
 * reading whose real call is tomorrow's follow-up.
 *
 * `rows` should be recent history (the route reads the last two weeks) — this function does not itself bound how
 * far back it looks, so a caller that hands it a whole account's history would surface a very old, still-unfollowed
 * check-in too, which is the conservative direction to fail in.
 */
export function pendingNextMorningFollowUps(rows: readonly PainCheckInHistoryRow[], now: Date = new Date()): PendingFollowUp[] {
  const today = utcDay(now);
  const byGroup = new Map<string, PainCheckInHistoryRow[]>();
  for (const r of rows) {
    const key = `${r.exerciseName}\u0000${r.bodyArea}`;
    (byGroup.get(key) ?? byGroup.set(key, []).get(key)!).push(r);
  }

  const out: PendingFollowUp[] = [];
  for (const group of byGroup.values()) {
    const sorted = [...group].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const latestFollowUp = sorted.find((r) => r.kind === 'next_morning');
    const candidate = sorted.find(
      (r) =>
        r.kind !== 'next_morning' &&
        r.score > 0 &&
        utcDay(r.createdAt) < today &&
        !isHardStop(r.decision) &&
        (!latestFollowUp || latestFollowUp.createdAt.getTime() < r.createdAt.getTime()),
    );
    if (candidate) {
      out.push({
        exerciseName: candidate.exerciseName,
        bodyArea: candidate.bodyArea,
        programExerciseId: candidate.programExerciseId,
        score: candidate.score,
        decision: candidate.decision,
        createdAt: candidate.createdAt,
      });
    }
  }
  return out.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

// ---------------------------------------------------------------------------------------------------------------
// COACH VISIBILITY
// ---------------------------------------------------------------------------------------------------------------

export interface CoachPainFlagView {
  present: boolean;
  detailed: boolean;
  /** The line the coach's panel shows. Empty when `present` is false — nothing to show. */
  label: string;
  /** Only present when `detailed` is true (a live 'coach_view' HealthConsent grant for this coach). */
  items?: { exerciseName: string; bodyArea: string; decision: PainDecision; copy: string; createdAt: string }[];
}

const GENERIC_FLAG_LABEL = 'Client paused an exercise';

/**
 * What a coach sees for one client's recent pain flags. `hasCoachViewConsent` is a live 'coach_view' HealthConsent
 * grant for THIS coach — checked by the caller (the route), so this stays pure and untestable-against-Prisma-free.
 * Without it, the coach sees only that something happened — never which exercise, where, how bad, or the decision:
 * "client paused an exercise" and nothing else (owner rule: health data is opt-in per coach, never a blanket "my
 * coach can see everything" just because a program exists).
 */
export function coachPainFlag(rows: readonly PainCheckInHistoryRow[], hasCoachViewConsent: boolean): CoachPainFlagView {
  const flagged = rows.filter((r) => isStopOutcome(r.decision));
  if (!flagged.length) return { present: false, detailed: false, label: '' };
  if (!hasCoachViewConsent) return { present: true, detailed: false, label: GENERIC_FLAG_LABEL };

  const items = [...flagged]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10)
    .map((r) => ({
      exerciseName: r.exerciseName,
      bodyArea: r.bodyArea,
      decision: r.decision,
      copy: PAIN_DECISION_COPY[r.decision],
      createdAt: r.createdAt.toISOString(),
    }));
  return { present: true, detailed: true, label: `${flagged.length} pain flag${flagged.length === 1 ? '' : 's'}`, items };
}
