// THE READABILITY FLOOR, IN SOURCE (lane/readable, 2026-11-02; docs/READABLE.md). Owner: "We need to make sure people
// can read what they're looking at always."
//
// Two ratchets over every user-facing file (app/, components/, lib/ — app/dev, tests and scans aside):
//   size     no Tailwind `text-[Npx]` / `text-[Nrem]` and no inline `fontSize` under 12 px (lib/readable/rules.ts minPx)
//   colour   no `text-<colour>[/<alpha>]` under WCAG AA (4.5:1) on the app's dark text surfaces (lib/design/tokens.ts)
//
// A file's count may never rise above its line in tests/readable/source-baseline.json, and a file with no line is held to
// zero. The lines that remain are files other lanes were editing when the floor went in (routed to them, not edited
// under them — docs/READABLE.md "Routed") and the reviewed exceptions; each count may only go down. When you fix one,
// lower its number (or delete the line): `npx tsx scripts/readable/source-baseline.mts --write` rewrites the file from
// the tree, and the diff shows exactly what moved.
//
// The fix for a size is the type scale's label step (`text-[12px]`, TYPE.label); for a colour, the ladder's
// text-fel-quiet / text-fel-dim or the alpha scanTextColours reports as `minAlpha` (text-white/50 clears every surface).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanFontSizes, scanTextColours } from '@/lib/readable/sourceScan';
import { readableFiles } from './files';

const ROOT = join(__dirname, '../..');
const BASELINE = JSON.parse(readFileSync(join(__dirname, 'source-baseline.json'), 'utf8')) as {
  files: Record<string, { size?: number; colour?: number; why?: string }>;
};

describe('the readability floor in source', () => {
  const files = readableFiles(ROOT);
  const counts = files.map((f) => {
    const src = readFileSync(join(ROOT, f), 'utf8');
    return { f, size: scanFontSizes(src), colour: scanTextColours(src) };
  });

  it('scans the user-facing tree (a walker that found nothing would pass everything)', () => {
    expect(files.length).toBeGreaterThan(1500);
    expect(files).toContain('components/shell/tab-bar.tsx');
    expect(files.some((f) => f.startsWith('app/dev/'))).toBe(false);
  });

  it('no file has more text under 12 px than its baseline (a new file: none)', () => {
    const over = counts
      .filter((c) => c.size.length > (BASELINE.files[c.f]?.size ?? 0))
      .map((c) => `${c.f}: ${c.size.length} > ${BASELINE.files[c.f]?.size ?? 0}  ${c.size.map((s) => `L${s.line} ${s.match}`).join(', ')}`);
    expect(over, 'use text-[12px] (TYPE.label) or larger — docs/READABLE.md').toEqual([]);
  });

  it('no file has more sub-AA text colours than its baseline (a new file: none)', () => {
    const over = counts
      .filter((c) => c.colour.length > (BASELINE.files[c.f]?.colour ?? 0))
      .map((c) => `${c.f}: ${c.colour.length} > ${BASELINE.files[c.f]?.colour ?? 0}  ${c.colour.map((s) => `L${s.line} ${s.match} ${s.ratio}:1${s.minAlpha ? ` (≥ /${Math.round(s.minAlpha * 100)})` : ''}`).join(', ')}`);
    expect(over, 'use text-fel-dim / text-fel-quiet, or the alpha shown — docs/READABLE.md').toEqual([]);
  });

  it('the baseline only names files that exist and still need their line', () => {
    const now = new Map(counts.map((c) => [c.f, c]));
    const stale = Object.keys(BASELINE.files).filter((f) => {
      const c = now.get(f);
      return !c || (c.size.length === 0 && c.colour.length === 0);
    });
    expect(stale, 'delete these lines: the file is clean (or gone)').toEqual([]);
  });
});
