import { describe, expect, it } from 'vitest';
import { DAY_MS } from './day';
import { MAX_TOPIC_RUN, NEAR_REPEAT_MS, NEAR_REPEAT_WINDOW, pickIdle, planFeed, RECAP_AFTER, REVIEW_EVERY, seeded, topicWeight } from './scheduler';
import { freshState, lessOfThis, recordAnswer, recordView, setTopics, toggleLike, type LearnState } from './state';
import { CARDS } from './catalog';
import type { Card, TopicId } from './types';

const TODAY = 100;
const NOW = TODAY * DAY_MS + 12 * 3_600_000;   // noon, day 100 (UTC for the test)
const plan = (state: LearnState, count: number, seed = 1, today = TODAY, catalog: Card[] = CARDS, nowMs = NOW) =>
  planFeed({ catalog, state, today, nowMs, count, rng: seeded(seed) });

/** Mark `ids` as answered (right or wrong) long ago, so some are due today. */
function answered(state: LearnState, ids: string[], correct: boolean, day: number): LearnState {
  let s = state;
  for (const id of ids) s = recordAnswer(s, CARDS.find((c) => c.id === id)!, correct, day, day * DAY_MS + 9 * 3_600_000);
  return s;
}

const quizIds = (topic: TopicId) => CARDS.filter((c) => c.topic === topic && c.type === 'quiz').map((c) => c.id);

describe('planFeed — what the feed shows next', () => {
  it('only shows cards from the topics you picked', () => {
    const s = setTopics(freshState(), ['space', 'art']);
    const items = plan(s, 20);
    expect(items.length).toBe(20);
    for (const it of items) expect(['space', 'art']).toContain(it.card.topic);
  });

  it('never repeats a card inside the plan, nor one shown in the near-repeat window', () => {
    let s = setTopics(freshState(), ['science']);
    const first = plan(s, 8);
    for (const it of first) s = recordView(s, it.card, TODAY, NOW - 60_000, 3000);
    const second = plan(s, 30);
    const ids = second.map((i) => i.card.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const it of first) expect(ids.slice(0, NEAR_REPEAT_WINDOW)).not.toContain(it.card.id);
  });

  it('respects ids already queued in the feed (exclude)', () => {
    const s = setTopics(freshState(), ['money']);
    const first = plan(s, 5);
    const more = planFeed({ catalog: CARDS, state: s, today: TODAY, nowMs: NOW, count: 10, rng: seeded(2), exclude: new Set(first.map((i) => i.card.id)) });
    for (const it of more) expect(first.map((i) => i.card.id)).not.toContain(it.card.id);
  });

  it('mixes due reviews in about one slot in REVIEW_EVERY, and only due ones', () => {
    let s = setTopics(freshState(), ['history', 'space', 'nature']);
    s = answered(s, quizIds('history').slice(0, 3), false, 99);   // missed yesterday: box 1, due
    s = answered(s, quizIds('space').slice(0, 2), true, 99);      // right yesterday: box 2, due today (99 + 1)
    s = answered(s, quizIds('nature').slice(0, 2), true, TODAY);  // right this morning: box 2, due tomorrow — not due
    const items = plan(s, 15);
    const reviews = items.filter((i) => i.reason === 'review');
    // five review turns in 15 slots; one may be owed past the end when variety defers it (never dropped mid-plan)
    expect(reviews.length).toBeGreaterThanOrEqual(4);
    expect(reviews.length).toBeLessThanOrEqual(5);
    for (const r of reviews) expect([...quizIds('history').slice(0, 3), ...quizIds('space').slice(0, 2)]).toContain(r.card.id);
    // reviews land on review turns, not all at the front
    expect(items.slice(0, REVIEW_EVERY - 1).every((i) => i.reason === 'new')).toBe(true);
    expect(items[REVIEW_EVERY - 1].reason).toBe('review');
  });

  it('keeps variety: no topic more than MAX_TOPIC_RUN in a row and no back-to-back quizzes when alternatives exist', () => {
    const s = setTopics(freshState(), ['psychology', 'money', 'history', 'tech']);
    for (const seed of [1, 2, 3, 4, 5]) {
      const items = plan(s, 40, seed);
      let run = 1;
      for (let i = 1; i < items.length; i++) {
        run = items[i].card.topic === items[i - 1].card.topic ? run + 1 : 1;
        expect(run, `seed ${seed} at ${i}`).toBeLessThanOrEqual(MAX_TOPIC_RUN);
        expect(items[i].card.type === 'quiz' && items[i - 1].card.type === 'quiz', `seed ${seed} at ${i}`).toBe(false);
      }
    }
  });

  it('weights topics by likes and "less of this"', () => {
    let s = setTopics(freshState(), ['science', 'space']);
    const space = CARDS.filter((c) => c.topic === 'space');
    const science = CARDS.filter((c) => c.topic === 'science');
    for (let i = 0; i < 5; i++) s = toggleLike(s, space[i]);
    s = lessOfThis(s, science[15]);
    s = lessOfThis(s, science[14]);
    expect(topicWeight(s, 'space')).toBeGreaterThan(topicWeight(s, 'science') * 3);
    let spaceFirst = 0;
    for (let seed = 1; seed <= 200; seed++) if (plan(s, 1, seed)[0].card.topic === 'space') spaceFirst++;
    expect(spaceFirst).toBeGreaterThan(150);   // ≈ 2/2.25 expected; a coin-flip feed would give ~100
  });

  it('likes alone raise a topic (capped), and un-liking gives it back', () => {
    let s = setTopics(freshState(), ['science', 'space']);
    const space = CARDS.filter((c) => c.topic === 'space');
    s = toggleLike(s, space[0]);
    expect(topicWeight(s, 'space')).toBeCloseTo(1.2);
    for (let i = 1; i < 10; i++) s = toggleLike(s, space[i]);
    expect(topicWeight(s, 'space')).toBeCloseTo(2);            // +1 cap
    let spaceFirst = 0;
    for (let seed = 1; seed <= 300; seed++) if (plan(s, 1, seed)[0].card.topic === 'space') spaceFirst++;
    expect(spaceFirst).toBeGreaterThan(170);                     // ≈ 2/3 expected; even odds would give ~150
    for (let i = 0; i < 10; i++) s = toggleLike(s, space[i]);
    expect(topicWeight(s, 'space')).toBe(1);
  });

  it('dwell nudges a topic within ±0.3, and only after a few cards', () => {
    let s = freshState();
    expect(topicWeight(s, 'art')).toBe(1);
    s = { ...s, dwell: { art: { ms: 60_000, n: 2 } } };
    expect(topicWeight(s, 'art')).toBe(1);
    s = { ...s, dwell: { art: { ms: 300_000, n: 5 } } };
    expect(topicWeight(s, 'art')).toBeCloseTo(1.3);
    s = { ...s, dwell: { art: { ms: 500, n: 5 } } };
    expect(topicWeight(s, 'art')).toBeGreaterThanOrEqual(0.7);
  });

  it('never shows a card you said "less of this" to', () => {
    let s = setTopics(freshState(), ['art']);
    const first = plan(s, 1)[0].card;
    s = lessOfThis(s, first);
    for (let seed = 1; seed < 20; seed++) expect(plan(s, 16, seed).map((i) => i.card.id)).not.toContain(first.id);
  });

  it('holds a recap back until RECAP_AFTER cards of its topic were seen', () => {
    const recap = CARDS.find((c) => c.id === 'tech.recap')!;
    const others = CARDS.filter((c) => c.topic === 'tech' && c.type !== 'recap');
    const catalog = [recap, ...others.slice(0, RECAP_AFTER + 2)];
    const s = setTopics(freshState(), ['tech']);
    const items = plan(s, catalog.length, 1, 100, catalog);
    const at = items.findIndex((i) => i.card.id === recap.id);
    expect(at).toBeGreaterThanOrEqual(RECAP_AFTER);
  });

  it('rewinds to the oldest seen cards when nothing new is left, and stops rather than repeat too soon', () => {
    const catalog = CARDS.filter((c) => c.topic === 'philosophy' && c.type === 'lesson');
    let s = setTopics(freshState(), ['philosophy']);
    catalog.forEach((c, i) => { s = recordView(s, c, 1, DAY_MS + i * 1000, 3000); });   // day 1: long ago
    const items = plan(s, 3, 1, TODAY, catalog);
    expect(items.map((i) => i.reason)).toEqual(['rewind', 'rewind', 'rewind']);
    expect(items[0].card.id).toBe(catalog[0].id);   // oldest first
    let fresh = setTopics(freshState(), ['philosophy']);
    catalog.forEach((c, i) => { fresh = recordView(fresh, c, TODAY, NOW - 60_000 + i, 3000); });   // just now
    expect(plan(fresh, 3, 1, TODAY, catalog)).toEqual([]);
  });

  it('the near-repeat window is short in time as well as count: a card from yesterday may come back', () => {
    const q = CARDS.find((c) => c.id === 'space.q-seasons')!;
    let s = setTopics(freshState(), ['space']);
    s = recordAnswer(s, q, false, TODAY, NOW - NEAR_REPEAT_MS + 60_000);   // missed 3h59m ago: still blocked
    expect(plan(s, 16).map((i) => i.card.id)).not.toContain(q.id);
    s = recordAnswer(freshState(), q, false, TODAY - 1, NOW - DAY_MS);    // missed yesterday: due, and back
    s = setTopics(s, ['space']);
    expect(plan(s, 3).map((i) => i.card.id)).toContain(q.id);
  });

  it('is deterministic for a seed', () => {
    const s = setTopics(freshState(), ['nature', 'language', 'tech']);
    expect(plan(s, 12, 7).map((i) => i.card.id)).toEqual(plan(s, 12, 7).map((i) => i.card.id));
  });
});

describe('pickIdle — one card for a loading screen', () => {
  it('works before onboarding (any topic) and never picks a multi-screen card', () => {
    const all: TopicId[] = ['psychology', 'science', 'space'];
    for (let seed = 1; seed < 30; seed++) {
      const it = pickIdle(CARDS, freshState(), TODAY, NOW, seeded(seed), all);
      expect(it).toBeDefined();
      expect(all).toContain(it!.card.topic);
      expect(['deeper', 'recap']).not.toContain(it!.card.type);
    }
  });

  it('uses the chosen topics once onboarded', () => {
    const s = setTopics(freshState(), ['money']);
    expect(pickIdle(CARDS, s, TODAY, NOW, seeded(3), ['space'])!.card.topic).toBe('money');
  });
});
