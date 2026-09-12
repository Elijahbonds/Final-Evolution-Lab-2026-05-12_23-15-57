// FEL PRO — the server-side guard (2026-09-12).
//
// One place that answers "is this user Pro", so a premium surface is a two-line change and the
// answer cannot drift between routes. Three of 139 API routes checked an entitlement before this;
// scattering ad-hoc queries was how it stayed that way.
//
// WHAT IS DELIBERATELY NOT GATED, and must stay free:
//   · playing any mode          · scanning the PRQ and the base attributes it earns
//   · the guest /try funnel     · the wallet a player already owns
// Paywalling the thing a new player meets first is how a product dies before it is judged.

import { prisma } from './db';
import { hasActivePro, FEL_PRO_WEEKLY_USD } from './progression/upgradeGate';

export interface ProStatus {
  isPro: boolean;
  /** Free-tier allowance already used in the current window, when the surface meters one. */
  used?: number;
  limit?: number;
}

/** Does this user hold an active FEL Pro subscription? */
export async function isProUser(userId: string): Promise<boolean> {
  const subs = await prisma.subscription.findMany({
    where: { userId, status: 'ACTIVE' },
    select: { product: true, status: true },
  });
  return hasActivePro(subs);
}

export interface PaywallBody {
  error: 'pro_required';
  feature: string;
  /** Plain, honest sentence. No urgency, no loss-framing. */
  message: string;
  weeklyUsd: number;
  /** Where the client should send them. */
  checkout: { weekly: string; monthly: string };
  /** What the free tier still gets, so a 402 is never a dead end. */
  free: string;
}

/**
 * The body a gated route returns. Always says what the free tier still includes — a paywall that
 * only says "no" teaches a player the product is smaller than it is.
 */
export function paywall(feature: string, freeAlternative: string): PaywallBody {
  return {
    error: 'pro_required',
    feature,
    message: `${feature} is part of FEL Pro.`,
    weeklyUsd: FEL_PRO_WEEKLY_USD,
    checkout: { weekly: '/api/stripe/checkout?product=FEL_PRO', monthly: '/api/stripe/checkout?product=FEL_PRO_MONTHLY' },
    free: freeAlternative,
  };
}

/** HTTP 402 Payment Required is the honest status for this, not 403. */
export const PAYWALL_STATUS = 402;
