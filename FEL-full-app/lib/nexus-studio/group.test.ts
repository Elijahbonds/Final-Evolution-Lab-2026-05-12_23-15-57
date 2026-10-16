// Multi-select and group edits (docs/NEXUS-STUDIO.md §11): the selection rules, the group's rigid move / turn / scale about
// its centre, ONE command per gesture, locked members left alone, and undo exact.
import { describe, expect, it } from 'vitest';
import { canUndo, createStack, execute, undo, redo, type CommandStack } from './commands';
import {
  applyDelta, boxSelect, clickSelect, groupCentre, groupDeleteCommand, groupFlagCommand, groupTransformCommand, inRect,
  liveSelection, snapDelta, treeSelect, NO_DELTA,
} from './group';
import { DEFAULT_SNAP } from './snap';
import type { StudioProject } from './doc';
import { everyKindProject } from '@/tests/helpers/nexusStudio';

const T0 = new Date('2026-10-16T12:00:00Z');
const strip = (p: StudioProject) => ({ ...p, updatedAt: '' });
const venueOf = (s: CommandStack) => s.doc.venues.find((v) => v.id === s.doc.activeVenueId)!;
const fresh = () => createStack(everyKindProject());
const close = (a: readonly number[], b: readonly number[], eps = 1e-5) => a.every((x, i) => Math.abs(x - b[i]) < eps);

describe('the selection', () => {
  it('a click replaces, Ctrl toggles, add keeps; empty space clears only a plain click', () => {
    expect(clickSelect(['a', 'b'], 'c', 'replace')).toEqual(['c']);
    expect(clickSelect(['a', 'b'], 'c', 'toggle')).toEqual(['a', 'b', 'c']);
    expect(clickSelect(['a', 'b'], 'a', 'toggle')).toEqual(['b']);
    expect(clickSelect(['a', 'b'], 'a', 'add')).toEqual(['b', 'a']);   // re-adding makes it the primary (the last)
    expect(clickSelect(['a', 'b'], null, 'replace')).toEqual([]);
    expect(clickSelect(['a', 'b'], null, 'toggle')).toEqual(['a', 'b']);
  });
  it('a box adds what it drew round (or takes exactly that), no duplicates', () => {
    expect(boxSelect(['a'], ['b', 'a', 'c'], 'add')).toEqual(['a', 'b', 'c']);
    expect(boxSelect(['a'], ['b', 'c', 'b'], 'replace')).toEqual(['b', 'c']);
    const pts = [{ id: 'in', x: 50, y: 50 }, { id: 'edge', x: 100, y: 20 }, { id: 'out', x: 101, y: 50 }];
    expect(inRect(pts, { x: 100, y: 100 }, { x: 10, y: 10 })).toEqual(['in', 'edge']);   // either corner order
  });
  it('the tree: Shift takes the range from the anchor, Ctrl+Shift adds it to the picks', () => {
    const order = ['a', 'b', 'c', 'd', 'e'];
    expect(treeSelect(order, ['a'], 'd', { shift: true }, 'b')).toEqual(['b', 'c', 'd']);
    expect(treeSelect(order, ['a'], 'b', { shift: true }, 'd')).toEqual(['b', 'c', 'd']);
    expect(treeSelect(order, ['a'], 'd', { shift: true, toggle: true }, 'c')).toEqual(['a', 'c', 'd']);
    expect(treeSelect(order, ['a'], 'c', { toggle: true }, 'a')).toEqual(['a', 'c']);
    expect(treeSelect(order, ['a', 'c'], 'e', {}, 'c')).toEqual(['e']);
    expect(treeSelect(order, ['a'], 'd', { shift: true }, null)).toEqual(['d']);   // no anchor: a plain click
  });
  it('a selection keeps only the ids its venue still has', () => {
    const v = everyKindProject().venues[0];
    expect(liveSelection(v, ['nope', v.objects[2].id, v.objects[0].id])).toEqual([v.objects[2].id, v.objects[0].id]);
    expect(liveSelection(null, ['x'])).toEqual([]);
  });
});

describe('the group frame', () => {
  it('the centre is the middle of the positions’ box (one far member does not drag it to the mean)', () => {
    const t = (x: number, z: number) => ({ t: { p: [x, 0, z] as [number, number, number], ry: 0, s: 1 } });
    expect(groupCentre([t(0, 0), t(1, 0), t(10, 4)])).toEqual([5, 0, 2]);
    expect(groupCentre([])).toEqual([0, 0, 0]);
  });
  it('a turn is rigid: distances to the pivot and between members stay, each yaw turns by the same angle', () => {
    const a = { type: 'fixture' as const, t: { p: [4, 0, 0] as [number, number, number], ry: 0.2, s: 1 } };
    const b = { type: 'fixture' as const, t: { p: [0, 0, 3] as [number, number, number], ry: -0.4, s: 2 } };
    const d = { move: [0, 0, 0] as [number, number, number], turn: Math.PI / 2, scale: 1 };
    const ta = applyDelta(a, [0, 0, 0], d), tb = applyDelta(b, [0, 0, 0], d);
    // Babylon's yaw: +90° about y takes +x to −z and +z to +x (an object's +z heading is (sin ry, cos ry))
    expect(close(ta.p, [0, 0, -4])).toBe(true);
    expect(close(tb.p, [3, 0, 0])).toBe(true);
    expect(ta.ry).toBeCloseTo(0.2 + Math.PI / 2, 5);
    expect(Math.hypot(ta.p[0] - tb.p[0], ta.p[2] - tb.p[2])).toBeCloseTo(5, 5);
  });
  it('the turn agrees with the object’s own heading (a member facing the pivot still faces it after the turn)', () => {
    const o = { type: 'fixture' as const, t: { p: [6, 0, 0] as [number, number, number], ry: Math.atan2(-6, 0), s: 1 } };
    const t = applyDelta(o, [0, 0, 0], { move: [0, 0, 0], turn: 1.1, scale: 1 });
    const heading = [Math.sin(t.ry), Math.cos(t.ry)], toPivot = [-t.p[0] / 6, -t.p[2] / 6];
    expect(close(heading, toPivot)).toBe(true);
  });
  it('a scale spreads positions from the pivot and scales each member — but never a crowd stand’s size', () => {
    const lamp = { type: 'fixture' as const, t: { p: [2, 1, 0] as [number, number, number], ry: 0, s: 1.5 } };
    const stand = { type: 'crowdStand' as const, t: { p: [0, 0, 2] as [number, number, number], ry: 0, s: 1 } };
    const d = { move: [1, 0, 0] as [number, number, number], turn: 0, scale: 2 };
    expect(applyDelta(lamp, [0, 0, 0], d)).toEqual({ p: [5, 2, 0], ry: 0, s: 3 });
    expect(applyDelta(stand, [0, 0, 0], d)).toEqual({ p: [1, 0, 4], ry: 0, s: 1 });
  });
  it('results are clamped to the document’s limits', () => {
    const o = { type: 'fixture' as const, t: { p: [390, 0, 0] as [number, number, number], ry: 0, s: 30 } };
    const t = applyDelta(o, [0, 0, 0], { move: [50, 0, 0], turn: 0, scale: 2 });
    expect(t.p[0]).toBe(400); expect(t.s).toBe(40);
  });
  it('snapping applies to the group’s delta, so the members keep their spacing exactly', () => {
    expect(snapDelta({ move: [1.3, 0.37, -0.2], turn: 0.3, scale: 1.27 }, DEFAULT_SNAP)).toEqual({ move: [1.5, 0.37, 0], turn: Math.PI / 12, scale: 1.3 });
    expect(snapDelta({ move: [1.3, 0, 0], turn: 0, scale: 0.01 }, DEFAULT_SNAP).scale).toBe(0.1);   // never 0
    expect(snapDelta({ move: [1.3, 0, 0], turn: 0.3, scale: 1.27 }, { ...DEFAULT_SNAP, on: false })).toEqual({ move: [1.3, 0, 0], turn: 0.3, scale: 1.27 });
  });
});

describe('group commands', () => {
  it('a group move is ONE undo step, moves every unlocked member by the same delta, and undo is exact', () => {
    let s = fresh();
    const start = strip(s.doc);
    const v = venueOf(s);
    const ids = v.objects.slice(0, 4).map((o) => o.id);
    const cmd = groupTransformCommand(v, ids, { move: [2, 0, -1], turn: 0, scale: 1 })!;
    expect(cmd.ops).toHaveLength(4);
    expect(cmd.label).toBe('Move 4 objects');
    s = execute(s, cmd, T0);
    expect(s.past).toHaveLength(1);
    for (const [i, id] of ids.entries()) {
      const before = v.objects[i].t.p, after = venueOf(s).objects.find((o) => o.id === id)!.t.p;
      expect(close(after, [before[0] + 2, before[1], before[2] - 1])).toBe(true);
    }
    s = undo(s, T0);
    expect(strip(s.doc)).toEqual(start);
    expect(canUndo(s)).toBe(false);
    s = redo(s, T0);
    expect(venueOf(s).objects[0].t.p[0]).toBeCloseTo(v.objects[0].t.p[0] + 2, 6);
  });
  it('a turn about the group’s centre leaves the centre where it was', () => {
    const s0 = fresh();
    const v = venueOf(s0);
    const ids = v.objects.slice(0, 5).map((o) => o.id);
    const c0 = groupCentre(v.objects.slice(0, 5));
    const s = execute(s0, groupTransformCommand(v, ids, { move: [0, 0, 0], turn: Math.PI, scale: 1 })!, T0);
    const c1 = groupCentre(venueOf(s).objects.filter((o) => ids.includes(o.id)));
    expect(close(c1, c0)).toBe(true);   // a half turn about the box's middle maps the box onto itself
  });
  it('locked members stay put; an all-locked selection makes no command', () => {
    const v = venueOf(fresh());
    v.objects[1].locked = true;
    const cmd = groupTransformCommand(v, [v.objects[0].id, v.objects[1].id], { move: [1, 0, 0], turn: 0, scale: 1 })!;
    expect(cmd.ops.map((o) => (o as { id: string }).id)).toEqual([v.objects[0].id]);
    expect(groupTransformCommand(v, [v.objects[1].id], { move: [1, 0, 0], turn: 0, scale: 1 })).toBeNull();
    expect(groupTransformCommand(v, [v.objects[0].id], NO_DELTA)).toBeNull();   // nothing changes → nothing recorded
  });
  it('nudges coalesce into one step when they carry a group', () => {
    let s = fresh();
    const start = strip(s.doc);
    const ids = venueOf(s).objects.slice(0, 3).map((o) => o.id);
    for (let i = 0; i < 4; i++) s = execute(s, groupTransformCommand(venueOf(s), ids, { move: [0.5, 0, 0], turn: 0, scale: 1 }, { group: 'nudge:g', label: 'Nudge' })!, T0);
    expect(s.past).toHaveLength(1);
    s = undo(s, T0);
    expect(strip(s.doc)).toEqual(start);
  });
  it('hide / lock: any member off turns all on, all on turns all off — one step, undo exact', () => {
    let s = fresh();
    const start = strip(s.doc);
    const v = venueOf(s);
    const ids = [v.objects[0].id, v.objects[8].id];   // the second is already hidden
    s = execute(s, groupFlagCommand(v, ids, 'hidden')!, T0);
    expect(venueOf(s).objects.filter((o) => ids.includes(o.id)).every((o) => o.hidden)).toBe(true);
    expect(s.past[0].label).toBe(`Hide ${v.objects[0].name}`);   // only the one that changed
    s = execute(s, groupFlagCommand(venueOf(s), ids, 'hidden')!, T0);
    expect(venueOf(s).objects.filter((o) => ids.includes(o.id)).some((o) => 'hidden' in o)).toBe(false);
    s = execute(s, groupFlagCommand(venueOf(s), ids, 'locked')!, T0);
    expect(s.past).toHaveLength(3);
    while (canUndo(s)) s = undo(s, T0);
    expect(strip(s.doc)).toEqual(start);
  });
  it('delete takes the whole selection but the locked, in one step; undo puts each back where it stood', () => {
    let s = fresh();
    const v = venueOf(s);
    const order = v.objects.map((o) => o.id);
    v.objects[3].locked = true;
    s = createStack(s.doc);
    const ids = [order[1], order[3], order[5]];
    s = execute(s, groupDeleteCommand(venueOf(s), ids)!, T0);
    expect(venueOf(s).objects.map((o) => o.id)).toEqual(order.filter((id) => id !== order[1] && id !== order[5]));
    s = undo(s, T0);
    expect(venueOf(s).objects.map((o) => o.id)).toEqual(order);
    expect(groupDeleteCommand(venueOf(s), [order[3]])).toBeNull();
  });
});
