// Where the CreatorDoc is stored (AvatarLook.face.creator / creatorSlots) and the palette it feeds
// (IMPROVE (2026-10-06), CREATOR-PLAN phase 1; research item 1).
import { describe, expect, it } from 'vitest';
import { faceOnly, holdCreator, needsPreviousFace, readCreatorDoc } from './storage';
import { effectivePalette } from './palette';
import { paletteOverrides } from './buildPalette';
import { decideLookHold } from '../lookPrivacy';
import { toBuild } from '../schema/saveBuild';
import { defaultFace } from '../../closet/wearable-catalog';

const ADULT = decideLookHold(true, false, false);
const ADULT_NUMBERS = decideLookHold(true, true, false);
const MINOR = decideLookHold(false, true, true);
const DOC = { v: 1, colours: { jersey: '#ff0000' }, shape: { face: { faceLong: 0.5 }, body: { legs: 1.05 } } };
const OLD = { v: 1, colours: { shoes: '#00ff00' } };

describe('holdCreator', () => {
  it('a minor stores nothing — not the posted doc, not a stored one', () => {
    expect(holdCreator({ creator: DOC, creatorSlots: [{ label: 'a', doc: DOC }] }, { creator: OLD }, MINOR)).toEqual({});
  });
  it('an adult stores the sanitised doc; shape numbers only with the numbers opt-in', () => {
    expect(holdCreator({ creator: DOC }, null, ADULT)).toEqual({ creator: { v: 1, parts: [], paint: [], colours: { jersey: '#FF0000' }, shape: { face: {}, body: {} }, flags: { suit: false } } });
    expect(holdCreator({ creator: DOC }, null, ADULT_NUMBERS).creator!.shape).toEqual({ face: { faceLong: 0.5 }, body: { legs: 1.05 } });
  });
  it('a request that leaves the doc out keeps the stored one (the Athlete Creator never wipes it)', () => {
    expect(holdCreator({ hairStyle: 'Afro' }, { creator: OLD, creatorSlots: [{ label: 'one', doc: OLD }] }, ADULT)).toEqual({
      creator: expect.objectContaining({ colours: { shoes: '#00FF00' } }),
      // phase 4a: a v1 slot is upgraded to a whole character (id, body, base from the face it was stored beside)
      creatorSlots: [{ id: 's1', label: 'ONE', body: 'male', base: {}, doc: expect.objectContaining({ colours: { shoes: '#00FF00' } }) }],
    });
    expect(holdCreator(undefined, { creator: OLD }, ADULT).creator!.colours).toEqual({ shoes: '#00FF00' });
  });
  it('a request that names it wins: null or an empty / invalid doc clears it', () => {
    expect(holdCreator({ creator: null }, { creator: OLD }, ADULT)).toEqual({});
    expect(holdCreator({ creator: { v: 1 } }, { creator: OLD }, ADULT)).toEqual({});
    expect(holdCreator({ creator: { v: 99 } }, { creator: OLD }, ADULT)).toEqual({});
    expect(holdCreator({ creatorSlots: [] }, { creatorSlots: [{ label: 'a', doc: OLD }] }, ADULT).creatorSlots).toBeUndefined();
  });
  it('slots lose their shape numbers without the opt-in too', () => {
    const r = holdCreator({ creatorSlots: [{ label: 'a', doc: DOC }] }, null, ADULT);
    expect(r.creatorSlots![0].doc.shape).toEqual({ face: {}, body: {} });
  });
  it('needsPreviousFace only when a creator field is missing from the request', () => {
    // phase 4a: the active-slot pointer is a creator field too
    expect(needsPreviousFace({ creator: null, creatorSlots: null, activeSlot: null })).toBe(false);
    expect(needsPreviousFace({ creator: null, creatorSlots: null })).toBe(true);
    expect(needsPreviousFace({ creator: DOC })).toBe(true);
    expect(needsPreviousFace(undefined)).toBe(true);
  });
});

describe('reading a stored face', () => {
  it('readCreatorDoc sanitises; faceOnly strips the creator fields', () => {
    const face = { ...defaultFace(), creator: { ...DOC, junk: 1 }, creatorSlots: [] };
    expect(readCreatorDoc(face)!.colours).toEqual({ jersey: '#FF0000' });
    expect(readCreatorDoc(defaultFace())).toBeNull();
    expect(readCreatorDoc(null)).toBeNull();
    expect(faceOnly(face)).toEqual(defaultFace());
  });
});

describe('the palette a body wears', () => {
  const derived = { jersey: '#A855F7', shorts: '#00E5FF', shoes: '#A855F7', accent: '#FFD700' };
  it('later layers win per slot; invalid hexes never apply', () => {
    expect(effectivePalette(derived, { jersey: '#111111', shoes: 'nope' }, { jersey: '#222222', accent: '#abc' }))
      .toEqual({ jersey: '#222222', shorts: '#00E5FF', shoes: '#A855F7', accent: '#AABBCC' });
    expect(effectivePalette(derived, null, undefined)).toEqual(derived);
  });
  it('AthleteBuild.palette: only rows moved off their default are overrides', () => {
    const untouched = toBuild({}).palette;
    expect(paletteOverrides(untouched)).toEqual({});
    expect(paletteOverrides({ ...untouched, paletteJersey: '#ff3366', paletteAccent: untouched.paletteAccent.toLowerCase() }))
      .toEqual({ jersey: '#FF3366' });
    expect(paletteOverrides({ paletteShoes: '#123456', paletteShorts: 'red', junk: '#000000' })).toEqual({ shoes: '#123456' });
    expect(paletteOverrides(null)).toEqual({});
    expect(paletteOverrides(['#fff'])).toEqual({});
  });
});
