// lib/library/types.ts — EXERCISE-LIBRARY (2026-10-25): one shared library entry, as the data files and the
// LibraryExercise table (prisma/pending/2026-10-25-exercise-library.sql) both hold it.
//
// THE TEXT CONTRACT (the owner's cue style, lib/coach/cueLint.ts):
//   · `setup`   — where to stand and what to hold before the first rep. INSTRUCTION tier: it may name the body where
//                 it has to ("forearms on a bench"), never a muscle to squeeze.
//   · `cues`    — 1–3 lines the athlete thinks about DURING the rep. ATTENTION tier: outside the body first (the floor,
//                 the wall, the handle) or what the movement does (quiet, still, the path).
//   · `faults`  — what goes wrong (a plain description) and the cue that fixes the rep (ATTENTION tier).
//   · `cautions`— plain words about when to pick an easier version. Never a condition, a diagnosis or a promise.
//   · `prehabNote` — on prehab entries only, exactly PREHAB_NOTE ("General prehab, not treatment.").
// scripts/library/validate.ts enforces every line of this.

import type { BraceMode } from '@/lib/generated/prisma';
import type { ClipKey } from './demo';
import type {
  CategoryId, EquipmentId, GoalId, Joint, Laterality, LevelId, MovementPattern, MuscleId, Plane, ReviewStatus, SourceKind,
  SportTag,
} from './vocab';

export interface LibraryFault { fault: string; fix: string }

export interface LibraryDosage {
  sets: number;
  /** "8-10", "5 each side", "AMRAP" never — a range a coach can read. */
  reps?: string;
  seconds?: number;
  contacts?: number;
  meters?: number;
  restSec: number;
  /** Down-pause-up-pause, the catalogue's format. */
  tempo?: string;
}

export interface LibraryDemo {
  /** lib/library/demo.ts CLIP_KEYS — the avatar clip this entry should play (coverage is CLIP_COVERAGE). */
  clipKey: ClipKey;
  /** An approved coach or FEL video (http/https). null until one is attached. */
  videoUrl: string | null;
  /** A link to the source's own still images (seed rows only). Never copied into this repo. */
  imageRef: string | null;
}

export interface LibrarySource {
  kind: SourceKind;
  /** The seed row's id upstream, or the authoring block, or the submission id. */
  ref: string | null;
  url: string | null;
  licence: string;
}

export interface LibraryReview {
  status: ReviewStatus;
  /** Who approved or rejected it (a user id), or null while it is a draft. */
  reviewer: string | null;
  /** The review batch the owner approves together: 'seed-strength', 'authored-b1-basketball-footwork', … */
  batch: string;
}

export interface LibraryExercise {
  /** Stable id: equal to `slug`. Every link (regressionId, progressionId, ProgramExercise.libraryExerciseId) uses it. */
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  /** The movement family ('squat', 'pogo', 'defensive-slide'…) and this entry's variation in it: with pattern and
   *  equipment, the near-duplicate key (validate.ts dupKey). */
  family: string;
  variation: string;
  pattern: MovementPattern;
  plane: Plane;
  laterality: Laterality;
  category: CategoryId;
  level: LevelId;
  /** [] means no equipment. */
  equipment: EquipmentId[];
  primaryMuscles: MuscleId[];
  secondaryMuscles: MuscleId[];
  sportTags: SportTag[];
  goals: GoalId[];
  /** lib/coach/taxonomy.ts SKILL_LAYERS id, or null. */
  skillLayer: string | null;
  braceMode: BraceMode | null;
  setup: string;
  cues: string[];
  faults: LibraryFault[];
  /** The EASIER version (step down to), the catalogue's reading. */
  regressionId: string | null;
  /** The HARDER version (step up to). */
  progressionId: string | null;
  cautions: string[];
  /** Joints this entry keeps the load low on ("knee-friendly" = 'knee'). */
  lowLoad: Joint[];
  /** false = adults only (youth rules: owner decisions #6 and #20, lib/coach/taxonomy.ts youthRules). */
  youthOk: boolean;
  prehabNote: string | null;
  dosage: LibraryDosage;
  demo: LibraryDemo;
  source: LibrarySource;
  review: LibraryReview;
}

/** What a coach's own catalogue row carries when it is submitted (a snapshot; the coach keeps editing theirs). */
export interface SubmissionPayload {
  name: string;
  category: string;
  pattern: MovementPattern | null;
  braceMode: BraceMode | null;
  skillLayer: string | null;
  primaryCues: string[];
  commonFaults: { fault: string; correctionCue: string }[];
  equipment: string[];
  defaultTempo: string;
  demoVideoUrl: string | null;
}

export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';
