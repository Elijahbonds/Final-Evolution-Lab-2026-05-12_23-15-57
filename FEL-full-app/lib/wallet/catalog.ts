/**
 * lib/wallet/catalog.ts — minimal placeholder spend catalog + coin packs (§6).
 *
 * Deliberately tiny: just enough that the spend path and the purchase path are
 * testable. NOT a cosmetic system / inventory UI / catalog admin.
 * Prices are SERVER-OWNED — a client-supplied price is never trusted.
 */

import type { WalletCurrency } from './reward-rules';
import { WEARABLES } from '../closet/wearable-catalog';

export interface CatalogSku {
  skuId: string;
  currency: WalletCurrency;
  unitPrice: number;
  consumable: boolean;
}

export const CATALOG: Record<string, CatalogSku> = {
  dunk_retry_token: { skuId: 'dunk_retry_token', currency: 'coins', unitPrice: 50, consumable: true },

  // ── M28 extra creative-card slot (SHARD sink) ──
  creative_card_slot: { skuId: 'creative_card_slot', currency: 'shards', unitPrice: 200, consumable: false }, // TUNE(elijah)
  dunk_style_slot: { skuId: 'dunk_style_slot', currency: 'shards', unitPrice: 5, consumable: false },

  // ── M17 personalized workouts (SHARD sinks — premium, creates shard demand) ──
  scan_personalized:   { skuId: 'scan_personalized',   currency: 'shards', unitPrice: 25,  consumable: true },
  workout_plan_4w:     { skuId: 'workout_plan_4w',     currency: 'shards', unitPrice: 60,  consumable: true },
  workout_program_12w: { skuId: 'workout_program_12w', currency: 'shards', unitPrice: 200, consumable: true },

  // ── M18 live class passes (SHARD sinks) ──
  class_pass_single:   { skuId: 'class_pass_single',   currency: 'shards', unitPrice: 40,  consumable: true },
  class_monthly:       { skuId: 'class_monthly',       currency: 'shards', unitPrice: 300, consumable: false },

  // ── M21 group sessions / seminars / private (SHARD sinks) ──
  session_group_workout: { skuId: 'session_group_workout', currency: 'shards', unitPrice: 150, consumable: true },
  seminar_seat:          { skuId: 'seminar_seat',          currency: 'shards', unitPrice: 250, consumable: true },
  private_1on1:          { skuId: 'private_1on1',          currency: 'shards', unitPrice: 900, consumable: true },

  // ── M20 closet wearables (COINS) — generated from the cosmetic catalog ──
  ...Object.fromEntries(
    WEARABLES.map((w) => [w.itemId, { skuId: w.itemId, currency: 'coins' as WalletCurrency, unitPrice: w.coinPrice, consumable: false }]),
  ),
};

export function getSku(skuId: string): CatalogSku | null {
  return CATALOG[skuId] ?? null;
}

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
  { id: 'coins_starter', coins: 500,  bonus: 0,    priceUsdCents: 199,  label: 'Starter Stack', blurb: 'A quick top-up to grab a retry token.' },
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
