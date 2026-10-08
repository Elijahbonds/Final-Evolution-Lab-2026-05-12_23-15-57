// The Brain Brawl REVIEW round's questions — picked from the player's own learned quiz cards. KNOWLEDGE-FEED v2 (owner
// decision 7, 2026-10-06: "Brain Brawl 'Review' round: YES, as a separate round type"). Pure and seeded; the round
// itself is lib/babylon/modes/BrainBrawlMode.ts with ?round=review, and the standard Brain Brawl never reads this.
//
// WHAT COUNTS AS LEARNED: a quiz card the player has answered at least once (it has a Leitner record), that is still
// in the catalogue, and that they did not hide with "less of this". Seen-but-never-answered quizzes are not in it: the
// round reviews, it does not quiz cold.
//
// ORDER OF NEED:
//   1. DUE reviews first (the feed's own Leitner schedule says now), weakest box first, then the longest overdue;
//   2. then the rest, weakest box first, then the one answered longest ago;
//   ties broken by the seed, so two rounds on one day are not the same five.
// VARIETY: at most MAX_PER_TOPIC from one topic while another topic has a candidate left.
//
// TUNABLES (new, not owner-felt): REVIEW_ROUND_SIZE, REVIEW_MIN, MAX_PER_TOPIC.

import type { LearnState } from './state';
import type { Card, QuizCard, TopicId } from './types';

/** Questions in one review round. */
export const REVIEW_ROUND_SIZE = 5;
/** Fewer learned quiz cards than this and there is no review round yet (the mode says so and plays a standard match). */
export const REVIEW_MIN = 3;
/** No more than this many questions from one topic, while another topic still has one to give. */
export const MAX_PER_TOPIC = 2;

export function learnedQuizzes(state: LearnState, catalog: readonly Card[]): QuizCard[] {
  const hidden = new Set(state.hidden);
  return catalog.filter((c): c is QuizCard => c.type === 'quiz' && !!state.cards[c.id]?.quiz && !hidden.has(c.id));
}

export function pickReviewCards(state: LearnState, catalog: readonly Card[], today: number, rnd: () => number, size = REVIEW_ROUND_SIZE): QuizCard[] {
  const learned = learnedQuizzes(state, catalog);
  if (learned.length < REVIEW_MIN) return [];
  const tie = new Map(learned.map((c) => [c.id, rnd()]));
  const rec = (c: QuizCard) => state.cards[c.id].quiz!;
  const due = (c: QuizCard) => rec(c).due <= today;
  const ranked = [...learned].sort((a, b) => {
    const ra = rec(a), rb = rec(b);
    if (due(a) !== due(b)) return due(a) ? -1 : 1;
    if (ra.box !== rb.box) return ra.box - rb.box;
    const age = due(a) ? ra.due - rb.due : ra.lastAnswered - rb.lastAnswered;
    return age || tie.get(a.id)! - tie.get(b.id)!;
  });
  const out: QuizCard[] = [];
  const perTopic = new Map<TopicId, number>();
  const left = [...ranked];
  while (out.length < size && left.length) {
    // the most needed card whose topic is under its share — or, when every remaining card's topic is at its share,
    // simply the most needed one
    let i = left.findIndex((c) => (perTopic.get(c.topic) ?? 0) < MAX_PER_TOPIC);
    if (i < 0) i = 0;
    const [c] = left.splice(i, 1);
    out.push(c);
    perTopic.set(c.topic, (perTopic.get(c.topic) ?? 0) + 1);
  }
  return out;
}
