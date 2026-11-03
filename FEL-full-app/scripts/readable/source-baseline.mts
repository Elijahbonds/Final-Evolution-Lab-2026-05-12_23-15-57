// The readability floor's baseline (tests/readable/source-baseline.json), counted from the tree. lane/readable, 2026-11-02.
//
//   npx tsx scripts/readable/source-baseline.mts            print the counts and the totals (no write)
//   npx tsx scripts/readable/source-baseline.mts --write    rewrite the baseline from the tree, keeping each line's `why`
//
// Only lower numbers should ever reach a commit: the test fails a file whose count rises, so a rewrite that RAISES a line
// is a new miss hidden in the baseline — read the diff.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as scanNs from '../../lib/readable/sourceScan.ts';
import * as filesNs from '../../tests/readable/files.ts';

const scan = ((scanNs as { default?: unknown }).default ?? scanNs) as typeof scanNs;
const { readableFiles } = ((filesNs as { default?: unknown }).default ?? filesNs) as typeof filesNs;
const ROOT = resolve(import.meta.dirname, '../..');
const FILE = join(ROOT, 'tests/readable/source-baseline.json');
const old = existsSync(FILE) ? (JSON.parse(readFileSync(FILE, 'utf8')) as { files: Record<string, { why?: string }> }).files : {};

const files: Record<string, { size?: number; colour?: number; why?: string }> = {};
let size = 0, colour = 0;
for (const f of readableFiles(ROOT)) {
  const src = readFileSync(join(ROOT, f), 'utf8');
  const s = scan.scanFontSizes(src).length, c = scan.scanTextColours(src).length;
  size += s; colour += c;
  if (s || c) files[f] = { ...(s ? { size: s } : {}), ...(c ? { colour: c } : {}), ...(old[f]?.why ? { why: old[f].why } : {}) };
}
console.log(`files over the floor: ${Object.keys(files).length}; text under 12 px: ${size}; sub-AA text colours: ${colour}`);
if (process.argv.includes('--write')) {
  writeFileSync(FILE, JSON.stringify({
    note: 'tests/readable/source-floor.test.ts: a file may not rise above its line; numbers only go down. docs/READABLE.md.',
    totals: { size, colour },
    files,
  }, null, 1) + '\n');
  console.log(`wrote ${FILE}`);
}
