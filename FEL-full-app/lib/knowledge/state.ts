// The learner's state and every change to it, as pure functions. v1 keeps this on the device only
// (lib/knowledge/storage.ts → localStorage); nothing here is uploaded. The server model the owner would need to decide
// on is in docs/KNOWLEDGE-FEED.md.
//
// TUNABLES (new in v1, not owner-signed): XP amounts, the dwell that counts a card, the recent-history length.

import { answer as leitnerAnswer, isMastered, type QuizRecord } from './leitner';
import { creditDay, countToward, doneToday, DAILY_GOAL, NO_STREAK, type Streak, type Today } from './day';
import type { Card, TopicId } from './types';

export const STATE_VERSION = 1;

/** XP: learning, not scrolling. A view earns 1 only once per card; answers earn more; the daily goal a little bonus. */
export const XP = { firstView: 1, firstTryRight: 5, reviewRight: 3, wrong: 1, dailyGoal: 10 } as const;
/** A card counts toward the daily goal after this long on screen (or an answer). A flick past doesn't. */
export const COUNT_DWELL_MS = 2_500;
/** Dwell longer than this is treated as "left the phone on the table", and capped. */
export const DWELL_CAP_MS = 60_000;
/** How many recently shown ids are remembered (the scheduler's near-repeat window reads the tail of this). */
export const RECENT_KEEP = 120;

export interface CardRecord {
  views: number;
  firstDay: number;
  lastSeenMs: number;
  quiz?: QuizRecord;
}

export interface LearnState {
  v: typeof STATE_VERSION;
  onboarded: boolean;
  topics: TopicId[];
  cards: Record<string, CardRecord>;
  /** Most recent last. */
  recent: string[];
  likes: Partial<Record<TopicId, number>>;
  less: Partial<Record<TopicId, number>>;
  dwell: Partial<Record<TopicId, { ms: number; n: number }>>;
  liked: string[];
  saved: string[];
  /** Cards the viewer said "less of this" on — never shown again. */
  hidden: string[];
  xp: number;
  streak: Streak;
  today: Today;
}

export function freshState(): LearnState {
  return {
    v: STATE_VERSION, onboarded: false, topics: [], cards: {}, recent: [], likes: {}, less: {}, dwell: {},
    liked: [], saved: [], hidden: [], xp: 0, streak: NO_STREAK, today: { day: -1, done: [] },
  };
}

/** Read back whatever storage held, defensively: a corrupt or foreign blob becomes a fresh state, never a crash. */
export function reviveState(raw: unknown): LearnState {
  const f = freshState();
  if (!raw || typeof raw !== 'object') return f;
  const r = raw as Partial<LearnState>;
  if (r.v !== STATE_VERSION) return f;
  const arr = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);
  const obj = <T,>(x: unknown, d: T): T => (x && typeof x === 'object' && !Array.isArray(x) ? (x as T) : d);
  const streak = obj<Streak>(r.streak, NO_STREAK);
  const today = obj<Today>(r.today, f.today);
  return {
    v: STATE_VERSION,
    onboarded: r.onboarded === true,
    topics: arr(r.topics) as TopicId[],
    cards: obj(r.cards, {}),
    recent: arr(r.recent).slice(-RECENT_KEEP),
    likes: obj(r.likes, {}),
    less: obj(r.less, {}),
    dwell: obj(r.dwell, {}),
    liked: arr(r.liked),
    saved: arr(r.saved),
    hidden: arr(r.hidden),
    xp: Number.isFinite(r.xp) ? Math.max(0, Number(r.xp)) : 0,
    streak: {
      count: Number.isFinite(streak.count) ? streak.count : 0,
      best: Number.isFinite(streak.best) ? streak.best : 0,
      lastDay: Number.isFinite(streak.lastDay) ? (streak.lastDay as number) : null,
    },
    today: { day: Number.isFinite(today.day) ? today.day : -1, done: arr(today.done) },
  };
}

export function setTopics(s: LearnState, topics: TopicId[]): LearnState {
  return { ...s, topics: [...new Set(topics)], onboarded: topics.length > 0 };
}

/** Count a card toward today's goal; the first time the goal is reached today credits the streak and the bonus. */
function credit(s: LearnState, cardId: string, today: number): LearnState {
  const before = doneToday(s.today, today);
  const t = countToward(s.today, today, cardId);
  const after = doneToday(t, today);
  let next: LearnState = { ...s, today: t };
  if (before < DAILY_GOAL && after >= DAILY_GOAL) {
    next = { ...next, streak: creditDay(s.streak, today), xp: next.xp + XP.dailyGoal };
  }
  return next;
}

/**
 * A card was on screen for `dwellMs`. Records the view (once per card for XP), the topic's dwell, the recent history
 * (for the near-repeat rule), and — if the viewer actually stayed — the daily goal.
 */
export function recordView(s: LearnState, card: Card, today: number, nowMs: number, dwellMs: number): LearnState {
  const prev = s.cards[card.id];
  const rec: CardRecord = prev
    ? { ...prev, views: prev.views + 1, lastSeenMs: nowMs }
    : { views: 1, firstDay: today, lastSeenMs: nowMs };
  const d = Math.max(0, Math.min(DWELL_CAP_MS, dwellMs));
  const td = s.dwell[card.topic] ?? { ms: 0, n: 0 };
  const recent = s.recent[s.recent.length - 1] === card.id ? s.recent : [...s.recent, card.id].slice(-RECENT_KEEP);
  let next: LearnState = {
    ...s,
    cards: { ...s.cards, [card.id]: rec },
    dwell: { ...s.dwell, [card.topic]: { ms: td.ms + d, n: td.n + 1 } },
    recent,
    xp: s.xp + (prev ? 0 : XP.firstView),
  };
  // a quiz counts when it is answered (recordAnswer), not when it is looked at
  if (card.type !== 'quiz' && dwellMs >= COUNT_DWELL_MS) next = credit(next, card.id, today);
  return next;
}

/** A quiz was answered. Updates the Leitner box, XP, and the daily goal. */
export function recordAnswer(s: LearnState, card: Card, correct: boolean, today: number, nowMs: number): LearnState {
  if (card.type !== 'quiz') return s;
  const prev = s.cards[card.id];
  const quiz = leitnerAnswer(prev?.quiz, correct, today);
  const firstTry = !prev?.quiz;
  const sameDayRepeat = prev?.quiz?.lastAnswered === today;
  const rec: CardRecord = { views: prev?.views ?? 1, firstDay: prev?.firstDay ?? today, lastSeenMs: nowMs, quiz };
  const gain = sameDayRepeat ? 0 : !correct ? XP.wrong : firstTry ? XP.firstTryRight : XP.reviewRight;
  const recent = s.recent[s.recent.length - 1] === card.id ? s.recent : [...s.recent, card.id].slice(-RECENT_KEEP);
  return credit({ ...s, cards: { ...s.cards, [card.id]: rec }, xp: s.xp + gain, recent }, card.id, today);
}

const toggle = (list: string[], id: string): string[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

export function toggleLike(s: LearnState, card: Card): LearnState {
  const on = !s.liked.includes(card.id);
  const n = (s.likes[card.topic] ?? 0) + (on ? 1 : -1);
  return { ...s, liked: toggle(s.liked, card.id), likes: { ...s.likes, [card.topic]: Math.max(0, n) } };
}

export function toggleSave(s: LearnState, card: Card): LearnState {
  return { ...s, saved: toggle(s.saved, card.id) };
}

/** "Less of this": the topic is weighted down and this card never comes back. */
export function lessOfThis(s: LearnState, card: Card): LearnState {
  if (s.hidden.includes(card.id)) return s;
  return { ...s, hidden: [...s.hidden, card.id], less: { ...s.less, [card.topic]: (s.less[card.topic] ?? 0) + 1 } };
}

export interface TopicProgress { topic: TopicId; seen: number; total: number; quizzes: number; mastered: number }

export function topicProgress(s: LearnState, topic: TopicId, cards: Card[]): TopicProgress {
  const mine = cards.filter((c) => c.topic === topic);
  const quizzes = mine.filter((c) => c.type === 'quiz');
  return {
    topic,
    seen: mine.filter((c) => s.cards[c.id]).length,
    total: mine.length,
    quizzes: quizzes.length,
    mastered: quizzes.filter((c) => isMastered(s.cards[c.id]?.quiz)).length,
  };
}

export function masteredCount(s: LearnState): number {
  return Object.values(s.cards).filter((r) => isMastered(r.quiz)).length;
}
