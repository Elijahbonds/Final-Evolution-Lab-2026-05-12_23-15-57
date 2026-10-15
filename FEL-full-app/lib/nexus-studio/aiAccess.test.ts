// The AI builder's age rule (owner 2026-10-14, "Teens too"): teens 13–17 and adults; under 13 and an unknown age refused. It is the
// account rule itself (lib/privacy/ageScreen.ts), so it is held against that rule for every year a person can answer.
import { describe, expect, it } from 'vitest';
import { aiBuilderAge, aiBuilderAllowed } from './aiAccess';
import { ageScreenOutcome } from '@/lib/privacy/ageScreen';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';

const NOW = new Date('2026-10-14T12:00:00Z');

describe('aiBuilderAllowed', () => {
  it('teens and adults yes; under 13 and unknown no (2026: 2013 is under 13, 2012 a teen, 2008 a teen, 2007 an adult)', () => {
    expect([2013, 2012, 2008, 2007, 1980].map((y) => aiBuilderAge(y, NOW))).toEqual(['under13', 'teen', 'teen', 'adult', 'adult']);
    expect([2013, 2012, 2008, 2007, 1980].map((y) => aiBuilderAllowed(y, NOW))).toEqual([false, true, true, true, true]);
    for (const unknown of [null, undefined, NaN, 2000.5, 1899, 2027, '1990' as unknown as number]) {
      expect(aiBuilderAge(unknown, NOW), String(unknown)).toBe('unknown');
      expect(aiBuilderAllowed(unknown, NOW)).toBe(false);
    }
  });

  it('agrees with the account screen for every year 1890 → next year: allowed exactly when the screen says teen or adult', () => {
    for (let y = 1890; y <= NOW.getFullYear() + 1; y++) {
      const screen = ageScreenOutcome(y, NOW);
      expect(aiBuilderAllowed(y, NOW), `year ${y}`).toBe(screen === 'teen' || screen === 'adult');
      // every adult the strict rule knows is allowed; nobody the screen blocks is
      if (verifiedAdult(y, NOW)) expect(aiBuilderAllowed(y, NOW)).toBe(true);
      if (screen === 'blocked') expect(aiBuilderAge(y, NOW)).toBe('under13');
    }
  });
});
