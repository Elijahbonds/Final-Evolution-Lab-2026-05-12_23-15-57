/**
 * lib/wallet/catalog.ts — minimal placeholder spend catalog + coin packs (§6).
 *
 * Deliberately tiny: just enough that the spend path and the purchase path are
 * testable. NOT a cosmetic system / inventory UI / catalog admin.
 * Prices are SERVER-OWNED — a client-supplied price is never trusted.
 */

import type { WalletCurrency } from './reward-rules';
import { WEARABLES } from '../closet/wearable-catalog';
import { BOOST_CARDS, boostSkuId } from '../cards/boosts';
import { MUSIC_PURCHASES } from '../babylon/music/purchases';

export interface CatalogSku {
  skuId: string;
  currency: WalletCurrency;
  unitPrice: number;
  consumable: boolean;
}

// HOTFIX (2026-09-24): three SKUs nothing ever read (a dunk retry token, a dunk style slot and a paid scan) are deleted,
// by the owner's call. The generic spend route had already stopped selling them; now spend() refuses any purchase of
// them as UNKNOWN_SKU. The ledger rows and entitlements of old purchases still carry their ids.
export const CATALOG: Record<string, CatalogSku> = {
  // ── M28 extra creative-card slot (SHARD sink) ──
  creative_card_slot: { skuId: 'creative_card_slot', currency: 'shards', unitPrice: 200, consumable: false }, // TUNE(elijah)

  // ── M17 personalized workouts (SHARD sinks — premium, creates shard demand) ──
  workout_plan_4w:     { skuId: 'workout_plan_4w',     currency: 'shards', unitPrice: 60,  consumable: true },
  workout_program_12w: { skuId: 'workout_program_12w', currency: 'shards', unitPrice: 200, consumable: true },

  // ── M18 live class passes (SHARD sinks) ──
  class_pass_single:   { skuId: 'class_pass_single',   currency: 'shards', unitPrice: 40,  consumable: true },
  class_monthly:       { skuId: 'class_monthly',       currency: 'shards', unitPrice: 300, consumable: false },

  // ── M21 group sessions / seminars / private (SHARD sinks) ──
  session_group_workout: { skuId: 'session_group_workout', currency: 'shards', unitPrice: 150, consumable: true },
  seminar_seat:          { skuId: 'seminar_seat',          currency: 'shards', unitPrice: 250, consumable: true },
  private_1on1:          { skuId: 'private_1on1',          currency: 'shards', unitPrice: 900, consumable: true },

  // ── The Music Room (SHARD sinks) — generated from lib/babylon/music/purchases ──
  // Kits and the Cell assist. Registered here so the room charges through the same server-priced, atomic,
  // idempotent spend as everything else, instead of the `spendShards` seam that was never wired and quietly
  // handed both out for free.
  ...Object.fromEntries(
    MUSIC_PURCHASES.map((p) => [p.id, {
      skuId: p.id, currency: 'shards' as WalletCurrency, unitPrice: p.shards, consumable: p.id.endsWith('cell_assist'),
    }]),
  ),

  // ── Creator boost cards (SHARD sinks) — generated from lib/cards/boosts ──
  // Registered here rather than given their own purchase path, so a boost card buys through the same
  // server-priced, atomic, idempotent spend as everything else and lands in the same PlayerEntitlement table.
  // Not consumable: you own the card, you do not use it up.
  ...Object.fromEntries(
    BOOST_CARDS.map((c) => [boostSkuId(c.id), {
      skuId: boostSkuId(c.id), currency: 'shards' as WalletCurrency, unitPrice: c.costShards, consumable: false,
    }]),
  ),

  // ── M20 closet wearables (COINS) — generated from the cosmetic catalog ──
  ...Object.fromEntries(
    WEARABLES.map((w) => [w.itemId, { skuId: w.itemId, currency: 'coins' as WalletCurrency, unitPrice: w.coinPrice, consumable: false }]),
  ),
};

export function getSku(skuId: string): CatalogSku | null {
  return CATALOG[skuId] ?? null;
}

// HOTFIX (2026-09-24): NOT ON SALE. These SKUs stay registered at their price, but spend() refuses a new purchase of
// them before any balance moves, because each one delivers nothing yet. /live has no video player, so a class pass
// bought a class nobody could watch, and nothing reads the class_monthly entitlement. The owner's economy-honesty call
// (A): refuse the sale now, no redesign. /live reads skuOnSale, so a held SKU is not offered there. Take a SKU out of
// this set the day what it buys exists. Every pass bought before the hold is paid back and its entitlement row deleted
// (owner decision 2026-09-25, lib/wallet/dead-buys.ts), so a pass bought once classes exist is charged again.
export const NOT_ON_SALE: ReadonlySet<string> = new Set(['class_pass_single', 'class_monthly']);

/** Can this SKU be bought right now? An unknown SKU and a held one both answer no. */
export function skuOnSale(skuId: string): boolean {
  return getSku(skuId) !== null && !NOT_ON_SALE.has(skuId);
}

// HOTFIX (2026-09-24): what the generic spend route (POST /api/v1/wallet/spend) may sell. That route grants nothing but
// a PlayerEntitlement row. /store used to call it for every SKU on sale (30 of the 32), and 24 of them took the coins
// or shards and delivered nothing:
//   - a wearable is worn from OwnedWearable, which only the Closet's buy writes;
//   - a session is a SessionBooking, which only Sessions writes (it also refuses a private 1-on-1 to a minor);
//   - a workout plan is a WorkoutPlan, which only Workout writes after charging again, so the plan was paid twice;
//   - the creative card slot is counted by the card creator, not read from the entitlement;
//   - the Music Room keeps its kits on the device and charges under its own key, so a kit was paid twice, and it
//     charges each Cell foundation as it is used, so a bought one sat unused;
//   - three SKUs had no reader anywhere, so they were sold nowhere, and are now deleted (see CATALOG);
//   - the boost cards do read the entitlement, but they have their own route (app/api/cards/boosts), which refuses a
//     card already owned. The Profile's boost shelf sells them there.
// Each of those is still sold where it is delivered, by a route that calls spend() directly. The generic route keeps
// only the /live class passes, its one storefront, and NOT_ON_SALE holds those. Add a SKU here only when something
// reads its entitlement row back.
export const SPEND_ROUTE_SKUS: ReadonlySet<string> = new Set<string>(['class_pass_single', 'class_monthly']);

// Stripe price-id -> coin pack. Coins ONLY (§5 stripe-webhook). There is no
// shard entry here and there must never be one.
export interface CoinPack { coins: number; label: string }
export const COIN_PACKS: Record<string, CoinPack> = {
  // Placeholder mapping; real price ids come from the Stripe dashboard / env.
  [process.env.STRIPE_PRICE_COINS_SMALL || 'price_coins_small']: { coins: 500, label: 'Small Coin Pack' },
  [process.env.STRIPE_PRICE_COINS_LARGE || 'price_coins_large']: { coins: 3000, label: 'Large Coin Pack' },
};

export function coinPackForPrice(priceId: string | null | undefined): CoinPack | null {
  if (!priceId) return null;
  return COIN_PACKS[priceId] ?? null;
}

// ---------------------------------------------------------------------------
// COIN STORE (§ monetization) — real-money coin packs priced INLINE in USD.
// No external Stripe price ids required: the checkout route builds a
// price_data line item and the webhook mints `coins` from session metadata.
// Shards are NEVER sold here (permanent, earn-only). Prices SERVER-OWNED.
// ---------------------------------------------------------------------------
export interface CoinStorePack {
  id: string;
  coins: number;       // base coins granted
  bonus: number;       // extra bonus coins (marketing)
  priceUsdCents: number;
  label: string;
  blurb: string;
  tag?: string;        // 'Popular' | 'Best value' etc.
}

// TUNE(elijah) — pack sizing / pricing ladder.
export const COIN_STORE_PACKS: CoinStorePack[] = [
  { id: 'coins_starter', coins: 500,  bonus: 0,    priceUsdCents: 199,  label: 'Starter Stack', blurb: 'A quick top-up for the Closet.' }, // HOTFIX (2026-09-24): the blurb promised a retry token; that SKU delivered nothing and is deleted
  { id: 'coins_pro',     coins: 1500, bonus: 150,  priceUsdCents: 499,  label: 'Pro Pouch',     blurb: '+150 bonus coins.', tag: 'Popular' },
  { id: 'coins_elite',   coins: 3500, bonus: 500,  priceUsdCents: 999,  label: 'Elite Vault',   blurb: '+500 bonus coins.', tag: 'Best value' },
  { id: 'coins_legend',  coins: 8000, bonus: 2000, priceUsdCents: 1999, label: 'Legend Hoard',  blurb: '+2000 bonus coins for the grind.' },
];

export function getCoinStorePack(id: string | null | undefined): CoinStorePack | null {
  if (!id) return null;
  return COIN_STORE_PACKS.find((p) => p.id === id) ?? null;
}

export function coinStorePackTotal(p: CoinStorePack): number {
  return p.coins + p.bonus;
}
