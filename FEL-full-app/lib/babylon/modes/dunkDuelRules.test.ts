// IMPROVE (2026-10-06): the duel's pure rules — the turn order with a match length, the dunk-off, the deciding number, the
// server's bound covering every length, and FLASHY's trick requirement (dunkDuelRules.ts).
import { describe, it, expect } from 'vitest';
import { DUNKOFF_MAX_ROUNDS, MATCH_LENGTHS, duelNeed, duelNext, needLine, nextMatchLength, styleTierFor, type DuelState } from './dunkDuelRules';
import { STORY_MIRRORED, dunkDuelBound, checkRunScore } from '@/lib/sessions/modeScoreRules';
import { DUNK_ATTEMPT_MAX } from '@/lib/arena-score-integrity';
import { MIN_TOTAL, PERFECT_TOTAL } from '../core/JudgePanel';

const st = (o: Partial<DuelState> = {}): DuelState => ({ dunksEach: 2, attempts: [0, 0], totals: [0, 0], off: [[], []], ...o });

describe('the match length (#9)', () => {
  it('rings 2 → 3 → 5 → 2, and the longest is the length the server bound mirrors', () => {
    expect(MATCH_LENGTHS[0]).toBe(2);
    expect(Math.max(...MATCH_LENGTHS)).toBe(STORY_MIRRORED.dunkDuelMaxDunksEach);
    expect(nextMatchLength(2)).toBe(3);
    expect(nextMatchLength(3)).toBe(5);
    expect(nextMatchLength(5)).toBe(2);
    expect(nextMatchLength(7)).toBe(2);
  });

  it('turns alternate P1, P2 for the chosen length', () => {
    const order: number[] = [];
    const attempts: [number, number] = [0, 0];
    for (;;) {
      const n = duelNext(st({ dunksEach: 3, attempts, totals: [10, 0] }));
      if (n.kind !== 'turn') break;
      order.push(n.idx); attempts[n.idx]++;
    }
    expect(order).toEqual([0, 1, 0, 1, 0, 1]);
  });

  it('the real total of a perfect match at every length, dunk-off included, is inside the server bound (owner 2026-10-06: no scaling)', () => {
    expect(STORY_MIRRORED.dunkDuelDunkOffRounds).toBe(DUNKOFF_MAX_ROUNDS);
    expect(dunkDuelBound()).toBe((Math.max(...MATCH_LENGTHS) + DUNKOFF_MAX_ROUNDS) * DUNK_ATTEMPT_MAX);
    for (const n of MATCH_LENGTHS) {
      const perfect = (n + DUNKOFF_MAX_ROUNDS) * PERFECT_TOTAL;
      expect(perfect, `${n} each`).toBeLessThanOrEqual(dunkDuelBound());
      expect(checkRunScore({ mode: 'dunkduel', score: n * PERFECT_TOTAL, durationMs: 5 * 60_000 }).ok, `${n} each`).toBe(true);
    }
  });
});

describe('the dunk-off (#4)', () => {
  it('a split regulation total ends the duel without one', () => {
    expect(duelNext(st({ attempts: [2, 2], totals: [80, 79] }))).toEqual({ kind: 'over', winner: 0, byDunkOff: false });
    expect(duelNext(st({ attempts: [2, 2], totals: [70, 79] }))).toEqual({ kind: 'over', winner: 1, byDunkOff: false });
  });

  it('a level total opens it: P1 dunks, P2 answers, a split round ends it', () => {
    const level = { attempts: [2, 2] as [number, number], totals: [80, 80] as [number, number] };
    expect(duelNext(st({ ...level }))).toEqual({ kind: 'turn', idx: 0, dunkOff: true, round: 1 });
    expect(duelNext(st({ ...level, off: [[41], []] }))).toEqual({ kind: 'turn', idx: 1, dunkOff: true, round: 1 });
    expect(duelNext(st({ ...level, off: [[41], [42]] }))).toEqual({ kind: 'over', winner: 1, byDunkOff: true });
    expect(duelNext(st({ ...level, off: [[41], [0]] }))).toEqual({ kind: 'over', winner: 0, byDunkOff: true });
  });

  it('a level round goes again, and DUNKOFF_MAX_ROUNDS level rounds are a dead heat (two players missing cannot loop forever)', () => {
    const level = { attempts: [2, 2] as [number, number], totals: [80, 80] as [number, number] };
    expect(duelNext(st({ ...level, off: [[0], [0]] }))).toEqual({ kind: 'turn', idx: 0, dunkOff: true, round: 2 });
    const zeros = Array.from({ length: DUNKOFF_MAX_ROUNDS }, () => 0);
    expect(duelNext(st({ ...level, off: [zeros, zeros] }))).toEqual({ kind: 'over', winner: null, byDunkOff: true });
  });
});

describe('the deciding number (#5)', () => {
  it('on the trailing player’s last dunk, with the other finished: the margin plus one', () => {
    expect(duelNeed(st({ attempts: [2, 1], totals: [84, 40] }), 1)).toBe(45);
    expect(duelNeed(st({ attempts: [2, 1], totals: [84, 84] }), 1)).toBe(1);   // level: any point wins it
  });

  it('nothing on a dunk that decides nothing, or for a player already ahead', () => {
    expect(duelNeed(st({ attempts: [1, 1], totals: [40, 40] }), 0)).toBeNull();   // P1's last, but P2 still has one to answer
    expect(duelNeed(st({ attempts: [2, 0], totals: [84, 0] }), 1)).toBeNull();     // P2's first of two
    expect(duelNeed(st({ attempts: [2, 1], totals: [40, 84] }), 1)).toBeNull();    // P2 already leads
  });

  it('in the dunk-off, P2’s answer needs P1’s round plus one; P1’s opener needs nothing', () => {
    const level = { attempts: [2, 2] as [number, number], totals: [80, 80] as [number, number] };
    expect(duelNeed(st({ ...level, off: [[43], []] }), 1)).toBe(44);
    expect(duelNeed(st({ ...level, off: [[], []] }), 0)).toBeNull();
  });

  it('says the number the way the panel can pay it', () => {
    expect(needLine(12, MIN_TOTAL, PERFECT_TOTAL)).toBe('ANY MAKE WINS IT');
    expect(needLine(44, MIN_TOTAL, PERFECT_TOTAL)).toBe('NEEDS 44 TO WIN');
    expect(needLine(PERFECT_TOTAL, MIN_TOTAL, PERFECT_TOTAL)).toBe(`NEEDS A PERFECT ${PERFECT_TOTAL}`);
    expect(needLine(PERFECT_TOTAL + 9, MIN_TOTAL, PERFECT_TOTAL)).toMatch(/OUT OF REACH/);
  });
});

describe('FLASHY asks for flash (#3, TUNED)', () => {
  const tiers = { power: 3, flashy: 5.5, sig: 8 };
  it('a FLASHY with no air trick is judged at POWER’s tier; with one, at its own', () => {
    expect(styleTierFor('flashy', 0, tiers)).toBe(3);
    expect(styleTierFor('flashy', 1, tiers)).toBe(5.5);
  });
  it('POWER and SIGNATURE are unchanged either way', () => {
    for (const n of [0, 2]) { expect(styleTierFor('power', n, tiers)).toBe(3); expect(styleTierFor('sig', n, tiers)).toBe(8); }
  });
});
