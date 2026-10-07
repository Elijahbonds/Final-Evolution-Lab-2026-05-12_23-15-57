// The Studio's Clothing tab (IMPROVE (2026-10-06), CREATOR-PLAN phase 4e). No DOM in this runner (node environment), so
// as the other component tests here: a server render is the real first paint, and the Closet's wiring is read from source.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClothesTab, type ClothesTabProps } from './clothes-tab';
import { CLOTH_KINDS, CLOTH_STYLES, type CreatorCloth } from '@/lib/creator/look/doc';

const render = (clothes: CreatorCloth[], o: Partial<ClothesTabProps> = {}) => renderToStaticMarkup(createElement(ClothesTab, {
  clothes, onChange: () => {}, accent: '#00E5FF', locks: [], onLocks: () => {}, onRoll: () => {},
  canUndo: true, canRedo: false, onUndo: () => {}, onRedo: () => {}, ...o,
}));
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const tee: CreatorCloth = { id: 'c1', kind: 'top', style: 'tee', colour: '#CC0000' };
const pants: CreatorCloth = { id: 'c2', kind: 'bottom', style: 'pants', colour: '#222222', colour2: '#FFFFFF' };
const boots: CreatorCloth = { id: 'c3', kind: 'feet', style: 'boots', colour: '#333333', shaft: 'knee' };

describe('the Clothing tab', () => {
  it('offers every style of every kind to add, says it is free, and has a lock per kind', () => {
    const html = render([]);
    for (const k of CLOTH_KINDS) expect(count(html, new RegExp(`title="Add `, 'g'))).toBeGreaterThanOrEqual(CLOTH_STYLES[k].length);
    expect(count(html, /title="Add /g)).toBe(CLOTH_KINDS.reduce((n, k) => n + CLOTH_STYLES[k].length, 0));
    expect(html).toContain('free, built from your body');
    for (const l of ['Tops', 'Bottoms', 'Gloves', 'Footwear']) expect(html).toContain(`Lock ${l.toLowerCase()}`);
    expect(html).toContain('Randomise');
  });
  it('lists the worn pieces innermost first, with layer moves and take-off; the first is edited', () => {
    const html = render([pants, tee, boots], { selectedId: 'c2' });
    const order = ['Pants', 'Tee', 'Boots · knee'].map((l) => html.indexOf(`${l} <span`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(count(html, /aria-label="Wear further in"/g)).toBe(3);
    expect(html).toMatch(/aria-label="Wear further in" title="Wear further in" disabled=""/);   // the innermost cannot go further in
    // the bottom's editor: leg, rise, waistband, fit, flare, both colours and where the second goes
    for (const l of ['Leg', 'Rise', 'Waistband', 'Fit', 'Flare', 'Piece colour', 'Second colour', 'Where']) expect(html, l).toContain(`aria-label="${l}"`);
    expect(html).not.toContain('aria-label="Sleeves"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Ankle</);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Side stripe</);
  });
  it('a top shows sleeves, hem, neckline, hood and open; footwear its height; tones a kind cannot show are not offered', () => {
    const top = render([tee], { selectedId: 'c1' });
    for (const l of ['Sleeves', 'Hem', 'Neckline', 'Hood', 'Open']) expect(top, l).toContain(`aria-label="${l}"`);
    expect(top).toMatch(/aria-pressed="true"[^>]*>Short</);
    const feet = render([{ ...boots, colour2: '#FFFFFF' }], { selectedId: 'c3' });
    expect(feet).toContain('aria-label="Height"');
    expect(feet).toMatch(/aria-pressed="true"[^>]*>Knee</);
    expect(feet).toContain('>Sole<');
    expect(feet).not.toContain('>Sleeves<');
  });
  it('says what a built piece replaces in the store (still yours) and links to the store items', () => {
    const html = render([tee], { storeItems: { tops: 'Bonds Signature Jersey', shorts: 'Court Shorts' }, onStore: () => {} });
    expect(html).toContain('replace Bonds Signature Jersey while you wear them — still yours');
    expect(html).not.toContain('Court Shorts while');
    expect(html).toContain('>Store items</button>');
  });
  it('at a kind\'s budget its buttons are off', () => {
    const three: CreatorCloth[] = [1, 2, 3].map((i) => ({ id: `t${i}`, kind: 'top', style: 'tee', colour: '#111111' }));
    const html = render(three);
    expect(count(html, /disabled=""[^>]*title="Add (tank|tee|long sleeve|hoodie|jacket|high neck)"/g)).toBe(6);
  });
});

describe('the Studio wires it to the doc, the undo history, the camera and the store', () => {
  const src = require('node:fs').readFileSync(new URL('../closet-view.tsx', import.meta.url), 'utf8') as string;
  it('every edit is a step in the slot\'s history, writing doc.clothes (left out when empty)', () => {
    expect(src).toMatch(/const setClothes = \(next: CreatorCloth\[\], group\?: string\) => setFace\(/);
    expect(src).toMatch(/if \(next\.length\) out\.clothes = next; else delete out\.clothes;/);
    expect(src).toMatch(/<ClothesTab clothes=\{doc\?\.clothes \?\? \[\]\} onChange=\{setClothes\}/);
    // test changed (2026-10-07, the hair expansion): the Hair tab sits after Face
    expect(src).toContain("const STUDIO_TABS: readonly StudioTab[] = ['face', 'hair', 'shape', 'parts', 'paint', 'clothes', 'wear', 'skins'];");
    expect(src).toContain('<Chip label="Clothing" active={tab === \'clothes\'}');
  });
  it('randomise keeps the locked kinds; the camera frames the selected piece; the store slot says it is covered', () => {
    expect(src).toMatch(/randomiseClothes\(d\.clothes \?\? \[\], clothLocks, Math\.random\)/);
    expect(src).toMatch(/\{ kind: 'cloth', cloth: clothFocus\.kind/);
    expect(src).toContain('is worn over this slot (Clothing tab)');
  });
});
