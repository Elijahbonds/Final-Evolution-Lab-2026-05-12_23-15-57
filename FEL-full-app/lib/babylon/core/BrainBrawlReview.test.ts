import { describe, expect, it } from 'vitest';
import {
  challengeScore, mulberry32, REVIEW_BEST_KEY, REVIEW_TIER, REVIEW_TIME_LIMIT_S, reviewChallenge, roundKindFrom, SOLO_BEST_KEY,
} from './BrainBrawlCore';
import { CARDS } from '@/lib/knowledge/catalog';
import type { QuizCard } from '@/lib/knowledge/types';

// KNOWLEDGE-FEED v2 (owner decision 7, 2026-10-06): the REVIEW round's additions to the core — additive only; the
// standard match's tests (BrainBrawlCore.test.ts) are unchanged.
const quizzes = CARDS.filter((c): c is QuizCard => c.type === 'quiz');
const q = (c: QuizCard) => ({ cardId: c.id, topic: c.topic, question: c.question, options: c.options, answer: c.answer, why: c.why });

describe('the review round, in the core', () => {
  it('is entered only by ?round=review — every other page is the standard match', () => {
    expect(roundKindFrom('?round=review')).toBe('review');
    expect(roundKindFrom('?players=2&round=review')).toBe('review');
    expect(roundKindFrom('')).toBe('standard');
    expect(roundKindFrom('?players=2')).toBe('standard');
    expect(roundKindFrom('?round=REVIEW')).toBe('standard');
  });

  it('a learned card keeps exactly its own right answer, wherever the shuffle puts it', () => {
    for (const c of quizzes) {
      for (let seed = 1; seed <= 5; seed++) {
        const r = reviewChallenge(q(c), mulberry32(seed));
        expect(r.options.slice().sort()).toEqual([...c.options].sort());
        expect(r.options[r.answer]).toBe(c.options[c.answer]);
        expect(r.options.filter((o) => o === c.options[c.answer])).toHaveLength(1);
      }
    }
  });

  it('three-option cards stay three options (the stage hides the empty fourth button)', () => {
    const three = quizzes.find((c) => c.options.length === 3)!;
    expect(reviewChallenge(q(three), mulberry32(1)).options).toHaveLength(3);
  });

  it('is marked REVIEW, timed for reading, shows nothing before the answers, and scores like any tier-1 challenge', () => {
    const r = reviewChallenge(q(quizzes[0]), mulberry32(9));
    expect(r.category).toBe('REVIEW');
    expect(r.kind).toBe('review');
    expect(r.timeLimitSec).toBe(REVIEW_TIME_LIMIT_S);
    expect(r.exposureSec).toBe(0);
    expect(r.display).toEqual([]);
    expect(challengeScore(true, r.timeLimitSec, r.timeLimitSec, REVIEW_TIER)).toBe(100);
    expect(challengeScore(false, r.timeLimitSec, r.timeLimitSec, REVIEW_TIER)).toBe(0);
  });

  it('keeps its own personal best — the standard solo best is not its key', () => {
    expect(REVIEW_BEST_KEY).not.toBe(SOLO_BEST_KEY);
  });
});
