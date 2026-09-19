import { describe, it, expect } from 'vitest';
import { SKY, SKY_TIERS, skyTierFor, skyTapAllowed, skyTapRefusal } from './SkyTier';
describe('the sky tier', () => {
  it('every court hangs something different; an unknown court gets the blimp', () => {
    expect(new Set(Object.values(SKY_TIERS).map((t) => t.kind)).size).toBe(5);
    expect(skyTierFor('orbit').kind).toBe('rocket'); expect(skyTierFor(undefined).kind).toBe('blimp');
  });
  it('a tap is once a flight, inside the window, with the hand up to the surface', () => {
    const reach = SKY.underY - SKY.slackM - SKY.reachM;
    expect(skyTapAllowed(0.4, false, reach + 0.01)).toBe(true);
    expect(skyTapAllowed(0.4, false, reach - 0.5)).toBe(false);
    expect(skyTapAllowed(0.4, true, reach + 1)).toBe(false);
    expect(skyTapAllowed(0.1, false, reach + 1)).toBe(false); expect(skyTapAllowed(0.9, false, reach + 1)).toBe(false);
    expect(skyTapRefusal(0.4, false, reach - 0.5, 'BLIMP')).toMatch(/SHORT OF THE BLIMP/);
    expect(skyTapRefusal(0.4, true, 9, 'ROCKET')).toMatch(/SPENT/);
  });
});
