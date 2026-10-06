// Spaced repetition for quiz cards — a five-box Leitner system (the spec's "SM-2-lite": simple enough to explain on a
// card, and proven). Right answers move a card up a box and push its next review further out; a miss sends it back to
// box 1 to be seen again soon.
//
// TUNABLES (new in v1, not owner-signed): the box intervals and the mastery box. docs/KNOWLEDGE-FEED.md.

/** Days until the next review, by box. Box 1 is "due again today" (after the near-repeat gap, lib/knowledge/scheduler). */
export const BOX_INTERVAL_DAYS: Record<Box, number> = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 21 };
export type Box = 1 | 2 | 3 | 4 | 5;
export const MAX_BOX: Box = 5;
/** A card in box 4 or 5 has been answered right on at least three separate occasions, spaced out: "mastered". */
export const MASTERED_BOX: Box = 4;

export interface QuizRecord {
  box: Box;
  /** The local day it is next due. */
  due: number;
  right: number;
  wrong: number;
  /** The local day of the last answer, so two answers on one day don't promote twice. */
  lastAnswered: number;
}

/** First answer: right goes straight to box 2 (due tomorrow); wrong to box 1 (due today). */
export function firstAnswer(correct: boolean, today: number): QuizRecord {
  const box: Box = correct ? 2 : 1;
  return { box, due: today + BOX_INTERVAL_DAYS[box], right: correct ? 1 : 0, wrong: correct ? 0 : 1, lastAnswered: today };
}

/**
 * A review. Right: up one box (capped), unless it was already answered today — a same-day repeat keeps its box, so
 * re-answering in one sitting can't fake spacing. Wrong: back to box 1, always.
 */
export function review(rec: QuizRecord, correct: boolean, today: number): QuizRecord {
  if (!correct) return { box: 1, due: today + BOX_INTERVAL_DAYS[1], right: rec.right, wrong: rec.wrong + 1, lastAnswered: today };
  const sameDay = rec.lastAnswered === today;
  const box = (sameDay ? Math.max(rec.box, 2) : Math.min(MAX_BOX, rec.box + 1)) as Box;
  return { box, due: today + BOX_INTERVAL_DAYS[box], right: rec.right + 1, wrong: rec.wrong, lastAnswered: today };
}

export function answer(rec: QuizRecord | undefined, correct: boolean, today: number): QuizRecord {
  return rec ? review(rec, correct, today) : firstAnswer(correct, today);
}

export function isDue(rec: QuizRecord, today: number): boolean {
  return rec.due <= today;
}

export function isMastered(rec: QuizRecord | undefined): boolean {
  return !!rec && rec.box >= MASTERED_BOX;
}
