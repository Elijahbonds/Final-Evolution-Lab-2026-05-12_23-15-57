// The hair expansion's pure half (2026-10-07): the catalogue, the extras' sanitiser, resolve, the editor's operations, what
// covers the hair, and the randomiser's use of the new styles.
import { describe, expect, it } from 'vitest';
import { HAIR_STYLES, defaultFace } from '../../closet/wearable-catalog';
import { BEARD_STYLES, HAIR_ACCS, MAX_HAIR_ACCS, emptyCreatorDoc, isEmptyCreatorDoc, type CreatorDoc } from './doc';
import { sanitizeCreatorDoc, sanitizeHairExtras, sanitizeLookBase } from './sanitize';
import {
  COVERING_STYLES, HAIR_ACC_FIT, HAIR_PACKS, HAIR_STYLE_BLURB, HAIR_SWAY, NOT_ROLLED_HAIR, accFits, hairCover, knownStyle, packOf,
  randomHairExtras, resolveHair, toggleAcc, withHairExtras,
} from './hair';
import { randomiseLook, seededRandom } from './randomise';
import { decodeShareCode, encodeShareCode } from './shareCode';

const ORIGINAL_15 = ['Afro', 'Box Braids', 'Locs', 'Cornrows', 'Fade', 'Waves', 'Curly', 'Straight', 'Wavy', 'Buzz', 'Cropped', 'Bun', 'Ponytail', 'Bald', 'Hijab'];

describe('the hair catalogue', () => {
  it('keeps every name a saved look may carry, in its old place (append only)', () => {
    expect(HAIR_STYLES.slice(0, 15)).toEqual(ORIGINAL_15);
    for (const s of ORIGINAL_15) expect(sanitizeLookBase({ hairStyle: s }).hairStyle).toBe(s);
  });
  it('puts every style in exactly one of the four packs, and every pack style is a catalogue name', () => {
    expect(HAIR_PACKS.map((p) => p.id)).toEqual(['textured', 'cuts', 'long', 'flair']);
    const all = HAIR_PACKS.flatMap((p) => [...p.styles]);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual([...HAIR_STYLES].sort());
    for (const s of HAIR_STYLES) { expect(packOf(s)).not.toBeNull(); expect(HAIR_STYLE_BLURB[s], s).toBeTruthy(); }
  });
  it('has the owner\'s four packs\' styles', () => {
    const pack = (id: string) => HAIR_PACKS.find((p) => p.id === id)!.styles as readonly string[];
    expect(pack('textured')).toEqual(expect.arrayContaining(['Locs', 'Cornrows', 'Box Braids', 'Twists', 'Bantu Knots', 'Afro Puffs', 'Durag', 'Headwrap', 'Hijab']));
    expect(pack('cuts')).toEqual(expect.arrayContaining(['Fade', 'Buzz', 'Cropped', 'Waves', 'High-Top Fade', 'Taper', 'Drop Fade', 'Mohawk', 'Frohawk']));
    expect(pack('long')).toEqual(expect.arrayContaining(['Curly', 'Straight', 'Wavy', 'Long Layered', 'Bob', 'Top Knot', 'Space Buns', 'Pigtails', 'Braided Ponytail']));
    expect(pack('flair')).toEqual(expect.arrayContaining(['Spiky', 'Swept', 'Mullet', 'Streaks']));
  });
  it('an unknown name falls back to a known style (an older client never sees a bald head)', () => {
    expect(knownStyle('Mystery Cut')).toBe('Straight');
    expect(knownStyle(undefined)).toBe('Straight');
    expect(knownStyle('Locs')).toBe('Locs');
  });
  it('accessories fit only where they belong; coverings take none', () => {
    for (const s of COVERING_STYLES) for (const a of HAIR_ACCS) expect(accFits(a, s), `${a} on ${s}`).toBe(false);
    expect(accFits('beads', 'Box Braids')).toBe(true);
    expect(accFits('beads', 'Buzz')).toBe(false);
    expect(accFits('ties', 'Afro Puffs')).toBe(true);
    expect(accFits('clips', 'Fade')).toBe(false);
    for (const list of Object.values(HAIR_ACC_FIT)) for (const s of list) expect(HAIR_STYLES).toContain(s);
  });
  it('sways the hanging styles and nothing short', () => {
    for (const s of ['Locs', 'Box Braids', 'Ponytail', 'Afro Puffs', 'Pigtails', 'Braided Ponytail']) expect(HAIR_SWAY[s], s).toBeGreaterThan(0);
    for (const s of ['Buzz', 'Fade', 'Waves', 'Bald', 'Hijab']) expect(HAIR_SWAY[s] ?? 0, s).toBe(0);
  });
});

describe('the extras block (doc.hair)', () => {
  it('keeps only what means something, defaults left out', () => {
    expect(sanitizeHairExtras({})).toBeUndefined();
    expect(sanitizeHairExtras({ tone: 'top' })).toBeUndefined();                          // a tone without a colour
    expect(sanitizeHairExtras({ colour2: '#abc', tone: 'tips' })).toEqual({ colour2: '#AABBCC' });   // 'tips' is the default
    expect(sanitizeHairExtras({ colour2: '#abc', tone: 'under' })).toEqual({ colour2: '#AABBCC', tone: 'under' });
    expect(sanitizeHairExtras({ accColour: '#FF0000' })).toBeUndefined();                  // a colour without an accessory
    expect(sanitizeHairExtras({ acc: ['ties', 'beads', 'nope', 'beads'], accColour: '#D4AF37' })).toEqual({ acc: ['beads', 'ties'] });
    expect(sanitizeHairExtras({ beardColour: '#111111' })).toBeUndefined();
    expect(sanitizeHairExtras({ beard: 'goatee', beardColour: '#111' })).toEqual({ beard: 'goatee', beardColour: '#111111' });
    expect(sanitizeHairExtras({ beard: 'braided-sideburns', colour2: 'red' })).toBeUndefined();
  });
  it('caps the accessories', () => {
    expect(sanitizeHairExtras({ acc: [...HAIR_ACCS] })!.acc).toHaveLength(MAX_HAIR_ACCS);
  });
  it('round-trips through the doc sanitiser and a share code; an older doc is unchanged', () => {
    const doc: CreatorDoc = { ...emptyCreatorDoc(), hair: { colour2: '#FF3366', tone: 'streaks', acc: ['beads', 'cuffs'], accColour: '#C0C0C0', beard: 'full', beardColour: '#222222' } };
    const clean = sanitizeCreatorDoc(doc)!;
    expect(clean.hair).toEqual(doc.hair);
    expect(sanitizeCreatorDoc(JSON.parse(JSON.stringify(clean)))).toEqual(clean);
    const old = sanitizeCreatorDoc({ v: 1, parts: [], paint: [], colours: {}, shape: { face: {}, body: {} }, flags: { suit: false } })!;
    expect('hair' in old).toBe(false);
    expect(isEmptyCreatorDoc(old)).toBe(true);
    expect(isEmptyCreatorDoc(clean)).toBe(false);
  });
  it('rides a share code', async () => {
    const doc: CreatorDoc = { ...emptyCreatorDoc(), hair: { beard: 'mustache', acc: ['headband'] } };
    const r = await decodeShareCode(encodeShareCode(doc, { hairStyle: 'Space Buns' }));
    expect(r.ok && r.doc.hair).toEqual({ beard: 'mustache', acc: ['headband'] });
    expect(r.ok && r.base.hairStyle).toBe('Space Buns');
  });
  it('withHairExtras merges, clears with null, and drops an emptied block', () => {
    let d: CreatorDoc = emptyCreatorDoc();
    d = withHairExtras(d, { beard: 'stubble' });
    expect(d.hair).toEqual({ beard: 'stubble' });
    d = withHairExtras(d, { colour2: '#00E5FF', tone: 'top' });
    expect(d.hair).toEqual({ beard: 'stubble', colour2: '#00E5FF', tone: 'top' });
    d = withHairExtras(d, { colour2: null });
    expect(d.hair).toEqual({ beard: 'stubble' });
    d = withHairExtras(d, { beard: null });
    expect('hair' in d).toBe(false);
  });
  it('toggleAcc adds, removes and keeps the cap', () => {
    expect(toggleAcc(undefined, 'beads')).toEqual(['beads']);
    expect(toggleAcc(['beads'], 'beads')).toEqual([]);
    expect(toggleAcc(['beads', 'cuffs', 'clips'], 'ties')).toHaveLength(MAX_HAIR_ACCS);
    expect(toggleAcc(['beads', 'cuffs', 'clips'], 'ties')).toContain('ties');
  });
});

describe('resolveHair', () => {
  it('folds the face and the doc, and drops accessories the style does not take', () => {
    const r = resolveHair({ ...defaultFace(), hairStyle: 'Fade', hairColor: '#0B0B0B' }, { hair: { acc: ['beads', 'headband'], beard: 'short' } });
    expect(r).toMatchObject({ style: 'Fade', colour: '#0B0B0B', acc: ['headband'], beard: 'short', beardColour: '#0B0B0B', accColour: '#D4AF37' });
  });
  it('a hidden hair is bald but keeps the beard; a hidden head loses both', () => {
    expect(resolveHair({ hairStyle: 'Locs' }, { hair: { beard: 'full' } }, { hair: true })).toMatchObject({ style: 'Bald', beard: 'full' });
    expect(resolveHair({ hairStyle: 'Locs' }, { hair: { beard: 'full' } }, { head: true })).toMatchObject({ style: 'Bald', beard: null });
  });
});

describe('what covers the hair', () => {
  const hoodie = (hood: 'up' | 'down') => ({ ...emptyCreatorDoc(), clothes: [{ id: 'c1', kind: 'top' as const, style: 'hoodie' as const, colour: '#111111', hood }] });
  it('a raised hood or a head-sized helmet hides it; the hood down does not', () => {
    expect(hairCover(hoodie('up'))).toBe('hide');
    expect(hairCover(hoodie('down'))).toBe('none');
    const helmet = (s: number) => ({ ...emptyCreatorDoc(), parts: [{ id: 'p1', shape: 'helmet' as const, bone: 'Head' as const, pos: [0, 0, 0] as [number, number, number], rot: [0, 0, 0] as [number, number, number], scale: [s, s, s] as [number, number, number], colour: '#FFFFFF', finish: 'matte' as const, mirror: false }] });
    expect(hairCover(helmet(1))).toBe('hide');
    expect(hairCover(helmet(0.3))).toBe('none');
  });
  it('worn headwear presses it down', () => {
    expect(hairCover(null, { accessories: ['headband'] })).toBe('compress');
    expect(hairCover(null, { wornParts: [{ bone: 'Head' }] })).toBe('compress');
    expect(hairCover(null, { accessories: ['chain'] })).toBe('none');
  });
});

describe('the randomiser', () => {
  it('rolls the new styles too, never a covering a player chooses for themselves', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 600; seed++) seen.add(randomiseLook({ face: defaultFace(), doc: null }, [], seededRandom(seed)).face.hairStyle);
    for (const s of ['Twists', 'Bantu Knots', 'High-Top Fade', 'Space Buns', 'Mullet', 'Streaks']) expect(seen, s).toContain(s);
    for (const s of NOT_ROLLED_HAIR) expect(seen.has(s), s).toBe(false);
  });
  it('rolls beards, second colours and fitting accessories; a hair lock keeps them', () => {
    let beards = 0, seconds = 0, accs = 0;
    for (let seed = 1; seed < 400; seed++) {
      const r = randomiseLook({ face: defaultFace(), doc: null }, [], seededRandom(seed));
      const h = r.doc?.hair;
      if (h?.beard) { beards++; expect(BEARD_STYLES).toContain(h.beard); }
      if (h?.colour2) seconds++;
      if (h?.acc?.length) { accs++; for (const a of h.acc) expect(accFits(a, r.face.hairStyle), `${a} on ${r.face.hairStyle}`).toBe(true); }
    }
    expect(beards).toBeGreaterThan(80);
    expect(seconds).toBeGreaterThan(30);
    expect(accs).toBeGreaterThan(20);
    const cur = { face: defaultFace(), doc: { ...emptyCreatorDoc(), hair: { beard: 'goatee' as const } } };
    expect(randomiseLook(cur, ['hair'], seededRandom(3)).doc!.hair).toEqual({ beard: 'goatee' });
  });
  it('randomHairExtras is pure in its random source', () => {
    expect(randomHairExtras('Locs', '#000000', seededRandom(9))).toEqual(randomHairExtras('Locs', '#000000', seededRandom(9)));
  });
});
