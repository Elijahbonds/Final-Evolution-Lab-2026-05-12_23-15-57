// SLOTS v2 (IMPROVE (2026-10-06), CREATOR-PLAN phase 4a): a slot is a whole character, the active one is worn
// everywhere, five at most (owner, 2026-10-06), and v1 slots still load.
import { describe, expect, it } from 'vitest';
import { MAX_SLOTS, MAX_SLOT_CHARS, emptyCreatorDoc, hiddenParts, type CreatorSlotV2 } from './doc';
import { sanitizeCreatorSlot, sanitizeCreatorSlots, sanitizeEyes, sanitizeSlotEquipped, sanitizeSlotFrame, sanitizeCreatorDoc } from './sanitize';
import {
  TEEN_DEVICE_LOOK_EVERYWHERE, activeLook, activeSlotId, addSlot, blankSlot, duplicateSlot, ensureSlots, heroBodyForSlot,
  materialisedFields, mergeDeviceNumbers, newSlotId, newSlotLabel, removeSlot, renameSlot, slotBodyOf, slotFace,
  slotFromFace, slotSummaries, spawnFace, switchActive, withFace,
} from './slots';
import { defaultFace } from '../../closet/wearable-catalog';

const DOC = { v: 1, colours: { jersey: '#ff0000' } };
const slot = (id: string, over: Partial<CreatorSlotV2> = {}): CreatorSlotV2 => ({
  id, label: id.toUpperCase(), body: 'male', base: { skinTone: '#8D5524', hairStyle: 'Afro' }, doc: { ...emptyCreatorDoc(), colours: { jersey: '#FF0000' } }, ...over,
});

describe('sanitising slots: v1 → v2', () => {
  it('a v1 slot ({label, doc}) becomes a whole character: an id, the fallback body, the base and sliders of the face it was stored beside', () => {
    const face = { ...defaultFace(), skinTone: '#5A351A', hairStyle: 'Locs', sliders: { faceLong: 0.4 } };
    const [s] = sanitizeCreatorSlots([{ label: 'old one', doc: DOC }], { face, body: 'female' });
    expect(s).toEqual({
      id: 's1', label: 'OLD ONE', body: 'female',
      base: expect.objectContaining({ skinTone: '#5A351A', hairStyle: 'Locs' }),
      sliders: { faceLong: 0.4 },
      doc: expect.objectContaining({ colours: { jersey: '#FF0000' } }),
    });
  });
  it('a v2 slot keeps its own fields, each through its allow-list (no names, no unknown fields)', () => {
    // test changed (2026-10-07, the hair expansion): 'Mohawk' became a catalog style, so the off-list name is another one
    const s = sanitizeCreatorSlot({
      id: 'ab12', label: 'gojo!!', body: 'scan', base: { skinTone: '#abc', hairStyle: 'Liberty Spikes', eyeColor: '#7fd8ff', name: 'Real Name' },
      sliders: { faceLong: 2, 'no-pe': 1 }, frame: { heightScale: 3, buildScale: 0.5 },
      equipped: { tops: 'top_lab', shoes: 'not_an_item', shorts: null, wallet: 'x' }, doc: DOC, email: 'a@b.c',
    })!;
    expect(s).toEqual({
      id: 'ab12', label: 'GOJO', body: 'scan', base: { skinTone: '#AABBCC', eyeColor: '#7FD8FF' },
      sliders: { faceLong: 1 }, frame: { heightScale: 1.04, buildScale: 0.94 }, equipped: { tops: 'top_lab', shorts: null },
      doc: expect.any(Object),
    });
    expect(JSON.stringify(s)).not.toMatch(/Real Name|a@b|wallet|Liberty Spikes/);
  });
  it('at most MAX_SLOTS (5, owner 2026-10-06), ids unique (a duplicate or a missing id gets the next free sN)', () => {
    expect(MAX_SLOTS).toBe(5);
    const list = sanitizeCreatorSlots([{ id: 's2', label: 'a', doc: DOC }, { id: 's2', label: 'b', doc: DOC }, { label: 'c', doc: DOC }, ...Array(9).fill({ label: 'x', doc: DOC })]);
    expect(list).toHaveLength(5);
    expect(new Set(list.map((s) => s.id)).size).toBe(5);
    expect(list[0].id).toBe('s2');
  });
  it('a slot whose doc does not sanitise is dropped, and so is one over MAX_SLOT_CHARS', () => {
    expect(sanitizeCreatorSlot({ label: 'x', doc: { v: 9 } })).toBeNull();
    expect(sanitizeCreatorSlot('junk')).toBeNull();
    expect(MAX_SLOT_CHARS).toBeGreaterThan(24_000);
  });
  it('frame numbers clamp to the cosmetic range (never past a play clamp)', () => {
    expect(sanitizeSlotFrame({ heightScale: 0.5, buildScale: 2 })).toEqual({ heightScale: 0.96, buildScale: 1.08 });
    expect(sanitizeSlotFrame({ heightScale: 'tall' })).toBeUndefined();
    expect(sanitizeSlotFrame(null)).toBeUndefined();
  });
  it('worn items: only a known item for its own wearable slot, or null', () => {
    expect(sanitizeSlotEquipped({ tops: 'shorts_court', shorts: 'shorts_court', headwear: null })).toEqual({ shorts: 'shorts_court', headwear: null });
    expect(sanitizeSlotEquipped('x')).toBeUndefined();
  });
});

describe('the eyes block and hide flags (phase 4a, additive)', () => {
  it('a phase 1–3 doc sanitises to exactly what it was (no eyes, no hide)', () => {
    expect(sanitizeCreatorDoc(DOC)).toEqual({ ...emptyCreatorDoc(), colours: { jersey: '#FF0000' } });
  });
  it('eyes keep only what differs from the defaults, clamped', () => {
    expect(sanitizeEyes({ sclera: '#f2eee8', size: 1, pupil: 'round', glow: 0 })).toBeUndefined();
    expect(sanitizeEyes({ sclera: '#000', size: 9, pupil: 'slit', pupilSize: 0, glow: 0.5, laser: true })).toEqual({ sclera: '#000000', size: 1.6, pupil: 'slit', pupilSize: 0.1, glow: 0.5 });
    expect(sanitizeEyes({ pupil: 'star' })).toBeUndefined();
  });
  it('hide keeps only true flags; head takes the ears, eyes and hair with it', () => {
    const d = sanitizeCreatorDoc({ v: 1, flags: { suit: true, hide: { eyes: true, ears: 'yes', nose: true } } })!;
    expect(d.flags).toEqual({ suit: true, hide: { eyes: true } });
    expect(hiddenParts(d)).toEqual({ head: false, ears: false, eyes: true, hair: false });
    expect(hiddenParts(sanitizeCreatorDoc({ v: 1, flags: { hide: { head: true } } }))).toEqual({ head: true, ears: true, eyes: true, hair: true });
    expect(hiddenParts(null)).toEqual({ head: false, ears: false, eyes: false, hair: false });
  });
});

describe('activeLook: what the player looks like', () => {
  it('a face with an active slot is that slot\'s character: face, sliders, doc, body, frame, worn items', () => {
    const face = { ...defaultFace(), skinTone: '#FBE7D3', creator: { v: 1, colours: { shoes: '#00FF00' } },
      creatorSlots: [slot('s1'), slot('s2', { body: 'female', base: { skinTone: '#33AA33', eyeColor: '#7FD8FF' }, sliders: { faceRound: 0.5 }, frame: { heightScale: 1.02, buildScale: 1 }, equipped: { tops: 'top_lab' } })],
      activeSlot: 's2' };
    const l = activeLook(face);
    expect(l.slot?.id).toBe('s2');
    expect(l.face.skinTone).toBe('#33AA33');
    expect(l.face.eyeColor).toBe('#7FD8FF');
    expect(l.face.hairStyle).toBe(defaultFace().hairStyle);   // a base field the slot leaves out is the catalog default
    expect(l.face.sliders).toEqual({ faceRound: 0.5 });
    expect(l.doc?.colours).toEqual({ jersey: '#FF0000' });
    expect(l.body).toBe('female');
    expect(l.frame).toEqual({ heightScale: 1.02, buildScale: 1 });
    expect(l.equipped).toEqual({ tops: 'top_lab' });
  });
  it('falls back to the top-level face (a look saved before slots; a pointer at no slot; no pointer)', () => {
    const top = { ...defaultFace(), skinTone: '#FBE7D3', creator: { v: 1, colours: { shoes: '#00FF00' } } };
    for (const f of [top, { ...top, creatorSlots: [slot('s1')], activeSlot: 'zz' }, { ...top, creatorSlots: [slot('s1')] }]) {
      const l = activeLook(f);
      expect(l.slot).toBeNull();
      expect(l.body).toBeNull();
      expect(l.face.skinTone).toBe('#FBE7D3');
      expect(l.doc?.colours).toEqual({ shoes: '#00FF00' });
    }
    expect(activeLook(null).face).toEqual(defaultFace());
  });
  it('an active slot with an empty doc wears no doc', () => {
    expect(activeLook({ creatorSlots: [slot('s1', { doc: emptyCreatorDoc() })], activeSlot: 's1' }).doc).toBeNull();
  });
});

describe('the slot bar\'s operations', () => {
  const five = ['s1', 's2', 's3', 's4', 's5'].map((id) => slot(id));
  it('add refuses past five; a clashing id is made unique', () => {
    expect(addSlot(five, slot('s6'))).toBe(five);
    const two = addSlot([slot('s1')], slot('s1'));
    expect(two.map((s) => s.id)).toEqual(['s1', 's2']);
  });
  it('duplicate is a deep copy right after the original, labelled a copy; refused at five', () => {
    const list = [slot('s1'), slot('s2')];
    const d = duplicateSlot(list, 's1');
    expect(d.map((s) => s.id)).toEqual(['s1', 's3', 's2']);
    expect(d[1].label).toBe('S1 COPY');
    d[1].doc.colours.jersey = '#000000';
    expect(list[0].doc.colours.jersey).toBe('#FF0000');
    expect(duplicateSlot(five, 's1')).toBe(five);
  });
  it('rename goes through the jersey name rule; an empty name keeps the old one', () => {
    expect(renameSlot([slot('s1')], 's1', 'shadow <x> the hedgehog')[0].label).toMatch(/^SHADOW X T[A-Z ]*$/);
    expect(renameSlot([slot('s1')], 's1', 'shadow <x> the hedgehog')[0].label.length).toBeLessThanOrEqual(12);
    expect(renameSlot([slot('s1')], 's1', '<<>>')[0].label).toBe('S1');
  });
  it('delete moves the active pointer to the neighbour; the last character cannot go', () => {
    expect(removeSlot([slot('s1'), slot('s2'), slot('s3')], 's2', 's2')).toEqual({ slots: [slot('s1'), slot('s3')], active: 's3' });
    expect(removeSlot([slot('s1'), slot('s2')], 's2', 's1').active).toBe('s1');
    const one = [slot('s1')];
    expect(removeSlot(one, 's1', 's1').slots).toBe(one);
  });
  it('new ids and labels are the first free ones', () => {
    expect(newSlotId([slot('s1'), slot('s3')])).toBe('s2');
    expect(newSlotLabel([{ label: 'LOOK 1' }, { label: 'LOOK 2' }])).toBe('LOOK 3');
    expect(blankSlot({ id: 's9', label: 'x', body: 'female' })).toEqual({ id: 's9', label: 'X', body: 'female', base: expect.objectContaining({ skinTone: defaultFace().skinTone }), doc: emptyCreatorDoc() });
  });
  it('slotFace / withFace round-trip, and an edit that no longer sanitises is refused (never a wipe)', () => {
    const s = slot('s1', { sliders: { faceLong: 0.2 } });
    const once = withFace(s, slotFace(s));
    expect(slotFace(once)).toEqual(slotFace(s));          // the same character
    expect(withFace(once, slotFace(once))).toEqual(once);  // and a fixed point
    const tooBig = { ...slotFace(s), creator: { ...s.doc, v: 2 } } as never;
    expect(withFace(s, tooBig).doc).toBe(s.doc);
    expect(withFace(s, { ...slotFace(s), creator: null }).doc).toEqual(emptyCreatorDoc());
  });
  it('ensureSlots: a look saved before slots opens as one slot made from it, playing the body it played', () => {
    const r = ensureSlots({ ...defaultFace(), hairStyle: 'Locs', creator: DOC }, 'scan', { tops: 'top_lab' });
    expect(r.active).toBe('s1');
    expect(r.slots).toEqual([expect.objectContaining({ id: 's1', label: 'LOOK 1', body: 'scan', equipped: { tops: 'top_lab' } })]);
    expect(r.slots[0].base.hairStyle).toBe('Locs');
    const stored = { creatorSlots: [slot('s1'), slot('s2')], activeSlot: 's2' };
    expect(ensureSlots(stored, 'male').active).toBe('s2');
    expect(slotFromFace({}, { id: 'a', label: 'b', body: 'male', frame: { heightScale: 1, buildScale: 1 } }).frame).toEqual({ heightScale: 1, buildScale: 1 });
  });
});

describe('the server side of a face', () => {
  const face = { ...defaultFace(), creatorSlots: [slot('s1'), slot('s2', { base: { skinTone: '#123456' }, sliders: { jawOpen: 0.3 }, equipped: { tops: 'top_lab' } })], activeSlot: 's1' };
  it('materialisedFields: the slot\'s base, its doc as `creator`, sliders only when numbers may be stored', () => {
    const s2 = face.creatorSlots[1];
    expect(materialisedFields(s2, false)).toEqual({ skinTone: '#123456', creator: s2.doc });
    expect(materialisedFields(s2, true).sliders).toEqual({ jawOpen: 0.3 });
  });
  it('spawnFace keeps only the active slot (a mode dresses one body); a face without one loses its slots', () => {
    expect((spawnFace(face).creatorSlots as CreatorSlotV2[]).map((s) => s.id)).toEqual(['s1']);
    expect('creatorSlots' in spawnFace({ ...face, activeSlot: undefined })).toBe(false);
    expect(activeLook(spawnFace(face)).slot?.id).toBe('s1');
  });
  it('switchActive moves the pointer and re-materialises the top level; an unknown slot is null', () => {
    const r = switchActive(face, 's2', true)!;
    expect(r.face.activeSlot).toBe('s2');
    expect(r.face.skinTone).toBe('#123456');
    expect(r.face.sliders).toEqual({ jawOpen: 0.3 });
    expect(r.equipped).toEqual({ tops: 'top_lab' });
    expect(activeLook(r.face).slot?.id).toBe('s2');
    expect(switchActive(face, 'nope', true)).toBeNull();
    expect(switchActive('x', 's1', true)).toBeNull();
  });
  it('summaries carry id, label, body and colour chips — nothing else', () => {
    const [a] = slotSummaries(face);
    expect(Object.keys(a).sort()).toEqual(['body', 'chips', 'id', 'label']);
    expect(a.chips.skin).toBe('#8D5524');
    expect(activeSlotId(face)).toBe('s1');
  });
  it('mergeDeviceNumbers: per slot by id, the device\'s sliders, frame and doc.shape over the server\'s stripped copy', () => {
    const server = { creatorSlots: [slot('s1'), slot('s2')], activeSlot: 's1' };
    const device = { sliders: { faceLong: 0.6 }, creatorSlots: [slot('s2', { sliders: { browRaise: 0.4 }, frame: { heightScale: 1.03, buildScale: 1 }, doc: { ...emptyCreatorDoc(), shape: { face: { faceRound: 0.7 }, body: {} } } })] };
    const m = mergeDeviceNumbers(server, device);
    const s2 = (m.creatorSlots as CreatorSlotV2[]).find((s) => s.id === 's2')!;
    expect(s2.sliders).toEqual({ browRaise: 0.4 });
    expect(s2.frame).toEqual({ heightScale: 1.03, buildScale: 1 });
    expect(s2.doc.shape.face).toEqual({ faceRound: 0.7 });
    expect(s2.doc.colours).toEqual({ jersey: '#FF0000' });   // the rest is the server's
    expect((m.creatorSlots as CreatorSlotV2[])[0].sliders).toBeUndefined();
    expect(m.sliders).toEqual({ faceLong: 0.6 });
  });
});

describe('which body a slot plays in', () => {
  it('scan is honoured only when the server said this account owns one', () => {
    expect(heroBodyForSlot('scan', { scanOwned: true, fallback: 'kit-male' })).toBe('scan');
    expect(heroBodyForSlot('scan', { scanOwned: false, fallback: 'kit-male' })).toBe('kit-male');
    expect(heroBodyForSlot('scan', { scanOwned: false, fallback: 'kit-female' })).toBe('kit-female');
    expect(heroBodyForSlot('scan', { scanOwned: false, fallback: 'scan' })).toBe('kit-male');
    expect(heroBodyForSlot('female', { scanOwned: true, fallback: 'scan' })).toBe('kit-female');
    expect(heroBodyForSlot(null, { scanOwned: true, fallback: 'scan' })).toBe('scan');
    expect(slotBodyOf('kit-female')).toBe('female');
  });
  it('teens: the device look applies in every mode (owner decision 2026-10-06)', () => {
    expect(TEEN_DEVICE_LOOK_EVERYWHERE).toBe(true);
  });
});
