// Play-test in a production build (STUDIO-EASY, coordinator decision 4): the Studio hands its venue over exactly as a share link's
// landing does, and the mode's own shipped page reads it through the shipped runtime — practice only, no dev route, no cast.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHARE_HANDOFF_PREFIX, handOff, modeRoute, playtestKey, readShareHandoff } from './shareHandoff';
import { shareRoute } from './share';
import { resetStudioVenueCache, studioPickFor } from './runtime';
import { exportVenue } from './exportVenue';
import { PLAYTEST_TARGETS } from './targets';
import { everyKindVenue } from '@/tests/helpers/nexusStudio';

afterEach(() => { vi.unstubAllGlobals(); resetStudioVenueCache(); });

describe('the production Play-test', () => {
  it('opens the game’s own page for every play-test target (the share link’s table, one copy)', () => {
    for (const key of Object.keys(PLAYTEST_TARGETS)) {
      const r = modeRoute(key, 'ssl_abcdefghijklmnop');
      expect(r, key).toMatch(/^\/play\/[a-z]+\?/);
      expect(r, key).not.toContain('/dev/');
      expect(r).toBe(shareRoute(key, 'ssl_abcdefghijklmnop'));
    }
    expect(modeRoute('karate', 'ssl_abcdefghijklmnop')).toBeNull();
  });
  it('a fresh key in the share id’s shape each press', () => {
    const a = playtestKey(), b = playtestKey();
    expect(a).toMatch(/^ssl_[A-Za-z0-9]{16}$/);
    expect(a).not.toBe(b);
  });
  it('the hand-off is read back by the shipped runtime in a production build: practice, no cast', () => {
    const map = new Map<string, string>();
    const ss = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } };
    const key = playtestKey();
    const exp = exportVenue(everyKindVenue(), null, []);
    expect(handOff(ss, key, exp)).toBe(true);
    expect(map.has(SHARE_HANDOFF_PREFIX + key)).toBe(true);
    expect(readShareHandoff(key, ss)).not.toBeNull();
    const route = modeRoute('tiebreak', key)!;
    vi.stubGlobal('window', { location: { search: route.slice(route.indexOf('?')) }, sessionStorage: ss, localStorage: { getItem: () => null } });
    const pick = studioPickFor('tiebreak', { env: 'production' });
    expect(pick).toMatchObject({ source: 'shared', competitive: false });
    expect(pick!.exp).not.toHaveProperty('cast');
    expect(pick!.exp.mood).toBe('nightGame');
  });
  it('refuses quietly when the browser will not keep it (private mode, quota), or the key is not one', () => {
    const exp = exportVenue(everyKindVenue(), null, []);
    expect(handOff(null, playtestKey(), exp)).toBe(false);
    expect(handOff({ setItem: () => { throw new Error('QuotaExceededError'); } }, playtestKey(), exp)).toBe(false);
    expect(handOff({ setItem: () => {} }, 'not-a-key', exp)).toBe(false);
  });
});
