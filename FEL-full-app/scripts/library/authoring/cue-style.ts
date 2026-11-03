// scripts/library/authoring/cue-style.ts — PLAT-P08 (2026-11-02): keep CUE-REWRITE's wording on a generator re-run.
//
// CUE-REWRITE (PR #465, CUE-AUDIT §6) rewrote the authored entries' set-up, cues and faults on disk in the CUE-STYLE
// voice. Most of those lines come from this folder's templates, so a plain re-run of author.ts would have put the old
// wording back. cue-style-rewrites.json records each rewrite as { generated value → the wording on disk }, keyed by the
// generated value's JSON, one table per field; applyCueStyle maps an entry through it, so a re-run writes what is on
// disk (tests/library-p8/generator.test.ts holds that: a re-run of every batch produces no diff). The seed importer
// (../import-seed.ts) maps its family words through the same table: 14 seed set-up templates were rewritten too.
//
// A NEW template line is not in the table and passes through unchanged: write it in the CUE-STYLE voice to begin with.
// To change a rewritten line, edit it on disk AND here (the test will say which entries differ).
import type { LibraryExercise } from '../../../lib/library/types';
import REWRITES from './cue-style-rewrites.json';

type Field = 'setup' | 'cues' | 'faults';
const TABLE = REWRITES as unknown as Record<Field, Record<string, unknown>>;

function restyled<K extends Field>(field: K, value: LibraryExercise[K]): LibraryExercise[K] {
  const hit = TABLE[field][JSON.stringify(value)];
  return hit === undefined ? value : (structuredClone(hit) as LibraryExercise[K]);
}

/** The entry (or the words of one) with its set-up, cues and faults in the CUE-STYLE wording (a new object). */
export function applyCueStyle<T extends Pick<LibraryExercise, Field>>(e: T): T {
  return { ...e, setup: restyled('setup', e.setup), cues: restyled('cues', e.cues), faults: restyled('faults', e.faults) };
}

/** How many rewrites each table holds (for the generator's own log). */
export const CUE_STYLE_COUNTS = { setup: Object.keys(TABLE.setup).length, cues: Object.keys(TABLE.cues).length, faults: Object.keys(TABLE.faults).length };
