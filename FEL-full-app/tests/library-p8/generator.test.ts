// PLAT-P08 (2026-11-02): a re-run of the library generator writes what is on disk. CUE-REWRITE (PR #465) rewrote the
// authored entries' wording on disk; author.ts now maps its template output through ./authoring/cue-style.ts, so a
// re-run no longer puts the old wording back. This test re-builds every authored batch from the seed on disk and
// compares each entry, whole, with its file.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAll } from '@/scripts/library/author';
import { DATA, readDir } from '@/scripts/library/common';
import { seedWords } from '@/scripts/library/import-seed';
import { GENERAL_FAMILY, SEED_FAMILIES } from '@/scripts/library/seedFamilies';

describe('library generator re-run', () => {
  const seed = readDir(path.join(DATA, 'seed'));
  const disk = readDir(path.join(DATA, 'authored'));
  const { batches } = buildAll(seed);
  const built = [...batches.values()].flat();

  it('builds every authored entry on disk, and nothing else', () => {
    expect(built.length).toBe(disk.length);
    expect(new Set(built.map((e) => e.id))).toEqual(new Set(disk.map((e) => e.id)));
  });

  it('produces no diff: every entry, every field, is what is on disk', () => {
    const onDisk = new Map(disk.map((e) => [e.id, e]));
    const differ = built.filter((e) => JSON.stringify(e) !== JSON.stringify(onDisk.get(e.id))).map((e) => e.id);
    expect(differ).toEqual([]);
  });

  it('control: the CUE-STYLE step is what makes it so (the table holds the rewritten wording that is on disk)', async () => {
    const REWRITES = (await import('@/scripts/library/authoring/cue-style-rewrites.json')).default as Record<string, Record<string, unknown>>;
    const rewritten = new Set(Object.values(REWRITES.cues).map((v) => JSON.stringify(v)));
    const old = new Set(Object.keys(REWRITES.cues));
    // entries whose cues on disk are a rewrite: a re-run without the step would have written the old wording into them
    expect(disk.filter((e) => rewritten.has(JSON.stringify(e.cues))).length).toBeGreaterThan(600);
    // and no entry is built with the old wording
    expect(built.filter((e) => old.has(JSON.stringify(e.cues)) && !rewritten.has(JSON.stringify(e.cues)))).toEqual([]);
  });
});

// The seed importer needs the free-exercise-db download to re-run whole, but an entry's words are a pure function of
// what it stores (family, equipment, laterality): so a re-import's words are checked here against every seed entry.
describe('library seed re-import (its words)', () => {
  const seed = readDir(path.join(DATA, 'seed'));
  const families = new Map([...SEED_FAMILIES, GENERAL_FAMILY].map((f) => [f.id, f]));

  it('every seed entry names a family the importer knows', () => {
    expect(seed.length).toBeGreaterThan(800);
    expect(seed.filter((e) => !families.has(e.family)).map((e) => e.id)).toEqual([]);
  });

  it('produces no diff: set-up, cues and faults are what is on disk', () => {
    const differ = seed.filter((e) => {
      const w = seedWords(families.get(e.family)!, e.equipment, e.laterality);
      return JSON.stringify([w.setup, w.cues, w.faults]) !== JSON.stringify([e.setup, e.cues, e.faults]);
    }).map((e) => e.id);
    expect(differ).toEqual([]);
  });
});
