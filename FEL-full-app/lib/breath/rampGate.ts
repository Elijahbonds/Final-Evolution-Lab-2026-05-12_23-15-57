// lib/breath/rampGate.ts — MIRROR-COACH P7 (2026-09-29): the adults-only Dial-Up Breath, and every gate in front of it.
//
// WHAT WAS MISSING. The crossref's breathing row (crossref-wf_dfad67b3-209.json, "Book cross-check, breathing
// strategies"): "There is no way to prescribe a ramp-up breath on the heaviest set with a weekly cap." FEL's only breaths
// were calming ones — the Wake-Up's Pressurize (lib/drills/drills.ts:120), the Mirror's 4-2-6 and P6's recovery breath
// (lib/coach/cooldown.ts RECOVERY_BREATH). Owner decision #11: "ADD BOTH — ramp-up breath adults-only behind the intake
// on the flagged key set (FEL's own weekly limit, before unracking)". Decision #6: under-18s get NO ramp-up breath.
//
// FEL'S OWN NAME, WORDS AND DOSE (IP RULE). It is the DIAL-UP BREATH — from the owner's own Neuro-Mechanic Playbook
// line "Your Breath Is the Control Dial" (lib/education/playbook.data.json, ch2): the Playbook's calming breaths turn
// the dial down; this one turns it up for one set. Never the book's method name, never its dose. The dose is FEL's
// choice and deliberately small: five quick breaths, one second in and one second out, about ten seconds
// (RAMP_PACER), then normal breathing before the athlete sets up. The copy says what to do and when; it claims nothing
// about the body (no nervous-system, heart-rate or oxygen words, no "stronger", nothing about injury) — ramp-copy.test.ts
// lints every line.
//
// ONE PACER. The breath runs on lib/breath/pacer.ts (the phase's one pacer, the drill chart's own shape): RAMP_PACER is
// a PacerSpec like every other breath in the app, and components/coach/ramp-breath.tsx draws it with that module.
//
// THE GATES — ALL SERVER-CHECKED (lib/breath/rampServer.ts reads the facts, this file decides; the client is only ever
// told the answer). Every one must pass; each failure is a named reason so a test can hold each gate alone:
//   · AGE. A known birth year that reads as an adult (lib/mirror/youth.ts isMinorForMirror — the one age truth; by
//     calendar year it needs MORE than 18, so a year-only birth date never lets a 17-year-old through before their
//     birthday). A blank birth year is youth (decision #20): 'age_unknown'; under that: 'minor'.
//   · CONSENT. A live 'health_data' HealthConsent (P5, lib/health/consent.ts activeHealthDataConsent): 'no_health_consent'.
//     Without it the gate judges none of the health facts, and the ramp's own reads of the pain, readiness and intake
//     history rows are not made (rampServer.ts; Today's own P5 hard-stop read of the newest intake happens either way).
//     And FEL's record of that consent must go back at least one full limit window (RAMP_LIMIT.firstUseAfterDays):
//     'consent_new' — see THE LIMIT CANNOT BE RESET below.
//   · THE INTAKE. A current one (lib/health/intake.ts needsIntake: this question set, under a year old): 'intake_missing'
//     / 'intake_stale'. NO red flag on it — cleared or not (see RED FLAGS below): 'red_flag'. And every question in
//     RAMP_MUST_ANSWER_NO answered an explicit "no": a "yes" is 'intake_answer', a skip is 'intake_unanswered'. And no
//     EARLIER intake inside the year said "yes" to a lasting answer or carried a red flag: 'intake_history' (see RED
//     FLAGS).
//   · TODAY'S PAIN. lib/coach/warmup.ts painDecisionToday — P6's read of the stored lib/health/painRule.ts decisions,
//     never re-decided — must be none or 'continue': 'pain_today'.
//   · TODAY'S READINESS. P6's check-in (lib/health/readiness.ts readReadiness) must not read 'low': 'readiness_low'.
//   · FEL'S WEEKLY LIMIT (RAMP_LIMIT, one constant): 'weekly_limit', 'this_session', 'too_soon'.
//   · THE SET. The exercise is on TODAY's session as Today shows it (lib/coach/todayServer.ts loadToday): 'not_today';
//     it is the session's flagged key set (P2's isKeySet): 'not_key_set'; the session is not an off day: 'off_day';
//     and the set has not started — no set of it logged yet, so the breath comes BEFORE unracking and never mid-set or
//     mid-lift: 'set_started'.
//
// RED FLAGS. assumption: a red flag on the intake keeps the Dial-Up Breath off even after the athlete's self-attested
// clearance (HealthIntake.clearedAt). A clearance lifts P5's pause on training in general; it was never a yes to a
// sharp breath before a heavy set. The conservative reading of the brief's "a completed health intake with NO red flag"
// (owner decision #15: stop sooner).
//
// MIRROR-COACH P7 FIX (2026-09-29, review): A RE-TAKE DOES NOT ERASE A "YES". The gate used to read only the NEWEST
// intake, and this paragraph ended "The athlete can re-take the intake; a clean one opens it" — so a clearance that
// names a clinician was refused, while the easier path that names nothing (POST the intake again, answer "no") opened
// the breath a minute later. The questions it re-answers are lasting facts ("Has a doctor EVER told you about a heart
// or blood-pressure condition?", "Does physical effort EVER bring on dizziness, fainting or chest pain?"). Now every
// intake inside the intake's own year (INTAKE_REASK_DAYS) is read, and an EARLIER one with a red flag, or a "yes" on
// a RAMP_STICKY_YES answer, keeps it off ('intake_history') until that intake is over a year old — the same yearly
// clock the intake re-asks on. Pregnancy is judged on the newest intake only: that answer does resolve. assumption:
// heart-rate-or-balance medicine is sticky too, although it is a "do you take" question — a change of that medicine is
// exactly what a sharp breath should wait out (decision #15, stop sooner).
//
// THE WEEKLY COUNT, AND THE FIRST WEEK (MIRROR-COACH P7 FIX, 2026-09-29, review; MIRROR-COACH-ERASE, owner 07:53 PT).
// Both erases delete every BreathLog row (lib/prq-data-rights.ts). They KEEP every HealthConsent row. RAMP_LIMIT
// .firstUseAfterDays is the first-opt-in week: the OLDEST 'health_data' grant FEL holds (revoked or not) must be at
// least one full window old (consentOldEnough). Erase does not delete that ledger and does not restart this clock —
// the owner dropped the post-erase wait ("No wait and fix"). A grant already a full window old stays old enough.
// A withdraw-and-re-grant keeps the old rows, so it waits for nothing. A brand-new athlete, whose oldest grant is
// new, still waits the first week. BreathLog deletion can clear the rolling use count; the owner accepted that.
// The erase also clears the intake history above; that is the erase right.
//
// NOT SCORED, NOT PAID, NO STREAK (phase rule (e)). A use is logged only to count it against the limit (BreathLog,
// lib/breath/rampServer.ts), in the export and both erases (lib/prq-data-rights.ts), and read by nothing that scores,
// pays, ranks or keeps a streak (lib/breath/ramp-never-scored.test.ts).
//
// Pure: no Prisma, no fetch, no clock of its own (every time-aware function takes `now`).
import { INTAKE_IDS, INTAKE_REASK_DAYS, RED_FLAG_QUESTION_IDS, needsIntake, type IntakeQuestionId } from '../health/intake';
import { isMinorForMirror } from '../mirror/youth';
import { youthGateFor } from '../mirror/screenCorrectives';
import type { PainDecision } from '../health/painRule';
import { EARLIEST_UTC_OFFSET_H, LATEST_UTC_OFFSET_H, type ReadinessLevel } from '../health/readiness';
import { pacerEndSec, type PacerSpec } from './pacer';

// ── the log ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Every BreathLog.kind this app writes (schema.prisma BreathLog). 'ramp' = one Dial-Up Breath started. */
export const BREATH_LOG_KINDS = ['ramp'] as const;
export type BreathLogKind = (typeof BREATH_LOG_KINDS)[number];
export const RAMP_KIND: BreathLogKind = 'ramp';

// ── FEL's weekly limit ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * FEL'S OWN LIMIT, in one constant (the brief: "conservative, e.g. at most 2 sessions a week and one key set per
 * session"). FEL's numbers, not a published dose:
 *   · perWindow / windowDays — at most 2 uses in any 7 days, counted as a ROLLING week (no calendar week to argue
 *     about across time zones, and a Sunday + Monday pair cannot turn into four in eight days);
 *   · perSession — one key set per session: a second request for the same coached session is refused, even if the
 *     first was abandoned partway (a use is logged when it STARTS);
 *   · minHoursBetween — assumption: never two in one day, even across two sessions. "2 sessions a week" read
 *     conservatively: two separate days;
 *   · firstUseAfterDays — the oldest health-data consent FEL holds must be at least this many days old before the
 *     Dial-Up Breath is offered (consentOldEnough). A first opt-in waits this week. Erase keeps the ledger, so it
 *     does not restart this clock (MIRROR-COACH-ERASE, owner 07:53 PT). Equal to windowDays.
 */
export const RAMP_LIMIT = { perWindow: 2, windowDays: 7, perSession: 1, minHoursBetween: 24, firstUseAfterDays: 7 } as const;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** The start of the rolling window the limit counts over. */
export const rampWindowStart = (now: Date): Date => new Date(now.getTime() - RAMP_LIMIT.windowDays * DAY_MS);

export interface RampUse { createdAt: Date | string; sessionId: string | null }

const timeOf = (v: Date | string): number => (v instanceof Date ? v.getTime() : Date.parse(v));

/** The uses that count at `now`: inside the rolling window, and not stamped in the future (a skewed clock). */
export function usesInWindow(uses: readonly RampUse[], now: Date): RampUse[] {
  const from = rampWindowStart(now).getTime();
  const to = now.getTime() + 60_000;
  return uses.filter((u) => { const t = timeOf(u.createdAt); return Number.isFinite(t) && t >= from && t <= to; });
}

export type RampLimitReason = 'weekly_limit' | 'this_session' | 'too_soon';

/** The limit's reasons for a new use on `sessionId` at `now`, given the earlier uses. Empty = within the limit. */
export function rampLimitReasons(uses: readonly RampUse[], sessionId: string | null, now: Date): RampLimitReason[] {
  const inWindow = usesInWindow(uses, now);
  const out: RampLimitReason[] = [];
  if (inWindow.length >= RAMP_LIMIT.perWindow) out.push('weekly_limit');
  if (sessionId !== null && inWindow.filter((u) => u.sessionId === sessionId).length >= RAMP_LIMIT.perSession) out.push('this_session');
  const gapFrom = now.getTime() - RAMP_LIMIT.minHoursBetween * HOUR_MS;
  if (inWindow.some((u) => timeOf(u.createdAt) > gapFrom)) out.push('too_soon');
  return out;
}

/** Uses left in the rolling week (0 when the limit is reached). */
export const rampUsesLeft = (uses: readonly RampUse[], now: Date): number => Math.max(0, RAMP_LIMIT.perWindow - usesInWindow(uses, now).length);

/** A logged use as the race check reads it back (a BreathLog row). */
export interface RampLoggedUse extends RampUse { id: string }

/**
 * THE RACE CHECK (MIRROR-COACH P7 FIX, 2026-09-29, review). After a POST writes its use, it reads the window back and
 * keeps the use only when EVERY OTHER use it can see still leaves room for it. The first version compared only against
 * the uses ordered BEFORE its own (insert time, then id) and claimed "the limit is never exceeded"; but the insert time
 * is the database's transaction START, and a row is invisible until its insert commits. Two tabs: A stamps t1 and
 * commits late; B stamps t2 > t1, commits and reads before A commits, so B cannot see A and keeps; A then sees B but B
 * sorts AFTER A, so A kept too — two uses for one session in one day.
 *
 * Counting every visible other use instead: each racer reads after its OWN insert committed, so of any two racers at
 * least one sees the other (if A's read came before B's commit and B's read before A's commit, A's commit < A's read <
 * B's commit < B's read < A's commit — impossible). Whoever sees a conflicting use backs its own row out, so two never
 * both stay. The cost is the careful direction: when both see each other, both back out, and the athlete's retry is
 * answered on a clean log. The rows that existed before the gate ran already passed it, so only a racer can trip this.
 */
export function rampRaceReasons(rows: readonly RampLoggedUse[], selfId: string, sessionId: string | null, now: Date): RampLimitReason[] {
  return rampLimitReasons(rows.filter((r) => r.id !== selfId), sessionId, now);
}

/** Whether FEL's record of the athlete's health-data consent goes back one full window (RAMP_LIMIT.firstUseAfterDays).
 *  `since` = the OLDEST 'health_data' grant on the ledger, revoked or not; null = none. */
export const consentOldEnough = (since: Date | string | null | undefined, now: Date): boolean => {
  if (since == null) return false;
  const t = timeOf(since);
  return Number.isFinite(t) && now.getTime() - t >= RAMP_LIMIT.firstUseAfterDays * DAY_MS;
};

// ── the intake ───────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The intake answers that keep the Dial-Up Breath off unless each was answered an explicit "no" — the brief's
 * "none of the cardio, blood-pressure, dizziness/fainting or pregnancy answers", read from lib/health/intake.ts's own
 * ids (INTAKE_IDS), never re-typed:
 *   · effort-brought dizziness, fainting or chest pain (INTAKE_IDS.dizzinessFaintingChestPain);
 *   · a heart or blood-pressure condition a doctor mentioned (heartOrBpCondition) — the cardio and blood-pressure answer;
 *   · medicine that affects heart rate or balance (heartRateOrBalanceMedicine) — assumption: a cardio answer too. A
 *     sharp breath is exactly the thing to hold back when heart rate or balance is being managed with medicine;
 *   · pregnancy or within about 3 months postpartum (pregnancyOrPostpartum) — never a stop for training (the intake's
 *     own header), only a no to this one breath;
 * plus every red-flag question (RED_FLAG_QUESTION_IDS — a clinician's "avoid" too), so a SKIPPED red-flag question is
 * not read as a clean one.
 * A skip is not a "no" (the intake's own rule: "no" and "skipped" are different answers), so a skip keeps it off too.
 */
export const RAMP_MUST_ANSWER_NO: readonly IntakeQuestionId[] = [...new Set<IntakeQuestionId>([
  INTAKE_IDS.dizzinessFaintingChestPain,
  INTAKE_IDS.heartOrBpCondition,
  INTAKE_IDS.heartRateOrBalanceMedicine,
  INTAKE_IDS.pregnancyOrPostpartum,
  ...(RED_FLAG_QUESTION_IDS as readonly IntakeQuestionId[]),
])];

/** The intake, as the gate needs it (a HealthIntake row fits). */
export interface RampIntake {
  version: string;
  createdAt: Date;
  /** HealthIntake.answers (Json): the validated answers, keyed by question id. */
  answers: unknown;
  redFlags: readonly string[];
  clearedAt?: Date | null;
}

export type RampIntakeReason = 'intake_missing' | 'intake_stale' | 'red_flag' | 'intake_answer' | 'intake_unanswered' | 'intake_history';

/**
 * The answers that describe something lasting, so a "yes" on ANY intake inside the year keeps the breath off even when
 * a later intake says "no" (see RED FLAGS in the header). Read from the intake's own ids, never re-typed. Pregnancy is
 * left out on purpose: it resolves, and the newest intake's answer is the one that counts for it.
 */
export const RAMP_STICKY_YES: readonly IntakeQuestionId[] = [
  INTAKE_IDS.dizzinessFaintingChestPain,
  INTAKE_IDS.heartOrBpCondition,
  INTAKE_IDS.heartRateOrBalanceMedicine,
];

/** How far back earlier intakes are read: the intake's own yearly re-ask clock. */
export const RAMP_HISTORY_DAYS = INTAKE_REASK_DAYS;

/** An earlier intake, as the history check needs it (a HealthIntake row fits). */
export interface RampIntakeHistoryItem { createdAt: Date | string; answers: unknown; redFlags: readonly string[] }

const answersOf = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * 'intake_history' when an intake EARLIER than the newest one, and inside RAMP_HISTORY_DAYS of `now`, carried a red
 * flag (cleared or not) or answered "yes" to a RAMP_STICKY_YES question. The newest intake is judged by
 * rampIntakeReasons; this reads only what came before it.
 */
export function rampIntakeHistoryReasons(history: readonly RampIntakeHistoryItem[] | null | undefined, newest: Pick<RampIntake, 'createdAt'> | null | undefined, now: Date): RampIntakeReason[] {
  if (!newest || !history?.length) return [];
  const newestT = timeOf(newest.createdAt);
  const from = now.getTime() - RAMP_HISTORY_DAYS * DAY_MS;
  const earlier = history.filter((h) => { const t = timeOf(h.createdAt); return Number.isFinite(t) && t < newestT && t >= from; });
  const flagged = earlier.some((h) => (h.redFlags?.length ?? 0) > 0 || RAMP_STICKY_YES.some((id) => answersOf(h.answers)[id] === true));
  return flagged ? ['intake_history'] : [];
}

export function rampIntakeReasons(intake: RampIntake | null | undefined, now: Date): RampIntakeReason[] {
  if (!intake) return ['intake_missing'];
  const out: RampIntakeReason[] = [];
  if (needsIntake(intake, now)) out.push('intake_stale');
  if (intake.redFlags.length > 0) out.push('red_flag'); // cleared or not — see RED FLAGS in the header
  const answers = answersOf(intake.answers);
  if (RAMP_MUST_ANSWER_NO.some((id) => answers[id] === true)) out.push('intake_answer');
  if (RAMP_MUST_ANSWER_NO.some((id) => answers[id] !== true && answers[id] !== false)) out.push('intake_unanswered');
  return out;
}

// ── today's pain and readiness ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Today's pain decision allows the Dial-Up Breath only when there is none, or it is 'continue'. The brief names
 * step-down and stop; assumption: 'easier_variation' keeps it off too — that decision means a pain reading is still
 * being eased off this week, which is not the day to dial a heavy set up (decision #15: stop sooner).
 */
export const painAllowsRamp = (d: PainDecision | null | undefined): boolean => d == null || d === 'continue';

const READINESS_CARE: Record<ReadinessLevel, number> = { skip: 0, ok: 1, low: 2 };

/** The most careful of today's readiness reads (a check-in can belong to either of two "todays" near midnight UTC). */
export function mostCarefulReadiness(levels: readonly ReadinessLevel[]): ReadinessLevel | null {
  return levels.reduce<ReadinessLevel | null>((a, b) => (a === null || READINESS_CARE[b] > READINESS_CARE[a] ? b : a), null);
}

const utcDayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * The calendar days that are "today" somewhere on Earth at `now` (UTC-12 to UTC+14, P6's own bound — lib/health/
 * readiness.ts isPlausibleToday). The server does not know the athlete's time zone and does not take the day from the
 * client (a chosen day could be one with no low check-in on it): every plausible today's check-in is read and the most
 * careful wins. Near midnight UTC that can let last night's 'low' hold the breath back a few hours longer — the careful
 * direction, and nothing is lost but an optional breath.
 */
export function plausibleTodayKeys(now: Date): string[] {
  const t = now.getTime();
  const keys: string[] = [];
  for (let h = EARLIEST_UTC_OFFSET_H; h <= LATEST_UTC_OFFSET_H; h++) {
    const k = utcDayKey(t + h * HOUR_MS);
    if (!keys.includes(k)) keys.push(k);
  }
  return keys;
}

// ── the set ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The exercise asked about, as Today has it — null when it is not on today's session at all. */
export interface RampTarget {
  /** The coached Session it belongs to (Session.id). */
  sessionId: string;
  /** P2's flag: the one set the session is built around. */
  isKeySet: boolean;
  sessionKind: 'training' | 'recovery';
  /** A set of it is already logged on the open session (keySetStarted). */
  setStarted: boolean;
}

/** One saved set's values (a SetLog row, or Today's OpenSetLog). */
export interface LoggedSetLike { reps?: unknown; weightKg?: unknown; rir?: unknown; effort?: unknown; workSeconds?: unknown }

/** A logged set with anything in it, or a completed exercise log, means the key set has started — the breath is for
 *  before the first set, never between reps or mid-set. */
export function keySetStarted(log: { completedAt?: Date | string | null; setLogs?: readonly LoggedSetLike[] } | null | undefined): boolean {
  if (!log) return false;
  if (log.completedAt) return true;
  return (log.setLogs ?? []).some((s) => [s.reps, s.weightKg, s.rir, s.effort, s.workSeconds].some((v) => v !== null && v !== undefined));
}

// ── the verdict ──────────────────────────────────────────────────────────────────────────────────────────────────────

export type RampReason =
  | 'age_unknown' | 'minor'
  | 'no_health_consent' | 'consent_new'
  | RampIntakeReason
  | 'pain_today' | 'readiness_low'
  | RampLimitReason
  | 'not_today' | 'not_key_set' | 'off_day' | 'set_started'
  /** Only from POST's race check (rampRaceReasons): another request's use landed at the same moment. */
  | 'raced';

/** Everything the gate reads — assembled server-side only (lib/breath/rampServer.ts loadRampFacts). */
export interface RampFacts {
  dobYear: number | null | undefined;
  healthDataConsent: boolean;
  /** The OLDEST 'health_data' grant on the ledger, revoked or not (consentOldEnough). null = none on file. */
  healthDataSince: Date | null;
  /** The newest intake (null = none on file, or not read because there is no consent). */
  intake: RampIntake | null;
  /** Every intake inside RAMP_HISTORY_DAYS, the newest included (rampIntakeHistoryReasons reads the earlier ones).
   *  Empty when there is no consent: not read. */
  intakeHistory: readonly RampIntakeHistoryItem[];
  painDecision: PainDecision | null;
  /** The most careful of today's readiness reads; null = no check-in. */
  readiness: ReadinessLevel | null;
  /** Earlier Dial-Up uses (kind 'ramp'); the gate keeps only those in the rolling window. */
  uses: readonly RampUse[];
  target: RampTarget | null;
}

export interface RampVerdict {
  eligible: boolean;
  /** Every gate that failed, in the order above. Empty exactly when eligible. */
  reasons: RampReason[];
  /** Uses left in the rolling week, before this one. */
  usesLeft: number;
}

/**
 * THE GATE. Pure: the same facts give the same verdict. Every gate is evaluated (not first-fail) so a test can hold each
 * one alone and a report can say everything that is in the way; `eligible` is simply "no reasons".
 */
export function rampGate(f: RampFacts, now: Date = new Date()): RampVerdict {
  const reasons: RampReason[] = [];
  // age — the one age truth (isMinorForMirror: a year-only birth date counts as adult only once the calendar year says
  // OVER 18, so this year's 18th birthday may still be ahead); its two non-adult outcomes named apart only for the
  // reason code, by the function it wraps
  if (isMinorForMirror(f.dobYear, now)) reasons.push(youthGateFor(f.dobYear, now) === 'unknownAge' ? 'age_unknown' : 'minor');
  // consent first among the health gates; with none, the health facts were not read and are not judged
  if (!f.healthDataConsent) reasons.push('no_health_consent');
  else {
    if (!consentOldEnough(f.healthDataSince, now)) reasons.push('consent_new');
    reasons.push(...rampIntakeReasons(f.intake, now));
    reasons.push(...rampIntakeHistoryReasons(f.intakeHistory, f.intake, now));
    if (!painAllowsRamp(f.painDecision)) reasons.push('pain_today');
    if (f.readiness === 'low') reasons.push('readiness_low');
  }
  reasons.push(...rampLimitReasons(f.uses, f.target?.sessionId ?? null, now));
  if (!f.target) reasons.push('not_today');
  else {
    if (!f.target.isKeySet) reasons.push('not_key_set');
    if (f.target.sessionKind === 'recovery') reasons.push('off_day');
    if (f.target.setStarted) reasons.push('set_started');
  }
  return { eligible: reasons.length === 0, reasons, usesLeft: rampUsesLeft(f.uses, now) };
}

// ── the breath ───────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The Dial-Up Breath on the one pacer (lib/breath/pacer.ts, the drill chart's own shape): a 3-second get-ready, then
 * five breaths of one second in, one second out — FEL's dose, about ten seconds of breathing. Short on purpose: long
 * runs of fast breathing are what make people lightheaded, and the stop line is always on screen anyway.
 */
export const RAMP_PACER: PacerSpec = { from: 3, inSec: 1, holdSec: 0, outSec: 1, rounds: 5 };

/** Seconds from Start to the last breath out. */
export const RAMP_RUN_SEC = pacerEndSec(RAMP_PACER);

// ── the words (FEL's own; ramp-copy.test.ts lints every one) ─────────────────────────────────────────────────────────

export const RAMP_NAME = 'Dial-Up Breath';

/** The option on the key set's card. */
export const RAMP_OFFER = 'Optional: dial up before this set';
export const RAMP_OFFER_BUTTON = 'Dial up first';

/** Always on screen with the breath: before, during and after. */
export const RAMP_STOP_LINE = 'Lightheaded, dizzy or tingling? Stop, breathe normally and sit down. No more dialing up today.';

/** The one-screen explanation, in order. `usesLeft` is the server's count before this use. */
export function rampExplainLines(usesLeft: number): { id: string; text: string }[] {
  const left = Math.max(0, Math.min(RAMP_LIMIT.perWindow, Math.floor(usesLeft)));
  return [
    { id: 'what', text: `${RAMP_PACER.rounds} quick, sharp breaths: a short sniff in through the nose, a hard puff out through the mouth. About ${RAMP_RUN_SEC - RAMP_PACER.from} seconds, to get switched on for your key set.` },
    { id: 'when', text: 'Only here, before you set up for the first set. Never during a set or a rep. Stand clear of the bar, finish the breaths, breathe normally, then set up.' },
    { id: 'limit', text: `At most ${RAMP_LIMIT.perWindow} sessions in any ${RAMP_LIMIT.windowDays} days, one key set per session, at least a day apart. ${left} of ${RAMP_LIMIT.perWindow} left this week.` },
    { id: 'who', text: "Offered only to adults whose health answers and today's check-ins allow it." },
    { id: 'optional', text: "Optional. Skipping it changes nothing, and it is never scored, paid or counted toward a streak." },
  ];
}

/** What the ring's host line says for each part (the pacer's own caption says which part). */
export const RAMP_PHASE_LINES = {
  before: 'Stand tall, feet set, clear of the bar.',
  in: 'Sharp sniff in',
  out: 'Hard puff out',
  after: 'Breathe normally. Then set up for set 1.',
} as const;

export const RAMP_START_BUTTON = `Start (${RAMP_RUN_SEC} s)`;
export const RAMP_SKIP_BUTTON = 'Not today';
export const RAMP_DONE_LINE = 'Done. Breathe normally, then set up and start set 1.';
/** MIRROR-COACH P7 FIX (2026-09-29): a set timer started (or a set row filled) while the breath ran — it is cut. */
export const RAMP_INTERRUPTED_LINE = 'Your set has started, so the breath stopped. Breathe normally.';

/** A refusal from POST /api/breath/ramp, in words. The set is always still there. */
export const RAMP_REFUSED_COPY: Partial<Record<RampReason, string>> & { default: string } = {
  weekly_limit: "This week's dial-ups are used. Your set is ready as it is.",
  this_session: 'Already used for this session. Your set is ready as it is.',
  // MIRROR-COACH P7 FIX (2026-09-29, review): was "Already used today." — false for a use at 20:00 yesterday refused at
  // 08:00 today, since the rule is a rolling RAMP_LIMIT.minHoursBetween, not a calendar day
  too_soon: `Used in the last ${RAMP_LIMIT.minHoursBetween} hours. Your set is ready as it is.`,
  raced: 'Another tap got there at the same moment. Your set is ready as it is; try once more if you still want it.',
  set_started: 'This set has started, so no dial-up now. Keep going as planned.',
  default: 'Not available right now. Your set is ready as it is.',
};

export const rampRefusedText = (reason: string | null | undefined): string =>
  (reason && reason in RAMP_REFUSED_COPY ? RAMP_REFUSED_COPY[reason as RampReason] : undefined) ?? RAMP_REFUSED_COPY.default;
