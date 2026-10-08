// The personalisation loop: what the feed shows next. Pure and seeded, so every rule below is tested.
//
//  · NEW cards from the topics you picked, in each pack's authored order (a pack teaches a lesson before it quizzes it).
//  · REVIEWS: quiz cards whose Leitner box is due (lib/knowledge/leitner.ts) — missed ones come back the same day,
//    learned ones after 1, 3, 7, 21 days. About one slot in REVIEW_EVERY is a review when any are due.
//  · TOPIC WEIGHTS from what you do: likes raise a topic, "less of this" lowers it hard, long dwell nudges it up.
//  · VARIETY: no topic more than MAX_TOPIC_RUN in a row, no two quizzes back to back, when there is any alternative.
//  · NO NEAR-REPEATS: a card among the last NEAR_REPEAT_WINDOW shown AND seen in the last NEAR_REPEAT_MS (or already
//    in this plan) is never picked. Both, not either: a count alone would hold yesterday's due reviews back until
//    40 more cards had gone by.
//  · RECAPS wait until you have seen RECAP_AFTER cards of that topic.
//  · When everything new is used up, REWIND: cards you saw longest ago (never inside the near-repeat window).
//
// TUNABLES (new in v1, not owner-signed): the constants below. docs/KNOWLEDGE-FEED.md lists them.

import { isDue } from './leitner';
import type { LearnState } from './state';
import type { Card, CardType, TopicId } from './types';

export const NEAR_REPEAT_WINDOW = 40;
export const NEAR_REPEAT_MS = 4 * 60 * 60 * 1000;
export const REVIEW_EVERY = 3;
export const MAX_TOPIC_RUN = 2;
export const RECAP_AFTER = 4;
export const DWELL_NORM_MS = 8_000;

export type PlanReason = 'new' | 'review' | 'rewind';
export interface PlanItem { card: Card; reason: PlanReason }

export interface PlanInput {
  catalog: Card[];
  state: LearnState;
  today: number;
  /** Now, for the near-repeat rule's time half. */
  nowMs: number;
  count: number;
  rng: () => number;
  /** Ids already queued in the feed this session (not yet recorded as seen). */
  exclude?: ReadonlySet<string>;
  /** Items already queued, newest last — the variety rules continue from them. */
  tail?: readonly PlanItem[];
}

/** mulberry32 — a small seeded generator (same algorithm Brain Brawl's core uses; copied, not coupled). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How much a topic is wanted, from 0.1 to 3. Likes +0.2 each (max +1), "less of this" ×0.5 each, dwell ±0.3. */
export function topicWeight(s: LearnState, topic: TopicId): number {
  const likes = Math.min(1, 0.2 * (s.likes[topic] ?? 0));
  const less = Math.pow(0.5, s.less[topic] ?? 0);
  const d = s.dwell[topic];
  const dwell = d && d.n >= 3 ? Math.max(-0.3, Math.min(0.3, ((d.ms / d.n - DWELL_NORM_MS) / DWELL_NORM_MS) * 0.3)) : 0;
  return Math.max(0.1, Math.min(3, (1 + likes + dwell) * less));
}

function weightedPick<T>(rng: () => number, items: readonly T[], weight: (t: T) => number): T | undefined {
  const total = items.reduce((n, t) => n + weight(t), 0);
  if (!(total > 0)) return items[0];
  let r = rng() * total;
  for (const t of items) { r -= weight(t); if (r < 0) return t; }
  return items[items.length - 1];
}

export function planFeed(input: PlanInput): PlanItem[] {
  const { catalog, state: s, today, nowMs, count, rng } = input;
  const chosen = new Set(s.topics);
  const hidden = new Set(s.hidden);
  const recentlySeen = s.recent.slice(-NEAR_REPEAT_WINDOW).filter((id) => {
    const at = s.cards[id]?.lastSeenMs;
    return at === undefined || nowMs - at < NEAR_REPEAT_MS;
  });
  const blocked = new Set<string>([...recentlySeen, ...(input.exclude ?? [])]);
  const pool = catalog.filter((c) => chosen.has(c.topic) && !hidden.has(c.id));

  const out: PlanItem[] = [];
  const history: PlanItem[] = [...(input.tail ?? [])];
  const seenInTopic = new Map<TopicId, number>();
  for (const c of pool) if (s.cards[c.id] && c.type !== 'recap') seenInTopic.set(c.topic, (seenInTopic.get(c.topic) ?? 0) + 1);

  const usable = (c: Card) => !blocked.has(c.id);
  const recapReady = (c: Card) => c.type !== 'recap' || (seenInTopic.get(c.topic) ?? 0) >= RECAP_AFTER;
  const runOf = (topic: TopicId) => {
    let n = 0;
    for (let i = history.length - 1; i >= 0 && history[i].card.topic === topic; i--) n++;
    return n;
  };
  const lastType = (): CardType | undefined => history[history.length - 1]?.card.type;
  const fitsVariety = (c: Card) => runOf(c.topic) < MAX_TOPIC_RUN && !(c.type === 'quiz' && lastType() === 'quiz');

  const take = (c: Card, reason: PlanReason) => {
    const item = { card: c, reason };
    out.push(item); history.push(item); blocked.add(c.id);
    if (c.type !== 'recap') seenInTopic.set(c.topic, (seenInTopic.get(c.topic) ?? 0) + 1);
  };

  // A review turn that can't be taken without breaking variety is OWED, not dropped: it carries to the next slot.
  let owed = 0;
  for (let slot = 0; slot < count; slot++) {
    if (slot % REVIEW_EVERY === REVIEW_EVERY - 1) owed++;
    const due = pool
      .filter((c) => c.type === 'quiz' && usable(c) && s.cards[c.id]?.quiz && isDue(s.cards[c.id].quiz!, today))
      .sort((a, b) => (s.cards[a.id].quiz!.due - s.cards[b.id].quiz!.due) || (s.cards[a.id].quiz!.box - s.cards[b.id].quiz!.box));
    const fresh = pool.filter((c) => !s.cards[c.id] && usable(c) && recapReady(c));

    const reviewTurn = due.length > 0 && (owed > 0 || fresh.length === 0);
    if (reviewTurn) {
      // variety yields when nothing else could satisfy it either (one topic picked, say)
      const pick = due.find(fitsVariety) ?? (!fresh.some(fitsVariety) ? due[0] : undefined);
      if (pick) { take(pick, 'review'); owed = Math.max(0, owed - 1); continue; }
    }

    if (fresh.length > 0) {
      // the first unseen card of each topic, in authored order; pick a topic by weight among those that fit variety
      const heads = new Map<TopicId, Card>();
      for (const c of fresh) if (!heads.has(c.topic)) heads.set(c.topic, c);
      // a head that would break variety may be swapped for the next card of that topic that doesn't
      const candidates: Card[] = [];
      for (const [topic, head] of heads) {
        const ok = fitsVariety(head) ? head : fresh.find((c) => c.topic === topic && fitsVariety(c));
        if (ok) candidates.push(ok);
      }
      const pick = weightedPick(rng, candidates.length ? candidates : [...heads.values()], (c) => topicWeight(s, c.topic));
      if (pick) { take(pick, 'new'); continue; }
    }

    // rewind: seen non-quiz cards, oldest first (quizzes come back through the review path, on their schedule)
    const rewind = pool
      .filter((c) => s.cards[c.id] && c.type !== 'quiz' && usable(c))
      .sort((a, b) => s.cards[a.id].lastSeenMs - s.cards[b.id].lastSeenMs);
    const pick = rewind.find(fitsVariety) ?? rewind[0];
    if (pick) { take(pick, 'rewind'); continue; }

    if (due.length > 0) { take(due[0], 'review'); continue; }
    break;   // nothing left that isn't a near-repeat: the feed shows "all caught up"
  }
  return out;
}

/** One card for an idle moment (a loading screen, the end card): the next thing the feed would show. */
export function pickIdle(catalog: Card[], s: LearnState, today: number, nowMs: number, rng: () => number, allTopics: TopicId[]): PlanItem | undefined {
  const state = s.onboarded && s.topics.length ? s : { ...s, topics: allTopics };
  // a deeper sequence needs the full feed; the idle card shows one screen
  const small = catalog.filter((c) => c.type !== 'deeper' && c.type !== 'recap');
  return planFeed({ catalog: small, state, today, nowMs, count: 1, rng })[0];
}
