// lib/coach/checkins/types.ts — COACH-PARITY (2026-10-26): the shapes of a coach's check-in form and its answers.
// The tables: prisma/pending/2026-10-26-coach-parity.sql (CoachCheckinForm, CoachCheckinAssign, CoachCheckinAnswer).
import type { Topic } from '../parity/topic';

/** scale = 1 to 10; yesno; number (with an optional unit); choice = one of 2–6 short options; text = free text, adults only. */
export type QuestionKind = 'scale' | 'yesno' | 'number' | 'choice' | 'text';
export const QUESTION_KINDS: readonly QuestionKind[] = ['scale', 'yesno', 'number', 'choice', 'text'];

export interface CheckinQuestion {
  /** Stable across edits ("q1", "q2" …), so an edited form keeps its answers lined up. */
  id: string;
  kind: QuestionKind;
  prompt: string;
  topic: Topic;
  /** Body weight, body shape or diet: never asked of a minor (lib/coach/parity/topic.ts). */
  bodyOrDiet?: boolean;
  /** number only. */
  unit?: string | null;
  /** choice only. */
  choices?: string[];
}

/** weekly = answered once per PT week (Monday to Sunday, the app's ledger week); once = answered once. */
export type Cadence = 'weekly' | 'once';

export interface CheckinFormRow {
  id: string;
  coachId: string;
  title: string;
  cadence: Cadence;
  /** The form hands the athlete FEL's own pain check-in (never a pain question of its own). Adults only, like that check-in. */
  painCheck: boolean;
  questions: CheckinQuestion[];
  archivedAt: string | null;
  createdAt: string;
}

export type Scope = 'athlete' | 'team';
export interface AssignRow { id: string; formId: string; coachId: string; scope: Scope; scopeId: string }

export type AnswerValue = number | boolean | string;
export type Answers = Record<string, AnswerValue>;

export interface AnswerRow {
  id: string;
  formId: string;
  coachId: string;
  athleteId: string;
  /** The PT week's Monday 'YYYY-MM-DD' (weekly), or 'once'. */
  period: string;
  answers: Answers;
  /** Health answers: only a verified adult with a live health_data grant has any. */
  health: Answers | null;
  createdAt: string;
  updatedAt: string;
}

/** Who is answering, as the gates read them (lib/coach/teenGate.ts band; the health rules). */
export interface Answerer {
  band: 'adult' | 'teen';
  /** Health questions may be shown at all: the switch is on and the athlete is a verified adult. */
  healthShown: boolean;
  /** …and may be saved: a live health_data grant. */
  healthConsent: boolean;
}
