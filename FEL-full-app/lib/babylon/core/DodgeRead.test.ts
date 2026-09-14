// A GRADED DODGE REWARD IS A DODGE REWARD YOU MASH FOR (2026-09-14).
//
// The tempting design is a reward that tapers with distance from the window — it feels fairer. It is
// worse: any non-zero payout for an early press means holding dodge on cooldown still earns something, so
// the optimal play remains "always be dodging" and the read never happens. The window is binary, and the
// test below sweeps the entire timeline asserting that everything outside it pays exactly nothing.

import { describe, it, expect } from 'vitest';
import {
  perfectDodge, dodgeReward, tickCounter, counterMult, NO_REWARD,
  PERFECT_WINDOW_SEC, COUNTER_SEC, COUNTER_DAMAGE_MULT,
} from './DodgeRead';

describe('DodgeRead — the window', () => {
  it('pays inside the window', () => {
    expect(perfectDodge(0)).toBe(true);
    expect(perfectDodge(PERFECT_WINDOW_SEC / 2)).toBe(true);
    expect(perfectDodge(PERFECT_WINDOW_SEC)).toBe(true);
  });

  // THE POINT OF THE FILE.
  it('pays nothing at all for an early press, at every distance', () => {
    for (let t = PERFECT_WINDOW_SEC + 0.01; t < 3; t += 0.01) {
      expect(perfectDodge(t)).toBe(false);
      expect(dodgeReward(t)).toEqual(NO_REWARD);
    }
  });

  it('pays nothing for a late one either — the strike already landed', () => {
    for (const t of [-0.01, -0.2, -5]) {
      expect(perfectDodge(t)).toBe(false);
      expect(dodgeReward(t)).toEqual(NO_REWARD);
    }
  });

  // "Well timed" can only mean you moved because you saw THAT attack coming.
  it('pays nothing when nothing was being thrown at you', () => {
    expect(perfectDodge(null)).toBe(false);
    expect(dodgeReward(null)).toEqual(NO_REWARD);
  });

  it('refuses garbage rather than rewarding it', () => {
    expect(perfectDodge(NaN)).toBe(false);
    expect(perfectDodge(Infinity)).toBe(false);
    expect(dodgeReward(NaN)).toEqual(NO_REWARD);
  });

  it('is binary — there are exactly two payouts and nothing between them', () => {
    const payouts = new Set<string>();
    for (let t = -1; t < 2; t += 0.005) payouts.add(JSON.stringify(dodgeReward(t)));
    expect(payouts.size).toBe(2);
  });
});

describe('DodgeRead — the reward', () => {
  it('opens a counter window and a slow-mo beat, and names itself once', () => {
    const r = dodgeReward(0.1);
    expect(r.perfect).toBe(true);
    expect(r.counterSec).toBe(COUNTER_SEC);
    expect(r.slowMoSec).toBeGreaterThan(0);
    expect(r.label).toBe('PERFECT DODGE');
  });

  it('is an opening, not an execute', () => {
    expect(COUNTER_DAMAGE_MULT).toBeGreaterThan(1);
    expect(COUNTER_DAMAGE_MULT).toBeLessThan(2.5);
  });

  it('keeps the slow-mo a taste rather than the scoped parry beat the duel owns', () => {
    expect(dodgeReward(0).slowMoSec).toBeLessThan(0.3);
  });
});

describe('DodgeRead — the counter window', () => {
  it('runs down in seconds, so it lasts the same on every monitor', () => {
    const at = (fps: number) => {
      let c = COUNTER_SEC;
      for (let i = 0; i < Math.round(0.4 * fps); i++) c = tickCounter(c, 1 / fps);
      return c;
    };
    expect(Math.abs(at(30) - at(60))).toBeLessThan(0.02);
    expect(Math.abs(at(60) - at(144))).toBeLessThan(0.02);
  });

  it('closes at zero and never goes negative', () => {
    let c = COUNTER_SEC;
    for (let i = 0; i < 300; i++) c = tickCounter(c, 1 / 60);
    expect(c).toBe(0);
  });

  it('a zero-length frame does not consume the window', () => {
    expect(tickCounter(COUNTER_SEC, 0)).toBe(COUNTER_SEC);
    expect(tickCounter(COUNTER_SEC, NaN)).toBe(COUNTER_SEC);
  });

  it('pays the multiplier only while it is open', () => {
    expect(counterMult(0.3)).toBe(COUNTER_DAMAGE_MULT);
    expect(counterMult(0)).toBe(1);
    expect(counterMult(-1)).toBe(1);
  });
});
