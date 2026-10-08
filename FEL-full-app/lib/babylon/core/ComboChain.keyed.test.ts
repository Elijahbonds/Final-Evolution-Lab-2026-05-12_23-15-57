// IMPROVE (2026-10-06, skate item 12) — lock farming: a link given a key decays by that key, whatever the chain's scope.
import { describe, expect, it } from 'vitest';
import { ComboChain, REPEAT_DECAY, REPEAT_NO_MULT } from './ComboChain';

describe('keyed links (the rail, the wall)', () => {
  it('re-locking the SAME rail decays and stops raising the multiplier; a different rail is fresh', () => {
    const c = new ComboChain(undefined, 'air');   // skate's chain: only airs decay by name
    const paid = [1, 2, 3, 4].map(() => c.add('50-50', 200, 'grind', 'rail:#3'));
    expect(c.links.map((l) => l.pts)).toEqual(REPEAT_DECAY.slice(0, 4).map((k) => Math.round(200 * k)));
    expect(c.multiplier).toBe(REPEAT_NO_MULT);   // the 4th lock on one rail no longer counts
    expect(paid[3]).toBeLessThan(paid[0] * 4);
    const before = c.multiplier;
    c.add('50-50', 200, 'grind', 'rail:#4');
    expect(c.links[c.links.length - 1].pts).toBe(200);
    expect(c.multiplier).toBe(before + 1);
  });

  it('a lock repeated past the table pays nothing and is no link', () => {
    const c = new ComboChain(undefined, 'air');
    for (let i = 0; i < REPEAT_DECAY.length - 1; i++) c.add('WALL RIDE', 150, 'grind', 'wall:the wallride');
    const n = c.links.length;
    expect(c.add('WALL RIDE', 150, 'grind', 'wall:the wallride')).toBe(0);
    expect(c.links.length).toBe(n);
  });

  it('the hold of a repeated lock pays at the lock\'s own rate', () => {
    const c = new ComboChain(undefined, 'air');
    c.add('50-50', 200, 'grind', 'rail:a');
    c.add('KICKFLIP', 100, 'air');
    c.add('50-50', 200, 'grind', 'rail:a');      // second time on rail a: 75 %
    const pot = c.pot;
    c.accrue('50-50', 40, 'grind', 'rail:a');
    expect(c.links[c.links.length - 1].pts).toBe(150 + Math.round(40 * REPEAT_DECAY[1]));
    expect(c.pot - pot).toBe(Math.round(40 * REPEAT_DECAY[1]) * c.multiplier);
  });

  it('the hold goes into the lock\'s own link even when the hold\'s name differs from a moveKey of it', () => {
    // a transfer lock used to open "TRANSFER GRIND" and then a SECOND "GRIND" link on the hold
    const c = new ComboChain(undefined, 'air');
    c.add('TRANSFER 50-50', 300, 'grind', 'rail:kink');
    c.accrue('TRANSFER 50-50', 30, 'grind', 'rail:kink');
    expect(c.links.length).toBe(1);
  });

  it('callers that pass no key behave exactly as before', () => {
    const a = new ComboChain(undefined, 'air');
    a.add('GRIND', 200, 'grind'); a.add('GRIND', 200, 'grind'); a.add('GRIND', 200, 'grind');
    expect(a.links.map((l) => l.pts)).toEqual([200, 200, 200]);   // grinds never decayed on an 'air' chain
    expect(a.links.every((l) => !('key' in l))).toBe(true);
    a.add('KICKFLIP', 100, 'air'); a.add('KICKFLIP', 100, 'air');
    expect(a.links.slice(-2).map((l) => l.pts)).toEqual([100, 75]);
    expect(a.accrue('KICKFLIP', 10, 'air')).toBe(10 * a.multiplier);
    expect(a.repeatsOf('KICKFLIP')).toBe(2);
  });
});
