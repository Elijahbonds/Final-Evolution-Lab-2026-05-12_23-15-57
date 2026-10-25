// lib/coach-business/config.ts — COACH-BUSINESS (owner decisions 2026-10-25): every switch and every number the owner
// sets for the coach business lives here, read from the environment, so changing one needs no code change.
//
//   · COACH_CONNECT_PAYMENTS_ENABLED  — coaches charging clients through Stripe Connect (onboarding, package checkout,
//                                        refunds, the payouts dashboard link). OFF by default: every money route answers
//                                        409 store_closed `payments_off` and the pages say "Payments aren't live yet".
//   · COACH_CONNECT_LIVE               — a LIVE Stripe key (sk_live_/rk_live_) opens those routes only while this is on.
//                                        OFF by default, so with the payments switch on the routes still sell in TEST mode only.
//   · COACH_PRO_ENABLED                — the Free/Pro gates are enforced and Coach Pro is on sale. OFF by default: no coach
//                                        loses anything they have today while Pro cannot be bought.
//   · COACH_PRO_PRICE_USD_CENTS        — the Pro price, per month. NO default: unset, the upgrade answers 409 price_not_set
//                                        (the season-pass rule: the repo never invents a price).
//   · COACH_FREE_CLIENT_LIMIT          — how many active clients a Free coach keeps. Default FREE_CLIENT_LIMIT_DEFAULT.
//   · COACH_MARKETPLACE_ENABLED        — /coaches (find a coach) and applying to a coach. OFF by default.
//
// The 5% revenue share is the owner's decision (2026-10-25), so it is a constant here, not an env read.

function envOn(env: NodeJS.ProcessEnv, name: string): boolean {
  const v = (env[name] ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

/** FEL's share of a coach's sale through Stripe Connect, in basis points (owner, 2026-10-25: 5%). */
export const CONNECT_FEE_BPS = 500;

/** (new) Free tier's active-client allowance while COACH_FREE_CLIENT_LIMIT is unset. "A few clients" (owner): 3. */
export const FREE_CLIENT_LIMIT_DEFAULT = 3;
/** The env may raise or lower the allowance inside these bounds; anything else falls back to the default. */
export const FREE_CLIENT_LIMIT_MAX = 1000;

/** (new) A package price, in cents: $1.00 to $10,000.00. Stripe's own floor is $0.50. */
export const PACKAGE_MIN_CENTS = 100;
export const PACKAGE_MAX_CENTS = 1_000_000;
/** (new) The longest a Checkout stays open, and so the longest a capacity spot is held for it (Stripe's minimum is 30). */
export const CHECKOUT_HOLD_MINUTES = 30;

export function isCoachConnectPaymentsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return envOn(env, 'COACH_CONNECT_PAYMENTS_ENABLED');
}

export function isCoachConnectLive(env: NodeJS.ProcessEnv = process.env): boolean {
  return envOn(env, 'COACH_CONNECT_LIVE');
}

export function isCoachProEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return envOn(env, 'COACH_PRO_ENABLED');
}

export function isCoachMarketplaceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return envOn(env, 'COACH_MARKETPLACE_ENABLED');
}

/** The Pro price in cents, or null while the owner has not set one. */
export function coachProPriceCents(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = (env.COACH_PRO_PRICE_USD_CENTS ?? '').trim();
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= PACKAGE_MIN_CENTS && n <= PACKAGE_MAX_CENTS ? n : null;
}

/** Active clients a Free coach keeps. A blank, non-integer or out-of-range value is the default. 0 is allowed. */
export function coachFreeClientLimit(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.COACH_FREE_CLIENT_LIMIT ?? '').trim();
  if (!/^\d+$/.test(raw)) return FREE_CLIENT_LIMIT_DEFAULT;
  const n = Number(raw);
  return n <= FREE_CLIENT_LIMIT_MAX ? n : FREE_CLIENT_LIMIT_DEFAULT;
}

/** The one sentence every closed money surface shows. Product copy, not policy. */
export const PAYMENTS_NOT_LIVE = "Payments aren't live yet.";
