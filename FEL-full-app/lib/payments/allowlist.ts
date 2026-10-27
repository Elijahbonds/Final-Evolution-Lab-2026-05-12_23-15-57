// lib/payments/allowlist.ts — PAYMENTS-READY (2026-10-26): a per-product switch under VIRTUAL_PURCHASES_ENABLED.
//
// VIRTUAL_PURCHASES_ENABLED (lib/flags.ts, STORE-READY B10) opens every real-money product outside the coach store at
// once: FEL Pro, FEL Coach, FEL Facility, Studio Creator, cosmetics, the legacy coach block, marketplace listings, studio
// credits, coin packs, shard packs, the season pass PRO lane and books. docs/LAUNCH-SALES.md §8.1 recommends a per-product
// allow list next to it, so the owner can open FEL Pro without opening FEL Facility or shard packs.
//
//   PURCHASES_ALLOWLIST unset or blank → exactly today's behaviour: VIRTUAL_PURCHASES_ENABLED alone decides.
//   PURCHASES_ALLOWLIST="fel_pro,coins"  → VIRTUAL_PURCHASES_ENABLED must still be on, and then ONLY those products sell.
//                                          Every other product answers what it answers with the switch off (409
//                                          store_closed virtual_purchases_off), before any Stripe call.
//
// An entry that is not a product id below opens nothing (scripts/payments-preflight.ts names it). The coach store
// (COACH_STORE_*) and coach payments through Connect (COACH_CONNECT_*) have their own switches and never read this.
// Pure: every function takes the env, so the tests drive it without process.env.

/** The product ids PURCHASES_ALLOWLIST understands, one per thing a buyer can pay for outside the coach store. */
export const PURCHASE_PRODUCTS = [
  'fel_pro', // /api/stripe/checkout FEL_PRO and FEL_PRO_MONTHLY (one entitlement, two cadences)
  'fel_coach', // /api/stripe/checkout FEL_COACH
  'fel_facility', // /api/stripe/checkout FEL_FACILITY
  'studio_creator', // /api/stripe/checkout STUDIO_CREATOR
  'cosmetic', // /api/stripe/checkout COSMETIC
  'coach_program', // /api/stripe/checkout COACH_PROGRAM (the legacy coach block)
  'marketplace', // /api/stripe/checkout MARKETPLACE
  'studio_credits', // /api/stripe/checkout STUDIO_CREDITS and /api/studio/credits
  'coins', // /api/v1/wallet/checkout
  'shards', // /api/v1/wallet/shard-checkout
  'season_pass', // /api/season/checkout
  'books', // /api/books/checkout
] as const;
export type PurchaseProduct = (typeof PURCHASE_PRODUCTS)[number];

/** /api/stripe/checkout's `product` body field → the allow-list id. An unknown product has none. */
export const STRIPE_CHECKOUT_PRODUCT: Record<string, PurchaseProduct> = {
  FEL_PRO: 'fel_pro',
  FEL_PRO_MONTHLY: 'fel_pro',
  FEL_COACH: 'fel_coach',
  FEL_FACILITY: 'fel_facility',
  STUDIO_CREATOR: 'studio_creator',
  COSMETIC: 'cosmetic',
  COACH_PROGRAM: 'coach_program',
  MARKETPLACE: 'marketplace',
  STUDIO_CREDITS: 'studio_credits',
};

function envOn(v: string | undefined): boolean {
  const s = (v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'on' || s === 'yes';
}

/** The parsed allow list: null when unset or blank (today's behaviour), else the lower-cased entries as written. */
export function parseAllowlist(env: Record<string, string | undefined> = process.env): string[] | null {
  const raw = (env.PURCHASES_ALLOWLIST ?? '').trim();
  if (!raw) return null;
  const entries = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return entries.length ? entries : null;
}

/** Allow-list entries that are not product ids (a typo opens nothing; the preflight names it). */
export function unknownAllowlistEntries(env: Record<string, string | undefined> = process.env): string[] {
  const list = parseAllowlist(env);
  if (!list) return [];
  return list.filter((e) => !(PURCHASE_PRODUCTS as readonly string[]).includes(e));
}

/**
 * Does the allow list let this product sell? True when the list is unset (today's behaviour). `product` null (an
 * unknown /api/stripe/checkout product) is never on a set list.
 */
export function allowlistPermits(product: PurchaseProduct | null, env: Record<string, string | undefined> = process.env): boolean {
  const list = parseAllowlist(env);
  if (!list) return true;
  return product !== null && list.includes(product);
}

/**
 * The fence every product outside the coach store asks: VIRTUAL_PURCHASES_ENABLED is on AND the allow list permits the
 * product. With PURCHASES_ALLOWLIST unset this is exactly lib/flags.ts isVirtualPurchasesEnabled().
 */
export function isPurchaseOpen(product: PurchaseProduct | null, env: Record<string, string | undefined> = process.env): boolean {
  return envOn(env.VIRTUAL_PURCHASES_ENABLED) && allowlistPermits(product, env);
}

/** The products that would sell with this env (VIRTUAL_PURCHASES_ENABLED on and on the list, or every one when unset). */
export function openProducts(env: Record<string, string | undefined> = process.env): PurchaseProduct[] {
  if (!envOn(env.VIRTUAL_PURCHASES_ENABLED)) return [];
  return PURCHASE_PRODUCTS.filter((p) => allowlistPermits(p, env));
}
