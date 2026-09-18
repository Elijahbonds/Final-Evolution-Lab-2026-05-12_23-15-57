import { describe, expect, it } from 'vitest';
import { FACE_MORPH_NAMES, resolveFaceWeights } from './faceMorphs';

describe('resolveFaceWeights', () => {
  it('Oval is the neutral head', () => {
    expect(resolveFaceWeights({ faceShape: 'Oval' })).toEqual(FACE_MORPH_NAMES.map(() => 0));
  });
  it('each catalog shape drives exactly one morph', () => {
    for (const [shape, morph] of [['Round', 'faceRound'], ['Square', 'faceSquare'], ['Heart', 'faceHeart'], ['Diamond', 'faceDiamond'], ['Long', 'faceLong']] as const) {
      const w = resolveFaceWeights({ faceShape: shape });
      const on = FACE_MORPH_NAMES.filter((_, i) => w[i] > 0);
      expect(on).toEqual([morph]);
    }
  });
  it('sliders override the preset for that morph only and clamp to 0..1', () => {
    const w = resolveFaceWeights({ faceShape: 'Round', sliders: { faceRound: 0.2, jawOpen: 5, browRaise: -1 } });
    const get = (n: string) => w[FACE_MORPH_NAMES.indexOf(n as never)];
    expect(get('faceRound')).toBeCloseTo(0.2);
    expect(get('jawOpen')).toBe(1);
    expect(get('browRaise')).toBe(0);
  });
  it('unknown presets resolve to neutral rather than throwing', () => {
    expect(resolveFaceWeights({ faceShape: 'Octagon', brows: 'Laser' })).toEqual(FACE_MORPH_NAMES.map(() => 0));
  });
});
