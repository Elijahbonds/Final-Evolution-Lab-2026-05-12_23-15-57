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

// IMPROVE (2026-10-06), research item 3: the face menu is honest about which options shape the 3D body.
import { readFileSync } from 'node:fs';
import { FEATURE_WEIGHTS, faceFieldRenders, faceOptionRenders } from './faceMorphs';
import { BROWS, EYE_COLORS, EYE_SHAPES, FACE_SHAPES, MOUTHS, NOSES } from '../../closet/wearable-catalog';

describe('faceOptionRenders (the honest face menu)', () => {
  it('every face shape renders; brows only Natural (the baseline) and Arched', () => {
    for (const s of FACE_SHAPES) expect(faceOptionRenders('faceShape', s), s).toBe(true);
    expect(BROWS.filter((b) => faceOptionRenders('brows', b))).toEqual(['Natural', 'Arched']);
    expect(faceFieldRenders('brows', BROWS)).toBe(true);
    expect(faceFieldRenders('faceShape', FACE_SHAPES)).toBe(true);
  });
  it('eye shape, mouth, nose and eye colour have no 3D effect yet, so the whole field says "coming soon"', () => {
    expect(faceFieldRenders('eyeShape', EYE_SHAPES)).toBe(false);
    expect(faceFieldRenders('mouth', MOUTHS)).toBe(false);
    expect(faceFieldRenders('nose', NOSES)).toBe(false);
    expect(faceFieldRenders('eyeColor', EYE_COLORS)).toBe(false);
    expect(faceOptionRenders('brows', 'toString')).toBe(false);   // prototype keys are not options
  });
  it('the claim is true: every option it calls "renders" changes the weights, every other one does not', () => {
    const neutral = resolveFaceWeights({});
    const changes = (i: Parameters<typeof resolveFaceWeights>[0]) => resolveFaceWeights(i).some((v, k) => v !== neutral[k]);
    for (const b of BROWS) if (b !== 'Natural') expect(changes({ brows: b }), b).toBe(faceOptionRenders('brows', b));
    for (const s of FACE_SHAPES) if (s !== 'Oval') expect(changes({ faceShape: s }), s).toBe(faceOptionRenders('faceShape', s));
    for (const [field, list] of [['eyeShape', EYE_SHAPES], ['mouth', MOUTHS], ['nose', NOSES]] as const) {
      for (const o of list) expect(changes({ [field]: o }), `${field} ${o}`).toBe(faceOptionRenders(field, o));
    }
  });
  it('a feature turns honest by data alone once a morph is baked for it', () => {
    FEATURE_WEIGHTS.nose.Wide = { faceSquare: 0.2 };
    try {
      expect(faceOptionRenders('nose', 'Wide')).toBe(true);
      expect(faceFieldRenders('nose', NOSES)).toBe(true);
      expect(resolveFaceWeights({ nose: 'Wide' })[FACE_MORPH_NAMES.indexOf('faceSquare')]).toBeCloseTo(0.2);
    } finally { delete FEATURE_WEIGHTS.nose.Wide; }
  });
  it('the kit bodies really carry no iris material (why eye colour is "coming soon")', () => {
    for (const f of ['public/models/candidates/fel-kit-male.glb', 'public/models/candidates/fel-kit-female.glb']) {
      const b = readFileSync(f);
      const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8')) as { materials: { name: string }[]; extras?: unknown };
      expect(j.materials.some((m) => /iris/i.test(m.name)), f).toBe(false);
    }
  });
});
