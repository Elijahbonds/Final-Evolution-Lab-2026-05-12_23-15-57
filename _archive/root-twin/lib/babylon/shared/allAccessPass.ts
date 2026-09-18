// allAccessPass — the $30/month ALL-ACCESS PASS (M60, Phase 9). Single
// source of truth for the SKU and what it entitles, mirroring the
// shardPacks.ts pattern (M25) so store UI and server read one file.
// Real-money rails stay Stripe-only, separate from Shards, same as the
// M33/M36 cash rules (age/geo gates apply to purchase).

export interface AllAccessPass {
  id: string;
  name: string;
  usdCents: number;
  interval: 'month';
  stripePriceLookupKey: string;   // maps to a Stripe Price in the dashboard
}

export const ALL_ACCESS_PASS: AllAccessPass = {
  id: 'sub_all_access',
  name: 'FEL All-Access Pass',
  usdCents: 2999,                  // $29.99/mo
  interval: 'month',
  stripePriceLookupKey: 'fel_all_access_monthly',
};

/** Everything the pass unlocks — checked via hasAllAccess() at each gate.
 *  Add here first; gates read this list so benefits stay in one place. */
export const PASS_BENEFITS = [
  'ALL premium mode content unlocked (every mode, every variant)',
  'Monthly Shard stipend: 1200 ◈ auto-granted on each renewal',
  'All Music Academy kits unlocked (NEON, DUST, and future kits)',
  'Marketplace seller fee drops from 10% to 5%',
  'Story Mode chapters unlock early (full season from day one)',
  'All-Access badge on Creator Cards and marketplace listings',
] as const;

export const PASS_STIPEND_SHARDS = 1200;
export const MARKET_FEE_PCT = 10;            // standard seller fee
export const MARKET_FEE_PCT_PASS = 5;        // with All-Access

export interface PassState {
  active: boolean;
  currentPeriodEnd: number | null;   // epoch ms; null when never subscribed
  cancelAtPeriodEnd: boolean;
}

/** The profile shape gates check. Server writes it from Stripe webhooks
 *  (see server/subscriptionApi.ts); client treats it as read-only truth. */
export function hasAllAccess(pass: PassState | null | undefined): boolean {
  return !!pass && pass.active && (pass.currentPeriodEnd === null || pass.currentPeriodEnd > Date.now());
}

export function marketFeePct(pass: PassState | null | undefined): number {
  return hasAllAccess(pass) ? MARKET_FEE_PCT_PASS : MARKET_FEE_PCT;
}
