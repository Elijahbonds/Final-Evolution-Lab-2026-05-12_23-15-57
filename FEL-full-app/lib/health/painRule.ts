// lib/health/painRule.ts — MIRROR-COACH P5 (2026-09-29): the pain check-in rule.
//
// WHY ONE FILE. Owner decision #15 (DECISIONS.md): no clinician reviewed this. The mitigation the owner chose in
// its place is structural, not procedural — every threshold and every line of copy a pain check-in can show lives
// here, in one small pure module, so a real review (whenever it happens) has one file to read and one function to
// re-derive from a table of inputs. Nothing else in the app is allowed to grow its own pain threshold: the API route
// and any UI call `decide()` and print `PAIN_DECISION_COPY[decision]` — they do not re-decide anything or write
// their own line of reassurance.
//
// THE FIVE OUTCOMES, in the owner's own words (DECISIONS.md #5, #6; PLAN.md phase 5):
//   - 'continue'              — no pain, or a during/after reading that's tolerable; the real read is tomorrow.
//   - 'easier_variation'      — a next-morning check that settled and isn't trending up: keep going, but ease it.
//   - 'step_down_flag_coach'  — anything else non-emergency: didn't settle, or is trending up, or was never tolerable.
//   - 'stop_see_clinician'    — an acute event, or a standing red flag from the intake. Never a diagnosis.
//   - 'stop_tell_adult'       — ANY pain event for a minor, full stop, no exception (decision #6). A minor's path
//                                never reads 'stop_see_clinician': the first person in the loop is an adult, not a
//                                clinician a kid would have to find themselves.
//
// STAY CONSERVATIVE, STOP SOONER (decision #15). Two judgement calls this file has to make that the owner's prose
// didn't spell out in numbers — both documented here as `assumption:` so a real review has them named, not buried:
//
//   assumption: "tolerable" is score <= TOLERABLE_PAIN_MAX (3 of 10 — mild, per the common 0–10 self-report scale).
//   A 4+ is never called tolerable, at any kind or trend.
//
//   assumption: a during/after reading (not yet a next-morning follow-up) either 'continue's (tolerable, and the
//   real call is tomorrow's follow-up) or 'step_down_flag_coach's (not tolerable, right now, no reason to wait for
//   morning to say so). Only a 'next_morning' kind can produce 'easier_variation' — that outcome is specifically the
//   reward for having settled overnight, which a same-session reading cannot yet have done.
//
// NEVER SCORED. Nothing in this file, or in what calls it, feeds PRQ, a payout, a streak or any rewarded number
// (decision #4, #12) — a pain check-in has no way to help or hurt an athlete's numbers, on purpose.

/** The fixed list of acute events the intake/check-in copy names (owner decision #5's own parenthetical). Never
 *  free text — the rule reads ids, and a UI renders `label`. */
export const ACUTE_EVENTS = [
  { id: 'pop', label: 'Felt or heard a pop' },
  { id: 'sudden_swelling', label: 'Sudden swelling' },
  { id: 'giving_way', label: 'The joint gave way or buckled' },
  { id: 'fall_or_impact', label: 'Started after a fall or a hit' },
] as const;

export type AcuteEventId = (typeof ACUTE_EVENTS)[number]['id'];
export const ACUTE_EVENT_IDS: readonly AcuteEventId[] = ACUTE_EVENTS.map((e) => e.id);

/** A fixed id list for PainCheckIn.bodyArea (schema.prisma) — never free text, so the rule and any later reporting
 *  can group on it. Broad regions, not joints-of-a-joint: fine enough for "where", not a diagnosis of "what". */
export const BODY_AREAS = [
  { id: 'neck', label: 'Neck' },
  { id: 'shoulder', label: 'Shoulder' },
  { id: 'elbow_wrist_hand', label: 'Elbow, wrist or hand' },
  { id: 'upper_back', label: 'Upper back' },
  { id: 'low_back', label: 'Low back' },
  { id: 'hip', label: 'Hip' },
  { id: 'knee', label: 'Knee' },
  { id: 'ankle_foot', label: 'Ankle or foot' },
  { id: 'other', label: 'Somewhere else' },
] as const;

export type BodyAreaId = (typeof BODY_AREAS)[number]['id'];
export const BODY_AREA_IDS: readonly BodyAreaId[] = BODY_AREAS.map((a) => a.id);

/** during = mid-set; after = right after the exercise; next_morning = the following day's follow-up. */
export type PainCheckInKind = 'during' | 'after' | 'next_morning';

/** How this check-in's score compares with the athlete's last one for the same exercise + body area.
 *  'unknown' (no prior check-in to compare against) is treated as neutral — it never reads as trending up. */
export type PainTrend = 'up' | 'flat' | 'down' | 'unknown';

export type PainDecision =
  | 'continue'
  | 'easier_variation'
  | 'step_down_flag_coach'
  | 'stop_see_clinician'
  | 'stop_tell_adult';

export interface PainDecisionInput {
  /** 0–10. */
  score: number;
  kind: PainCheckInKind;
  trend: PainTrend;
  /** Acute-event ids present on THIS check-in (ACUTE_EVENT_IDS). Usually empty. */
  acute: readonly string[];
  /** Standing red-flag ids from the athlete's current HealthIntake (lib/health/intake.ts redFlagsFor). Usually
   *  empty — a non-empty intake red flag list hard-stops training before a check-in is ever reachable
   *  (HealthIntake.clearedAt / isHardStopped), so this is defense in depth, not the primary gate. */
  redFlags: readonly string[];
  /** From lib/mirror/youth.ts isMinorForMirror(User.dobYear) — the one age gate the whole app shares. This module
   *  takes the boolean, not a birth year: it stays pure and never reaches for a clock or a rule that belongs to
   *  another module (see that file's own comment on why "unknown age" reads the same as "minor"). */
  isMinor: boolean;
}

/** assumption: mild, per the common 0–10 self-report pain scale (see the file header). */
export const TOLERABLE_PAIN_MAX = 3;

function isTolerable(score: number): boolean {
  return score <= TOLERABLE_PAIN_MAX;
}

/**
 * The pain check-in rule. Pure: same input, same output, always — see the file header for why that is the whole
 * point of this module existing on its own.
 */
export function decide(input: PainDecisionInput): PainDecision {
  const hasPain = input.score > 0;
  const hasAcute = input.acute.length > 0;
  const hasRedFlag = input.redFlags.length > 0;

  // Decision #6: ANY pain event for a minor stops and tells an adult — first, before anything else below, and with
  // no substitute outcome. A minor never sees 'stop_see_clinician': the first call is to an adult, not a clinic a
  // kid would have to find on their own.
  if (input.isMinor && (hasPain || hasAcute)) return 'stop_tell_adult';

  // An acute event on THIS check-in, or a standing red flag on the intake, always outranks a settled/trending read.
  if (hasAcute || hasRedFlag) return 'stop_see_clinician';

  // No pain at all: nothing to act on.
  if (!hasPain) return 'continue';

  if (input.kind === 'next_morning') {
    // The only place 'easier_variation' can come from: it settled by morning AND isn't trending up.
    return isTolerable(input.score) && input.trend !== 'up' ? 'easier_variation' : 'step_down_flag_coach';
  }

  // during / after: tolerable now waits for tomorrow's read; not tolerable steps down today, no waiting.
  return isTolerable(input.score) ? 'continue' : 'step_down_flag_coach';
}

/** FEL's own words for each outcome (IP rule: never the book's phrases or method names). No diagnosis, no condition
 *  name, no treatment claim — a line says what to do next, never what is wrong. */
export const PAIN_DECISION_COPY: Record<PainDecision, string> = {
  continue:
    "Not enough there to change anything. Keep going as planned — we'll check in again after this or the morning after.",
  easier_variation:
    "That settled overnight and isn't creeping up. Keep training, and we've queued an easier variation of this move for now.",
  step_down_flag_coach:
    "That hasn't settled, or it's trending up. Step down to an easier variation, and we're letting your coach know.",
  stop_see_clinician:
    "That's the kind of thing we don't guess about here. Stop this exercise and check with a clinician before you train it again.",
  stop_tell_adult:
    'Stop this exercise and tell an adult what happened before you do anything else.',
};

/** True for the outcomes that mean "put this exercise down right now" (every non-continuing outcome except the
 *  proactive easier-variation swap, which keeps training just with a lighter version). A UI gate reads this rather
 *  than re-deriving it from the five string literals. */
export function isStopOutcome(decision: PainDecision): boolean {
  return decision === 'step_down_flag_coach' || decision === 'stop_see_clinician' || decision === 'stop_tell_adult';
}

/** True only for the two outcomes that tell the athlete to stop and involve someone else (a clinician or an adult) —
 *  as opposed to 'step_down_flag_coach', which steps down but keeps training. */
export function isHardStop(decision: PainDecision): boolean {
  return decision === 'stop_see_clinician' || decision === 'stop_tell_adult';
}
