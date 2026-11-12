import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FIRST_GAME, PATHS, PATH_HOME, artFor, carouselOrder, destinationFor, hostFrom, isPath, isPlayableMode,
  pathFor, resolveFirstGame, toPath, welcomeHref,
} from './firstRun';
import { DAILY_DRILL_PATH } from '../daily-drill/copy';
import { MODE_INFO } from '../game-data';
import { shelvedModes } from '../nav/families';

describe('the path', () => {
  // test changed (ONB-01, 2026-10-25): the paths went from two (play, body) to five (play, train, learn, teach, create),
  // so 'train' is now a path, and the old `body` is train's alias. The old assertions said the opposite of the owner's
  // QUALITY decision of 2026-10-20 ("pick-your-path: play / train / learn / teach / create").
  it('knows the five it offers, reads the old `body` as train, and nothing else', () => {
    expect(PATHS).toEqual(['play', 'train', 'learn', 'teach', 'create']);
    for (const p of PATHS) { expect(isPath(p)).toBe(true); expect(toPath(p)).toBe(p); }
    expect(isPath('body')).toBe(true);
    expect(toPath('body')).toBe('train');
    for (const v of ['', null, undefined, 'PLAY', 'Train', 1, 'mirror']) { expect(isPath(v)).toBe(false); expect(toPath(v)).toBeNull(); }
  });

  it('starts train at today\'s drill, and keeps `body` pointing where train points', () => {
    expect(PATH_HOME.train).toBe(DAILY_DRILL_PATH);
    expect(PATH_HOME.body).toBe(PATH_HOME.train);
  });

  it('holds teach for anyone who is not a verified adult: they get train', () => {
    expect(pathFor('teach', { adult: true })).toBe('teach');
    expect(pathFor('teach', { adult: false })).toBe('train');
    for (const p of ['play', 'train', 'learn', 'create'] as const) expect(pathFor(p, { adult: false })).toBe(p);
    expect(pathFor('nonsense', { adult: true })).toBe('play');
    expect(pathFor('body', { adult: false })).toBe('train');
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

  it('rejects catalogue rows that are not first-game shelf entries', () => {
    for (const key of ['marketplace', 'kitchens', 'mirror', 'training']) {
      expect(isPlayableMode(key)).toBe(false);
      expect(resolveFirstGame({ chosen: key })).toBe(DEFAULT_FIRST_GAME);
      expect(hostFrom({ displayName: 'Host', mode: key })?.mode).toBeNull();
    }
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

  // test changed (ONB-02): body is train now, and train lands on its guided first win, not the Mirror.
  it('ignores the game entirely on every path but play, which land on their first win', () => {
    expect(destinationFor('body', 'skateboarding')).toBe(welcomeHref('train'));
    for (const p of ['train', 'learn', 'teach', 'create'] as const) expect(destinationFor(p, 'skateboarding')).toBe(`/welcome?path=${p}`);
  });

  it('play still opens the game itself, the creator\'s first (the QR rule)', () => {
    expect(destinationFor('play', resolveFirstGame({ creatorMode: 'skateboarding', chosen: 'tennis' }))).toBe(MODE_INFO.skateboarding.href);
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

  it('offers the Play shelf, not every catalogue row with an href', () => {
    expect([...carouselOrder()].sort()).toEqual([...shelvedModes()].sort());
    expect(carouselOrder()).not.toEqual(expect.arrayContaining(['marketplace', 'kitchens', 'mirror', 'training']));
  });
});
