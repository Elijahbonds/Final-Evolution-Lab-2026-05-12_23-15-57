// DUNK-LAND-CELEBRATE — live celebration timeline and picker.
import { describe, it, expect } from 'vitest';
import {
  pickLiveCelebration, nextRotation, holdEndMs, celebStartMs, landCelebrateTimeline,
  celebrationInRiseWindow, celebrationLengthOk, CELEB_TARGET_SEC, DUNK_LAND_ABSORB_CLIP, clipFor,
} from './DunkLandCelebrate';
import { CELEB_SPIDERMAN_SEC } from '../anim/authored/dunkCelebrations';

const bands = { eruption: 45, approval: 40 };

describe('DunkLandCelebrate picker', () => {
  it('a miss → no celebration; hold unchanged', () => {
    expect(pickLiveCelebration({ made: false, bands })).toBeNull();
    expect(holdEndMs(false, null)).toBe(380);
  });

  it('d-pad pick wins over rotation', () => {
    expect(pickLiveCelebration({ made: true, chosen: 'spiderman', bands })).toBe('spiderman');
    expect(pickLiveCelebration({ made: true, chosen: 'roar', bands, lastRot: 'roar' })).toBe('roar');
  });

  it('rotation never repeats back to back', () => {
    const a = nextRotation(null, 0);
    const b = nextRotation(a, 1);
    expect(b).not.toBe(a);
    const c = nextRotation(b, 2);
    expect(c).not.toBe(b);
  });

  it('every make gets a standing rotation clip (not armsup)', () => {
    for (let seed = 0; seed < 8; seed++) {
      const id = pickLiveCelebration({ made: true, bands, seed, lastRot: seed % 3 === 0 ? 'roar' : null });
      expect(['roar', 'toosmall', 'itsover']).toContain(id);
    }
  });

  it('Spider-Man plays full length; hold end = celebration end on a make', () => {
    const sp = holdEndMs(true, 'spiderman');
    expect(sp).toBeGreaterThan(Math.round((0.32 + CELEB_SPIDERMAN_SEC) * 1000) - 50);
    const roar = holdEndMs(true, 'roar');
    expect(roar).toBeGreaterThan(1400);
    expect(celebrationLengthOk(CELEB_TARGET_SEC, 'roar')).toBe(true);
    expect(celebrationLengthOk(CELEB_SPIDERMAN_SEC, 'spiderman')).toBe(true);
  });

  it('celebration starts in the rise window; timeline marks hold end', () => {
    expect(celebrationInRiseWindow(celebStartMs())).toBe(true);
    const tl = landCelebrateTimeline(1.5, true);
    expect(tl.holdEndSec).toBeCloseTo(tl.celebEndSec, 2);
    expect(tl.heelDownSec).toBeCloseTo(0.07, 2);
    expect(clipFor('roar')).toMatch(/^dunk_/);
    expect(DUNK_LAND_ABSORB_CLIP).toBe('dunk_land_absorb');
  });
});
