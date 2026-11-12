// studio-22 (2026-11-11): the phone's Inspect sheet opens on the selected object's own fields (lib/nexus-studio/phoneInspect.ts).
// Server renders (no DOM in this runner): the marker the scroll aims at sits between the rows every object shares and the object's
// own fields, once per object panel, never on the venue's or a group's panel; and the editor runs the scroll when the sheet opens.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Inspector } from './inspector';
import { everyKindVenue } from '@/tests/helpers/nexusStudio';

const noop = () => {};
const v = everyKindVenue();
const props = { venue: v, run: noop, seal: noop, onDelete: noop, onDuplicate: noop, onPreviewIntro: noop, onPreviewReplay: noop };
const actions = { duplicate: noop, copy: noop, remove: noop, flag: noop, turn: noop, saveStamp: noop };
const MARK = 'data-own-fields=""';

describe('the own-fields marker in the inspector', () => {
  it('a light: after Scale, before Role and the light’s colour', () => {
    const light = v.objects.find((o) => o.type === 'fixture')!;
    const html = renderToStaticMarkup(createElement(Inspector, { ...props, object: light }));
    expect(html.split(MARK)).toHaveLength(2);
    const at = html.indexOf(MARK);
    expect(html.indexOf('aria-label="Scale"')).toBeLessThan(at);
    expect(html.indexOf('aria-label="Role"')).toBeGreaterThan(at);
    expect(html.indexOf('aria-label="Light colour"')).toBeGreaterThan(at);
  });

  it('every kind of object has exactly one', () => {
    for (const o of v.objects) expect(renderToStaticMarkup(createElement(Inspector, { ...props, object: o })).split(MARK), o.type).toHaveLength(2);
  });

  it('the venue’s panel and a group’s panel have none (there is nothing to jump to)', () => {
    expect(renderToStaticMarkup(createElement(Inspector, { ...props, object: null }))).not.toContain(MARK);
    const group = v.objects.slice(0, 3);
    expect(renderToStaticMarkup(createElement(Inspector, { ...props, object: group[2], group, groupActions: actions }))).not.toContain(MARK);
  });
});

describe('the editor scrolls the phone sheet when Inspect opens', () => {
  const editor = readFileSync(join(__dirname, 'venue-editor.tsx'), 'utf8');
  it('on the Inspect sheet, with an object selected, at phone width, on the inspector aside', () => {
    expect(editor).toMatch(/if \(sheet === 'inspect' && selected && isPhoneWidth\([^)]*\)\) revealOwnFields\(inspRef\.current\)/);
    expect(editor).toMatch(/\}, \[sheet, selected\]\);/);
    expect(editor).toMatch(/aria-label="Inspector" id="studio-inspector" tabIndex=\{-1\} ref=\{inspRef\}/);
  });
});
