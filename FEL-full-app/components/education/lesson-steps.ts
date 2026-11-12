// lesson-steps — a lesson as cards you can take in at a glance, in the book's own words (PLAT-P04, 2026-10-27).
//
// Owner, 2026-10-27: the app "still feels cheap" — too much text — and the standing rule is autoplay, no extra taps,
// never confusing. A drill lesson shows before it tells: the demo, then its steps as short cards, then the book behind
// "Read more". THE WORDS ARE THE BOOK'S (lib/education/course.ts, imported from the manuscript, never retyped): a step
// that runs over STEP_CARD_MAX_WORDS is split between its own sentences, and nothing is reworded, shortened or joined
// with new words. A single sentence over the limit stays whole (`over: true`), and the lane report lists it.
//
// Pure. Client-safe.

import type { Lesson } from '@/lib/education/course';

/** The most words a step card carries (phase-04 brief: "3–5 short cards (≤ 18 words each)"). (new) */
export const STEP_CARD_MAX_WORDS = 18;
/** The premium rule's paragraph limit: a summary line longer than this is left to Read more. (new) */
export const SUMMARY_MAX_WORDS = 24;

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * The text's sentences, verbatim: joined with single spaces they give the text back (whitespace runs aside). A sentence
 * ends at . ! or ? (and a closing quote or bracket after it) followed by a space and a capital, a digit or an opening quote.
 * "e.g." and "i.e." never end one.
 */
export function sentences(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  const out: string[] = [];
  let start = 0;
  const re = /[.!?][’”"')\]]*\s+(?=[A-Z0-9‘“"'(])/g;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const end = m.index + m[0].trimEnd().length;
    const before = t.slice(Math.max(0, m.index - 4), m.index + 1).toLowerCase();
    if (/(^|\s)(e\.g|i\.e|vs|approx|etc)\.$/.test(before)) continue;
    out.push(t.slice(start, end).trim());
    start = m.index + m[0].length;
  }
  out.push(t.slice(start).trim());
  return out.filter(Boolean);
}

export interface StepCard {
  /** the book's words, verbatim: one step, or consecutive whole sentences of one step */
  text: string;
  /** which of the lesson's steps (0-based) the words come from */
  step: number;
  /** a single sentence longer than STEP_CARD_MAX_WORDS: shown whole, never cut */
  over: boolean;
}

/** One step as one or more cards: whole when it fits, else its sentences packed in order up to the limit. */
export function cardsForStep(text: string, step: number, max = STEP_CARD_MAX_WORDS): StepCard[] {
  if (wordCount(text) <= max) return [{ text: text.trim(), step, over: false }];
  const out: StepCard[] = [];
  let cur: string[] = [];
  const flush = () => { if (cur.length) { out.push({ text: cur.join(' '), step, over: wordCount(cur.join(' ')) > max }); cur = []; } };
  for (const s of sentences(text)) {
    if (cur.length && wordCount([...cur, s].join(' ')) > max) flush();
    cur.push(s);
  }
  flush();
  return out;
}

/** A lesson's steps as cards, in order. */
export function stepCards(steps: readonly string[], max = STEP_CARD_MAX_WORDS): StepCard[] {
  return steps.flatMap((s, i) => cardsForStep(s, i, max));
}

/**
 * The one line a lesson leads with when it has no steps to show (a concept, or a drill the book writes as prose): the
 * first sentence of the drill's own purpose, else of the first paragraph — verbatim, and only when it is a real
 * sentence of SUMMARY_MAX_WORDS or fewer (the importer keeps sub-headings such as "Execution" as paragraphs; a line of
 * three words or fewer is one of those, not a summary). null: the title leads and the book is behind Read more.
 */
export function summaryLine(lesson: Pick<Lesson, 'purpose' | 'prose'>): string | null {
  for (const source of [lesson.purpose, lesson.prose[0] ?? '']) {
    const first = sentences(source)[0];
    if (!first) continue;
    const n = wordCount(first);
    if (n > 3 && n <= SUMMARY_MAX_WORDS) return first;
  }
  return null;
}
