// QA P2-05 (2026-09-27): a first visit to Brain Brawl read "best 0" on the PLAYERS pick — a personal best nobody set.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { bestLine } from './BrainBrawlMode';

describe('Brain Brawl\'s best', () => {
  it('no prior run says "first run", never "best 0"', () => {
    expect(bestLine(0)).toBe('first run');
    expect(bestLine(0)).not.toMatch(/best 0/);
  });
  it('a real best reads as before', () => {
    expect(bestLine(549)).toBe('best 549');
  });
  it('the pick hint and the end board read through it (the board drops "best" when there is none)', () => {
    const src = readFileSync(path.resolve(__dirname, 'BrainBrawlMode.ts'), 'utf8');
    expect(src).toContain('solo · five categories · ${bestLine(S.best)}');
    expect(src).toContain("boardTitle: `${claimed} / 5 CLAIMED${S.best > 0 ? ` · ${bestLine(S.best)}` : ''}`");
    expect(src).not.toMatch(/best \$\{S\.best\}/);
  });
});
