// The Closet's SLOT BAR, the per-character controls and the start screen's "Play as" (IMPROVE (2026-10-06), CREATOR-PLAN
// phase 4a). No DOM in this runner (node environment): a server render is the real first paint, the switcher's choice
// of list is a pure function, and the Closet's / splash's wiring is read from source.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SlotBar } from './slot-bar';
import { BodyControls, ColourRow, EyeControls, HideControls } from './character-controls';
import { switcherSlots } from './play-as-switcher';
import { MAX_SLOTS, emptyCreatorDoc, type CreatorSlotV2 } from '@/lib/creator/look/doc';

const slot = (id: string, over: Partial<CreatorSlotV2> = {}): CreatorSlotV2 => ({ id, label: id.toUpperCase(), body: 'male', base: { skinTone: '#8D5524' }, doc: emptyCreatorDoc(), ...over });
const bar = (slots: CreatorSlotV2[], o: { selected?: string; active?: string; dirty?: boolean } = {}) => renderToStaticMarkup(createElement(SlotBar, {
  slots, selected: o.selected ?? slots[0].id, active: o.active ?? slots[0].id, dirty: o.dirty,
  onSelect: () => {}, onPlayAs: () => {}, onNew: () => {}, onDuplicate: () => {}, onRename: () => {}, onDelete: () => {},
  onPaste: async () => null, onShare: async () => '',
}));
const disabledBefore = (html: string, label: string) => new RegExp(`<button[^>]*disabled=""[^>]*>(<svg.*?</svg>)? ?${label}`).test(html);

describe('the slot bar', () => {
  it('shows every character with its label and body, which one is PLAYING, and Play as on the others', () => {
    const html = bar([slot('s1', { label: 'ME' }), slot('s2', { label: 'SORCERER', body: 'female' }), slot('s3', { body: 'scan' })], { active: 's2' });
    expect(html).toContain('3/5');
    for (const l of ['ME', 'SORCERER']) expect(html).toContain(`>${l}</span>`);
    expect(html).toContain('scan body');
    expect((html.match(/PLAYING/g) ?? []).length).toBe(1);
    expect((html.match(/>PLAY AS</g) ?? []).length).toBe(2);
    expect(html).toContain('aria-selected="true"');
  });
  it('at five characters, New, Duplicate and Paste are off (owner, 2026-10-06: "5 max slots")', () => {
    const five = Array.from({ length: MAX_SLOTS }, (_, i) => slot(`s${i + 1}`));
    const html = bar(five);
    for (const l of ['New', 'Duplicate', 'Paste code']) expect(disabledBefore(html, l), l).toBe(true);
    const two = bar([slot('s1'), slot('s2')]);
    for (const l of ['New', 'Duplicate', 'Paste code']) expect(disabledBefore(two, l), l).toBe(false);
  });
  it('the only character cannot be deleted; delete otherwise goes through an in-page confirm (source)', () => {
    expect(bar([slot('s1')])).toMatch(/aria-label="Delete S1"[^>]*disabled=""/);
    const src = readFileSync('components/closet/slot-bar.tsx', 'utf8');
    expect(src).toContain('role="alertdialog"');
    expect(src).toMatch(/onClick=\{\(\) => setConfirmDelete\(s\.id\)\}/);
    expect(src).not.toMatch(/window\.confirm|\bconfirm\(/);
    // rename runs through the jersey plate's name rule as you type
    expect(src).toMatch(/setDraft\(sanitizeStampText\(e\.target\.value\)\)/);
  });
  it('says when there are unsaved changes', () => {
    expect(bar([slot('s1')], { dirty: true })).toContain('unsaved changes');
    expect(bar([slot('s1')])).not.toContain('unsaved changes');
  });
});

describe('the per-character controls', () => {
  it('free colour: the swatches, plus any colour (a picker and a hex box)', () => {
    const html = renderToStaticMarkup(createElement(ColourRow, { label: 'Skin tone', swatches: ['#8D5524'], value: '#22CC44', onPick: () => {}, group: 'g' }));
    expect(html).toContain('aria-label="Skin tone: any colour"');
    expect(html).toContain('value="#22cc44"');
    expect(html).toContain('aria-label="Skin tone hex"');
  });
  it('the body offers the scan only to an account that owns one; height and build sit in the cosmetic range', () => {
    const plain = renderToStaticMarkup(createElement(BodyControls, { body: 'male', frame: null, scanOwned: false, numbersSaved: false, onBody: () => {}, onFrame: () => {} }));
    expect(plain).not.toContain('My scan');
    expect(plain).toContain('stay on this device');
    expect(plain).toMatch(/aria-label="Height"[^>]*min="0.96"[^>]*max="1.04"|min="0.96"[^>]*max="1.04"[^>]*aria-label="Height"/);
    const owner = renderToStaticMarkup(createElement(BodyControls, { body: 'scan', frame: null, scanOwned: true, numbersSaved: true, onBody: () => {}, onFrame: () => {} }));
    expect(owner).toContain('My scan');
    expect(owner).not.toContain('aria-label="Height"');   // the scan body is the scan: no height / build on it
  });
  it('eyes: whites, iris size, pupil shape and size, glow; hide: four toggles', () => {
    const eyes = renderToStaticMarkup(createElement(EyeControls, { eyes: { pupil: 'slit' }, onChange: () => {} }));
    for (const l of ['Iris size', 'Pupil size', 'Glow']) expect(eyes).toContain(`aria-label="${l}"`);
    expect(eyes).toMatch(/aria-pressed="true"[^>]*>Slit</);
    const hide = renderToStaticMarkup(createElement(HideControls, { hide: { ears: true }, onChange: () => {} }));
    expect(hide).toContain('Hidden: Ears');
    for (const l of ['Hide Eyes', 'Hide Whole head', 'Hide Hair']) expect(hide).toContain(l);
  });
});

describe('the start screen\'s "Play as"', () => {
  it('lists the server\'s characters for an adult, the device\'s for a device-only look (nothing to send)', () => {
    const server = { slots: [{ id: 's1', label: 'ME', body: 'male' as const, chips: { skin: '#000000', hair: '#000000', accent: '#000000' } }], activeSlot: 's1', lookLocal: false };
    expect(switcherSlots(server, null)).toEqual({ slots: server.slots, active: 's1', local: false });
    const device = { creatorSlots: [slot('s1'), slot('s2', { label: 'KID' })], activeSlot: 's2' };
    const r = switcherSlots({ slots: [], activeSlot: null, lookLocal: true }, device)!;
    expect(r.local).toBe(true);
    expect(r.active).toBe('s2');
    expect(r.slots.map((s) => s.label)).toEqual(['S1', 'KID']);
    expect(switcherSlots(null, device)).toBeNull();   // a guest / a failed read: nothing shown
  });
  it('is one additive mount on the splash, shown on the ready screen', () => {
    const src = readFileSync('components/games/boot-splash.tsx', 'utf8');
    expect(src).toContain("import { PlayAsSwitcher } from '@/components/closet/play-as-switcher'");
    expect(src).toContain("{props.phase === 'ready' && <PlayAsSwitcher tint={v.tint} />}");
  });
  it('the Closet mounts the slot bar and edits one character at a time (source)', () => {
    const src = readFileSync('components/closet-view.tsx', 'utf8');
    expect(src).toContain('<SlotBar ');
    expect(src).toMatch(/useState<History<CreatorSlotV2>>/);   // the history is one slot deep, not the whole face
    expect(src).toContain('body={heroBodyForSlot(slot.body');      // the preview wears the slot's body
  });
});
