// lib/coach/import/types.ts — COACH-PARITY (2026-10-26): the paste-a-program importer's shapes. Text in → ParsedProgram →
// each line matched to an exercise (MatchedProgram) → the coach's review → an ImportPlan the builder writes.
import type { SessionSection } from '@/public/_prisma/client';
import type { WeekDayName } from '../offDay';

/** Why a line needs the coach's eye. Each is shown in the review grid next to the line. */
export type LineWarning =
  | 'no_dose'          // no sets × reps found: the builder's default (3 × 8-10) stands until the coach types one
  | 'sets_capped'      // more than 10 sets: FEL holds 10 at most
  | 'work_capped'      // a timed set longer than 30 minutes
  | 'tempo_kept_in_note' // a tempo FEL's tempo box cannot hold (31X1): kept in the note
  | 'reps_trimmed'     // the reps text was longer than FEL keeps (24)
  | 'load_trimmed'
  | 'circuit';         // "3 rounds:" / EMOM — read as sets; check it

export interface ParsedItem {
  /** 1-based line (text) or row (table) in what the coach pasted. */
  line: number;
  raw: string;
  name: string;
  sets: number | null;
  reps: string | null;
  load: string | null;
  restSeconds: number | null;
  /** FEL's 'd-d-d-d' only; anything else goes to the note. */
  tempo: string | null;
  workSeconds: number | null;
  /** A1 / A2 → 'A'. */
  superset: string | null;
  section: SessionSection | null;
  note: string | null;
  warnings: LineWarning[];
}

export interface ParsedDay { label: string; day: WeekDayName | null; items: ParsedItem[] }
export interface ParsedWeek { label: string; days: ParsedDay[] }

export interface SkippedLine { line: number; raw: string; why: 'blank' | 'comment' | 'header_row' | 'unreadable' }

export interface ParsedProgram {
  format: 'text' | 'table';
  weeks: ParsedWeek[];
  skipped: SkippedLine[];
  /** Lines read as an exercise / lines that held anything. The AI assist is offered below IMPORT_AI_BELOW. */
  readRate: number;
}

export type MatchKind = 'catalogue' | 'library' | 'none';
export type Confidence = 'exact' | 'high' | 'low' | 'none';

export interface Suggestion { kind: 'catalogue' | 'library'; id: string; name: string; level?: string | null; status?: string | null }

export interface ItemMatch {
  kind: MatchKind;
  id: string | null;
  name: string | null;
  confidence: Confidence;
  /** The best few, for the review grid's picker. */
  suggestions: Suggestion[];
}

/** One line of the coach's confirmed grid. `pick` decides what gets prescribed. */
export type Pick =
  | { kind: 'catalogue'; id: string }
  | { kind: 'library'; id: string }
  | { kind: 'new'; name: string }
  // COACH-DELIVERY COA-02 (2026-10-27): a FEL template exercise by its key (lib/coach/templateCatalogue.ts), seeded into the
  // coach's own catalogue with its cues and faults, as the template clone seeds it — the first-block draft's lines
  | { kind: 'template'; key: string }
  | { kind: 'skip' };

export interface ConfirmItem {
  pick: Pick;
  sets?: number | null;
  reps?: string | null;
  load?: string | null;
  restSeconds?: number | null;
  tempo?: string | null;
  workSeconds?: number | null;
  superset?: string | null;
  section?: SessionSection | null;
  isKeySet?: boolean;
  note?: string | null;
  /** COACH-DELIVERY COA-02: the template's own structure on a line (absent on a paste: the builder's defaults). */
  effortBand?: string | null;
  holdSeconds?: number | null;
  setupCues?: string[] | null;
}
export interface ConfirmDay { label: string; items: ConfirmItem[] }
export interface ConfirmWeek { label: string; days: ConfirmDay[] }
