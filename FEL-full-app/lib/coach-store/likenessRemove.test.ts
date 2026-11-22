import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LIKENESS-REMOVE (Elijah, Oct 16 2026): the person in the banned YouTube video (ID below, split) is NOT Elijah.
 * No catalog, seed or store data may reference that video. Elijah approved removing it (Nov 20 2026, 6:02-6:03 PM PT),
 * including deleting its fixture file.
 */
const BANNED_ID = ['dAoLYThf', '1bc'].join('');   // split so this guard file never matches its own scan

const APP = join(__dirname, '..', '..');
const SCAN = [
  join(APP, 'lib', 'coach-store'),
  join(APP, 'scripts', 'seed.ts'),
  join(APP, '..', 'scripts', 'seed.ts'),
];

function files(p: string): string[] {
  let st;
  try { st = statSync(p); } catch { return []; }
  if (st.isFile()) return [p];
  return readdirSync(p).flatMap((n) => (n === 'node_modules' ? [] : files(join(p, n))));
}

describe('LIKENESS-REMOVE: the dAoLYThf… video is referenced by no catalog, seed or store data', () => {
  it('no file under lib/coach-store (fixtures included) or either seed.ts contains the ID', () => {
    const hits = SCAN.flatMap(files).filter((f) => readFileSync(f, 'utf8').includes(BANNED_ID));
    expect(hits).toEqual([]);
  });
  it('its catalog fixture is gone', () => {
    expect(files(join(APP, 'lib', 'coach-store', 'fixtures', 'youtube-catalog')).some((f) => f.includes(BANNED_ID))).toBe(false);
  });
});
