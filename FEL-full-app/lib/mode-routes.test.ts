import { describe, expect, it } from 'vitest';
import { MODE_INFO, VENUES } from './game-data';
import { modeKeyForHref } from './mode-routes';

describe('mode route lookups', () => {
  it('maps every play route in MODE_INFO back to the session/catalogue key', () => {
    const misses = Object.entries(MODE_INFO)
      .filter(([, info]) => info.href.startsWith('/play/'))
      .filter(([key, info]) => modeKeyForHref(info.href) !== key)
      .map(([key, info]) => `${info.href} -> ${modeKeyForHref(info.href) ?? 'null'} (expected ${key})`);

    expect(misses).toEqual([]);
  });

  it('does not turn non-mode destinations into mastery keys', () => {
    expect(modeKeyForHref('/shop')).toBeNull();
    expect(modeKeyForHref('/market')).toBe('marketplace');
    expect(modeKeyForHref('/play/carnival?agent=1')).toBe('carnival');
  });

  it('keeps playable venue badges on the keys sessions actually save', () => {
    const expected: Record<string, string | null> = {
      courtcarnival: 'carnival',
      octagon: 'mixedcombat',
      dunkduel: 'dunkduel',
      lumaveniceshop: null,
    };

    for (const venue of VENUES.filter((v) => v.playable)) {
      if (!(venue.key in expected)) continue;
      expect(modeKeyForHref(venue.href), venue.key).toBe(expected[venue.key]);
    }
  });
});
