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
// Type-only: the closet owns the slot vocabulary, and a season cosmetic that
// cannot name a real slot cannot be worn. No runtime edge back to the catalog.
import type { WearableSlot } from '@/lib/closet/wearable-catalog';

/** A cosmetic as authored: everything the closet needs to actually wear it. */
interface CosmeticDef {
  name: string;
  slot: WearableSlot;
  /** Hex accent, matching the store catalog's rendering contract. */
  accent: string;
}

// --- Themed cosmetic pools (venice-sunset) ---------------------------------
// Purely visual flavor. Entries cycle deterministically so the table is stable.
// Every entry carries its slot: these become real OwnedWearable rows, so an
// item with no slot would be an unwearable reward — the exact bug this closes.
const COMMON_COSMETICS: CosmeticDef[] = [
  { name: 'Sunset Chalk Dust', slot: 'accessory', accent: '#FFB067' },
  { name: 'Boardwalk Grip Tape', slot: 'accessory', accent: '#E08B4C' },
  { name: 'Palm Shadow Jersey', slot: 'tops', accent: '#C2703D' },
  { name: 'Tangerine Wristband', slot: 'accessory', accent: '#FF8A3D' },
  { name: 'Pier Light Sneaker Trail', slot: 'shoes', accent: '#FFC46B' },
  { name: 'Coral Headband', slot: 'headwear', accent: '#FF7A6B' },
  { name: 'Marina Stripe Shorts', slot: 'shorts', accent: '#E2915C' },
  { name: 'Dusk Haze Sweatband', slot: 'headwear', accent: '#D98A5F' },
  { name: 'Amber Lace Kit', slot: 'tops', accent: '#F0A24B' },
  { name: 'Sandline Ankle Tape', slot: 'accessory', accent: '#E6C08A' },
];
const RARE_COSMETICS: CosmeticDef[] = [
  { name: 'Golden Hour Glow Trail', slot: 'accessory', accent: '#FFD700' },
  { name: 'Neon Boardwalk Jersey', slot: 'tops', accent: '#FF3366' },
  { name: 'Venice Vaporwave Kit', slot: 'tops', accent: '#A855F7' },
  { name: 'Sunfade Chrome Sneakers', slot: 'shoes', accent: '#FF9E7A' },
  { name: 'Horizon Pulse Aura', slot: 'accessory', accent: '#00E5FF' },
  { name: 'Magenta Skyline Warmups', slot: 'tops', accent: '#E040A0' },
  { name: 'Twilight Ripple Gloves', slot: 'accessory', accent: '#7B5BD6' },
  { name: 'Electric Lagoon Visor', slot: 'headwear', accent: '#00FF9D' },
  { name: 'Copper Sun Emblem Set', slot: 'accessory', accent: '#C9722F' },
  { name: 'Lowlight Ember Trail', slot: 'shoes', accent: '#FF5A3C' },
];
const LEGENDARY_COSMETICS: CosmeticDef[] = [
  { name: 'Eternal Sunset Signature Set', slot: 'tops', accent: '#FFD700' },
  { name: 'Venice Legend Aurora Kit', slot: 'tops', accent: '#A855F7' },
  { name: 'Solar Flare Champion Regalia', slot: 'tops', accent: '#FF6B2C' },
  { name: 'Golden Hour Apex Ensemble', slot: 'tops', accent: '#FFC02C' },
  { name: 'Mythic Dusk Radiance Suite', slot: 'tops', accent: '#FF3366' },
];

/**
 * Every cosmetic this season can hand out, as a closet-resolvable item.
 * Populated as the reward table is built, so the rewards and the wearables can
 * never drift apart — one authoring pass, two views of the same data.
 */
export interface SeasonWearable {
  itemId: string;
  slot: WearableSlot;
  name: string;
  accent: string;
  rarity: 'common' | 'rare' | 'legendary';
  seasonKey: string;
}
const S1_WEARABLES: SeasonWearable[] = [];

function cosmetic(
  rarity: 'common' | 'rare' | 'legendary',
  slug: string,
  def: CosmeticDef,
): SeasonReward {
  const itemId = `s1-${slug}`;
  // Registering here (rather than in a second hand-maintained list) is what
  // guarantees every granted cosmetic resolves to something wearable.
  S1_WEARABLES.push({ itemId, slot: def.slot, name: def.name, accent: def.accent, rarity, seasonKey: 'S1' });
  return { kind: 'cosmetic', rarity, id: itemId, name: def.name };
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
      const def = COMMON_COSMETICS[commonIdx % COMMON_COSMETICS.length];
      free.push(cosmetic('common', `common-${tier}`, def));
      commonIdx++;
    }

    // PRO lane: legendary on every 10th tier, rare on every other tier.
    const pro: SeasonReward[] = [];
    if (tier % 10 === 0) {
      const def = LEGENDARY_COSMETICS[legendaryIdx % LEGENDARY_COSMETICS.length];
      pro.push(cosmetic('legendary', `legendary-${tier}`, def));
      legendaryIdx++;
    } else {
      const def = RARE_COSMETICS[rareIdx % RARE_COSMETICS.length];
      pro.push(cosmetic('rare', `rare-${tier}`, def));
      rareIdx++;
    }

    table.push({ free, pro });
  }
  return table;
}

/** The fully-resolved 50-tier Golden Hour reward table (deterministic data). */
export const GOLDEN_HOUR_REWARDS: TierRewards[] = buildGoldenHour();

/**
 * Every Golden Hour cosmetic as a closet-resolvable item. Populated by the
 * table build above, so it cannot fall out of sync with what the pass grants.
 */
export const GOLDEN_HOUR_WEARABLES: SeasonWearable[] = S1_WEARABLES;

/** Season-key -> authored reward table registry. */
const REWARD_TABLES: Record<string, TierRewards[]> = {
  S1: GOLDEN_HOUR_REWARDS,
};

/** Every season's wearables, flattened — the closet resolves granted items here. */
export const ALL_SEASON_WEARABLES: SeasonWearable[] = [...GOLDEN_HOUR_WEARABLES];

const SEASON_WEARABLE_BY_ID: Map<string, SeasonWearable> = new Map(
  ALL_SEASON_WEARABLES.map((w) => [w.itemId, w]),
);

/** Resolve a season cosmetic by item id, or undefined when it is not one. */
export function getSeasonWearable(itemId: string): SeasonWearable | undefined {
  return SEASON_WEARABLE_BY_ID.get(itemId);
}

/** Resolve the authored reward table for a season key, if one ships. */
export function getSeasonRewardTable(key: string): TierRewards[] | undefined {
  return REWARD_TABLES[key];
}
