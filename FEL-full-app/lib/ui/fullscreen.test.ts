import { describe, expect, it } from 'vitest';
import { LANDSCAPE_MAX_HEIGHT, isLandscapePhone } from './fullscreen';

describe('what counts as a phone held sideways', () => {
  it('is an actual landscape phone', () => {
    expect(isLandscapePhone(844, 390)).toBe(true);  // iPhone 13
    expect(isLandscapePhone(926, 428)).toBe(true);  // iPhone Pro Max
    expect(isLandscapePhone(740, 360)).toBe(true);  // a small Android
  });

  it('is not a phone held upright', () => {
    expect(isLandscapePhone(390, 844)).toBe(false);
  });

  it('IS NOT A DESKTOP, however wide', () => {
    // The trap this exists to avoid: testing width. A landscape phone is 844 across — wider than plenty of
    // laptops — so a width breakpoint calls a desktop a phone and a phone a desktop.
    expect(isLandscapePhone(1440, 900)).toBe(false);
    expect(isLandscapePhone(1920, 1080)).toBe(false);
  });

  it('is not a tablet in landscape, which has the room for chrome', () => {
    expect(isLandscapePhone(1024, 768)).toBe(false);
  });

  it('takes the boundary as inclusive, so a device exactly at the limit is treated as short', () => {
    expect(isLandscapePhone(900, LANDSCAPE_MAX_HEIGHT)).toBe(true);
    expect(isLandscapePhone(900, LANDSCAPE_MAX_HEIGHT + 1)).toBe(false);
  });
});
