// lib/cue-style/review.ts — CUE-REWRITE (2026-10-27): the words on the Mirror's set-review cards, in one place.
//
// The cards showed the coach engine's own level names to the athlete ("ESCALATE", "REGRESS") and said "No faults
// measured", "What was cued", "Not square to the camera through this set — not read". Same cards, plain words.
//
// Pure.
export const REVIEW_COPY = {
  heading: 'What the camera saw · estimated',
  headingEachSide: 'What the camera saw, each side',
  firstReps: 'In the first reps',
  nothingInCheck: 'Nothing to fix in the first reps.',
  nothingJudged: 'Nothing to fix in the first reps (knees not judged).',
  coachSaid: 'What the coach said',
  coachSaidNothing: 'The coach had nothing to correct.',
  nothingToFix: 'Nothing to fix.',
  notDone: 'Not done.',
  notSideOn: 'Not checked: the camera could not see you side-on.',
  turnedAway: 'Not checked: you were turned away from the camera.',
  checkStage: 'The first reps',
  workStage: 'The main set',
} as const;

/** The coach's level, as the athlete reads it on the card (the engine's own names stay in code). */
export const LEVEL_WORD: Readonly<Record<string, string>> = { cue: 'Tip', reply: 'Tip', escalate: 'Reminder', regress: 'Reset', confirm: 'Nice' };
export const levelWord = (level: string): string => LEVEL_WORD[level] ?? level;

/** "Knees cave in: 3 of 8 reps" */
export const repsLine = (label: string, n: number, of: number): string => `${label}: ${n} of ${of} reps`;
