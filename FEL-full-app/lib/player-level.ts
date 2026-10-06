// PLAYER LEVEL (owner decision, 2026-10-06): "add a level curve on the EXISTING account XP (PlayerProfile.xp) — a pure
// function levelFor(xp) with a gentle curve … early levels quick, later ones slower, no reward changes."
//
// A level is a READING of PlayerProfile.xp, nothing more: no column, no grant, no payout reads it. The profile shows it
// where the XP shows, and the end card fills its bar and says LEVEL UP when a run crosses one. Pure and import-free, so
// the browser and the server read the same curve.
//
// THE CURVE (TUNED, IMPROVE (2026-10-06)): level L → L+1 costs LEVEL_BASE + LEVEL_STEP × (L − 1) XP, never more than
// LEVEL_COST_CAP. What a run pays (lib/session-payout.ts sessionXp: 1.5 × score + 50 on a win, + 10 otherwise; the
// measured runs in lib/sessions/modeScoreRules.ts put most modes' runs between ~650 and ~6,000 XP) reads like this:
//
//   level 2       500 XP total    one ordinary run
//   level 5     3,500             an evening's first few runs
//   level 10   13,500             ~4–5 days of casual play (2 runs a day, ~1,500 XP a run)
//   level 20   52,250             ~2½ weeks casual, ~9 days committed (4 runs a day)
//   level 30  116,000             ~5½ weeks casual
//   level 50  318,500             ~3½ months casual, ~7½ weeks committed
//
// Each level costs 250 XP more than the last, so the early ones come every run or two and the later ones every few
// days. From level 59 on every level costs the cap (15,000 XP: ~5 casual days, ~2½ committed), so a long-time player
// still levels — a curve that kept growing would stop moving for the people who play most. There is no top level.
// The daily XP cap (lib/economy-caps.ts DAILY_XP_CAP, 50,000) bounds how fast anyone climbs.

/** XP from level 1 to level 2. TUNED (2026-10-06). */
export const LEVEL_BASE = 500;
/** Each level after costs this much more than the one before. TUNED (2026-10-06). */
export const LEVEL_STEP = 250;
/** No single level ever costs more than this. TUNED (2026-10-06). */
export const LEVEL_COST_CAP = 15_000;

/** XP to go from `level` to `level + 1` (levels start at 1). */
export function levelCost(level: number): number {
  const l = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  return Math.min(LEVEL_COST_CAP, LEVEL_BASE + LEVEL_STEP * (l - 1));
}

export interface LevelInfo {
  /** 1-based. */
  level: number;
  /** XP into this level. */
  into: number;
  /** XP this level needs to reach the next one. */
  need: number;
  /** Total XP at which this level started. */
  floor: number;
}

/** PURE: the level a total XP reads as. A missing, negative or non-finite total reads as level 1 with nothing into it. */
export function levelFor(xp: number): LevelInfo {
  let left = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  let level = 1;
  let floor = 0;
  // the growing part of the curve, one level at a time (it ends at the cap, under 60 steps)
  while (levelCost(level) < LEVEL_COST_CAP) {
    const c = levelCost(level);
    if (left < c) return { level, into: left, need: c, floor };
    left -= c;
    floor += c;
    level += 1;
  }
  // the flat part: whole levels at the cap, in one division (a huge total costs nothing to read)
  const whole = Math.floor(left / LEVEL_COST_CAP);
  return { level: level + whole, into: left - whole * LEVEL_COST_CAP, need: LEVEL_COST_CAP, floor: floor + whole * LEVEL_COST_CAP };
}

/** Total XP at which `level` starts. */
export function xpForLevel(level: number): number {
  const target = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  let total = 0;
  for (let l = 1; l < target; l++) {
    const c = levelCost(l);
    if (c >= LEVEL_COST_CAP) return total + (target - l) * LEVEL_COST_CAP;
    total += c;
  }
  return total;
}
