import { describe, expect, it } from 'vitest';
import { TABS, chromeHiddenFor, tabForPath } from './tab-bar';

/**
 * The tab bar's only piece of logic worth a test: which tab is lit. Getting it wrong is not a crash, it is the
 * quiet kind of wrong where a player on the coach screen sees "Play" highlighted and stops trusting the nav.
 */
describe('which tab owns a path', () => {
  it('lights the obvious ones', () => {
    expect(tabForPath('/play')?.id).toBe('play');
    expect(tabForPath('/modes')?.id).toBe('play');
    expect(tabForPath('/train')?.id).toBe('train');
    expect(tabForPath('/coach')?.id).toBe('train');
    expect(tabForPath('/kitchens')?.id).toBe('train');
    expect(tabForPath('/profile')?.id).toBe('profile');
    expect(tabForPath('/wallet')?.id).toBe('profile');
  });

  it('follows a path into its depths', () => {
    expect(tabForPath('/coach/join/abc123')?.id).toBe('train');
    expect(tabForPath('/card/elijah')?.id).toBe('profile');
    expect(tabForPath('/kitchens/fuel')?.id).toBe('train');
  });

  it('LONGEST PREFIX WINS, so a short route never steals a longer one', () => {
    // '/card' and '/cards' both exist; '/cards' must not be claimed by '/card'
    expect(tabForPath('/cards')?.id).toBe('profile');
    expect(tabForPath('/card/x')?.id).toBe('profile');
  });

  it('an unknown path lights nothing rather than guessing', () => {
    expect(tabForPath('/')).toBeNull();
    expect(tabForPath('/login')).toBeNull();
    expect(tabForPath('/nowhere')).toBeNull();
  });

  it('no two tabs claim the same prefix — one shelf, one home', () => {
    const seen = new Map<string, string>();
    for (const t of TABS) {
      for (const p of t.owns) {
        expect(seen.has(p), `${p} claimed by ${seen.get(p)} and ${t.id}`).toBe(false);
        seen.set(p, t.id);
      }
    }
  });

  it('there are exactly three, because that was the point', () => {
    expect(TABS.map((t) => t.id)).toEqual(['play', 'train', 'profile']);
  });
});

describe('where the shell hides itself', () => {
  it('gets out of the way of a running mode', () => {
    expect(chromeHiddenFor('/play/dunkContest')).toBe(true);
    expect(chromeHiddenFor('/play/hoops1v1')).toBe(true);
  });

  it('gets out of the way of the dev views', () => {
    expect(chromeHiddenFor('/dev/mode/karate')).toBe(true);
    expect(chromeHiddenFor('/dev/shelf/cards')).toBe(true);
  });

  it('stays on the shelf itself, which is a page and not a game', () => {
    expect(chromeHiddenFor('/play')).toBe(false);
  });

  it('stays everywhere else', () => {
    for (const p of ['/', '/train', '/profile', '/coach', '/kitchens', '/store', '/playlist']) {
      expect(chromeHiddenFor(p), p).toBe(false);
    }
  });
});
