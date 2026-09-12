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

// ── THE B2B LANE ─────────────────────────────────────────────────────────────────────────────
// Camp, mentees, assessments, credentialed facilitators and the CRM were all free. They are a
// coaching business running on the platform, and they are priced now — with one carve-out that
// is not negotiable.
//
// SAFEGUARDING IS NEVER PAYWALLED. Guardian consent and credential revocation stay open to every
// account, subscribed or not. A guardian must always be able to record or withdraw consent for a
// minor, and a revoked facilitator must always be revocable, including on a lapsed or unpaid
// account. Billing may gate features; it must never gate a safety control or a consent record.
// Anyone tempted to "simplify" by gating these should read this paragraph first.

export type B2BTier = 'coach' | 'facility';

/** Routes that must work regardless of subscription state. Safety, not features. */
export const NEVER_GATED = [
  '/api/v1/camp/consent',   // a guardian recording or withdrawing consent for a minor
  '/api/v1/camp/revoke',    // removing a facilitator's credential
] as const;

export function isNeverGated(pathname: string): boolean {
  return NEVER_GATED.some((p) => pathname.startsWith(p));
}

/** A single credentialed facilitator, or anything above it. */
export async function isCoachUser(userId: string): Promise<boolean> {
  const subs = await prisma.subscription.findMany({
    where: { userId, status: 'ACTIVE' },
    select: { product: true },
  });
  return subs.some((s) => s.product === 'FEL_COACH' || s.product === 'FEL_FACILITY');
}

/**
 * An organisation: camp templates and multiple facilitators.
 *
 * NOT the CRM. lib/crm/helpers.ts restricts every CRM route to role === 'admin' or the platform
 * owner's own email — it is an internal sales tool, not a customer surface, and putting a price on
 * it would be selling something no customer can reach.
 */
export async function isFacilityUser(userId: string): Promise<boolean> {
  const subs = await prisma.subscription.findMany({
    where: { userId, status: 'ACTIVE' },
    select: { product: true },
  });
  return subs.some((s) => s.product === 'FEL_FACILITY');
}

export interface B2BPaywallBody extends PaywallBody {
  tier: B2BTier;
}

/** The 402 body for a B2B surface. Names the tier and what the caller can still do. */
export function b2bPaywall(feature: string, tier: B2BTier, freeAlternative: string): B2BPaywallBody {
  const price = tier === 'coach' ? 39 : 199;
  const key = tier === 'coach' ? 'FEL_COACH' : 'FEL_FACILITY';
  return {
    error: 'pro_required',
    feature,
    tier,
    message: `${feature} is part of ${tier === 'coach' ? 'FEL Coach' : 'FEL Facility'} ($${price}/month).`,
    weeklyUsd: FEL_PRO_WEEKLY_USD,
    checkout: { weekly: `/api/stripe/checkout?product=${key}`, monthly: `/api/stripe/checkout?product=${key}` },
    free: freeAlternative,
  };
}
