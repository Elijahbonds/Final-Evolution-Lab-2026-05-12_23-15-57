/**
 * lib/feel/cores/brain-brawl-skin.ts
 * ==================================
 * M9 Step 9 — Brain Brawl skin for the Rhythm/UI archetype (QuizCore).
 *
 * A quiz mode is a thin skin: constants (brain-brawl-constants.ts) + a bank.
 * This file wires those into a ready-to-run `QuizCore`. It adds NO new
 * behaviour to QuizCore — Brain Brawl is just the shared engine dressed with
 * numbers and questions. All tunables live in brain-brawl-constants.ts,
 * every value // TUNE(elijah).
 *
 * Determinism: pass `rng` (seeded) and `now` (fixed clock) straight through
 * to QuizCore for replay-honest shuffles and headless scoring tests.
 *
 * M10 note: pass the app's original bank (lib/quiz-data.ts QUIZ_BANK slice)
 * via `questions` at retrofit time; the default sample bank is scaffolding.
 */

import { QuizCore, type QuizQuestion } from '../quiz-core';
import { BRAIN_BRAWL_TUNING, BRAIN_BRAWL_SAMPLE_BANK, type QuizTuning } from './brain-brawl-constants';

export interface BrainBrawlSkinOpts {
  /** Question bank; defaults to the small ORIGINAL scaffolding sample. */
  questions?: QuizQuestion[];
  /** Override any tuning value (e.g. faster rounds for a hard mode). */
  tuning?: Partial<QuizTuning>;
  /** Seeded RNG for deterministic shuffles. */
  rng?: () => number;
  /** Fixed clock (ms) for headless speed-scoring tests. */
  now?: () => number;
}

/** Build a QuizCore already wearing the Brain Brawl skin. */
export function makeBrainBrawlQuiz(opts: BrainBrawlSkinOpts = {}): QuizCore {
  const t: QuizTuning = { ...BRAIN_BRAWL_TUNING, ...(opts.tuning ?? {}) };
  const rawBank = opts.questions ?? BRAIN_BRAWL_SAMPLE_BANK;
  // Apply the skin's default points to any question that did not set its own.
  const questions: QuizQuestion[] = rawBank.map((q) => ({
    ...q,
    points: q.points ?? t.defaultPoints,
  }));
  return new QuizCore({
    questions,
    questionTimeMs: t.questionTimeMs,
    streakStep: t.streakStep,
    maxMultiplier: t.maxMultiplier,
    rng: opts.rng,
    now: opts.now,
  });
}

export { BRAIN_BRAWL_TUNING, BRAIN_BRAWL_SAMPLE_BANK } from './brain-brawl-constants';
export type { QuizTuning } from './brain-brawl-constants';
