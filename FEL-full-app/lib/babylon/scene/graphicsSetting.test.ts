import { afterEach, describe, expect, it, vi } from 'vitest';
import { GRAPHICS_KEY, isLegacyLook, parseGraphicsChoice, readGraphicsChoice, readTierParam, writeGraphicsChoice } from './graphicsSetting';

function page(search: string, store: Map<string, string> | 'blocked') {
  vi.stubGlobal('window', {
    location: { search },
    localStorage: store === 'blocked'
      ? { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } }
      : { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } },
  });
}
afterEach(() => vi.unstubAllGlobals());

describe('the Graphics setting', () => {
  it('only the three choices parse', () => {
    expect(parseGraphicsChoice('quality')).toBe('quality');
    expect(parseGraphicsChoice('ultra')).toBeNull();
    expect(parseGraphicsChoice(3)).toBeNull();
  });
  it('round-trips through storage, and junk or a blocked store reads as auto', () => {
    const store = new Map<string, string>();
    page('', store);
    expect(readGraphicsChoice()).toBe('auto');
    writeGraphicsChoice('performance');
    expect(store.get(GRAPHICS_KEY)).toBe('performance');
    expect(readGraphicsChoice()).toBe('performance');
    store.set(GRAPHICS_KEY, 'ultra');
    expect(readGraphicsChoice()).toBe('auto');
    page('', 'blocked');
    expect(readGraphicsChoice()).toBe('auto');
    expect(() => writeGraphicsChoice('quality')).not.toThrow();
  });
  it('?tier= and ?look=legacy are read from the URL only', () => {
    page('?tier=high&look=legacy', new Map());
    expect(readTierParam()).toBe('high');
    expect(isLegacyLook()).toBe(true);
    page('', new Map([['look', 'legacy']]));
    expect(readTierParam()).toBeNull();
    expect(isLegacyLook()).toBe(false);
  });
});
