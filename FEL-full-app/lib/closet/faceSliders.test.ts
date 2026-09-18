import { describe, expect, it } from 'vitest';
import { sanitizeFaceSliders } from './wearable-catalog';

describe('sanitizeFaceSliders', () => {
  it('keeps known keys, clamps to 0..1, rounds to 3 places', () => {
    expect(sanitizeFaceSliders({ faceLong: 0.12345, jawOpen: 7, browRaise: -2 })).toEqual({ faceLong: 0.123, jawOpen: 1 });
  });
  it('drops unknown keys and non-numbers', () => {
    expect(sanitizeFaceSliders({ evil: 1, faceRound: '0.5', faceHeart: NaN })).toBeUndefined();
  });
  it('returns undefined for empty, null, or non-object input', () => {
    expect(sanitizeFaceSliders(undefined)).toBeUndefined();
    expect(sanitizeFaceSliders(null)).toBeUndefined();
    expect(sanitizeFaceSliders('x')).toBeUndefined();
    expect(sanitizeFaceSliders({})).toBeUndefined();
  });
});
