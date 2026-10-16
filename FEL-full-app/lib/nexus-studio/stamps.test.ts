// Prefab stamps (docs/NEXUS-STUDIO.md §11): the built-in shelf is made of catalog things, saving a selection is one step,
// placing a stamp is one step with fresh ids at the view's centre, the project's stamps survive a save → load, and every
// stamp op undoes exactly.
import { describe, expect, it } from 'vitest';
import { canUndo, createStack, execute, redo, undo, type CommandStack } from './commands';
import { allStamps, builtInStamps, placeStamp, removeStampCommand, renameStampCommand, stampFromSelection } from './stamps';
import { groupCentre } from './group';
import { exportVenue } from './exportVenue';
import { LIMITS, parseProject, sanitizeProject, serializeProject, type StudioProject } from './doc';
import { DEFAULT_SNAP } from './snap';
import { everyKindProject, placed } from '@/tests/helpers/nexusStudio';

const T0 = new Date('2026-10-16T12:00:00Z');
const strip = (p: StudioProject) => ({ ...p, updatedAt: '' });
const venueOf = (s: CommandStack) => s.doc.venues.find((v) => v.id === s.doc.activeVenueId)!;

describe('the built-in shelf', () => {
  it('has the lamp row, the bleacher pair, the flood corner set and the palm avenue, each a valid group of catalog things', () => {
    const names = builtInStamps().map((s) => s.name);
    for (const n of ['Lamp row', 'Bleacher pair', 'Flood corner set', 'Palm avenue']) expect(names).toContain(n);
    for (const st of builtInStamps()) {
      expect(st.objects.length).toBeGreaterThan(1);
      expect(st.objects.length).toBeLessThanOrEqual(LIMITS.stampObjects);
      // a built-in stamp survives the import sanitiser unchanged (it is data a project file could carry)
      const back = sanitizeProject({ ...everyKindProject(), stamps: [st] });
      expect(back.ok && back.project.stamps?.[0].objects).toEqual(st.objects);
    }
  });
  it('the flood corner set’s floods each tip at the middle; the bleacher pair faces each other', () => {
    const floods = builtInStamps().find((s) => s.name === 'Flood corner set')!.objects;
    for (const f of floods) {
      const heading = [Math.sin(f.t.ry), Math.cos(f.t.ry)], len = Math.hypot(f.t.p[0], f.t.p[2]);
      expect(heading[0]).toBeCloseTo(-f.t.p[0] / len, 6); expect(heading[1]).toBeCloseTo(-f.t.p[2] / len, 6);
    }
    const [a, b] = builtInStamps().find((s) => s.name === 'Bleacher pair')!.objects;
    expect(Math.cos(a.t.ry)).toBeCloseTo(-Math.cos(b.t.ry), 6);
    expect(Math.sign(a.t.p[2])).toBe(-Math.sign(b.t.p[2]));
  });
});

describe('placing a stamp', () => {
  it('is ONE command: fresh ids, centred on the (snapped) view centre, undo exact', () => {
    let s = createStack(everyKindProject());
    const start = strip(s.doc);
    const row = builtInStamps().find((x) => x.name === 'Lamp row')!;
    const r = placeStamp(venueOf(s), row, [10.2, 0, -3.9], DEFAULT_SNAP)!;
    s = execute(s, r.cmd, T0);
    expect(s.past).toHaveLength(1);
    expect(s.past[0].label).toBe('Place Lamp row');
    const placedNow = venueOf(s).objects.filter((o) => r.ids.includes(o.id));
    expect(placedNow).toHaveLength(5);
    expect(r.ids.some((id) => id.startsWith('stamp:'))).toBe(false);
    expect(groupCentre(placedNow)).toEqual([10, 0, -4]);
    // placing the same stamp twice never collides
    const r2 = placeStamp(venueOf(s), row, [0, 0, 0])!;
    expect(r2.ids.some((id) => r.ids.includes(id))).toBe(false);
    s = undo(s, T0);
    expect(strip(s.doc)).toEqual(start);
  });
  it('the placed stamp is in the export (fixtures lit, a crowd seated)', () => {
    const p = everyKindProject();
    const v = p.venues[0];
    v.objects = [];
    for (const name of ['Bleacher pair', 'Flood corner set', 'Palm avenue']) {
      const r = placeStamp(v, builtInStamps().find((x) => x.name === name)!, [0, 0, 0])!;
      v.objects.push(...r.cmd.ops.map((o) => (o as { object: (typeof v.objects)[number] }).object));
    }
    const exp = exportVenue(v);
    expect(exp.crowd?.stands).toHaveLength(2);
    expect(exp.fixtures.filter((f) => f.role === 'flood')).toHaveLength(4);
    expect(exp.kit.filter((k) => k.model === 'tree_palmDetailedTall')).toHaveLength(10);
  });
  it('a stamp that would overfill the venue is refused whole', () => {
    const v = everyKindProject().venues[0];
    v.objects = Array.from({ length: LIMITS.objects - 2 }, (_, i) => placed('fixture:lamp', [i % 40, 0, Math.floor(i / 40)]));
    expect(placeStamp(v, builtInStamps()[0], [0, 0, 0])).toBeNull();
  });
});

describe('the project’s own stamps', () => {
  it('"save selection as stamp" is one step, re-centres the group, drops locked/hidden flags; undo removes the key', () => {
    let s = createStack(everyKindProject());
    const start = strip(s.doc);
    const v = venueOf(s);
    const ids = [v.objects[3].id, v.objects[4].id, v.objects[8].id];
    const r = stampFromSelection(v, ids, '  Night corner \u0007', s.doc)!;
    s = execute(s, r.cmd, T0);
    const st = s.doc.stamps![0];
    expect(st.name).toBe('Night corner');
    expect(st.objects).toHaveLength(3);
    const c = groupCentre(st.objects);
    expect(c[0]).toBeCloseTo(0, 6); expect(c[2]).toBeCloseTo(0, 6);
    expect(st.objects.some((o) => o.hidden || o.locked)).toBe(false);
    expect(allStamps(s.doc).at(-1)!.id).toBe(r.id);
    s = undo(s, T0);
    expect('stamps' in s.doc).toBe(false);
    expect(strip(s.doc)).toEqual(start);
    s = redo(s, T0);
    expect(s.doc.stamps).toHaveLength(1);
  });
  it('rename coalesces per stamp; delete and undo put it back in its place', () => {
    let s = createStack(everyKindProject());
    const v = venueOf(s);
    for (const n of ['A', 'B', 'C']) s = execute(s, stampFromSelection(venueOf(s), [v.objects[0].id], n, s.doc)!.cmd, T0);
    const [, b] = s.doc.stamps!;
    s = execute(s, renameStampCommand(b.id, 'B2'), T0);
    s = execute(s, renameStampCommand(b.id, 'B23'), T0);
    expect(s.past).toHaveLength(4);
    s = execute(s, removeStampCommand(s.doc, b.id)!, T0);
    expect(s.doc.stamps!.map((x) => x.name)).toEqual(['A', 'C']);
    s = undo(s, T0);
    expect(s.doc.stamps!.map((x) => x.name)).toEqual(['A', 'B23', 'C']);
    while (canUndo(s)) s = undo(s, T0);
    expect('stamps' in s.doc).toBe(false);
  });
  it('the project’s stamps survive serialise → parse; a bad stamp object is dropped, an empty stamp is dropped', () => {
    let s = createStack(everyKindProject());
    const v = venueOf(s);
    s = execute(s, stampFromSelection(v, [v.objects[3].id, v.objects[5].id], 'Keep', s.doc)!.cmd, T0);
    const text = serializeProject(s.doc);
    const back = parseProject(text);
    expect(back.ok && back.project.stamps).toEqual(s.doc.stamps);
    const raw = JSON.parse(text);
    raw.stamps.push({ id: 'bad', name: 'Empty', objects: [{ type: 'hoop' }] });
    raw.stamps[0].objects.push({ type: 'goal' });
    const r = sanitizeProject(raw);
    expect(r.ok && r.project.stamps!.map((x) => [x.name, x.objects.length])).toEqual([['Keep', 2]]);
    // a project with no stamps carries no key (an older Studio reads it the same)
    const none = parseProject(serializeProject(everyKindProject()));
    expect(none.ok && 'stamps' in none.project).toBe(false);
  });
});
