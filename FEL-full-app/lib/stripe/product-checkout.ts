/**
 * lib/stripe/product-checkout.ts — STORE-READY B10 (FE PM 4:36 PM PT Oct 7): the STUDIO_CREDITS
 * checkout lives here ONCE, called in-process by BOTH app/api/stripe/checkout (product
 * 'STUDIO_CREDITS') and app/api/studio/credits POST. Studio no longer server-fetches its own
 * HTTP route with a forwarded cookie (that was SSRF-shaped); it calls this code directly.
 *
 * Behaviour is IDENTICAL to the pre-B10 route branch: same server-owned pack amounts
 * (STUDIO_CREDIT_PACKS), same line item, same metadata { userId, product: 'STUDIO_CREDITS',
 * itemKey, credits }, same mode/payment_method_types (paymentMethodsFor('payment')), the same
 * customer reuse, and the same success/cancel paths built from siteOrigin() per B3.
 */

import type Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { STUDIO_CREDIT_PACKS } from '@/lib/studio-plan';
import { paymentMethodsFor } from '@/lib/stripe-payment-methods';

/**
 * Find-or-create the app's Stripe customer for a user (the same logic every checkout route ran
 * inline): reuse the tracked customer, else create one with the user's email and track it.
 */
export async function ensureStripeCustomer(stripe: Stripe, userId: string): Promise<string> {
  const existing = await prisma.stripeCustomer.findUnique({ where: { userId } });
  if (existing) return existing.stripeCustomerId;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const cust = await stripe.customers.create({ email: user?.email ?? undefined, metadata: { userId } });
  await prisma.stripeCustomer.create({ data: { userId, stripeCustomerId: cust.id } });
  return cust.id;
}

export type StudioCreditsCheckoutResult =
  | { ok: true; url: string | null }
  | { ok: false; status: 400; error: 'Invalid credit pack' };

/** The pre-B10 STUDIO_CREDITS session, unchanged: same line item, metadata, mode and URLs. */
export async function createStudioCreditsCheckout(input: {
  stripe: Stripe;
  userId: string;
  itemKey: string;
  origin: string;
}): Promise<StudioCreditsCheckoutResult> {
  const { stripe, userId, itemKey, origin } = input;
  const pack = STUDIO_CREDIT_PACKS[itemKey];
  if (!itemKey || !pack) return { ok: false, status: 400, error: 'Invalid credit pack' };
  const customerId = await ensureStripeCustomer(stripe, userId);
  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    payment_method_types: paymentMethodsFor('payment') as never,
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: pack.label, description: `${pack.credits} NEXUS Studio build credits` },
        unit_amount: pack.priceUsdCents,
      },
      quantity: 1,
    }],
    metadata: { userId, product: 'STUDIO_CREDITS', itemKey, credits: String(pack.credits) },
    success_url: `${origin}/studio?credits=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/studio?credits=cancel`,
  });
  return { ok: true, url: checkoutSession.url };
}
