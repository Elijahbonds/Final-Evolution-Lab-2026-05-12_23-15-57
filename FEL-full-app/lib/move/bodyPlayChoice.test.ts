import { describe, it, expect } from 'vitest';
import {
  BODY_PLAY_KEY_PREFIX, WARMUP_HREF, WARMUP_LABEL, bodyButtonAction, bodyPlayOffer, readBodyPlay, warmupOffer, writeBodyPlay,
  type BodyCard,
} from './bodyPlayChoice';
import { BODY_PROFILES } from '@/lib/input/bodyProfiles';
import { bodySeamFor } from '@/lib/babylon/core/bodySeam';

// MOVEMENT PLAY P4 (2026-09-25): the READY choice. What is pinned: the offer is the running game's own card (the nine
// games the body drives today offer it, a game with a later phase says it is coming, the rest say nothing), the choice
// is remembered per game and a broken store never throws, and the Body button's shortcut never starts a camera on a game
// that does not offer body play.

/** A Storage stand-in: a map, or one that throws on every call (private mode, a full quota). */
function store(throws = false) {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => { if (throws) throw new Error('denied'); return m.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (throws) throw new Error('denied'); m.set(k, v); },
  };
}

/** Each row's card as the harness mounts it (bodySeamFor: the profile's bindings, and no mode has an onBody yet). */
const cards = Object.values(BODY_PROFILES).map((p) => ({ key: p.key, card: bodySeamFor({ modeId: p.modeId }).card }));
const offerOf = (key: string) => bodyPlayOffer(cards.find((c) => c.key === key)!.card);

describe('the choice is remembered per game', () => {
  it('one entry per registry key, "1" or "0", the last write winning', () => {
    const s = store();
    expect(readBodyPlay('skateboard', s)).toBe(false);          // never chosen
    writeBodyPlay('skateboard', true, s);
    expect(s.m.get(`${BODY_PLAY_KEY_PREFIX}skateboard`)).toBe('1');
    expect(readBodyPlay('skateboard', s)).toBe(true);
    expect(readBodyPlay('surf', s)).toBe(false);                // per game
    writeBodyPlay('skateboard', false, s);                       // turned the camera off: remembered off
    expect(readBodyPlay('skateboard', s)).toBe(false);
    expect(BODY_PLAY_KEY_PREFIX).toBe('fel-body-play-');
  });

  it('a store that is missing or throws reads "not chosen" and swallows the write', () => {
    expect(readBodyPlay('skateboard', null)).toBe(false);
    expect(readBodyPlay('skateboard', store(true))).toBe(false);
    expect(() => writeBodyPlay('skateboard', true, store(true))).not.toThrow();
    expect(() => writeBodyPlay('skateboard', true, null)).not.toThrow();
    // node has no localStorage: the default store is none, and nothing throws
    expect(readBodyPlay('skateboard')).toBe(false);
    expect(() => writeBodyPlay('skateboard', true)).not.toThrow();
  });
});

describe('which games offer body play', () => {
  it('exactly the nine games the body drives today (P3\'s binds)', () => {
    const play = cards.filter((c) => bodyPlayOffer(c.card) === 'play').map((c) => c.key).sort();
    expect(play).toEqual(['bigair', 'freerun', 'karate_vs', 'mixedcombat', 'showdown', 'skateboard', 'snowboard_slalom', 'sprint', 'surf']);
  });

  it('a game with a later phase says it is coming; one with none (L, a quiz) says nothing', () => {
    for (const { key, card } of cards) {
      const offer = bodyPlayOffer(card);
      if (card.drives) continue;
      if (['P5', 'P6', 'P7', 'P8', 'P9'].includes(card.later as string)) expect(offer, key).toBe('coming');
      else expect(offer, key).toBeNull();
    }
    expect(offerOf('dunk')).toBe('coming');
    expect(offerOf('onevone')).toBe('coming');
    expect(offerOf('dance')).toBe('coming');
    expect(offerOf('football')).toBeNull();
    expect(offerOf('brainbrawl')).toBeNull();
    expect(bodyPlayOffer({ modeId: null, drives: false, later: null })).toBeNull();
  });

  it('follows the card, not a list: a game that gains an onBody (P5\'s dunk) offers it with no change here', () => {
    const dunk = bodySeamFor({ modeId: 'dunk', onBody: () => {} }).card;
    expect(dunk.drives).toBe(true);
    expect(bodyPlayOffer(dunk)).toBe('play');
  });
});

describe('the header Body button is a shortcut to the choice', () => {
  const skate: BodyCard = cards.find((c) => c.key === 'skateboard')!.card;
  const dunk: BodyCard = cards.find((c) => c.key === 'dunk')!.card;
  const quiz: BodyCard = cards.find((c) => c.key === 'brainbrawl')!.card;
  const none: BodyCard = { modeId: null, drives: false, later: null };

  it.each([
    ['the camera is on: off', skate, 'ready', true, 'end'],
    ['no game running', none, null, false, 'none'],
    ['a game where body play is coming: the card only', dunk, 'ready', false, 'coming'],
    ['…and mid-play too: never a camera there', dunk, 'playing', false, 'coming'],
    ['a game that has no body play: the card only', quiz, 'ready', false, 'unavailable'],
    ['mid-play: pause first, then the check', skate, 'playing', false, 'begin-paused'],
    ['READY: the check on the game screen', skate, 'ready', false, 'begin'],
    ['paused: the check over the pause', skate, 'paused', false, 'begin'],
    ['still loading', skate, 'loading', false, 'begin'],
  ] as const)('%s', (_label, card, phase, on, action) => {
    expect(bodyButtonAction({ ...card, phase }, on)).toBe(action);
  });
});

describe('the wake-up offer', () => {
  it('is hidden while there are no drills to route it to (P9 sets the route)', () => {
    expect(WARMUP_HREF).toBeNull();
    expect(warmupOffer('ready')).toBeNull();
  });
  it('once there are: shown only when the space is set', () => {
    const href = '/play/drills?warmup=wake-up';
    expect(warmupOffer('ready', href)).toEqual({ href, label: WARMUP_LABEL });
    for (const stage of ['frame', 'arms', 'advice', 'still', null]) expect(warmupOffer(stage, href)).toBeNull();
    expect(WARMUP_LABEL).toBe('2-minute wake-up first?');
  });
});
