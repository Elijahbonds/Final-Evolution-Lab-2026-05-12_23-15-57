// READ TIME (lane/readable, 2026-11-02; docs/READABLE.md): a message that goes away by itself stays up for words × 0.3 s
// + 1 s. The shared primitives apply it (JuiceKit's banner and callout, the HUD lower third, felToast, readToast); this
// holds them to it, and holds every literal sonner toast to sonner's own 4 s — a longer one goes through readToast.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { minReadMs } from '@/lib/readable/rules';
import { lowerThirdHoldMs, LOWER_THIRD_MS } from '@/components/games/tv-hud/lower-third';
import { readableFiles } from './files';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('the shared message primitives keep a message up for its read time', () => {
  it('JuiceKit: banner and callout both hold for readableMs, and one banner replaces the last', () => {
    const src = read('lib/babylon/premium/JuiceKit.ts');
    expect(src.match(/const hold = readableMs\(text, ms\)/g)?.length).toBe(2);
    expect(src).toMatch(/this\.bannerEl\?\.remove\(\)/);
  });
  it('the lower third: "UP NEXT · PLAYER 2 · DUNK 4 OF 6 · WINDMILL" is 3.7 s, not 2.4 s', () => {
    expect(lowerThirdHoldMs(LOWER_THIRD_MS, 'UP NEXT', 'PLAYER 2', 'DUNK 4 OF 6 · WINDMILL')).toBe(3700);
    expect(lowerThirdHoldMs(LOWER_THIRD_MS, 'GO')).toBe(LOWER_THIRD_MS);
  });
  it('felToast and readToast set the duration from the words', () => {
    const src = read('components/ui/fel/toast.ts');
    expect(src).toMatch(/duration: readableMs\(/);
    expect(src).toMatch(/export const readToast/);
  });
});

describe('every literal sonner toast reads inside sonner’s 4 s (a longer one uses readToast)', () => {
  it('no long literal through toast() directly', () => {
    const lit = String.raw`(['"\`])((?:\\.|(?!\1).)*)\1`;
    const re = new RegExp(String.raw`(?<![\w.])toast(?:\.(?:success|error|warning|info|message))?\(\s*${lit}`, 'g');
    const long: string[] = [];
    for (const f of readableFiles(ROOT)) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      if (!/from 'sonner'/.test(src)) continue;
      for (const m of src.matchAll(re)) {
        const text = m[2].replace(/\$\{[^}]*\}/g, 'X');
        if (minReadMs(text) > 4000) long.push(`${f}:${src.slice(0, m.index).split('\n').length} "${text.slice(0, 60)}"`);
      }
    }
    expect(long, 'use readToast from @/components/ui/fel/toast').toEqual([]);
  });
});
