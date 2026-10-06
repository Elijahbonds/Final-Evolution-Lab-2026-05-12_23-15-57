// IMPROVE (2026-10-06): the two core helpers Brain Brawl's owner-picked pass added — the solo tier ladder (#1) and the
// parts of a right answer's points (#7) — and the scripted solo night's strikes (#4).
import { describe, expect, it } from 'vitest';
import { challengeScore, scoreParts, scriptedSoloClaims, soloTier, type Tier } from './BrainBrawlCore';

describe('#1 the solo tier follows the claims', () => {
  it('is the old round ladder on a clean night', () => {
    const byRound = (r: number) => (r <= 2 ? 1 : r <= 4 ? 2 : 3);
    for (let r = 1; r <= 5; r++) expect(soloTier(r - 1)).toBe(byRound(r));   // a clean night claims once a round
  });
  it('does not climb on misses: no claims is tier 1 however many rounds have gone', () => {
    expect(soloTier(0)).toBe(1);
    expect(soloTier(5)).toBe(3);   // never past 3: the arena ceiling's tier
  });
});

describe('#7 the parts of the points', () => {
  it('add up to challengeScore exactly, rounding included, and are nothing for a miss', () => {
    for (const tier of [1, 2, 3] as Tier[]) for (let left = 0; left <= 10; left += 0.37) {
      const p = scoreParts(true, left, 10, tier);
      expect(p.base + p.speed).toBe(challengeScore(true, left, 10, tier));
      expect(p.base).toBe(50 * tier);
      expect(p.speed).toBeGreaterThanOrEqual(0);
    }
    expect(scoreParts(false, 5, 10, 2)).toEqual({ base: 0, speed: 0 });
    expect(scoreParts(true, 10, 10, 2)).toEqual({ base: 100, speed: 100 });
  });
});

describe('#4 the scripted solo night with strikes', () => {
  it('ends at the third miss', () => {
    const run = scriptedSoloClaims(5, () => null, 15, 3);
    expect(run.rounds).toBe(3);
    expect(run.claimed).toBe(0);
    expect(run.done).toBe(false);
  });
  it('without strikes the old behaviour holds (the round cap)', () => {
    expect(scriptedSoloClaims(5, () => null).rounds).toBe(15);
  });
});
