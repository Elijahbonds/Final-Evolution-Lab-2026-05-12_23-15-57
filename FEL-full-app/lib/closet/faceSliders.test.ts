import { describe, expect, it } from 'vitest';
import { sanitizeFaceSliders } from './wearable-catalog';

describe('sanitizeFaceSliders', () => {
  it('keeps known keys, clamps to 0..1, rounds to 3 places', () => {
    expect(sanitizeFaceSliders({ faceLong: 0.12345, jawOpen: 7, browRaise: -2 })).toEqual({ faceLong: 0.123, jawOpen: 1 });
  });
  it('drops unknown keys and non-numbers', () => {
    // phase 4c (data-driven): a name is "unknown" when the face morph rule refuses it (faceMorphList.isFaceMorphName);
    // a well-formed new name such as a phase-5 morph is kept on purpose
    expect(sanitizeFaceSliders({ 'evil-key': 1, felShape: 1, photoMix: 1, constructor: 1, faceRound: '0.5', faceHeart: NaN })).toBeUndefined();
    expect(sanitizeFaceSliders({ noseWidth: 0.5 })).toEqual({ noseWidth: 0.5 });
  });
  it('returns undefined for empty, null, or non-object input', () => {
    expect(sanitizeFaceSliders(undefined)).toBeUndefined();
    expect(sanitizeFaceSliders(null)).toBeUndefined();
    expect(sanitizeFaceSliders('x')).toBeUndefined();
    expect(sanitizeFaceSliders({})).toBeUndefined();
  });
});
