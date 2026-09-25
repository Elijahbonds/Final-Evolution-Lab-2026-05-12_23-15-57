// PENALTY'S HUD SCORE IS ONE TYPE (HOTFIX 2026-09-24).
//
// Net/precision phase 3 made the post-kick HUD writes the NUMBER the result reports (goals x20 + style), but nextKick
// still wrote the board as a string, `${goals}–${themGoals}`, at the start of every kick. The timing host prints a
// number as "N PTS" and a string as-is, so the chip flipped '2–1' → '40 PTS' inside every kick, and the mechanics probe
// (Number.isFinite) read a null score for any run that had not ended. The goals board lives in the kicks panel
// (kicksHud: goals / themGoals / pips); `score` is only ever the number. This pins every write in the mode to it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = readFileSync(path.join(__dirname, 'precisionModes.ts'), 'utf8');
/** PenaltyMode's own block and nothing after it: from its declaration to the `})();` that closes its IIFE at column 0
 *  (the mode blocks in this file close that way; anything nested is indented). A mode added below it later is not
 *  held to penalty's score formula. */
function penaltyBlock(src: string): string {
  const start = src.indexOf('export const PenaltyMode');
  if (start < 0) return '';
  const close = src.indexOf('\n})();', start);
  return close < 0 ? src.slice(start) : src.slice(start, close + '\n})();'.length);
}
const PENALTY = penaltyBlock(SRC);

describe('the penalty block is bounded', () => {
  it('found PenaltyMode, and stops at its own closing IIFE', () => {
    expect(PENALTY.startsWith('export const PenaltyMode')).toBe(true);
    expect(PENALTY.endsWith('\n})();')).toBe(true);
    expect(PENALTY.slice(1)).not.toMatch(/\nexport const \w+/);   // no second mode inside it
  });

  it('a mode appended after PenaltyMode is left out of it', () => {
    const later = `${SRC}\nexport const LaterMode: ModeDefinition = (() => {\n  ctx.setHud({ score: \`\${a}–\${b}\` });\n})();\n`;
    const block = penaltyBlock(later);
    expect(block).toBe(PENALTY);
    expect(block).not.toContain('LaterMode');
  });
});

describe('penalty: the HUD score', () => {
  const writes = [...PENALTY.matchAll(/\bscore:\s*([^,\n}]+)/g)].map((m) => m[1].trim());

  it('is written at build, at every kick, after your kick and after theirs', () => {
    expect(writes.length).toBeGreaterThanOrEqual(4);
  });

  it('is never a string — no template, no quoted board', () => {
    for (const w of writes) expect(w, w).not.toMatch(/^[`'"]/);
  });

  it('is the number the result reports, or the zero it starts from', () => {
    for (const w of writes) expect(['0', 'goals * 20 + stylePts'], w).toContain(w);
    const ends = [...PENALTY.matchAll(/ctx\.end\([^,]+,\s*([^,\n]+),/g)].map((m) => m[1].trim());
    expect(ends.length).toBeGreaterThan(0);
    for (const e of ends) expect(e).toBe('goals * 20 + stylePts');
  });
});
