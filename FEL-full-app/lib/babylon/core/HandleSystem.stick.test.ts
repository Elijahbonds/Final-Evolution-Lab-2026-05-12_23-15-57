// THE STICK'S MOVES GO THROUGH THE GATE (Phase 4 of the hoops upgrade pass).
//
// Phase 3 gave the right stick 2K's map; four of its moves ran outside doMove → resolveHandleMove, so they were
// neither gated on the handle nor links in a chain: the step-back, the snatchback (gated, but never a link), the
// spin off a rotation, and the size-up cycle. These pin what Phase 4 routes, in the vocabulary's own terms.
import { describe, expect, it } from 'vitest';
import {
  BASELINE_HANDLE, CHAIN_IDLE, MOVE_HANDLE, STICK_ONLY, chainTier, hasMove, moveClip, moveDanger, pushChain, resolveHandleMove,
} from './HandleSystem';
import { sizeUpClipFor } from './StickHandle';

const closing = { present: true, closing: true, set: false, within: true };

describe("the step-back is everyone's", () => {
  it('rating 0: a baseline scan owns it, like the crossover and the hesi', () => {
    expect(MOVE_HANDLE.stepback).toBe(0);
    expect(hasMove('stepback', 0)).toBe(true);
    expect(hasMove('stepback', BASELINE_HANDLE)).toBe(true);
  });
  it('it has a body', () => expect(moveClip('stepback', 'left')).toBe('bball_stepback_gather'));
  it('it is stick-only: no read ever names it, so the "no move is dead" rule exempts it', () => expect(STICK_ONLY.has('stepback')).toBe(true));
  it('it beats nobody on its own — baseline danger', () => expect(moveDanger('stepback')).toBe(moveDanger('crossover')));
  it('it is a LINK: step-back into a crossover is a two-move chain', () => {
    const c1 = pushChain('stepback', { ...CHAIN_IDLE }, BASELINE_HANDLE);
    const c2 = pushChain('crossover', c1, BASELINE_HANDLE);
    expect(c2.length).toBe(2);
    expect(chainTier(c2.length)).toBe('combo');
  });
});

describe('the snatchback links and can break ankles at depth', () => {
  it('at a handle that owns it, thrown third in a chain against a closing man, it is a highlight with real odds', () => {
    const chain2 = pushChain('crossover', pushChain('hesi', { ...CHAIN_IDLE }, 90), 90);
    const o = resolveHandleMove('snatch_back', chain2, 90, closing, () => 0.99);
    expect(o.owned).toBe(true);
    expect(o.chain.length).toBe(3);
    expect(o.tier).toBe('highlight');
    expect(o.odds).toBeGreaterThan(0);
  });
  it('a baseline handle does not own it, and the chain is untouched', () => {
    const chain1 = pushChain('crossover', { ...CHAIN_IDLE }, BASELINE_HANDLE);
    const o = resolveHandleMove('snatch_back', chain1, BASELINE_HANDLE, closing);
    expect(o.owned).toBe(false);
    expect(o.chain).toBe(chain1);
  });
});

describe('a size-up shows only the cycle moves you OWN', () => {
  // The cycle is yoyo (52) / in-and-out (40) / between-the-legs (45). A baseline handle (50) never gets the yoyo:
  // the handle LOOKS different before it does anything different, which is the Iverson/Steezo read.
  it('at baseline the yoyo never appears, however far round the cycle you go', () => {
    const seen = new Set<string>();
    for (let n = 0; n < 12; n++) seen.add(sizeUpClipFor(n, 'right', BASELINE_HANDLE));
    expect(seen.has('bball_yoyo')).toBe(false);
    expect(seen.size).toBeGreaterThan(1);   // it still cycles through what you do own
  });
  it('at a full handle the whole cycle plays', () => {
    const seen = new Set<string>();
    for (let n = 0; n < 12; n++) seen.add(sizeUpClipFor(n, 'right', 100));
    expect(seen).toEqual(new Set(['bball_yoyo', 'bball_in_and_out_right', 'bball_between_legs_right']));
  });
  it('a handle that owns nothing in the cycle still gets the in-and-out (the cheapest), never nothing', () => {
    expect(sizeUpClipFor(0, 'left', 0)).toBe('bball_in_and_out_left');
  });
});
