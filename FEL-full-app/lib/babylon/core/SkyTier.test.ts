import { describe, it, expect } from 'vitest';
import { SKY, SKY_TIERS, skyTierFor, skyTapAllowed, skyTapRefusal } from './SkyTier';
describe('the sky tier', () => {
  it('every court with a tier hangs something different; Venice and an unknown court hang nothing (the blimp and the water tower are out)', () => {
    expect(new Set(Object.values(SKY_TIERS).map((t) => t.kind)).size).toBe(3);
    expect(skyTierFor('orbit')?.kind).toBe('saucer'); expect(skyTierFor('venice')).toBeNull(); expect(skyTierFor('rooftop')).toBeNull(); expect(skyTierFor(undefined)).toBeNull();
    expect(Object.values(SKY_TIERS).some((t) => /blimp|water tower/i.test(t.tag))).toBe(false);
  });
  it('a tap is once a flight, inside the window, with the hand up to the surface', () => {
    const reach = SKY.underY - SKY.slackM - SKY.reachM;
    expect(skyTapAllowed(0.4, false, reach + 0.01)).toBe(true);
    expect(skyTapAllowed(0.4, false, reach - 0.5)).toBe(false);
    expect(skyTapAllowed(0.4, true, reach + 1)).toBe(false);
    expect(skyTapAllowed(0.1, false, reach + 1)).toBe(false); expect(skyTapAllowed(0.9, false, reach + 1)).toBe(false);
    expect(skyTapRefusal(0.4, false, reach - 0.5, 'ROCKET')).toMatch(/SHORT OF THE ROCKET/);
    expect(skyTapRefusal(0.4, true, 9, 'ROCKET')).toMatch(/SPENT/);
  });
});
