/**
 * lib/studio-plan.ts — NEXUS Studio Creator plan configuration (M3 Track C).
 *
 * Single visible config module for the Studio Creator monetization surface.
 * Every tuned number lives here and is marked TUNE(elijah) so the pricing /
 * quota model can be adjusted in one place without touching the metering code.
 *
 * Tiers (resolved per user at request time; see studio-service.resolveStudioTier):
 *   FREE    — no subscription, no BYO keys. Small monthly build allowance to try it.
 *   CREATOR — active STUDIO_CREATOR subscription. Generous quota + a monthly
 *             included build budget (USD). Metered build cost beyond the included
 *             budget draws down prepaid STUDIO_CREDIT (overage credits).
 *   BYO     — user supplied their own provider API key(s). Builds route directly
 *             to their provider, so the platform does not meter build cost or
 *             enforce a USD budget; only a high call ceiling for abuse protection.
 */

export type StudioTier = 'FREE' | 'CREATOR' | 'BYO';

export interface StudioPlan {
  tier: StudioTier;
  label: string;
  /** Distinct builds allowed per billing month. -1 = unlimited. */
  buildsPerMonth: number;
  /** Included metered build spend per month, in US cents. Beyond this, overage credits are drawn. */
  includedUsdCents: number;
  /** Whether the tier may spend prepaid overage credits once the included budget is used up. */
  overageAllowed: boolean;
  /** Whether the tier uses the creator's own provider keys (platform does not meter cost). */
  byoKeys: boolean;
}

// TUNE(elijah): Studio Creator plan matrix.
export const STUDIO_PLANS: Record<StudioTier, StudioPlan> = {
  FREE: {
    tier: 'FREE',
    label: 'Free',
    buildsPerMonth: 3,          // TUNE(elijah)
    includedUsdCents: 0,        // TUNE(elijah)
    overageAllowed: false,
    byoKeys: false,
  },
  CREATOR: {
    tier: 'CREATOR',
    label: 'Creator',
    buildsPerMonth: 100,        // TUNE(elijah)
    includedUsdCents: 1000,     // $10.00/mo included metered build spend — TUNE(elijah)
    overageAllowed: true,
    byoKeys: false,
  },
  BYO: {
    tier: 'BYO',
    label: 'Bring-your-own-keys',
    buildsPerMonth: 1000,       // abuse ceiling only — TUNE(elijah)
    includedUsdCents: 0,
    overageAllowed: false,
    byoKeys: true,
  },
};

/**
 * Overage credit pack SKUs (prepaid STUDIO_CREDIT; 1 credit = 1 US cent of build spend).
 * Purchased via Stripe (mode=payment); revenue recognized at purchase, credits granted
 * on the isolated STUDIO_CREDIT ledger book. TUNE(elijah).
 */
export const STUDIO_CREDIT_PACKS: Record<string, { label: string; priceUsdCents: number; credits: number }> = {
  'studio-credits-5':  { label: '$5 build credits',  priceUsdCents: 500,  credits: 500 },   // TUNE(elijah)
  'studio-credits-20': { label: '$20 build credits', priceUsdCents: 2000, credits: 2200 },  // +10% bonus — TUNE(elijah)
  'studio-credits-50': { label: '$50 build credits', priceUsdCents: 5000, credits: 5750 },  // +15% bonus — TUNE(elijah)
};

/** Partner API: billable units per endpoint class. TUNE(elijah). */
export const PARTNER_UNIT_COST: Record<string, number> = {
  'build:read': 1,     // read project/build metadata
  'build:create': 10,  // trigger a build (heavier)
  'catalog:read': 1,
};

export const PARTNER_KEY_PREFIX = 'nxk_live_'; // TUNE(elijah)
