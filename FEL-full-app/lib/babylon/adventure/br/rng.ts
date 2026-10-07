/**
 * The BR's randomness (ADVENTURE PLAN: "no randomness except a seeded one passed in"). One match seed feeds every
 * stream — the zone's centres, the loot rolls, each bot's brain — through `forkSeed`, so the same seed and the same
 * inputs replay the same match (the property Phase D's host handover and a dedicated server rely on).
 *
 * THE WRAP. The plan reuses RivalCombatBrain for the bots, and its inner RivalFightBrain (core/FightCore.ts) draws from
 * `Math.random` directly — A2 found it and left the brain out for that reason. The core file stays import-only (its
 * owner's), so `withSeededRandom` lends the brain the bot's own seeded generator for the length of ONE synchronous
 * call and puts the real one back in a `finally`: nothing else can run inside the call (no await, no callback out), so
 * nothing else ever draws from the lent stream, and the brain's every roll comes from the bot's seed.
 */

import { seededRng } from '../combat';

export { seededRng };

/** A child seed for stream `salt` of a match seed (a stable integer hash; never 0). */
export function forkSeed(seed: number, salt: number | string): number {
  let h = (seed >>> 0) ^ 0x9e3779b9;
  const s = typeof salt === 'number' ? String(salt) : salt;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x85ebca6b);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) || 1;
}

/** A uniform pick from `[lo, hi)`. */
export const between = (rng: () => number, lo: number, hi: number): number => lo + (hi - lo) * rng();

/** A pick by weight (weights ≥ 0); -1 when every weight is zero. */
export function pickWeighted(rng: () => number, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  if (!(total > 0)) return -1;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/**
 * Run `fn` with the global random source replaced by `rng`, and restore it whatever happens. For core code that reads
 * the global source and may not be edited (RivalFightBrain). `fn` must be synchronous.
 */
export function withSeededRandom<T>(rng: () => number, fn: () => T): T {
  const real = Math.random;
  Math.random = rng;
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}
