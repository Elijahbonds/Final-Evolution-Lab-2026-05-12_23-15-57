// Learning XP → account XP, decided on the server. KNOWLEDGE-FEED v2 (2026-10-06):
//   owner decision 3 — "Daily goal: a small XP bonus only (no coins), once per day."
//   owner decision 4 — "Learning XP feeds account XP with a daily cap … device-only users keep local XP. Don't change
//   any other economy rule."
//
// HOW. For a synced account, every card view and quiz answer is an EVENT the server applies to its own copy of the
// learner's state with the SAME reducers the device runs (lib/knowledge/state.ts recordView / recordAnswer). The quiz
// answer is graded on the server from the catalogue (the client sends the option it picked, never "I was right"). The
// learning XP that reducer step earns is credited to PlayerProfile.xp — the account XP every mode's session pays into
// (app/api/sessions/route.ts increments the same column) — trimmed to LEARN_ACCOUNT_XP_DAILY_CAP a day. Reaching the
// daily goal adds GOAL_BONUS_ACCOUNT_XP once per local day (goalBonusDay), outside that cap: it can only happen once.
// No coins, shards, LC, season XP or PRQ: none of those move. Learning XP is NOT a GameSession row, so the sessions
// route's own daily caps (lib/economy-caps.ts, summed from GameSession) neither count it nor are changed by it.
//
// Pure: the route (lib/knowledge/server/learnRoutes.ts) loads the rows, calls applyLearnEvent, and writes what it returns.

import { recordAnswer, recordView, XP, type LearnState } from './state';
import { dayNumber } from './day';
import type { Card } from './types';

/** TUNED (new, not owner-felt): account XP a day from learning. ~10 cards and a few right answers' worth — a learning
 *  nudge beside a single game session's hundreds. The daily-goal bonus is on top. */
export const LEARN_ACCOUNT_XP_DAILY_CAP = 50;
/** The daily-goal bonus, in account XP — the same 10 the device already shows as learning XP (state.ts XP.dailyGoal). */
export const GOAL_BONUS_ACCOUNT_XP = XP.dailyGoal;

/** The account-XP ledger kept on LearnProfile. */
export interface XpLedger {
  /** The local day `today` counts for (-1: never). */
  day: number;
  /** Learning account XP already credited on `day` (not counting the goal bonus). */
  today: number;
  /** The last local day the goal bonus was paid (-1: never). */
  goalBonusDay: number;
}

export const FRESH_LEDGER: XpLedger = { day: -1, today: 0, goalBonusDay: -1 };

/**
 * Is the client's local day believable? Every time zone's local day is the server's UTC day, the day before or the day
 * after, so anything further out is a broken clock or a forged body.
 */
export function plausibleDay(day: unknown, nowMs: number): day is number {
  if (typeof day !== 'number' || !Number.isInteger(day)) return false;
  return Math.abs(day - dayNumber(nowMs, 0)) <= 1;
}

export interface Award {
  /** Learning XP the reducer earned (what the feed's own tally moves by). */
  learnXp: number;
  /** Account XP credited for it, after the daily cap. */
  capped: number;
  /** The goal bonus credited (GOAL_BONUS_ACCOUNT_XP or 0). */
  goalBonus: number;
  /** capped + goalBonus — the PlayerProfile.xp increment. */
  accountXp: number;
  /** True when the cap trimmed this award (the feed says so). */
  capHit: boolean;
  ledger: XpLedger;
}

/**
 * Credit `learnXp` (and the goal, if this event reached it) on `day` against the ledger. A day earlier than the
 * ledger's is a stale event (a clock that went back, a replay): it earns nothing, so the cap can't be reset by
 * claiming yesterday again. A later day starts a fresh cap.
 */
export function creditAccountXp(ledger: XpLedger, day: number, learnXp: number, goalReached: boolean): Award {
  if (day < ledger.day) return { learnXp, capped: 0, goalBonus: 0, accountXp: 0, capHit: false, ledger };
  const base = day > ledger.day ? { ...ledger, day, today: 0 } : ledger;
  const room = Math.max(0, LEARN_ACCOUNT_XP_DAILY_CAP - base.today);
  const capped = Math.min(Math.max(0, learnXp), room);
  const goalBonus = goalReached && base.goalBonusDay < day ? GOAL_BONUS_ACCOUNT_XP : 0;
  return {
    learnXp,
    capped,
    goalBonus,
    accountXp: capped + goalBonus,
    capHit: capped < learnXp,
    ledger: { day, today: base.today + capped, goalBonusDay: goalBonus ? day : base.goalBonusDay },
  };
}

export type LearnEvent =
  | { kind: 'view'; cardId: string; dwellMs: number }
  | { kind: 'answer'; cardId: string; choice: number };

/** A body's event, checked: a known card, a finite dwell, an integer choice that is one of the quiz's options. */
export function parseEvent(raw: unknown, cardById: (id: string) => Card | undefined): { event: LearnEvent; card: Card } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const card = typeof r.cardId === 'string' ? cardById(r.cardId) : undefined;
  if (!card) return null;
  if (r.kind === 'view' && Number.isFinite(r.dwellMs) && Number(r.dwellMs) >= 0) {
    return { event: { kind: 'view', cardId: card.id, dwellMs: Number(r.dwellMs) }, card };
  }
  if (r.kind === 'answer' && card.type === 'quiz' && Number.isInteger(r.choice) && Number(r.choice) >= 0 && Number(r.choice) < card.options.length) {
    return { event: { kind: 'answer', cardId: card.id, choice: Number(r.choice) }, card };
  }
  return null;
}

/**
 * Apply one event to the server's state and price it. `state` needs only this card's record (the reducers touch
 * nothing else of `cards`). Returns the next state and the award; the caller writes both.
 */
export function applyLearnEvent(
  state: LearnState, ledger: XpLedger, event: LearnEvent, card: Card, day: number, nowMs: number,
): { state: LearnState; award: Award; correct?: boolean } {
  let next: LearnState;
  let correct: boolean | undefined;
  if (event.kind === 'view') next = recordView(state, card, day, nowMs, event.dwellMs);
  else {
    correct = card.type === 'quiz' && event.choice === card.answer;
    next = recordAnswer(state, card, correct, day, nowMs);
  }
  const goalReached = next.streak.lastDay === day && state.streak.lastDay !== day;
  const learnXp = Math.max(0, next.xp - state.xp - (goalReached ? XP.dailyGoal : 0));
  return { state: next, award: creditAccountXp(ledger, day, learnXp, goalReached), ...(correct === undefined ? {} : { correct }) };
}
