/**
 * lib/feel/cores/who-scene-it-constants.ts
 * ========================================
 * M9 Step 10 — Who-Scene-It skin tunables for the Rhythm/UI archetype.
 *
 * Who-Scene-It is the second thin skin over the shared `QuizCore`: a config
 * (timing + streak scoring) plus a question bank. It is a *visual*
 * recognition quiz, so it runs a slightly longer per-question clock and a
 * gentler streak curve than Brain Brawl. QuizCore was NOT part of feelConfig,
 * so every value here is fresh scaffolding for Elijah to dial in.
 * All values // TUNE(elijah).
 *
 * IP screen: the scaffolding bank below quizzes ONLY Final Evolution Lab's
 * OWN scenes, modes and world — no third-party films, shows or games. The
 * M10 lineup retrofit wires the app's original screened bank
 * (lib/quiz-data.ts, original-content categories); this sample is scaffolding
 * so the headless harness has data.
 */

import type { QuizQuestion } from '../quiz-core';
import type { QuizTuning } from './brain-brawl-constants';

/** Who-Scene-It timing + scoring feel. Every number // TUNE(elijah). */
export const WHO_SCENE_IT_TUNING: QuizTuning = {
  questionTimeMs: 14000, // TUNE(elijah) — longer: players study the scene first
  streakStep: 0.2, // TUNE(elijah) — gentler ramp than Brain Brawl
  maxMultiplier: 3, // TUNE(elijah) — lower cap
  defaultPoints: 120, // TUNE(elijah) — recognition worth slightly more
};

/**
 * ORIGINAL scaffolding bank — quizzes Final Evolution Lab's OWN world only.
 * No third-party IP. Replaced by the app's screened original bank at M10.
 * // TUNE(elijah)
 */
export const WHO_SCENE_IT_SAMPLE_BANK: QuizQuestion[] = [
  {
    q: 'In FEL, which mode drops you off a self-accelerating slope onto a giant kicker?',
    options: ['Vault', 'Big Air', 'Sprint', 'Brain Brawl'],
    answer: 1,
  },
  {
    q: 'Which FEL mode is a 100m dash won or lost on your footstrike cadence?',
    options: ['Sprint', 'Surf', 'Dunk', 'Karate'],
    answer: 0,
  },
  {
    q: 'The Story hub in FEL is built on which movement engine family?',
    options: ['Ride/carve', 'Court/free-3D', 'Rhythm/UI', 'Air-session'],
    answer: 1,
  },
  {
    q: 'Which FEL mode makes you pump a runway by cadence before a table vault?',
    options: ['Big Air', 'Snowboard', 'Vault', 'Surf'],
    answer: 2,
  },
  {
    q: 'Skateboard, Snowboard and Surf in FEL all share which archetype core?',
    options: ['Air-session', 'Ride/carve', 'Court-rally', 'Rhythm/UI'],
    answer: 1,
  },
];
