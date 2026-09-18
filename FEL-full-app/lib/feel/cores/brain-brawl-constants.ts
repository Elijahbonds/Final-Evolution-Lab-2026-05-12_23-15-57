/**
 * lib/feel/cores/brain-brawl-constants.ts
 * =======================================
 * M9 Step 9 — Brain Brawl skin tunables for the Rhythm/UI archetype.
 *
 * Brain Brawl is a thin skin over the shared `QuizCore`: it is just a config
 * (timing + streak scoring) plus a question bank. QuizCore was NOT part of
 * feelConfig, so every value here is fresh scaffolding for Elijah to dial in.
 * All values // TUNE(elijah).
 *
 * A quiz mode adds NO behaviour to QuizCore — Brain Brawl is the archetype
 * dressed with numbers (fast rounds, aggressive streak reward) and a bank.
 * The M10 lineup retrofit wires the app's richer original bank
 * (lib/quiz-data.ts QUIZ_BANK); the default bank below is small ORIGINAL
 * scaffolding so the headless harness has data to run against.
 */

import type { QuizQuestion } from '../quiz-core';

/** Brain Brawl timing + scoring feel. Every number // TUNE(elijah). */
export interface QuizTuning {
  questionTimeMs: number;
  streakStep: number;
  maxMultiplier: number;
  defaultPoints: number;
}

export const BRAIN_BRAWL_TUNING: QuizTuning = {
  questionTimeMs: 10000, // TUNE(elijah) — snappy 10s rounds, rewards quick recall
  streakStep: 0.3, // TUNE(elijah) — each correct answer adds +0.3x
  maxMultiplier: 4, // TUNE(elijah) — streak reward caps at 4x
  defaultPoints: 100, // TUNE(elijah) — base points before speed/streak scaling
};

/**
 * Small ORIGINAL scaffolding bank (general-knowledge, no third-party IP).
 * Used only so the headless harness and any early wiring has data. The M10
 * retrofit replaces this with lib/quiz-data.ts QUIZ_BANK. // TUNE(elijah)
 */
export const BRAIN_BRAWL_SAMPLE_BANK: QuizQuestion[] = [
  {
    q: 'Which planet has the shortest day in the solar system?',
    options: ['Earth', 'Jupiter', 'Mars', 'Venus'],
    answer: 1,
  },
  {
    q: 'How many degrees are in the interior angles of a triangle, summed?',
    options: ['90', '180', '270', '360'],
    answer: 1,
  },
  {
    q: 'What is the largest organ of the human body?',
    options: ['Liver', 'Brain', 'Skin', 'Lungs'],
    answer: 2,
  },
  {
    q: 'Water freezes at what temperature in Celsius at sea level?',
    options: ['0', '32', '100', '-10'],
    answer: 0,
  },
  {
    q: 'Which gas do plants primarily absorb for photosynthesis?',
    options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'],
    answer: 2,
  },
];
