// THE PLAYER LEVEL BAR (IMPROVE 2026-10-06): one segment per level a run crossed, read off lib/player-level.ts.
import { describe, expect, it } from 'vitest';
import { levelFill, MAX_LEVEL_SEGMENTS } from './level-bar';
import { levelCost, xpForLevel } from '@/lib/player-level';

describe('levelFill', () => {
  it('inside a level: one segment from where the run started to where it ended, no crossing', () => {
    const f = levelFill(xpForLevel(10) + 900, 400)!;
    expect(f).toMatchObject({ levelBefore: 10, levelAfter: 10, levelUps: 0 });
    expect(f.segments).toEqual([{ level: 10, from: 500, to: 900, need: levelCost(10), crossed: false }]);
  });

  it('across a level: fill to the end, LEVEL UP, then 0 → where it ended', () => {
    const f = levelFill(xpForLevel(10) + 100, 300)!;
    expect(f).toMatchObject({ levelBefore: 9, levelAfter: 10, levelUps: 1 });
    expect(f.segments).toEqual([
      { level: 9, from: levelCost(9) - 200, to: levelCost(9), need: levelCost(9), crossed: true },
      { level: 10, from: 0, to: 100, need: levelCost(10), crossed: false },
    ]);
  });

  it('several levels in one run (a new player\'s big first win): each whole level fills, capped to what the bar can show', () => {
    const f = levelFill(9_000, 9_000)!;   // level 1 → level 8
    expect(f.levelBefore).toBe(1);
    expect(f.levelUps).toBe(f.levelAfter - 1);
    expect(f.levelUps).toBeGreaterThan(MAX_LEVEL_SEGMENTS);
    expect(f.segments).toHaveLength(MAX_LEVEL_SEGMENTS);
    expect(f.segments[0]).toMatchObject({ level: 1, from: 0, crossed: true });
    expect(f.segments[f.segments.length - 1]).toMatchObject({ level: f.levelAfter, crossed: false });
  });

  it('a level boundary exactly: the run that lands on it levels up and starts the new level at 0', () => {
    const f = levelFill(xpForLevel(5), 50)!;
    expect(f).toMatchObject({ levelBefore: 4, levelAfter: 5, levelUps: 1 });
    expect(f.segments[1]).toEqual({ level: 5, from: 0, to: 0, need: levelCost(5), crossed: false });
  });

  it('missing numbers: no bar (the answer had no profileXp); a gain above the total is clamped, never negative', () => {
    expect(levelFill(undefined, 100)).toBeNull();
    expect(levelFill(500, undefined)).toBeNull();
    expect(levelFill(-1, 10)).toBeNull();
    expect(levelFill(300, 9_999)).toMatchObject({ levelBefore: 1, levelAfter: 1, levelUps: 0 });
  });
});
