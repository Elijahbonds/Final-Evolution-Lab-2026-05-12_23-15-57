// lib/coach/weeklyDraft/types.ts — COACH-AI-DRAFT (2026-10-24): the shapes of a weekly program draft.
//
// Owner decision 2026-10-24 ("build first"): AI-drafted weekly program updates from real client data, approved by the
// coach. The draft is a list of concrete CHANGES to a client's program for the coming week; each change carries the
// reason (citing the data), a confidence and a safety class, and the builder bodies (`ops`) that write it once the
// coach approves. Nothing here touches the database: ./rules.ts drafts from DraftFacts, ./server.ts reads the facts.
//
// Pure types, client-safe (the Drafts inbox imports them).

import type { DriftState } from '../compliance';
import type { ProgramTree } from '../loop';
import type { Prescription } from '../mirrorToProgram';
import type { PainDecision } from '@/lib/health/painRule';

export type ChangeKind =
  | 'progress_load'
  | 'progress_volume'
  | 'regress_load'
  | 'regress_volume'
  | 'swap_easier'
  | 'swap_harder'
  | 'add_corrective'
  | 'ease_off'
  | 'deload'
  | 'check_in';

/**
 * safe   — eases, regresses, adds low-load prep work, or only asks the coach to check in: "approve all safe" takes these.
 * review — moves the athlete forward (load, volume, a harder step): the coach approves it one by one.
 * unsafe — never offered for approval. The rules engine holds it back and says why (`held`); the AI layer cannot add one.
 */
export type SafetyClass = 'safe' | 'review' | 'unsafe';
export type Confidence = 'high' | 'medium' | 'low';

/** The prescription fields a draft may change on one SessionExercise row. */
export interface OpFields { exerciseId: string; exerciseName: string; sets: number; reps: string; load: string; effortBand: string | null }

export type DraftOp =
  | {
    action: 'update';
    sessionExerciseId: string;
    sessionId: string;
    sessionLabel: string;
    /** The row as it was when the draft was made: approval refuses to write over a row that has changed since. */
    before: OpFields;
    after: OpFields;
  }
  | {
    action: 'add';
    sessionId: string;
    sessionLabel: string;
    exerciseId: string;
    exerciseName: string;
    /** The builder's 'add' body (lib/coach/mirrorToProgram.ts addBodyFor), without its `action`. */
    body: Record<string, unknown>;
  };

export interface DraftChange {
  /** Stable for the same change on the same rows: regenerating a week yields the same ids (./week.ts changeId). */
  id: string;
  kind: ChangeKind;
  /** The exercise it is about, or null for a whole-week change (ease off, deload, check in). */
  exerciseName: string | null;
  /** "Trap-bar deadlift: 60 kg → 62.5 kg". */
  title: string;
  /** Why, citing the data: "Hit the top of 8-10 on every set in the last 2 sessions at effort 7 or less." */
  reason: string;
  /** The data lines behind it, one fact each. */
  evidence: string[];
  confidence: Confidence;
  safety: SafetyClass;
  /** For a coach: the owner's method this follows (a Playbook chapter), when one applies. Never shown to the athlete. */
  method: string | null;
  ops: DraftOp[];
  /** What the athlete reads once it is approved (their plan, plain words; null = nothing to tell them). */
  clientLine: string | null;
  /**
   * The reason comes from health data (pain, readiness) or tells someone to see a professional: its words are fixed,
   * it is never sent to the AI, and the AI layer never rewords it.
   */
  sensitive: boolean;
  /** Higher = nearer the top of the card. */
  priority: number;
  /** Added by the AI layer, when it ran: a plain-language note for the coach. Never changes the ops. */
  aiNote?: string | null;
}

export interface HeldItem { title: string; why: string }

export type DraftStatus = 'ok' | 'no_program' | 'no_data' | 'skipped';

export interface ClientDraft {
  version: 1;
  weekKey: string;
  coachId: string;
  clientId: string;
  name: string;
  programId: string | null;
  programName: string | null;
  band: 'adult' | 'teen' | null;
  status: DraftStatus;
  /** Why a client has no draft (status 'skipped'): the teen gate's refusal, or "marked Out". */
  skipReason: string | null;
  changes: DraftChange[];
  /** Changes the rules engine would not offer, and gaps worth knowing ("nothing in your catalogue matches"). */
  held: HeldItem[];
  /** What the draft read, one line each (so a coach can see it had the data it claims). */
  context: string[];
  engine: 'rules' | 'rules+ai';
  /** The AI layer's one-line summary for the coach, when it ran. */
  summary: string | null;
  /**
   * The week's safety context as the rules engine saw it, kept with the draft so a coach's EDIT is judged by the same
   * rules before it is written (./approve.ts re-runs ./safety.ts classify with it and a fresh read of the catalogue).
   */
  guard: DraftGuard;
}

export interface DraftGuard {
  youth: boolean;
  painOpen: boolean;
  availability: 'full' | 'limited' | 'out' | null;
  lowCompliance: boolean;
  easierWeek: boolean;
  formDropPatterns: string[];
}

// ── the facts, as ./server.ts reads them (and the test fixtures build them) ───────────────────────────────────────────

export interface DraftCatalogueRow {
  id: string;
  name: string;
  category: string | null;
  pattern: string | null;
  skillLayer: string | null;
  regressionOfId: string | null;
  progressionOfId: string | null;
  defaultTempo?: string | null;
}

export interface LoggedSet { reps: number | null; weightKg: number | null; rir: number | null; effort: number | null }

/** One completed session's log of one exercise. */
export interface Exposure {
  exerciseId: string;
  atMs: number;
  prescribed: { sets: number; reps: string; load: string; effortBand: string | null };
  /** Per-set rows (SetLog), in order; empty when the athlete logged only the summary. */
  sets: LoggedSet[];
  summary: { actualSets: number | null; actualReps: string | null; actualLoad: string | null; rpe: number | null };
}

export interface WeekCompareLite { thisWeek: number | null; lastWeek: number | null; delta: number | null }

export interface ComplianceFacts {
  state: DriftState;
  note: string;
  daysSince: number | null;
  /** Planned training sessions a week, rounded (lib/coach/alerts.ts); null without a usable plan. */
  planned: number | null;
  doneLast7: number;
  /** lib/coach/alerts.ts missedThisWeek. */
  missed: number;
}

export interface PainFacts {
  /** A stop outcome (step down, see a clinician, tell an adult) in the window. */
  present: boolean;
  /** The client's live coach_view grant for this coach: the items below are filled only then. */
  detailed: boolean;
  items: { exerciseName: string; bodyArea: string; decision: PainDecision; atMs: number }[];
}

export interface DraftFacts {
  coachId: string;
  clientId: string;
  name: string;
  /** From the teen gate (lib/coach/teenGate.ts): an adult, or a teen whose guardian consented to coach training. */
  band: 'adult' | 'teen';
  program: { id: string; name: string; tree: ProgramTree } | null;
  completedSessionIds: readonly string[];
  /** SessionExercise ids with a log that has something in it: never edited by a draft (the athlete's work hangs off them). */
  loggedRowIds: readonly string[];
  exposures: readonly Exposure[];
  catalogue: readonly DraftCatalogueRow[];
  compliance: ComplianceFacts | null;
  /** The coach's own Full / Limited / Out for this athlete (lib/coach/availability.ts); null = not set or not available. */
  availability: 'full' | 'limited' | 'out' | null;
  /** null = not read (a teen: pain check-ins are adults-only data). */
  pain: PainFacts | null;
  /** Daily readiness check-ins, coach_view consent only; null = not read. */
  readiness: { lowDays: number; days: number } | null;
  /** COACH-READINESS (2026-10-25): the daily jump check's Low days in the last 7 (lib/coach/readiness); the numbers gate
   *  below (numbersShared) only. Optional: absent = not read. */
  jumpReadiness?: { lowDays: number; days: number } | null;
  /** Mirror squat/lunge clean-rep share (0..1) this week vs last; adults who opted in AND shared with this coach only. */
  form: WeekCompareLite | null;
  /** Best jump (inches) this week vs last; same gate as `form`. */
  jump: WeekCompareLite | null;
  /** The form and jump numbers are shared with this coach (the gate above passed), whether or not there are any yet. */
  numbersShared?: boolean;
  /** PRQ composite now vs two weeks ago (lib/coach/attention.ts prqSnapshots), when both exist. */
  prq: { now: number; before: number } | null;
  /** The Mirror screen's prescriptions for this coach's catalogue (lib/coach/mirrorToProgram.ts coachDraft). */
  screen: { prescriptions: readonly Prescription[]; atIso: string | null } | null;
  /** Today's daily-drill focus (lib/daily-drill/plan.ts pickFocus), context only. */
  drill: { focus: string; display: string | null } | null;
  nowMs: number;
}
