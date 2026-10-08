// The Closet's Paint tab (IMPROVE (2026-10-06), CREATOR-PLAN phase 3). No DOM in this runner (node environment), so as
// the Parts tab's test: a server render is the real first paint, and the Closet's wiring is read from source.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PaintTab } from './paint-tab';
import { PAINT_PATTERNS, PAINT_STAMPS, type PaintLayer } from '@/lib/creator/look/doc';

const layer = (i: number, o: Partial<PaintLayer> = {}): PaintLayer => ({
  id: `l${i}`, type: 'fill', region: 'torsoFront', surface: 'both', at: { x: 0.5, y: 0.5, rot: 0, scale: 1, stretch: 1 }, colours: ['#FF3366'], opacity: 1, mirror: false, ...o,
});
const render = (layers: PaintLayer[], suit = false) => renderToStaticMarkup(createElement(PaintTab, {
  layers, suit, onChange: () => {}, onSuit: () => {}, accent: '#00E5FF', canUndo: true, canRedo: false, onUndo: () => {}, onRedo: () => {},
}));
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe('the Paint tab', () => {
  it('shows the 24-layer budget, suit mode and the four layer types', () => {
    const html = render([layer(1), layer(2)]);
    expect(html).toContain('2 / 24');
    expect(html).toContain('aria-label="Suit mode"');
    for (const t of ['Fill', 'Pattern', 'Stamp', 'Text']) expect(html).toContain(`title="Add a ${t.toLowerCase()} layer"`);
  });

  it('lists the layers top first, each with hide, reorder, duplicate and delete; the top one cannot move up', () => {
    const html = render([layer(1), layer(2, { type: 'text', text: 'GO', region: 'torsoBack', hidden: true })]);
    const list = html.slice(html.indexOf('aria-label="Paint layers"'));
    expect(list.indexOf('“GO” · Back')).toBeLessThan(list.indexOf('Fill · Chest &amp; belly'));
    expect(html).toContain('aria-label="Show “GO” · Back"');
    expect(html).toContain('aria-label="Hide Fill · Chest &amp; belly"');
    expect(html).toMatch(/aria-label="Move “GO” · Back up" title="[^"]*" disabled=""/);
    expect(html).toMatch(/aria-label="Move Fill · Chest &amp; belly down" title="[^"]*" disabled=""/);
    expect(count(html, /aria-label="Duplicate /g)).toBe(2);
    expect(count(html, /aria-label="Delete /g)).toBe(2);
  });

  it('edits the selected (top) layer: region picker, surface, colours with hex, blend, mirror, typed sliders', () => {
    const html = render([layer(1), layer(2, { type: 'stamp', stamp: 'bolt', colours: ['#FFFFFF', '#000000'], at: { x: 0.25, y: 0.5, rot: -30, scale: 1.5, stretch: 1 } })]);
    expect(html).toMatch(/<optgroup label="Left arm">.*L forearm/);
    expect(html).toMatch(/<option value="shinRight">R shin<\/option>/);
    for (const s of ['Skin', 'Clothes', 'Skin &amp; clothes']) expect(html).toContain(`>${s}</button>`);
    expect(count(html, /aria-pressed="(true|false)"[^>]*>(Circle|Bolt|Star)</g)).toBe(3);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Bolt</);
    expect(html).toContain('aria-label="Fill colour"');
    expect(html).toContain('aria-label="Outline hex"');
    expect(html).toContain('Add detail');
    expect(html).toContain('>Multiply</button>');
    expect(html).toContain('aria-label="Mirror"');
    for (const l of ['Across', 'Up', 'Rotation', 'Size', 'Stretch', 'Opacity']) {
      expect(html, l).toContain(`aria-label="${l}"`);
      expect(html, l).toContain(`aria-label="${l} value"`);
    }
    const typed = (l: string) => new RegExp(`aria-label="${l} value"[^>]*value="([^"]*)"`).exec(html)?.[1];
    expect(typed('Across')).toBe('25');
    expect(typed('Rotation')).toBe('-30');
    expect(typed('Size')).toBe('1.5');
  });

  it('offers every stamp and every pattern, and a text box for text', () => {
    const stamps = render([layer(1, { type: 'stamp', stamp: 'star' })]);
    expect(count(stamps, /aria-pressed="(true|false)" class="rounded-md/g)).toBe(PAINT_STAMPS.length);
    const patterns = render([layer(1, { type: 'pattern', pattern: 'web' })]);
    expect(count(patterns, /aria-pressed="(true|false)" class="rounded-md/g)).toBe(PAINT_PATTERNS.length);
    expect(render([layer(1, { type: 'text', text: 'FEL' })])).toMatch(/aria-label="Layer text"[^>]*value="FEL"|value="FEL"[^>]*aria-label="Layer text"/);
  });

  it('at the budget nothing more can be added or duplicated; in suit mode the surface is the skin', () => {
    const full = Array.from({ length: 24 }, (_, i) => layer(i + 1));
    const html = render(full, true);
    expect(html).toContain('24 / 24');
    expect(count(html, /<button type="button" disabled=""[^>]*title="Add a /g)).toBe(4);
    expect(count(html, /aria-label="Duplicate [^"]*" title="[^"]*" disabled=""/g)).toBe(24);
    expect(html).toContain('(suit mode: the skin)');
    expect(count(html, /aria-pressed="(true|false)" disabled=""/g)).toBe(3);
  });

  it('an empty stack says what to do', () => {
    expect(render([])).toContain('No paint yet');
  });
});

describe('the Closet wires it to the doc, the undo history and the preview', () => {
  const src = require('node:fs').readFileSync(new URL('../closet-view.tsx', import.meta.url), 'utf8') as string;
  it('every Paint edit is a step in the face history, writing doc.paint; suit mode writes the flag and its layers in one step', () => {
    expect(src).toMatch(/const setPaint = \(next: PaintLayer\[\], group\?: string\) => setFace\(\(p\) => \{\s*const d = readCreatorDoc\(p\) \?\? emptyCreatorDoc\(\);\s*return \{ \.\.\.p, creator: \{ \.\.\.d, paint: next \} \};\s*\}, group\);/);
    expect(src).toMatch(/creator: \{ \.\.\.d, paint, flags: \{ \.\.\.d\.flags, suit: on \} \}/);
    expect(src).toMatch(/<PaintTab layers=\{doc\?\.paint \?\? \[\]\} suit=\{doc\?\.flags\.suit \?\? false\} onChange=\{setPaint\} onSuit=\{setSuit\}/);
    expect(src).toContain('<Chip label="Paint" active={tab === \'paint\'}');
  });
});
