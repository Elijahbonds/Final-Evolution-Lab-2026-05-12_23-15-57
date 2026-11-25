import { describe, expect, it } from 'vitest';
import { CASTERS, INK_FAR_M, castersFor, inkAt } from './bodyLod';

describe('bodyLod: who keeps the sun shadow', () => {
  it('the player and the 3 nearest the ball cast; the rest do not', () => {
    const dist = [9, 1, 2, 3, 4, 5, 6, 7];
    const human = [true, false, false, false, false, false, false, false];
    expect(castersFor(dist, dist.map(() => false), human)).toEqual([true, true, true, true, false, false, false, false]);
    expect(CASTERS).toBe(3);
  });
  it('a caster keeps it one rank further back (no flicker at the edge)', () => {
    const dist = [9, 1, 2, 3, 4];
    const human = [true, false, false, false, false];
    // body 4 was casting and is now 4th nearest: it keeps it; body 3 (3rd) joins
    expect(castersFor(dist, [true, true, true, false, true], human)).toEqual([true, true, true, true, true]);
    // a body not casting at 4th does not join
    expect(castersFor(dist, [true, true, true, true, false], human)).toEqual([true, true, true, true, false]);
  });
});

describe('bodyLod: the ink of a far body', () => {
  it('drops past INK_FAR_M and comes back only a metre inside it', () => {
    expect(inkAt(INK_FAR_M - 0.1, true)).toBe(true);
    expect(inkAt(INK_FAR_M + 0.1, true)).toBe(false);
    expect(inkAt(INK_FAR_M - 0.5, false)).toBe(false);
    expect(inkAt(INK_FAR_M - 1.1, false)).toBe(true);
  });
});
