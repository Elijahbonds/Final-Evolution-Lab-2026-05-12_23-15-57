// The readability floor's mechanical fix (lane/readable, 2026-11-02; docs/READABLE.md). One rule per kind of miss, the
// same everywhere, so the diff reads as one change:
//
//   size     text-[9|9.5|10|10.5|11|11.5px] (any variant) → text-[12px], the type scale's label step (TYPE.label);
//            text-[N rem] under 0.75rem → text-[12px]; inline fontSize N < 12 → 12
//   colour   text-<colour>/<alpha> under AA on the dark surfaces → the same colour at the smallest alpha that clears
//            4.5:1 on every surface (lib/readable/sourceScan.ts minPassingAlpha; white: /50);
//            a grey step that never clears (neutral-500, slate-500/600, zinc-500, neutral-600) → its -400
//
// What it does NOT touch, and lists instead: a file in --skip (another lane is editing it — routed, not edited under
// them), a solid accent that misses (text-fel-violet, text-fel-indigo: the palette is the owner's), disabled: variants.
//
//   npx tsx scripts/readable/codemod.mts [--skip=<file with one path per line>] [--write]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as scanNs from '../../lib/readable/sourceScan.ts';
import * as filesNs from '../../tests/readable/files.ts';

const scan = ((scanNs as { default?: unknown }).default ?? scanNs) as typeof scanNs;
const { readableFiles } = ((filesNs as { default?: unknown }).default ?? filesNs) as typeof filesNs;
const ROOT = resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const skipFile = args.find((a) => a.startsWith('--skip='))?.slice(7);
const skip = new Set(skipFile && existsSync(skipFile) ? readFileSync(skipFile, 'utf8').split('\n').map((s) => s.trim().replace(/^FEL-full-app\//, '')).filter(Boolean) : []);
const WRITE = args.includes('--write');

const GREY_UP: Record<string, string> = { 'neutral-500': 'neutral-400', 'neutral-600': 'neutral-400', 'slate-500': 'slate-400', 'slate-600': 'slate-400', 'zinc-500': 'zinc-400', 'zinc-600': 'zinc-400', 'gray-500': 'gray-400', 'gray-600': 'gray-400', 'stone-500': 'stone-400' };

export function fixSource(src: string): { out: string; size: number; colour: number; left: string[] } {
  let size = 0, colour = 0;
  const left: string[] = [];
  let out = src.replace(/(?<![\w-])((?:[a-z0-9-]+:)*!?)text-\[(\d+(?:\.\d+)?)(px|rem)\]/g, (m, pre: string, n: string, unit: string) => {
    const px = unit === 'rem' ? Number(n) * 16 : Number(n);
    if (px >= 12) return m;
    size++;
    return `${pre}text-[12px]`;
  });
  out = out.replace(/\bfontSize:(\s*)(?:(\d+(?:\.\d+)?)|(['"`])(\d+(?:\.\d+)?)px\3)(?=\s*[,}\n])/g, (m, sp: string, num?: string, q?: string, qn?: string) => {
    const px = Number(num ?? qn);
    if (px >= 12) return m;
    size++;
    return num != null ? `fontSize:${sp}12` : `fontSize:${sp}${q}12px${q}`;
  });
  out = out.replace(/(?<![\w/-])((?:[a-z0-9-]+:)*)(!?)text-([a-z]+(?:-[a-z]+)?(?:-\d{2,3})?)(?:\/(\d{1,3}))?(?![\w\-[/])/g, (m, variants: string, bang: string, name: string, alpha?: string) => {
    if (/(^|:)(group-|peer-)?disabled:/.test(variants)) return m;
    const found = scan.scanTextColours(m);
    if (!found.length) return m;
    if (GREY_UP[name]) { colour++; return `${variants}${bang}text-${GREY_UP[name]}${alpha ? `/${alpha}` : ''}`; }
    const f = found[0];
    if (alpha != null && f.minAlpha != null) { colour++; return `${variants}${bang}text-${name}/${Math.round(f.minAlpha * 100)}`; }
    left.push(m);
    return m;
  });
  return { out, size, colour, left };
}

let files = 0, sizeN = 0, colourN = 0;
const left: Record<string, string[]> = {};
const skipped: string[] = [];
for (const f of readableFiles(ROOT)) {
  const abs = join(ROOT, f);
  const src = readFileSync(abs, 'utf8');
  const r = fixSource(src);
  if (r.out === src && !r.left.length) continue;
  if (skip.has(f)) { skipped.push(f); continue; }
  if (r.left.length) left[f] = r.left;
  if (r.out !== src) { files++; sizeN += r.size; colourN += r.colour; if (WRITE) writeFileSync(abs, r.out); }
}
console.log(`${WRITE ? 'fixed' : 'would fix'}: ${files} files, ${sizeN} sizes, ${colourN} colours`);
console.log(`skipped (another lane's file): ${skipped.length}\n  ${skipped.join('\n  ')}`);
console.log(`left for the owner (a solid accent under AA): ${JSON.stringify(left, null, 1)}`);
