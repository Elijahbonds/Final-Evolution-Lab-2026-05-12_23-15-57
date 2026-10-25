// lib/coach-business/pro.ts — COACH-BUSINESS: the Coach Pro upgrade, on the existing subscription rails.
//
// Coach Pro is the FEL_COACH subscription product (plan.ts): the checkout below writes metadata.product = FEL_COACH, so
// the EXISTING webhook and success-page verify (lib/stripe/checkout-fulfil.ts, LAUNCH-SALES B-W2) write the Subscription
// row, the existing refund path (lib/stripe/refund-revoke.ts) revokes it, and lib/pro-guard.ts isCoachUser agrees. Only
// the price differs from /api/stripe/checkout's FEL_COACH: it is the owner's COACH_PRO_PRICE_USD_CENTS, never a number in
// code. `plan: 'COACH_PRO'` in the metadata keeps the two apart in reporting.
//
// The fence: COACH_PRO_ENABLED off → 409 pro_off; no price → 409 price_not_set; no key → payments_not_set_up; a LIVE key
// while COACH_CONNECT_LIVE is off → live_mode_off (one live switch for the whole coach business); no NEXTAUTH_URL →
// site_url_not_set. All 409 store_closed, before any Stripe call.
import type Stripe from 'stripe';
import { isLiveKey, isTestKey } from '@/lib/coach-store/stripeMode';
import { siteOrigin } from '@/lib/stripe/site-origin';
import { coachProPriceCents, isCoachConnectLive, isCoachProEnabled } from './config';

export type ProClosedReason = 'pro_off' | 'price_not_set' | 'payments_not_set_up' | 'live_mode_off' | 'site_url_not_set';
export type ProGate = { ok: true; priceCents: number; origin: string; live: boolean } | { ok: false; reason: ProClosedReason };

export function proGate(env: NodeJS.ProcessEnv = process.env): ProGate {
  if (!isCoachProEnabled(env)) return { ok: false, reason: 'pro_off' };
  const priceCents = coachProPriceCents(env);
  if (priceCents === null) return { ok: false, reason: 'price_not_set' };
  const key = (env.STRIPE_SECRET_KEY ?? '').trim();
  let live: boolean;
  if (isTestKey(key)) live = false;
  else if (isLiveKey(key)) {
    if (!isCoachConnectLive(env)) return { ok: false, reason: 'live_mode_off' };
    live = true;
  } else return { ok: false, reason: 'payments_not_set_up' };
  const origin = siteOrigin(env);
  if (!origin) return { ok: false, reason: 'site_url_not_set' };
  return { ok: true, priceCents, origin, live };
}

export const COACH_PRO_NAME = 'Coach Pro';
export const COACH_PRO_DESCRIPTION = 'Unlimited clients, AI-drafted weekly updates you approve, live sessions, and payments for your packages.';

export function proCheckoutParams(input: { userId: string; customerId: string; priceCents: number; origin: string }): Stripe.Checkout.SessionCreateParams {
  const meta = { userId: input.userId, product: 'FEL_COACH', plan: 'COACH_PRO' };
  return {
    customer: input.customerId,
    mode: 'subscription',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: COACH_PRO_NAME, description: COACH_PRO_DESCRIPTION },
        unit_amount: input.priceCents,
        recurring: { interval: 'month' },
      },
      quantity: 1,
    }],
    metadata: meta,
    subscription_data: { metadata: meta },
    // The account page runs the server-verified success path (POST /api/stripe/verify-session), as every subscription does.
    success_url: `${input.origin}/account?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}/coach/business?pro=cancel`,
  };
}
