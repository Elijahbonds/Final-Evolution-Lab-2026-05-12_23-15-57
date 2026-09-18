/**
 * lib/season/golden-hour.ts
 * =========================
 * M14 — Season 1 "Golden Hour" authored reward table (DATA, not code).
 *
 * Theme: venice-sunset. 50 tiers, FREE + PRO lanes. Every reward is a cosmetic
 * or Lab Credits — there are NO stat items anywhere on this track (Blueprint
 * Pillar 7 is law: cosmetics never touch gameplay balance). LC granted here is
 * the same virtual skill currency used everywhere else and has no cash value.
 *
 * This table is consumed by SeasonPassCore via the optional `rewardTable`
 * option (see season-pass-core.ts). When present it overrides the procedural
 * cadence so future seasons can ship purely as data. The FREE/PRO cadence
 * mirrors the verified procedural shape (LC every 5th tier, common cosmetic
 * every 3rd; PRO rare each tier, legendary every 10th) so progression pacing
 * is unchanged — this table only adds names, ids, and a satisfying LC curve.
 */

import type { SeasonReward, TierRewards } from './season-pass-core';

// --- Themed cosmetic name pools (venice-sunset) ----------------------------
// Purely visual flavor. Names cycle deterministically so the table is stable.
const COMMON_COSMETICS = [
  'Sunset Chalk Dust',
  'Boardwalk Grip Tape',
  'Palm Shadow Jersey',
  'Tangerine Wristband',
  'Pier Light Sneaker Trail',
  'Coral Headband',
  'Marina Stripe Shorts',
  'Dusk Haze Sweatband',
  'Amber Lace Kit',
  'Sandline Ankle Tape',
];
const RARE_COSMETICS = [
  'Golden Hour Glow Trail',
  'Neon Boardwalk Jersey',
  'Venice Vaporwave Kit',
  'Sunfade Chrome Sneakers',
  'Horizon Pulse Aura',
  'Magenta Skyline Warmups',
  'Twilight Ripple Gloves',
  'Electric Lagoon Visor',
  'Copper Sun Emblem Set',
  'Lowlight Ember Trail',
];
const LEGENDARY_COSMETICS = [
  'Eternal Sunset Signature Set',
  'Venice Legend Aurora Kit',
  'Solar Flare Champion Regalia',
  'Golden Hour Apex Ensemble',
  'Mythic Dusk Radiance Suite',
];

function cosmetic(
  rarity: 'common' | 'rare' | 'legendary',
  slug: string,
  name: string,
): SeasonReward {
  return { kind: 'cosmetic', rarity, id: `s1-${slug}`, name };
}

function lc(amt: number): SeasonReward {
  return { kind: 'lc', amt, id: 's1-lc', name: `${amt} Lab Credits` };
}

/**
 * FREE-lane LC curve: base 50 with milestone bumps so the back half of the
 * season feels rewarding without ever being purchasable. Only lands on tiers
 * that are multiples of 5 (matching the verified cadence).
 */
function freeLcAmount(tier: number): number {
  if (tier >= 50) return 500; // grand finale
  if (tier >= 40) return 200;
  if (tier >= 25) return 150;
  if (tier >= 15) return 100;
  return 50;
}

function buildGoldenHour(): TierRewards[] {
  const table: TierRewards[] = [];
  let commonIdx = 0;
  let rareIdx = 0;
  let legendaryIdx = 0;

  for (let tier = 1; tier <= 50; tier++) {
    // FREE lane: LC on every 5th tier, else a common cosmetic on every 3rd.
    const free: SeasonReward[] = [];
    if (tier % 5 === 0) {
      free.push(lc(freeLcAmount(tier)));
    } else if (tier % 3 === 0) {
      const name = COMMON_COSMETICS[commonIdx % COMMON_COSMETICS.length];
      free.push(cosmetic('common', `common-${tier}`, name));
      commonIdx++;
    }

    // PRO lane: legendary on every 10th tier, rare on every other tier.
    const pro: SeasonReward[] = [];
    if (tier % 10 === 0) {
      const name = LEGENDARY_COSMETICS[legendaryIdx % LEGENDARY_COSMETICS.length];
      pro.push(cosmetic('legendary', `legendary-${tier}`, name));
      legendaryIdx++;
    } else {
      const name = RARE_COSMETICS[rareIdx % RARE_COSMETICS.length];
      pro.push(cosmetic('rare', `rare-${tier}`, name));
      rareIdx++;
    }

    table.push({ free, pro });
  }
  return table;
}

/** The fully-resolved 50-tier Golden Hour reward table (deterministic data). */
export const GOLDEN_HOUR_REWARDS: TierRewards[] = buildGoldenHour();

/** Season-key -> authored reward table registry. */
const REWARD_TABLES: Record<string, TierRewards[]> = {
  S1: GOLDEN_HOUR_REWARDS,
};

/** Resolve the authored reward table for a season key, if one ships. */
export function getSeasonRewardTable(key: string): TierRewards[] | undefined {
  return REWARD_TABLES[key];
}
