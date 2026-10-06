// Randomise with locks (IMPROVE (2026-10-06), CREATOR-PLAN phase 1).
import { describe, expect, it } from 'vitest';
import { RANDOM_SECTIONS, randomiseLook, rollKitColours, seededRandom } from './randomise';
import { sanitizeCreatorDoc } from './sanitize';
import { emptyCreatorDoc } from './doc';
import {
  BROWS, EYE_COLORS, EYE_SHAPES, FACE_SHAPES, HAIR_COLORS, HAIR_STYLES, MOUTHS, NOSES, SKIN_TONES, defaultFace,
} from '../../closet/wearable-catalog';

const START = { face: defaultFace(), doc: null };

describe('randomiseLook', () => {
  it('is deterministic for a seed and rolls only catalog values', () => {
    const a = randomiseLook(START, [], seededRandom(7));
    const b = randomiseLook(START, [], seededRandom(7));
    expect(a).toEqual(b);
    for (let seed = 0; seed < 200; seed++) {
      const { face, doc } = randomiseLook(START, [], seededRandom(seed));
      expect(SKIN_TONES).toContain(face.skinTone);
      expect(FACE_SHAPES).toContain(face.faceShape);
      expect(HAIR_STYLES).toContain(face.hairStyle);
      expect(HAIR_COLORS).toContain(face.hairColor);
      expect(EYE_SHAPES).toContain(face.eyeShape);
      expect(EYE_COLORS).toContain(face.eyeColor);
      expect(BROWS).toContain(face.brows);
      expect(MOUTHS).toContain(face.mouth);
      expect(NOSES).toContain(face.nose);
      expect(face.hairStyle).not.toBe('Hijab');
      // the rolled colours survive the server's sanitiser unchanged
      expect(sanitizeCreatorDoc(doc)!.colours).toEqual(doc!.colours);
    }
  });
  it('actually varies (a roll is not a constant)', () => {
    const skins = new Set(Array.from({ length: 50 }, (_, s) => randomiseLook(START, [], seededRandom(s)).face.skinTone));
    expect(skins.size).toBeGreaterThan(5);
  });
  it('a locked section comes back exactly as it went in', () => {
    const cur = { face: { ...defaultFace(), sliders: { faceLong: 0.4 } }, doc: { ...emptyCreatorDoc(), colours: { jersey: '#123456' } } };
    for (let seed = 0; seed < 50; seed++) {
      const all = randomiseLook(cur, RANDOM_SECTIONS, seededRandom(seed));
      expect(all).toEqual(cur);
      const r = randomiseLook(cur, ['hair', 'colours'], seededRandom(seed));
      expect([r.face.hairStyle, r.face.hairColor]).toEqual([cur.face.hairStyle, cur.face.hairColor]);
      expect(r.doc).toEqual(cur.doc);
      expect(r.face.sliders).toEqual({ faceLong: 0.4 });   // sculpt is never rolled
    }
    const skinLocked = Array.from({ length: 30 }, (_, s) => randomiseLook(START, ['skin'], seededRandom(s)).face.skinTone);
    expect(new Set(skinLocked)).toEqual(new Set([START.face.skinTone]));
  });
  it('keeps the rest of the doc when it rolls colours', () => {
    const doc = sanitizeCreatorDoc({ v: 1, parts: [{ id: 'a', shape: 'horn', bone: 'Head', colour: '#fff' }] })!;
    const r = randomiseLook({ face: defaultFace(), doc }, [], seededRandom(3));
    expect(r.doc!.parts).toEqual(doc.parts);
    expect(Object.keys(r.doc!.colours).sort()).toEqual(['accent', 'jersey', 'shoes', 'shorts']);
  });
  it('kit colourways are valid hexes, and the shorts sit darker than the jersey', () => {
    for (let s = 0; s < 100; s++) {
      const c = rollKitColours(seededRandom(s));
      for (const v of Object.values(c)) expect(v).toMatch(/^#[0-9A-F]{6}$/);
      const lum = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).reduce((a, b) => Math.max(a, b));
      expect(lum(c.shorts)).toBeLessThan(lum(c.jersey));
    }
  });
});
