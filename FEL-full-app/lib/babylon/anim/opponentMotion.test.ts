import { describe, it, expect } from 'vitest';
import { OPPONENT_VARIANTS, variantFor } from './opponentMotion';
import { MOCAP_OPPONENT_CLIPS } from './authored/mocapOpponents';
import { scopeAllows, scopeForMode } from './clipScope';

describe('opponentMotion — an opponent plays the capture that replaces the authored clip it asked for', () => {
  it('every capture replaces a distinct authored clip', () => {
    expect(OPPONENT_VARIANTS.size).toBe(MOCAP_OPPONENT_CLIPS.length);
  });

  it('swaps only when the rig owns the capture', () => {
    const owned = new Set(['bball_crossover_left', 'bball_mc_crossover_left', 'jumpshot']);
    expect(variantFor('bball_crossover_left', owned)).toBe('bball_mc_crossover_left');
    expect(variantFor('jumpshot', owned)).toBe('jumpshot');            // capture not built on this rig: authored stays
    expect(variantFor('idle_stand', owned)).toBe('idle_stand');
  });

  it('a capture is in scope exactly where the clip it stands in for is (a hoops foe gets the captured flinch, a board rival gets no hoops captures)', () => {
    const hoops = scopeForMode('onevone'), board = scopeForMode('skateboard');
    expect(scopeAllows(hoops, 'karate_hit_react')).toBe(true);
    expect(scopeAllows(hoops, 'karate_mc_hit_react')).toBe(true);
    expect(scopeAllows(hoops, 'karate_mc_guard_step')).toBe(false);    // not borrowed → its capture is not either
    expect(scopeAllows(board, 'bball_mc_crossover_left')).toBe(false);
  });
});
