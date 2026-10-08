// PLAYER LEVEL (owner decision 2026-10-06): the curve on PlayerProfile.xp — early levels quick, later ones slower, never
// stuck. These pin the shape the header of lib/player-level.ts promises.
import { describe, expect, it } from 'vitest';
import { LEVEL_BASE, LEVEL_COST_CAP, LEVEL_STEP, levelCost, levelFor, xpForLevel } from './player-level';

describe('levelFor — the curve', () => {
  it('starts at level 1 with nothing into it', () => {
    expect(levelFor(0)).toEqual({ level: 1, into: 0, need: LEVEL_BASE, floor: 0 });
  });

  it('the boundaries in the header, exactly', () => {
    expect(xpForLevel(2)).toBe(500);
    expect(xpForLevel(5)).toBe(3_500);
    expect(xpForLevel(10)).toBe(13_500);
    expect(xpForLevel(20)).toBe(52_250);
    expect(xpForLevel(30)).toBe(116_000);
    expect(xpForLevel(50)).toBe(318_500);
  });

  it('a level starts exactly at its boundary, one XP short is the level below', () => {
    for (const l of [2, 3, 10, 37, 58, 59, 60, 61, 120]) {
      const at = xpForLevel(l);
      expect(levelFor(at), `at ${at}`).toMatchObject({ level: l, into: 0, floor: at });
      expect(levelFor(at - 1).level, `below ${at}`).toBe(l - 1);
    }
  });

  it('early levels are quick: one ordinary run (~650 XP) takes a new player past level 2', () => {
    expect(levelFor(650).level).toBe(2);
    expect(levelCost(1)).toBe(LEVEL_BASE);
  });

  it('later levels are slower: each costs more than the last until the cap, then the cap', () => {
    let prev = 0;
    for (let l = 1; l < 59; l++) {
      expect(levelCost(l)).toBe(prev === 0 ? LEVEL_BASE : prev + LEVEL_STEP);
      prev = levelCost(l);
    }
    expect(levelCost(59)).toBe(LEVEL_COST_CAP);
    expect(levelCost(500)).toBe(LEVEL_COST_CAP);
  });

  it('never stuck: past the cap every level still costs the cap, and a huge total reads in one step', () => {
    const big = levelFor(1e12);
    expect(big.need).toBe(LEVEL_COST_CAP);
    expect(big.level).toBeGreaterThan(60_000);
    expect(big.floor + big.into).toBe(1e12);
    expect(levelFor(xpForLevel(80) + 5)).toMatchObject({ level: 80, into: 5 });
  });

  it('monotone: more XP is never a lower level, and into < need always', () => {
    let last = 1;
    for (let xp = 0; xp < 1_200_000; xp += 977) {
      const r = levelFor(xp);
      expect(r.level).toBeGreaterThanOrEqual(last);
      expect(r.into).toBeLessThan(r.need);
      expect(r.floor + r.into).toBe(xp);
      last = r.level;
    }
  });

  it('a missing, negative or non-finite total reads as level 1', () => {
    for (const bad of [-5, NaN, Infinity, -Infinity, undefined as unknown as number]) expect(levelFor(bad)).toMatchObject({ level: 1, into: 0 });
  });
});
