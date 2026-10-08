// The Closet's Shape tab (IMPROVE (2026-10-06), CREATOR-PLAN phase 4b). No DOM in this runner (node environment), so
// as the other component tests here: a server render is the real first paint, and the Closet's wiring is read from source.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ShapeTab, GIRTH_LABEL, PROPORTION_LABEL } from './shape-tab';
import { GIRTH_KEYS, PROPORTION_KEYS, PROPORTION_RANGES, PRESENTATION_RANGE, type CreatorShape } from '@/lib/creator/look/doc';
import type { ShapeRandomSection } from '@/lib/creator/look/randomise';

const render = (shape: CreatorShape, o: { presentation?: number | null; locks?: ShapeRandomSection[]; numbersSaved?: boolean } = {}) => renderToStaticMarkup(createElement(ShapeTab, {
  shape, presentation: o.presentation ?? null, onShape: () => {}, onPresentation: () => {}, locks: o.locks ?? [], onLocks: () => {}, onRoll: () => {},
  canUndo: true, canRedo: false, onUndo: () => {}, onRedo: () => {}, numbersSaved: o.numbersSaved ?? true,
}));
const typed = (html: string, label: string) => new RegExp(`aria-label="${label} value"[^>]*value="([^"]*)"`).exec(html)?.[1];
const attr = (html: string, label: string, a: 'min' | 'max') => new RegExp(`<input type="range" min="([^"]*)" max="([^"]*)"[^>]*aria-label="${label}"`).exec(html)?.[a === 'min' ? 1 : 2];

describe('the Shape tab', () => {
  it('every proportion and every segment\'s bulk is a slider with a typed value, at the stored value (1 when unset)', () => {
    const html = render({ face: {}, body: { head: 1.4, legs: 1.02 }, girth: { chest: 1.3 } }, { presentation: 1.2 });
    for (const k of PROPORTION_KEYS) {
      expect(html, k).toContain(`aria-label="${PROPORTION_LABEL[k]}"`);
      expect(html, k).toContain(`aria-label="${PROPORTION_LABEL[k]} value"`);
    }
    for (const k of GIRTH_KEYS) expect(html, k).toContain(`aria-label="${GIRTH_LABEL[k]} value"`);
    expect(typed(html, 'Size')).toBe('1.2');
    expect(html).toMatch(/aria-label="Hands value"[^>]*value="1"/);
    // the slider ranges are the doc's (the frame keys: the play clamp)
    expect(attr(html, 'Legs', 'min')).toBe(String(PROPORTION_RANGES.legs[0]));
    expect(attr(html, 'Legs', 'max')).toBe(String(PROPORTION_RANGES.legs[1]));
    expect(attr(html, 'Head', 'max')).toBe(String(PROPORTION_RANGES.head[1]));
    expect(attr(html, 'Size', 'min')).toBe(String(PRESENTATION_RANGE[0]));
  });
  it('says what plays where: reach-safe everywhere, the frame keys at 1.0 in ranked, the size in the Studio only', () => {
    const html = render({ face: {}, body: {} });
    expect(html).toContain('ranked included');
    expect(html).toContain('ranked and fixed-frame modes play every body at 1.0');
    expect(html).toContain('shown here and in photos only');
    expect(html).toContain('your clothes follow');
  });
  it('its own Randomise, with a lock per section; all locked disables it', () => {
    const html = render({ face: {}, body: {} }, { locks: ['bulk'] });
    expect(html).toContain('aria-label="Randomise shape"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*bulk/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>.*proportions/);
    expect(render({ face: {}, body: {} }, { locks: ['proportions', 'bulk'] })).toMatch(/disabled=""[^>]*aria-label="Randomise shape"/);
    expect(html).toContain('aria-label="Undo"');
  });
  it('a teen or an adult without the numbers opt-in is told the numbers stay on the device', () => {
    expect(render({ face: {}, body: {} }, { numbersSaved: false })).toContain('stay on this device');
    expect(render({ face: {}, body: {} })).not.toContain('stay on this device');
  });
});

describe('the Closet wires it through the selected slot\'s undo history', () => {
  const src = readFileSync('components/closet-view.tsx', 'utf8');
  it('a Shape tab; the doc shape through setFace (a drag is one step by its group); the Studio size on the SLOT, not the doc', () => {
    expect(src).toContain(`<Chip label="Shape" active={tab === 'shape'}`);
    expect(src).toMatch(/const setShape = \(next: CreatorShape, group\?: string\) => setFace\(/);
    expect(src).toMatch(/const setPresentation = \(scale: number \| null, group\?: string\) => setSlot\(/);
    expect(src).toMatch(/const rollShape = \(\) => setFace\(/);
    expect(src).toContain('presentation={slot.presentation?.scale ?? null}');
  });
  it('the tab passes its slider groups: `shape:<key>`, `bulk:<key>` and `presentation`', () => {
    const tab = readFileSync('components/closet/shape-tab.tsx', 'utf8');
    expect(tab).toContain('`shape:${k}`');
    expect(tab).toContain('`bulk:${k}`');
    expect(tab).toContain("p.onPresentation(v, 'presentation')");
  });
});
