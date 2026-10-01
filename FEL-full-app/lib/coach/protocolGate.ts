// lib/coach/protocolGate.ts — MIRROR-COACH P8 (2026-09-29): THE PROTOCOL GATE. Plyometrics and depth drops, and every
// check in front of them, in one pure module.
//
// WHAT WAS WRONG. The crossref (crossref-wf_dfad67b3-209.json): "/workout bypasses it and gives every buyer Depth Drop to
// Vertical 4×4 in week 1", and its critic: "The protocol gate and screen payouts rest on client-declared grades … Any
// future camera grader must run in a way the server can check before the result unlocks load (depth drops)", and "Using
// dunkTracker's 2-D landing-stability estimate as the gate that clears plyometric primers turns an 'estimated' camera
// read into a safety clearance … Use it as one conservative input alongside age, the intake and self-report, and never
// word it as 'cleared'." A coach's program had no gate at all: a Pogo hop or a depth drop reached Today for anyone.
//
// THE RULE (PHASE-8 rule (b); owner decisions #6, #10, #15, #20). A gated item — a plyometric or a depth drop — shows as
// written only for an ADULT with a COMPLETED INTAKE (no red flag), TODAY'S PAIN DECISION 'continue', AND A LANDING CHECK
// ON FILE (a passed landing read in the last LANDING_CHECK_WEEKS weeks). Otherwise it is replaced by its ladder's easier
// step (ProgramExercise.regressionOfId, walked down past any step that is gated too), and the athlete sees why in one
// line. With no ungated step on its ladder it is held back for today, with the same line. Every check is evaluated (not
// first-fail) so a test can hold each alone and the coach can read everything in the way; `open` is simply "no reasons".
//
// THE COACH'S OVERRIDE, AND ITS LIMIT. Decision #6: "no depth drops / plyometric primers unless a coach assigns them".
// An item a coach assigned lifts the YOUTH rule for that item only (itemReasons) — never the intake, red-flag, pain or
// landing rule. A FEL template item a coach did not assign keeps the youth rule. The server (protocolGateServer.ts
// coachAssignedProgram) decides which is which; this file takes the answer.
//
// THE LANDING CHECK — WHERE IT COMES FROM (the brief: "find where P4 stores per-pattern readings; if landing isn't
// audited, use the squat + lunge audits and say so"). MEASURED, 2026-09-29: P4's squat and lunge audits store NOTHING
// per pattern on the server. The only MirrorSession writer is the harness's End (app/play/mirror/_components/
// mirror-harness.tsx:552-575), which posts the press/row runtime's summary; that runtime is always the split-stance
// press/row pattern (NeuroMirror.session, mirror-harness.tsx:386-389; render/overlay-compositor.ts:176 patternId:
// pattern.id), so every stored row is patternId 'split-stance-press-row' whatever tab was open, and the squat and lunge
// review cards never POST. What IS stored, per test and strictly validated server-side, is Mirror Assess's Quick Screen
// (WorkoutScan kind 'mirror_assessment', app/api/mirror/assessment/route.ts:101 → lib/assess/prqWrite.ts RecordTest):
// T1 overhead squat, T3 single-leg squat and T5 countermovement jump, whose QUALITY half IS a landing read — hip drop to
// absorb and each knee's angle at the landing's deepest point (lib/assess/graders/t5-cmj.ts:5-6). Owner decision #30
// ("BUILD ON ASSESS … one threshold sheet"). So landing IS audited, and the landing check reads T5's landing. The squat
// + lunge fallback is not used: nothing of theirs is on file to read.
//
// SERVER-CHECKED, NOT CLIENT-DECLARED. The camera runs on the device (it can only), so the stored values are the
// device's; but whether they PASS is decided here, from the stored numbers against the one threshold sheet's graded T5
// rows (lib/screen/PROPOSED-thresholds.ts SCREEN_CHECKS → bandOf → lib/assess/scoring.ts isFault) — the record's own
// `faults` list and its 0–3 are never trusted to open anything. A fault the device declared is still a fault (both
// directions careful). The thresholds are the sheet's PROPOSED values, pending the owner's sign-off; this module reads
// whatever the sheet says, never a number of its own.
//
// WORDS (the HONESTY RULE). A landing check is a camera estimate, "one conservative input" — the copy says "landing
// check" and "a camera estimate", never "cleared", never "safe", and it names no condition and no injury.
// protocolGate.test.ts lints every line.
//
// Not the other protocol gate: lib/profile/protocol.ts gates published PROTOCOLS (the course-like modules) on PRQ
// thresholds; this gates ITEMS in a program. They share a word, not a rule.
//
// Pure: no Prisma, no fetch, no clock of its own (every time-aware function takes `now`).
import { INTAKE_IDS, INTAKE_REASK_DAYS, RED_FLAG_QUESTION_IDS, needsIntake, type IntakeQuestionId } from '../health/intake';
import type { PainDecision } from '../health/painRule';
import { isMinorForMirror } from '../mirror/youth';
import { youthGateFor } from '../mirror/screenCorrectives';
import { isDepthDrop } from '../workout/plan-generator';
import { isFault } from '../assess/scoring';
import { bandOf, th, type ThresholdId } from '../assess/thresholds';
import { SCREEN_CHECKS } from '../screen/PROPOSED-thresholds';
import { isJumpWork } from './today';
import { setupCue } from './taxonomy';

const DAY_MS = 86_400_000;
const timeOf = (v: Date | string | number | null | undefined): number =>
  v instanceof Date ? v.getTime() : typeof v === 'string' ? Date.parse(v) : typeof v === 'number' ? v : NaN;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// ── what the gate holds ──────────────────────────────────────────────────────────────────────────────────────────────

/** The catalogue columns the gate reads (a ProgramExercise row fits; Today's CatalogueCoachingRow plus its id fits). */
export interface GateRow {
  id: string;
  name?: unknown;
  category?: unknown;
  skillLayer?: unknown;
  regressionOfId?: unknown;
  coachId?: unknown;
}

export type GatedKind = 'depth_drop' | 'plyometric';

/**
 * Which gated kind a catalogue row is, or null. A DEPTH DROP by its name (lib/workout/plan-generator.ts isDepthDrop — the
 * one depth-drop test the P1/P2 swap already uses). A PLYOMETRIC by P6's one jump signal (lib/coach/today.ts isJumpWork:
 * category 'plyometric' or skill layer 'jump-land'), so the warm-up and the program agree on what jump work is.
 * assumption: every Jump & Land row counts, a landing drill included — the catalogue has no "leaves the floor" tag, and a
 * row tagged Jump & Land is the coach saying "this is jump work". A coach who wants a no-flight landing drill open for
 * everyone tags it Strength or Joints instead; the ladder walk below steps past gated rungs either way.
 */
export function gatedKind(row: Omit<GateRow, 'id'> | null | undefined): GatedKind | null {
  if (!row) return null;
  if (isDepthDrop({ name: row.name })) return 'depth_drop';
  if (isJumpWork({ skillLayer: row.skillLayer, category: typeof row.category === 'string' ? row.category : undefined })) return 'plyometric';
  return null;
}

export const isProtocolGated = (row: Omit<GateRow, 'id'> | null | undefined): boolean => gatedKind(row) !== null;

// ── the landing check ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * N, NAMED: a landing check counts for 4 weeks. FEL's choice, not a published figure: one FEL wave is four weeks (the
 * templates' 4-week waves), so each wave's jumps and drops rest on a check taken in it or just before it. Past that the
 * athlete takes the jump test again.
 */
export const LANDING_CHECK_WEEKS = 4;
export const LANDING_CHECK_DAYS = LANDING_CHECK_WEEKS * 7;

/** How many of the newest stored Quick Screens the server reads to find the landing check (protocolGateServer.ts). */
export const LANDING_SCANS_READ = 10;

/** Where the athlete takes the jump test (Mirror Assess's Quick Screen, app/play/mirror/assess). */
export const LANDING_CHECK_HREF = '/play/mirror/assess';

/** The test on the Quick Screen whose quality half is the landing (lib/assess/protocol.ts T5). */
export const LANDING_TEST_ID = 'T5';

/**
 * The landing's graded checks, read off the one threshold sheet — never re-typed: T5's rows with status 'graded' (today:
 * knees cave in on landing — landingValgusLeft/Right on 't5.landingValgus'; stiff landing — landingFlex on
 * 't5.landingFlex'). T5's hidden rows (the touchdown-timing weight shift) and its personal-best height are not landing
 * checks and are not read.
 */
export const LANDING_METRICS: readonly { metric: string; thresholdId: ThresholdId; check: string }[] = SCREEN_CHECKS
  .filter((c) => c.test === LANDING_TEST_ID && c.status === 'graded' && c.thresholdId !== null)
  .flatMap((c) => c.metrics.map((metric) => ({ metric, thresholdId: c.thresholdId as ThresholdId, check: c.id })));

export type LandingReadStatus = 'passed' | 'fault' | 'unreadable';
export interface LandingRead { status: LandingReadStatus; /** Landing metric ids in fault (empty unless 'fault'). */ faults: string[] }

/**
 * One stored Quick Screen's landing read, regraded here from its numbers — or null when the record holds no landing read
 * at all (no T5, or T5 skipped / not built). `metrics` is WorkoutScan.metrics as stored (lib/assess/prqWrite.ts record,
 * Json: anything may be in it; a shape that is not what it should be reads as 'unreadable', never as a pass).
 *   · T5 not 'scored' (the device's confidence gate said "not scored"; a pain stop is never stored, but reads the same):
 *     'unreadable'.
 *   · scored under the sheet's confidence line, fewer valid jumps than the sheet's minimum (gate.minValidReps), or any
 *     graded landing metric not read as a finite number: 'unreadable'.
 *   · otherwise every graded landing metric is regraded against its band (isFault); a metric the device itself listed in
 *     fault stays a fault. Any fault: 'fault'. None: 'passed'.
 */
export function landingReadOf(metrics: unknown): LandingRead | null {
  if (!isObj(metrics) || !Array.isArray(metrics.tests)) return null;
  const t5 = (metrics.tests as unknown[]).find((t) => isObj(t) && t.id === LANDING_TEST_ID) as Record<string, unknown> | undefined;
  if (!t5) return null;
  if (t5.status === 'skipped' || t5.status === 'notBuilt') return null;
  const unreadable: LandingRead = { status: 'unreadable', faults: [] };
  if (t5.status !== 'scored') return unreadable;
  if (typeof t5.confidence !== 'number' || !(t5.confidence >= th('gate.minConfidence'))) return unreadable;
  const side = isObj(t5.sides) ? t5.sides.both : undefined;
  if (!isObj(side) || !isObj(side.metrics)) return unreadable;
  if (typeof side.repsValid !== 'number' || side.repsValid < th('gate.minValidReps')) return unreadable;
  if (!LANDING_METRICS.length) return unreadable; // a sheet with no graded landing row can never pass anybody
  const declared = Array.isArray(side.faults) ? side.faults.filter((f): f is string => typeof f === 'string') : [];
  const faults: string[] = [];
  for (const m of LANDING_METRICS) {
    const v = (side.metrics as Record<string, unknown>)[m.metric];
    if (typeof v !== 'number' || !Number.isFinite(v)) return unreadable;
    if (isFault(v, bandOf(m.thresholdId)) || declared.includes(m.metric)) faults.push(m.metric);
  }
  return faults.length ? { status: 'fault', faults } : { status: 'passed', faults: [] };
}

/** 'old' = landing reads exist, none inside the window; 'never' = none on file at all. */
export type LandingStatus = LandingReadStatus | 'old' | 'never';

export interface LandingCheck {
  status: LandingStatus;
  /** When the read that decided it was stored (ISO), else null. */
  at: string | null;
  faults: string[];
}

/** A stored Quick Screen as the check reads it (a WorkoutScan row's createdAt + metrics). */
export interface LandingScanLike { createdAt: Date | string; metrics: unknown }

/**
 * The landing check at `now`, from the athlete's newest stored Quick Screens (any order in). Inside the window
 * (LANDING_CHECK_DAYS, and not stamped more than a minute in the future), the NEWEST READABLE landing read decides: a
 * newer fault outranks an older pass (the careful direction), while an unreadable newer take measured nothing and does
 * not erase a readable one. Nothing readable inside the window but an unreadable take: 'unreadable'. Nothing inside it:
 * 'old' when an older landing read exists, else 'never'.
 */
export function landingCheck(scans: readonly LandingScanLike[] | null | undefined, now: Date): LandingCheck {
  const from = now.getTime() - LANDING_CHECK_DAYS * DAY_MS;
  const to = now.getTime() + 60_000;
  const reads = (scans ?? [])
    .map((s) => ({ t: timeOf(s.createdAt), read: landingReadOf(s.metrics) }))
    .filter((x): x is { t: number; read: LandingRead } => x.read !== null && Number.isFinite(x.t))
    .sort((a, b) => b.t - a.t);
  const inWindow = reads.filter((x) => x.t >= from && x.t <= to);
  const iso = (t: number) => new Date(t).toISOString();
  const decided = inWindow.find((x) => x.read.status !== 'unreadable');
  if (decided) return { status: decided.read.status, at: iso(decided.t), faults: decided.read.faults };
  if (inWindow.length) return { status: 'unreadable', at: iso(inWindow[0].t), faults: [] };
  const older = reads.find((x) => x.t < from);
  return older ? { status: 'old', at: iso(older.t), faults: [] } : { status: 'never', at: null, faults: [] };
}

// ── the intake ───────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Answers whose "yes" keeps jumps and drops out even with no red flag. assumption (decision #15, stop sooner): an injury
 * or surgery in the last three months, and pregnancy or the months after it, are exactly what impact work should wait
 * out; neither stops training in general (the intake's own header), only these items. Read from the intake's own ids,
 * never re-typed. A skip is not a "yes" here (both are skippable, and the pregnancy question is for some athletes only).
 * The intake's current-pain question is NOT on this list: the intake leaves it to the per-exercise pain loop, which this
 * gate reads (painAllowsProtocol).
 */
export const PROTOCOL_YES_HOLDS: readonly IntakeQuestionId[] = [INTAKE_IDS.recentInjuryOrSurgery, INTAKE_IDS.pregnancyOrPostpartum];

/** The intake as the gate needs it (a HealthIntake row fits). */
export interface ProtocolIntake {
  version: string;
  createdAt: Date;
  /** HealthIntake.answers (Json): the validated answers, keyed by question id. */
  answers: unknown;
  redFlags: readonly string[];
  clearedAt?: Date | null;
}

/** An earlier intake, as the history check reads it. */
export interface ProtocolIntakeHistoryItem { createdAt: Date | string; redFlags: readonly string[] }

export type ProtocolIntakeReason = 'intake_missing' | 'intake_stale' | 'red_flag' | 'intake_unanswered' | 'intake_answer' | 'intake_history';

/**
 * "A completed health intake (no red flag)", read conservatively, as the Dial-Up Breath's gate reads it (lib/breath/
 * rampGate.ts):
 *   · 'intake_missing' — none on file; 'intake_stale' — lib/health/intake.ts needsIntake (another question set, or over
 *     a year old);
 *   · 'red_flag' — ANY red flag on the newest intake, cleared or not. assumption: a self-attested clearance lifts P5's
 *     pause on training in general; it was never a yes to landing from a box (decision #15);
 *   · 'intake_unanswered' — a red-flag question skipped: "completed" means every red-flag question has a yes or a no;
 *   · 'intake_answer' — a "yes" on PROTOCOL_YES_HOLDS;
 *   · 'intake_history' — an EARLIER intake inside the intake's own year carried a red flag: a re-take does not erase a
 *     lasting answer (the P7 review's finding on the ramp gate, applied here before it could be found again).
 */
export function protocolIntakeReasons(
  intake: ProtocolIntake | null | undefined, history: readonly ProtocolIntakeHistoryItem[] | null | undefined, now: Date,
): ProtocolIntakeReason[] {
  if (!intake) return ['intake_missing'];
  const out: ProtocolIntakeReason[] = [];
  if (needsIntake(intake, now)) out.push('intake_stale');
  if (intake.redFlags.length > 0) out.push('red_flag');
  const answers = isObj(intake.answers) ? intake.answers : {};
  if (RED_FLAG_QUESTION_IDS.some((id) => answers[id] !== true && answers[id] !== false)) out.push('intake_unanswered');
  if (PROTOCOL_YES_HOLDS.some((id) => answers[id] === true)) out.push('intake_answer');
  const newestT = intake.createdAt.getTime();
  const yearAgo = now.getTime() - INTAKE_REASK_DAYS * DAY_MS;
  if ((history ?? []).some((h) => { const t = timeOf(h.createdAt); return Number.isFinite(t) && t < newestT && t >= yearAgo && (h.redFlags?.length ?? 0) > 0; })) out.push('intake_history');
  return out;
}

// ── today's pain ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Today's pain decision (lib/coach/warmup.ts painDecisionToday over the stored lib/health/painRule.ts decisions, never
 * re-decided here) allows gated items only when it is 'continue' — or when there is none (no check-in in the lookback:
 * nothing to act on, the same reading the Dial-Up gate takes). 'easier_variation' (the "modify" outcome) keeps them out
 * too: it means this week's work is being eased, which is not the week to add impact (decision #15).
 */
export const painAllowsProtocol = (d: PainDecision | null | undefined): boolean => d == null || d === 'continue';

// ── the verdict ──────────────────────────────────────────────────────────────────────────────────────────────────────

export type ProtocolReason =
  | 'age_unknown' | 'minor'
  | 'no_health_consent'
  | ProtocolIntakeReason
  | 'pain_today'
  | 'landing_never' | 'landing_old' | 'landing_unreadable' | 'landing_fault';

/** The youth rule's reasons — the only ones a coach's assignment lifts. */
export const YOUTH_REASONS: readonly ProtocolReason[] = ['age_unknown', 'minor'];
const isYouthReason = (r: ProtocolReason) => YOUTH_REASONS.includes(r);

/** Everything the gate reads — assembled server-side only (lib/coach/protocolGateServer.ts loadProtocolFacts). */
export interface ProtocolFacts {
  dobYear: number | null | undefined;
  /** A live 'health_data' consent (lib/health/consent.ts activeHealthDataConsent). Without it nothing health is judged. */
  healthDataConsent: boolean;
  /** The newest intake (null = none on file, or not read because there is no consent). */
  intake: ProtocolIntake | null;
  /** Every intake inside the intake's year, the newest included (empty when there is no consent: not read). */
  intakeHistory: readonly ProtocolIntakeHistoryItem[];
  painDecision: PainDecision | null;
  landing: LandingCheck;
}

const LANDING_REASON: Record<LandingStatus, ProtocolReason | null> = {
  passed: null, fault: 'landing_fault', unreadable: 'landing_unreadable', old: 'landing_old', never: 'landing_never',
};

/**
 * Every reason the athlete's gate is closed, in evaluation order (age, consent, intake, pain, landing). Empty = open.
 * AGE: the one age truth, lib/mirror/youth.ts isMinorForMirror (a blank birth year is youth, decision #20; a year-only
 * date needs MORE than 18 by the calendar year). CONSENT first among the health checks: with no live 'health_data'
 * consent the intake and pain facts are not read (protocolGateServer.ts) and not judged — 'no_health_consent' alone.
 */
export function protocolReasons(f: ProtocolFacts, now: Date): ProtocolReason[] {
  const out: ProtocolReason[] = [];
  if (isMinorForMirror(f.dobYear, now)) out.push(youthGateFor(f.dobYear, now) === 'unknownAge' ? 'age_unknown' : 'minor');
  if (!f.healthDataConsent) out.push('no_health_consent');
  else {
    out.push(...protocolIntakeReasons(f.intake, f.intakeHistory, now));
    if (!painAllowsProtocol(f.painDecision)) out.push('pain_today');
  }
  const landing = LANDING_REASON[f.landing.status];
  if (landing) out.push(landing);
  return out;
}

/** Who put an item in front of the athlete: true = a coach assigned it; false = a FEL template (or a self-built plan) no
 *  coach assigned — a template renderer passes false (protocolGateServer.ts coachAssignedProgram decides it for a program). */
export interface ItemAssignment { coachAssigned: boolean }

/** The reasons for ONE item: a coach's assignment lifts the youth rule for that item, and nothing else. */
export const itemReasons = (athlete: readonly ProtocolReason[], a: ItemAssignment): ProtocolReason[] =>
  (a.coachAssigned ? athlete.filter((r) => !isYouthReason(r)) : [...athlete]);

export interface ProtocolVerdict {
  open: boolean;
  /** Every check in the way for this item, in evaluation order. Empty exactly when open. */
  reasons: ProtocolReason[];
  /** The youth rule would have held it, and a coach's assignment lifted it (the coach's view says so). */
  youthOverride: boolean;
}

/** THE GATE for one item. Pure: the same facts give the same verdict. */
export function protocolGate(f: ProtocolFacts, now: Date, a: ItemAssignment = { coachAssigned: false }): ProtocolVerdict {
  const all = protocolReasons(f, now);
  const reasons = itemReasons(all, a);
  return { open: reasons.length === 0, reasons, youthOverride: a.coachAssigned && all.some(isYouthReason) };
}

// ── the ladder ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** How far down a ladder the gate walks for an ungated step (a longer chain holds the item back). */
export const LADDER_MAX_STEPS = 4;

/**
 * The first step DOWN the item's ladder (regressionOfId, again and again) that is not gated itself — or null: no easier
 * link, a link to a row that is not in `byId` (another coach's, a deleted one: the server loads only the program coach's
 * own rows, so the ladder stays in the same coach/template scope), a row owned by another coach, a loop, or no ungated
 * step within LADDER_MAX_STEPS.
 */
export function easierUngatedStep(row: GateRow, byId: ReadonlyMap<string, GateRow>, maxSteps: number = LADDER_MAX_STEPS): GateRow | null {
  const seen = new Set<string>([row.id]);
  let cur = row;
  for (let i = 0; i < maxSteps; i++) {
    const nextId = typeof cur.regressionOfId === 'string' && cur.regressionOfId ? cur.regressionOfId : null;
    const next = nextId ? byId.get(nextId) : undefined;
    if (!next || seen.has(next.id)) return null;
    if (typeof row.coachId === 'string' && typeof next.coachId === 'string' && next.coachId !== row.coachId) return null;
    if (!isProtocolGated(next)) return next;
    seen.add(next.id);
    cur = next;
  }
  return null;
}

/**
 * What Today does with one item. `unread` (MIRROR-COACH P8 FIX, 2026-09-30): the gate's facts could not be read, so the
 * item is closed on the careful side with GATE_UNREAD_LINE instead of a reason's line (unreadGateAction).
 */
export type GateAction =
  | { kind: 'keep'; youthOverride: boolean }
  | { kind: 'swap'; to: GateRow; reasons: ProtocolReason[]; unread?: true }
  | { kind: 'hold'; reasons: ProtocolReason[]; unread?: true };

/**
 * One item's fate: an item that is not gated, or whose gate is open, is kept as written; a closed one is swapped for its
 * ladder's easier ungated step, or held back when there is none. `athlete` = protocolReasons for the reading athlete.
 */
export function gateAction(row: GateRow, athlete: readonly ProtocolReason[], byId: ReadonlyMap<string, GateRow>, a: ItemAssignment): GateAction {
  if (!isProtocolGated(row)) return { kind: 'keep', youthOverride: false };
  const reasons = itemReasons(athlete, a);
  if (!reasons.length) return { kind: 'keep', youthOverride: a.coachAssigned && athlete.some(isYouthReason) };
  const to = easierUngatedStep(row, byId);
  return to ? { kind: 'swap', to, reasons } : { kind: 'hold', reasons };
}

/**
 * MIRROR-COACH P8 FIX (2026-09-30, code review — "A failed gate read now makes the whole Today return 500"): the gate's
 * facts could not be read (a transient database error on any of its tables). Today used to throw, so a session holding
 * one Pogo Hop answered 500 and the athlete saw a blank Today; /workout already closed the gate instead
 * (relaunchServer.ts readGate). Now both do the same: a gated item is closed — its ladder's easier ungated step, or held
 * back — with GATE_UNREAD_LINE, and the next read tries again. Never opened by a failed read.
 */
export function unreadGateAction(row: GateRow, byId: ReadonlyMap<string, GateRow>): GateAction {
  if (!isProtocolGated(row)) return { kind: 'keep', youthOverride: false };
  const to = easierUngatedStep(row, byId);
  return to ? { kind: 'swap', to, reasons: [], unread: true } : { kind: 'hold', reasons: [], unread: true };
}

/** What a closed gate says when its facts could not be read (Today and /workout alike). FEL's words. */
export const GATE_UNREAD_LINE = "Jumps wait today: FEL couldn't read your jump checks just now. Reload the page to try again.";
export const GATE_UNREAD_REASON = 'unread';

// ── the swapped prescription ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * A jump's dose, read for its easier step: the count stays, the jump noun goes ("3 jumps" → "3", "20 contacts" → "20";
 * "3 each side" is left as it is). The easier step keeps the jump's sets, rest and band. MIRROR-COACH P8 FIX
 * (2026-09-30): moved here from lib/workout/relaunch.ts so Today and /workout read a swapped dose the same way.
 */
export const easierReps = (reps: string): string => reps.replace(/\s*\b(jumps?|contacts?|landings?|hops?|bounds?)\b/gi, '').trim() || reps;

/** A coach's note written for the jump, shown on its easier step: said as the jump's, never as the step's. */
export const jumpNoteOnStep = (fromName: string, note: string): string => `Your coach's note for ${fromName}: ${note}`;

/** The prescription fields a swap rewrites (a SessionExercise / TreeExercise fits). */
export interface SwappablePrescription { reps: string; tempo: string; coachNote: string | null; setupCues: readonly string[] }

/**
 * THE PRESCRIPTION THE EASIER STEP IS SERVED WITH. MIRROR-COACH P8 FIX (2026-09-30, code review — blocker "Today's gate
 * swap keeps the jump's dose, landing cue, tempo and coach note on the easier step"). loadToday swapped only the id and
 * the name, so a cloned adult template's Monday read "Easier step in place of Countermovement Jump and Stick" directly
 * above "3 × 3 jumps · Cruise" and "Land quiet: as little sound as you can." on a Fast Bodyweight Squat (measured over
 * planTemplateClone + todayExercise for every adult template's Prime; /workout already stripped the noun). Now:
 *   · reps — easierReps (the count stays, the jump noun goes);
 *   · set-up cues — the Jump & Land layer's cues are dropped (lib/coach/taxonomy.ts SETUP_CUES layer 'jump-land': "Land
 *     quiet"); the rest stay (a "stick it" cue fits a step-and-stick);
 *   · tempo — the easier row's own defaultTempo (a jump's is 0-0-0-0), the prescribed one only when the row has none;
 *   · the coach's note — said as the jump's ("Your coach's note for Box Jump and Stick: …"), never as the step's own.
 */
export function swapPrescription<T extends SwappablePrescription>(e: T, to: { defaultTempo?: unknown }, fromName: string): T {
  return {
    ...e,
    reps: easierReps(e.reps),
    setupCues: e.setupCues.filter((id) => setupCue(id)?.layer !== 'jump-land'),
    tempo: typeof to.defaultTempo === 'string' && to.defaultTempo.trim() ? to.defaultTempo : e.tempo,
    coachNote: e.coachNote ? jumpNoteOnStep(fromName, e.coachNote) : null,
  } as T;
}

// ── the athlete's words (FEL's own; protocolGate.test.ts lints every one) ────────────────────────────────────────────

/** Which reason the one line names when several hold: the one the athlete can least work around first. */
export const WHY_PRIORITY: readonly ProtocolReason[] = [
  'red_flag', 'intake_history', 'intake_answer', 'pain_today', 'minor', 'age_unknown',
  'no_health_consent', 'intake_missing', 'intake_stale', 'intake_unanswered',
  'landing_never', 'landing_old', 'landing_unreadable', 'landing_fault',
];

export const leadReason = (reasons: readonly ProtocolReason[]): ProtocolReason | null => WHY_PRIORITY.find((r) => reasons.includes(r)) ?? null;

const HEALTH_ANSWERS_HREF = '/play/mirror';

/** The athlete's line for each reason. No condition, no injury, no "cleared": what waits, and what to do about it. */
export const PROTOCOL_WHY: Record<ProtocolReason, string> = {
  red_flag: 'Jumps and drops stay out while your health answers carry a flag.',
  intake_history: 'Jumps and drops stay out while your health answers carry a flag.',
  intake_answer: 'Jumps and drops stay out for now, going by one of your health answers.',
  pain_today: 'Jumps and drops wait while a recent pain check-in is easing your training.',
  minor: 'Under 18, jumps and drops wait until your coach adds them.',
  age_unknown: 'No birth year on your account yet, so jumps and drops wait. Add it in your health answers.',
  no_health_consent: 'Jumps and drops wait for your health answers.',
  intake_missing: 'Jumps and drops wait for your health answers.',
  intake_stale: 'Your health answers are over a year old. Jumps and drops wait until you update them.',
  intake_unanswered: 'Jumps and drops wait until the health questions they depend on each have a yes or a no.',
  landing_never: 'Jumps and drops wait for a landing check: the jump test in the Quick Screen.',
  landing_old: `Your last landing check is over ${LANDING_CHECK_WEEKS} weeks old. Take the jump test in the Quick Screen again.`,
  landing_unreadable: "The camera couldn't read your last landing check. Take the jump test in the Quick Screen again.",
  landing_fault: 'Your last landing check (a camera estimate) showed landings to work on first. This step builds them.',
};

/** Where the one line points the athlete, per reason (null = nowhere to go: the coach, or time, decides). */
export const PROTOCOL_HREF: Record<ProtocolReason, string | null> = {
  red_flag: null, intake_history: null, intake_answer: null, pain_today: null, minor: null,
  age_unknown: HEALTH_ANSWERS_HREF, no_health_consent: HEALTH_ANSWERS_HREF, intake_missing: HEALTH_ANSWERS_HREF,
  intake_stale: HEALTH_ANSWERS_HREF, intake_unanswered: HEALTH_ANSWERS_HREF,
  landing_never: LANDING_CHECK_HREF, landing_old: LANDING_CHECK_HREF, landing_unreadable: LANDING_CHECK_HREF, landing_fault: LANDING_CHECK_HREF,
};

/** The one line the athlete reads for a swapped or held item, and where it points. */
export function athleteWhy(reasons: readonly ProtocolReason[]): { why: string; href: string | null } {
  const lead = leadReason(reasons);
  return lead ? { why: PROTOCOL_WHY[lead], href: PROTOCOL_HREF[lead] } : { why: '', href: null };
}

/** The card's line over a swapped item: what it stands in for, then why. */
export const swappedLine = (fromName: string, why: string): string => `Easier step in place of ${fromName}. ${why}`;
/** The line for an item held back with no ungated step on its ladder. */
export const heldLine = (name: string, why: string): string => `Held back today: ${name}. ${why}`;

// ── the coach's words ────────────────────────────────────────────────────────────────────────────────────────────────

/** Reasons that come from the client's health data: named to a coach only with the client's live 'coach_view' grant. */
export const PRIVATE_REASONS: readonly ProtocolReason[] = ['red_flag', 'intake_history', 'intake_answer', 'pain_today'];

/** What a coach reads for each reason (with the client's coach_view grant for the private ones). */
export const COACH_WHY: Record<ProtocolReason, string> = {
  age_unknown: "no birth year on the client's account (FEL's youth rule)",
  minor: "under 18 (FEL's youth rule)",
  no_health_consent: "the client's health questions aren't complete or current",
  intake_missing: "the client's health questions aren't complete or current",
  intake_stale: "the client's health questions aren't complete or current",
  intake_unanswered: "the client's health questions aren't complete or current",
  red_flag: "a flag in the client's health answers",
  intake_history: "a flag in the client's health answers",
  intake_answer: "one of the client's health answers",
  pain_today: 'a recent pain check-in',
  landing_never: `no landing check in the last ${LANDING_CHECK_WEEKS} weeks (the jump test in the Quick Screen)`,
  landing_old: `the client's last landing check is over ${LANDING_CHECK_WEEKS} weeks old`,
  landing_unreadable: "the client's last landing check couldn't be read",
  landing_fault: "the client's last landing check (a camera estimate) showed landings to work on",
};

/**
 * The line in place of a private reason without the client's coach_view grant — the pain flag's precedent (lib/health/
 * pain.ts coachPainFlag: "Client paused an exercise"): the coach has to know the item will not show as written, never
 * which answer or check-in, how bad, or when.
 */
export const COACH_WHY_PRIVATE = "something in the client's health answers or check-ins (the details are shared only with the client's consent)";

/** Every reason in the way, in the coach's words, most important first, each said once. */
export function coachWhy(reasons: readonly ProtocolReason[], o: { detailed: boolean }): string {
  const words: string[] = [];
  for (const r of WHY_PRIORITY) {
    if (!reasons.includes(r)) continue;
    const w = !o.detailed && PRIVATE_REASONS.includes(r) ? COACH_WHY_PRIVATE : COACH_WHY[r];
    if (!words.includes(w)) words.push(w);
  }
  return words.join('; ');
}

/** What the program builder shows under one gated item, for this client, today. */
export interface CoachGateView {
  state: 'open' | 'open_youth' | 'swap' | 'hold';
  line: string;
  /** The easier step Today shows instead (swap only). */
  to: { id: string; name: string } | null;
}

export const COACH_OPEN_LINE = "Shows as written for this client today: FEL's jump-and-drop checks all pass.";
export const COACH_OPEN_YOUTH_LINE = 'Shows as written: under 18 (or no birth year), open because you assigned it. The health, pain and landing checks still apply.';

/** The coach's line for one gated item's action. `detailed` = the client's live coach_view grant for this coach. */
export function coachGateView(action: GateAction, o: { detailed: boolean }): CoachGateView {
  if (action.kind === 'keep') return action.youthOverride ? { state: 'open_youth', line: COACH_OPEN_YOUTH_LINE, to: null } : { state: 'open', line: COACH_OPEN_LINE, to: null };
  const why = coachWhy(action.reasons, o);
  if (action.kind === 'swap') {
    const name = typeof action.to.name === 'string' ? action.to.name : 'its easier step';
    return { state: 'swap', line: `For this client today, Today shows ${name} instead: ${why}.`, to: { id: action.to.id, name } };
  }
  return { state: 'hold', line: `For this client today, this is held back (no ungated easier step on its ladder in your catalogue): ${why}.`, to: null };
}
