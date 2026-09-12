/**
 * lib/stripe.ts — Stripe SDK singleton + helpers.
 * Keys come from ENV only, never hardcoded.
 */

import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  _stripe = new Stripe(key, { apiVersion: '2025-04-30.basil' as any });
  return _stripe;
}

// -----------------------------------------------------------------------
// Product / price config — kept in code, not DB.  TUNE(elijah)
// -----------------------------------------------------------------------

export const STRIPE_PRODUCTS = {
  // FEL PRO — TWO CADENCES, ONE ENTITLEMENT (owner, 2026-09-12: "keep both price models and
  // combine them"). Weekly is the low-commitment door; monthly is the committed price. Both grant
  // exactly the same thing, so nothing in the gate or the entitlement check has to know which one
  // a player bought — `product` stays FEL_PRO for both.
  //
  // The description is what the subscription actually DOES. It previously read "premium modes,
  // exclusive drills, 2x LC earn", none of which is what is being sold now.
  FEL_PRO: {
    name: 'FEL Pro — Weekly',
    description: 'Keep the attribute upgrades you earn. Playing and PRQ scanning stay free, and your scanned base is always yours.',
    priceUsd: 600,                 // $6.00/week — FEL_PRO_WEEKLY_USD is the source of truth for copy
    interval: 'week' as const,
    product: 'FEL_PRO' as const,
  },
  FEL_PRO_MONTHLY: {
    name: 'FEL Pro — Monthly',
    description: 'Keep the attribute upgrades you earn, billed monthly. Playing and PRQ scanning stay free.',
    priceUsd: 999,                 // $9.99/month — the original FEL Pro price, kept
    interval: 'month' as const,
    product: 'FEL_PRO' as const,   // SAME entitlement: one Pro, two ways to pay
  },
  STUDIO_CREATOR: {
    name: 'Studio Creator',
    description: 'NEXUS Studio unlimited builds, marketplace publishing, partner API.',
    priceUsd: 2999, // $29.99/mo in cents  // TUNE(elijah)
    interval: 'month' as const,
    product: 'STUDIO_CREATOR' as const,
  },
} as const;

// Cosmetic SKU for one-time purchase
export const COSMETIC_SKUS: Record<string, { name: string; priceUsd: number; description: string }> = {
  'cosm-chrome-visor': {
    name: 'Chrome Visor',
    priceUsd: 499, // $4.99
    description: 'Reflective cyberpunk visor overlay for your athlete avatar.',
  },
};

// Platform take rate on marketplace sales  // TUNE(elijah)
export const PLATFORM_TAKE_RATE = 0.15; // 15%
