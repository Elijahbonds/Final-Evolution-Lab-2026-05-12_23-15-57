import { describe, expect, it } from 'vitest';
import { freshState, recordAnswer, recordView, setTopics, toggleLike, toggleSave, lessOfThis, type LearnState } from './state';
import { mergeCard, mergeQuiz, mergeStates, sanitizeIncoming } from './sync';
import { cardById } from './catalog';
import type { Card } from './types';

// KNOWLEDGE-FEED v2 (owner decision 2, 2026-10-06): the merge rules for device → account sync.
const card = (id: string): Card => { const c = cardById(id); if (!c) throw new Error(id); return c; };
const lesson = card('science.f-carbon');
const quiz = card('productivity.q-pomodoro');
const quiz2 = card('productivity.q-parkinson');
const D = 20_000;
const T = D * 86_400_000;

function device(): LearnState {
  let s = setTopics(freshState(), ['science', 'productivity']);
  s = recordView(s, lesson, D, T, 5_000);
  s = recordAnswer(s, quiz, true, D, T + 1);
  s = toggleSave(s, lesson);
  return s;
}
function account(): LearnState {
  let s = setTopics(freshState(), ['space', 'productivity']);
  s = recordAnswer(s, quiz2, false, D - 3, T - 3 * 86_400_000);
  s = toggleLike(s, quiz2);
  return s;
}

describe('device → account: the first sign-in merge', () => {
  it('keeps everything either side knew: cards, topics, saves, likes', () => {
    const m = mergeStates(account(), device(), 'first-link');
    expect(Object.keys(m.cards).sort()).toEqual([lesson.id, quiz.id, quiz2.id].sort());
    expect(m.topics).toEqual(['space', 'productivity', 'science']);
    expect(m.saved).toEqual([lesson.id]);
    expect(m.liked).toEqual([quiz2.id]);
    expect(m.onboarded).toBe(true);
  });

  it('adds the two histories\' learning XP (they are separate histories)', () => {
    const a = account(), d = device();
    expect(mergeStates(a, d, 'first-link').xp).toBe(a.xp + d.xp);
  });

  it('a device merged into an EMPTY account is the device, less its near-repeat window', () => {
    const d = device();
    const m = mergeStates(freshState(), d, 'first-link');
    expect(m.cards).toEqual(d.cards);
    expect(m.xp).toBe(d.xp);
    expect(m.streak).toEqual(d.streak);
    expect(m.recent).toEqual(d.recent);   // the DEVICE keeps its own window; the server never stores it
  });
});

describe('a linked device pushing its latest', () => {
  it('its unsave and unlike reach the account (lists are the device\'s)', () => {
    const a = mergeStates(account(), device(), 'first-link');
    let d = { ...a };
    d = toggleSave(d, lesson);   // unsave
    d = toggleLike(d, quiz2);    // unlike
    const m = mergeStates(a, d, 'linked');
    expect(m.saved).toEqual([]);
    expect(m.liked).toEqual([]);
  });

  it('"less of this" is never undone by a merge — hidden is a union in both modes', () => {
    const a = lessOfThis(account(), lesson);
    for (const mode of ['first-link', 'linked'] as const) expect(mergeStates(a, device(), mode).hidden).toContain(lesson.id);
  });

  it('XP takes the larger side (both sides count the same events)', () => {
    const a = { ...account(), xp: 40 }, d = { ...device(), xp: 55 };
    expect(mergeStates(a, d, 'linked').xp).toBe(55);
    expect(mergeStates(d, a, 'linked').xp).toBe(55);
  });

  it('is idempotent: pushing the same state twice changes nothing', () => {
    const a = account(), d = device();
    const once = mergeStates(a, d, 'linked');
    expect(mergeStates(once, d, 'linked')).toEqual(once);
  });
});

describe('conflicts on one card', () => {
  const base = { views: 2, firstDay: D - 5, lastSeenMs: T - 1000 };
  it('the later answer wins the quiz record; views and dates take the wider span', () => {
    const older = { ...base, quiz: { box: 4 as const, due: D + 7, right: 3, wrong: 0, lastAnswered: D - 1 } };
    const newer = { views: 5, firstDay: D - 2, lastSeenMs: T, quiz: { box: 1 as const, due: D, right: 3, wrong: 1, lastAnswered: D } };
    const m = mergeCard(older, newer)!;
    expect(m.quiz).toEqual(newer.quiz);   // missed today: box 1, even though the other side says box 4
    expect(m.views).toBe(5);
    expect(m.firstDay).toBe(D - 5);
    expect(m.lastSeenMs).toBe(T);
    expect(mergeCard(newer, older)).toEqual(m);   // order does not matter
  });

  it('answered on the same day on both sides: the LOWER box wins — a merge never fakes mastery', () => {
    const hi = { box: 4 as const, due: D + 7, right: 4, wrong: 0, lastAnswered: D };
    const lo = { box: 1 as const, due: D, right: 3, wrong: 1, lastAnswered: D };
    expect(mergeQuiz(hi, lo)).toBe(lo);
    expect(mergeQuiz(lo, hi)).toBe(lo);
  });

  it('one side has a quiz record, the other only a view: the record is kept', () => {
    const viewed = { ...base };
    const answered = { ...base, quiz: { box: 2 as const, due: D + 1, right: 1, wrong: 0, lastAnswered: D } };
    expect(mergeCard(viewed, answered)!.quiz).toEqual(answered.quiz);
    expect(mergeCard(answered, viewed)!.quiz).toEqual(answered.quiz);
  });

  it('the streak follows the side that met its goal more recently; best is the larger', () => {
    const a = { ...account(), streak: { count: 9, best: 12, lastDay: D - 4 } };
    const d = { ...device(), streak: { count: 2, best: 2, lastDay: D } };
    const m = mergeStates(a, d, 'first-link');
    expect(m.streak).toEqual({ count: 2, best: 12, lastDay: D });
  });

  it('today\'s tally: same day is a union, a later day replaces', () => {
    const a = { ...account(), today: { day: D, done: ['x.a', 'x.b'] } };
    const d = { ...device(), today: { day: D, done: ['x.b', 'x.c'] } };
    expect(mergeStates(a, d, 'linked').today).toEqual({ day: D, done: ['x.a', 'x.b', 'x.c'] });
    expect(mergeStates({ ...a, today: { day: D - 1, done: ['x.z'] } }, d, 'linked').today).toEqual(d.today);
  });
});

describe('what a client may send', () => {
  it('drops unknown card ids and makes every number finite and in range', () => {
    const raw = {
      ...device(),
      cards: {
        [quiz.id]: { views: -3, firstDay: D, lastSeenMs: T, quiz: { box: 99, due: Number.NaN, right: 2.7, wrong: -1, lastAnswered: D } },
        'evil.card': { views: 1, firstDay: D, lastSeenMs: T },
      },
      saved: [lesson.id, 'evil.card'],
      xp: -50,
    };
    const s = sanitizeIncoming(raw, (id) => !!cardById(id));
    expect(Object.keys(s.cards)).toEqual([quiz.id]);
    expect(s.cards[quiz.id]).toEqual({ views: 1, firstDay: D, lastSeenMs: T, quiz: { box: 5, due: 0, right: 2, wrong: 0, lastAnswered: D } });
    expect(s.saved).toEqual([lesson.id]);
    expect(s.xp).toBe(0);
  });

  it('a body that is not a state at all is a fresh state, not a crash', () => {
    expect(sanitizeIncoming('nope', () => true)).toEqual(freshState());
    expect(sanitizeIncoming({ v: 99 }, () => true)).toEqual(freshState());
  });
});
