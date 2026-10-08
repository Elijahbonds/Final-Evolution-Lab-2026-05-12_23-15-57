// CREATOR-PLAN phase 4d: fearless — the history strip's labels and jumps, a big change, keeping a copy (5-slot cap).
import { describe, expect, it } from 'vitest';
import { canRedo, createHistory, pushHistory } from '../history';
import { blankSlot } from '../slots';
import { newPart } from '../parts';
import { newLayer } from '../paint';
import { MAX_SLOTS, type CreatorSlotV2 } from '../doc';
import { BIG_CHANGE, changeSize, describeStep, isBigChange, jumpHistory, keepCopy, stripEntries, visibleEntries } from './historyStrip';
import { randomiseLook } from '../randomise';
import { faceOnly } from '../storage';
import { slotFace, withFace } from '../slots';

const S0 = blankSlot({ id: 's1', label: 'HERO', body: 'male' });
const withDoc = (s: CreatorSlotV2, fn: (d: CreatorSlotV2['doc']) => CreatorSlotV2['doc']): CreatorSlotV2 => ({ ...s, doc: fn(s.doc) });
const addHorn = (s: CreatorSlotV2) => withDoc(s, (d) => ({ ...d, parts: [...d.parts, newPart(d.parts, 'horn', '#FF0000')!] }));

describe('what each step is called', () => {
  it('parts: added, moved, turned, resized, recoloured, removed', () => {
    const a = addHorn(S0);
    expect(describeStep(S0, a)).toBe('Added a horn');
    const p = a.doc.parts[0];
    const move = (patch: object) => withDoc(a, (d) => ({ ...d, parts: [{ ...p, ...patch }] }));
    expect(describeStep(a, move({ pos: [0, 0.3, 0] }))).toBe('Moved horn');
    expect(describeStep(a, move({ bone: 'Spine2' }))).toBe('Moved horn');
    expect(describeStep(a, move({ rot: [0, 45, 0] }))).toBe('Turned horn');
    expect(describeStep(a, move({ scale: [2, 2, 2] }))).toBe('Resized horn');
    expect(describeStep(a, move({ colour: '#00FF00' }))).toBe('Recoloured horn');
    expect(describeStep(a, S0)).toBe('Removed a horn');
  });
  it('phase 4e: clothes put on, recoloured, changed, layered, taken off — and each counts towards a big change', () => {
    const on = (clothes: NonNullable<CreatorSlotV2['doc']['clothes']>) => withDoc(S0, (d) => ({ ...d, clothes }));
    const hoodie = { id: 'c1', kind: 'top' as const, style: 'hoodie' as const, colour: '#111111' };
    const pants = { id: 'c2', kind: 'bottom' as const, style: 'pants' as const, colour: '#222222' };
    const a = on([hoodie]);
    expect(describeStep(S0, a)).toBe('Put on hoodie');
    expect(describeStep(a, on([{ ...hoodie, colour: '#FF0000' }]))).toBe('Recoloured hoodie');
    expect(describeStep(a, on([{ ...hoodie, sleeve: 'short' }]))).toBe('Changed hoodie');
    const b = on([hoodie, pants]);
    expect(describeStep(b, on([pants, hoodie]))).toBe('Clothing: layers');
    expect(describeStep(a, S0)).toBe('Took off hoodie');
    expect(changeSize(S0, on([hoodie, pants]))).toBe(2);
  });
  it('paint, the base look, the body, suit mode', () => {
    const l = newLayer([], 'stamp', ['#FF0000'])!;
    const b = withDoc(S0, (d) => ({ ...d, paint: [l] }));
    expect(describeStep(S0, b)).toMatch(/^Paint: new /);
    expect(describeStep(b, withDoc(b, (d) => ({ ...d, paint: [{ ...l, at: { ...l.at, x: 0.2 } }] })))).toMatch(/^Paint: placed /);
    expect(describeStep(S0, { ...S0, base: { ...S0.base, skinTone: '#123456' } })).toBe('Skin colour');
    expect(describeStep(S0, { ...S0, body: 'female' })).toBe('Body');
    expect(describeStep(S0, withDoc(S0, (d) => ({ ...d, flags: { ...d.flags, suit: true } })))).toBe('Suit on');
    expect(describeStep(S0, { ...S0, presentation: { scale: 1.2 } })).toBe('Studio size');
  });
});

describe('the strip', () => {
  it('lists start, past, present and future, and jumps to any of them', () => {
    let h = createHistory(S0);
    h = pushHistory(h, addHorn(h.present));
    h = pushHistory(h, addHorn(h.present));
    h = pushHistory(h, { ...h.present, base: { ...h.present.base, hairColor: '#FF00FF' } });
    const e = stripEntries(h);
    expect(e.map((x) => x.label)).toEqual(['Start', 'Added a horn', 'Added a horn', 'Hair colour']);
    expect(e.map((x) => x.offset)).toEqual([-3, -2, -1, 0]);
    expect(e[3].current).toBe(true);
    const back = jumpHistory(h, -2);
    expect(back.present.doc.parts.length).toBe(1);
    expect(canRedo(back)).toBe(true);
    expect(stripEntries(back).map((x) => x.offset)).toEqual([-1, 0, 1, 2]);   // the future is still there
    expect(jumpHistory(back, 2).present).toEqual(h.present);
    expect(jumpHistory(h, -99).present).toEqual(S0);   // past the start stops there
    expect(jumpHistory(h, 0)).toBe(h);
  });
  it('a long history shows a window round the present', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ offset: i - 60, label: `${i}`, current: i === 60 }));
    const v = visibleEntries(many, 40);
    expect(v.length).toBe(40);
    expect(v.some((x) => x.current)).toBe(true);
    expect(visibleEntries(many.slice(0, 10), 40).length).toBe(10);
  });
});

describe('a big change and keeping a copy', () => {
  it('one stamp is small; a randomise or five spikes is big', () => {
    const l = newLayer([], 'stamp', ['#FF0000'])!;
    expect(isBigChange(S0, withDoc(S0, (d) => ({ ...d, paint: [l] })))).toBe(false);
    let five = S0; for (let i = 0; i < BIG_CHANGE; i++) five = addHorn(five);
    expect(changeSize(S0, five)).toBeGreaterThanOrEqual(BIG_CHANGE);
    expect(isBigChange(S0, five)).toBe(true);
    const f = slotFace(S0);
    const r = randomiseLook({ face: faceOnly(f) as never, doc: f.creator }, []);
    const rolled = withFace(S0, { ...f, ...r.face, ...(r.doc ? { creator: r.doc } : {}) } as never);
    expect(isBigChange(S0, rolled)).toBe(true);
    expect(isBigChange(S0, { ...S0, body: 'female' })).toBe(false);   // a body alone is 3
  });
  it('keeps the old look as a new slot, a deep copy with a fresh id — refused at five', () => {
    const big = addHorn(S0);
    const r = keepCopy([big], S0);
    if ('full' in r) throw new Error('refused');
    expect(r.slots.length).toBe(2);
    const copy = r.slots.find((s) => s.id === r.id)!;
    expect(copy.id).not.toBe('s1');
    expect(copy.label).toBe('COPY 1');
    expect(copy.doc).toEqual(S0.doc);
    expect(copy.doc).not.toBe(S0.doc);
    const five = Array.from({ length: MAX_SLOTS }, (_, i) => ({ ...S0, id: `s${i + 1}` }));
    expect(keepCopy(five, S0)).toEqual({ full: true });
  });
});
