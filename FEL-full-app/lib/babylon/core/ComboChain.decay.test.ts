import { describe, it, expect } from 'vitest';
import { ComboChain, REPEAT_DECAY, moveKey } from './ComboChain';

describe('ComboChain repeat decay — variety is the skill (MECHANICS PASS)', () => {
  it('the same move again pays 100/75/50/25/10 %, and a fourth repeat stops raising the multiplier', () => {
    const c = new ComboChain(undefined, 'all');
    const paid = [0, 1, 2, 3, 4, 5].map(() => c.add('SLIDE', 100, 'manual'));
    expect(paid[0]).toBe(100 * 1);
    expect(c.links.map((l) => l.pts)).toEqual([100, 75, 50, 25, 10, 10]);
    expect(c.multiplier).toBe(3);                                  // links 4..6 no longer count
  });

  it('spamming one move banks far less than a varied line of the same length', () => {
    const spam = new ComboChain(undefined, 'all'), line = new ComboChain(undefined, 'all');
    for (let i = 0; i < 6; i++) spam.add('SLIDE', 40, 'manual');
    for (const m of ['SLIDE', 'VAULT', 'WALL RUN', 'WALL KICK', 'CAT LEAP', 'FRONT FLIP']) line.add(m, 40, 'manual');
    expect(line.bank()).toBeGreaterThan(spam.bank() * 2);
  });

  it('where a trick was thrown from or how it landed does not make it a new move; the default chain never decays', () => {
    expect(moveKey('BACK FLIP OFF WALLKICK')).toBe('BACK FLIP');
    expect(moveKey('SKETCHY KICKFLIP · SKETCHY')).toBe('KICKFLIP');
    const plain = new ComboChain();
    plain.add('GRIND', 50, 'grind'); plain.add('GRIND', 50, 'grind');
    expect(plain.links.map((l) => l.pts)).toEqual([50, 50]);
    const air = new ComboChain(undefined, 'air');
    air.add('GRIND', 50, 'grind'); air.add('GRIND', 50, 'grind'); air.add('KICKFLIP', 80, 'air'); air.add('KICKFLIP', 80, 'air');
    expect(air.links.map((l) => l.pts)).toEqual([50, 50, 80, Math.round(80 * REPEAT_DECAY[1])]);
  });
});
