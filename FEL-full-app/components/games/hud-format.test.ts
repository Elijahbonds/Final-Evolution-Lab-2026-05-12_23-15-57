import { describe, expect, it } from 'vitest';
import { hnode, hnum } from './hud-format';

/**
 * THE FIRST TEST IN components/, which held 239 files and 46,000 lines with none.
 *
 * This one is the right place to start: every Babylon bezel in the app coerces its HUD values through hnode/hnum —
 * nineteen components import it — and the contract it guards is the one that widened at M47, when a judged contest
 * started pushing booleans, cleared fields (null) and three-judge scorecard arrays through a channel that used to
 * carry only scalars. The failure mode is React throwing on an object, or a meter reading a boolean as a number.
 */
describe('HUD value coercion', () => {
  it('passes scalars through untouched — including the ones that look falsy', () => {
    expect(hnode('SLAM')).toBe('SLAM');
    expect(hnode(42)).toBe(42);
    expect(hnode(0)).toBe(0);          // a zero score is a score, not a missing field
    expect(hnode('')).toBe('');
  });

  it('refuses to hand React something it cannot render', () => {
    expect(hnode(true)).toBe('');
    expect(hnode(false)).toBe('');
    expect(hnode(null as never)).toBe('');
    expect(hnode(undefined)).toBe('');
    expect(hnode([9, 8, 9] as never)).toBe('');       // the three-judge scorecard
    expect(hnode({ a: 1 } as never)).toBe('');
  });

  it('takes the caller\'s fallback when it has to fall back', () => {
    expect(hnode(true, '—')).toBe('—');
    expect(hnode(null as never, 0)).toBe(0);
    expect(hnode(undefined, 'READY')).toBe('READY');
  });

  it('hnum reads only real numbers, so a meter never drives off a boolean', () => {
    expect(hnum(7)).toBe(7);
    expect(hnum(0)).toBe(0);
    expect(hnum('7' as never)).toBe(0);               // a numeric STRING is not a number here
    expect(hnum(true as never)).toBe(0);
    expect(hnum(undefined)).toBe(0);
    expect(hnum(undefined, 50)).toBe(50);
  });

  it('a NaN that reaches the HUD stays NaN rather than being laundered into a number', () => {
    // Worth pinning: hnum's job is type coercion, not validation. A NaN here means the MODE produced one, and
    // silently turning it into 0 would hide that at the only place it is visible.
    expect(Number.isNaN(hnum(Number.NaN))).toBe(true);
  });
});
