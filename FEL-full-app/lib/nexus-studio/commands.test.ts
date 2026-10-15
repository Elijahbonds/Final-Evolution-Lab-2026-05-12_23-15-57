// The command stack (docs/NEXUS-STUDIO.md §2.2): undo is exact, redo replays, a gesture is one step, a failed command
// changes nothing, and "dirty" means "not what was saved".
import { describe, expect, it } from 'vitest';
import {
  applyOps, canRedo, canUndo, createStack, execute, isDirty, markSaved, redo, redoLabel, seal, undo, undoLabel, CommandError,
  type Command, type CommandStack,
} from './commands';
import { newVenue, type StudioProject } from './doc';
import { deleteObjects, duplicate, editObject, editVenue, moveObject, placeItem, toggleFlag, addVenue, importProject } from './edits';
import { catalogItem } from './catalog';
import { PLAYTEST_TARGETS } from './targets';
import { everyKindProject } from '@/tests/helpers/nexusStudio';

const T0 = new Date('2026-10-14T12:00:00Z');
const strip = (p: StudioProject) => ({ ...p, updatedAt: '' });
const venueOf = (s: CommandStack) => s.doc.venues.find((v) => v.id === s.doc.activeVenueId)!;

function fresh(): CommandStack { return createStack(everyKindProject()); }

describe('undo is exact', () => {
  it('every kind of edit, undone in reverse, gives back the document it started from', () => {
    let s = fresh();
    const start = strip(s.doc);
    const v = () => venueOf(s);
    const placed = placeItem(v(), catalogItem('fixture:flood')!, [3, 0, 4]);
    s = execute(s, placed.cmd, T0);
    s = execute(s, moveObject(v(), placed.id, { p: [5, 0, 6], ry: 1, s: 2 }), T0);
    s = execute(s, editObject(v(), placed.id, { color: '#ff0000' }, 'light'), T0);
    s = execute(s, editVenue(v(), { mood: 'dusk', sky: undefined }, 'mood'), T0);
    s = execute(s, toggleFlag(v(), v().objects[0], 'locked'), T0);
    s = execute(s, duplicate(v(), v().objects[1].id)!.cmd, T0);
    s = execute(s, deleteObjects(v(), [v().objects[2].id])!, T0);
    s = execute(s, addVenue(s.doc, PLAYTEST_TARGETS.tiebreak).cmd, T0);
    expect(s.past.length).toBe(8);
    const end = strip(s.doc);
    while (canUndo(s)) s = undo(s, T0);
    expect(strip(s.doc)).toEqual(start);
    while (canRedo(s)) s = redo(s, T0);
    expect(strip(s.doc)).toEqual(end);
  });

  it('removing an object puts it back where it stood in the list, not at the end', () => {
    let s = fresh();
    const order = venueOf(s).objects.map((o) => o.id);
    s = execute(s, deleteObjects(venueOf(s), [order[2]])!, T0);
    s = undo(s, T0);
    expect(venueOf(s).objects.map((o) => o.id)).toEqual(order);
  });

  it('a patch that adds a key removes it again on undo (no `undefined` left behind)', () => {
    let s = fresh();
    const o = venueOf(s).objects.find((x) => x.type === 'kitProp')!;
    expect('tint' in o).toBe(false);
    s = execute(s, editObject(venueOf(s), o.id, { tint: '#123456' }, 'tint'), T0);
    s = undo(s, T0);
    expect('tint' in venueOf(s).objects.find((x) => x.id === o.id)!).toBe(false);
  });

  it('removing the active venue makes another active, and undo restores both the venue and the choice', () => {
    let s = fresh();
    const add = addVenue(s.doc, PLAYTEST_TARGETS.tiebreak);
    s = execute(s, add.cmd, T0);
    expect(s.doc.activeVenueId).toBe(add.id);
    s = execute(s, { label: 'remove', ops: [{ op: 'removeVenue', id: add.id }] }, T0);
    expect(s.doc.activeVenueId).not.toBe(add.id);
    s = undo(s, T0);
    expect(s.doc.activeVenueId).toBe(add.id);
    expect(s.doc.venues.map((v) => v.id)).toContain(add.id);
  });

  it('an import replaces the project and undo puts the old one back', () => {
    let s = fresh();
    const before = strip(s.doc);
    const other = { ...everyKindProject(), name: 'Other' };
    s = execute(s, importProject(other), T0);
    expect(s.doc.name).toBe('Other');
    s = undo(s, T0);
    expect(strip(s.doc)).toEqual(before);
  });
});

describe('a gesture is one step', () => {
  it('commands with the same group coalesce, and one undo steps back over all of them', () => {
    let s = fresh();
    const id = venueOf(s).objects[0].id;
    const x0 = venueOf(s).objects[0].t.p[0];
    for (let i = 1; i <= 10; i++) {
      const t = { ...venueOf(s).objects[0].t, p: [x0 + i, 0, 0] as [number, number, number] };
      s = execute(s, editObject(venueOf(s), id, { t }, 'position x'), T0);
    }
    expect(s.past.length).toBe(1);
    expect(venueOf(s).objects[0].t.p[0]).toBe(x0 + 10);
    s = undo(s, T0);
    expect(venueOf(s).objects[0].t.p[0]).toBe(x0);
    expect(s.past.length).toBe(0);
  });

  it('seal ends a gesture: the next edit of the same field is a new step', () => {
    let s = fresh();
    const id = venueOf(s).objects[0].id;
    s = execute(s, editObject(venueOf(s), id, { name: 'a' }, 'name'), T0);
    s = seal(s);
    s = execute(s, editObject(venueOf(s), id, { name: 'b' }, 'name'), T0);
    expect(s.past.length).toBe(2);
  });

  it('a different field is a different step', () => {
    let s = fresh();
    const id = venueOf(s).objects[0].id;
    s = execute(s, editObject(venueOf(s), id, { name: 'a' }, 'name'), T0);
    s = execute(s, editVenue(venueOf(s), { weather: 'fog' }, 'weather'), T0);
    expect(s.past.length).toBe(2);
  });
});

describe('safety', () => {
  it('a command that cannot apply throws and leaves the stack as it was (all or nothing)', () => {
    const s = fresh();
    const v = venueOf(s);
    const bad: Command = { label: 'half', ops: [{ op: 'patchObject', venueId: v.id, id: v.objects[0].id, patch: { name: 'changed' } }, { op: 'removeObject', venueId: v.id, id: 'nope' }] };
    expect(() => execute(s, bad, T0)).toThrow(CommandError);
    expect(venueOf(s).objects[0].name).not.toBe('changed');
  });

  it('an object\'s id and type cannot be patched', () => {
    const s = fresh();
    const v = venueOf(s);
    expect(() => applyOps(s.doc, [{ op: 'patchObject', venueId: v.id, id: v.objects[0].id, patch: { type: 'decal' } as never }])).toThrow(/cannot change/);
  });

  it('the last venue cannot be removed', () => {
    const s = fresh();
    expect(() => execute(s, { label: 'x', ops: [{ op: 'removeVenue', id: s.doc.venues[0].id }] }, T0)).toThrow(/at least one venue/);
  });

  it('a no-op records nothing', () => {
    const s = fresh();
    const v = venueOf(s);
    const same = execute(s, editVenue(v, { weather: v.weather }, 'weather'), T0);
    expect(same).toBe(s);
  });

  it('delete leaves locked objects alone', () => {
    const s = fresh();
    const v = venueOf(s);
    const locked = { ...v, objects: v.objects.map((o, i) => (i === 0 ? { ...o, locked: true } : o)) };
    expect(deleteObjects(locked, [locked.objects[0].id])).toBeNull();
  });

  it('the history is capped; the oldest step falls off', () => {
    let s = createStack(everyKindProject(), 5);
    const id = venueOf(s).objects[0].id;
    for (let i = 0; i < 9; i++) s = execute(s, { label: `n${i}`, ops: [{ op: 'patchObject', venueId: venueOf(s).id, id, patch: { name: `n${i}` } }] }, T0);
    expect(s.past.length).toBe(5);
    expect(undoLabel(s)).toBe('n8');
  });

  it('a new edit after an undo clears redo', () => {
    let s = fresh();
    s = execute(s, editVenue(venueOf(s), { weather: 'fog' }, 'weather'), T0);
    s = undo(s, T0);
    expect(redoLabel(s)).toBe('Venue: weather');
    s = execute(s, editVenue(venueOf(s), { intro: 'establish' }, 'intro'), T0);
    expect(canRedo(s)).toBe(false);
  });
});

describe('dirty', () => {
  it('opened is clean; an edit is dirty; saving cleans it; undoing back past the save is dirty; redoing to it is clean', () => {
    let s = fresh();
    expect(isDirty(s)).toBe(false);
    s = execute(s, editVenue(venueOf(s), { weather: 'fog' }, 'weather'), T0);
    expect(isDirty(s)).toBe(true);
    s = markSaved(s);
    expect(isDirty(s)).toBe(false);
    s = undo(s, T0);
    expect(isDirty(s)).toBe(true);
    s = redo(s, T0);
    expect(isDirty(s)).toBe(false);
  });

  it('more of a coalesced gesture after a save is dirty again (the merged step is a new step)', () => {
    let s = fresh();
    const id = venueOf(s).objects[0].id;
    s = execute(s, editObject(venueOf(s), id, { name: 'a' }, 'name'), T0);
    s = markSaved(s);
    s = execute(s, editObject(venueOf(s), id, { name: 'ab' }, 'name'), T0);
    expect(isDirty(s)).toBe(true);
  });

  it('touching a document stamps updatedAt', () => {
    let s = createStack({ ...everyKindProject(), updatedAt: '2000-01-01T00:00:00.000Z' });
    s = execute(s, editVenue(venueOf(s), { weather: 'fog' }, 'weather'), T0);
    expect(s.doc.updatedAt).toBe(T0.toISOString());
  });
});

describe('the edits module', () => {
  it('placeItem puts a catalog object where it was asked', () => {
    const v = newVenue('v', { spec: 'tennis', target: 'tiebreak' });
    const r = placeItem(v, catalogItem('crowd:bleacher')!, [1, 0, 2]);
    const op = r.cmd.ops[0];
    expect(op.op === 'addObject' && op.object.t.p).toEqual([1, 0, 2]);
    expect(op.op === 'addObject' && op.object.id).toBe(r.id);
  });
});
