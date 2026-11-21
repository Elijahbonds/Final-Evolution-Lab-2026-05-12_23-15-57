// lane/online-play: "winners stay on" (owner default 2026-11-17) — the court's line.
import { describe, it, expect } from 'vitest';
import { EMPTY_RUN, afterGame, interleave, nextGame, sync } from './run';

describe('winners stay on', () => {
  it('1v1 with three: the first two play, the winner stays, the next one comes on, the loser goes to the back', () => {
    let r = sync(EMPTY_RUN, ['a', 'b', 'c']);
    let g = nextGame(r, 2);
    expect([g.home, g.away, g.sitting]).toEqual([['a'], ['b'], ['c']]);
    r = afterGame(r, ['a'], ['b']);
    g = nextGame(r, 2);
    expect([g.home, g.away, g.sitting]).toEqual([['a'], ['c'], ['b']]);
    r = afterGame(r, ['a'], ['c']);
    expect(r.streak).toBe(2);
    r = afterGame(r, ['b'], ['a']);   // b beat the holder
    expect(r.holders).toEqual(['b']); expect(r.streak).toBe(1);
    expect(nextGame(r, 2).away).toEqual(['c']);
  });
  it('1v1 with two: a rematch every time', () => {
    let r = sync(EMPTY_RUN, ['a', 'b']);
    r = afterGame(r, ['b'], ['a']);
    expect(nextGame(r, 2).order).toEqual(['b', 'a']);
  });
  it('3v3 seats alternate teams, so the order interleaves the two teams', () => {
    const r = sync(EMPTY_RUN, ['a', 'b', 'c', 'd', 'e', 'f']);
    expect(nextGame(r, 6).order).toEqual(['a', 'd', 'b', 'e', 'c', 'f']);
    expect(interleave(['x', 'y'], ['z'])).toEqual(['x', 'z', 'y']);
  });
  it('a party of four in a 3v3 plays two a side (owner: "a party of 4 plays 2 + 2 bots a side")', () => {
    const g = nextGame(sync(EMPTY_RUN, ['a', 'b', 'c', 'd']), 6);
    expect(g.home).toHaveLength(2); expect(g.away).toHaveLength(2);
  });
  it('people leaving and arriving: the line keeps who is here, newcomers at the back', () => {
    let r = afterGame(sync(EMPTY_RUN, ['a', 'b', 'c']), ['a'], ['b']);
    r = sync(r, ['a', 'b', 'd']);   // c left, d arrived
    expect(r.line).toEqual(['b', 'd']);
    r = sync(r, ['b', 'd']);        // the holder left
    expect(r.holders).toEqual([]); expect(r.streak).toBe(0);
  });
  it('MUTATION: a result naming nobody changes nothing', () => {
    const r = sync(EMPTY_RUN, ['a', 'b']);
    expect(afterGame(r, [], ['a', 'b'])).toBe(r);
  });
});
