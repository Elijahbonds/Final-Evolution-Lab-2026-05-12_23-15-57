// Stripe payment methods — what can actually be offered, and what cannot (2026-09-12).
//
// KLARNA-OFF (2026-10-13): Klarna and Afterpay/Clearpay are no longer in either pinned list. They must also be
// switched off in the Stripe Dashboard, because the default (no pin) shows whatever the Dashboard enables.
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
// makes the session fail, and a pinned list can never show a method added later — so the DEFAULT is
// to pin nothing: Checkout Sessions omit `payment_method_types` and Stripe's automatic payment
// methods show whatever the Dashboard has enabled (card, Link, Cash App, Afterpay/Clearpay, Klarna,
// Affirm, Apple Pay / Google Pay, PayPal). The fixed lists below now exist only as the explicit
// opt-out: set `STRIPE_PM_PIN=1` to pin them again (e.g. while a Dashboard is being cleaned up).

export type StripeMode = 'subscription' | 'payment';

/** Recurring: the weekly plan. Narrow on purpose — see the note on Afterpay and PayPal above. */
const RECURRING: readonly string[] = ['card', 'link', 'cashapp'];

/** One-time: the store. No buy-now-pay-later (KLARNA-OFF): no Klarna, no Afterpay/Clearpay. */
const ONE_TIME: readonly string[] = ['card', 'link', 'cashapp', 'paypal'];

/** Methods taken off every pinned list (KLARNA-OFF). */
export const REMOVED_METHODS: readonly string[] = ['klarna', 'afterpay_clearpay'];

/**
 * The payment_method_types for a Checkout Session, or undefined to defer to the Dashboard.
 *
 * undefined is the default, not a fallback: with no `payment_method_types` on the session, Stripe
 * offers every method the Dashboard has enabled, so methods can be switched on and off in Stripe
 * without a deploy. `STRIPE_PM_PIN=1` is the explicit opt-in to the fixed lists.
 */
export function paymentMethodsFor(mode: StripeMode): string[] | undefined {
  if (process.env.STRIPE_PM_PIN === '1') return [...(mode === 'subscription' ? RECURRING : ONE_TIME)];
  return undefined;
}

/** Methods that cannot be offered through Stripe at all, with the reason. For honest UI copy. */
export const UNAVAILABLE_METHODS: Readonly<Record<string, string>> = {
  shop_pay: 'Shop Pay is Shopify-only and cannot be enabled on Stripe Checkout.',
};

/** Methods deliberately excluded from the weekly plan, with the reason. */
export const NOT_ON_SUBSCRIPTION: Readonly<Record<string, string>> = {
  paypal: 'PayPal via Stripe is region-gated for subscriptions; offered on one-time purchases.',
};
