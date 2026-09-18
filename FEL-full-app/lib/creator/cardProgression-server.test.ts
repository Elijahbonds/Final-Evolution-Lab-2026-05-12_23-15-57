// AN UNKNOWN AGE IS NOT AN ADULT (2026-09-13).
//
// The server-side half of the minor rule. `projectCard` already refuses to build for a minor; what is
// decided here is who counts as one when the only signal is `User.dobYear`, which is nullable.
//
// The answer has to match `needsGuardianConsent` ("unknown age: be safe"), and the cost is real — an adult
// who never entered a birth year gets no progression panel. That is the right way round: the failure it
// prevents is a child's training record at a public URL; the failure it causes is a missing panel.

import { describe, it, expect } from 'vitest';
import { isAdult } from './cardProgression-server';

const NOW = new Date('2026-09-13T12:00:00.000Z');

describe('isAdult', () => {
  it('turns 18 in the year they turn 18', () => {
    expect(isAdult(2008, NOW)).toBe(true);        // 2026 - 2008 = 18
    expect(isAdult(2009, NOW)).toBe(false);       // 17
  });

  it('comfortably older is an adult', () => {
    expect(isAdult(1990, NOW)).toBe(true);
  });

  it('UNKNOWN IS NOT AN ADULT — null, undefined and 0 all fail closed', () => {
    expect(isAdult(null, NOW)).toBe(false);
    expect(isAdult(undefined, NOW)).toBe(false);
    expect(isAdult(0, NOW)).toBe(false);
  });

  it('and it agrees with the consent helper it is meant to match', async () => {
    const { needsGuardianConsent } = await import('../camp/certification');
    for (const year of [null, undefined, 0, 2009, 2015, 2008, 1990]) {
      // one is the negation of the other: a person needing guardian consent is not an adult here
      expect(isAdult(year, NOW), String(year)).toBe(!needsGuardianConsent(year, NOW));
    }
  });
});
