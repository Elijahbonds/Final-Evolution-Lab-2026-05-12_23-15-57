// SCREEN-FIXES (2026-11-10): the "Learn while you wait" card on every game's start screen ran its text at 12.5 px, off the
// type scale (lib/design/type.ts); the every-screen scorecard counted it as body copy under 16 px on 13 game screens. The
// card renders after a lazy import, so this reads the source: no off-scale size is left, and the card's text takes its
// size from its length (lineSize: more than 12 words is body copy at 16 px).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TYPE, lineSize } from '@/lib/design/type';

const src = readFileSync(join(__dirname, 'learn-while-you-wait.tsx'), 'utf8');

describe('the learn card, on the scale', () => {
  it('has no 12.5 px (or any other off-scale) text size left', () => {
    expect(src).not.toMatch(/text-\[12\.5px\]/);
    for (const m of src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) expect([12, 14, 16, 20, 30], m[0]).toContain(Number(m[1]));
  });
  it('sizes its text by length, so a lesson line reads at 16 px', () => {
    expect(src).toMatch(/<p data-learn-text className=\{`mt-1 \$\{lineSize\(text\)\}/);
    expect(lineSize('Your hamstrings slow the knee down at the end of every sprint stride, which is why they strain.')).toBe(TYPE.body);
    expect(lineSize('Sleep is when muscle is rebuilt.')).toBe(TYPE.small);
  });
});
