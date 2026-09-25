import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FIRST_GAME, PATH_HOME, artFor, carouselOrder, destinationFor, hostFrom, isPath, isPlayableMode,
  resolveFirstGame,
} from './firstRun';
import { MODE_INFO } from '../game-data';

describe('the path', () => {
  it('knows the two it offers and nothing else', () => {
    expect(isPath('play')).toBe(true);
    expect(isPath('body')).toBe(true);
    for (const v of ['train', '', null, undefined, 'PLAY', 1]) expect(isPath(v)).toBe(false);
  });

  it('sends the body path to the Mirror, because the screen is the front door', () => {
    expect(PATH_HOME.body).toBe('/play/mirror');
  });

  it('opens both paths on a route that exists', () => {
    expect(MODE_INFO[DEFAULT_FIRST_GAME]?.href).toBeTruthy();
  });
});

describe('a mode key is only usable if something opens with it', () => {
  it('accepts a real one', () => {
    expect(isPlayableMode('dunkContest')).toBe(true);
  });

  it('rejects the rest rather than trusting them', () => {
    for (const v of ['', null, undefined, 'nope', 'DUNKCONTEST', '../../etc']) expect(isPlayableMode(v)).toBe(false);
  });
});

describe('whose choice the first game is', () => {
  it('is the creator who brought them, when a creator brought them', () => {
    expect(resolveFirstGame({ creatorMode: 'skateboarding', chosen: 'tennis' })).toBe('skateboarding');
  });

  it('is the athlete when nobody brought them', () => {
    expect(resolveFirstGame({ chosen: 'tennis' })).toBe('tennis');
  });

  it('is the default when neither has said anything', () => {
    expect(resolveFirstGame({})).toBe(DEFAULT_FIRST_GAME);
  });

  it('IGNORES A CREATOR CARD CARRYING A MODE THAT NO LONGER EXISTS', () => {
    // A card is a durable object in somebody's camera roll. A mode it names can be retired long after the sticker
    // was printed, and that must fall through to the athlete's pick rather than strand them on a dead route.
    expect(resolveFirstGame({ creatorMode: 'retired-mode', chosen: 'tennis' })).toBe('tennis');
    expect(resolveFirstGame({ creatorMode: 'retired-mode' })).toBe(DEFAULT_FIRST_GAME);
  });

  it('ignores a hand-edited pick', () => {
    expect(resolveFirstGame({ chosen: '/play/../../admin' })).toBe(DEFAULT_FIRST_GAME);
  });
});

describe('HOTFIX (2026-09-24): an old spelling of a mode key still opens its game', () => {
  // The catalogue key moved to what the shell saves: 'musicAcademy' -> 'music', 'velocitykart' -> 'velocityKart',
  // 'aeroaces' -> 'aeroAces'. A pick already saved in a browser, and a creator card (which stores the multiplayer
  // challenge key 'velocitykart'), must keep landing in their game, and come back spelled the current way.
  it('resolves a saved pick under the old key to the current key and its route', () => {
    expect(isPlayableMode('musicAcademy')).toBe(true);
    expect(resolveFirstGame({ chosen: 'musicAcademy' })).toBe('music');
    expect(destinationFor('play', 'musicAcademy')).toBe('/play/music');
    expect(destinationFor('play', 'velocitykart')).toBe('/play/velocity-kart');
    expect(destinationFor('play', 'aeroaces')).toBe('/play/aero-aces');
  });

  it("keeps a creator card's racing signature mode", () => {
    expect(resolveFirstGame({ creatorMode: 'velocitykart', chosen: 'tennis' })).toBe('velocityKart');
    expect(hostFrom({ displayName: 'Ace', mode: 'aeroaces' })?.mode).toBe('aeroAces');
  });

  it('leads the carousel with the current key, once', () => {
    const order = carouselOrder('velocitykart');
    expect(order[0]).toBe('velocityKart');
    expect(order.filter((k) => k === 'velocityKart')).toHaveLength(1);
    expect(order).not.toContain('velocitykart');
  });
});

describe('where they land', () => {
  it('opens the chosen game itself, not a menu about it', () => {
    expect(destinationFor('play', 'skateboarding')).toBe(MODE_INFO.skateboarding.href);
  });

  it('falls back to the shelf rather than nowhere', () => {
    expect(destinationFor('play', 'nope')).toBe(MODE_INFO[DEFAULT_FIRST_GAME].href);
  });

  it('ignores the game entirely on the body path', () => {
    expect(destinationFor('body', 'skateboarding')).toBe('/play/mirror');
  });
});

describe('the host who sent the link', () => {
  it('reads a card', () => {
    expect(hostFrom({ displayName: 'Amir Smith', mode: 'skateboarding', accent: '#00E5FF' }))
      .toEqual({ name: 'Amir Smith', mode: 'skateboarding', accent: '#00E5FF' });
  });

  it('keeps the host even when their signature mode is unusable', () => {
    // "Amir sent you" is still true and still worth saying; only the game falls through.
    expect(hostFrom({ displayName: 'Amir Smith', mode: 'retired' })).toEqual({ name: 'Amir Smith', mode: null, accent: null });
  });

  it('falls back to the account name when there is no card', () => {
    expect(hostFrom(null, 'Coach V')?.name).toBe('Coach V');
  });

  it('is nobody when there is no name at all', () => {
    expect(hostFrom(null, null)).toBeNull();
    expect(hostFrom({ displayName: '   ' }, '')).toBeNull();
  });

  it('drops an accent that is not a colour, rather than pasting it into a style', () => {
    expect(hostFrom({ displayName: 'X', accent: 'red; background:url(x)' })?.accent).toBeNull();
  });
});

describe('the carousel', () => {
  it('opens on the creator’s game when a creator sent them', () => {
    expect(carouselOrder('skateboarding')[0]).toBe('skateboarding');
  });

  it('lists every playable mode exactly once, however it is ordered', () => {
    const all = carouselOrder();
    const led = carouselOrder('tennis');
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(led).size).toBe(led.length);
    expect([...led].sort()).toEqual([...all].sort());
  });

  it('leads with the modes that have artwork', () => {
    const order = carouselOrder();
    const firstWithout = order.findIndex((k) => !artFor(k));
    const lastWith = order.map((k) => Boolean(artFor(k))).lastIndexOf(true);
    if (firstWithout !== -1) expect(lastWith).toBeLessThan(firstWithout);
  });

  it('ignores a lead that is not a real mode rather than putting it at the front', () => {
    expect(carouselOrder('nope')).toEqual(carouselOrder());
  });

  it('never returns a mode without a route — every card has somewhere to go', () => {
    for (const k of carouselOrder()) expect(MODE_INFO[k]?.href).toBeTruthy();
  });
});
