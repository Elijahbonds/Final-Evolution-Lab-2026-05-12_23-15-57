// lib/signature/types.ts — SIGNATURE-PROGRAMS (2026-10-25): the shape of FEL's four signature programs.
//
// Owner decisions (2026-10-25, priority #3 of the round): four programs — vertical jump, basketball skills, athletic
// foundation, pain-free / prehab — built from the owner's books already in the app and the shared exercise library,
// 8–12 weeks each, in phases with retests that adjust the plan, every one a DRAFT the owner reviews, included in the
// athlete Premium subscription with one free starter week.
//
// A program is written ONCE as data (./content/*.ts): phases → weeks (each a step of the coach templates' 4-week wave,
// lib/coach/templates/waves.ts) → sessions → items naming LIBRARY entries by id (lib/library, every one checked to exist)
// with a week-1 dose. ./plan.ts expands it into weeks; ./adapt.ts reads the retests at each phase's checkpoint; ./serve.ts
// applies the day's gates (youth, pain, the jump gate, the red flag, readiness) to today's session. Nothing here is a
// Prisma type, and nothing here is a second program system: every prescription is the coach builder's own shape and is
// validated by its own validator (lib/coach/loop.ts validateExerciseSpec).
//
// Pure. Client-safe.
import type { WeekDayName } from '@/lib/coach/offDay';

export type SignatureId = 'vertical-jump' | 'basketball-skills' | 'athletic-foundation' | 'pain-free';

/** The coach builder's session sections (lib/coach/taxonomy.ts SESSION_SECTIONS). */
export type ItemSection = 'prep' | 'prime' | 'key' | 'assist' | 'finish' | 'cooldown';

/**
 * Where a piece of a program comes from. `book`:
 *   · 'blueprint' — The Neuro-Mechanic's Blueprint (the Exercise / ExerciseCategory knowledge base: phases 1–5,
 *     chapters 1–20, bounce levels; scripts/seed.ts);
 *   · 'playbook'  — the Neuro-Mechanic Playbook (lib/coach/taxonomy.ts SKILL_LAYERS, PLAYBOOK_STEPS; its chapters);
 *   · 'dunk'      — the owner's Dunk Program (programs/DUNK-PROGRAM.md: the plyo ladder, Down–Up–Check, the 8-week shape,
 *     the retests and the deload rules);
 *   · 'gap'       — the books do not cover it: a FEL draft for the owner to fill or replace (listed in `gaps`).
 */
export interface SourceRef { book: 'blueprint' | 'playbook' | 'dunk' | 'gap'; where: string }

export interface ProgramItem {
  /** lib/library entry id. Every one is checked to exist (signature.test.ts). */
  ex: string;
  section: ItemSection;
  /** Week-1 sets: the wave moves Prime / Key / Assist / Finish; Prep and Cool-down stay as written. */
  sets: number;
  /** A counted dose ("8", "6 each side", "5 contacts"). */
  reps?: string;
  /** A timed dose: seconds of work per set. */
  secs?: number;
  rest: number;
  key?: true;
  /** Foot contacts per set (the owner's ladder counts every one: DUNK-PROGRAM §6.3). Set on every impact item. */
  contacts?: number;
  /** The calm library entry served when today's gates hold jumps and landings (youth, pain, the jump gate). */
  down?: string;
  /** lib/coach/taxonomy.ts SETUP_CUES ids, at most three. */
  cues?: string[];
}

/** The retests a program reads (where each is measured: ./facts.ts). */
export type RetestKind =
  | 'jump'       // the jump check — lib/jump via the Quick Screen's T5 and the daily readiness check: best jump vs the start
  | 'landing'    // T5's landing check: the protocol gate's jump gate open (lib/coach/protocolGate.ts)
  | 'form'       // the Mirror: clean-rep share of squat and lunge sets vs the start
  | 'shot'       // body-play shooting: make share vs the start (the daily drill's shot reading)
  | 'readiness'; // the daily readiness check (PR #447): Low days in the last week

export interface ProgramSession {
  /** 'A', 'B', 'C' … unique in its phase. */
  key: string;
  day: WeekDayName;
  label: string;
  items: ProgramItem[];
  /** Retests run at the start of this session (the owner's "re-test first" on Friday's C). */
  retest?: RetestKind[];
}

export interface PhaseWeek {
  /** The coach templates' wave step this week runs at: 1 learn, 2 build, 3 build more, 4 the easier week. */
  wave: 1 | 2 | 3 | 4;
  label: string;
}

export interface ExitRule {
  /** The retests that must all read UP (or pass) for the phase to end early, and that must not read DOWN to move on. */
  reads: RetestKind[];
  /** The phase week (1-based) after which an early advance may skip the rest of the phase. null = no early exit. */
  earlyAfterWeek: number | null;
  /** How many times the phase's last `repeatWeeks` weeks may repeat when a retest reads down. */
  maxRepeats: number;
  repeatWeeks: number;
}

export interface ProgramPhase {
  id: string;
  label: string;
  /** One line: what the phase is for. */
  goal: string;
  source: SourceRef[];
  weeks: PhaseWeek[];
  sessions: ProgramSession[];
  exit: ExitRule;
}

export interface SignatureProgram {
  id: SignatureId;
  title: string;
  /** One line under the title. */
  tagline: string;
  /** The overview's paragraph. */
  summary: string;
  /** What the athlete needs, in plain words. */
  equipmentLine: string;
  daysPerWeek: number;
  phases: ProgramPhase[];
  sources: SourceRef[];
  /** What the owner's books do not cover, said plainly: each a draft gap for the owner. */
  gaps: string[];
  /** The pain-free program only: exactly PREHAB_NOTE (lib/library/vocab.ts), "General prehab, not treatment.". */
  prehabNote: string | null;
}

// ── a program as weeks ───────────────────────────────────────────────────────────────────────────────────────────

/** One adaptation, kept on the enrollment so the plan reads the same on every visit. */
export type DecisionKind = 'advance' | 'repeat' | 'continue';

export type ReadResult = 'up' | 'same' | 'down' | 'pass' | 'not_yet' | 'none';

export interface PlanEvent {
  /** The plan week the decision was taken after (1-based). */
  afterWeek: number;
  phaseId: string;
  kind: DecisionKind;
  /** Why, in the athlete's words (./copy.ts decisionLine). */
  line: string;
  reads: Partial<Record<RetestKind, ReadResult>>;
  at: string;
}

export interface Enrollment {
  programId: SignatureId;
  startedAt: string;
  /** Session instance key ("w3:B") → when it was completed (ISO). */
  done: Record<string, string>;
  events: PlanEvent[];
}
