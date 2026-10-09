// The Closet's Parts tab (IMPROVE (2026-10-06), CREATOR-PLAN phase 2). No DOM in this runner (node environment), so
// as the other component tests here: a server render is the real first paint, and the Closet's wiring is read from source.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PartsTab } from './parts-tab';
import type { CreatorPart } from '@/lib/creator/look/doc';
import { PART_SHAPES } from '@/lib/creator/look/doc';

const part = (i: number, o: Partial<CreatorPart> = {}): CreatorPart => ({
  id: `p${i}`, shape: 'horn', bone: 'Head', pos: [0.06, 0.15, 0.05], rot: [0, 0, -25], scale: [1, 1.5, 1], colour: '#FF3366', finish: 'metal', mirror: false, ...o,
});
const render = (parts: CreatorPart[]) => renderToStaticMarkup(createElement(PartsTab, {
  parts, onChange: () => {}, accent: '#00E5FF', canUndo: true, canRedo: false, onUndo: () => {}, onRedo: () => {},
}));
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe('the Parts tab', () => {
  it('shows the budget in rendered parts (a mirrored part counts twice) and offers every shape', () => {
    const html = render([part(1, { mirror: true }), part(2)]);
    expect(html).toContain('3 / 64');
    expect(count(html, /title="Add a /g)).toBe(PART_SHAPES.length);
    expect(html).toContain('Spike cluster');
  });

  it('lists the placed parts with readable names, and edits the first one: bone list, colour, finish, mirror, sliders with typed values', () => {
    const html = render([part(1, { mirror: true }), part(2, { shape: 'plate', bone: 'Spine2' })]);
    expect(html).toContain('Horn <span class="text-white/40">· Head</span>');
    expect(html).toContain('Plate <span class="text-white/40">· Chest</span>');
    expect(html).toMatch(/<optgroup label="Left arm">.*L forearm/);
    expect(html).toContain('aria-label="Part colour"');
    expect(html).toContain('value="#FF3366"');
    for (const f of ['Matte', 'Gloss', 'Metal', 'Glow']) expect(html).toContain(`>${f}</button>`);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Metal</);
    // position in cm, rotation in degrees, size and squash — each a slider plus a typed box
    for (const l of ['Side', 'Along', 'Front', 'Tilt', 'Turn', 'Roll', 'Size', 'Width', 'Length', 'Depth']) {
      expect(html, l).toContain(`aria-label="${l}"`);
      expect(html, l).toContain(`aria-label="${l} value"`);
    }
    const typed = (l: string) => new RegExp(`aria-label="${l} value"[^>]*value="([^"]*)"`).exec(html)?.[1];
    expect(typed('Front')).toBe('5');   // 0.05 m shown as 5 cm
    expect(typed('Roll')).toBe('-25');
    expect(typed('Length')).toBe('1.5');
  });

  it('at the budget, nothing more can be added, duplicated or mirrored', () => {
    const full = Array.from({ length: 64 }, (_, i) => part(i + 1));
    const html = render(full);
    expect(html).toContain('64 / 64');
    expect(count(html, /<button type="button" disabled=""[^>]*title="Add a /g)).toBe(PART_SHAPES.length);
    expect(html).toMatch(/<input type="checkbox" disabled=""/);
    expect(count(html, /aria-label="Duplicate [^"]*" title="Duplicate" disabled=""/g)).toBe(64);
  });

  it('an empty doc says what to do', () => {
    expect(render([])).toContain('No parts yet');
  });
});

describe('the Closet wires it to the doc, the undo history and the preview', () => {
  const src = require('node:fs').readFileSync(new URL('../closet-view.tsx', import.meta.url), 'utf8') as string;
  it('every Parts edit is a step in the face history, writing doc.parts', () => {
    expect(src).toMatch(/const setParts = \(next: CreatorPart\[\], group\?: string\) => setFace\(\(p\) => \{\s*const d = readCreatorDoc\(p\) \?\? emptyCreatorDoc\(\);\s*return \{ \.\.\.p, creator: \{ \.\.\.d, parts: next \} \};\s*\}, group\);/);
    expect(src).toMatch(/<PartsTab parts=\{doc\?\.parts \?\? \[\]\} onChange=\{setParts\}/);
    expect(src).toMatch(/onUndo=\{\(\) => setHist\(undo\)\} onRedo=\{\(\) => setHist\(redo\)\}/);
  });
  it('the preview gets the doc and the worn parts (the Nexus Visor)', () => {
    expect(src).toMatch(/creator=\{doc\} wornParts=\{previewWornParts\}/);
  });
});
