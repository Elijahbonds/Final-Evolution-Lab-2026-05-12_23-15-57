import { describe, expect, it } from 'vitest';
import {
  COUNT_DWELL_MS, freshState, lessOfThis, masteredCount, recordAnswer, recordView, reviveState, setTopics, toggleLike,
  toggleSave, topicProgress, XP, type LearnState,
} from './state';
import { DAILY_GOAL } from './day';
import { loadState, saveState, STORAGE_KEY } from './storage';
import type { Card } from './types';

const lesson = (id: string, topic: Card['topic'] = 'science'): Card => ({
  id: `${topic}.${id}`, topic, type: 'lesson', headline: 'h', lines: ['a', 'b'], visual: { kind: 'motif', motif: 'atom' }, source: 's',
});
const quiz = (id: string, topic: Card['topic'] = 'science'): Card => ({
  id: `${topic}.${id}`, topic, type: 'quiz', question: 'q', options: ['x', 'y'], answer: 0, why: 'w', source: 's',
});

describe('recording views', () => {
  it('earns first-view XP once per card, and counts toward the goal only after a real dwell', () => {
    let s = setTopics(freshState(), ['science']);
    s = recordView(s, lesson('a'), 1, 1000, 300);                // a flick past
    expect(s.xp).toBe(XP.firstView);
    expect(s.today.done).toEqual([]);
    s = recordView(s, lesson('a'), 1, 2000, COUNT_DWELL_MS);     // came back and read it
    expect(s.xp).toBe(XP.firstView);                              // no second view XP
    expect(s.today).toEqual({ day: 1, done: ['science.a'] });
    expect(s.cards['science.a'].views).toBe(2);
  });

  it('a quiz counts when answered, not when looked at', () => {
    let s = recordView(freshState(), quiz('q'), 1, 0, 10_000);
    expect(s.today.done).toEqual([]);
    s = recordAnswer(s, quiz('q'), true, 1, 1);
    expect(s.today.done).toEqual(['science.q']);
  });

  it('meeting the daily goal credits the streak and the bonus exactly once', () => {
    let s: LearnState = freshState();
    for (let i = 0; i < DAILY_GOAL + 2; i++) s = recordView(s, lesson(`c${i}`), 3, i, COUNT_DWELL_MS);
    expect(s.streak).toEqual({ count: 1, best: 1, lastDay: 3 });
    expect(s.xp).toBe((DAILY_GOAL + 2) * XP.firstView + XP.dailyGoal);
    for (let i = 0; i < DAILY_GOAL; i++) s = recordView(s, lesson(`d${i}`), 4, i, COUNT_DWELL_MS);
    expect(s.streak.count).toBe(2);
  });

  it('keeps the recent history without consecutive duplicates', () => {
    let s = recordView(freshState(), lesson('a'), 1, 0, 0);
    s = recordView(s, lesson('a'), 1, 1, 0);
    s = recordView(s, lesson('b'), 1, 2, 0);
    expect(s.recent).toEqual(['science.a', 'science.b']);
  });
});

describe('answers, likes, saves, less of this', () => {
  it('pays first-try, review and wrong XP, and nothing for a same-day repeat', () => {
    let s = recordAnswer(freshState(), quiz('q'), true, 1, 0);
    expect(s.xp).toBe(XP.firstTryRight);
    s = recordAnswer(s, quiz('q'), true, 1, 1);
    expect(s.xp).toBe(XP.firstTryRight);
    s = recordAnswer(s, quiz('q'), true, 2, 2);
    expect(s.xp).toBe(XP.firstTryRight + XP.reviewRight);
    s = recordAnswer(s, quiz('q'), false, 5, 3);
    expect(s.xp).toBe(XP.firstTryRight + XP.reviewRight + XP.wrong);
    expect(s.cards['science.q'].quiz?.box).toBe(1);
  });

  it('toggles likes and saves, and keeps the per-topic like count in step', () => {
    let s = toggleLike(freshState(), lesson('a'));
    expect(s.liked).toEqual(['science.a']);
    expect(s.likes.science).toBe(1);
    s = toggleLike(s, lesson('a'));
    expect(s.liked).toEqual([]);
    expect(s.likes.science).toBe(0);
    s = toggleSave(toggleSave(s, lesson('b')), lesson('c'));
    expect(s.saved).toEqual(['science.b', 'science.c']);
  });

  it('"less of this" hides the card and counts against the topic once', () => {
    let s = lessOfThis(freshState(), lesson('a'));
    s = lessOfThis(s, lesson('a'));
    expect(s.hidden).toEqual(['science.a']);
    expect(s.less.science).toBe(1);
  });

  it('reports topic progress and mastery', () => {
    const cards = [lesson('a'), quiz('q1'), quiz('q2'), lesson('z', 'space')];
    let s = recordView(freshState(), cards[0], 0, 0, 5000);
    for (const d of [0, 1, 4]) s = recordAnswer(s, cards[1], true, d, d);
    expect(topicProgress(s, 'science', cards)).toEqual({ topic: 'science', seen: 2, total: 3, quizzes: 2, mastered: 1 });
    expect(masteredCount(s)).toBe(1);
  });
});

describe('storage', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };

  it('round-trips through storage', () => {
    const st = mem();
    const s = toggleSave(setTopics(freshState(), ['space', 'art']), lesson('a', 'space'));
    saveState(s, st);
    expect(loadState(st)).toEqual(s);
  });

  it('a corrupt, foreign or throwing store gives a fresh state, never a crash', () => {
    const st = mem();
    st.m.set(STORAGE_KEY, '{not json');
    expect(loadState(st)).toEqual(freshState());
    st.m.set(STORAGE_KEY, JSON.stringify({ v: 99, xp: 5 }));
    expect(loadState(st)).toEqual(freshState());
    expect(loadState({ getItem: () => { throw new Error('blocked'); } })).toEqual(freshState());
    expect(() => saveState(freshState(), { setItem: () => { throw new Error('full'); } })).not.toThrow();
    expect(loadState(null)).toEqual(freshState());
  });

  it('revives partial or wrong-typed fields safely', () => {
    const s = reviveState({ v: 1, onboarded: true, topics: ['art', 3], xp: 'lots', streak: { count: 2, best: 4, lastDay: 'x' }, recent: 'no' });
    expect(s.topics).toEqual(['art']);
    expect(s.xp).toBe(0);
    expect(s.streak).toEqual({ count: 2, best: 4, lastDay: null });
    expect(s.recent).toEqual([]);
  });
});
