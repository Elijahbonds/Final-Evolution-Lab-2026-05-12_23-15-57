import { describe, it, expect } from 'vitest';
import { firstNight, nextNight, cardWon, isLastAttempt, type NightState } from './ContinuousNight';
import { emptyCard, addAttempt, nightReport, type DunkCard } from '@/lib/mp/dunkCard';

// A night that has actually been played: scores on the board, a rival ahead, a
// chain banked, sitting on the last attempt of the last round.
const PLAYED: NightState = {
  night: 3, round: 2, dunkInRound: 1,
  playerTotal: 171, rivalTotal: 188, makes: 3, misses: 1, bestChain: 2,
};

describe('ContinuousNight — the GO AGAIN ledger (TRY-ONBOARD G1 / BUG-001)', () => {
  it('opens on night 1 with nothing on the board', () => {
    expect(firstNight()).toEqual({
      night: 1, round: 1, dunkInRound: 0, playerTotal: 0, rivalTotal: 0, makes: 0, misses: 0, bestChain: 0,
    });
  });

  it('GO AGAIN carries the night number and NOTHING else', () => {
    const n = nextNight(PLAYED);
    expect(n.night).toBe(4);
    // every field a contest scores is back to the opening ledger
    const { night: _drop, ...scored } = n;
    const { night: _drop2, ...fresh } = firstNight();
    expect(scored).toEqual(fresh);
  });

  it('a rival total never survives into the next night', () => {
    // the failure this shape exists to prevent: night 2 opening 188 down on a
    // deficit the guest never played for
    expect(nextNight(PLAYED).rivalTotal).toBe(0);
    expect(nextNight(PLAYED).playerTotal).toBe(0);
  });

  it('is pure — the caller is destructuring the result, not being mutated', () => {
    const before = { ...PLAYED };
    nextNight(PLAYED);
    expect(PLAYED).toEqual(before);
  });

  it('nights climb without bound — the run ends when the player quits, not on a counter', () => {
    let s = firstNight();
    for (let i = 0; i < 25; i++) s = nextNight({ ...s, playerTotal: 40, rivalTotal: 41, misses: 2 });
    expect(s.night).toBe(26);
    expect(s.misses).toBe(0);
  });

  it('the card goes to the player on a tie', () => {
    expect(cardWon({ playerTotal: 170, rivalTotal: 169 })).toBe(true);
    expect(cardWon({ playerTotal: 170, rivalTotal: 170 })).toBe(true);
    expect(cardWon({ playerTotal: 169, rivalTotal: 170 })).toBe(false);
  });

  it('knows the attempt the card is waiting on (2 rounds x 2 dunks)', () => {
    const at = (round: number, dunkInRound: number) => isLastAttempt({ ...firstNight(), round, dunkInRound }, 2, 2);
    expect(at(1, 0)).toBe(false);
    expect(at(1, 1)).toBe(false);
    expect(at(2, 0)).toBe(false);
    expect(at(2, 1)).toBe(true);
  });
});

// HOTFIX (2026-09-24): the card is part of the night. DunkMode keeps the card beside the ledger: a player attempt
// moves the score and the card together, and GO AGAIN has to open a fresh card when nextNight() zeroes the score.
// It didn't, so night 2 reported both nights. This plays nights the way the mode books them, with the real card.
describe('ContinuousNight — the card closes with the night', () => {
  type Night = { s: NightState; card: DunkCard };
  // one player attempt, booked the way DunkMode's make and miss paths book it
  const book = ({ s, card }: Night, total: number): Night => {
    const made = total >= 40;
    return {
      s: { ...s, playerTotal: s.playerTotal + total, makes: s.makes + (made ? 1 : 0), misses: s.misses + (made ? 0 : 1) },
      card: addAttempt(card, {
        round: s.round, style: 'POWER', prop: 'NO PROP', finish: made ? 'dunk_windmill' : '', label: made ? 'WINDMILL' : 'BLOWN',
        judges: [], total, made,
      }),
    };
  };
  const play = (n: Night, totals: number[]): Night => totals.reduce(book, n);
  const NIGHT_1 = [44, 51, 31, 58];   // 184, best 58, one off the iron
  const NIGHT_2 = [47, 49, 42, 55];   // 193, best 55

  it('every night the card adds up to the score that night reports', () => {
    let n = play({ s: firstNight(), card: emptyCard() }, NIGHT_1);
    expect(n.card.total).toBe(n.s.playerTotal);
    n = { s: nextNight(n.s), card: emptyCard() };   // GO AGAIN, as DunkMode.goAgain does it
    n = play(n, NIGHT_2);
    expect(n.s.night).toBe(2);
    expect(n.card.total).toBe(n.s.playerTotal);
    expect(n.card.attempts.map((a) => a.total)).toEqual(NIGHT_2);
    expect(nightReport(n.card).headline).toBe('YOUR NIGHT: 193 · BEST 55');
    expect(nightReport(n.card).lines).toContain('4 down, 0 off the iron');
  });

  it('the card never closes a night by itself: kept across GO AGAIN it reports both nights (the bug)', () => {
    let n = play({ s: firstNight(), card: emptyCard() }, NIGHT_1);
    n = { ...n, s: nextNight(n.s) };   // the score reset, the card did not
    n = play(n, NIGHT_2);
    expect(n.s.playerTotal).toBe(193);
    expect(n.card.total).toBe(377);
    // night 1's best dunk and night 1's miss, on night 2's card
    expect(nightReport(n.card).headline).toBe('YOUR NIGHT: 377 · BEST 58');
    expect(nightReport(n.card).lines).toContain('7 down, 1 off the iron');
  });
});
