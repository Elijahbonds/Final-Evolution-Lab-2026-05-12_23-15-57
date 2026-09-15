import { describe, it, expect } from 'vitest';
import { ComboChain, REPEAT_DECAY, moveKey } from './ComboChain';

describe('ComboChain repeat decay — variety is the skill (MECHANICS PASS)', () => {
  it('the same move again pays 100/75/50/25/10 %, then nothing at all — and a fourth repeat stops raising the multiplier', () => {
    const c = new ComboChain(undefined, 'all');
    const paid = [0, 1, 2, 3, 4, 5].map(() => c.add('SLIDE', 100, 'manual'));
    expect(paid[0]).toBe(100 * 1);
    expect(paid[5]).toBe(0);                                       // ANTI-MASH: past the table it pays nothing
    expect(c.links.map((l) => l.pts)).toEqual([100, 75, 50, 25, 10]);   // ...and is not a link
    expect(c.multiplier).toBe(3);                                  // links 4..5 no longer count
  });

  it('a move repeated past the table does not keep the chain alive either', () => {
    const c = new ComboChain(undefined, 'all');
    for (let i = 0; i < 5; i++) c.add('SLIDE', 100, 'manual');
    const before = c.links.length;
    for (let i = 0; i < 20; i++) c.add('SLIDE', 100, 'manual');
    expect(c.links.length).toBe(before);
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

describe('ComboChain.accrue — a held move is ONE link (ANTI-MASH, 2026-09-15)', () => {
  it('pays every frame it is held without making the chain longer', () => {
    const c = new ComboChain(undefined, 'all');
    c.add('KICKFLIP', 100, 'air');
    const mult = c.multiplier;
    for (let i = 0; i < 60; i++) c.accrue('MANUAL', 2, 'manual');
    expect(c.links.length).toBe(2);                      // the flip and ONE manual
    expect(c.multiplier).toBe(mult + 1);
    expect(c.links[1].pts).toBeGreaterThan(100);         // it paid for every frame
  });
  it('a different move after it opens a new link', () => {
    const c = new ComboChain(undefined, 'all');
    c.accrue('GRIND', 5, 'grind'); c.accrue('GRIND', 5, 'grind'); c.accrue('MANUAL', 5, 'manual');
    expect(c.links.map((l) => l.label)).toEqual(['GRIND', 'MANUAL']);
  });
});
