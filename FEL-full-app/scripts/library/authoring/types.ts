// scripts/library/authoring/types.ts — EXERCISE-LIBRARY (2026-10-25): the shape FEL's authored entries are written in.
//
// NOT FREEFORM. Every authored entry is one cell of a matrix: a movement FAMILY (pattern, muscles, the family's set-up,
// cues and faults, in the owner's cue style) × a VARIANT (equipment, stance, range, load, level). Variants listed in a
// ladder are linked easiest → hardest (regressionId / progressionId). Batch 2+ adds MODIFIERS (./modifiers.ts: paused,
// tempo, single-arm, offset…) to the same matrix, which is how the library grows to 5,000+ without a near-duplicate.

import type { LibraryDosage, LibraryFault } from '../../../lib/library/types';
import type { ClipKey } from '../../../lib/library/demo';
import type {
  CategoryId, EquipmentId, GoalId, Joint, Laterality, LevelId, MovementPattern, MuscleId, Plane, SportTag,
} from '../../../lib/library/vocab';

export interface Variant {
  name: string;
  /** The variation key, unique in the family (with pattern + equipment, the near-duplicate key). */
  v: string;
  level: LevelId;
  equipment?: EquipmentId[];
  aliases?: string[];
  /** Replaces the family's set-up line. */
  setup?: string;
  /** A variant-specific cue, put FIRST; the family's first two cues follow. */
  cue?: string;
  /** Replaces the family's cues outright. */
  cues?: string[];
  /** Variant-specific faults, put before the family's. */
  faults?: LibraryFault[];
  dosage?: Partial<LibraryDosage>;
  youthOk?: boolean;
  cautions?: string[];
  laterality?: Laterality;
  plane?: Plane;
  /** For the odd variant whose movement differs from its family's (a row in a family of presses). */
  pattern?: MovementPattern;
  goals?: GoalId[];
  lowLoad?: Joint[];
  primary?: MuscleId[];
  secondary?: MuscleId[];
  sport?: SportTag[];
  clip?: ClipKey;
  /** Ladders inside one family ('main' unless named): each is linked easiest → hardest in listed order. */
  ladder?: string;
  /**
   * This variant is one axis of another entry (the on-the-move version of a stationary combo, the 20 m version of a
   * 10 m start): that entry's `v` in this family, or `id:<entry id>` for an entry written earlier (batch 1 or the seed).
   * Becomes `variantOf`, which search uses to show the base once with "+N variants".
   */
  base?: string;
}

export interface Family {
  family: string;
  /** The authoring batch that writes this family (1 unless a later batch adds it). */
  batch?: 1 | 2 | 3 | 4;
  /** The review batch block: 'strength-lower', 'basketball-footwork', … */
  block: string;
  category: CategoryId;
  pattern: MovementPattern;
  plane: Plane;
  laterality: Laterality;
  skillLayer: string | null;
  braceMode: 'set' | 'reflex' | 'none' | null;
  primary: MuscleId[];
  secondary: MuscleId[];
  goals: GoalId[];
  sport: SportTag[];
  lowLoad: Joint[];
  youthOk: boolean;
  cautions?: string[];
  clip?: ClipKey;
  equipment: EquipmentId[];
  setup: string;
  cues: string[];
  faults: LibraryFault[];
  dosage: LibraryDosage;
  variants: Variant[];
}

export const reps = (sets: number, r: string, restSec: number, tempo?: string): LibraryDosage => ({ sets, reps: r, restSec, ...(tempo ? { tempo } : {}) });
export const secs = (sets: number, seconds: number, restSec: number): LibraryDosage => ({ sets, seconds, restSec });
export const contacts = (sets: number, n: number, restSec: number): LibraryDosage => ({ sets, contacts: n, restSec });
export const meters = (sets: number, m: number, restSec: number): LibraryDosage => ({ sets, meters: m, restSec });

export const LANDING_CAUTION = 'Plyometric: only once landings are quiet and stable. Count contacts, not sets.';
export const RANGE_CAUTION = 'Pick the easier version if the range or the load stops being smooth.';
export const SPRINT_CAUTION = 'Full warm-up first; stop the set when the speed drops.';
