import { describe, it, expect } from 'vitest';
import { firstNight, nextNight, cardWon, isLastAttempt, type NightState } from './ContinuousNight';

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
