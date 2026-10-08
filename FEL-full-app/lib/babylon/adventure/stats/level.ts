/**
 * The Adventure level (ADVENTURE PLAN A3, 2026-10-06): its own XP and its own curve, separate from the account level.
 *
 * WHY SEPARATE. The plan's open decision 4 recommends it ("so sports play cannot level the story"), and nothing here
 * reads or writes PlayerProfile.xp: the Adventure's XP lives in its save. The SHAPE is lib/player-level.ts's (a cost
 * per level that grows by a fixed step, read as a `LevelInfo`), with smaller numbers because Adventure XP comes in
 * per KO and per trick, not per session.
 *
 * THE CURVE [TUNE]: level L → L+1 costs 100 + 60 × (L − 1). Level 2 at 100 XP, level 10 at 3,060, level 50 (the cap)
 * at 75,460. XP past the cap is not kept, so a save cannot grow without bound.
 *
 * Pure: no Babylon, no clock.
 */
import type { LevelInfo } from '@/lib/player-level';

/** [TUNE] XP from level 1 to level 2. */
export const ADV_LEVEL_BASE = 100;
/** [TUNE] Each level costs this much more than the last. */
export const ADV_LEVEL_STEP = 60;
/** [TUNE] The top level. */
export const ADVENTURE_LEVEL_CAP = 50;

const clampLevel = (level: number): number =>
  Number.isFinite(level) ? Math.max(1, Math.min(ADVENTURE_LEVEL_CAP, Math.floor(level))) : 1;

/** XP to go from `level` to `level + 1`. 0 at the cap (there is no next level). */
export function adventureLevelCost(level: number): number {
  const l = clampLevel(level);
  return l >= ADVENTURE_LEVEL_CAP ? 0 : ADV_LEVEL_BASE + ADV_LEVEL_STEP * (l - 1);
}

/** Total XP at which `level` starts. */
export function xpForAdventureLevel(level: number): number {
  const l = clampLevel(level);
  // Σ_{k=1}^{l-1} (BASE + STEP (k − 1)) in closed form.
  const n = l - 1;
  return n * ADV_LEVEL_BASE + (ADV_LEVEL_STEP * n * (n - 1)) / 2;
}

/** The most XP a save keeps: exactly the cap's floor. */
export const ADVENTURE_XP_MAX = xpForAdventureLevel(ADVENTURE_LEVEL_CAP);

/** Clamp a total to [0, ADVENTURE_XP_MAX]; junk reads as 0. */
export function clampAdventureXp(xp: number): number {
  return Number.isFinite(xp) ? Math.max(0, Math.min(ADVENTURE_XP_MAX, Math.floor(xp))) : 0;
}

/** The level a total reads as (player-level.ts's LevelInfo shape; `need` is 0 at the cap). */
export function adventureLevelFor(xp: number): LevelInfo {
  const total = clampAdventureXp(xp);
  let level = 1;
  // At most 49 iterations; called on an XP award, never per frame.
  while (level < ADVENTURE_LEVEL_CAP && total >= xpForAdventureLevel(level + 1)) level++;
  const floor = xpForAdventureLevel(level);
  return { level, into: total - floor, need: adventureLevelCost(level), floor };
}

/** Add XP to a progress record in place. Returns the levels gained (0 when none). Negative or junk amounts add nothing. */
export function addAdventureXp(progress: { level: number; xp: number }, amount: number): number {
  if (!(amount > 0) || !Number.isFinite(amount)) return 0;
  const before = adventureLevelFor(progress.xp).level;
  progress.xp = clampAdventureXp(progress.xp + amount);
  const after = adventureLevelFor(progress.xp).level;
  progress.level = after;
  return after - before;
}
