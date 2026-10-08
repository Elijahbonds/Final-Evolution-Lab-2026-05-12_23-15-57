// The Studio's Hair tab (2026-10-07, the hair expansion). No DOM here: a server render is the first paint, and the
// Closet's wiring is read from its source (as the other tab tests do).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HairTab, type HairTabProps } from './hair-tab';
import { HAIR_PACKS } from '@/lib/creator/look/hair';
import { BEARD_STYLES } from '@/lib/creator/look/doc';

const render = (o: Partial<HairTabProps> = {}) => renderToStaticMarkup(createElement(HairTab, {
  style: 'Locs', colour: '#2B1B0E', extras: undefined, onStyle: () => {}, onColour: () => {}, onExtras: () => {}, ...o,
}));

describe('the Hair tab', () => {
  it('groups the styles by the four packs and opens on the pack of the current style', () => {
    const html = render({ style: 'Mohawk' });
    for (const p of HAIR_PACKS) expect(html).toContain(p.label.replace('&', '&amp;'));
    const cuts = HAIR_PACKS.find((p) => p.id === 'cuts')!;
    for (const s of cuts.styles) expect(html).toContain(`>${s}<`);
    expect(html).toMatch(/aria-checked="true"[^>]*><div[^>]*>Mohawk</);
    expect(html).not.toContain('>Box Braids<');   // another pack's style is a tap away, not on screen
  });
  it('labels each style with a line and keeps the targets phone-sized', () => {
    const html = render({ style: 'Locs' });
    expect(html).toContain('Rope locs to the shoulders');
    expect(html).toContain('min-h-[56px]');
    expect(html).toContain('grid-cols-2');
  });
  it('offers a beard picker, a second colour and only the accessories that fit', () => {
    const html = render({ style: 'Box Braids', extras: { beard: 'goatee', acc: ['beads'] } });
    for (const b of ['Stubble', 'Short boxed', 'Full', 'Long', 'Goatee', 'Chin strap', 'Mustache']) expect(html).toContain(`>${b}<`);
    expect(BEARD_STYLES).toHaveLength(7);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Goatee</);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Beads</);
    expect(html).toMatch(/disabled=""[^>]*>Clips</);   // clips do not fit braids
    expect(html).toContain('Accessory colour');
    expect(html).toContain('Second colour');
    expect(html).toContain('Same as hair');
  });
  it('a covering is cloth: its colours are the wrap and the trim, and it takes no accessories', () => {
    const html = render({ style: 'Hijab', extras: { colour2: '#FFFFFF' } });
    expect(html).toContain('Wrap colour');
    expect(html).toContain('Trim colour');
    expect(html).not.toContain('Accessories');
    expect(html).not.toContain('Under-layer');
  });
  it('says when a hood or helmet covers the hair', () => {
    expect(render({ covered: true })).toContain('covering the hair');
  });
  it('the Closet wires it to FaceConfig and the doc\'s hair block, as undo steps', () => {
    const src = readFileSync('components/closet-view.tsx', 'utf8');
    expect(src).toContain('<HairTab style={face.hairStyle} colour={face.hairColor} extras={doc?.hair}');
    expect(src).toContain("onStyle={(st) => setF('hairStyle', st)}");
    expect(src).toMatch(/const setHairExtras = \(patch: Partial<Record<keyof CreatorHair, unknown>>, group\?: string\) => setFace\(/);
    expect(src).toContain('creator: withHairExtras(d, patch)');
    expect(src).toContain('<Chip label="Hair" active={tab === \'hair\'}');
  });
});
