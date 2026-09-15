import { describe, it, expect } from 'vitest';
import { OPPONENT_VARIANTS, variantFor } from './opponentMotion';
import { MOCAP_OPPONENT_CLIPS } from './authored/mocapOpponents';
import { scopeAllows, scopeForMode } from './clipScope';

describe('opponentMotion — an opponent plays the capture that replaces the authored clip it asked for', () => {
  it('every capture is reachable from the authored clip it replaces, and two captures for one clip belong to different sports', () => {
    const all = [...OPPONENT_VARIANTS.values()].flat();
    expect(all.sort()).toEqual(MOCAP_OPPONENT_CLIPS.map((c) => c.name).sort());
    for (const [, list] of OPPONENT_VARIANTS) expect(new Set(list.map((n) => n.split('_mc_')[0])).size).toBe(list.length);
  });

  it('swaps only when the rig owns the capture', () => {
    const owned = new Set(['bball_crossover_left', 'bball_mc_crossover_left', 'jumpshot']);
    expect(variantFor('bball_crossover_left', owned)).toBe('bball_mc_crossover_left');
    expect(variantFor('jumpshot', owned)).toBe('jumpshot');            // capture not built on this rig: authored stays
    expect(variantFor('idle_stand', owned)).toBe('idle_stand');
  });

  it('follows an alias only for a clip the rig does not own itself', () => {
    // bball_dribble_run → run (alias) and the rig has no bball_dribble_run: the capture for the ALIAS request is used
    const owned = new Set(['run', 'bball_mc_run', 'bball_mc_dribble_run']);
    expect(variantFor('bball_dribble_run', owned)).toBe('bball_mc_dribble_run');   // its own capture wins
    // a registered clip whose alias target has a capture keeps its OWN clip (idle_stand aliases to guard)
    const owned2 = new Set(['idle_stand', 'jab', 'bball_mc_jab_for_test']);
    expect(variantFor('idle_stand', owned2)).toBe('idle_stand');
  });

  it('a capture is in scope exactly where the clip it stands in for is (a hoops foe gets the captured flinch, a board rival gets no hoops captures)', () => {
    const hoops = scopeForMode('onevone'), board = scopeForMode('skateboard');
    expect(scopeAllows(hoops, 'karate_hit_react')).toBe(true);
    expect(scopeAllows(hoops, 'karate_mc_hit_react')).toBe(true);
    expect(scopeAllows(hoops, 'karate_mc_guard_step')).toBe(false);    // not borrowed → its capture is not either
    expect(scopeAllows(board, 'bball_mc_crossover_left')).toBe(false);
  });
});
