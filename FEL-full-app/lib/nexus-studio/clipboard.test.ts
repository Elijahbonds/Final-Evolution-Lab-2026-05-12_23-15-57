// Copy / paste / duplicate (docs/NEXUS-STUDIO.md §11): one command per paste, ids re-minted, landing on the view's centre (or
// offset over its source), across venues of the project, the venue's cap respected, undo exact.
import { describe, expect, it } from 'vitest';
import { createStack, execute, undo, type CommandStack } from './commands';
import { copySelection, duplicateSelection, pasteClip, PASTE_OFFSET } from './clipboard';
import { groupCentre } from './group';
import { LIMITS, newVenue, type StudioProject } from './doc';
import { everyKindProject, placed } from '@/tests/helpers/nexusStudio';

const T0 = new Date('2026-10-16T12:00:00Z');
const strip = (p: StudioProject) => ({ ...p, updatedAt: '' });
const venueOf = (s: CommandStack) => s.doc.venues.find((v) => v.id === s.doc.activeVenueId)!;

describe('copy and paste', () => {
  it('a copy is a deep copy about the group’s centre; editing the venue after does not change it', () => {
    const v = everyKindProject().venues[0];
    const ids = [v.objects[3].id, v.objects[4].id];
    const clip = copySelection(v, ids)!;
    expect(clip.objects.map((o) => o.id)).toEqual(ids);
    expect(clip.centre).toEqual(groupCentre([v.objects[3], v.objects[4]]));
    v.objects[3].t.p[0] = 999;
    expect(clip.objects[0].t.p[0]).not.toBe(999);
    expect(copySelection(v, [])).toBeNull();
  });

  it('a paste lands centred on the view’s centre, keeps the layout, re-mints every id, and is one undo step', () => {
    let s = createStack(everyKindProject());
    const start = strip(s.doc);
    const v = venueOf(s);
    const ids = [v.objects[3].id, v.objects[4].id, v.objects[5].id];
    const clip = copySelection(v, ids)!;
    const r = pasteClip(v, clip, [20, 0, 20])!;
    expect(r.ids).toHaveLength(3);
    for (const id of r.ids) expect(v.objects.some((o) => o.id === id) || ids.includes(id)).toBe(false);
    s = execute(s, r.cmd, T0);
    expect(s.past).toHaveLength(1);
    const pasted = venueOf(s).objects.filter((o) => r.ids.includes(o.id));
    const c = groupCentre(pasted);
    expect(c[0]).toBeCloseTo(20, 6); expect(c[2]).toBeCloseTo(20, 6);
    // the layout is the source's, shifted
    const dx = pasted[0].t.p[0] - v.objects[3].t.p[0];
    expect(pasted[1].t.p[0] - v.objects[4].t.p[0]).toBeCloseTo(dx, 6);
    expect(pasted.map((o) => o.type)).toEqual(['fixture', 'fixture', 'crowdStand']);
    s = undo(s, T0);
    expect(strip(s.doc)).toEqual(start);
  });

  it('pasting over the source (same venue, camera unmoved) steps one offset further each time', () => {
    let s = createStack(everyKindProject());
    const v = venueOf(s);
    let clip = copySelection(v, [v.objects[4].id])!;
    const xs: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = pasteClip(venueOf(s), clip, clip.centre)!;
      s = execute(s, r.cmd, T0); clip = r.clip;
      xs.push(venueOf(s).objects.find((o) => o.id === r.ids[0])!.t.p[0]);
    }
    const x0 = v.objects[4].t.p[0];
    expect(xs).toEqual([x0 + PASTE_OFFSET, x0 + 2 * PASTE_OFFSET, x0 + 3 * PASTE_OFFSET]);
  });

  it('pastes into ANOTHER venue of the project at that venue’s view centre, unlocked', () => {
    const p = everyKindProject();
    const other = newVenue('Second', { spec: 'tennis', target: 'tiebreak' });
    p.venues.push(other);
    const v = p.venues[0];
    v.objects[4].locked = true;
    const clip = copySelection(v, [v.objects[4].id])!;
    const r = pasteClip(other, clip, [3, 0, -2])!;
    expect(r.clip.pastes).toBe(0);   // not over its source: no offset counted
    let s = createStack(p);
    s = execute(s, r.cmd, T0);
    const got = s.doc.venues[1].objects;
    expect(got).toHaveLength(1);
    expect(got[0].t.p).toEqual([3, 0, -2]);
    expect(got[0].locked).toBeUndefined();
    expect(got[0].id).not.toBe(v.objects[4].id);
  });

  it('a clip runs through the import sanitiser (a bad object is dropped, a wild number clamped)', () => {
    const v = everyKindProject().venues[0];
    const clip = copySelection(v, [v.objects[4].id])!;
    clip.objects.push({ ...clip.objects[0], type: 'nope' } as never, { ...clip.objects[0], height: 1e9 } as never);
    const r = pasteClip(v, clip, [0, 0, 0])!;
    expect(r.ids).toHaveLength(2);
    const last = (r.cmd.ops[1] as { object: { height: number } }).object;
    expect(last.height).toBe(LIMITS.fixtureHeight[1]);
  });

  it('a paste that would overfill the venue is refused whole', () => {
    const v = everyKindProject().venues[0];
    const clip = copySelection(v, v.objects.map((o) => o.id))!;
    const full = { ...v, objects: Array.from({ length: LIMITS.objects - 3 }, (_, i) => placed('fixture:lamp', [i % 40, 0, Math.floor(i / 40)])) };
    expect(pasteClip(full, clip, [0, 0, 0])).toBeNull();
  });

  it('Ctrl+D duplicates the selection one offset over, as one step with fresh ids', () => {
    let s = createStack(everyKindProject());
    const v = venueOf(s);
    const ids = [v.objects[0].id, v.objects[1].id];
    const r = duplicateSelection(v, ids)!;
    expect(r.cmd.label).toBe('Duplicate 2 objects');
    s = execute(s, r.cmd, T0);
    const copies = venueOf(s).objects.filter((o) => r.ids.includes(o.id));
    expect(copies[0].t.p[0]).toBeCloseTo(v.objects[0].t.p[0] + PASTE_OFFSET, 6);
    expect(copies[0].t.p[2]).toBeCloseTo(v.objects[0].t.p[2] + PASTE_OFFSET, 6);
    expect(new Set(venueOf(s).objects.map((o) => o.id)).size).toBe(venueOf(s).objects.length);
  });
});
