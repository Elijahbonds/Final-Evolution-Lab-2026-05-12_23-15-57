import { describe, expect, it } from 'vitest';
import { landingDustScale, netSplashScale, NET_SPLASH_DROP, DUST_MIN, DUST_MAX } from './DunkSystem';

// ── The contact and the landing (visuals pass P5, 2026-09-16) ──────────────────────────────────────────────────────
// Both effects existed and both were firing wrong: the net splash went off in the JUDGES' scoring step, seconds after
// the ball was through and with the camera on the player, and the landing dust was a flat scale 1 for every landing
// though EffectsKit.burst takes a scale for exactly this reason. An effect that is the same size every time reads as
// canned, and one that fires at the wrong moment may as well not exist.
describe('how big the landing puff is', () => {
  it('grows with the fall that made it', () => {
    expect(landingDustScale(1.9)).toBeGreaterThan(landingDustScale(1.05) + 0.2);
  });
  it('stays inside the burst helper\'s own clamp at both ends', () => {
    for (const apex of [0, 0.5, 1.05, 1.5, 1.9, 4, 100]) {
      expect(landingDustScale(apex)).toBeGreaterThanOrEqual(DUST_MIN);
      expect(landingDustScale(apex)).toBeLessThanOrEqual(DUST_MAX);
      expect(landingDustScale(apex)).toBeLessThanOrEqual(2);   // EffectsKit.burst clamps to 2
    }
  });
  it('a hop still raises dust — nobody lands in silence', () => {
    expect(landingDustScale(0.2)).toBeGreaterThan(0.25);
  });
});

describe('the net splash', () => {
  it('is bigger for a jam put through clean than one that scrapes in', () => {
    expect(netSplashScale(1)).toBeGreaterThan(netSplashScale(0.3) + 0.3);
  });
  it('never leaves the burst helper\'s usable range, whatever execution says', () => {
    for (const e of [-1, 0, 0.3, 0.75, 1, 5]) {
      expect(netSplashScale(e)).toBeGreaterThanOrEqual(0.25);
      expect(netSplashScale(e)).toBeLessThanOrEqual(2);
    }
  });
  it('sits under the ring, where the ball actually is — not on the iron', () => {
    expect(NET_SPLASH_DROP).toBeGreaterThan(0.2);   // a regulation net is ~0.4 m
    expect(NET_SPLASH_DROP).toBeLessThan(0.45);
  });
});
