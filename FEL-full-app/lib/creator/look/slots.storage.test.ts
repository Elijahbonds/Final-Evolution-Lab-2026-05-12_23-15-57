// What a save may store of the slots (IMPROVE (2026-10-06), CREATOR-PLAN phase 4a): ownership-filtered worn items,
// numbers only with the opt-in, the active slot materialised, the Athlete Creator's edit on the active character, the
// whole-face cap; and the face colours are hexes only (free colour, tightened on the server).
import { describe, expect, it } from 'vitest';
import { activeEquipped, holdCreator } from './storage';
import { emptyCreatorDoc, type CreatorSlotV2 } from './doc';
import { holdFace, decideLookHold } from '../lookPrivacy';
import { defaultFace } from '../../closet/wearable-catalog';

const ADULT = { uploadFace: true, uploadNumbers: false };
const ADULT_NUMBERS = { uploadFace: true, uploadNumbers: true };
const MINOR = { uploadFace: false, uploadNumbers: false };
const OWNED = new Set(['band_flow']);
const slot = (id: string, over: Partial<CreatorSlotV2> = {}): CreatorSlotV2 => ({
  id, label: id.toUpperCase(), body: 'male', base: { skinTone: '#8D5524' },
  sliders: { faceLong: 0.4 }, frame: { heightScale: 1.03, buildScale: 1.05 },
  doc: { ...emptyCreatorDoc(), colours: { jersey: '#FF0000' }, shape: { face: { faceRound: 0.5 }, body: {} } }, ...over,
});

describe('holdCreator with slots', () => {
  it('a minor stores nothing of any slot', () => {
    expect(holdCreator({ creatorSlots: [slot('s1')], activeSlot: 's1' }, null, MINOR)).toEqual({});
  });
  it('without the numbers opt-in every slot loses its sliders, frame and doc.shape; with it they stay', () => {
    const r = holdCreator({ creatorSlots: [slot('s1'), slot('s2')], activeSlot: 's1' }, null, ADULT);
    for (const s of r.creatorSlots!) {
      expect(s.sliders).toBeUndefined();
      expect(s.frame).toBeUndefined();
      expect(s.doc.shape).toEqual({ face: {}, body: {} });
    }
    expect(r.sliders).toBeUndefined();
    const n = holdCreator({ creatorSlots: [slot('s1')], activeSlot: 's1' }, null, ADULT_NUMBERS);
    expect(n.creatorSlots![0].sliders).toEqual({ faceLong: 0.4 });
    expect(n.creatorSlots![0].frame).toEqual({ heightScale: 1.03, buildScale: 1.05 });
    expect(n.sliders).toEqual({ faceLong: 0.4 });   // materialised on the top level too
  });
  it('a slot cannot wear what the account does not own: worn items go through the shop\'s filter (free starters pass)', () => {
    const r = holdCreator({ creatorSlots: [slot('s1', { equipped: { headwear: 'band_flow', accessory: 'acc_sleeve', tops: 'top_lab' } })], activeSlot: 's1' }, null, ADULT, { owned: OWNED });
    expect(r.creatorSlots![0].equipped).toEqual({ headwear: 'band_flow', accessory: null, tops: 'top_lab' });
    expect(activeEquipped(r)).toEqual({ headwear: 'band_flow', accessory: null, tops: 'top_lab' });
  });
  it('with no inventory to check against, worn items are dropped, never trusted', () => {
    const r = holdCreator({ creatorSlots: [slot('s1', { equipped: { accessory: 'acc_sleeve' } })], activeSlot: 's1' }, null, ADULT);
    expect(r.creatorSlots![0].equipped).toBeUndefined();
    expect(activeEquipped(r)).toBeNull();
  });
  it('the active slot is materialised: the top level IS the character being played', () => {
    const r = holdCreator({ ...defaultFace(), skinTone: '#FBE7D3', creator: { v: 1, colours: { shoes: '#00FF00' } }, creatorSlots: [slot('s1'), slot('s2', { base: { skinTone: '#22CC44', hairStyle: 'Bald' } })], activeSlot: 's2' }, null, ADULT);
    expect(r.activeSlot).toBe('s2');
    expect(r.skinTone).toBe('#22CC44');
    expect(r.hairStyle).toBe('Bald');
    expect(r.creator?.colours).toEqual({ jersey: '#FF0000' });
  });
  it('a pointer at no slot is dropped (and the top level is the posted one)', () => {
    const r = holdCreator({ creator: { v: 1, colours: { shoes: '#00FF00' } }, creatorSlots: [slot('s1')], activeSlot: 'nope' }, null, ADULT);
    expect(r.activeSlot).toBeUndefined();
    expect(r.creator?.colours).toEqual({ shoes: '#00FF00' });
  });
  it('the Athlete Creator (slots left out) edits the ACTIVE character, and keeps the others', () => {
    const prev = { creatorSlots: [slot('s1'), slot('s2')], activeSlot: 's2' };
    const r = holdCreator(undefined, prev, ADULT, { owned: OWNED, fold: { face: { ...defaultFace(), skinTone: '#432818', hairStyle: 'Locs' }, equipped: { headwear: 'band_flow' } } });
    expect(r.creatorSlots!.map((s) => s.id)).toEqual(['s1', 's2']);
    const s2 = r.creatorSlots![1];
    expect(s2.base).toEqual(expect.objectContaining({ skinTone: '#432818', hairStyle: 'Locs' }));
    expect(s2.equipped).toEqual({ headwear: 'band_flow' });
    expect(r.creatorSlots![0].base).toEqual({ skinTone: '#8D5524' });
    expect(r.skinTone).toBe('#432818');
  });
  it('the whole creator part is capped: trailing slots go first, never the active one', () => {
    const big = (id: string) => slot(id, { doc: { ...emptyCreatorDoc(), parts: Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, shape: 'spike', bone: 'Head', pos: [0.1, 0.2, 0.3], rot: [10, 20, 30], scale: [1, 2, 3], colour: '#FFFFFF', finish: 'gloss', mirror: true })) } as never });
    const posted = { creatorSlots: [big('s1'), big('s2'), big('s3'), big('s4'), big('s5')], activeSlot: 's5' };
    const full = JSON.stringify(holdCreator(posted, null, ADULT)).length;
    const r = holdCreator(posted, null, ADULT, { maxChars: Math.floor(full * 0.7) });
    expect(r.creatorSlots!.length).toBeLessThan(5);
    expect(r.creatorSlots!.some((s) => s.id === 's5')).toBe(true);
    expect(r.creatorSlots![0].id).toBe('s1');   // trailing ones went
    expect(JSON.stringify(r).length).toBeLessThanOrEqual(Math.floor(full * 0.7));
  });
});

describe('free colour: the face\'s colours are hexes, and only hexes (holdFace)', () => {
  const hold = decideLookHold(true, false, false);
  it('any hex is kept (normalised), anything else falls back to the catalog default', () => {
    const f = holdFace({ ...defaultFace(), skinTone: '#3a7', hairColor: '#F4F6FA', eyeColor: 'blue; drop table' }, hold);
    expect(f.skinTone).toBe('#33AA77');
    expect(f.hairColor).toBe('#F4F6FA');
    expect(f.eyeColor).toBe(defaultFace().eyeColor);
    expect(holdFace({ ...defaultFace(), skinTone: 'javascript:alert(1)' }, hold).skinTone).toBe(defaultFace().skinTone);
  });
});
