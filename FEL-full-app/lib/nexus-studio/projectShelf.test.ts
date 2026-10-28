// The project list on this device (STUDIO-EASY): the open project keeps its key and format; the others wait on a shelf as the same
// JSON; a swap is all or nothing and never drops a project.
import { describe, expect, it } from 'vitest';
import { PROJECT_KEY, loadProject, saveProject } from './storage';
import { SHELF_KEY, SHELF_MAX, listShelf, readShelved, removeShelved, shelve, swapIn } from './projectShelf';
import { starterProject } from '@/components/nexus-studio/use-studio';
import { memoryKV } from '@/tests/helpers/nexusStudio';

const named = (name: string, at = '2026-10-28T00:00:00.000Z') => ({ ...starterProject(), name, updatedAt: at });

describe('the shelf', () => {
  it('keeps each project as the same JSON the open project is saved as, newest first', () => {
    const kv = memoryKV();
    const a = named('Alpha', '2026-10-01T00:00:00.000Z'), b = named('Bravo', '2026-10-20T00:00:00.000Z');
    expect(shelve(kv, a).ok).toBe(true);
    expect(shelve(kv, b).ok).toBe(true);
    expect(listShelf(kv).map((x) => x.name)).toEqual(['Bravo', 'Alpha']);
    expect(readShelved(kv, a.id)).toEqual(a);
    expect(kv.data.has(PROJECT_KEY)).toBe(false);   // the open project's key is untouched by the shelf
  });
  it('a swap shelves the open project and takes the chosen one off, in one write', () => {
    const kv = memoryKV();
    const open = named('Open one'), other = named('Other one');
    shelve(kv, other);
    const r = swapIn(kv, open, other.id);
    expect(r.ok && r.next).toEqual(other);
    expect(listShelf(kv).map((x) => x.name)).toEqual(['Open one']);
    saveProject(kv, other);
    expect(loadProject(kv)).toEqual(other);
  });
  it('a new project (no id) only shelves the open one', () => {
    const kv = memoryKV();
    const r = swapIn(kv, named('Mine'), null);
    expect(r.ok && r.next).toBeNull();
    expect(listShelf(kv)).toHaveLength(1);
  });
  it('never drops a project: a full shelf, a full device or an unreadable entry refuses and moves nothing', () => {
    const kv = memoryKV();
    for (let i = 0; i < SHELF_MAX; i++) expect(shelve(kv, named(`P${i}`)).ok).toBe(true);
    const before = kv.data.get(SHELF_KEY);
    const full = swapIn(kv, named('One more'), null);
    expect(full.ok).toBe(false);
    expect(kv.data.get(SHELF_KEY)).toBe(before);
    // swapping one in frees its place, so it is allowed when full
    const id = listShelf(kv)[0].id;
    expect(swapIn(kv, named('Swapped out'), id).ok).toBe(true);
    expect(listShelf(kv)).toHaveLength(SHELF_MAX);
    kv.failWrites = 'quota';
    const q = swapIn(kv, named('Q'), listShelf(kv)[0].id);
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.error).toMatch(/out of room/);
    kv.failWrites = false;
    expect(swapIn(kv, named('R'), 'proj_missing').ok).toBe(false);
  });
  it('delete removes only that one; junk under the key reads as an empty shelf', () => {
    const kv = memoryKV();
    const a = named('A'), b = named('B');
    shelve(kv, a); shelve(kv, b);
    removeShelved(kv, a.id);
    expect(listShelf(kv).map((x) => x.name)).toEqual(['B']);
    kv.data.set(SHELF_KEY, '{not json');
    expect(listShelf(kv)).toEqual([]);
    expect(listShelf(null)).toEqual([]);
  });
});
