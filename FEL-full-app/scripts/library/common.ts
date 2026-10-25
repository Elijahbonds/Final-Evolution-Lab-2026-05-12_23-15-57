// scripts/library/common.ts — EXERCISE-LIBRARY (2026-10-25): helpers the two generators share (import-seed.ts,
// author.ts): the equipment phrase in a set-up line, file writing, and the validation gate a generator runs before it
// writes anything.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { LibraryExercise } from '../../lib/library/types';
import { checkLibrary, type Issue } from '../../lib/library/validate';

export const APP = path.join(__dirname, '..', '..');
export const DATA = path.join(APP, 'data', 'library');

const PHRASE: Record<string, [string, string]> = {
  dumbbell: ['the dumbbells', 'a dumbbell'], kettlebell: ['the kettlebell', 'a kettlebell'], barbell: ['the bar', 'the bar'],
  'trap-bar': ['the trap bar', 'the trap bar'], 'ez-bar': ['the EZ bar', 'the EZ bar'], landmine: ['the landmine bar', 'the landmine bar'],
  cable: ['the cable handles', 'the cable handle'], machine: ['the machine handles', 'the machine handle'], band: ['the band', 'the band'],
  'mini-band': ['the mini band', 'the mini band'], 'medicine-ball': ['the medicine ball', 'the medicine ball'], 'slam-ball': ['the slam ball', 'the slam ball'],
  'stability-ball': ['the stability ball', 'the stability ball'], sandbag: ['the sandbag', 'the sandbag'], plate: ['the plate', 'the plate'],
  sled: ['the sled', 'the sled'], strongman: ['the implement', 'the implement'], 'weight-vest': ['the vest', 'the vest'], dowel: ['the dowel', 'the dowel'],
  'suspension-trainer': ['the straps', 'the strap'], rings: ['the rings', 'a ring'], 'jump-rope': ['the rope', 'the rope'], basketball: ['the ball', 'the ball'],
};

/** Fill a set-up template: `[ … {eq} … ]` is dropped when there is no load to name; a bare {eq} falls back to "the weight". */
export function fillSetup(template: string, equipment: readonly string[], unilateral: boolean): string {
  const loaded = equipment.find((e) => PHRASE[e]);
  const phrase = loaded ? PHRASE[loaded][unilateral ? 1 : 0] : null;
  return template
    .replace(/\[([^\]]*)\]/g, (_, inner: string) => (phrase ? inner.replace('{eq}', phrase) : ''))
    .replace('{eq}', phrase ?? 'the weight')
    .replace(/\s+([,.])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Write entries as a JSON array, one entry per line (reviewable diffs, no pretty-print bloat). */
export function writeEntries(file: string, entries: readonly LibraryExercise[]): number {
  mkdirSync(path.dirname(file), { recursive: true });
  const body = `[\n${entries.map((e) => JSON.stringify(e)).join(',\n')}\n]\n`;
  writeFileSync(file, body);
  return body.length;
}

export function readDir(dir: string): LibraryExercise[] {
  let names: string[] = [];
  try { names = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('SOURCE')).sort(); } catch { return []; }
  return names.flatMap((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as LibraryExercise[]);
}

/** The gate: refuse to continue if the library would fail validation. Prints the first issues. */
export function gate(label: string, entries: readonly LibraryExercise[]): Issue[] {
  const issues = checkLibrary(entries);
  if (issues.length) {
    console.error(`${label}: ${issues.length} validation issue(s); first 40:`);
    for (const i of issues.slice(0, 40)) console.error(`  ${i.id} [${i.check}] ${i.detail}`);
  }
  return issues;
}
