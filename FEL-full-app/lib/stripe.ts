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
  FEL_PRO: {
    name: 'FEL Pro',
    description: 'Unlock premium modes, exclusive drills, and 2× LC earn rate.',
    priceUsd: 999, // $9.99/mo in cents
    interval: 'month' as const,
    product: 'FEL_PRO' as const,
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
