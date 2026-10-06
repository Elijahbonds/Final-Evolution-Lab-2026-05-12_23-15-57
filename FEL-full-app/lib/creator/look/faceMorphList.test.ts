// The data-driven face morph list (IMPROVE (2026-10-06), CREATOR-PLAN phase 4c): the name rule, the labels, the order,
// the cap, and that every face and doc saved before sanitises to exactly what it was.
import { describe, expect, it } from 'vitest';
import {
  FACE_MORPH_LABELS, KNOWN_FACE_MORPHS, MAX_FACE_MORPHS, faceMorphList, isFaceMorphName, labelFor, orderMorphNames, sanitizeMorphWeights,
} from './faceMorphList';
import { FACE_SLIDER_KEYS, sanitizeFaceSliders } from '../../closet/wearable-catalog';
import { SHAPE_FACE_KEYS, emptyCreatorDoc } from './doc';
import { sanitizeCreatorDoc } from './sanitize';
import { decodeShareCode, encodeShareCode } from './shareCode';
import { payloadHasImage } from '../lookPrivacy';
import { FACE_MORPH_NAMES, resolveFaceWeightMap, resolveFaceWeights } from '../../babylon/core/faceMorphs';

/** The sanitiser as it was before 4c (wearable-catalog, phase 3): the seven names, clamped, zeros dropped. */
function oldSliders(input: unknown): Record<string, number> | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const out: Record<string, number> = {};
  for (const k of FACE_SLIDER_KEYS) {
    const v = (input as Record<string, unknown>)[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const c = Math.max(0, Math.min(1, v));
    if (c > 0) out[k] = Math.round(c * 1000) / 1000;
  }
  return Object.keys(out).length ? out : undefined;
}

describe('the face morph name rule', () => {
  it('the forge\'s seven pass, in step with every list that named them', () => {
    expect([...KNOWN_FACE_MORPHS]).toEqual([...FACE_MORPH_NAMES]);
    expect([...KNOWN_FACE_MORPHS]).toEqual([...FACE_SLIDER_KEYS]);
    expect([...KNOWN_FACE_MORPHS]).toEqual([...SHAPE_FACE_KEYS]);
    for (const k of KNOWN_FACE_MORPHS) expect(isFaceMorphName(k), k).toBe(true);
  });
  it('a phase-5 style name passes; junk, the Creator\'s own targets, picture keys and object built-ins do not', () => {
    for (const ok of ['noseWidth', 'eyeTilt', 'chinDepth2', 'muscleMass', 'ab']) expect(isFaceMorphName(ok), ok).toBe(true);
    for (const bad of ['felShape', 'felAnything', 'NoseWidth', 'nose_width', 'nose-width', 'x', '', 'a'.repeat(25), '9lives',
      'photoBlend', 'eyeTexture', 'pngLook', 'skinPixels', 'constructor', 'toString', 'hasOwnProperty', '__proto__', 7, null]) {
      expect(isFaceMorphName(bad), String(bad)).toBe(false);
    }
  });
  it('labels: the known ones as the Closet always showed them, a new name spelt out', () => {
    expect(labelFor('faceSquare')).toBe('Jaw');
    expect(labelFor('jawOpen')).toBe('Jaw open');
    expect(labelFor('noseWidth')).toBe('Nose width');
    expect(labelFor('cheekPuff2')).toBe('Cheek puff 2');
    expect(Object.keys(FACE_MORPH_LABELS).sort()).toEqual([...KNOWN_FACE_MORPHS].sort());
  });
});

describe('the list a body gives', () => {
  it('known seven first in their order, then new names as the body lists them, the Creator\'s own target left out', () => {
    const body = ['noseWidth', 'browRaise', 'felShape', 'faceLong', 'chinDepth', 'noseWidth', 'jawOpen'];
    expect(faceMorphList(body)).toEqual([
      { key: 'faceLong', label: 'Length' }, { key: 'jawOpen', label: 'Jaw open' }, { key: 'browRaise', label: 'Brow' },
      { key: 'noseWidth', label: 'Nose width' }, { key: 'chinDepth', label: 'Chin depth' },
    ]);
  });
  it('a body with no morphs (the scan) gives no sliders', () => { expect(faceMorphList([])).toEqual([]); });
  it('is capped', () => {
    const many = Array.from({ length: 200 }, (_, i) => `morph${i}`);
    expect(orderMorphNames(many)).toHaveLength(MAX_FACE_MORPHS);
  });
});

describe('saved values keep working', () => {
  it('sanitizeFaceSliders is exactly the old sanitiser on any face of the seven (2,000 random faces)', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let n = 0; n < 2000; n++) {
      const f: Record<string, unknown> = {};
      for (const k of FACE_SLIDER_KEYS) if (rnd() < 0.6) f[k] = rnd() < 0.1 ? 'x' : (rnd() * 1.6 - 0.3);
      expect(sanitizeFaceSliders(f)).toEqual(oldSliders(f));
      expect(JSON.stringify(sanitizeFaceSliders(f))).toBe(JSON.stringify(oldSliders(f)));   // key order too
    }
  });
  it('a new name is kept now (it was dropped before), and an over-long list is capped', () => {
    expect(sanitizeFaceSliders({ faceLong: 0.5, noseWidth: 0.25, felShape: 1 })).toEqual({ faceLong: 0.5, noseWidth: 0.25 });
    const many = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`m${i}x`, 0.5]));
    expect(Object.keys(sanitizeFaceSliders(many)!)).toHaveLength(MAX_FACE_MORPHS);
  });
  it('the doc\'s face values: a phase 1–4b doc sanitises to what it was; a new morph rides through a save and a code', () => {
    const old = { ...emptyCreatorDoc(), shape: { face: { faceLong: 0.4, jawOpen: 0 }, body: {} } };
    expect(sanitizeCreatorDoc(old)).toEqual(old);
    const next = { ...emptyCreatorDoc(), shape: { face: { faceLong: 0.4, noseWidth: 0.7, felShape: 1, photoMix: 1 }, body: {} } };
    const clean = sanitizeCreatorDoc(next)!;
    expect(clean.shape.face).toEqual({ faceLong: 0.4, noseWidth: 0.7 });
    expect(sanitizeCreatorDoc(clean)).toEqual(clean);
    expect(decodeShareCode(encodeShareCode(clean))).toMatchObject({ ok: true, doc: clean });
    expect(payloadHasImage({ face: { sliders: sanitizeFaceSliders({ noseWidth: 0.3 }) }, creator: clean })).toBe(false);
  });
  it('sanitizeMorphWeights keeps an explicit zero only when asked (the doc pins a morph; the sliders stay compact)', () => {
    expect(sanitizeMorphWeights({ faceLong: 0, noseWidth: 0 }, true)).toEqual({ faceLong: 0, noseWidth: 0 });
    expect(sanitizeMorphWeights({ faceLong: 0, noseWidth: 0 }, false)).toEqual({});
  });
});

describe('weights by name', () => {
  it('the map agrees with the old vector on the seven, and carries a new name', () => {
    const input = { faceShape: 'Round', brows: 'Arched', sliders: { jawOpen: 0.3, noseWidth: 0.6, felShape: 1 } };
    const vec = resolveFaceWeights(input);
    const map = resolveFaceWeightMap(input);
    FACE_MORPH_NAMES.forEach((k, i) => expect(map[k], k).toBeCloseTo(vec[i]));
    expect(map.noseWidth).toBeCloseTo(0.6);
    expect('felShape' in map).toBe(false);
  });
});
