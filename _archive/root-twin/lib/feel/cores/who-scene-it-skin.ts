/**
 * lib/feel/cores/who-scene-it-skin.ts
 * ===================================
 * M9 Step 10 — Who-Scene-It skin for the Rhythm/UI archetype (QuizCore).
 *
 * Second quiz mode: same shared engine as Brain Brawl, different tuning and a
 * different (visual-recognition) bank. This file wires the constants + bank
 * into a ready-to-run `QuizCore`. It adds NO new behaviour to QuizCore —
 * Who-Scene-It is the shared engine dressed with numbers and questions. All
 * tunables live in who-scene-it-constants.ts, every value // TUNE(elijah).
 *
 * Determinism: pass `rng` (seeded) and `now` (fixed clock) straight through.
 *
 * IP screen / M10 note: pass the app's original, screened bank via
 * `questions` at retrofit time. The default sample bank quizzes only FEL's
 * own world — no third-party IP.
 */

import { QuizCore, type QuizQuestion } from '../quiz-core';
import {
  WHO_SCENE_IT_TUNING,
  WHO_SCENE_IT_SAMPLE_BANK,
} from './who-scene-it-constants';
import type { QuizTuning } from './brain-brawl-constants';

export interface WhoSceneItSkinOpts {
  /** Question bank; defaults to the ORIGINAL FEL-world scaffolding sample. */
  questions?: QuizQuestion[];
  /** Override any tuning value. */
  tuning?: Partial<QuizTuning>;
  /** Seeded RNG for deterministic shuffles. */
  rng?: () => number;
  /** Fixed clock (ms) for headless speed-scoring tests. */
  now?: () => number;
}

/** Build a QuizCore already wearing the Who-Scene-It skin. */
export function makeWhoSceneItQuiz(opts: WhoSceneItSkinOpts = {}): QuizCore {
  const t: QuizTuning = { ...WHO_SCENE_IT_TUNING, ...(opts.tuning ?? {}) };
  const rawBank = opts.questions ?? WHO_SCENE_IT_SAMPLE_BANK;
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

export { WHO_SCENE_IT_TUNING, WHO_SCENE_IT_SAMPLE_BANK } from './who-scene-it-constants';
