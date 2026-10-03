import { describe, expect, it } from 'vitest';
import { MODE_INFO, VENUES } from '@/lib/game-data';
import { venueModeKey } from './venue-shelf';

describe('venue shelf mastery keys', () => {
  it('derives route slugs from the canonical MODE_INFO catalogue', () => {
    expect(venueModeKey('/play/karate-vs')).toBe('karateVersus');
    expect(venueModeKey('/play/big-air')).toBe('bigAir');
    expect(venueModeKey('/play/onevone')).toBe('hoops1v1');
    expect(venueModeKey('/play/threevthree')).toBe('hoops3v3');
    expect(venueModeKey('/play/velocity-kart')).toBe('velocityKart');
    expect(venueModeKey('/play/aero-aces')).toBe('aeroAces');
  });

  it('maps every playable /play venue to a session key that the app knows', () => {
    const missing = VENUES
      .filter((venue) => venue.playable && venue.href?.startsWith('/play/'))
      .map((venue) => [venue.href, venueModeKey(venue.href)] as const)
      .filter(([, key]) => !key || !(key in MODE_INFO))
      .map(([href, key]) => `${href} -> ${key ?? 'null'}`);

    expect(missing).toEqual([]);
  });
});
