// lib/cue-style/result.ts — CUE-REWRITE (2026-10-27): the one shape every result takes (docs/CUE-STYLE.md, "Results").
//
//   1. saw   — what we saw, in plain words. A number always comes with what it means ("42 cm, about the same as last
//              week"), and an estimate says "about".
//   2. means — what it means for you.
//   3. next  — what to do next: ONE concrete action, with a link when the app has a place for it.
//
// The Quick Screen, the Mirror's set review and Movement Screen, the form-review flags and the jump, readiness, bar-speed
// and sprint results all build their result lines through this, and lib/cue-style/corpus.test.ts holds every one to it.
//
// Pure.

export interface ResultNext {
  /** One action, said as a doing word first ("Do 2 sets of…", "Film one more set", "Come back tomorrow"). */
  text: string;
  /** Where in the app to do it, when there is a place (a same-origin path). */
  href?: string | null;
  /** The link's words (defaults to the action). */
  label?: string;
}

export interface ResultLine {
  saw: string;
  means: string;
  next: ResultNext;
}

export const result = (saw: string, means: string, next: string | ResultNext): ResultLine =>
  ({ saw, means, next: typeof next === 'string' ? { text: next } : next });

/** The three parts as one block of text (a spoken summary, a share, a test). */
export const resultText = (r: ResultLine): string => `${r.saw} ${r.means} ${r.next.text}`.replace(/\s+/g, ' ').trim();

/** Why a result line breaks the shape (empty = it has all three parts, each a sentence). */
export function shapeProblems(r: ResultLine): string[] {
  const out: string[] = [];
  if (!r.saw.trim()) out.push('no "what we saw"');
  if (!r.means.trim()) out.push('no "what it means"');
  if (!r.next.text.trim()) out.push('no "what to do next"');
  if (r.next.href != null && !/^\/[\w\-/?=&#%.]*$/.test(r.next.href)) out.push(`next link is not a same-origin path: ${r.next.href}`);
  // a bare number with no meaning: a digit in "saw" needs a comparison or a meaning word in saw or means
  if (/\d/.test(r.saw) && !/\b(about|same|up|down|more|less|than|best|last|usual|normal|range|higher|lower|faster|slower|of|out of|in a row|each|per)\b/i.test(`${r.saw} ${r.means}`)) {
    out.push('a number with no meaning attached');
  }
  return out;
}
