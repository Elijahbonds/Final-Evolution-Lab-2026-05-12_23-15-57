// TN-3 (ALL-MODES-TO-75 §1, TENNIS-TIEBREAK-FOLD 2026-10-22): the tiebreak's rules — first to 7 points, win by 2.
import { describe, expect, it } from 'vitest';
import { TiebreakScore, TIEBREAK_TARGET, VolleyScore } from './RallyCore';

/** Play points in order (0 = hero, 1 = foe) and return every award's answer. */
function play(s: TiebreakScore, sides: (0 | 1)[]): string[] { return sides.map((side) => s.award(side)); }
/** Reach a score of `a`-`b` without passing through an end on the way (alternating up to the lower total first). */
function reach(a: number, b: number): { s: TiebreakScore; last: string } {
  const s = new TiebreakScore();
  const seq: (0 | 1)[] = [];
  const lo = Math.min(a, b);
  for (let i = 0; i < lo; i++) seq.push(0, 1);
  for (let i = lo; i < a; i++) seq.push(0);
  for (let i = lo; i < b; i++) seq.push(1);
  const out = play(s, seq);
  return { s, last: out[out.length - 1] };
}

describe('TN-3 TiebreakScore: first to 7, win by 2', () => {
  it('the target is 7', () => {
    expect(TIEBREAK_TARGET).toBe(7);
    expect(new TiebreakScore().target).toBe(7);
  });

  it('7-5 ends the tiebreak', () => {
    const { s, last } = reach(7, 5);
    expect(s.points).toEqual([7, 5]);
    expect(last).toBe('set');
  });

  it('7-6 does not', () => {
    const { s, last } = reach(7, 6);
    expect(s.points).toEqual([7, 6]);
    expect(last).toBe('point');
  });

  it('8-6 does', () => {
    const { s, last } = reach(8, 6);
    expect(s.points).toEqual([8, 6]);
    expect(last).toBe('set');
  });

  it('no point before 7 ends it, and the foe wins it the same way (5-7)', () => {
    const s = new TiebreakScore();
    expect(play(s, [0, 0, 0, 0, 0, 0])).toEqual(Array(6).fill('point'));
    const { s: f, last } = reach(5, 7);
    expect(f.points).toEqual([5, 7]);
    expect(last).toBe('set');
    void s;
  });

  it('there is no cap: a long tiebreak still needs two clear (12-12 → 13-12 plays on → 14-12 ends)', () => {
    const { s, last } = reach(12, 12);
    expect(last).toBe('point');
    expect(s.award(0)).toBe('point');
    expect(s.award(0)).toBe('set');
    expect(s.points).toEqual([14, 12]);
  });

  it('it is a VolleyScore, so NetSportMode\'s points reads serve it', () => {
    expect(new TiebreakScore()).toBeInstanceOf(VolleyScore);
  });

  it('the call reads the asking side first', () => {
    const { s } = reach(5, 3);
    expect(s.callFor(0)).toBe('5-3');
    expect(s.callFor(1)).toBe('3-5');
  });

  it('the serve: the first server serves point one, then it changes every two points', () => {
    const s = new TiebreakScore();
    const servers: number[] = [];
    for (let i = 0; i < 8; i++) { servers.push(s.serverFor(0)); s.award(i % 2 === 0 ? 0 : 1); }
    expect(servers).toEqual([0, 1, 1, 0, 0, 1, 1, 0]);
    expect(new TiebreakScore().serverFor(1)).toBe(1);
  });
});
