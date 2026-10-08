import { describe, expect, it } from 'vitest';
import { learnedQuizzes, MAX_PER_TOPIC, pickReviewCards, REVIEW_MIN, REVIEW_ROUND_SIZE } from './review';
import { CARDS } from './catalog';
import { freshState, lessOfThis, recordAnswer, recordView, type LearnState } from './state';
import { seeded } from './scheduler';
import type { QuizCard, TopicId } from './types';

// KNOWLEDGE-FEED v2 (owner decision 7): which learned quiz cards a Brain Brawl review round asks.
const D = 20_000;
const T = D * 86_400_000;
const quizzesOf = (t: TopicId) => CARDS.filter((c): c is QuizCard => c.type === 'quiz' && c.topic === t);
const sci = quizzesOf('science'), spc = quizzesOf('space'), his = quizzesOf('history');

/** Answer `cards` on `day` (right or wrong). */
function answered(s: LearnState, cards: QuizCard[], day: number, right: boolean): LearnState {
  for (const c of cards) s = recordAnswer(s, c, right, day, (day * 86_400_000) + 1);
  return s;
}

describe('the review round\'s questions', () => {
  it('only quiz cards the player has ANSWERED — seen-but-unanswered and other card types are not "learned"', () => {
    let s = answered(freshState(), sci.slice(0, 3), D - 10, true);
    s = recordView(s, sci[3], D, T, 4000);   // seen, never answered
    s = recordView(s, CARDS.find((c) => c.type === 'lesson')!, D, T, 4000);
    expect(learnedQuizzes(s, CARDS).map((c) => c.id).sort()).toEqual(sci.slice(0, 3).map((c) => c.id).sort());
  });

  it(`no round below ${REVIEW_MIN} learned cards`, () => {
    const s = answered(freshState(), sci.slice(0, REVIEW_MIN - 1), D - 1, true);
    expect(pickReviewCards(s, CARDS, D, seeded(1))).toEqual([]);
    const enough = answered(freshState(), sci.slice(0, REVIEW_MIN), D - 1, true);
    expect(pickReviewCards(enough, CARDS, D, seeded(1))).toHaveLength(REVIEW_MIN);
  });

  it(`at most ${REVIEW_ROUND_SIZE} questions, never the same card twice`, () => {
    const s = answered(freshState(), [...sci, ...spc, ...his], D - 30, true);
    const r = pickReviewCards(s, CARDS, D, seeded(2));
    expect(r).toHaveLength(REVIEW_ROUND_SIZE);
    expect(new Set(r.map((c) => c.id)).size).toBe(r.length);
  });

  it('a hidden ("less of this") card is never asked', () => {
    let s = answered(freshState(), sci.slice(0, 4), D - 5, true);
    s = lessOfThis(s, sci[0]);
    for (let seed = 1; seed < 30; seed++) expect(pickReviewCards(s, CARDS, D, seeded(seed)).map((c) => c.id)).not.toContain(sci[0].id);
  });

  it('due reviews come first, the missed ones (box 1) before the rest', () => {
    // four answered right today (box 2, due tomorrow: not due), one missed and one right two days ago (both due)
    let s = answered(freshState(), spc.slice(0, 4), D, true);          // not due until D+1
    s = answered(s, his.slice(0, 1), D - 2, false);                     // missed: box 1, due
    s = answered(s, sci.slice(0, 1), D - 2, true);                      // right: box 2, due D-1 → due
    const r = pickReviewCards(s, CARDS, D, seeded(3)).map((c) => c.id);
    expect(r[0]).toBe(his[0].id);   // missed → box 1 → first
    expect(r[1]).toBe(sci[0].id);   // due, box 2
    expect(r.slice(2).every((id) => spc.some((c) => c.id === id))).toBe(true);
  });

  it('a DUE card beats a weaker card that is not due yet (the schedule decides before the box does)', () => {
    let s = answered(freshState(), [sci[0]], D - 10, true);   // box 2, due D-9
    s = answered(s, [sci[0]], D - 9, true);                     // box 3, due D-6: due today
    s = answered(s, spc.slice(0, 4), D, true);                  // box 2, due tomorrow: not due
    for (let seed = 1; seed < 20; seed++) expect(pickReviewCards(s, CARDS, D, seeded(seed))[0].id).toBe(sci[0].id);
  });

  it(`no more than ${MAX_PER_TOPIC} from one topic while another topic has a card left`, () => {
    let s = answered(freshState(), sci, D - 1, false);   // five weak science cards, all due, all box 1
    s = answered(s, spc.slice(0, 3), D, true);             // strong space and history cards, not due
    s = answered(s, his.slice(0, 3), D, true);
    for (let seed = 1; seed < 40; seed++) {
      const r = pickReviewCards(s, CARDS, D, seeded(seed));
      expect(r).toHaveLength(REVIEW_ROUND_SIZE);
      // science is the neediest, yet takes only its share; the rest come from the other topics
      expect(r.filter((c) => c.topic === 'science')).toHaveLength(MAX_PER_TOPIC);
      for (const t of ['space', 'history']) expect(r.filter((c) => c.topic === t).length).toBeLessThanOrEqual(MAX_PER_TOPIC);
    }
  });

  it('with one topic only, variety yields: the round still fills', () => {
    const s = answered(freshState(), sci, D - 1, true);
    expect(pickReviewCards(s, CARDS, D, seeded(4))).toHaveLength(Math.min(REVIEW_ROUND_SIZE, sci.length));
  });

  it('the seed breaks ties, so two rounds on one day can differ', () => {
    const s = answered(freshState(), [...sci, ...spc, ...his], D - 1, true);
    const sets = new Set(Array.from({ length: 20 }, (_, i) => pickReviewCards(s, CARDS, D, seeded(i + 1)).map((c) => c.id).join()));
    expect(sets.size).toBeGreaterThan(1);
  });
});
