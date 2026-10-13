// vis-board (wave 2) — the surf's pieces: the foam wake's rate and the sun's light on the sea.
import { describe, expect, it } from 'vitest';
import { wakeRate } from '../premium/SurfSpray';
import { OCEAN_SUN_GAIN, oceanLightFor } from './OceanSurface';
import { MOODS } from '../scene/moods';

describe('the foam wake', () => {
  it('nothing in the air or at a crawl; more with speed and with the rail set', () => {
    expect(wakeRate(10, 0.5, false)).toBe(0);
    expect(wakeRate(1, 0.5, true)).toBe(0);
    expect(wakeRate(Number.NaN, 0.5, true)).toBe(0);
    expect(wakeRate(10, 0, true)).toBeGreaterThan(wakeRate(3, 0, true));
    expect(wakeRate(10, 1, true)).toBeGreaterThan(wakeRate(10, 0, true));
    expect(wakeRate(99, 9, true)).toBe(wakeRate(12, 1, true));   // held at the top
    expect(wakeRate(10, 1, true, true)).toBeLessThan(wakeRate(10, 1, true) * 0.3);   // a phone's trail is a fifth as thick
  });
});

describe('the sun on the water', () => {
  const m = MOODS.goldenHour;
  it('phones get none: the glitter is per-pixel work over the biggest surface on screen', () => {
    expect(oceanLightFor('goldenHour', m.sunDir, m.sun, 'mobile')).toBeUndefined();
    expect(oceanLightFor('goldenHour', m.sunDir, m.sun, undefined)).toBeUndefined();
  });
  it('the direction is TOWARD the sun (the moods store where the light travels), the low gold sun draws the most', () => {
    const l = oceanLightFor('goldenHour', m.sunDir, m.sun, 'desktop')!;
    expect(l.sun[0]).toBeCloseTo(-m.sunDir[0], 6); expect(l.sun[1]).toBeCloseTo(-m.sunDir[1], 6);
    expect(l.glitter).toBeGreaterThan(OCEAN_SUN_GAIN.overcast.glitter);
    expect(oceanLightFor('overcast', MOODS.overcast.sunDir, MOODS.overcast.sun, 'high')!.glitter).toBeLessThan(l.glitter);
    expect(oceanLightFor('indoorArena', MOODS.indoorArena.sunDir, MOODS.indoorArena.sun, 'desktop')).toBeUndefined();
  });
  it('every mood has a gain, none negative', () => {
    for (const k of Object.keys(MOODS)) { expect(OCEAN_SUN_GAIN[k], k).toBeTruthy(); expect(OCEAN_SUN_GAIN[k].glitter).toBeGreaterThanOrEqual(0); expect(OCEAN_SUN_GAIN[k].sss).toBeGreaterThanOrEqual(0); }
  });
});
