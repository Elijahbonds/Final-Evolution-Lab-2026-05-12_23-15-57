// The Brain Brawl REVIEW round's question set — the player's own learned quiz cards (KNOWLEDGE-FEED v2, owner decision
// 2026-10-06). BrainBrawlMode calls this only for ?round=review; the standard match never does.
//
// DEVICE OR ACCOUNT. The learner's progress is read from this device first (lib/knowledge/storage — the same store
// /learn writes). A device that has too few learned cards asks the account (GET /api/learn/sync), which answers only
// for a verified adult who syncs; under 18 or unknown age, the device is all there is. Everything is imported lazily,
// so the standard match's bundle carries none of the ~200 cards.

import { mulberry32, reviewChallenge, type ReviewChallenge } from '../core/BrainBrawlCore';

export interface ReviewSet {
  questions: ReviewChallenge[];
  /** Where the cards came from (for the hint line and the probe). */
  from: 'device' | 'account' | 'none';
}

export async function loadReviewSet(seed: number): Promise<ReviewSet> {
  try {
    const [{ CARDS }, storage, review, day, state] = await Promise.all([
      import('@/lib/knowledge/catalog'), import('@/lib/knowledge/storage'), import('@/lib/knowledge/review'),
      import('@/lib/knowledge/day'), import('@/lib/knowledge/state'),
    ]);
    const today = day.localDay();
    const toSet = (cards: ReturnType<typeof review.pickReviewCards>, from: ReviewSet['from']): ReviewSet => {
      const rnd = mulberry32(seed);
      return {
        from,
        questions: cards.map((c) => reviewChallenge({ cardId: c.id, topic: c.topic, question: c.question, options: c.options, answer: c.answer, why: c.why }, rnd)),
      };
    };
    const local = review.pickReviewCards(storage.loadState(), CARDS, today, mulberry32(seed ^ 0x9e3779b9));
    if (local.length) return toSet(local, 'device');
    const res = await fetch('/api/learn/sync', { cache: 'no-store' }).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as { eligible?: boolean; state?: unknown } | null) : null;
    if (body?.eligible && body.state) {
      const account = review.pickReviewCards(state.reviveState(body.state), CARDS, today, mulberry32(seed ^ 0x9e3779b9));
      if (account.length) return toSet(account, 'account');
    }
  } catch { /* no set: the mode says so and plays the standard match */ }
  return { questions: [], from: 'none' };
}
