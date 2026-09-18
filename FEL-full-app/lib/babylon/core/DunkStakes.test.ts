// CALLING YOUR SHOT MUST NEVER BE A BUTTON THAT SAYS "MORE POINTS" (2026-09-14).
//
// If the bonus for landing a called dunk is worth more than failing one costs, calling stops being a
// gamble: every player holds it every time, the declaration means nothing, and the mechanic is a flat buff
// wearing a costume. The sweep below walks every attempt x called x landed combination and asserts a
// caller never out-earns a non-caller on the same outcome unless they actually landed what they called.
//
// It is the same invariant Nerve and RivalNerve are built around — pointed at the player this time.

import { describe, it, expect } from 'vitest';
import {
  freshStakes, call, spendAttempt, attemptsLeft, canRetry,
  attemptScale, stakesScale, callLanded, stakesLabel,
  ATTEMPTS_PER_DUNK, ATTEMPT_SCALE, CALL_BONUS, CALL_MISS_SCALE, FRESH_STAKES,
} from './DunkStakes';

describe('DunkStakes — attempts', () => {
  it('starts with the full allowance and nothing called', () => {
    expect(attemptsLeft(freshStakes())).toBe(ATTEMPTS_PER_DUNK);
    expect(freshStakes().called).toBeNull();
  });

  it('spends down to zero and never past it', () => {
    let s = freshStakes();
    for (let i = 0; i < ATTEMPTS_PER_DUNK + 4; i++) s = spendAttempt(s);
    expect(s.attemptsUsed).toBe(ATTEMPTS_PER_DUNK);
    expect(attemptsLeft(s)).toBe(0);
  });

  it('never mutates the ledger it was handed', () => {
    const s = freshStakes();
    spendAttempt(s); call(s, 'windmill');
    expect(s).toEqual(FRESH_STAKES);
  });

  it('pays less for every attempt burned, and never nothing', () => {
    let prev = Infinity;
    for (let n = 1; n <= ATTEMPTS_PER_DUNK; n++) {
      const v = attemptScale(n);
      expect(v).toBeLessThan(prev);
      expect(v).toBeGreaterThan(0);
      prev = v;
    }
    expect(attemptScale(1)).toBe(1);
    expect(attemptScale(ATTEMPTS_PER_DUNK)).toBe(ATTEMPT_SCALE[ATTEMPT_SCALE.length - 1]);
  });

  it('clamps a nonsense attempt count rather than indexing off the end', () => {
    expect(attemptScale(0)).toBe(1);
    expect(attemptScale(-4)).toBe(1);
    expect(attemptScale(NaN)).toBe(1);
    expect(attemptScale(99)).toBe(ATTEMPT_SCALE[ATTEMPT_SCALE.length - 1]);
  });

  // A made dunk is finished. Re-rolling one hoping for better judges is a slot machine, not a contest.
  it('lets you retry a miss and never a make', () => {
    const s = spendAttempt(freshStakes());
    expect(canRetry(s, false)).toBe(true);
    expect(canRetry(s, true)).toBe(false);
  });

  it('stops offering a retry once the attempts are gone', () => {
    let s = freshStakes();
    for (let i = 0; i < ATTEMPTS_PER_DUNK; i++) s = spendAttempt(s);
    expect(canRetry(s, false)).toBe(false);
  });
});

describe('DunkStakes — the call', () => {
  it('is optional, and clears back to null', () => {
    expect(call(freshStakes(), 'eastbay').called).toBe('eastbay');
    expect(call(call(freshStakes(), 'eastbay'), null).called).toBeNull();
    expect(call(freshStakes(), '   ').called).toBeNull();
  });

  it('pays a bonus only when the called trick actually fired AND the dunk went down', () => {
    const s = call(spendAttempt(freshStakes()), 'eastbay');
    expect(stakesScale(s, ['eastbay'], true)).toBeCloseTo(CALL_BONUS, 9);
    expect(stakesScale(s, ['eastbay'], false)).toBeCloseTo(CALL_MISS_SCALE, 9);   // threw it, missed the flush
    expect(stakesScale(s, ['windmill'], true)).toBeCloseTo(CALL_MISS_SCALE, 9);   // landed something else
    expect(stakesScale(s, [], true)).toBeCloseTo(CALL_MISS_SCALE, 9);             // never threw it
  });

  it('leaves an uncalled dunk on the attempt scale alone', () => {
    const s = spendAttempt(freshStakes());
    expect(stakesScale(s, ['windmill'], true)).toBe(attemptScale(1));
    expect(stakesScale(s, [], false)).toBe(attemptScale(1));
  });

  // THE POINT OF THE FILE.
  it('never makes calling strictly better than not calling', () => {
    for (let used = 1; used <= ATTEMPTS_PER_DUNK; used++) {
      for (const made of [true, false]) {
        for (const landed of [['eastbay'], ['windmill'], []]) {
          const plain = { attemptsUsed: used, called: null };
          const called = { attemptsUsed: used, called: 'eastbay' };
          const a = stakesScale(plain, landed, made);
          const b = stakesScale(called, landed, made);
          if (callLanded(called, landed, made)) expect(b).toBeGreaterThan(a);   // earned it
          else expect(b).toBeLessThan(a);                                        // paid for it
        }
      }
    }
  });

  it('costs more to fail a call than landing one pays', () => {
    expect(1 - CALL_MISS_SCALE).toBeGreaterThan(CALL_BONUS - 1);
  });

  it('compounds with the attempt penalty, so a call on the last try is its own decision', () => {
    const early = stakesScale({ attemptsUsed: 1, called: 'eastbay' }, [], false);
    const late = stakesScale({ attemptsUsed: 3, called: 'eastbay' }, [], false);
    expect(late).toBeLessThan(early);
  });

  it('agrees with itself about whether the call landed', () => {
    const s = call(freshStakes(), 'eastbay');
    expect(callLanded(s, ['eastbay'], true)).toBe(true);
    expect(callLanded(s, ['eastbay'], false)).toBe(false);
    expect(callLanded(freshStakes(), ['eastbay'], true)).toBe(false);   // nothing was called
  });
});

describe('DunkStakes — the bezel', () => {
  it('counts the attempt a player is ON, not the ones they have spent', () => {
    expect(stakesLabel(freshStakes())).toBe(`1 OF ${ATTEMPTS_PER_DUNK}`);
    expect(stakesLabel(spendAttempt(freshStakes()))).toBe(`2 OF ${ATTEMPTS_PER_DUNK}`);
  });

  it('never counts past the allowance', () => {
    let s = freshStakes();
    for (let i = 0; i < 9; i++) s = spendAttempt(s);
    expect(stakesLabel(s)).toBe(`${ATTEMPTS_PER_DUNK} OF ${ATTEMPTS_PER_DUNK}`);
  });

  it('names the called trick when there is one', () => {
    expect(stakesLabel(freshStakes(), 'EASTBAY')).toContain('CALLED EASTBAY');
    expect(stakesLabel(freshStakes())).not.toContain('CALLED');
  });
});
