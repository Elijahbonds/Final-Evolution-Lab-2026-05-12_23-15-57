// §11 in the shell (server render; no DOM in this runner): the group's inspector panel, the scene tree's multi-select, the
// stamp shelf, the "Plays in" picker and Football Rush's weather and replay notes.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Inspector, groupSummary } from './inspector';
import { SceneTree, treeGroups, treeOrder } from './scene-tree';
import { StampShelf, stampSummary } from './stamp-shelf';
import { starterProject } from './use-studio';
import { builtInStamps } from '@/lib/nexus-studio/stamps';
import { newVenue } from '@/lib/nexus-studio/doc';
import { everyKindVenue } from '@/tests/helpers/nexusStudio';

const noop = () => {};
const v = everyKindVenue();
const props = { venue: v, run: noop, seal: noop, onDelete: noop, onDuplicate: noop, onPreviewIntro: noop, onPreviewReplay: noop };
const actions = { duplicate: noop, copy: noop, remove: noop, flag: noop, turn: noop, saveStamp: noop };

describe('the group’s inspector panel', () => {
  it('replaces the object’s fields when more than one is selected: its make-up and the whole-selection actions', () => {
    const group = [v.objects[3], v.objects[4], v.objects[5]];
    const html = renderToStaticMarkup(createElement(Inspector, { ...props, object: v.objects[5], group, groupActions: actions })).replace(/<!-- -->/g, '');
    expect(html).toContain('3 objects');
    expect(html).toContain('2 lights · 1 stand');
    for (const s of ['aria-label="Duplicate the selection"', 'aria-label="Copy (paste into any venue)"', 'aria-label="Delete the selection"', 'aria-label="Save selection as stamp"', 'aria-label="Turn the group 15° left"', 'aria-label="Hide all (not drawn, not exported)"', 'aria-label="Lock all (no moving or deleting)"']) expect(html).toContain(s);
    expect(html).not.toContain('aria-label="Role"');   // not the one object's fields
  });
  it('an all-locked group cannot be deleted; a one-object "group" is the object’s own panel', () => {
    const locked = [{ ...v.objects[3], locked: true }, { ...v.objects[4], locked: true }];
    expect(renderToStaticMarkup(createElement(Inspector, { ...props, object: locked[1], group: locked, groupActions: actions }))).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Delete the selection"/);
    const one = renderToStaticMarkup(createElement(Inspector, { ...props, object: v.objects[3], group: [v.objects[3]], groupActions: actions }));
    expect(one).toContain('aria-label="Role"');
  });
  it('groupSummary counts kinds, most first', () => {
    expect(groupSummary([v.objects[3], v.objects[4], v.objects[5], v.objects[0]])).toBe('2 lights · 1 stand · 1 dressing prop');
  });
});

describe('the venue’s target', () => {
  it('"Plays in" offers both play-test modes', () => {
    const html = renderToStaticMarkup(createElement(Inspector, { ...props, object: null }));
    expect(html).toContain('aria-label="Plays in"');
    expect(html).toContain('<option value="tiebreak" selected="">Tiebreak · tennis</option>');
    expect(html).toContain('<option value="football">Football Rush · football_rush</option>');
    expect(html).toContain('It has no replays');
  });
  it('a Football Rush venue: the weather is the mode’s (no picker), the angles are live in its replay', () => {
    const rush = { ...newVenue('Rush', { spec: 'football_rush', target: 'football' }), replayAngles: ['high' as const] };
    const html = renderToStaticMarkup(createElement(Inspector, { ...props, venue: rush, object: null })).replace(/<!-- -->/g, '');
    expect(html).toContain('data-testid="mode-weather"');
    expect(html).not.toContain('aria-label="Weather"');
    expect(html).toContain('Football Rush opens on the intro you pick and replays its big moments through the ticked angles');
    expect(html).toContain('lays its own field');
    expect(html).not.toContain('aria-label="Glossy floor"');
  });
});

describe('the scene tree, many selected', () => {
  it('marks every selected row and says how to add or drop one', () => {
    const sel = [v.objects[3].id, v.objects[4].id];
    const html = renderToStaticMarkup(createElement(SceneTree, { venues: [v], activeId: v.id, venue: v, selection: sel, onSelectRow: noop, onClear: noop, onToggle: noop, onSwitchVenue: noop, onAddVenue: noop })).replace(/<!-- -->/g, '');
    expect((html.match(/aria-selected="true"/g) ?? []).length).toBe(2);
    expect(html).toContain('2 selected');
    expect(html).toContain('(all 2 selected)');   // the hide / lock buttons on those rows take the whole selection
  });
  it('treeOrder is the drawn order (a Shift range runs in it)', () => {
    expect(treeOrder(v.objects)).toEqual(treeGroups(v.objects).flatMap((g) => g.items.map((o) => o.id)));
  });
});

describe('the stamp shelf', () => {
  it('lists the built-ins and the project’s own; saving needs a selection', () => {
    const project = { ...starterProject(), stamps: [{ ...builtInStamps()[0], id: 'stamp_mine', name: 'My row' }] };
    const none = renderToStaticMarkup(createElement(StampShelf, { project, selectionCount: 0, onPlace: noop, onSave: noop, onRename: noop, onRemove: noop, onDone: noop }));
    for (const s of builtInStamps()) expect(none).toContain(`aria-label="Place ${s.name}"`);
    expect(none).toContain('aria-label="Place My row"');
    expect(none).toContain('aria-label="Delete stamp My row"');
    expect(none).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Save selection as stamp"/);
    const some = renderToStaticMarkup(createElement(StampShelf, { project, selectionCount: 3, onPlace: noop, onSave: noop, onRename: noop, onRemove: noop, onDone: noop }));
    expect(some).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="Save selection as stamp"/);
  });
  it('stampSummary', () => {
    expect(stampSummary(builtInStamps().find((s) => s.name === 'Flood corner set')!)).toBe('4 · Lights');
    expect(stampSummary(builtInStamps().find((s) => s.name === 'Palm avenue')!)).toBe('10 · Dressing');
  });
});
