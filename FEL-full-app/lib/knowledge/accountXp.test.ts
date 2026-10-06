import { describe, expect, it } from 'vitest';
import {
  applyLearnEvent, creditAccountXp, FRESH_LEDGER, GOAL_BONUS_ACCOUNT_XP, LEARN_ACCOUNT_XP_DAILY_CAP, parseEvent, plausibleDay,
  type XpLedger,
} from './accountXp';
import { cardById, CARDS } from './catalog';
import { freshState, setTopics, XP, type LearnState } from './state';
import { DAILY_GOAL } from './day';
import type { Card, QuizCard } from './types';

// KNOWLEDGE-FEED v2: owner decision 3 (daily-goal bonus, once a day) and 4 (learning XP → account XP, capped).
const D = 20_000;
const NOW = D * 86_400_000 + 12 * 3_600_000;   // noon UTC on day D

describe('the daily cap on learning → account XP', () => {
  it('credits up to the cap, then nothing, and says the cap was hit', () => {
    let l: XpLedger = { ...FRESH_LEDGER };
    let total = 0;
    for (let i = 0; i < 30; i++) {
      const a = creditAccountXp(l, D, 5, false);
      total += a.accountXp;
      l = a.ledger;
      if (total >= LEARN_ACCOUNT_XP_DAILY_CAP) expect(creditAccountXp(l, D, 5, false).capHit).toBe(true);
    }
    expect(total).toBe(LEARN_ACCOUNT_XP_DAILY_CAP);
    expect(l.today).toBe(LEARN_ACCOUNT_XP_DAILY_CAP);
  });

  it('trims the award that crosses the cap to exactly the room left', () => {
    const a = creditAccountXp({ day: D, today: LEARN_ACCOUNT_XP_DAILY_CAP - 2, goalBonusDay: -1 }, D, 5, false);
    expect(a.capped).toBe(2);
    expect(a.capHit).toBe(true);
  });

  it('a new day starts a fresh cap', () => {
    const full: XpLedger = { day: D, today: LEARN_ACCOUNT_XP_DAILY_CAP, goalBonusDay: -1 };
    expect(creditAccountXp(full, D, 5, false).accountXp).toBe(0);
    const next = creditAccountXp(full, D + 1, 5, false);
    expect(next.accountXp).toBe(5);
    expect(next.ledger).toEqual({ day: D + 1, today: 5, goalBonusDay: -1 });
  });

  it('a STALE day earns nothing — claiming yesterday again cannot reset the cap', () => {
    const l: XpLedger = { day: D, today: LEARN_ACCOUNT_XP_DAILY_CAP, goalBonusDay: D };
    const a = creditAccountXp(l, D - 1, 5, true);
    expect(a.accountXp).toBe(0);
    expect(a.ledger).toBe(l);
  });
});

describe('the daily-goal bonus: account XP, once per day', () => {
  it('pays GOAL_BONUS_ACCOUNT_XP the first time the goal is reached on a day', () => {
    const a = creditAccountXp(FRESH_LEDGER, D, 0, true);
    expect(a.goalBonus).toBe(GOAL_BONUS_ACCOUNT_XP);
    expect(a.ledger.goalBonusDay).toBe(D);
  });

  it('never twice on the same day, even if the goal is "reached" again', () => {
    const first = creditAccountXp(FRESH_LEDGER, D, 0, true);
    expect(creditAccountXp(first.ledger, D, 0, true).goalBonus).toBe(0);
    expect(creditAccountXp(first.ledger, D + 1, 0, true).goalBonus).toBe(GOAL_BONUS_ACCOUNT_XP);
  });

  it('is paid on top of a spent cap — the cap is for card XP, the bonus is once a day by construction', () => {
    const a = creditAccountXp({ day: D, today: LEARN_ACCOUNT_XP_DAILY_CAP, goalBonusDay: -1 }, D, 5, true);
    expect(a.capped).toBe(0);
    expect(a.goalBonus).toBe(GOAL_BONUS_ACCOUNT_XP);
    expect(a.accountXp).toBe(GOAL_BONUS_ACCOUNT_XP);
  });

  it('is XP only: the bonus is a small number, and nothing here names a coin, shard or credit', () => {
    expect(GOAL_BONUS_ACCOUNT_XP).toBe(XP.dailyGoal);
    expect(GOAL_BONUS_ACCOUNT_XP).toBeLessThanOrEqual(20);
  });
});

describe('a client\'s day and event are checked', () => {
  it('a local day within one of the server\'s UTC day is believed; further out is not', () => {
    expect(plausibleDay(D, NOW)).toBe(true);
    expect(plausibleDay(D - 1, NOW)).toBe(true);
    expect(plausibleDay(D + 1, NOW)).toBe(true);
    expect(plausibleDay(D + 2, NOW)).toBe(false);
    expect(plausibleDay(D - 2, NOW)).toBe(false);
    expect(plausibleDay(D + 0.5, NOW)).toBe(false);
    expect(plausibleDay('20000', NOW)).toBe(false);
  });

  it('only a known card, a finite dwell, and a choice that is one of the quiz\'s options', () => {
    const quiz = CARDS.find((c): c is QuizCard => c.type === 'quiz')!;
    expect(parseEvent({ kind: 'view', cardId: quiz.id, dwellMs: 3000 }, cardById)?.event).toEqual({ kind: 'view', cardId: quiz.id, dwellMs: 3000 });
    expect(parseEvent({ kind: 'view', cardId: 'nope.nope', dwellMs: 3000 }, cardById)).toBeNull();
    expect(parseEvent({ kind: 'view', cardId: quiz.id, dwellMs: Number.NaN }, cardById)).toBeNull();
    expect(parseEvent({ kind: 'answer', cardId: quiz.id, choice: quiz.options.length }, cardById)).toBeNull();
    expect(parseEvent({ kind: 'answer', cardId: quiz.id, choice: 1.5 }, cardById)).toBeNull();
    expect(parseEvent({ kind: 'answer', cardId: CARDS.find((c) => c.type === 'lesson')!.id, choice: 0 }, cardById)).toBeNull();
    // the body cannot say it was right: there is no such field to send
    expect(parseEvent({ kind: 'answer', cardId: quiz.id, choice: 0, correct: true }, cardById)?.event).toEqual({ kind: 'answer', cardId: quiz.id, choice: 0 });
  });
});

describe('applying events with the device\'s own reducers', () => {
  const quizzes = CARDS.filter((c): c is QuizCard => c.type === 'quiz' && c.topic === 'science');
  const lessons = CARDS.filter((c) => (c.type === 'lesson' || c.type === 'fact') && c.topic === 'science');
  const start = (): LearnState => setTopics(freshState(), ['science']);

  it('the server grades the answer itself: the right option earns first-try XP, a wrong one less', () => {
    const q = quizzes[0];
    const wrong = (q.answer + 1) % q.options.length;
    const right = applyLearnEvent(start(), FRESH_LEDGER, { kind: 'answer', cardId: q.id, choice: q.answer }, q, D, NOW);
    expect(right.correct).toBe(true);
    expect(right.award.learnXp).toBe(XP.firstTryRight);
    const miss = applyLearnEvent(start(), FRESH_LEDGER, { kind: 'answer', cardId: q.id, choice: wrong }, q, D, NOW);
    expect(miss.correct).toBe(false);
    expect(miss.award.learnXp).toBe(XP.wrong);
  });

  it('a view earns once per card; a second view of the same card earns nothing', () => {
    const c = lessons[0];
    const one = applyLearnEvent(start(), FRESH_LEDGER, { kind: 'view', cardId: c.id, dwellMs: 3000 }, c, D, NOW);
    expect(one.award.accountXp).toBe(XP.firstView);
    const two = applyLearnEvent(one.state, one.award.ledger, { kind: 'view', cardId: c.id, dwellMs: 3000 }, c, D, NOW + 1);
    expect(two.award.accountXp).toBe(0);
  });

  it('the event that completes the daily goal carries the bonus — and only that one', () => {
    let s = start();
    let l = { ...FRESH_LEDGER };
    const bonuses: number[] = [];
    for (const c of lessons.slice(0, DAILY_GOAL + 2)) {
      const r = applyLearnEvent(s, l, { kind: 'view', cardId: c.id, dwellMs: 3000 }, c as Card, D, NOW);
      bonuses.push(r.award.goalBonus);
      expect(r.award.learnXp).toBe(XP.firstView);   // the goal's learning-XP bonus is not ALSO counted as card XP
      s = r.state; l = r.award.ledger;
    }
    expect(bonuses).toEqual(bonuses.map((_, i) => (i === DAILY_GOAL - 1 ? GOAL_BONUS_ACCOUNT_XP : 0)));
  });
});
