// GAMEPLAY-CLEAN P2 #6 — the football carry's stride paces to the carrier (footballTree, FOOTBALL_CARRY_PACE_MPS / _RATE_MAX).
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../feel-panel/feel', () => ({ feel: (_id: string, def: number) => def }));

import { FOOTBALL_CARRY_PACE_MPS, FOOTBALL_CARRY_RATE_MAX, FootballAnimTree, type FootballAnimInput } from './footballTree';
import type { CharacterAnimator } from './CharacterAnimator';

const carry = (speedMps?: number): FootballAnimInput => ({
  presnap: false, snapped: true, isQB: false, droppingBack: false, throwing: false, runningRoute: false, carrying: true,
  move: null, catching: 'none', beingTackled: false, blocking: false, rushing: false, speedMps,
});

function stub() {
  const plays: string[] = [];
  const rates: [string, number][] = [];
  const animator = {
    play: (name: string) => { plays.push(name); return null; },
    setPlaybackScale: (name: string, s: number) => { rates.push([name, s]); },
  } as unknown as CharacterAnimator;
  return { animator, plays, rates };
}

describe('FootballAnimTree — the carry loop paces to the carrier', () => {
  it('at top speed the loop climbs to the rate ceiling (the clip alone would need 3.6×)', () => {
    const s = stub(); const tree = new FootballAnimTree(s.animator);
    for (let i = 0; i < 60; i++) tree.update(carry(7.7));
    expect(s.plays).toEqual(['football_carry_run']);   // one play: the pacing never re-plays the loop
    const last = s.rates[s.rates.length - 1];
    expect(last[0]).toBe('football_carry_run');
    expect(last[1]).toBeCloseTo(FOOTBALL_CARRY_RATE_MAX, 2);
  });

  it('at the clip\'s own pace it plays at 1×; no speed given, nothing is paced', () => {
    const s = stub(); const tree = new FootballAnimTree(s.animator);
    for (let i = 0; i < 60; i++) tree.update(carry(FOOTBALL_CARRY_PACE_MPS));
    expect(s.rates[s.rates.length - 1][1]).toBeCloseTo(1, 2);
    const t = stub(); const tree2 = new FootballAnimTree(t.animator);
    for (let i = 0; i < 10; i++) tree2.update(carry(undefined));
    expect(t.rates).toEqual([]);
  });

  it('a move (the spin) is choreography: not paced', () => {
    const s = stub(); const tree = new FootballAnimTree(s.animator);
    tree.update(carry(7.7));
    const n = s.rates.length;
    tree.update({ ...carry(7.7), move: 'spin' });
    expect(s.rates.length).toBe(n);
  });
});
