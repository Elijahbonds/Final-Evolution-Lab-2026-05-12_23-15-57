// FALLING BEHIND MUST NEVER BE STRICTLY BETTER THAN LEADING (2026-09-14).
//
// This is RivalNerve's invariant, carried into the module that serves every other opponent in the game. An
// AI that presses harder when trailing and pays nothing for it is an AI that is REWARDED for being beaten:
// the player who builds a lead is punished for building it, and the contest inverts. The sweep below walks
// the entire margin x lateness grid and asserts the pair never comes apart, and that the error rate always
// swings hardest — so whatever a consumer attaches these to, pressing is never free.

import { describe, it, expect } from 'vitest';
import {
  nerve, standingOf, NEUTRAL,
  CALM_MARGIN, MAX_AGGRESSION_SWING, MAX_MISTAKE_SWING,
} from './Nerve';

const GRID: { margin01: number; lateness01: number }[] = [];
for (let m = -1; m <= 1.0001; m += 0.05) {
  for (let l = 0; l <= 1.0001; l += 0.1) GRID.push({ margin01: +m.toFixed(2), lateness01: +l.toFixed(2) });
}

describe('Nerve — the invariant', () => {
  // THE POINT OF THE FILE.
  it('never lets aggression and the error rate come apart, anywhere on the grid', () => {
    for (const s of GRID) {
      const n = nerve(s);
      const aggUp = n.aggression > 1, missUp = n.mistake > 1;
      const aggDn = n.aggression < 1, missDn = n.mistake < 1;
      expect(aggUp).toBe(missUp);
      expect(aggDn).toBe(missDn);
    }
  });

  // The module used to also return `edge`, a multiplier for a skill scalar. Wiring three real opponents
  // showed every one of them exposes skill as ONE number bundling pressure and accuracy, so nudging it
  // up for a trailing opponent was a straight buff. There is no scalar to move, and this test is the
  // guard against re-adding one: whatever a consumer attaches these to, the error rate must swing hardest.
  it('always swings the error rate hardest, so pressing is never free', () => {
    for (const s of GRID) {
      const n = nerve(s);
      if (n === NEUTRAL) continue;
      expect(Math.abs(n.mistake - 1)).toBeGreaterThanOrEqual(Math.abs(n.aggression - 1) - 1e-9);
    }
  });

  it('stays inside the swings it advertises', () => {
    for (const s of GRID) {
      const n = nerve(s);
      expect(Math.abs(n.aggression - 1)).toBeLessThanOrEqual(MAX_AGGRESSION_SWING + 1e-9);
      expect(Math.abs(n.mistake - 1)).toBeLessThanOrEqual(MAX_MISTAKE_SWING + 1e-9);
    }
  });

  it('never returns a multiplier that would switch a number off or invert it', () => {
    for (const s of GRID) {
      const n = nerve(s);
      expect(n.aggression).toBeGreaterThan(0);
      expect(n.mistake).toBeGreaterThan(0);
    }
  });
});

describe('Nerve — the situation', () => {
  it('does nothing in a close game, at any point in it', () => {
    for (const l of [0, 0.5, 1]) {
      expect(nerve({ margin01: 0, lateness01: l })).toEqual(NEUTRAL);
      expect(nerve({ margin01: CALM_MARGIN * 0.9, lateness01: l })).toEqual(NEUTRAL);
      expect(nerve({ margin01: -CALM_MARGIN * 0.9, lateness01: l })).toEqual(NEUTRAL);
    }
  });

  it('presses when behind and protects when ahead', () => {
    const behind = nerve({ margin01: -0.8, lateness01: 1 });
    const ahead = nerve({ margin01: 0.8, lateness01: 1 });
    expect(behind.aggression).toBeGreaterThan(1);
    expect(behind.mistake).toBeGreaterThan(1);
    expect(ahead.aggression).toBeLessThan(1);
    expect(ahead.mistake).toBeLessThan(1);
  });

  // THE REASON A COMEBACK FEELS LIKE ONE AND NOT LIKE A DIFFICULTY SETTING.
  it('cares more about the same margin late than early', () => {
    const early = nerve({ margin01: -0.7, lateness01: 0 });
    const late = nerve({ margin01: -0.7, lateness01: 1 });
    expect(late.aggression).toBeGreaterThan(early.aggression);
    expect(late.mistake).toBeGreaterThan(early.mistake);
  });

  it('is monotonic in the margin — deeper trouble never presses less', () => {
    let prev = 0;
    for (let m = -CALM_MARGIN; m >= -1; m -= 0.05) {
      const a = nerve({ margin01: m, lateness01: 1 }).aggression;
      expect(a).toBeGreaterThanOrEqual(prev === 0 ? 0 : prev);
      prev = a;
    }
  });

  it('stays quiet about it until the situation is real', () => {
    expect(nerve({ margin01: -0.2, lateness01: 0 }).label).toBeNull();
    expect(nerve({ margin01: -0.9, lateness01: 1 }).label).toBe('PRESSING');
    expect(nerve({ margin01: 0.9, lateness01: 1 }).label).toBe('PROTECTING THE LEAD');
  });

  it('refuses garbage rather than propagating it', () => {
    expect(nerve({ margin01: NaN, lateness01: 1 })).toEqual(NEUTRAL);
    expect(nerve({ margin01: -99, lateness01: 99 }).aggression).toBeLessThanOrEqual(1 + MAX_AGGRESSION_SWING);
  });
});

describe('Nerve — standingOf', () => {
  it('normalises against what it takes to win, so one module serves a fight and a set', () => {
    // two rounds to win a fight: one round down is half the contest
    expect(standingOf(0, 1, 2, 1).margin01).toBeCloseTo(-0.5, 9);
    // 25 points to win a volleyball set: one point down is almost nothing
    expect(standingOf(10, 11, 25, 1).margin01).toBeCloseTo(-0.04, 9);
  });

  it('clamps a runaway scoreline instead of returning a margin past 1', () => {
    expect(standingOf(50, 0, 5, 1).margin01).toBe(1);
    expect(standingOf(0, 50, 5, 1).margin01).toBe(-1);
  });

  it('survives a zero target rather than dividing by it', () => {
    expect(Number.isFinite(standingOf(3, 1, 0, 1).margin01)).toBe(true);
  });
});
