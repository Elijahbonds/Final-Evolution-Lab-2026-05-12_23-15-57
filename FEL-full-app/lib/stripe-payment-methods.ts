// Stripe payment methods — what can actually be offered, and what cannot (2026-09-12).
//
// Asked for: Stripe, PayPal, Cash App, Afterpay, Shop Pay. Two of those have hard limits that are
// better written down than rediscovered in a failing checkout:
//
//   SHOP PAY is Shopify's own wallet. It is not a Stripe payment method and cannot be enabled on a
//   Stripe Checkout Session at any price. Offering it would mean selling through Shopify instead of
//   (or beside) Stripe — a storefront decision, not a config flag.
//
//   AFTERPAY / CLEARPAY is buy-now-pay-later for ONE-TIME amounts. Stripe does not support it for
//   `mode: 'subscription'`, and splitting $6 a week into four instalments would not make sense even
//   if it did. It belongs on the store — cosmetics, credit packs — not on the weekly plan.
//
//   CASH APP PAY works for both, US accounts, USD only.
//
//   PAYPAL through Stripe is region-gated and, for subscriptions, not available everywhere. It is
//   listed for one-time purchases and left out of the recurring list rather than producing a
//   checkout that 400s for a US customer.
//
// Every method here must ALSO be enabled in the Stripe Dashboard. Listing one that is switched off
// makes the session fail, so the list stays conservative and the Dashboard is the wider net: pass
// `STRIPE_PM_AUTO=1` to omit the list entirely and let Dashboard settings decide.

export type StripeMode = 'subscription' | 'payment';

/** Recurring: the weekly plan. Narrow on purpose — see the note on Afterpay and PayPal above. */
const RECURRING: readonly string[] = ['card', 'link', 'cashapp'];

/** One-time: the store. BNPL and wallets are all fair game at these amounts. */
const ONE_TIME: readonly string[] = ['card', 'link', 'cashapp', 'afterpay_clearpay', 'klarna', 'paypal'];

/**
 * The payment_method_types for a Checkout Session, or undefined to defer to the Dashboard.
 *
 * Returning undefined is a real option, not a fallback: with STRIPE_PM_AUTO set, methods can be
 * switched on and off in Stripe without a deploy, which is usually what a shop wants.
 */
export function paymentMethodsFor(mode: StripeMode): string[] | undefined {
  if (process.env.STRIPE_PM_AUTO === '1') return undefined;
  return [...(mode === 'subscription' ? RECURRING : ONE_TIME)];
}

/** Methods that cannot be offered through Stripe at all, with the reason. For honest UI copy. */
export const UNAVAILABLE_METHODS: Readonly<Record<string, string>> = {
  shop_pay: 'Shop Pay is Shopify-only and cannot be enabled on Stripe Checkout.',
};

/** Methods deliberately excluded from the weekly plan, with the reason. */
export const NOT_ON_SUBSCRIPTION: Readonly<Record<string, string>> = {
  afterpay_clearpay: 'Afterpay is buy-now-pay-later for one-time amounts; Stripe does not support it for subscriptions.',
  klarna: 'Klarna is one-time only in this configuration.',
  paypal: 'PayPal via Stripe is region-gated for subscriptions; offered on one-time purchases.',
};
