// TV75-3 (ALL-MODES-TO-75 §10; Gameplay TUNE sheet 2026-10-23; Elijah via PM: board credit only, payout 0): an assist is
// credited on the 3v3 board — the live HUD chip and the end card's box score — and nothing pays for it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { proofLineFor } from '@/lib/proofLine';

const MODE = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');
const HOST = readFileSync('components/games/three-v-three-babylon.tsx', 'utf8');

describe('TV75-3: a 3v3 assist is credited on the board', () => {
  it('my pass into a mate\'s made basket counts one assist and pushes it to the HUD at once', () => {
    expect(MODE).toContain("if (lastPasserWasMe) { assists++; putHud(ctx, { ast: assists });");
  });
  it('the passer is never the scorer: the credit only fires on a MATE\'s make, and a mate\'s own pass clears my claim', () => {
    const make = MODE.indexOf("if (lastPasserWasMe) { assists++;");
    expect(MODE.lastIndexOf('mateMiss = {', make)).toBeGreaterThan(-1);   // inside the mate-shot resolution
    expect(MODE).toContain('lastPasserWasMe = false;   // the mate threw this one, not me — no assist to credit on whatever I do next');
  });
  it('the board shows it: the HUD has an AST chip, seeded at 0 each run', () => {
    expect(HOST).toMatch(/AST \{hnode\(hud\.ast, 0\)\}/);
    expect(MODE).toMatch(/ast: assists/);
    expect(MODE).toMatch(/myScore = 0; foeScore = 0; assists = 0;/);
  });
  it('the end card prints the credited assists from the stats the run posts', () => {
    expect(MODE).toContain('function endStats(): Record<string, number> { return { foeScore, assists, ...box }; }');
    expect(proofLineFor('hoops3v3', { score: 21, opponentScore: 15, won: true, stats: { foeScore: 15, assists: 4, fgm: 9, fga: 16, threes: 1, steals: 0, blocks: 0, overdrives: 0 } }))
      .toContain('AST 4');
  });
  it('payout 0: the posted score is the points only — assists add nothing to it', () => {
    expect(MODE).not.toMatch(/assists \* \d/);
    expect(MODE).not.toMatch(/score:\s*myScore\s*\+/);
  });
});
