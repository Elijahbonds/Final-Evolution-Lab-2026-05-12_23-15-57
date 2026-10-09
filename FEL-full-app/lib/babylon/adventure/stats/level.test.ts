// A3 Adventure level curve (docs/ADVENTURE-PLAN.md A3: next level at 100 + 60 (level − 1), cap 50).
import { describe, expect, it } from 'vitest';
import {
  ADVENTURE_LEVEL_CAP, ADVENTURE_XP_MAX, addAdventureXp, adventureLevelCost, adventureLevelFor, clampAdventureXp,
  xpForAdventureLevel,
} from './level';

describe('Adventure level curve', () => {
  it('costs 100 + 60 (L − 1) per level, nothing at the cap', () => {
    expect(adventureLevelCost(1)).toBe(100);
    expect(adventureLevelCost(2)).toBe(160);
    expect(adventureLevelCost(10)).toBe(640);
    expect(adventureLevelCost(49)).toBe(100 + 60 * 48);
    expect(adventureLevelCost(50)).toBe(0);
    expect(adventureLevelCost(Number.NaN)).toBe(100);
  });

  it('floors are the running sum of costs; the closed form agrees with the loop', () => {
    let total = 0;
    for (let l = 1; l <= ADVENTURE_LEVEL_CAP; l++) {
      expect(xpForAdventureLevel(l)).toBe(total);
      total += adventureLevelCost(l);
    }
    expect(ADVENTURE_XP_MAX).toBe(75460);
  });

  it('reads a total as a level, at every boundary', () => {
    expect(adventureLevelFor(0)).toEqual({ level: 1, into: 0, need: 100, floor: 0 });
    expect(adventureLevelFor(99).level).toBe(1);
    expect(adventureLevelFor(100).level).toBe(2);
    expect(adventureLevelFor(259).level).toBe(2);
    expect(adventureLevelFor(260).level).toBe(3);
    for (let l = 1; l <= ADVENTURE_LEVEL_CAP; l++) expect(adventureLevelFor(xpForAdventureLevel(l)).level).toBe(l);
    expect(adventureLevelFor(1e9)).toEqual({ level: 50, into: 0, need: 0, floor: ADVENTURE_XP_MAX });
    expect(adventureLevelFor(-5).level).toBe(1);
    expect(clampAdventureXp(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('addAdventureXp levels up in place, reports the levels gained, ignores junk and stops at the cap', () => {
    const p = { level: 1, xp: 0 };
    expect(addAdventureXp(p, 50)).toBe(0);
    expect(addAdventureXp(p, 300)).toBe(2);   // 350 → level 3 (260..479)
    expect(p).toEqual({ level: 3, xp: 350 });
    expect(addAdventureXp(p, -10)).toBe(0);
    expect(addAdventureXp(p, Number.NaN)).toBe(0);
    expect(addAdventureXp(p, 1e9)).toBe(47);
    expect(p.xp).toBe(ADVENTURE_XP_MAX);
    expect(addAdventureXp(p, 100)).toBe(0);
  });
});
