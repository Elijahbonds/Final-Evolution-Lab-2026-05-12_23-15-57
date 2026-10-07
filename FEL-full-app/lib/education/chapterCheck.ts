// chapterCheck — the Playbook chapter check: which questions a chapter asks, and the grade. SERVER-SIDE ONLY.
//
// EDU-LINKS (2026-10-07), Mirror & coaching plan Phase 5, owner decision 6 (2026-10-07): "Playbook chapter shards: quiz
// at 80%." A chapter's shards are paid for passing its check at PASS_MARK (course.ts), graded here on the server. The
// answer key is in chapterCheck.data.json, so this module is imported by the API route only — never by a client
// component (lib/education/chapterCheck.test.ts reads the client files and fails if one imports it).
//
// THE QUESTIONS ARE THE OWNER'S DRAFTS (docs/PLAYBOOK-QUIZ-DRAFTS.md, via quizDrafts.ts). At 2026-10-07 none is
// approved, so:
//   - without the draft flag, a chapter's check is live only when it has CHECK_MIN_QUESTIONS approved/edited questions
//     — today none is, so no check is live and nothing changes for players;
//   - with PLAYBOOK_CHECK_DRAFTS=1 (server env; a preview for the owner), the unapproved drafts are asked too, and the
//     check says DRAFT on every screen. Nothing is invented: a chapter with no drafts has no check.
//
// What the check replaces: while a chapter's check is live, its shards come ONLY from passing it (the lesson route stops
// paying "Finish the chapter"); while it is not, the lesson route keeps paying as it always has. See payPathFor.

import bank from './chapterCheck.data.json';
import { CHAPTERS, PASS_MARK, passed } from './course';
import type { DraftQuestion, DraftStatus } from './quizDrafts';

const QUESTIONS = (bank as { questions: DraftQuestion[] }).questions;

/** A check with fewer questions than this is not a check: 80% of 2 is a coin flip twice. */
export const CHECK_MIN_QUESTIONS = 4;

/** What the Credential row names this check (curriculumVersion): the bank's source and how many questions it holds. */
export const CHECK_VERSION = `playbook-drafts:${QUESTIONS.length}`;

/** The draft flag: on only when PLAYBOOK_CHECK_DRAFTS is "1"/"true"/"on"/"yes" (lib/flags.ts's convention). */
export function draftsOn(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.PLAYBOOK_CHECK_DRAFTS ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

const SHIPS: ReadonlySet<DraftStatus> = new Set(['approved', 'edited']);

/** The questions a chapter's check asks, in book order. */
export function checkQuestions(chapter: number, opts: { drafts: boolean }): DraftQuestion[] {
  return QUESTIONS.filter((q) => q.chapter === chapter && (SHIPS.has(q.status) || (opts.drafts && q.status === 'draft')));
}

export function checkLive(chapter: number, opts: { drafts: boolean }): boolean {
  return checkQuestions(chapter, opts).length >= CHECK_MIN_QUESTIONS;
}

/** True when any question this check asks is still an unapproved draft — every screen of it then says DRAFT. */
export function checkIsDraft(chapter: number, opts: { drafts: boolean }): boolean {
  return checkQuestions(chapter, opts).some((q) => q.status === 'draft');
}

/**
 * Where a chapter's shards come from. 'check' while its check is live; 'finish' (the lesson route's "Finish the
 * chapter", as before this phase) while it is not. Never both: the two share one idempotency key (rewards.ts).
 */
export function payPathFor(chapter: number, opts: { drafts: boolean }): 'check' | 'finish' {
  return checkLive(chapter, opts) ? 'check' : 'finish';
}

/** A question as the client sees it: no answer, no book line (the line gives the answer away), options shuffled. */
export interface PublicQuestion { id: string; question: string; options: string[]; draft: boolean }

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** A stable shuffle per question, so the right answer is not always where the author typed it (most drafts say B). */
export function shuffledOptions(q: Pick<DraftQuestion, 'id' | 'options'>): string[] {
  const out = [...q.options];
  let h = hash(q.id);
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function publicQuestions(chapter: number, opts: { drafts: boolean }): PublicQuestion[] {
  return checkQuestions(chapter, opts).map((q) => ({
    id: q.id, question: q.question, options: shuffledOptions(q), draft: q.status === 'draft',
  }));
}

export interface Graded {
  /** 0..100, rounded. */
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  /** Per question: right or not. Never the right option — a retry should send them back to the chapter, not the key. */
  results: { id: string; correct: boolean }[];
  /** What the Credential row keeps: the chosen option's text and whether it was right. */
  answers: { questionKey: string; chosen: string | null; correct: boolean }[];
}

/**
 * Grade a chapter check from the client's answers, `{ [questionId]: chosenOptionText }`. Every question of the check
 * counts: an unanswered one is wrong, an id the check does not ask is ignored, and nothing about the score is taken from
 * the request. Returns null when the chapter has no live check.
 */
export function gradeCheck(chapter: number, answersIn: unknown, opts: { drafts: boolean }): Graded | null {
  if (!checkLive(chapter, opts)) return null;
  const qs = checkQuestions(chapter, opts);
  const given = answersIn && typeof answersIn === 'object' && !Array.isArray(answersIn) ? answersIn as Record<string, unknown> : {};
  const answers = qs.map((q) => {
    const raw = Object.prototype.hasOwnProperty.call(given, q.id) ? given[q.id] : null;
    const chosen = typeof raw === 'string' && q.options.includes(raw) ? raw : null;
    return { questionKey: q.id, chosen, correct: chosen !== null && chosen === q.options[q.answer] };
  });
  const correct = answers.filter((a) => a.correct).length;
  const score = Math.round((correct / qs.length) * 100);
  return {
    score, passed: passed(score), correct, total: qs.length,
    results: answers.map((a) => ({ id: a.questionKey, correct: a.correct })),
    answers,
  };
}

export { PASS_MARK };

/** Every chapter with a live check, for the course index. */
export function liveChecks(opts: { drafts: boolean }): number[] {
  return CHAPTERS.map((c) => c.number).filter((n) => checkLive(n, opts));
}
